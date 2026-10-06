import os
import json
import csv
import io
import time
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from core.archive import get_daily_history, get_weekly_summary, get_monthly_summary
from core.ta3weem import fetch_ta3weem_data

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONFIG_FILE = os.path.join(DATA_DIR, "google_sheets_config.json")
CREDENTIALS_FILE = os.path.join(DATA_DIR, "google_credentials.json")

def get_google_config() -> Dict[str, Any]:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "webhook_url": "",
        "spreadsheet_id": "",
        "auto_sync": False,
        "last_sync_time": None,
        "last_sync_status": None,
        "last_sync_message": None
    }

def save_google_config(config: Dict[str, Any]):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

def prepare_google_sheets_data(sb: str = "1") -> Dict[str, Any]:
    """
    Prepares a clean, fully formatted payload ready for Google Sheets tabs:
    1. egx_archive: All recorded daily sessions
    2. live_rates: Currencies, Gold, Oil, Crypto
    3. banks: 25 Egyptian banks
    """
    # 1. Archive
    history = get_daily_history(sb=sb, limit=365)
    archive_rows = []
    for r in history:
        archive_rows.append({
            "date": r.get("date", ""),
            "segment": r.get("segment_name", "الأسهم والسندات والأذون"),
            "usd_rate": r.get("usd_rate", 52.07),
            "egypt_buy_egp": r.get("egypt_inflow_egp", 0),
            "egypt_sell_egp": r.get("egypt_outflow_egp", 0),
            "egypt_net_egp": r.get("egypt_net_egp", 0),
            "arab_buy_egp": r.get("arab_inflow_egp", 0),
            "arab_sell_egp": r.get("arab_outflow_egp", 0),
            "arab_net_egp": r.get("arab_net_egp", 0),
            "foreign_buy_egp": r.get("foreign_inflow_egp", 0),
            "foreign_sell_egp": r.get("foreign_outflow_egp", 0),
            "foreign_net_egp": r.get("foreign_net_egp", 0),
            "total_buy_egp": r.get("total_inflow_egp", 0),
            "total_sell_egp": r.get("total_outflow_egp", 0),
            "total_net_egp": r.get("total_net_egp", 0),
            "total_net_usd": r.get("total_net_usd", 0)
        })

    # 2. Ta3weem & Live Rates
    ta3weem = fetch_ta3weem_data(force_refresh=False)
    usd_rate = float(ta3weem.get("usd_rate", 51.90))
    cairo_now = datetime.now(timezone.utc) + timedelta(hours=3)
    now_time = cairo_now.strftime("%H:%M:%S")
    live_rates = []
    
    # Currencies
    for c in ta3weem.get("currencies", []):
        egp_p = float(c.get("rate", 0))
        code = c.get("code", "")
        usd_p = 1.0 if code == "USD" else (round(egp_p / usd_rate, 4) if usd_rate > 0 else 0)
        c_buy = float(c.get("buy", egp_p))
        c_sell = float(c.get("sell", egp_p))
        live_rates.append({
            "category": "عملات رئيسية",
            "name": c.get("name_ar", c.get("name", "")),
            "code": code,
            "usd_price": usd_p,
            "egp_price": egp_p,
            "buy": c_buy,
            "sell": c_sell,
            "rate_egp": egp_p,
            "change": c.get("change", "0.0%"),
            "updated_at": now_time
        })
        
    # Gold
    for g in ta3weem.get("gold", []):
        g_name = g.get("name", "ذهب")
        rate_val = float(g.get("rate", 0)) or float(g.get("sell", 0))
        usd_p = round(rate_val / usd_rate, 2) if usd_rate > 0 else 0
        
        # Proper code assignment
        if "24" in g_name:
            code = "GOLD24"
        elif "21" in g_name:
            code = "GOLD21"
        elif "18" in g_name:
            code = "GOLD18"
        elif "جنيه" in g_name:
            code = "GOLDC"
        else:
            code = "GOLD"
            
        live_rates.append({
            "category": "ذهب ومعادن",
            "name": g_name,
            "code": code,
            "usd_price": usd_p,
            "egp_price": rate_val,
            "buy": round(rate_val * 0.99, 2),
            "sell": rate_val,
            "rate_egp": rate_val,
            "change": g.get("change", "0.0%"),
            "updated_at": now_time
        })

    # Gold Ounce & Silver (Global Spot)
    g_ounce_val = float(ta3weem.get("gold_ounce", 4165.0) or 4165.0)
    live_rates.append({
        "category": "ذهب ومعادن",
        "name": "أونصة الذهب (Gold Ounce)",
        "code": "GOLD_OUNCE",
        "usd_price": g_ounce_val,
        "egp_price": round(g_ounce_val * usd_rate, 2),
        "buy": g_ounce_val,
        "sell": g_ounce_val,
        "rate_egp": round(g_ounce_val * usd_rate, 2),
        "change": "+0.45%",
        "updated_at": now_time
    })
    silver_val = float(ta3weem.get("silver", 61.10) or 61.10)
    live_rates.append({
        "category": "ذهب ومعادن",
        "name": "أونصة الفضة (Silver Ounce)",
        "code": "SILVER",
        "usd_price": silver_val,
        "egp_price": round(silver_val * usd_rate, 2),
        "buy": silver_val,
        "sell": silver_val,
        "rate_egp": round(silver_val * usd_rate, 2),
        "change": "+0.80%",
        "updated_at": now_time
    })

    # Oil
    for o in ta3weem.get("commodities", []):
        usd_p = float(o.get("usd_price", 0))
        egp_p = float(o.get("egp_price", 0)) or round(usd_p * usd_rate, 2)
        live_rates.append({
            "category": "طاقة وبترول",
            "name": o.get("name", ""),
            "code": o.get("code", ""),
            "usd_price": usd_p,
            "egp_price": egp_p,
            "buy": usd_p,
            "sell": usd_p,
            "rate_egp": egp_p,
            "change": o.get("change_24h", "0.0%"),
            "updated_at": now_time
        })

    # Crypto
    for cr in ta3weem.get("crypto", []):
        usd_p = float(cr.get("usd_price", 0))
        egp_p = float(cr.get("egp_price", 0)) or round(usd_p * usd_rate, 2)
        live_rates.append({
            "category": "عملات رقمية",
            "name": cr.get("name", ""),
            "code": cr.get("code", ""),
            "usd_price": usd_p,
            "egp_price": egp_p,
            "buy": usd_p,
            "sell": usd_p,
            "rate_egp": egp_p,
            "change": cr.get("change_24h", "0.0%"),
            "updated_at": now_time
        })

    # 3. Banks (Sorted descending by highest purchase price)
    banks = []
    real_bank_time = ta3weem.get("banks_scraped_at_str") or ""
    for b in ta3weem.get("banks", []):
        banks.append({
            "bank": b.get("bank", ""),
            "buy": float(b.get("buy", 0)),
            "sell": float(b.get("sell", 0)),
            "avg": float(b.get("avg", 0)),
            "updated_at": b.get("updated_at") or real_bank_time or "قديم"
        })
    banks.sort(key=lambda x: x["buy"], reverse=True)

    latest_egx = None
    cache_path = os.path.join(DATA_DIR, f"latest_sb_{sb}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                latest_egx = json.load(f)
        except Exception:
            pass

    return {
        "timestamp": cairo_now.strftime("%Y-%m-%d %H:%M:%S"),
        "usd_rate": usd_rate,
        "cbe_usd_buy": ta3weem.get("cbe_usd_buy"),
        "cbe_usd_sell": ta3weem.get("cbe_usd_sell"),
        "archive": archive_rows,
        "rates": live_rates,
        "banks": banks,
        "latest_egx": latest_egx
    }

def sync_to_google_sheets(webhook_url: Optional[str] = None, sb: str = "1") -> Dict[str, Any]:
    """
    Sends the entire dataset to Google Sheets via the Apps Script Webhook.
    """
    config = get_google_config()
    target_url = webhook_url or config.get("webhook_url", "")
    
    if not target_url:
        return {
            "status": "error",
            "message": "لم يتم ضبط رابط Google Apps Script Webhook. يرجى إدخال الرابط أولاً."
        }

    for attempt in range(2):
        try:
            data = prepare_google_sheets_data(sb=sb)
            resp = requests.post(
                target_url,
                json=data,
                headers={"Content-Type": "application/json"},
                allow_redirects=True,
                timeout=90
            )
            
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if resp.status_code == 200:
                config["last_sync_time"] = now_str
                config["last_sync_status"] = "success"
                config["last_sync_message"] = "تمت المزامنة بنجاح مع كافة تبويبات Google Sheets"
                save_google_config(config)
                return {
                    "status": "success",
                    "message": "تم تحديث كافة تبويبات Google Sheets بنجاح! 📊",
                    "synced_at": now_str,
                    "archive_count": len(data["archive"]),
                    "rates_count": len(data["rates"]),
                    "banks_count": len(data["banks"])
                }
            else:
                err_msg = f"استجابة غير متوقعة من Google Sheets (كود {resp.status_code})"
                config["last_sync_time"] = now_str
                config["last_sync_status"] = "error"
                config["last_sync_message"] = err_msg
                save_google_config(config)
                return {"status": "error", "message": err_msg}
                
        except requests.exceptions.Timeout:
            if attempt == 0:
                time.sleep(3)
                continue
            err_msg = "انتهت مهلة الاتصال بخادم Google (Timeout). تأكد من صحة رابط الـ Webhook ونشره بشكل سليم."
            return {"status": "error", "message": err_msg}
        except Exception as e:
            if attempt == 0:
                time.sleep(3)
                continue
            err_msg = f"فشل الاتصال بـ Google Sheets: {str(e)}"
            return {"status": "error", "message": err_msg}


def generate_archive_csv(sb: str = "1") -> str:
    """
    Generates CSV formatted text for the archive, ready for =IMPORTDATA() in Google Sheets.
    """
    history = get_daily_history(sb=sb, limit=365)
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "التاريخ", "القطاع", "سعر الدولار",
        "مشتريات المصريين (ج.م)", "مبيعات المصريين (ج.م)", "صافي المصريين (ج.م)",
        "مشتريات العرب (ج.م)", "مبيعات العرب (ج.م)", "صافي العرب (ج.م)",
        "مشتريات الأجانب (ج.م)", "مبيعات الأجانب (ج.م)", "صافي الأجانب (ج.م)",
        "إجمالي مشتريات المؤسسات (ج.م)", "إجمالي مبيعات المؤسسات (ج.م)", "إجمالي صافي المؤسسات (ج.م)",
        "إجمالي الصافي بالدولار ($)"
    ])
    
    for r in history:
        writer.writerow([
            r.get("date", ""),
            r.get("segment_name", ""),
            r.get("usd_rate", ""),
            r.get("egypt_inflow_egp", 0),
            r.get("egypt_outflow_egp", 0),
            r.get("egypt_net_egp", 0),
            r.get("arab_inflow_egp", 0),
            r.get("arab_outflow_egp", 0),
            r.get("arab_net_egp", 0),
            r.get("foreign_inflow_egp", 0),
            r.get("foreign_outflow_egp", 0),
            r.get("foreign_net_egp", 0),
            r.get("total_inflow_egp", 0),
            r.get("total_outflow_egp", 0),
            r.get("total_net_egp", 0),
            r.get("total_net_usd", 0)
        ])
        
    return output.getvalue()


def generate_rates_csv() -> str:
    """
    Generates CSV formatted text for live currencies and commodities, ready for =IMPORTDATA().
    """
    data = prepare_google_sheets_data()
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["القسم", "الرمز", "الاسم", "سعر الشراء", "سعر البيع / السعر الحالي", "المعادل بالجنيه", "التغير (24h)"])
    for r in data.get("rates", []):
        writer.writerow([
            r.get("category", ""),
            r.get("code", ""),
            r.get("name", ""),
            r.get("buy", 0),
            r.get("sell", 0),
            r.get("rate_egp", 0),
            r.get("change", "")
        ])
        
    return output.getvalue()


def get_google_apps_script_template() -> str:
    script_path = os.path.join(os.path.dirname(__file__), "google_apps_script_master.js")
    if os.path.exists(script_path):
        with open(script_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

GOOGLE_APPS_SCRIPT_TEMPLATE = get_google_apps_script_template()

