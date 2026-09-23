from api.audit import _resolve_plan


class User:
    def __init__(self, plan="free", is_admin=False):
        self.plan = plan
        self.is_admin = is_admin


def test_anonymous_cannot_self_assign_premium():
    assert _resolve_plan("premium", None, is_admin_payload=True) == "free"


def test_authenticated_plan_comes_from_backend_user():
    assert _resolve_plan("premium", User(plan="pro"), is_admin_payload=False) == "pro"


def test_payload_cannot_downgrade_or_upgrade_backend_plan():
    assert _resolve_plan("free", User(plan="premium"), is_admin_payload=False) == "premium"


def test_admin_is_backend_only():
    assert _resolve_plan("free", User(plan="free", is_admin=True), is_admin_payload=False) == "premium"
    assert _resolve_plan("premium", User(plan="free", is_admin=False), is_admin_payload=True) == "free"
