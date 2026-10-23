from __future__ import annotations

from fastapi import APIRouter

from app.api.dependencies import CurrentUserDep, DatabaseDep
from app.schemas.coupon import (
    CouponValidateRequest,
    CouponValidateResponse,
)
from app.schemas.responses import SuccessResponse
from app.services.coupon_service import coupon_service

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.post("/validate", response_model=SuccessResponse[CouponValidateResponse])
async def validate_coupon(
    payload: CouponValidateRequest,
    user: CurrentUserDep,
    session: DatabaseDep,
) -> SuccessResponse[CouponValidateResponse]:
    """
    Validate a coupon code against the current cart items.
    Returns the discount calculation and eligible items.
    """
    result = await coupon_service.validate_coupon_for_items(
        session=session,
        coupon_code=payload.code,
        user_id=user.id,
        cart_items=[item.model_dump() for item in payload.items],
    )

    response_data = CouponValidateResponse(
        valid=result["valid"],
        code=result["coupon"].code,
        discount_type=result["coupon"].discount_type,
        discount_value=result["coupon"].discount_value,
        max_discount=result["coupon"].max_discount,
        applies_to=result["coupon"].applies_to,
        restriction_type=result["coupon"].restriction_type,
        min_order_amount=result["coupon"].min_order_amount,
        cart_subtotal=result["cart_subtotal"],
        eligible_subtotal=result["eligible_subtotal"],
        discount_amount=result["discount_amount"],
        gateway_fee=result["gateway_fee"],
        final_total=result["final_total"],
        eligible_items=[],
    )

    return SuccessResponse(message="Coupon validated successfully", data=response_data)
