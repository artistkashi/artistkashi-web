from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.coupon import crud_coupon, crud_coupon_usage
from app.models.coupon import Coupon, CouponUsage, DiscountType, RestrictionType
from app.models.product import ProductVariant

if TYPE_CHECKING:
    from app.models.course import Course
    from app.schemas.course import CourseRead


class CouponValidationError(Exception):
    def __init__(self, message: str, code: str):
        self.message = message
        self.code = code
        super().__init__(message)


class EligibleItem:
    def __init__(
        self,
        item_type: str,
        item_id: uuid.UUID,
        variant_id: uuid.UUID | None,
        title: str,
        variant_name: str | None,
        quantity: int,
        unit_price: Decimal,
    ):
        self.item_type = item_type
        self.item_id = item_id
        self.variant_id = variant_id
        self.title = title
        self.variant_name = variant_name
        self.quantity = quantity
        self.unit_price = unit_price

    @property
    def line_total(self) -> Decimal:
        return self.unit_price * self.quantity


class CouponValidationResult:
    def __init__(
        self,
        coupon: Coupon,
        eligible_items: list[EligibleItem],
        eligible_subtotal: Decimal,
        discount_amount: Decimal,
        gateway_fee: Decimal,
        cart_subtotal: Decimal,
        final_total: Decimal,
    ):
        self.coupon = coupon
        self.eligible_items = eligible_items
        self.eligible_subtotal = eligible_subtotal
        self.discount_amount = discount_amount
        self.gateway_fee = gateway_fee
        self.cart_subtotal = cart_subtotal
        self.final_total = final_total


