from __future__ import annotations

from fastapi import APIRouter

from app.api.dependencies import CurrentUserDep, DatabaseDep
from app.schemas.course_enrollment import CourseEnrollmentRead
from app.schemas.course_payment import (
    CoursePaymentVerificationRequest,
    CoursePurchaseRequest,
    CoursePurchaseResponse,
)
from app.schemas.responses import SuccessResponse
from app.services.course_payment_service import course_payment_service

router = APIRouter(tags=["course-payments"])


@router.post(
    "/courses/{slug}/purchase", response_model=SuccessResponse[CoursePurchaseResponse]
)
async def initiate_course_purchase(
    slug: str,
    session: DatabaseDep,
    current_user: CurrentUserDep,
    payload: CoursePurchaseRequest = CoursePurchaseRequest(),
):
    result = await course_payment_service.initiate_purchase(
        session=session, user_id=current_user.id, slug=slug, payload=payload
    )
    return SuccessResponse(message="Purchase initiated successfully", data=result)


@router.post(
    "/courses/{slug}/verify-payment",
    response_model=SuccessResponse[CourseEnrollmentRead],
)
async def verify_course_payment(
    slug: str,
    payload: CoursePaymentVerificationRequest,
    session: DatabaseDep,
    current_user: CurrentUserDep,
):
    enrollment = await course_payment_service.verify_payment(
        session=session, user_id=current_user.id, slug=slug, payload=payload
    )
    return SuccessResponse(message="Payment verified successfully", data=enrollment)
