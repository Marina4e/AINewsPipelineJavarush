"""Додає видимий стан джерел для dashboard.

Revision ID: 20260614_0003
Revises: 20260610_0002
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260614_0003"
down_revision: str | None = "20260610_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sources", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("sources", sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sources", sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("sources", "last_success_at")
    op.drop_column("sources", "last_checked_at")
    op.drop_column("sources", "last_error")
