"""add coupon system

Revision ID: 2132460a7671
Revises: fa1e2d3c4b5a
Create Date: 2026-10-03 18:55:09.520171

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2132460a7671'
down_revision: Union[str, None] = 'fa1e2d3c4b5a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types using raw SQL to avoid SQLAlchemy async issues
    op.execute("CREATE TYPE discounttype AS ENUM ('percentage', 'fixed')")
    op.execute("CREATE TYPE appliesto AS ENUM ('all', 'courses', 'paintings', 'selected_courses', 'selected_paintings')")
    op.execute("CREATE TYPE restrictiontype AS ENUM ('all_eligible', 'selected_products')")

    # Create coupons table
    op.create_table(
        'coupons',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('discount_type', postgresql.ENUM('percentage', 'fixed', name='discounttype', create_type=False), nullable=False),
        sa.Column('discount_value', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('max_discount', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('applies_to', postgresql.ENUM('all', 'courses', 'paintings', 'selected_courses', 'selected_paintings', name='appliesto', create_type=False), nullable=False),
        sa.Column('restriction_type', postgresql.ENUM('all_eligible', 'selected_products', name='restrictiontype', create_type=False), nullable=False, server_default='all_eligible'),
        sa.Column('min_order_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('usage_limit', sa.Integer(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('per_user_limit', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index('ix_coupons_code', 'coupons', ['code'], unique=True)

    # Create coupon_courses table
    op.create_table(
        'coupon_courses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('coupon_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('course_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['coupon_id'], ['coupons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('coupon_id', 'course_id', name='uq_coupon_course'),
    )
    op.create_index('ix_coupon_courses_coupon_id', 'coupon_courses', ['coupon_id'])
    op.create_index('ix_coupon_courses_course_id', 'coupon_courses', ['course_id'])

    # Create coupon_paintings table
    op.create_table(
        'coupon_paintings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('coupon_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('product_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['coupon_id'], ['coupons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('coupon_id', 'product_id', name='uq_coupon_painting'),
    )
    op.create_index('ix_coupon_paintings_coupon_id', 'coupon_paintings', ['coupon_id'])
    op.create_index('ix_coupon_paintings_product_id', 'coupon_paintings', ['product_id'])

    # Create coupon_usages table
    op.create_table(
        'coupon_usages',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('coupon_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('course_payment_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['coupon_id'], ['coupons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['course_payment_id'], ['course_payments.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_coupon_usages_coupon_id', 'coupon_usages', ['coupon_id'])
    op.create_index('ix_coupon_usages_user_id', 'coupon_usages', ['user_id'])
    op.create_index('ix_coupon_usages_order_id', 'coupon_usages', ['order_id'])
    op.create_index('ix_coupon_usages_course_payment_id', 'coupon_usages', ['course_payment_id'])

    # Add coupon fields to orders table
    op.add_column('orders', sa.Column('subtotal', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('gateway_fee', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('coupon_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('orders', sa.Column('coupon_code', sa.String(length=50), nullable=True))
    op.create_index('ix_orders_coupon_id', 'orders', ['coupon_id'])
    op.create_foreign_key('fk_orders_coupon_id', 'orders', 'coupons', ['coupon_id'], ['id'], ondelete='SET NULL')

    # Add coupon fields to course_payments table
    op.add_column('course_payments', sa.Column('subtotal', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('course_payments', sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('course_payments', sa.Column('gateway_fee', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'))
    op.add_column('course_payments', sa.Column('coupon_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('course_payments', sa.Column('coupon_code', sa.String(length=50), nullable=True))
    op.create_index('ix_course_payments_coupon_id', 'course_payments', ['coupon_id'])
    op.create_foreign_key('fk_course_payments_coupon_id', 'course_payments', 'coupons', ['coupon_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # Drop foreign keys and columns from course_payments
    op.drop_constraint('fk_course_payments_coupon_id', 'course_payments', type_='foreignkey')
    op.drop_index('ix_course_payments_coupon_id', table_name='course_payments')
    op.drop_column('course_payments', 'coupon_code')
    op.drop_column('course_payments', 'coupon_id')
    op.drop_column('course_payments', 'gateway_fee')
    op.drop_column('course_payments', 'discount_amount')
    op.drop_column('course_payments', 'subtotal')

    # Drop foreign keys and columns from orders
    op.drop_constraint('fk_orders_coupon_id', 'orders', type_='foreignkey')
    op.drop_index('ix_orders_coupon_id', table_name='orders')
    op.drop_column('orders', 'coupon_code')
    op.drop_column('orders', 'coupon_id')
    op.drop_column('orders', 'gateway_fee')
    op.drop_column('orders', 'discount_amount')
    op.drop_column('orders', 'subtotal')

    # Drop coupon_usages table
    op.drop_index('ix_coupon_usages_course_payment_id', table_name='coupon_usages')
    op.drop_index('ix_coupon_usages_order_id', table_name='coupon_usages')
    op.drop_index('ix_coupon_usages_user_id', table_name='coupon_usages')
    op.drop_index('ix_coupon_usages_coupon_id', table_name='coupon_usages')
    op.drop_table('coupon_usages')

    # Drop coupon_paintings table
    op.drop_index('ix_coupon_paintings_product_id', table_name='coupon_paintings')
    op.drop_index('ix_coupon_paintings_coupon_id', table_name='coupon_paintings')
    op.drop_table('coupon_paintings')

    # Drop coupon_courses table
    op.drop_index('ix_coupon_courses_course_id', table_name='coupon_courses')
    op.drop_index('ix_coupon_courses_coupon_id', table_name='coupon_courses')
    op.drop_table('coupon_courses')

    # Drop coupons table
    op.drop_index('ix_coupons_code', table_name='coupons')
    op.drop_table('coupons')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS restrictiontype')
    op.execute('DROP TYPE IF EXISTS appliesto')
    op.execute('DROP TYPE IF EXISTS discounttype')