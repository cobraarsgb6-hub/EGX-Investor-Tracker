import time
import threading
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo
from typing import Dict, Any, Tuple
import logging

from core.ta3weem import fetch_ta3weem_data
from core.scraper import fetch_investors_from_egx
from core.archive import save_institution_snapshot

logger = logging.getLogger("EGX_Scheduler")
logger.setLevel(logging.INFO)

CAIRO_TZ = ZoneInfo("Africa/Cairo")

# Standard recurring Egyptian Public Holidays (month-day)
FIXED_HOLIDAYS = {
    "01-01": "رأس السنة الميلادية",
    "01-07": "عيد الميلاد المجيد",
    "01-25": "عيد ثورة 25 يناير وعيد الشرطة",
    "04-25": "عيد تحرير سيناء",
    "05-01": "عيد العمال",
    "06-30": "عيد ثورة 30 يونيو",
    "07-23": "عيد ثورة 23 يوليو",
    "10-06": "عيد القوات المسلحة (6 أكتوبر)"
}

# State tracking
scheduler_state = {
    "last_currency_sync": None,
    "last_currency_epoch": None,
    "next_currency_sync": None,
    "next_currency_epoch": None,
    "last_egx_sync": None,
    "next_egx_sync": None,
    "next_egx_epoch": None,
    "egx_market_status": "غير محدد",
    "egx_market_open": False,
    "last_egx_error": None,
    "total_currency_syncs": 0,
    "total_egx_syncs": 0
}

def get_cairo_datetime() -> datetime:
    """Returns current date and time in Cairo timezone (Africa/Cairo)."""
    return datetime.now(CAIRO_TZ)

def check_egx_market_status(dt: datetime = None) -> Tuple[bool, str]:
    """
    Checks if Egyptian Exchange (EGX) is currently in active trading session.
    Trading Days: Sunday through Thursday (0=Mon, 1=Tue, 2=Wed, 3=Thu, 6=Sun).
    Weekend: Friday (4) and Saturday (5).
    Trading Hours: 10:00 AM to 02:00 PM (Cairo Time).
    """
    if dt is None:
        dt = get_cairo_datetime()
        
    weekday = dt.weekday()
    if weekday == 4:
        return False, "عطلة نهاية الأسبوع (الجمعة) - البورصة مغلقة"
    if weekday == 5:
        return False, "عطلة نهاية الأسبوع (السبت) - البورصة مغلقة"
        
    date_md = dt.strftime("%m-%d")
    if date_md in FIXED_HOLIDAYS:
        return False, f"إجازة رسمية ({FIXED_HOLIDAYS[date_md]}) - البورصة مغلقة"
        
    cur_time = dt.time()
    market_open = dtime(10, 0)
    market_close = dtime(14, 0)
    
    if cur_time < market_open:
        return False, "قبل بدء الجلسة (تبدأ 10:00 صباحاً بتوقيت مصر) - البورصة مغلقة"
    if cur_time > market_close:
        return False, "انتهت جلسة اليوم (انتهت 2:00 ظهراً بتوقيت مصر) - البورصة مغلقة"
        
    return True, "🟢 جلسة التداول مفتوحة حالياً (10:00 ص - 2:00 م)"

def get_market_status_info() -> Dict[str, Any]:
    """Returns a full snapshot of Cairo time, market operational status, and sync countdowns."""
    now_cairo = get_cairo_datetime()
    is_open, status_desc = check_egx_market_status(now_cairo)
    
    scheduler_state["egx_market_open"] = is_open
    scheduler_state["egx_market_status"] = status_desc
    
    now_epoch = time.time()
    next_curr_epoch = scheduler_state.get("next_currency_epoch") or (now_epoch + 600)
    countdown_curr_sec = max(0, int(next_curr_epoch - now_epoch))
    
    return {
        "cairo_time": now_cairo.strftime("%Y-%m-%d %H:%M:%S"),
        "cairo_time_formatted": now_cairo.strftime("%I:%M:%S %p").replace("AM", "صباحاً").replace("PM", "مساءً"),
        "cairo_date_formatted": now_cairo.strftime("%Y-%m-%d"),
        "weekday_ar": ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"][now_cairo.weekday()],
        "is_market_open": is_open,
        "status_description": status_desc,
        "last_currency_sync": scheduler_state["last_currency_sync"],
        "next_currency_sync": scheduler_state["next_currency_sync"],
        "currency_countdown_sec": countdown_curr_sec,
        "total_currency_syncs": scheduler_state["total_currency_syncs"],
        "last_egx_sync": scheduler_state["last_egx_sync"],
        "next_egx_sync": scheduler_state["next_egx_sync"],
        "total_egx_syncs": scheduler_state["total_egx_syncs"]
    }

