import time
from typing import Optional

DEFAULT_USD_EGP_RATE = 52.15

def get_usd_egp_rate(force_refresh: bool = False) -> float:
    """
    Fetches the live USD to EGP exchange rate directly from Ta3weem (ta3weem.com/ar).
    Falls back to secondary APIs if needed.
    """
    try:
        from core.ta3weem import fetch_ta3weem_data
        data = fetch_ta3weem_data(force_refresh=force_refresh)
        if data and "usd_rate" in data and data["usd_rate"] > 0:
            return float(data["usd_rate"])
    except Exception as e:
        print(f"Warning: Failed to fetch rate from Ta3weem: {e}")

    return DEFAULT_USD_EGP_RATE

def format_currency(val: float, is_usd: bool = False, decimals: int = 2) -> str:
    """
    Formats a numeric currency value with thousands separators.
    """
    prefix = "$" if is_usd else ""
    suffix = "" if is_usd else " ج.م"
    
    if is_usd:
        formatted = f"{val:,.{decimals}f}"
    else:
        formatted = f"{val:,.0f}" if abs(val) >= 1 else f"{val:,.2f}"
        
    return f"{prefix}{formatted}{suffix}"
