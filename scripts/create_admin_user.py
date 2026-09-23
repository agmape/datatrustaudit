"""
scripts/create_admin_user.py — Create or update the admin test user.

Usage:
    python scripts/create_admin_user.py

Reads from .env:
    ADMIN_TEST_EMAIL    — Admin email address
    ADMIN_TEST_PASSWORD — Admin password (will be bcrypt-hashed)
    ADMIN_TEST_NAME     — Admin display name

The script will:
1. Create the user if it doesn't exist
2. Update the user if it already exists
3. Set is_admin=True, subscription_status='active', plan='premium'
4. Hash the password using bcrypt
5. Print only a safe success message (never prints the password)
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from db.database import engine, SessionLocal, Base
from db.models import User, Subscription
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main():
    email = os.getenv("ADMIN_TEST_EMAIL")
    password = os.getenv("ADMIN_TEST_PASSWORD")
    name = os.getenv("ADMIN_TEST_NAME", "DataTrust Admin")

    if not email or not password:
        print("ERROR: ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD must be set in .env")
        print("Copy .env.example to .env and fill in the values.")
        sys.exit(1)

    if len(password) < 6:
        print("ERROR: ADMIN_TEST_PASSWORD must be at least 6 characters.")
        sys.exit(1)

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()

        if user:
            # Update existing user
            user.hashed_password = pwd_context.hash(password)
            user.name = name
            user.is_admin = True
            user.subscription_status = "active"

            # Update or create subscription
            if user.subscription:
                user.subscription.plan_name = "premium"
                user.subscription.status = "active"
                user.subscription.weekly_scan_count = 0
            else:
                sub = Subscription(
                    user_id=user.id,
                    plan_name="premium",
                    status="active",
                    weekly_scan_count=0,
                )
                db.add(sub)

            db.commit()
            print(f"✅ Admin user UPDATED successfully.")
        else:
            # Create new user
            hashed = pwd_context.hash(password)
            new_user = User(
                email=email,
                hashed_password=hashed,
                name=name,
                is_admin=True,
                subscription_status="active",
            )
            db.add(new_user)
            db.flush()  # Get the user ID

            sub = Subscription(
                user_id=new_user.id,
                plan_name="premium",
                status="active",
                weekly_scan_count=0,
            )
            db.add(sub)
            db.commit()
            print(f"✅ Admin user CREATED successfully.")

        # Print safe summary
        user = db.query(User).filter(User.email == email).first()
        print(f"   Email:              {user.email}")
        print(f"   Name:               {user.name}")
        print(f"   is_admin:           {user.is_admin}")
        print(f"   subscription_status:{user.subscription_status}")
        print(f"   effective_plan:     {user.effective_plan}")
        print(f"   plan (subscription):{user.plan}")
        print(f"   Password:           [HIDDEN — set via ADMIN_TEST_PASSWORD in .env]")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