def get_adaptive_sync_interval(now_cairo: datetime) -> int:
    """
    Returns appropriate sync interval in seconds:
    - During EGX & Egyptian Banking active hours (09:00 - 16:00 Sun-Thu): 300 seconds (5 minutes)
    - Outside trading hours (evenings / nights / weekends / holidays): 3600 seconds (1 hour)
    """
    weekday = now_cairo.weekday()
    # Friday (4) or Saturday (5)
    if weekday in (4, 5):
        return 3600  # 1 hour on weekends
        
    cur_time = now_cairo.time()
    if dtime(9, 0) <= cur_time <= dtime(16, 0):
        return 300  # 5 minutes during active banking & exchange hours
    else:
        return 3600  # 1 hour outside active hours

def run_currency_sync_loop():
    """
    Intelligently syncs currency, commodity, crypto, and gold rates.
    Uses adaptive polling to avoid unnecessary requests:
    - 5 minutes during active banking hours (09:00 - 16:00 Sun-Thu)
    - 1 hour outside active market hours & weekends.
    """
    while True:
        now_cairo = get_cairo_datetime()
        interval = get_adaptive_sync_interval(now_cairo)
        try:
            now_epoch = time.time()
            now_str = now_cairo.strftime("%Y-%m-%d %H:%M:%S")
            fetch_ta3weem_data(force_refresh=False)
            scheduler_state["last_currency_sync"] = now_str
            scheduler_state["last_currency_epoch"] = now_epoch
            scheduler_state["total_currency_syncs"] += 1
            
            next_epoch = now_epoch + interval
            scheduler_state["next_currency_epoch"] = next_epoch
            next_sync_dt = datetime.fromtimestamp(next_epoch, tz=CAIRO_TZ)
            scheduler_state["next_currency_sync"] = next_sync_dt.strftime("%H:%M:%S")
            print(f"[Scheduler] 💱 Rates checked #{scheduler_state['total_currency_syncs']} at {now_str}. Next in {interval // 60}m ({scheduler_state['next_currency_sync']})", flush=True)
        except Exception as e:
            print(f"[Scheduler Error] Currency sync failed: {e}", flush=True)
            
        time.sleep(interval)


def run_egx_sync_loop():
    """
    Syncs EGX investor data every 1 hour (3600 seconds) during trading hours:
    Sunday - Thursday, 10:00 AM to 02:00 PM Cairo Time.
    Skips Friday, Saturday, and official Egyptian holidays.
    """
    time.sleep(30)
    
    while True:
        now_cairo = get_cairo_datetime()
        is_open, desc = check_egx_market_status(now_cairo)
        scheduler_state["egx_market_open"] = is_open
        scheduler_state["egx_market_status"] = desc
        
        now_epoch = time.time()
        next_epoch = now_epoch + 3600
        scheduler_state["next_egx_epoch"] = next_epoch
        scheduler_state["next_egx_sync"] = datetime.fromtimestamp(next_epoch, tz=CAIRO_TZ).strftime("%H:%M:%S")

        if is_open:
            try:
                now_str = now_cairo.strftime("%Y-%m-%d %H:%M:%S")
                print(f"[Scheduler] 🏛️ EGX Market is OPEN. Fetching hourly snapshot at {now_str}...", flush=True)
                data = fetch_investors_from_egx(sb="1")
                save_institution_snapshot(data)
                scheduler_state["last_egx_sync"] = now_str
                scheduler_state["total_egx_syncs"] += 1
                scheduler_state["last_egx_error"] = None
                print(f"[Scheduler] ✅ EGX snapshot #{scheduler_state['total_egx_syncs']} saved successfully.", flush=True)
                
                # Auto-sync to Google Sheets if configured
                try:
                    from core.google_sheets import get_google_config, sync_to_google_sheets
                    g_cfg = get_google_config()
                    if g_cfg.get("auto_sync") and g_cfg.get("webhook_url"):
                        print("[Scheduler] 📊 Triggering Google Sheets Auto-Sync...", flush=True)
                        sync_to_google_sheets()
                except Exception as ge:
                    print(f"[Scheduler] Google Sheets auto-sync notice: {ge}", flush=True)
            except Exception as e:
                scheduler_state["last_egx_error"] = str(e)
                print(f"[Scheduler Error] EGX hourly sync failed: {e}", flush=True)
        else:
            print(f"[Scheduler] ⏸️ EGX check: {desc}. Next check at {scheduler_state['next_egx_sync']}.", flush=True)
            
        time.sleep(3600)  # 1 hour

_scheduler_started = False

def start_scheduler():
    """Starts background synchronization threads if not already started."""
    global _scheduler_started
    if _scheduler_started:
        return
        
    _scheduler_started = True
    
    t_currency = threading.Thread(target=run_currency_sync_loop, daemon=True, name="CurrencySyncThread")
    t_currency.start()
    
    t_egx = threading.Thread(target=run_egx_sync_loop, daemon=True, name="EGXSyncThread")
    t_egx.start()
    
    print("🚀 Background Auto-Sync Scheduler initialized:", flush=True)
    print("   - Currencies/Crypto/Oil: Every 10 minutes", flush=True)
    print("   - EGX Market: Hourly during 10:00 AM - 02:00 PM Cairo Time (Sun-Thu, excluding holidays)", flush=True)
