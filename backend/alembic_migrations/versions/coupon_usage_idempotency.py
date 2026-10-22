"""make coupon redemption references idempotent

Revision ID: coupon_usage_idempotency
Revises: coupon_code_case_insensitive
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "coupon_usage_idempotency"
down_revision: Union[str, None] = "coupon_code_case_insensitive"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    duplicate_orders = bind.execute(
        sa.text("SELECT order_id FROM coupon_usages WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*) > 1")
    ).scalars().all()
    duplicate_payments = bind.execute(
        sa.text("SELECT course_payment_id FROM coupon_usages WHERE course_payment_id IS NOT NULL GROUP BY course_payment_id HAVING COUNT(*) > 1")
    ).scalars().all()
    if duplicate_orders or duplicate_payments:
        raise RuntimeError(
            "Duplicate coupon usage references exist; clean duplicate coupon_usages rows before upgrading. "
            f"Orders: {duplicate_orders}; course payments: {duplicate_payments}"
        )
    op.create_index(
        "uq_coupon_usage_order", "coupon_usages", ["order_id"], unique=True,
        postgresql_where=sa.text("order_id IS NOT NULL"),
    )
    op.create_index(
        "uq_coupon_usage_course_payment", "coupon_usages", ["course_payment_id"], unique=True,
        postgresql_where=sa.text("course_payment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_coupon_usage_course_payment", table_name="coupon_usages")
    op.drop_index("uq_coupon_usage_order", table_name="coupon_usages")
