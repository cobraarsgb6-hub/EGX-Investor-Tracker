import json
import time
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from playwright.sync_api import sync_playwright

from core.converter import get_usd_egp_rate

MARKET_SEGMENTS = {
    "1": "الأسهم والسندات والأذون (الإجمالي)",
    "2": "الأسهم فقط",
    "3": "السندات فقط",
    "4": "الأذون فقط"
}

ORDER_MAP = {
    "مصريين": 1,
    "عرب": 2,
    "اجانب": 3,
    "أجانب": 3
}

def clean_type_name(t: str) -> str:
    t = t.strip()
    if t == "اجانب":
        return "أجانب"
    return t

def fetch_investors_from_egx(
    sb: str = "1",
    max_attempts: int = 5,
    custom_usd_rate: Optional[float] = None
) -> Dict[str, Any]:
    """
    Automates bypassing F5 Bot Defense on EGX and fetches live investor flow data.
    Enriches data with USD conversions based on live exchange rates.
    """
    if custom_usd_rate is not None and custom_usd_rate > 0:
        usd_rate = custom_usd_rate
    else:
        usd_rate = get_usd_egp_rate()

    raw_items = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ]
        )
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport={'width': 1366, 'height': 800}
        )
        page = context.new_page()

        def handle_response(response):
            if "GetInvestorTables" in response.url:
                try:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0:
                        raw_items.extend(data)
                except Exception:
                    pass

        page.on("response", handle_response)

        success = False
        for attempt in range(1, max_attempts + 1):
            try:
                # domcontentloaded lets initial challenge run without hanging
                page.goto('https://www.egx.com.eg/ar/InvestorsTypeCharts.aspx', timeout=45000, wait_until='domcontentloaded')
                
                # Wait for F5 challenge and table/XHR trigger
                for _ in range(40):
                    time.sleep(1)
                    if raw_items:
                        success = True
                        break
                    try:
                        if page.locator("#AllGrd table").count() > 0:
                            success = True
                            break
                    except Exception:
                        pass
                
                if success:
                    break
            except Exception as e:
                time.sleep(2)

        # If sb is not '1', fetch specific market segment via authenticated evaluate
        if success and sb != "1":
            try:
                js_fetch = f"""
                () => {{
                    return new Promise((resolve, reject) => {{
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', '/WebService.asmx/GetInvestorTables?Lang=ar&SB={sb}', true);
                        xhr.onload = function() {{
                            if (xhr.status === 200) {{
                                try {{ resolve(JSON.parse(xhr.responseText)); }}
                                catch(e) {{ reject(e.message); }}
                            }} else {{
                                reject('Status: ' + xhr.status);
                            }}
                        }};
                        xhr.onerror = () => reject('Network error');
                        xhr.send();
                    }});
                }}
                """
                specific_data = page.evaluate(js_fetch)
                if specific_data and isinstance(specific_data, list):
                    raw_items = specific_data
            except Exception as e:
                print(f"Error fetching specific SB={sb}: {e}")

        browser.close()

    if not raw_items:
        raise RuntimeError("فشل الاتصال بموقع البورصة المصرية بعد عدة محاولات بسبب تعليق الخادم.")

    # Deduplicate raw items if any
    unique_items = []
    seen = set()
    for item in raw_items:
        key = (item.get("Group"), clean_type_name(item.get("Type", "")))
        if key not in seen:
            seen.add(key)
            unique_items.append(item)

    # Process and calculate USD
    def process_group(group_id: str) -> List[Dict[str, Any]]:
        rows = [it for it in unique_items if str(it.get("Group")) == group_id]
        processed = []
        for r in rows:
            name = clean_type_name(r.get("Type", ""))
            buy_egp = float(r.get("Buy", 0))
            sell_egp = float(r.get("Sell", 0))
            net_egp = float(r.get("Net", buy_egp - sell_egp))

            buy_usd = buy_egp / usd_rate
            sell_usd = sell_egp / usd_rate
            net_usd = net_egp / usd_rate

            processed.append({
                "type": name,
                "order": ORDER_MAP.get(name, 99),
                "buy_egp": buy_egp,
                "sell_egp": sell_egp,
                "net_egp": net_egp,
                "buy_usd": buy_usd,
                "sell_usd": sell_usd,
                "net_usd": net_usd,
            })
        processed.sort(key=lambda x: x["order"])
        return processed

    all_investors = process_group("1")
    individuals = process_group("2")
    institutions = process_group("3")

    cairo_now = datetime.now(timezone.utc) + timedelta(hours=3)
    cairo_ts = cairo_now.strftime("%Y-%m-%d %H:%M:%S")

    result = {
        "timestamp": cairo_ts,
        "sb": sb,
        "segment_name": MARKET_SEGMENTS.get(sb, "غير محدد"),
        "usd_rate": usd_rate,
        "tables": {
            "all": all_investors,
            "individuals": individuals,
            "institutions": institutions
        }
    }

    # Save to local cache
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    cache_path = os.path.join(data_dir, f"latest_sb_{sb}.json")
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Auto-archive institution flow
    try:
        from core.archive import save_institution_snapshot
        save_institution_snapshot(result)
    except Exception as e:
        print(f"Warning: Failed to save archive snapshot: {e}")

    return result
