from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.schema import TimestampSchemaRead


class CoursePaymentCreate(BaseModel):
    user_id: uuid.UUID
    course_id: uuid.UUID
    amount: Decimal
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    gateway_fee: Decimal = Decimal("0")
    coupon_id: uuid.UUID | None = None
    coupon_code: str | None = None
    razorpay_order_id: str | None = None
    status: str


class CoursePurchaseRequest(BaseModel):
    coupon_code: str | None = None


class CoursePurchaseResponse(BaseModel):
    razorpay_order_id: str
    amount: Decimal
    course_id: uuid.UUID
    course_title: str


class CoursePaymentVerificationRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

    model_config = {"extra": "forbid"}


class CoursePaymentRead(TimestampSchemaRead):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    course_id: uuid.UUID
    payment_method: str = "razorpay"
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None
    amount: Decimal
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    gateway_fee: Decimal = Decimal("0")
    coupon_id: uuid.UUID | None = None
    coupon_code: str | None = None
    status: str
    paid_at: datetime | None = None
    admin_note: str | None = None


class AdminCoursePaymentRead(CoursePaymentRead):
    user_full_name: str | None = None
    user_email: str | None = None
    course_title: str | None = None
    course_slug: str | None = None


class AdminDirectEnrollRequest(BaseModel):
    """Admin records an offline payment and enrolls a student directly."""

    user_id: uuid.UUID
    amount_paid: Decimal = Field(..., gt=0, decimal_places=2, max_digits=10)
    note: str | None = Field(None, max_length=1000)


class AdminEnrolledStudentRead(TimestampSchemaRead):
    """Enrollment entry shown in the admin course's Enrolled Students list."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    course_id: uuid.UUID
    enrolled_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool = True

    user_full_name: str | None = None
    user_email: str | None = None

    amount_paid: Decimal | None = None
    payment_method: str | None = None
    payment_status: str | None = None
    paid_at: datetime | None = None
    admin_note: str | None = None

    progress_percentage: float | None = None
