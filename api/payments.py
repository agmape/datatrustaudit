import hashlib
import hmac
import os
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Payment, User
from api.auth import get_current_user

try:
    import mercadopago as _mercadopago
    _mp_available = True
except ImportError:
    _mercadopago = None
    _mp_available = False

router = APIRouter(prefix="/api/payments", tags=["Payments"])

MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "").strip()
MP_WEBHOOK_SECRET = os.getenv("MP_WEBHOOK_SECRET", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")

sdk = _mercadopago.SDK(MP_ACCESS_TOKEN) if MP_ACCESS_TOKEN and _mp_available else None

PRICES = {
    "free": float(os.getenv("PRICE_FREE", "0")),
    "pro": float(os.getenv("PRICE_PRO_BRL", "49.90")),
    "premium": float(os.getenv("PRICE_PREMIUM_BRL", "149.90")),
}


def _require_payment_config() -> None:
    if not sdk:
        raise HTTPException(
            status_code=503,
            detail="Mercado Pago is not configured. Set MP_ACCESS_TOKEN in the server environment.",
        )
    if not FRONTEND_URL:
        raise HTTPException(
            status_code=503,
            detail="FRONTEND_URL is not configured.",
        )


def _verify_webhook_signature(request: Request) -> bool:
    """Validate Mercado Pago x-signature using the documented HMAC manifest."""
    if not MP_WEBHOOK_SECRET:
        return False

    x_signature = request.headers.get("x-signature", "")
    x_request_id = request.headers.get("x-request-id", "")
    data_id = request.query_params.get("data.id", "")

    if not x_signature or not x_request_id or not data_id:
        return False

    parts = {}
    for item in x_signature.split(","):
        key, sep, value = item.strip().partition("=")
        if sep and key and value:
            parts[key] = value

    ts = parts.get("ts")
    received_hash = parts.get("v1")
    if not ts or not received_hash:
        return False

    # Mercado Pago documents lower-casing alphanumeric data.id for validation.
    normalized_data_id = data_id.lower()
    manifest = f"id:{normalized_data_id};request-id:{x_request_id};ts:{ts};"
    expected = hmac.new(
        MP_WEBHOOK_SECRET.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, received_hash)


@router.post("/create-preference")
def create_preference(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    _require_payment_config()

    plan = payload.get("plan") or payload.get("plan_id")
    if plan not in PRICES or plan == "free":
        raise HTTPException(status_code=400, detail="Plano inválido")

    amount = PRICES[plan]
    preference_data = {
        "items": [
            {
                "title": f"Assinatura DataTrust Audit - {plan.capitalize()}",
                "quantity": 1,
                "currency_id": "BRL",
                "unit_price": amount,
            }
        ],
        "payer": {"email": current_user.email},
        "back_urls": {
            "success": FRONTEND_URL + "/payment/success",
            "failure": FRONTEND_URL + "/payment/failure",
            "pending": FRONTEND_URL + "/payment/pending",
        },
        "auto_return": "approved",
        "external_reference": f"{current_user.id}_{plan}",
    }

    try:
        preference_response = sdk.preference().create(preference_data)
        if preference_response.get("status") not in (200, 201):
            raise RuntimeError("Mercado Pago did not create the preference")
        preference = preference_response["response"]
        return {"id": preference["id"], "init_point": preference["init_point"]}
    except HTTPException:
        raise
    except Exception as exc:
        # Do not leak provider internals/tokens in the HTTP response.
        print(f"[payments] create-preference failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Não foi possível iniciar o checkout.")


@router.post("/webhook")
async def mp_webhook(request: Request, db: Session = Depends(get_db)):
    if not MP_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Mercado Pago webhook secret is not configured.",
        )

    if not _verify_webhook_signature(request):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    data = await request.json()
    if data.get("type") != "payment":
        return {"status": "ignored"}

    payment_id = data.get("data", {}).get("id")
    if not payment_id:
        return {"status": "ignored"}

    if not sdk:
        raise HTTPException(status_code=503, detail="Mercado Pago is not configured.")

    try:
        payment_info = sdk.payment().get(payment_id)
    except Exception as exc:
        print(f"[payments] payment lookup failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Could not verify payment with provider.")

    if payment_info.get("status") != 200:
        raise HTTPException(status_code=502, detail="Payment provider lookup failed.")

    payment_details = payment_info.get("response") or {}
    if payment_details.get("status") != "approved":
        return {"status": "received"}

    external_ref = payment_details.get("external_reference") or ""
    try:
        user_id_text, plan_name = external_ref.split("_", 1)
        user_id = int(user_id_text)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid payment external reference")

    if plan_name not in {"pro", "premium"}:
        raise HTTPException(status_code=400, detail="Invalid plan in payment reference")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Payment user not found")

    user.plan = plan_name
    user.subscription_status = "active"

    existing_payment = (
        db.query(Payment)
        .filter(Payment.mp_payment_id == str(payment_id))
        .first()
    )
    if not existing_payment:
        db.add(
            Payment(
                user_id=user_id,
                mp_payment_id=str(payment_id),
                amount=float(payment_details.get("transaction_amount", 0)),
                status="approved",
                plan_purchased=plan_name,
            )
        )
    else:
        existing_payment.status = "approved"

    db.commit()
    return {"status": "success"}
