from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Проста авторизація для навчального admin dashboard.

    У production тут можна замінити API key на OAuth/JWT і ролі користувачів.
    Для цього проєкту важливо, що ключ не зашитий у frontend і читається з .env.
    """

    expected_key = get_settings().admin_api_key
    unsafe_placeholders = {"change-me-local-admin-key", "change_me_long_random_admin_key"}
    if not expected_key or expected_key in unsafe_placeholders:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ADMIN_API_KEY must be changed in .env before using admin API",
        )

    if x_api_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key",
        )
