import sqlite3
import os
import json
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "institutions_archive.db")

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS institution_daily_flows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            sb TEXT NOT NULL DEFAULT '1',
            segment_name TEXT,
            usd_rate REAL NOT NULL,
            
            -- Egyptian Institutions
            egypt_inflow_egp REAL DEFAULT 0,
            egypt_outflow_egp REAL DEFAULT 0,
            egypt_net_egp REAL DEFAULT 0,
            egypt_inflow_usd REAL DEFAULT 0,
            egypt_outflow_usd REAL DEFAULT 0,
            egypt_net_usd REAL DEFAULT 0,
            
            -- Arab Institutions
            arab_inflow_egp REAL DEFAULT 0,
            arab_outflow_egp REAL DEFAULT 0,
            arab_net_egp REAL DEFAULT 0,
            arab_inflow_usd REAL DEFAULT 0,
            arab_outflow_usd REAL DEFAULT 0,
            arab_net_usd REAL DEFAULT 0,
            
            -- Foreign Institutions
            foreign_inflow_egp REAL DEFAULT 0,
            foreign_outflow_egp REAL DEFAULT 0,
            foreign_net_egp REAL DEFAULT 0,
            foreign_inflow_usd REAL DEFAULT 0,
            foreign_outflow_usd REAL DEFAULT 0,
            foreign_net_usd REAL DEFAULT 0,
            
            -- Total Institutions
            total_inflow_egp REAL DEFAULT 0,
            total_outflow_egp REAL DEFAULT 0,
            total_net_egp REAL DEFAULT 0,
            total_inflow_usd REAL DEFAULT 0,
            total_outflow_usd REAL DEFAULT 0,
            total_net_usd REAL DEFAULT 0,
            
            created_at TEXT NOT NULL,
            UNIQUE(date, sb)
        )
        """)
        conn.commit()

init_db()

def save_institution_snapshot(data: Dict[str, Any]) -> bool:
    """
    Saves or updates today's institution flow snapshot into SQLite.
    """
    init_db()
    institutions = data.get("tables", {}).get("institutions", [])
    if not institutions:
        return False

    date_str = data.get("timestamp", "").split(" ")[0] or datetime.now().strftime("%Y-%m-%d")
    sb = str(data.get("sb", "1"))
    seg_name = data.get("segment_name", "الأسهم والسندات والأذون")
    usd_rate = float(data.get("usd_rate", 52.15))

    row_data = {
        "egypt": {"buy_egp": 0, "sell_egp": 0, "net_egp": 0, "buy_usd": 0, "sell_usd": 0, "net_usd": 0},
        "arab": {"buy_egp": 0, "sell_egp": 0, "net_egp": 0, "buy_usd": 0, "sell_usd": 0, "net_usd": 0},
        "foreign": {"buy_egp": 0, "sell_egp": 0, "net_egp": 0, "buy_usd": 0, "sell_usd": 0, "net_usd": 0},
    }

    for item in institutions:
        t = item.get("type", "")
        key = "egypt" if "مصر" in t else ("arab" if "عرب" in t else "foreign")
        row_data[key] = {
            "buy_egp": float(item.get("buy_egp", 0)),
            "sell_egp": float(item.get("sell_egp", 0)),
            "net_egp": float(item.get("net_egp", 0)),
            "buy_usd": float(item.get("buy_usd", 0)),
            "sell_usd": float(item.get("sell_usd", 0)),
            "net_usd": float(item.get("net_usd", 0)),
        }

    tot_inflow_egp = sum(row_data[k]["buy_egp"] for k in row_data)
    tot_outflow_egp = sum(row_data[k]["sell_egp"] for k in row_data)
    tot_net_egp = sum(row_data[k]["net_egp"] for k in row_data)

    tot_inflow_usd = sum(row_data[k]["buy_usd"] for k in row_data)
    tot_outflow_usd = sum(row_data[k]["sell_usd"] for k in row_data)
    tot_net_usd = sum(row_data[k]["net_usd"] for k in row_data)

    # 🛑 Anti-Duplicate Validation: Prevent saving stale/yesterday numbers under today's date if market closed
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, foreign_inflow_egp, foreign_outflow_egp, total_net_egp 
            FROM institution_daily_flows 
            WHERE sb = ? 
            ORDER BY date DESC LIMIT 1
        """, (sb,))
        last_row = cursor.fetchone()
        if last_row:
            last_date, last_fo_in, last_fo_out, last_tot_net = last_row
            # If the current scrape is attempting to insert a new date, but values are identical to previous session
            if last_date != date_str:
                curr_fo_in = row_data["foreign"]["buy_egp"]
                curr_fo_out = row_data["foreign"]["sell_egp"]
                if abs(curr_fo_in - (last_fo_in or 0)) < 1.0 and abs(curr_fo_out - (last_fo_out or 0)) < 1.0:
                    print(f"[Archive Deduplication] ⚠️ Rejected stale snapshot for {date_str}: values identical to last session ({last_date}). EGX likely closed/holiday.", flush=True)
                    return False
        cursor.execute("""
        INSERT INTO institution_daily_flows (
            date, sb, segment_name, usd_rate,
            egypt_inflow_egp, egypt_outflow_egp, egypt_net_egp, egypt_inflow_usd, egypt_outflow_usd, egypt_net_usd,
            arab_inflow_egp, arab_outflow_egp, arab_net_egp, arab_inflow_usd, arab_outflow_usd, arab_net_usd,
            foreign_inflow_egp, foreign_outflow_egp, foreign_net_egp, foreign_inflow_usd, foreign_outflow_usd, foreign_net_usd,
            total_inflow_egp, total_outflow_egp, total_net_egp, total_inflow_usd, total_outflow_usd, total_net_usd,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, sb) DO UPDATE SET
            usd_rate=excluded.usd_rate,
            egypt_inflow_egp=excluded.egypt_inflow_egp, egypt_outflow_egp=excluded.egypt_outflow_egp, egypt_net_egp=excluded.egypt_net_egp,
            egypt_inflow_usd=excluded.egypt_inflow_usd, egypt_outflow_usd=excluded.egypt_outflow_usd, egypt_net_usd=excluded.egypt_net_usd,
            arab_inflow_egp=excluded.arab_inflow_egp, arab_outflow_egp=excluded.arab_outflow_egp, arab_net_egp=excluded.arab_net_egp,
            arab_inflow_usd=excluded.arab_inflow_usd, arab_outflow_usd=excluded.arab_outflow_usd, arab_net_usd=excluded.arab_net_usd,
            foreign_inflow_egp=excluded.foreign_inflow_egp, foreign_outflow_egp=excluded.foreign_outflow_egp, foreign_net_egp=excluded.foreign_net_egp,
            foreign_inflow_usd=excluded.foreign_inflow_usd, foreign_outflow_usd=excluded.foreign_outflow_usd, foreign_net_usd=excluded.foreign_net_usd,
            total_inflow_egp=excluded.total_inflow_egp, total_outflow_egp=excluded.total_outflow_egp, total_net_egp=excluded.total_net_egp,
            total_inflow_usd=excluded.total_inflow_usd, total_outflow_usd=excluded.total_outflow_usd, total_net_usd=excluded.total_net_usd,
            created_at=excluded.created_at
        """, (
            date_str, sb, seg_name, usd_rate,
            row_data["egypt"]["buy_egp"], row_data["egypt"]["sell_egp"], row_data["egypt"]["net_egp"],
            row_data["egypt"]["buy_usd"], row_data["egypt"]["sell_usd"], row_data["egypt"]["net_usd"],
            row_data["arab"]["buy_egp"], row_data["arab"]["sell_egp"], row_data["arab"]["net_egp"],
            row_data["arab"]["buy_usd"], row_data["arab"]["sell_usd"], row_data["arab"]["net_usd"],
            row_data["foreign"]["buy_egp"], row_data["foreign"]["sell_egp"], row_data["foreign"]["net_egp"],
            row_data["foreign"]["buy_usd"], row_data["foreign"]["sell_usd"], row_data["foreign"]["net_usd"],
            tot_inflow_egp, tot_outflow_egp, tot_net_egp,
            tot_inflow_usd, tot_outflow_usd, tot_net_usd,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
        conn.commit()
    return True

def get_daily_history(sb: str = "1", limit: int = 30) -> List[Dict[str, Any]]:
    """
    Returns daily history of institution flows.
    """
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
        SELECT * FROM institution_daily_flows
        WHERE sb = ?
        ORDER BY date DESC
        LIMIT ?
        """, (sb, limit))
        rows = [dict(r) for r in cursor.fetchall()]
        return rows

def get_weekly_summary(sb: str = "1") -> List[Dict[str, Any]]:
    """
    Aggregates institution flows by week (كام دخل وكام خرج أسبوعياً).
    """
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
        SELECT 
            strftime('%Y-W%W', date) AS week_period,
            MIN(date) AS start_date,
            MAX(date) AS end_date,
            COUNT(*) AS trading_days,
            SUM(total_inflow_egp) AS total_inflow_egp,
            SUM(total_outflow_egp) AS total_outflow_egp,
            SUM(total_net_egp) AS total_net_egp,
            SUM(total_inflow_usd) AS total_inflow_usd,
            SUM(total_outflow_usd) AS total_outflow_usd,
            SUM(total_net_usd) AS total_net_usd,
            SUM(foreign_net_egp) AS foreign_net_egp,
            SUM(foreign_net_usd) AS foreign_net_usd,
            SUM(arab_net_egp) AS arab_net_egp,
            SUM(arab_net_usd) AS arab_net_usd,
            SUM(egypt_net_egp) AS egypt_net_egp,
            SUM(egypt_net_usd) AS egypt_net_usd
        FROM institution_daily_flows
        WHERE sb = ?
        GROUP BY week_period
        ORDER BY start_date DESC
        """, (sb,))
        return [dict(r) for r in cursor.fetchall()]

def get_monthly_summary(sb: str = "1") -> List[Dict[str, Any]]:
    """
    Aggregates institution flows by month (كام دخل وكام خرج شهرياً).
    """
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
        SELECT 
            strftime('%Y-%m', date) AS month_period,
            COUNT(*) AS trading_days,
            SUM(total_inflow_egp) AS total_inflow_egp,
            SUM(total_outflow_egp) AS total_outflow_egp,
            SUM(total_net_egp) AS total_net_egp,
            SUM(total_inflow_usd) AS total_inflow_usd,
            SUM(total_outflow_usd) AS total_outflow_usd,
            SUM(total_net_usd) AS total_net_usd,
            SUM(foreign_net_egp) AS foreign_net_egp,
            SUM(foreign_net_usd) AS foreign_net_usd,
            SUM(arab_net_egp) AS arab_net_egp,
            SUM(arab_net_usd) AS arab_net_usd,
            SUM(egypt_net_egp) AS egypt_net_egp,
            SUM(egypt_net_usd) AS egypt_net_usd
        FROM institution_daily_flows
        WHERE sb = ?
        GROUP BY month_period
        ORDER BY month_period DESC
        """, (sb,))
        return [dict(r) for r in cursor.fetchall()]
