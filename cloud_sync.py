"""
Standalone Cloud Sync Worker for EGX & Market Rates to Google Sheets.
Can be run on GitHub Actions, a VPS, or local scheduler.
"""
import os
import sys
import json
import time
from datetime import datetime

# Add project root to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from core.scraper import fetch_investors_from_egx
from core.archive import save_institution_snapshot, get_daily_history
from core.ta3weem import fetch_ta3weem_data
from core.google_sheets import get_google_config, sync_to_google_sheets

def run_cloud_sync(webhook_url=None):
    print("=" * 60)
    print(f"🚀 [Cloud Worker] Starting EGX & Rates Cloud Sync at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 1. Fetch EGX data with Playwright (only if market is open or during business day)
    from core.scheduler import check_egx_market_status, get_cairo_datetime
    is_market_open, market_reason = check_egx_market_status()
    now_cairo = get_cairo_datetime()
    weekday = now_cairo.weekday()

    egx_success = False
    if weekday in (4, 5):
        print(f"⏸️ [1/3] Skipping EGX Scraping: عطلة نهاية الأسبوع (الجمعة/السبت) - البورصة مغلقة رسمياً.")
    else:
        print("🏛️ [1/3] Scraping EGX Investor flows via Playwright...")
        try:
            data = fetch_investors_from_egx(sb="1")
            if data and data.get("tables", {}).get("institutions"):
                saved = save_institution_snapshot(data)
                if saved:
                    print("✅ EGX snapshot saved successfully to local database.")
                    egx_success = True
                else:
                    print("⚠️ EGX snapshot skipped by deduplication (identical to previous session - market holiday).")
            else:
                print("⚠️ EGX returned empty table (Market closed or holiday).")
        except Exception as e:
            print(f"❌ EGX Scraping error: {e}")

    # 2. Fetch Live Rates (Ta3weem, Oil, Crypto, Gold, Banks)
    print("💱 [2/3] Fetching live currencies, crypto, gold, and oil...")
    try:
        t_data = fetch_ta3weem_data(force_refresh=True)
        print(f"✅ Rates fetched successfully (USD: {t_data.get('usd_rate')} EGP).")
    except Exception as e:
        print(f"⚠️ Rates fetch warning: {e}")

    # 3. Push to Google Sheets Webhook
    print("📊 [3/3] Uploading all records to Google Sheets...")
    target_url = webhook_url or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
    if not target_url:
        cfg = get_google_config()
        target_url = cfg.get("webhook_url")
    if not target_url:
        target_url = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec"

    result = sync_to_google_sheets(webhook_url=target_url)
    print("📌 Google Sheets Result:", json.dumps(result, ensure_ascii=False, indent=2))
    
    # 4. Save latest unified payload to JSON for GitHub Actions / Cloudflare direct CDN access
    try:
        from core.google_sheets import prepare_google_sheets_data
        payload = prepare_google_sheets_data(sb="1")
        export_path = os.path.join(BASE_DIR, "data", "live_dashboard_data.json")
        with open(export_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"💾 [4/4] Saved unified data payload to {export_path}")
    except Exception as eExp:
        print(f"⚠️ Failed to save unified JSON payload: {eExp}")

    if result.get("status") == "success":
        print("🎉 [DONE] Google Sheets & Cloud Sync completed successfully!")
    else:
        print("❌ [FAILED] Google Sheets update failed:", result.get("message"))
        sys.exit(1)

if __name__ == "__main__":
    cli_url = sys.argv[1] if len(sys.argv) > 1 else None
    run_cloud_sync(webhook_url=cli_url)
