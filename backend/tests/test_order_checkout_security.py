from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.exceptions import NotFoundException, ValidationException
from app.models.order import PaymentStatus
from app.schemas.order import OrderCreate, OrderItemBase, PaymentVerificationRequest
from app.services.order_service import OrderService


@pytest.mark.asyncio
async def test_order_creation_requires_shipping_address():
    service = OrderService()
    payload = OrderCreate(
        items=[OrderItemBase(product_id=uuid4(), quantity=1, price=Decimal("10"))]
    )
    user_id = uuid4()

    with pytest.raises(ValidationException, match="shipping address is required"):
        await service.create_order(
            db=AsyncMock(), user_id=user_id, payload=payload
        )


@pytest.mark.asyncio
async def test_order_creation_rejects_another_users_shipping_address(monkeypatch):
    service = OrderService()
    payload = OrderCreate(
        shipping_address_id=41,
        items=[OrderItemBase(product_id=uuid4(), quantity=1, price=Decimal("10"))],
    )
    user_id = uuid4()
    address_lookup = AsyncMock(return_value=None)
    monkeypatch.setattr("app.services.order_service.crud_address.get", address_lookup)

    with pytest.raises(NotFoundException, match="Address not found"):
        await service.create_order(db=AsyncMock(), user_id=user_id, payload=payload)

    address_lookup.assert_awaited_once()
    assert address_lookup.await_args.kwargs["user_id"] == user_id


@pytest.mark.asyncio
async def test_order_verification_rejects_mismatched_razorpay_order_id():
    service = OrderService()
    user_id = uuid4()
    order = SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        payment_status=PaymentStatus.PENDING,
        razorpay_order_id="order_expected",
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = order
    session = AsyncMock()
    session.execute.return_value = result
    verify_signature = MagicMock()
    service.razorpay_client.utility.verify_payment_signature = verify_signature

    with pytest.raises(ValidationException, match="does not match"):
        await service.verify_payment(
            db=session,
            user_id=user_id,
            order_id=order.id,
            payload=PaymentVerificationRequest(
                razorpay_order_id="another_order",
                razorpay_payment_id="payment_id",
                razorpay_signature="signature",
            ),
        )

    verify_signature.assert_not_called()
