"""Tests for coupon_service.consume_coupon() atomic limit enforcement.

These tests mock the AsyncSession to verify:
- global usage limit is re-checked under row lock
- per-user limit is counted (not just boolean) under row lock
- duplicate consumption for the same order/course_payment is rejected
- usage record is created and usage_count incremented exactly once
- unlimited coupons (usage_limit=None) pass through
"""

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.crud.coupon import crud_coupon, crud_coupon_usage
from app.models.coupon import Coupon, CouponUsage, DiscountType
from app.services.coupon_service import CouponService, CouponValidationError


def make_coupon(**overrides):
    c = Coupon(
        id=uuid.uuid4(),
        code="TESTCOUPON",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("10"),
        applies_to="all",
        restriction_type="all_eligible",
        min_order_amount=Decimal("0"),
        usage_limit=None,
        usage_count=0,
        per_user_limit=1,
        is_active=True,
    )
    for k, v in overrides.items():
        setattr(c, k, v)
    return c


def make_locked_result(coupon):
    result = MagicMock()
    result.scalar_one.return_value = coupon
    result.scalar_one_or_none.return_value = coupon
    return result


def make_exists_result(row):
    result = MagicMock()
    result.first.return_value = row
    return result


def make_session(*execute_results, scalar=None):
    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(side_effect=list(execute_results))
    session.scalar = AsyncMock(return_value=scalar)
    return session


@pytest.fixture(autouse=True)
def mock_coupon_crud_writes(monkeypatch):
    locked_coupon = None
    created = []

    async def lock_coupon(db, coupon_id):
        nonlocal locked_coupon
        result = await db.execute()
        locked_coupon = result.scalar_one_or_none()
        return locked_coupon

    async def update_coupon(db, id, object, commit):
        for key, value in object.items():
            setattr(locked_coupon, key, value)

    async def create_usage(db, object, commit, return_as_model):
        usage = CouponUsage(**object)
        created.append(usage)
        return usage

    monkeypatch.setattr(crud_coupon, "lock_for_redemption", lock_coupon)
    monkeypatch.setattr(crud_coupon, "update", update_coupon)
    monkeypatch.setattr(crud_coupon_usage, "create", create_usage)
    return created


@pytest.mark.asyncio
async def test_consume_coupon_unlimited_succeeds():
    svc = CouponService()
    coupon = make_coupon(usage_limit=None, per_user_limit=0)

    # execute: lock query, then FastCRUD exists() for order idempotency
    session = make_session(
        make_locked_result(coupon),
        make_exists_result(None),
    )

    usage = await svc.consume_coupon(
        session=session,
        coupon=coupon,
        user_id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        course_payment_id=None,
        discount_amount=Decimal("10"),
    )
    assert usage is not None
    assert coupon.usage_count == 1
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_coupon_global_limit_reached():
    svc = CouponService()
    coupon = make_coupon(usage_limit=5, usage_count=5, per_user_limit=0)

    session = make_session(make_locked_result(coupon))

    with pytest.raises(CouponValidationError) as exc:
        await svc.consume_coupon(
            session=session,
            coupon=coupon,
            user_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            course_payment_id=None,
            discount_amount=Decimal("10"),
        )
    assert exc.value.code == "COUPON_USAGE_LIMIT_REACHED"
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_coupon_global_limit_not_reached():
    svc = CouponService()
    coupon = make_coupon(usage_limit=5, usage_count=4, per_user_limit=0)

    session = make_session(
        make_locked_result(coupon),
        make_exists_result(None),
    )

    usage = await svc.consume_coupon(
        session=session,
        coupon=coupon,
        user_id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        course_payment_id=None,
        discount_amount=Decimal("10"),
    )
    assert usage is not None
    assert coupon.usage_count == 5


@pytest.mark.asyncio
async def test_consume_coupon_per_user_limit_reached():
    svc = CouponService()
    coupon = make_coupon(usage_limit=None, per_user_limit=1)

    # FastCRUD count() goes through db.scalar(); 1 usage already exists
    session = make_session(
        make_locked_result(coupon),
        scalar=1,
    )

    with pytest.raises(CouponValidationError) as exc:
        await svc.consume_coupon(
            session=session,
            coupon=coupon,
            user_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            course_payment_id=None,
            discount_amount=Decimal("10"),
        )
    assert exc.value.code == "COUPON_ALREADY_USED"
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_coupon_per_user_limit_under_count():
    """With per_user_limit=3 and 2 existing usages, should succeed."""
    svc = CouponService()
    coupon = make_coupon(usage_limit=None, per_user_limit=3)

    # execute: lock, FastCRUD exists() for order; scalar: FastCRUD count() = 2
    session = make_session(
        make_locked_result(coupon),
        make_exists_result(None),
        scalar=2,
    )

    usage = await svc.consume_coupon(
        session=session,
        coupon=coupon,
        user_id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        course_payment_id=None,
        discount_amount=Decimal("10"),
    )
    assert usage is not None
    assert coupon.usage_count == 1


@pytest.mark.asyncio
async def test_consume_coupon_idempotent_order():
    """Duplicate consumption for same order should be rejected."""
    svc = CouponService()
    coupon = make_coupon(usage_limit=None, per_user_limit=0)

    # FastCRUD exists() finds an existing usage for this order
    session = make_session(
        make_locked_result(coupon),
        make_exists_result(("existing",)),
    )

    with pytest.raises(CouponValidationError) as exc:
        await svc.consume_coupon(
            session=session,
            coupon=coupon,
            user_id=uuid.uuid4(),
            order_id=uuid.uuid4(),
            course_payment_id=None,
            discount_amount=Decimal("10"),
        )
    assert exc.value.code == "COUPON_ALREADY_CONSUMED"
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_coupon_idempotent_course_payment():
    svc = CouponService()
    coupon = make_coupon(usage_limit=None, per_user_limit=0)

    # order_id=None => only the course_payment exists() check runs
    session = make_session(
        make_locked_result(coupon),
        make_exists_result(("existing",)),
    )

    with pytest.raises(CouponValidationError) as exc:
        await svc.consume_coupon(
            session=session,
            coupon=coupon,
            user_id=uuid.uuid4(),
            order_id=None,
            course_payment_id=uuid.uuid4(),
            discount_amount=Decimal("10"),
        )
    assert exc.value.code == "COUPON_ALREADY_CONSUMED"
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_coupon_both_refs_no_existing_usage():
    """With both order_id and course_payment_id, both exists() checks run."""
    svc = CouponService()
    coupon = make_coupon(usage_limit=None, per_user_limit=0)

    session = make_session(
        make_locked_result(coupon),
        make_exists_result(None),
        make_exists_result(None),
    )

    usage = await svc.consume_coupon(
        session=session,
        coupon=coupon,
        user_id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        course_payment_id=uuid.uuid4(),
        discount_amount=Decimal("10"),
    )
    assert usage is not None
    assert usage.order_id is not None
    assert usage.course_payment_id is not None