class CouponService:
    GATEWAY_FEE_RATE = Decimal("3.54") / Decimal("100")
    PACKAGING_FEE = Decimal("99")

    @staticmethod
    def normalize_code(code: str) -> str:
        return code.strip().upper()

    async def get_coupon_by_code(
        self,
        session: AsyncSession,
        code: str,
    ) -> Coupon | None:
        return await crud_coupon.get(
            session, code=self.normalize_code(code), is_active=True
        )

    async def get_eligible_items(
        self,
        session: AsyncSession,
        coupon: Coupon,
        cart_items: list[dict],
    ) -> list[EligibleItem]:
        eligible_items: list[EligibleItem] = []

        # Collect course IDs and painting IDs for batch fetching
        course_ids_to_fetch: set[uuid.UUID] = set()
        painting_items_to_fetch: list[dict] = []

        # Pre-fetch course IDs for selected_courses restriction
        selected_course_ids: set[uuid.UUID] = set()
        if coupon.applies_to == "selected_courses":
            course_ids = await crud_coupon.get_courses_for_coupon(session, coupon.id)
            selected_course_ids = set(course_ids)

        # Pre-fetch painting IDs for selected_paintings restriction
        selected_painting_ids: set[uuid.UUID] = set()
        if coupon.applies_to == "selected_paintings":
            painting_ids = await crud_coupon.get_paintings_for_coupon(
                session, coupon.id
            )
            selected_painting_ids = set(painting_ids)

        # Pre-fetch selected course IDs for restriction_type: selected_products
        selected_course_ids_for_restriction: set[uuid.UUID] = set()
        if coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS:
            course_ids = await crud_coupon.get_courses_for_coupon(session, coupon.id)
            selected_course_ids_for_restriction = set(course_ids)

        # Pre-fetch selected painting IDs for restriction_type: selected_products
        selected_painting_ids_for_restriction: set[uuid.UUID] = set()
        if coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS:
            painting_ids = await crud_coupon.get_paintings_for_coupon(
                session, coupon.id
            )
            selected_painting_ids_for_restriction = set(painting_ids)

        # First pass: collect IDs to fetch
        for item in cart_items:
            item_type = item.get("type")

            if item_type == "course":
                if coupon.applies_to not in ("all", "courses", "selected_courses"):
                    continue
                if coupon.applies_to == "selected_courses":
                    if item.get("id") not in selected_course_ids:
                        continue
                if (
                    coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS
                    and item.get("id") not in selected_course_ids_for_restriction
                ):
                    continue
                # Check restriction_type: selected_products
                if coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS:
                    if item.get("id") not in selected_course_ids_for_restriction:
                        continue
                course_ids_to_fetch.add(item["id"])

            elif item_type == "painting":
                if coupon.applies_to not in ("all", "paintings", "selected_paintings"):
                    continue
                if coupon.applies_to == "selected_paintings":
                    if item.get("id") not in selected_painting_ids:
                        continue
                if (
                    coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS
                    and item.get("id") not in selected_painting_ids_for_restriction
                ):
                    continue
                # Check restriction_type: selected_products
                if coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS:
                    if item.get("id") not in selected_painting_ids_for_restriction:
                        continue
                painting_items_to_fetch.append(item)

        # Batch fetch courses
        courses_map: dict[uuid.UUID, Course] = {}
        if course_ids_to_fetch:
            from app.crud.course import crud_course

            courses = await crud_course.get_multi(
                db=session,
                id=list(course_ids_to_fetch),
                is_deleted=False,
                is_published=True,
                schema_to_select=CourseRead,
                return_as_model=True,
            )
            for course in courses:
                if course.price > 0:
                    courses_map[course.id] = course

        # Batch fetch variants for paintings
        variants_map: dict[str, ProductVariant] = {}
        if painting_items_to_fetch:
            from app.crud.product import crud_product_variant
            from app.schemas.product import ProductVariantRead

            # Collect variant IDs and product IDs
            variant_ids: set[uuid.UUID] = set()
            product_ids: set[uuid.UUID] = set()
            for item in painting_items_to_fetch:
                if item.get("variant_id"):
                    variant_ids.add(item["variant_id"])
                else:
                    product_ids.add(item["id"])

            # Fetch by variant ID
            if variant_ids:
                variants = await crud_product_variant.get_multi(
                    db=session,
                    id=list(variant_ids),
                    schema_to_select=ProductVariantRead,
                    return_as_model=True,
                )
                for variant in variants:
                    variants_map[str(variant.id)] = variant

            # Fetch default variants by product ID
            if product_ids:
                for product_id in product_ids:
                    variant = await crud_product_variant.get(
                        db=session,
                        product_id=product_id,
                        is_default=True,
                        schema_to_select=ProductVariantRead,
                        return_as_model=True,
                    )
                    if variant:
                        variants_map[str(product_id)] = variant

        # Second pass: build eligible items using fetched data
        for item in cart_items:
            item_type = item.get("type")
            quantity = item.get("quantity", 1)

            if item_type == "course":
                if coupon.applies_to not in ("all", "courses", "selected_courses"):
                    continue
                if coupon.applies_to == "selected_courses":
                    if item.get("id") not in selected_course_ids:
                        continue
                if (
                    coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS
                    and item.get("id") not in selected_course_ids_for_restriction
                ):
                    continue

                course = courses_map.get(item["id"])
                if not course or course.price <= 0:
                    continue

                eligible_items.append(
                    EligibleItem(
                        item_type="course",
                        item_id=course.id,
                        variant_id=None,
                        title=course.title,
                        variant_name=None,
                        quantity=quantity,
                        unit_price=course.price,
                    )
                )

            elif item_type == "painting":
                if coupon.applies_to not in ("all", "paintings", "selected_paintings"):
                    continue
                if coupon.applies_to == "selected_paintings":
                    if item.get("id") not in selected_painting_ids:
                        continue
                if (
                    coupon.restriction_type == RestrictionType.SELECTED_PRODUCTS
                    and item.get("id") not in selected_painting_ids_for_restriction
                ):
                    continue

                variant_key = item.get("variant_id") or item.get("id")
                variant = variants_map.get(str(variant_key))
                if not variant or variant.product_id != item.get("id"):
                    continue

                eligible_items.append(
                    EligibleItem(
                        item_type="painting",
                        item_id=item["id"],
                        variant_id=variant.id,
                        title=variant.product.title if variant.product else "Unknown",
                        variant_name=variant.variant_type.name
                        if variant.variant_type
                        else "Default",
                        quantity=item.get("quantity", 1),
                        unit_price=variant.price,
                    )
                )

        return eligible_items

    async def _get_course(
        self, session: AsyncSession, course_id: uuid.UUID
    ) -> Course | None:
        from app.crud.course import crud_course

        return await crud_course.get(
            db=session,
            id=course_id,
            is_deleted=False,
            is_published=True,
        )

    async def _get_variant(
        self, session: AsyncSession, item: dict
    ) -> ProductVariant | None:
        from app.crud.product import crud_product_variant
        from app.schemas.product import ProductVariantRead

        variant_id = item.get("variant_id")
        product_id = item.get("id")

        if variant_id:
            return await crud_product_variant.get(
                db=session,
                id=variant_id,
                schema_to_select=ProductVariantRead,
                return_as_model=True,
            )
        elif product_id:
            return await crud_product_variant.get(
                db=session,
                product_id=product_id,
                is_default=True,
                schema_to_select=ProductVariantRead,
                return_as_model=True,
            )
        return None

    def calculate_eligible_subtotal(
        self, eligible_items: list[EligibleItem]
    ) -> Decimal:
        return sum((item.line_total for item in eligible_items), Decimal("0"))

    def calculate_discount(self, coupon: Coupon, eligible_subtotal: Decimal) -> Decimal:
        if coupon.discount_type == DiscountType.PERCENTAGE:
            discount = (
                eligible_subtotal * coupon.discount_value / Decimal("100")
            ).quantize(Decimal("0.01"))
            if coupon.max_discount:
                discount = min(discount, coupon.max_discount)
        else:
            discount = coupon.discount_value

        return min(discount, eligible_subtotal)

    def calculate_gateway_fee(self, amount: Decimal) -> Decimal:
        fee: Decimal = (amount * self.GATEWAY_FEE_RATE).quantize(Decimal("0.01"))
        return fee

    def calculate_payable_amount(
        self,
        cart_subtotal: Decimal,
        discount_amount: Decimal,
        is_painting_order: bool = False,
    ) -> tuple[Decimal, Decimal, Decimal]:
        discounted_subtotal = cart_subtotal - discount_amount
        gateway_fee = self.calculate_gateway_fee(
            amount=Decimal(str(discounted_subtotal))
        )
        packaging_fee = self.PACKAGING_FEE if is_painting_order else Decimal("0")
        final_total = (discounted_subtotal + gateway_fee + packaging_fee).quantize(
            Decimal("0.01")
        )
        gateway_fee_quantized = gateway_fee.quantize(Decimal("0.01"))
        return final_total, gateway_fee_quantized, packaging_fee

    async def validate_coupon(
        self,
        session: AsyncSession,
        coupon: Coupon,
        user_id: uuid.UUID,
        eligible_items: list[EligibleItem],
        cart_subtotal: Decimal,
    ) -> dict:
        errors: list[tuple[str, str]] = []

        if not coupon.is_active:
            errors.append(("COUPON_NOT_ACTIVE", "This coupon is not active."))

        now = datetime.now(UTC)

        if coupon.starts_at and coupon.starts_at > now:
            errors.append(("COUPON_NOT_YET_ACTIVE", "This coupon is not yet active."))

        if coupon.expires_at and coupon.expires_at < now:
            errors.append(("COUPON_EXPIRED", "This coupon has expired."))

        # NOTE: Usage limit is checked atomically in consume_coupon() under row lock
        # to prevent race conditions. We skip the check here to avoid TOCTOU.

        if not eligible_items:
            errors.append(
                (
                    "COUPON_NO_ELIGIBLE_ITEMS",
                    "This coupon does not apply to any items in your cart.",
                )
            )

        if coupon.min_order_amount > 0:
            eligible_subtotal = sum(item.line_total for item in eligible_items)
            if eligible_subtotal < coupon.min_order_amount:
                min_amt = coupon.min_order_amount
                errors.append(
                    (
                        "COUPON_MIN_ORDER_NOT_MET",
                        f"Minimum eligible subtotal of {min_amt} not met.",
                    )
                )

        # NOTE: Per-user limit is checked atomically in consume_coupon() under row lock
        # to prevent race conditions. We skip the check here to avoid TOCTOU.

        if errors:
            raise CouponValidationError(errors[0][1], errors[0][0])

        return {"valid": True}

    async def validate_coupon_for_items(
        self,
        session: AsyncSession,
        coupon_code: str,
        user_id: uuid.UUID,
        cart_items: list[dict],
    ) -> dict:
        coupon = await self.get_coupon_by_code(session, coupon_code)
        if not coupon:
            raise CouponValidationError("Invalid coupon code.", "INVALID_COUPON")

        eligible_items = await self.get_eligible_items(session, coupon, cart_items)

        if not eligible_items:
            raise CouponValidationError(
                "This coupon does not apply to any items in your cart.",
                "COUPON_NO_ELIGIBLE_ITEMS",
            )

        eligible_subtotal = self.calculate_eligible_subtotal(eligible_items)

        # Validate (includes all checks: active, expiry, usage limits,
        # per-user, min order)
        await self.validate_coupon(
            session, coupon, user_id, eligible_items, eligible_subtotal
        )

        discount_amount = self.calculate_discount(coupon, eligible_subtotal)
        discount_amount = min(discount_amount, eligible_subtotal)

        # Calculate cart subtotal
        cart_subtotal_calc = Decimal("0")
        for item in cart_items:
            price = await self._get_item_price(session, item)
            cart_subtotal_calc += price * item.get("quantity", 1)

        # Calculate gateway fee on discounted amount
        discounted_subtotal = cart_subtotal_calc - discount_amount
        gateway_fee = self.calculate_gateway_fee(discounted_subtotal)
        packaging_fee = (
            self.PACKAGING_FEE
            if any(item.get("type") == "painting" for item in cart_items)
            else Decimal("0")
        )
        final_total = (
            cart_subtotal_calc - discount_amount + gateway_fee + packaging_fee
        ).quantize(Decimal("0.01"))

        return {
            "valid": True,
            "coupon": coupon,
            "cart_subtotal": Decimal(str(cart_subtotal_calc)).quantize(Decimal("0.01")),
            "eligible_subtotal": eligible_subtotal.quantize(Decimal("0.01")),
            "discount_amount": discount_amount.quantize(Decimal("0.01")),
            "gateway_fee": gateway_fee.quantize(Decimal("0.01")),
            "final_total": final_total,
        }

    async def _get_item_price(self, session: AsyncSession, item: dict) -> Decimal:
        if item.get("type") == "course":
            course = await self._get_course(session, item["id"])
            return course.price if course else Decimal("0")
        elif item.get("type") == "painting":
            variant = await self._get_variant(session, item)
            return variant.price if variant else Decimal("0")
        return Decimal("0")

    async def _is_item_eligible(
        self, session: AsyncSession, coupon: Coupon, item: dict
    ) -> bool:
        if item.get("type") == "course":
            if coupon.applies_to not in ("all", "courses", "selected_courses"):
                return False
            if coupon.applies_to == "selected_courses":
                course_ids = await crud_coupon.get_courses_for_coupon(
                    session, coupon.id
                )
                return item.get("id") in course_ids
            return True
        elif item.get("type") == "painting":
            if coupon.applies_to not in ("all", "paintings", "selected_paintings"):
                return False
            if coupon.applies_to == "selected_paintings":
                painting_ids = await crud_coupon.get_paintings_for_coupon(
                    session, coupon.id
                )
                return item.get("id") in painting_ids
            return True
        return False

    async def consume_coupon(
        self,
        session: AsyncSession,
        coupon: Coupon,
        user_id: uuid.UUID,
        order_id: uuid.UUID | None,
        course_payment_id: uuid.UUID | None,
        discount_amount: Decimal,
    ) -> CouponUsage:
        # Lock the coupon row.
        # NOTE: kept as a direct query - FastCRUD does not expose
        # SELECT ... FOR UPDATE row locking, which is required for atomic
        # usage-limit enforcement under concurrency.
        coupon_locked = await crud_coupon.lock_for_redemption(session, coupon.id)
        if coupon_locked is None:
            raise CouponValidationError("Coupon not found.", "INVALID_COUPON")

        # Re-validate under lock - global usage limit
        if (
            coupon_locked.usage_limit
            and coupon_locked.usage_count >= coupon_locked.usage_limit
        ):
            raise CouponValidationError(
                "Coupon usage limit reached.", "COUPON_USAGE_LIMIT_REACHED"
            )

        # Re-validate under lock - per-user limit (FastCRUD count())
        if coupon_locked.per_user_limit and coupon_locked.per_user_limit > 0:
            used_count = await crud_coupon_usage.count(
                db=session,
                coupon_id=coupon.id,
                user_id=user_id,
            )
            if used_count >= coupon_locked.per_user_limit:
                raise CouponValidationError(
                    "You have already used this coupon.", "COUPON_ALREADY_USED"
                )

        # Re-validate under lock - idempotency for the same order/payment
        # (FastCRUD exists()). Prevents duplicate consumption if verification
        # somehow runs twice within the same transaction boundary.
        if order_id is not None:
            already = await crud_coupon_usage.exists(
                db=session,
                coupon_id=coupon.id,
                order_id=order_id,
            )
            if already:
                raise CouponValidationError(
                    "Coupon already consumed for this order.",
                    "COUPON_ALREADY_CONSUMED",
                )
        if course_payment_id is not None:
            already = await crud_coupon_usage.exists(
                db=session,
                coupon_id=coupon.id,
                course_payment_id=course_payment_id,
            )
            if already:
                raise CouponValidationError(
                    "Coupon already consumed for this course payment.",
                    "COUPON_ALREADY_CONSUMED",
                )

        # Use FastCRUD for the write operations; the caller commits or rolls
        # back both writes with payment status in the same transaction.
        await crud_coupon.update(
            db=session,
            id=coupon_locked.id,
            object={"usage_count": coupon_locked.usage_count + 1},
            commit=False,
        )
        usage = await crud_coupon_usage.create(
            db=session,
            object={
                "coupon_id": coupon_locked.id,
                "user_id": user_id,
                "order_id": order_id,
                "course_payment_id": course_payment_id,
                "discount_amount": discount_amount,
            },
            commit=False,
            return_as_model=True,
        )
        return usage


coupon_service = CouponService()
