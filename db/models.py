from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)  # Internal admin flag — bypasses all limits
    subscription_status = Column(String, default="inactive")  # inactive|active|pending|canceled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    subscription = relationship("Subscription", back_populates="user", uselist=False)
    scans = relationship("Scan", back_populates="user")
    payments = relationship("Payment", back_populates="user")

    @property
    def plan(self):
        if self.subscription and self.subscription.plan_name:
            return self.subscription.plan_name
        return "free"

    @plan.setter
    def plan(self, value):
        plan_name = value if value in {"free", "pro", "premium"} else "free"
        if self.subscription:
            self.subscription.plan_name = plan_name
        else:
            self.subscription = Subscription(plan_name=plan_name)

    @property
    def effective_plan(self):
        """Returns 'admin' if is_admin, else the normal plan name."""
        if self.is_admin:
            return "admin"
        return self.plan

    @property
    def has_active_subscription(self):
        """Pro/Premium features require active subscription OR admin override.
        Free users can always scan regardless of subscription_status."""
        if self.is_admin:
            return True
        if self.plan == "free":
            return True
        return self.subscription_status == "active"

    @property
    def scans_used(self):
        """Weekly scan count from subscription record."""
        if self.subscription:
            return self.subscription.weekly_scan_count or 0
        return 0

class Subscription(Base):
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    plan_name = Column(String, default="free") # free, pro, premium
    scans_used_this_month = Column(Integer, default=0)  # Kept for backward compat
    weekly_scan_count = Column(Integer, default=0)  # Current weekly scan usage
    weekly_scan_reset_at = Column(DateTime, nullable=True)  # When weekly counter resets
    status = Column(String, default="active") # active, past_due, canceled
    current_period_end = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="subscription")

class Scan(Base):
    __tablename__ = "scans"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    url = Column(String, nullable=False)
    status = Column(String, default="pending") # pending, processing, completed, failed, protocol_error, blocked, timeout
    scan_credit_consumed = Column(Boolean, default=False)  # Whether this scan consumed a credit
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    scan_method = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    
    raw_data = Column(JSON, nullable=True)
    
    user = relationship("User", back_populates="scans")
    findings = relationship("Finding", back_populates="scan", cascade="all, delete-orphan")

class Finding(Base):
    __tablename__ = "findings"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"))
    category = Column(String, nullable=False) # duplicate, consent, parameter, etc.
    severity = Column(String, nullable=False) # low, medium, high, critical
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    evidence = Column(JSON, nullable=True)
    recommendation = Column(Text, nullable=True)
    is_premium = Column(Boolean, default=False)
    
    scan = relationship("Scan", back_populates="findings")

class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    mp_payment_id = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    status = Column(String, default="pending") # pending, approved, failed
    plan_purchased = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="payments")
