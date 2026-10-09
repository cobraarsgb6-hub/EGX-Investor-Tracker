# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary User**: Executive investors, portfolio managers, corporate treasurers, and institutional market analysts in Egypt and the MENA region.
- **Situation**: Monitoring live capital movements during EGX trading sessions (10:00 AM – 2:30 PM Cairo) and after-hours closing auctions, checking foreign exchange rates to hedge currency exposure, and evaluating macroeconomic commodity trends (oil, gold) in real-time.
- **Job to Be Done**: Instantly assess whether foreign institutional smart money is buying or selling in the Egyptian market, verify true banking FX rates without deceptive averages, and make high-stakes allocation decisions without distraction.

## Product Purpose

EGX-Investor-Tracker delivers an authoritative, real-time institutional liquidity and financial intelligence hub. It exists to eliminate market opacity, speculative rumors, and delayed reports by piping raw, audited Egyptian Stock Exchange terminal feeds, actual banking currency spreads across 25 banks, and global asset benchmarks directly into a responsive executive dashboard and automated Telegram alerts. Success means zero visual clutter, sub-second comprehension of institutional direction, and 100% data integrity.

## Positioning

Zero-fluff institutional transparency: Unlike generic retail financial portals burdened with banner ads, delayed tickers, and unverified rumors, EGX-Investor-Tracker is laser-focused exclusively on verified institutional net liquidity—elevating Foreign Institutions as the primary indicator of sovereign capital flow—backed by actual Central Bank buy/sell rates and live global commodity tickers, running 100% autonomously on edge serverless architecture.

## Operating Context

- **Operating Hours**: Active EGX trading window Sunday through Thursday from 10:00 AM to 2:30 PM Cairo Time (UTC+2/UTC+3).
- **Environment**: Viewed on high-resolution desktop trading setups and mobile devices for rapid glanceable status. Also consumed via interactive Telegram Bot notifications (`@EgxTracker_LiveBot`) and embedded Google Sheets Web App.
- **Operating Rituals**: Morning pre-market rate check (09:45 AM), mid-session institutional flow monitoring, 02:30 PM closing bell audit, and 11:00 PM evening reconciliation snapshot. Non-trading days (weekends and official Egyptian holidays) must be explicitly flagged with 0-flow status.

## Capabilities and Constraints

- **Live Flow Tracking**: Segregated institutional buy, sell, and net flow metrics for Foreign, Arab, and Egyptian entities.
- **Historical Session Archive**: Deduplicated database of verified closing sessions with multi-period filtering (Daily, Weekly, Monthly).
- **Banking USD Matrix**: Live exchange rates for the Central Bank of Egypt (CBE) and all 25 licensed Egyptian commercial banks (Ta3weem live engine), sorting by highest buy and lowest sell rates.
- **Global Macro Feeds**: Real-time prices for Brent Crude, WTI, Gold (Ounce and 24K Gram in EGP/USD), Silver, and Crypto (BTC, ETH) via TradingView Scanner feeds.
- **Autonomous Cloud Architecture**: 100% cloud-hosted with zero local PC dependency (GitHub Actions + Cloudflare Workers + Google Apps Script).
- **Integrity Rule**: Never display artificial mathematical averages for FX; always show actual declared bank buy/sell rates with timestamps. Never label previous session numbers as "Today" when the market is closed or on holiday.
- **Localization**: Native dual-language support (Arabic RTL and English LTR) and multi-currency toggles (EGP, USD, Dual).

## Brand Commitments

- **Tone & Voice**: Authoritative, objective, executive, high-conviction FinTech. Anti-sycophancy, clean, data-first.
- **Design Metaphor**: High-density FinTech Executive Terminal (inspired by Bloomberg Terminal, TradingView, and Swiss design minimalism).
- **Color Discipline**: Strict semantic coloring—Green (`#10b981`) for Net Buying / Inflows, Red (`#ef4444`) for Net Selling / Outflows, Deep Navy/Slate backgrounds with high-contrast numerical legibility.

## Evidence on Hand

- Verified live dataset at `data/live_dashboard_data.json`.
- Cloudflare worker edge logic at `cloudflare/worker.js`.
- Responsive dashboard UI templates at `core/Index.html` and `google_sheets/Index.html`.
- Automated cloud synchronizer at `cloud_sync.py` and GitHub workflow at `.github/workflows/egx_cloud_sync.yml`.

## Product Principles

1. **Absolute Truth over Optimism**: Data must reflect actual audited reality; market closures, holidays, and net outflows are highlighted with equal, unvarnished precision.
2. **Speed to Comprehension**: Every metric must be decipherable in less than 2 seconds; critical KPIs occupy prime real estate above the fold.
3. **No Decorative Noise**: Every visual element, badge, and border must carry semantic meaning; decorative fluff, generic AI gradients, and unnecessary animations are strictly forbidden.
4. **Resilient Autonomy**: The system operates 24/7 without human intervention, maintaining continuity across web, edge, and messaging channels.

## Accessibility & Inclusion

- High-contrast ratio for financial numerical tables in both light and dark/terminal themes.
- Proper bidirectional layout flow with `dir="rtl"` for Arabic and `dir="ltr"` for English, preserving correct left-to-right number formatting (`num-ltr`).
- Responsive typography readable across high-DPI desktop displays down to mobile viewports without horizontal clipping.
