import os
from datetime import datetime, timedelta
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User, Scan
from api.auth import get_current_user
from worker.tasks import run_website_audit
from audit_engine.credit_rules import WEEKLY_SCAN_LIMITS, get_weekly_limit, can_perform_scan
from audit_engine.url_security import UnsafeURLError, validate_public_url

router = APIRouter(prefix="/api/scans", tags=["Scans"])

# Weekly scan limits (configurable via env)
FREE_MAX_SCANS = int(os.getenv("FREE_MAX_SCANS", str(WEEKLY_SCAN_LIMITS["free"])))
PRO_MAX_SCANS = int(os.getenv("PRO_MAX_SCANS", str(WEEKLY_SCAN_LIMITS["pro"])))
PREMIUM_MAX_SCANS = int(os.getenv("PREMIUM_MAX_SCANS", str(WEEKLY_SCAN_LIMITS["premium"])))

def normalize_url(url: str):
    """Validate scan URL against SSRF/private-network targets."""
    try:
        return validate_public_url(url)
    except UnsafeURLError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/")
def create_scan(url: str, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Queues a new website audit task asynchronously."""
    plan = "free"
    user_id = None
    is_admin = False
    
    if current_user:
        user_id = current_user.id
        plan = current_user.plan
        is_admin = getattr(current_user, 'is_admin', False)
    
    # Check weekly scan limits (admin bypasses all limits)
    start_of_week = datetime.utcnow() - timedelta(days=datetime.utcnow().weekday())
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    
    scans_this_week = 0
    if user_id:
        scans_this_week = db.query(Scan).filter(
            Scan.user_id == user_id,
            Scan.created_at >= start_of_week
        ).count()
    
    if not is_admin:
        limit = get_weekly_limit(plan)
        if limit != -1 and scans_this_week >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Weekly scan limit reached ({limit} scans/week for {plan} plan). Please upgrade your plan."
            )
        
    safe_url = normalize_url(url)
    
    new_scan = Scan(user_id=user_id, url=safe_url, status="pending")
    db.add(new_scan)
    db.commit()
    db.refresh(new_scan)
    
    # Queue task natively via FastAPI
    background_tasks.add_task(run_website_audit, new_scan.id)
    
    return {
        "scan_id": new_scan.id,
        "status": new_scan.status,
        "scans_this_week": scans_this_week + 1,
        "weekly_limit": get_weekly_limit(plan, is_admin),
    }

@router.get("/{scan_id}")
def get_scan(scan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Polls the status of a specific scan. If complete, returns the data with appropriate plan stripping."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
        
    if scan.user_id is not None and (not current_user or scan.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    plan = "free"
    if current_user:
        plan = current_user.plan
    
    response_data = {
        "id": scan.id,
        "url": scan.url,
        "status": scan.status,
        "created_at": scan.created_at.isoformat() if scan.created_at else None,
        "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
        "score": scan.score,
        "result": scan.raw_data,
        "plan_applied": plan
    }
    
    # Gate Premium / Pro features
    if scan.status == "completed" and scan.raw_data and plan in ["free", "pro"]:
        res = response_data["result"]
        if not isinstance(res, dict): return response_data
        
        # 1. Truncate tags based on plan visibility
        if "tags" in res:
            total_tags = len(res["tags"])
            if plan == "free":
                res["tags"] = res["tags"][:max(1, int(total_tags * 0.30))]
                res["locked_tags"] = True
            elif plan == "pro":
                res["tags"] = res["tags"][:max(1, int(total_tags * 0.70))]
                res["locked_tags"] = True
            
        # 2. Hide exact code lines for free and pro
        if "tags" in res:
            for tag in res["tags"]:
                if isinstance(tag, dict):
                    tag.pop("lineNumber", None)
                    tag.pop("context", None)
                    if plan == "free":
                        tag.pop("matchedPattern", None)
                        tag.pop("dataCollected", None)
                    
        # 3. Strip privacy violation details for free
        if plan == "free" and "privacy" in res and res["privacy"] and isinstance(res["privacy"], dict):
            res["privacy"]["violations"] = []
            res["privacy"]["estimatedRiskExposure"] = "Desbloqueie no plano Pro"
            res["privacy"]["_lockedForPlan"] = "pro"
            
        # 4. Strip duplicate implementations for free
        if plan == "free" and "duplicates" in res and isinstance(res["duplicates"], list) and len(res["duplicates"]) > 1:
            res["duplicates"] = res["duplicates"][:1]
            res["locked_duplicates"] = True
            
        # 5. Hide viewSourceInfo
        res.pop("viewSourceInfo", None)
            
    return response_data
