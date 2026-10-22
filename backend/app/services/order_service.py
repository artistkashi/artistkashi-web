from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import razorpay
from fastcrud import JoinConfig, compute_offset
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.exceptions import (
    ErrorCode,
    NotFoundException,
    ServiceException,
    ValidationException,
)
from app.crud.address import crud_address
from app.crud.order import crud_order, crud_order_item
from app.crud.product import crud_product_variant
from app.crud.user import crud_user as crud_user_order
from app.models.coupon import Coupon
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.order import (
    AdminOrderDetailRead,
    AdminOrderRead,
    OrderCreate,
    OrderCreateDB,
    OrderDashboardRead,
    OrderItemCreate,
    OrderItemDetailRead,
    OrderListParams,
    OrderRead,
    OrderShipRequest,
    PaymentVerificationRequest,
)
from app.schemas.product import (
    ProductVariantCheckDB,
    ProductVariantRead,
)
from app.schemas.user import PublicUserRead, UserRead
from app.services.coupon_service import coupon_service
from app.services.email.email import (
    send_order_confirmation_email,
    send_order_shipped_email,
)
from app.services.product_service import product_variant_service


class OrderService:
    def __init__(self):
        self.razorpay_client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID or "", settings.RAZORPAY_KEY_SECRET or "")
        )

    async def create_order(
        self,
        db: AsyncSession,
        user_id: UUID,
        payload: OrderCreate,
    ):
        if not payload.items:
            raise ValidationException(message="Order must contain at least one item")

        if payload.shipping_address_id is None:
            raise ValidationException(message="A shipping address is required")

        shipping_address = await crud_address.get(
            db=db,
            id=payload.shipping_address_id,
            user_id=user_id,
        )
        if not shipping_address:
            raise NotFoundException(
                resource="Address",
                identifier=payload.shipping_address_id,
                error_code=ErrorCode.ADDRESS_NOT_FOUND,
            )
        if (
            payload.billing_address_id
            and payload.billing_address_id != payload.shipping_address_id
        ):
            billing_address = await crud_address.get(
                db=db,
                id=payload.billing_address_id,
                user_id=user_id,
            )
            if not billing_address:
                raise NotFoundException(
                    resource="Billing Address",
                    identifier=payload.billing_address_id,
                    error_code=ErrorCode.ADDRESS_NOT_FOUND,
                )

        # Build cart items for coupon validation
        cart_items = []
        priced_order_items = []
        calculated_subtotal = Decimal("0")

        for item in payload.items:
            if item.variant_id:
                variant = await product_variant_service.get_product_variant(
                    session=db,
                    filter=ProductVariantCheckDB(id=item.variant_id),
                )

                if not variant:
                    raise NotFoundException(
                        "Product Variant",
                        item.variant_id,
                    )

                if item.quantity <= 0:
                    raise ValidationException(
                        message="Quantity must be greater than zero"
                    )

                if variant.stock_quantity < item.quantity:
                    raise ValidationException(
                        f"Insufficient stock for variant {variant.sku or variant.id}"
                    )

                line_total = variant.price * item.quantity
                calculated_subtotal += line_total

                # Add to cart items for coupon validation
                cart_items.append(
                    {
                        "type": "painting",
                        "id": variant.product_id,
                        "variant_id": variant.id,
                        "quantity": item.quantity,
                        "title": variant.product.title
                        if variant.product
                        else "Unknown",
                        "variant_name": variant.variant_type.name
                        if variant.variant_type
                        else "Default",
                    }
                )
                priced_order_items.append(
                    {
                        **item.model_dump(),
                        "product_id": variant.product_id,
                        "price": variant.price,
                    }
                )

            elif item.product_id:
                variant = await crud_product_variant.get(
                    db=db,
                    product_id=item.product_id,
                    is_default=True,
                    schema_to_select=ProductVariantRead,
                    return_as_model=True,
                )
                if not variant:
                    raise NotFoundException(
                        "Default Product Variant for product", item.product_id
                    )
                if item.quantity <= 0:
                    raise ValidationException(
                        message="Quantity must be greater than zero"
                    )
                calculated_subtotal += variant.price * item.quantity

                cart_items.append(
                    {
                        "type": "painting",
                        "id": variant.product_id,
                        "variant_id": variant.id,
                        "quantity": item.quantity,
                        "title": variant.product.title
                        if variant.product
                        else "Unknown",
                        "variant_name": variant.variant_type.name
                        if variant.variant_type
                        else "Default",
                    }
                )
                priced_order_items.append(
                    {
                        **item.model_dump(),
                        "product_id": variant.product_id,
                        "variant_id": variant.id,
                        "price": variant.price,
                    }
                )

            elif item.course_id:
                raise ValidationException(
                    message="Course items must be purchased through course checkout"
                )
        packaging_fee = coupon_service.PACKAGING_FEE

        # Handle coupon if provided
        discount_amount = Decimal("0")
        gateway_fee = Decimal("0")
        coupon = None
        coupon_code = None

        if payload.coupon_code:
            # Build cart items for coupon validation
            # Prices come from variants loaded above, never from the request.
            coupon_result = await coupon_service.validate_coupon_for_items(
                session=db,
                coupon_code=payload.coupon_code,
                user_id=user_id,
                cart_items=cart_items,
            )
            coupon_code = coupon_service.normalize_code(payload.coupon_code)
            discount_amount = coupon_result["discount_amount"]
            gateway_fee = coupon_result["gateway_fee"]
            final_total = coupon_result["final_total"]
            coupon = await coupon_service.get_coupon_by_code(db, payload.coupon_code)
            if not coupon:
                raise ValidationException(message="Invalid coupon code")
        else:
            gateway_fee = coupon_service.calculate_gateway_fee(calculated_subtotal)
            final_total = (calculated_subtotal + packaging_fee + gateway_fee).quantize(
                Decimal("0.01")
            )

        if payload.coupon_code:
            final_total = (
                calculated_subtotal - discount_amount + packaging_fee + gateway_fee
            ).quantize(Decimal("0.01"))

        try:
            order = await crud_order.create(
                db=db,
                object=OrderCreateDB(
                    user_id=user_id,
                    subtotal=calculated_subtotal + packaging_fee,
                    discount_amount=discount_amount,
                    gateway_fee=gateway_fee,
                    total_amount=final_total,
                    coupon_id=coupon.id if coupon else None,
                    coupon_code=coupon_code,
                    shipping_address_id=payload.shipping_address_id,
                    billing_address_id=payload.billing_address_id,
                    payment_method=payload.payment_method,
                ),
                return_as_model=True,
                schema_to_select=OrderRead,
                commit=False,
            )

            order_items = [
                OrderItemCreate(order_id=order.id, **item)
                for item in priced_order_items
            ]

            await crud_order_item.create_multi(
                db=db,
                objects=order_items,
                commit=False,
            )

            razorpay_order = self.razorpay_client.order.create(
                data={
                    "amount": int(final_total * 100),
                    "currency": "INR",
                    "receipt": str(order.id),
                }
            )

            await crud_order.update(
                db=db,
                id=order.id,
                object={
                    "razorpay_order_id": razorpay_order["id"],
                },
                commit=False,
            )

            await db.commit()

            return await crud_order.get_with_relations(
                db=db,
                id=order.id,
                relationships=["items"],
                schema_to_select=OrderRead,
                return_as_model=True,
            )

        except Exception as exc:
            await db.rollback()

            raise ServiceException(
                "Order",
                f"Failed to create order: {exc}",
            ) from exc

    async def verify_payment(
        self,
        db: AsyncSession,
        user_id: UUID,
        order_id: UUID,
        payload: PaymentVerificationRequest,
    ):
        order_result = await db.execute(
            select(Order)
            .where(Order.id == order_id, Order.user_id == user_id)
            .with_for_update()
        )
        order = order_result.scalar_one_or_none()

        if not order:
            raise NotFoundException(
                "Order",
                order_id,
                error_code=ErrorCode.ORDER_NOT_FOUND,
            )
        if order.payment_status == PaymentStatus.PAID:
            return await crud_order.get_with_relations(
                db=db,
                id=order.id,
                relationships=["items"],
                schema_to_select=OrderRead,
                return_as_model=True,
            )
        if (
            not order.razorpay_order_id
            or payload.razorpay_order_id != order.razorpay_order_id
        ):
            raise ValidationException("Payment order does not match this order")
        params_dict = {
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
        }

        try:
            self.razorpay_client.utility.verify_payment_signature(params_dict)

        except Exception as exc:
            await crud_order.update(
                db=db,
                id=order.id,
                object={
                    "payment_status": PaymentStatus.FAILED,
                },
            )

            raise ValidationException("Invalid payment signature") from exc

        try:
            await crud_order.update(
                db=db,
                id=order.id,
                object={
                    "payment_status": PaymentStatus.PAID,
                    "status": OrderStatus.CONFIRMED,
                    "razorpay_payment_id": payload.razorpay_payment_id,
                    "razorpay_signature": payload.razorpay_signature,
                },
                commit=False,
            )

            order_with_items = await crud_order.get_with_relations(
                db=db,
                id=order.id,
                relationships=["items"],
                schema_to_select=OrderRead,
                return_as_model=True,
            )

            for item in order_with_items.items:
                if not item.variant_id:
                    continue

                variant = await product_variant_service.get_product_variant(
                    session=db,
                    filter=ProductVariantCheckDB(
                        id=item.variant_id,
                    ),
                )

                if not variant:
                    continue

                if variant.stock_quantity < item.quantity:
                    raise ValidationException(
                        message=(
                            f"Stock changed for variant {variant.sku or variant.id}"
                        )
                    )

                await crud_product_variant.update(
                    db=db,
                    id=variant.id,
                    object={
                        "stock_quantity": (variant.stock_quantity - item.quantity),
                    },
                    commit=False,
                )

            # Consume coupon if one was used
            if order.coupon_id and order.discount_amount > 0:
                coupon = await db.get(Coupon, order.coupon_id)
                if not coupon:
                    raise ValidationException(message="Coupon no longer exists")
                await coupon_service.consume_coupon(
                    session=db,
                    coupon=coupon,
                    user_id=user_id,
                    order_id=order.id,
                    course_payment_id=None,
                    discount_amount=order.discount_amount,
                )

            await db.commit()

            try:
                user = await crud_user_order.get(
                    db=db, id=user_id, schema_to_select=UserRead, return_as_model=True
                )
                if user:
                    await send_order_confirmation_email(
                        user=user,
                        order_id=str(order.id),
                    )
            except Exception:
                pass

            return await crud_order.get_with_relations(
                db=db,
                id=order.id,
                relationships=["items"],
                schema_to_select=OrderRead,
                return_as_model=True,
            )

        except Exception as exc:
            await db.rollback()

            raise ServiceException(
                "Payment Verification",
                str(exc),
            ) from exc

    async def get_user_orders(
        self, db: AsyncSession, user_id: UUID, page: int = 1, page_size: int = 20
    ):
        return await crud_order.get_multi_with_relations(
            db=db,
            user_id=user_id,
            relationships=["items"],
            offset=(page - 1) * page_size,
            limit=page_size,
            sort_column="created_at",
            sort_order="desc",
        )

    async def get_orders(
        self, db: AsyncSession, params: OrderListParams
    ) -> AdminOrderRead:
        query_filters = {}

        if params.status:
            query_filters["status"] = params.status

        if params.payment_status:
            query_filters["payment_status"] = params.payment_status

        if params.date_start and params.date_end:
            query_filters["created_at__gte"] = params.date_start
            query_filters["created_at__lt"] = params.date_end + timedelta(days=1)

        if params.min_amount is not None:
            query_filters["total_amount__gte"] = params.min_amount

        if params.max_amount is not None:
            query_filters["total_amount__lte"] = params.max_amount

        if params.search:
            query_filters["_or"] = {
                "user.full_name__ilike": f"%{params.search}%",
                "user.email__ilike": f"%{params.search}%",
                "razorpay_order_id__ilike": f"%{params.search}%",
            }

        orders_data = await crud_order.get_multi_joined(
            db=db,
            schema_to_select=OrderDashboardRead,
            joins_config=[
                JoinConfig(
                    model=User,
                    join_on=Order.user_id == User.id,
                    schema_to_select=PublicUserRead,
                    join_type="left",
                    join_prefix="user",
                )
            ],
            nest_joins=True,
            offset=compute_offset(params.page, params.page_size),
            limit=params.page_size,
            sort_columns=["created_at"],
            sort_orders=["desc"],
            return_as_model=True,
            **query_filters,
        )

        # Patch item_count to sum quantities instead of counting rows
        if orders_data["data"]:
            order_ids = [
                o["id"] if isinstance(o, dict) else o.id for o in orders_data["data"]
            ]
            sum_qty = await db.execute(
                select(
                    OrderItem.order_id, func.sum(OrderItem.quantity).label("qty_sum")
                )
                .where(OrderItem.order_id.in_(order_ids))
                .group_by(OrderItem.order_id)
            )
            qty_map = {row.order_id: row.qty_sum for row in sum_qty.all()}
            for order in orders_data["data"]:
                oid = order["id"] if isinstance(order, dict) else order.id
                if isinstance(order, dict):
                    order["item_count"] = qty_map.get(oid, 0)
                else:
                    order.item_count = qty_map.get(oid, 0)

        return orders_data

    async def get_order_detail_with_items(
        self, db: AsyncSession, order_id: UUID
    ) -> AdminOrderDetailRead | None:
        stmt = (
            select(Order)
            .options(
                joinedload(Order.user),
                joinedload(Order.items).joinedload(OrderItem.course),
                joinedload(Order.items)
                .joinedload(OrderItem.product)
                .selectinload(Product.images),
                joinedload(Order.items).joinedload(OrderItem.variant),
                joinedload(Order.shipping_address),
            )
            .where(Order.id == order_id)
        )
        result = await db.execute(stmt)
        order = result.unique().scalar_one_or_none()
        if not order:
            return None

        order_data = AdminOrderDetailRead.model_validate(order)
        detail_items: list[OrderItemDetailRead] = []
        for item in order.items:
            base = OrderItemDetailRead.model_validate(item)
            if item.course:
                base.course_title = item.course.title
                base.course_slug = item.course.slug
            if item.product:
                base.product_title = item.product.title
                primary_img = next(
                    (img for img in item.product.images if img.is_primary),
                    item.product.images[0] if item.product.images else None,
                )
                if primary_img:
                    base.product_image = primary_img.image_url
            if item.variant:
                dims = []
                if item.variant.width:
                    dims.append(f"{item.variant.width}{item.variant.dimension_unit}")
                if item.variant.height:
                    dims.append(f"{item.variant.height}{item.variant.dimension_unit}")
                base.variant_dimensions = " × ".join(dims) if dims else None
                base.variant_name = (
                    item.variant.sku
                    or (
                        f"{item.variant.width}×{item.variant.height}{item.variant.dimension_unit}"
                        if item.variant.width and item.variant.height
                        else None
                    )
                    or str(item.variant.id)
                )
            detail_items.append(base)

        order_data.items = detail_items
        return order_data

    async def mark_as_shipped(
        self,
        db: AsyncSession,
        order_id: UUID,
        payload: OrderShipRequest,
    ) -> OrderRead:
        # Lock the order row so concurrent ship requests serialize: only the
        # first one observes status == CONFIRMED and sends the email; later
        # ones see SHIPPED and fail fast (no duplicate emails, no races).
        stmt = select(Order).where(Order.id == order_id).with_for_update()
        result = await db.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            raise NotFoundException(
                "Order", order_id, error_code=ErrorCode.ORDER_NOT_FOUND
            )

        if order.status != OrderStatus.CONFIRMED:
            raise ValidationException(
                "Order can only be shipped from 'confirmed' status, "
                f"current status: '{order.status.value}'"
            )
        if order.payment_status != PaymentStatus.PAID:
            raise ValidationException(
                "Order cannot be shipped until payment is completed"
            )

        await crud_order.update(
            db=db,
            id=order_id,
            object={
                "status": OrderStatus.SHIPPED,
                "courier_name": payload.courier_name,
                "tracking_number": payload.tracking_number,
                "tracking_url": payload.tracking_url,
                "shipping_note": payload.shipping_note,
                "shipped_at": datetime.now(UTC),
            },
        )

        try:
            user = await crud_user_order.get(
                db=db, id=order.user_id, schema_to_select=UserRead, return_as_model=True
            )
            if user:
                await send_order_shipped_email(
                    user=user,
                    order_id=str(order_id),
                    courier_name=payload.courier_name,
                    tracking_number=payload.tracking_number,
                    tracking_url=payload.tracking_url,
                )
        except Exception:
            pass

        return await crud_order.get_with_relations(
            db=db,
            id=order_id,
            relationships=["items"],
            schema_to_select=OrderRead,
            return_as_model=True,
        )


order_service = OrderService()
