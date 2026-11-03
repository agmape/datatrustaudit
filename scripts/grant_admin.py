"""
Grant (or revoke) the administrator role on the SERVER, idempotently.

    python scripts/grant_admin.py --email datatrustaudit@gmail.com
    python scripts/grant_admin.py --user-id <supabase-auth-uuid>

The account must have signed in at least once (that is what creates its profile from a verified
Supabase JWT). The role is stored in our database — never derived from token metadata or from a
string comparison in the browser. No password is read, stored or printed. Every change is logged in
``admin_audit_log`` with actor ``cli:<os-user>``.
"""
import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
from sqlalchemy import select  # noqa: E402

from datatrust import accounts  # noqa: E402
from datatrust.db import run_migrations, session_scope  # noqa: E402
from datatrust.models import Profile  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--email")
    g.add_argument("--user-id")
    ap.add_argument("--revoke", action="store_true", help="set role back to 'user'")
    a = ap.parse_args()
    run_migrations()
    role = "user" if a.revoke else "admin"
    with session_scope() as db:
        if a.user_id:
            p = db.get(Profile, a.user_id)
        else:
            rows = db.execute(select(Profile).where(Profile.email == a.email.lower())).scalars().all()
            if len(rows) > 1:
                print("ERROR: more than one profile has this e-mail; use --user-id.")
                return 2
            p = rows[0] if rows else None
        if p is None:
            print("PENDING: no profile found. Sign in once with this account (Supabase) so a profile is created from the "
                  "verified token, then run this command again.")
            return 3
        res = accounts.set_role(db, p.id, role, f"cli:{getpass.getuser()}")
        print(f"user_id={p.id} role: {res['previous']} -> {res['current']} ({'changed' if res['changed'] else 'already set; nothing to do'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
