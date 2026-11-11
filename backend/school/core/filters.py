from typing import Optional


def _split_filter_values(value: Optional[str]) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]
