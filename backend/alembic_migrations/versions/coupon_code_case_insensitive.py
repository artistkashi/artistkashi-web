"""enforce case-insensitive coupon code uniqueness

Adds a functional unique index on LOWER(code) so that codes differing only
by case cannot coexist, without changing the column type (the SQLAlchemy
model keeps using String(50), avoiding a citext/model mismatch).

Also normalizes any legacy mixed-case codes to uppercase, which the
application already does on every create/update and lookup path
(strip().upper()), so lowercase legacy rows become findable again.

Before the index is created, the migration checks for case-insensitive
duplicates and aborts with a clear message listing the offending codes,
so no data is silently destroyed. Manual cleanup is required in that case:

    SELECT UPPER(code) AS normalized, array_agg(id), array_agg(code)
    FROM coupons GROUP BY 1 HAVING COUNT(*) > 1;

Pick which row to keep/renumber, update it, then re-run the migration.

Revision ID: coupon_code_case_insensitive
Revises: 2132460a7671
Create Date: 2026-10-19 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'coupon_code_case_insensitive'
down_revision: Union[str, None] = '2132460a7671'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Refuse to proceed if case-insensitive duplicates already exist.
    #    (The old, case-sensitive unique constraint allowed 'SAVE10' and
    #    'save10' to coexist; normalizing them would collide.)
    result = op.get_bind().execute(
        sa.text(
            """
            SELECT UPPER(code) AS normalized, array_agg(code ORDER BY code) AS codes
            FROM coupons
            GROUP BY UPPER(code)
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()
    if result:
        offenders = "; ".join(
            f"{row[0]} -> {list(row[1])}" for row in result
        )
        raise RuntimeError(
            "Cannot enforce case-insensitive coupon code uniqueness: "
            f"duplicate codes differing only by case exist: {offenders}. "
            "Manually merge/rename these coupons, then re-run the migration."
        )

    # 2) Normalize legacy mixed-case codes to uppercase so they match the
    #    application's normalization (strip().upper()) on every code path.
    #    Safe: no case-insensitive duplicates exist at this point, and the
    #    existing case-sensitive unique constraint cannot be violated by
    #    uppercasing distinct values.
    op.execute(sa.text("UPDATE coupons SET code = UPPER(code) WHERE code <> UPPER(code)"))

    # 3) Add a functional unique index on LOWER(code). Non-destructive:
    #    the existing case-sensitive constraint/index stay untouched, and
    #    the column type is unchanged so the ORM model stays in sync.
    op.execute(
        sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_coupons_code_lower "
            "ON coupons (LOWER(code))"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ux_coupons_code_lower"))
