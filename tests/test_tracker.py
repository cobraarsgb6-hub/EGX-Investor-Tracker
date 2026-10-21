import os
import sys
import unittest
import time
from datetime import datetime

# Add project root to sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from app import app
from core.converter import get_usd_egp_rate, format_currency
from core.scheduler import (
    get_cairo_datetime,
    check_egx_market_status,
    get_cairo_next_action,
    CAIRO_TZ
)
from core.archive import get_daily_history, get_weekly_summary, get_monthly_summary

class TestEGXTracker(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    # ==============================================================================
    # 1. SCHEDULER & TIMEZONE TESTS
    # ==============================================================================

    def test_cairo_datetime_timezone(self):
        now_cairo = get_cairo_datetime()
        self.assertIsNotNone(now_cairo.tzinfo)
        self.assertEqual(str(now_cairo.tzinfo), "Africa/Cairo")

    def test_egx_market_status_weekends(self):
        # Friday test: 2026-10-23
        friday = datetime(2026, 10, 23, 11, 0, tzinfo=CAIRO_TZ)
        is_open, desc = check_egx_market_status(friday)
        self.assertFalse(is_open)
        self.assertIn("الجمعة", desc)

        # Saturday test: 2026-10-24
        saturday = datetime(2026, 10, 24, 11, 0, tzinfo=CAIRO_TZ)
        is_open, desc = check_egx_market_status(saturday)
        self.assertFalse(is_open)
        self.assertIn("السبت", desc)

    def test_egx_market_status_trading_hours(self):
        # Tuesday 11:30 AM (Open)
        tuesday_open = datetime(2026, 10, 20, 11, 30, tzinfo=CAIRO_TZ)
        is_open, desc = check_egx_market_status(tuesday_open)
        self.assertTrue(is_open)
        self.assertIn("جارية الآن", desc)

        # Tuesday 08:30 AM (Before open)
        tuesday_early = datetime(2026, 10, 20, 8, 30, tzinfo=CAIRO_TZ)
        is_open, desc = check_egx_market_status(tuesday_early)
        self.assertFalse(is_open)
        self.assertIn("لم تبدأ بعد", desc)

        # Tuesday 03:00 PM (After close)
        tuesday_late = datetime(2026, 10, 20, 15, 0, tzinfo=CAIRO_TZ)
        is_open, desc = check_egx_market_status(tuesday_late)
        self.assertFalse(is_open)
        self.assertIn("أغلقت", desc)

    def test_cairo_next_action_active_window(self):
        tuesday_active = datetime(2026, 10, 20, 11, 0, tzinfo=CAIRO_TZ)
        action, duration = get_cairo_next_action(tuesday_active)
        self.assertEqual(action, "ACTIVE_SYNC")
        self.assertEqual(duration, 300)

    # ==============================================================================
    # 2. ARCHIVE & WEEK GROUPING TESTS (SUNDAY START)
    # ==============================================================================

    def test_weekly_summary_sunday_start(self):
        weekly = get_weekly_summary("1")
        self.assertIsInstance(weekly, list)
        if len(weekly) > 0:
            first_week = weekly[0]
            self.assertIn("start_date", first_week)
            self.assertIn("end_date", first_week)
            self.assertIn("trading_days", first_week)
            self.assertEqual(len(first_week["start_date"]), 10)

    def test_daily_history_schema(self):
        daily = get_daily_history("1")
        self.assertIsInstance(daily, list)
        if len(daily) > 0:
            row = daily[0]
            self.assertIn("date", row)
            self.assertIn("foreign_net_egp", row)
            self.assertIn("arab_net_egp", row)
            self.assertIn("egypt_net_egp", row)
            self.assertIn("source", row)
            self.assertIn("is_verified", row)

    # ==============================================================================
    # 3. CONVERTER TESTS
    # ==============================================================================

    def test_converter_format(self):
        self.assertEqual(format_currency(1234567.89, is_usd=False), "1,234,568 ج.م")
        self.assertEqual(format_currency(1234567.89, is_usd=True), "$1,234,567.89")

    def test_usd_rate_reasonable(self):
        rate = get_usd_egp_rate()
        self.assertTrue(40.0 < rate < 100.0)

    # ==============================================================================
    # 4. FLASK ENDPOINTS & LATENCY TESTS
    # ==============================================================================

    def test_index_route(self):
        t0 = time.time()
        res = self.client.get("/")
        elapsed_ms = (time.time() - t0) * 1000
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"<!DOCTYPE html>", res.data)
        self.assertLess(elapsed_ms, 1000.0)

    def test_api_market_status(self):
        res = self.client.get("/api/market-status")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("cairo_time", data["data"])
        self.assertIn("is_market_open", data["data"])

    def test_api_archive(self):
        res = self.client.get("/api/archive?sb=1")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertIn("daily", data)
        self.assertIn("weekly", data)
        self.assertIn("monthly", data)

    def test_ssrf_protection_on_google_config(self):
        bad_payload = {"webhook_url": "http://169.254.169.254/latest/meta-data/"}
        res = self.client.post("/api/google-sheets/config", json=bad_payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("غير صالح", res.get_json()["message"])

if __name__ == "__main__":
    unittest.main()
