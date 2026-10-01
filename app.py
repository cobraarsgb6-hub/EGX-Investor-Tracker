import os
import time
import json
from flask import Flask, render_template, request, jsonify, send_file
from core.scraper import fetch_investors_from_egx, MARKET_SEGMENTS
from core.converter import get_usd_egp_rate
from core.ta3weem import fetch_ta3weem_data
from core.archive import get_daily_history, get_weekly_summary, get_monthly_summary
from core.exporter import export_to_excel, export_archive_to_excel
from core.scheduler import start_scheduler, get_market_status_info

app = Flask(__name__)

# Start background sync threads (currencies every 10m, EGX hourly during market hours)
start_scheduler()


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
os.makedirs(DATA_DIR, exist_ok=True)

def get_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "currency_view": "both",
        "fixed_usd_rate": 52.07,
        "selected_bank": "البنك الأهلي المصري (NBE)"
    }

def save_settings(settings):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

if not os.path.exists(SETTINGS_FILE):
    save_settings({
        "currency_view": "both",
        "fixed_usd_rate": 52.07,
        "selected_bank": "البنك الأهلي المصري (NBE)"
    })


def get_latest_cached_data(sb: str = "1"):
    cache_path = os.path.join(DATA_DIR, f"latest_sb_{sb}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

@app.route("/")
def index():
    initial_sb = request.args.get("sb", "1")
    cached = get_latest_cached_data(initial_sb)
    ta3weem = fetch_ta3weem_data()
    settings = get_settings()
    
    usd_rate = settings.get("fixed_usd_rate") or ta3weem.get("usd_rate", 52.07)
    
    daily_history = get_daily_history(initial_sb)
    weekly_summary = get_weekly_summary(initial_sb)
    monthly_summary = get_monthly_summary(initial_sb)
    
    market_status = get_market_status_info()
    
    return render_template(
        "index.html",
        cached_data=cached,
        market_segments=MARKET_SEGMENTS,
        current_sb=initial_sb,
        usd_rate=usd_rate,
        ta3weem=ta3weem,
        daily_history=daily_history,
        weekly_summary=weekly_summary,
        monthly_summary=monthly_summary,
        settings=settings,
        market_status=market_status
    )

@app.route("/api/market-status", methods=["GET"])
def api_market_status():
    return jsonify({"status": "success", "data": get_market_status_info()})

@app.route("/api/banks", methods=["GET"])
def api_banks():
    t_data = fetch_ta3weem_data()
    return jsonify({
        "status": "success",
        "banks": t_data.get("banks", []),
        "highest_buy": t_data.get("highest_buy"),
        "lowest_sell": t_data.get("lowest_sell"),
        "avg_rate": t_data.get("avg_rate"),
        "source": t_data.get("source_url")
    })

@app.route("/api/fetch", methods=["POST"])
def api_fetch():
    req_data = request.get_json() or {}
    sb = req_data.get("sb", "1")
    custom_rate = req_data.get("rate")
    
    if custom_rate:
        try:
            custom_rate = float(custom_rate)
        except ValueError:
            custom_rate = None
            
    try:
        data = fetch_investors_from_egx(sb=sb, custom_usd_rate=custom_rate)
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        cached = get_latest_cached_data(sb)
        if cached:
            return jsonify({
                "status": "success",
                "data": cached,
                "warning": f"تم استخدام آخر لقطة مسجلة للجلسة بسبب ضغط خادم البورصة: {str(e)}"
            })
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/latest-egx", methods=["GET"])
def api_latest_egx():
    sb = request.args.get("sb", "1")
    cached = get_latest_cached_data(sb)
    if cached:
        return jsonify({"status": "success", "data": cached})
    return jsonify({"status": "error", "message": "لا توجد بيانات محفوظة بعد"}), 404

@app.route("/api/ta3weem", methods=["GET"])
def api_ta3weem():
    force = request.args.get("refresh", "0") == "1"
    try:
        data = fetch_ta3weem_data(force_refresh=force)
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST":
        data = request.get_json() or {}
        cur = get_settings()
        cur.update(data)
        save_settings(cur)
        return jsonify({"status": "success", "settings": cur})
    return jsonify({"status": "success", "settings": get_settings()})

@app.route("/api/archive", methods=["GET"])
def api_archive():
    sb = request.args.get("sb", "1")
    daily = get_daily_history(sb)
    weekly = get_weekly_summary(sb)
    monthly = get_monthly_summary(sb)
    return jsonify({
        "status": "success",
        "sb": sb,
        "daily": daily,
        "weekly": weekly,
        "monthly": monthly
    })

@app.route("/export/excel", methods=["GET"])
def export_excel_route():
    sb = request.args.get("sb", "1")
    settings = get_settings()
    custom_rate = request.args.get("rate", None)
    if custom_rate:
        try:
            custom_rate = float(custom_rate)
        except ValueError:
            custom_rate = None
    else:
        custom_rate = settings.get("fixed_usd_rate")

    cached = get_latest_cached_data(sb)
    if not cached:
        cached = fetch_investors_from_egx(sb=sb, custom_usd_rate=custom_rate)
        
    export_filename = f"EGX_Investors_SB_{sb}_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join(DATA_DIR, export_filename)
    export_to_excel(cached, filepath)
    
    return send_file(
        filepath,
        as_attachment=True,
        download_name=export_filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.route("/export/archive/excel", methods=["GET"])
def export_archive_excel_route():
    sb = request.args.get("sb", "1")
    export_filename = f"EGX_Institutions_Archive_SB_{sb}_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join(DATA_DIR, export_filename)
    export_archive_to_excel(sb, filepath)
    
    return send_file(
        filepath,
        as_attachment=True,
        download_name=export_filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

# ==========================================
# GOOGLE SHEETS INTEGRATION ROUTES
# ==========================================
from flask import Response
from core.google_sheets import (
    get_google_config,
    save_google_config,
    sync_to_google_sheets,
    generate_archive_csv,
    generate_rates_csv,
    GOOGLE_APPS_SCRIPT_TEMPLATE
)

@app.route("/api/google-sheets/config", methods=["GET", "POST"])
def api_google_config():
    if request.method == "POST":
        data = request.get_json() or {}
        cfg = get_google_config()
        cfg.update(data)
        save_google_config(cfg)
        return jsonify({"status": "success", "config": cfg})
    return jsonify({"status": "success", "config": get_google_config()})

@app.route("/api/google-sheets/sync", methods=["POST"])
def api_google_sync():
    req_data = request.get_json() or {}
    webhook_url = req_data.get("webhook_url")
    sb = req_data.get("sb", "1")
    result = sync_to_google_sheets(webhook_url=webhook_url, sb=sb)
    return jsonify(result)

@app.route("/api/google-sheets/apps-script", methods=["GET"])
def api_google_script():
    return jsonify({
        "status": "success",
        "script": GOOGLE_APPS_SCRIPT_TEMPLATE
    })

@app.route("/api/google-sheets/export-archive.csv", methods=["GET"])
def api_export_archive_csv():
    sb = request.args.get("sb", "1")
    csv_text = generate_archive_csv(sb=sb)
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=egx_archive.csv"}
    )

@app.route("/api/google-sheets/export-rates.csv", methods=["GET"])
def api_export_rates_csv():
    csv_text = generate_rates_csv()
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=egx_market_rates.csv"}
    )

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 بدء تشغيل خادم لوحة تحكم البورصة المصرية...")
    print("🌐 افتح الرابط في المتصفح: http://127.0.0.1:5050")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5050, debug=False)
