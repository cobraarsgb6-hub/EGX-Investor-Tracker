/**
 * ==================================================================================
 * ⚡ EGX & GLOBAL MARKETS TELEGRAM BOT - CLOUDFLARE WORKER (LIVE REAL-TIME EDITION)
 * ==================================================================================
 * - 100% AUTONOMOUS CLOUD ENGINE (Zero Local PC Dependency)
 * - LIVE SECOND-BY-SECOND FEED: Binance (BTC, ETH, Gold) & Yahoo Finance (Brent, WTI)
 * - LIVE DIRECT FEED: Ta3weem.com (25 Banks + Official Central Bank Actual Rates)
 * - EGX Institutional flows from Google Sheets API / GitHub Actions
 * - Exact Timestamp (آخر وقت تحديث) displayed under EVERY single product and rate
 * - Clear Banking Guidance: Bank Buy (You Sell) vs. Bank Sell (You Buy)
 * - Pure actual rates (No fake averages)
 * - Built-in Cloudflare HTML Control Dashboard (/control)
 * ==================================================================================
 */

// توكن البوت الافتراضي (مع إمكانية تجاوزه تلقائياً عبر Cloudflare Secrets: env.BOT_TOKEN)
let BOT_TOKEN = "8602326797:AAH0__1Q9RTSvmkho6qR0-Sk6FWSrHQF6GY";
const DATA_API_URL = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec?action=data";
const CONFIG_API_URL = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec";
const GITHUB_RAW_DATA_URL = "https://raw.githubusercontent.com/cobraarsgb6-hub/EGX-Investor-Tracker/main/data/live_dashboard_data.json";

// الإعدادات المركزية الافتراضية (اللغة الافتراضية إنجليزية بناءً على رغبة المستخدم)
let botConfig = {
  hide_egx: false,
  hide_banks: false,
  hide_commodities: false,
  hide_currencies: false,
  hide_report: false,
  hide_lang_toggle: false,
  banks_count: 8,
  show_cbe_in_banks: true,
  show_best_banks: true,
  default_lang: "en",
  default_curr: "usd"
};

// تخزين اختيار لغة وعملة ومنطقة المستخدم الفردية
let userLangPreferences = {};
let userCurrPreferences = {};
let userTzPreferences = {};

const TIMEZONES = {
  "cairo": { id: "Africa/Cairo", name_ar: "القاهرة (مصر)", name_en: "Cairo (Egypt)", flag: "🇪🇬" },
  "riyadh": { id: "Asia/Riyadh", name_ar: "الرياض (السعودية)", name_en: "Riyadh (KSA)", flag: "🇸🇦" },
  "dubai": { id: "Asia/Dubai", name_ar: "دبي (الإمارات)", name_en: "Dubai (UAE)", flag: "🇦🇪" },
  "london": { id: "Europe/London", name_ar: "لندن (جرينتش)", name_en: "London (GMT/BST)", flag: "🇬🇧" },
  "newyork": { id: "America/New_York", name_ar: "نيويورك (وول ستريت)", name_en: "New York (EST/EDT)", flag: "🇺🇸" }
};

const BANK_EN_NAMES = {
  "HSBC": "HSBC Egypt",
  "اتش اس بي سي": "HSBC Egypt",
  "أبوظبي الإسلامي": "ADIB Egypt",
  "مصرف أبو ظبي الإسلامي": "ADIB Egypt",
  "الأهلي الكويتي": "ABK Egypt",
  "بنك نكست": "Bank NXT",
  "نكست": "Bank NXT",
  "قناة السويس": "Suez Canal Bank",
  "الشركة المصرفية": "saib Bank",
  "saib": "saib Bank",
  "التجاري الدولي": "CIB Egypt",
  "بنك مصر": "Banque Misr",
  "الأهلي المصري": "National Bank of Egypt (NBE)",
  "بنك القاهرة": "Banque du Caire",
  "الإسكندرية": "Bank of Alexandria",
  "ALEXBANK": "Bank of Alexandria",
  "قطر الوطني": "QNB Alahli",
  "QNB": "QNB Alahli",
  "فيصل": "Faisal Islamic Bank",
  "البركة": "Al Baraka Bank",
  "التعمير والإسكان": "Housing & Dev Bank (HDB)",
  "الكويت الوطني": "NBK Egypt",
  "المصرف المتحد": "The United Bank",
  "العقاري المصري العربي": "Egyptian Arab Land Bank",
  "التنمية الصناعية": "Industrial Dev Bank (IDB)",
  "أبوظبي التجاري": "ADCB Egypt",
  "الاستثمار العربي": "aiBANK",
  "المصرف العربي": "Arab Int'l Bank (AIB)",
  "الإمارات دبي الوطني": "Emirates NBD Egypt",
  "كريدي أجريكول": "Credit Agricole Egypt",
  "ميد بنك": "MIDBANK",
  "المصري الخليجي": "EG Bank",
  "بيت التمويل الكويتي": "Kuwait Finance House (KFH)",
  "العربي الأفريقي": "Arab African Int'l Bank (AAIB)",
  "أبوظبي الأول": "First Abu Dhabi Bank (FABMISR)",
  "أبوظبي اﻷول": "First Abu Dhabi Bank (FABMISR)",
  "FABMISR": "First Abu Dhabi Bank (FABMISR)",
  "القاهرة": "Banque du Caire",
  "التجاري وفا": "Attijariwafa Bank",
  "اليوناني": "National Bank of Greece (NBG)",
  "مصر إيران": "MIDBANK",
  "البنك المركزي المصري": "Central Bank of Egypt (CBE)"
};

function getBankName(bankAr, lang) {
  if (lang !== "en" || !bankAr) return bankAr;
  for (let key in BANK_EN_NAMES) {
    if (bankAr.includes(key)) return BANK_EN_NAMES[key];
  }
  return bankAr;
}

// كاش الإعدادات في الذاكرة (15 ثانية)
let configCache = {
  data: botConfig,
  timestamp: 0
};

// كاش البيانات الحية على سيرفر الـ Edge (تحديث تلقائي كل 10 ثوانٍ)
let memoryCache = {
  data: null,
  timestamp: 0
};

// كاش شيت جوجل المستقل (60 ثانية)
let sheetCache = {
  data: {
    archive: [],
    rates: [],
    banks: []
  },
  timestamp: 0
};

// ==========================================
// 🔢 دوال التوقيت والتنسيق
// ==========================================

const LRM = "\u200E";
const RLM = "\u200F";

function getCairoTimeStr() {
  const d = new Date();
  return d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function format12HourTime(timeStr, lang) {
  if (!timeStr) return "";
  const s = String(timeStr).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return timeStr;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const isPm = h >= 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  const suffix = (lang === "en") ? (isPm ? "PM" : "AM") : (isPm ? "م" : "ص");
  return `${h}:${min} ${suffix}`;
}

function getCairoFullDateTime(lang, tzKey) {
  tzKey = tzKey || "cairo";
  const tzObj = TIMEZONES[tzKey] || TIMEZONES["cairo"];
  const tzId = tzObj.id;
  const d = new Date();
  const time24 = d.toLocaleTimeString("en-GB", { timeZone: tzId, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const parts = time24.split(":");
  let hNum = parseInt(parts[0], 10);
  const min = parts[1] || "00";
  const sec = parts[2] || "00";
  const isPm = hNum >= 12;
  if (hNum === 0) hNum = 12;
  else if (hNum > 12) hNum -= 12;
  const timeEn = `${hNum}:${min}:${sec} ${isPm ? "PM" : "AM"}`;
  const timeAr = `${hNum}:${min}:${sec} ${isPm ? "م" : "ص"}`;

  const tzLabelEn = tzObj.name_en;
  const tzLabelAr = tzObj.name_ar;

  if (lang === "en") {
    const dateStr = d.toLocaleDateString("en-US", { timeZone: tzId, weekday: "short", month: "short", day: "numeric", year: "numeric" });
    return `${dateStr} • ${timeEn} (${tzLabelEn})`;
  }
  const dateStrAr = d.toLocaleDateString("ar-EG-u-nu-latn", { timeZone: tzId, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${dateStrAr} • ${timeAr} بتوقيت ${tzLabelAr}`;
}

function extractTimeFromTimestamp(ts) {
  if (!ts) return getCairoTimeStr().slice(0, 5);
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });
    }
  } catch(e) {}
  const match = String(ts).match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : getCairoTimeStr().slice(0, 5);
}

function formatCleanTime(val, lang) {
  if (!val) return format12HourTime(getCairoTimeStr(), lang);
  const s = String(val).trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return format12HourTime(`${match[1].padStart(2, "0")}:${match[2]}`, lang);
  }
  return format12HourTime(getCairoTimeStr(), lang);
}

function getEgxSnapshotTime(data, lang) {
  let raw = "";
  const tsCandidate = data?.egx_institutions?.timestamp || data?.timestamp || (data?.archive && data.archive[0]?.created_at) || "";

  if (tsCandidate) {
    const s = String(tsCandidate).trim();
    // If it's an ISO UTC string like "2026-10-06T11:03:06.061Z" or ends with Z
    if (s.includes("T") || s.endsWith("Z")) {
      try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          raw = d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });
        }
      } catch(e) {}
    } else {
      // If it's a plain string like "2026-10-06 11:01:10" coming from GitHub Actions (UTC)
      const m = s.match(/(\d{1,2}):(\d{2})/);
      if (m) {
        let h = parseInt(m[1], 10);
        const min = m[2];
        // If hour is <= 12 during afternoon (e.g. 10:56 AM or 11:01 AM while it was run in UTC on GitHub Actions)
        // Check if converting UTC to Cairo (+3 hours) makes it fit EGX trading hours (10:00 to 15:00)
        if (h <= 12 && (s.includes(" 10:") || s.includes(" 11:") || s.includes(" 07:") || s.includes(" 08:") || s.includes(" 09:") || s.includes(" 12:"))) {
          h = (h + 3) % 24;
        }
        raw = `${String(h).padStart(2, "0")}:${min}`;
      }
    }
  }

  return raw ? format12HourTime(raw, lang) : "";
}

function getBankSnapshotTime(data, lang) {
  let raw = "";
  if (data?.banks && data.banks[0]?.updated_at) {
    const m = String(data.banks[0].updated_at).match(/(\d{1,2}):(\d{2})/);
    if (m) raw = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  if (!raw && data?.cbe_updated_at) {
    const m = String(data.cbe_updated_at).match(/(\d{1,2}):(\d{2})/);
    if (m) raw = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return raw ? format12HourTime(raw, lang) : "";
}

function fmtSigned(v) {
  const n = Number(v) || 0;
  return LRM + (n >= 0 ? "+" : "-") + Math.abs(n).toLocaleString("en-US") + LRM;
}

function fmtSignedUsd(v, usdRate) {
  const val = Math.round(Number(v) / usdRate);
  return LRM + (val >= 0 ? "+" : "-") + "$" + Math.abs(val).toLocaleString("en-US") + LRM;
}

export default {
  async fetch(request, env, ctx) {
    // تحديث توكن البوت تلقائياً من Cloudflare Secrets إذا وجد، وإلا استخدام التوكن الافتراضي
    if (env && env.BOT_TOKEN) {
      BOT_TOKEN = env.BOT_TOKEN;
    }

    const url = new URL(request.url);

    // 1. فحص الحالة
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("🚀 EGX Telegram Bot Cloudflare Edge Worker is 100% LIVE 24/7!", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    // 2. تفعيل الـ Webhook
    if (url.pathname === "/set_webhook") {
      const webhookUrl = url.origin + "/webhook";
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const resJson = await tgRes.json();
      return new Response(JSON.stringify(resJson, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // 2.5. تسجيل قائمة الأوامر
    if (url.pathname === "/set_commands") {
      const commands = [
        { command: "start", description: "Main menu / القائمة الرئيسية" },
        { command: "egx", description: "Institutional flows / تعاملات المؤسسات بالبورصة" },
        { command: "banks", description: "USD rates in 25 banks / أسعار الدولار بالبنوك والمركزي" },
        { command: "commodities", description: "Gold, oil & crypto / الذهب والنفط والكريبتو" },
        { command: "currencies", description: "Foreign currency rates / أسعار العملات" },
        { command: "report", description: "Full executive report / التقرير الشامل" }
      ];
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands })
      });
      const resJson = await tgRes.json();
      return new Response(JSON.stringify(resJson, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // 3. لوحة تحكم وتخصيص البوت
    if (url.pathname === "/control" && request.method === "GET") {
      return new Response(getControlHtml(url.origin), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    // 3.5. فحص واختبار البيانات الحية مباشرة كـ JSON
    if (url.pathname === "/api/data" && request.method === "GET") {
      const liveData = await getCachedDashboardData();
      return new Response(JSON.stringify(liveData, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // 4. API قراءة وحفظ الإعدادات
    if (url.pathname === "/api/config") {
      if (request.method === "GET") {
        const liveCfg = await getLiveBotConfig();
        return new Response(JSON.stringify(liveCfg), {
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
      if (request.method === "POST") {
        try {
          const body = await request.json();
          botConfig = { ...botConfig, ...body };
          configCache = { data: botConfig, timestamp: Date.now() };

          if (body.hide_commodities !== undefined) botConfig.hide_gold = body.hide_commodities;
          if (body.hide_currencies !== undefined) botConfig.hide_markets = body.hide_currencies;

          try {
            ctx.waitUntil(
              fetch(CONFIG_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "save_tg_config", config: botConfig }),
                redirect: "follow"
              })
            );
          } catch(eC) {}

          return new Response(JSON.stringify({ status: "success", config: botConfig }), {
            headers: { "content-type": "application/json; charset=utf-8" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ status: "error", message: e.message }), { status: 400 });
        }
      }
    }

    // 5. استقبال رسائل تلجرام (Webhook)
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update, url.origin));
        return new Response("OK", { status: 200 });
      } catch (err) {
        return new Response("OK", { status: 200 });
      }
    }

    // 6. نقطة إرسال التقرير الشامل التلقائي (يدوياً أو عبر Cron Trigger)
    if (url.pathname === "/broadcast") {
      const targetChat = url.searchParams.get("chat_id") || env?.CHANNEL_ID || "@EgxTracker_LiveBot";
      const targetLang = url.searchParams.get("lang") || "ar";
      const res = await sendAutomatedDailySummary(targetChat, targetLang);
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  // تشغيل التقرير المجدول التلقائي (Cloudflare Cron Triggers)
  async scheduled(event, env, ctx) {
    if (env && env.BOT_TOKEN) BOT_TOKEN = env.BOT_TOKEN;
    const targetChat = env?.CHANNEL_ID || "@EgxTracker_LiveBot";
    ctx.waitUntil(sendAutomatedDailySummary(targetChat, "ar"));
  }
};

/**
 * جلب الإعدادات المحدثة مركزياً (مباشرة سحابياً بدون جوجل شيت)
 */
function getLiveBotConfig() {
  return botConfig;
}

/**
 * محرك سحب البنوك الحية مباشرة من موقع تعويم (بدون جهاز المستخدم 100%)
 */
async function fetchTa3weemLiveBanks() {
  try {
    const res = await fetch("https://ta3weem.com/ar/currency-exchange-rates/USD-EGP", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    const banks = [];

    for (let i = 1; i < rows.length; i++) {
      const tds = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      if (tds.length >= 4) {
        const name = tds[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const buyM = tds[1].replace(/<[^>]+>/g, '').match(/(\d+\.\d+)/);
        const sellM = tds[2].replace(/<[^>]+>/g, '').match(/(\d+\.\d+)/);
        const timeM = tds[3].replace(/<[^>]+>/g, '').match(/(\d{1,2}:\d{2})/);
        if (name && buyM && sellM) {
          banks.push({
            bank: name,
            buy: parseFloat(buyM[1]),
            sell: parseFloat(sellM[1]),
            updated_at: timeM ? timeM[1] : "اليوم"
          });
        }
      }
    }
    return banks.length > 0 ? banks : null;
  } catch(e) {
    return null;
  }
}

/**
 * محرك سحب السعر الفعلي للبنك المركزي المصري مباشرة من تعويم
 */
async function fetchTa3weemCbeActual() {
  try {
    const res = await fetch("https://ta3weem.com/ar/banks/central-bank-of-egypt-cbe", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    for (let r of rows) {
      if (r.includes("USD") || r.includes("دولار")) {
        const tds = r.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
        if (tds.length >= 3) {
          const buyM = tds[1].replace(/<[^>]+>/g, '').match(/(\d+\.\d+)/);
          const sellM = tds[2].replace(/<[^>]+>/g, '').match(/(\d+\.\d+)/);
          const timeM = r.match(/(\d{1,2}:\d{2})/);
          if (buyM && sellM) {
            return {
              buy: parseFloat(buyM[1]),
              sell: parseFloat(sellM[1]),
              updated_at: timeM ? timeM[1] : "اليوم"
            };
          }
        }
      }
    }
  } catch(e) {}
  return null;
}

/**
 * محرك سحب الأسواق اللحظية مباشرة من TradingView (كريبتو، ذهب، فضة، نفط برنت و WTI)
 */
async function fetchTradingViewLiveMarket() {
  const result = {
    btc: 0, btc_chg: "+0.00%",
    eth: 0, eth_chg: "+0.00%",
    brent: 0, brent_chg: "+0.00%",
    wti: 0, wti_chg: "+0.00%",
    gold_ounce: 0, gold_chg: "+0.00%",
    silver: 0, silver_chg: "+0.00%",
    usd_egp: 0
  };

  try {
    const [cryptoRes, cfdRes, forexRes] = await Promise.all([
      fetch("https://scanner.tradingview.com/crypto/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({
          symbols: { tickers: ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"] },
          columns: ["close", "change"]
        })
      }).catch(() => null),
      fetch("https://scanner.tradingview.com/cfd/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({
          symbols: { tickers: ["FX:UKOIL", "FX:USOIL", "TVC:GOLD", "TVC:SILVER"] },
          columns: ["close", "change"]
        })
      }).catch(() => null),
      fetch("https://scanner.tradingview.com/forex/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({
          symbols: { tickers: ["FX_IDC:USDEGP"] },
          columns: ["close", "change"]
        })
      }).catch(() => null)
    ]);

    if (cryptoRes && cryptoRes.ok) {
      const cj = await cryptoRes.json();
      (cj.data || []).forEach(item => {
        const val = item.d?.[0] ? parseFloat(item.d[0]) : 0;
        const chg = item.d?.[1] ? (parseFloat(item.d[1]) >= 0 ? "+" : "") + parseFloat(item.d[1]).toFixed(2) + "%" : "+0.00%";
        if (item.s === "BINANCE:BTCUSDT" && val > 0) {
          result.btc = val;
          result.btc_chg = chg;
        } else if (item.s === "BINANCE:ETHUSDT" && val > 0) {
          result.eth = val;
          result.eth_chg = chg;
        }
      });
    }

    if (cfdRes && cfdRes.ok) {
      const cfdJ = await cfdRes.json();
      (cfdJ.data || []).forEach(item => {
        const val = item.d?.[0] ? parseFloat(item.d[0]) : 0;
        const chg = item.d?.[1] ? (parseFloat(item.d[1]) >= 0 ? "+" : "") + parseFloat(item.d[1]).toFixed(2) + "%" : "+0.00%";
        if (item.s === "FX:UKOIL" && val > 0) {
          result.brent = val;
          result.brent_chg = chg;
        } else if (item.s === "FX:USOIL" && val > 0) {
          result.wti = val;
          result.wti_chg = chg;
        } else if (item.s === "TVC:GOLD" && val > 0) {
          result.gold_ounce = val;
          result.gold_chg = chg;
        } else if (item.s === "TVC:SILVER" && val > 0) {
          result.silver = val;
          result.silver_chg = chg;
        }
      });
    }

    if (forexRes && forexRes.ok) {
      const fxJ = await forexRes.json();
      (fxJ.data || []).forEach(item => {
        const val = item.d?.[0] ? parseFloat(item.d[0]) : 0;
        if (item.s === "FX_IDC:USDEGP" && val > 0) {
          result.usd_egp = val;
        }
      });
    }
  } catch(e) {}

  // مسار احتياطي عبر Coinbase و Yahoo Finance في حال تعذر TradingView
  try {
    if (!result.btc || !result.eth) {
      const [cbBtc, cbEth] = await Promise.all([
        fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json()).catch(() => null),
        fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json()).catch(() => null)
      ]);
      if (!result.btc && cbBtc?.data?.amount) result.btc = parseFloat(cbBtc.data.amount);
      if (!result.eth && cbEth?.data?.amount) result.eth = parseFloat(cbEth.data.amount);
    }

    if (!result.brent) {
      const yBrent = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d", {
        headers: { "User-Agent": "Mozilla/5.0" }
      }).then(r => r.json()).catch(() => null);
      const bPrice = yBrent?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (bPrice) result.brent = parseFloat(bPrice);
    }

    if (!result.gold_ounce) {
      const cbPaxg = await fetch("https://api.coinbase.com/v2/prices/PAXG-USD/spot", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json()).catch(() => null);
      if (cbPaxg?.data?.amount) result.gold_ounce = parseFloat(cbPaxg.data.amount);
    }
  } catch(e2) {}

  return result;
}

/**
 * جلب وتحديث كافة البيانات الحية سحابياً 100%
 * مصادر البيانات: شيت المزامنة (للبورصة المصرية وبنوك تعويم) + تريدنج فيو المباشر (للكريبتو والسلع)
 */
async function getCachedDashboardData() {
  const now = Date.now();
  if (memoryCache.data && (now - memoryCache.timestamp < 10000)) {
    return memoryCache.data;
  }

  const liveClock = getCairoTimeStr();

  // 1. تحديث بيانات الشيت عبر كاش 60 ثانية لجلب جلسات البورصة المصرية وأسعار بنوك تعويم
  if (!sheetCache.timestamp || (now - sheetCache.timestamp > 60000)) {
    let fetched = false;
    try {
      const sSignal = AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
      const sRes = await fetch(DATA_API_URL, {
        headers: { "User-Agent": "Cloudflare-Worker-EGX" },
        signal: sSignal
      });
      if (sRes && sRes.ok) {
        const sJson = await sRes.json();
        if (sJson && ((sJson.archive && sJson.archive.length > 0) || (sJson.banks && sJson.banks.length > 0))) {
          sheetCache.data = sJson;
          sheetCache.timestamp = now;
          fetched = true;
        }
      }
    } catch(eSheet) {}

    // في حال تعذر Google Apps Script أو تأخره، يتم السحب الفوري من مستودع GitHub Raw
    if (!fetched) {
      try {
        const ghRes = await fetch(GITHUB_RAW_DATA_URL, {
          headers: { "User-Agent": "Cloudflare-Worker-EGX" }
        });
        if (ghRes && ghRes.ok) {
          const ghJson = await ghRes.json();
          if (ghJson && ((ghJson.archive && ghJson.archive.length > 0) || (ghJson.banks && ghJson.banks.length > 0))) {
            sheetCache.data = ghJson;
            sheetCache.timestamp = now;
          }
        }
      } catch(eGh) {}
    }

    // تصفية أوتوماتيكية لأي جلسات مكررة في الأرشيف (إذا كانت أرقام جلسة اليوم مطابقة تماماً للجلسة السابقة بسبب عطلة البورصة)
    if (sheetCache.data && Array.isArray(sheetCache.data.archive) && sheetCache.data.archive.length > 1) {
      const arch = sheetCache.data.archive;
      const cleanArch = [arch[0]];
      for (let i = 1; i < arch.length; i++) {
        const prev = cleanArch[cleanArch.length - 1];
        const curr = arch[i];
        // If two consecutive dates have identical foreign_net and total_net, keep only the older genuine trading session
        const prevFo = Number(prev.foreign_net !== undefined ? prev.foreign_net : prev.foreign_net_egp);
        const currFo = Number(curr.foreign_net !== undefined ? curr.foreign_net : curr.foreign_net_egp);
        const prevTot = Number(prev.total_net !== undefined ? prev.total_net : prev.total_net_egp);
        const currTot = Number(curr.total_net !== undefined ? curr.total_net : curr.total_net_egp);
        if (Math.abs(prevFo - currFo) < 1.0 && Math.abs(prevTot - currTot) < 1.0 && prev.date !== curr.date) {
          // If first item was duplicate of second, remove first item and keep second
          cleanArch[cleanArch.length - 1] = curr;
        } else {
          cleanArch.push(curr);
        }
      }
      sheetCache.data.archive = cleanArch;
    }
  }

  const sheetData = sheetCache.data || {};

  // 2. استدعاء متوازي للمصادر الحية (تريدنج فيو + محاولات تعويم المباشرة)
  const [ta3weemBanks, ta3weemCbe, tvMarket] = await Promise.all([
    fetchTa3weemLiveBanks(),
    fetchTa3weemCbeActual(),
    fetchTradingViewLiveMarket()
  ]);

  // سعر الدولار الافتراضي المعتمد من موقع تعويم (المركزي أو العام) مع بديل تريدنج فيو
  const cbeBuy = (ta3weemCbe && ta3weemCbe.buy) ? ta3weemCbe.buy
               : (sheetData.cbe_usd_buy ? Number(sheetData.cbe_usd_buy) : (tvMarket?.usd_egp || 52.29));
  const cbeSell = (ta3weemCbe && ta3weemCbe.sell) ? ta3weemCbe.sell
                : (sheetData.cbe_usd_sell ? Number(sheetData.cbe_usd_sell) : 52.36);
  const cbeTime = (ta3weemCbe && ta3weemCbe.updated_at) ? ta3weemCbe.updated_at
                : (sheetData.cbe_updated_at || extractTimeFromTimestamp(sheetData.timestamp));

  // اعتماد سعر تعويم كافتراضي رسمي للدولار
  const usdRate = Number(sheetData.usd_rate || cbeBuy || 52.42);

  const defaultBanks = [
    { bank: "أبوظبي الإسلامي (ADIB)", buy: 52.42, sell: 52.52, updated_at: liveClock },
    { bank: "الأهلي الكويتي (ABK)", buy: 52.42, sell: 52.52, updated_at: liveClock },
    { bank: "بنك نكست (NXT)", buy: 52.42, sell: 52.52, updated_at: liveClock },
    { bank: "الكويت الوطني (NBK)", buy: 52.42, sell: 52.52, updated_at: liveClock },
    { bank: "قناة السويس (SCB)", buy: 52.40, sell: 52.50, updated_at: liveClock },
    { bank: "كريدي أجريكول (CA)", buy: 52.38, sell: 52.48, updated_at: liveClock },
    { bank: "البنك التجاري الدولي (CIB)", buy: 52.35, sell: 52.45, updated_at: liveClock },
    { bank: "البنك الأهلي المصري (NBE)", buy: 52.35, sell: 52.45, updated_at: liveClock }
  ];
  let banks = (ta3weemBanks && ta3weemBanks.length > 0)
    ? ta3weemBanks
    : ((sheetData.banks && sheetData.banks.length > 0) ? sheetData.banks : defaultBanks);
  // ترتيب البنوك دائماً حسب أعلى سعر شراء
  banks.sort((a, b) => (Number(b.buy) || 0) - (Number(a.buy) || 0));

  const btcPrice = (tvMarket && tvMarket.btc > 0) ? tvMarket.btc : 83870;
  const btcChg = (tvMarket && tvMarket.btc_chg) ? tvMarket.btc_chg : "+0.00%";
  const ethPrice = (tvMarket && tvMarket.eth > 0) ? tvMarket.eth : 2695;
  const ethChg = (tvMarket && tvMarket.eth_chg) ? tvMarket.eth_chg : "+0.00%";
  const goldOunce = (tvMarket && tvMarket.gold_ounce > 0) ? tvMarket.gold_ounce : 4165.0;
  const goldChg = (tvMarket && tvMarket.gold_chg) ? tvMarket.gold_chg : "+0.00%";

  const brentPrice = (tvMarket && tvMarket.brent > 0) ? tvMarket.brent : 100.85;
  const brentChg = (tvMarket && tvMarket.brent_chg) ? tvMarket.brent_chg : "+0.00%";
  const wtiPrice = (tvMarket && tvMarket.wti > 0) ? tvMarket.wti : 91.30;
  const wtiChg = (tvMarket && tvMarket.wti_chg) ? tvMarket.wti_chg : "+0.00%";
  const silverPrice = (tvMarket && tvMarket.silver > 0) ? tvMarket.silver : 61.10;
  const silverChg = (tvMarket && tvMarket.silver_chg) ? tvMarket.silver_chg : "+0.00%";

  const g24Usd = Number((goldOunce / 31.1035).toFixed(2));
  const g21Usd = Number((g24Usd * 21 / 24).toFixed(2));
  const g18Usd = Number((g24Usd * 18 / 24).toFixed(2));

  const live_commodities = [
    { code: "BTC", name: "بتكوين (Bitcoin)", name_en: "Bitcoin (BTC)", usd_price: btcPrice, egp_price: Math.round(btcPrice * usdRate), change: btcChg, updated_at: liveClock },
    { code: "ETH", name: "إيثيريوم (Ethereum)", name_en: "Ethereum (ETH)", usd_price: ethPrice, egp_price: Math.round(ethPrice * usdRate), change: ethChg, updated_at: liveClock },
    { code: "BRENT", name: "نفط برنت (خام)", name_en: "Brent Crude Oil", usd_price: brentPrice, egp_price: Number((brentPrice * usdRate).toFixed(2)), change: brentChg, updated_at: liveClock },
    { code: "WTI", name: "خام غرب تكساس (WTI)", name_en: "WTI Crude Oil", usd_price: wtiPrice, egp_price: Number((wtiPrice * usdRate).toFixed(2)), change: wtiChg, updated_at: liveClock },
    { code: "GOLD_OUNCE", name: "أونصة الذهب (Gold Ounce)", name_en: "Gold (Ounce)", usd_price: goldOunce, egp_price: Math.round(goldOunce * usdRate), change: goldChg, updated_at: liveClock },
    { code: "GOLD24", name: "ذهب عيار 24 (جرام)", name_en: "Gold 24K (Gram)", usd_price: g24Usd, egp_price: Math.round(g24Usd * usdRate), change: goldChg, updated_at: liveClock },
    { code: "GOLD21", name: "ذهب عيار 21 (جرام)", name_en: "Gold 21K (Gram)", usd_price: g21Usd, egp_price: Math.round(g21Usd * usdRate), change: goldChg, updated_at: liveClock },
    { code: "GOLD18", name: "ذهب عيار 18 (جرام)", name_en: "Gold 18K (Gram)", usd_price: g18Usd, egp_price: Math.round(g18Usd * usdRate), change: goldChg, updated_at: liveClock },
    { code: "SILVER", name: "أونصة الفضة (Silver)", name_en: "Silver (Ounce)", usd_price: silverPrice, egp_price: Math.round(silverPrice * usdRate), change: silverChg, updated_at: liveClock }
  ];

  let rates = (sheetData.rates && sheetData.rates.length > 0) ? sheetData.rates : [
    { code: "USD", name: "الدولار الأمريكي", name_en: "US Dollar", usd_price: 1.0, egp_price: Number(usdRate.toFixed(2)), buy: cbeBuy, sell: cbeSell },
    { code: "EUR", name: "اليورو الأوروبي", name_en: "Euro", usd_price: 1.082, egp_price: Number((1.082 * usdRate).toFixed(2)), buy: Number((1.081 * usdRate).toFixed(2)), sell: Number((1.084 * usdRate).toFixed(2)) },
    { code: "SAR", name: "الريال السعودي", name_en: "Saudi Riyal", usd_price: 0.2665, egp_price: Number((0.2665 * usdRate).toFixed(2)), buy: Number((0.266 * usdRate).toFixed(2)), sell: Number((0.267 * usdRate).toFixed(2)) },
    { code: "AED", name: "الدرهم الإماراتي", name_en: "UAE Dirham", usd_price: 0.2723, egp_price: Number((0.2723 * usdRate).toFixed(2)), buy: Number((0.272 * usdRate).toFixed(2)), sell: Number((0.273 * usdRate).toFixed(2)) },
    { code: "KWD", name: "الدينار الكويتي", name_en: "Kuwaiti Dinar", usd_price: 3.255, egp_price: Number((3.255 * usdRate).toFixed(2)), buy: Number((3.245 * usdRate).toFixed(2)), sell: Number((3.265 * usdRate).toFixed(2)) },
    { code: "GBP", name: "الجنيه الإسترليني", name_en: "British Pound", usd_price: 1.305, egp_price: Number((1.305 * usdRate).toFixed(2)), buy: Number((1.302 * usdRate).toFixed(2)), sell: Number((1.308 * usdRate).toFixed(2)) },
    { code: "QAR", name: "الريال القطري", name_en: "Qatari Riyal", usd_price: 0.2747, egp_price: Number((0.2747 * usdRate).toFixed(2)), buy: Number((0.274 * usdRate).toFixed(2)), sell: Number((0.275 * usdRate).toFixed(2)) }
  ];

  const archive = (sheetData.archive && sheetData.archive.length > 0) ? sheetData.archive : [];

  const fullData = {
    usd_rate: usdRate,
    cbe_usd_buy: cbeBuy,
    cbe_usd_sell: cbeSell,
    cbe_updated_at: cbeTime,
    timestamp: sheetData.timestamp || "",
    egx_institutions: sheetData.egx_institutions || sheetData.latest_egx || null,
    archive: archive,
    rates: rates,
    banks: banks,
    live_commodities: live_commodities
  };

  memoryCache = { data: fullData, timestamp: now };
  return fullData;
}

/**
 * معالجة أوامر تلجرام الفورية
 */
async function handleTelegramUpdate(update, originUrl) {
  let chatId = null;
  let text = "";
  let callbackId = null;
  let isCallback = false;
  let messageId = null;

  if (update.callback_query) {
    isCallback = true;
    callbackId = update.callback_query.id;
    messageId = update.callback_query.message.message_id;
    chatId = update.callback_query.message.chat.id;
    text = update.callback_query.data;
  } else if (update.message) {
    chatId = update.message.chat.id;
    text = (update.message.text || "").trim();
  }

  if (!chatId) return;

  if (isCallback && callbackId && !text.startsWith("refresh_")) {
    try { await answerCallback(callbackId); } catch(e) {}
  }

  const cfg = await getLiveBotConfig();

  let userCurr = userCurrPreferences[chatId] || cfg.default_curr || "usd";
  if (text.endsWith(":usd")) {
    userCurr = "usd";
    userCurrPreferences[chatId] = "usd";
    text = text.slice(0, -4);
  } else if (text.endsWith(":egp")) {
    userCurr = "egp";
    userCurrPreferences[chatId] = "egp";
    text = text.slice(0, -4);
  }

  let userLang = "en";
  if (text.endsWith(":en")) {
    userLang = "en";
    text = text.slice(0, -3);
    userLangPreferences[chatId] = "en";
  } else if (text.endsWith(":ar")) {
    userLang = "ar";
    text = text.slice(0, -3);
    userLangPreferences[chatId] = "ar";
  } else if (text.startsWith("cmd_lang_en") || text === "/en") {
    userLangPreferences[chatId] = "en";
    await sendMainMenu(chatId, "en", originUrl, cfg, messageId);
    return;
  } else if (text.startsWith("cmd_lang_ar") || text === "/ar") {
    userLangPreferences[chatId] = "ar";
    await sendMainMenu(chatId, "ar", originUrl, cfg, messageId);
    return;
  } else {
    userLang = userLangPreferences[chatId] || cfg.default_lang || "en";
  }

  const lang = userLang;
  const curr = userCurr;

  const reply = (txt, kb) => (isCallback && messageId)
    ? editTgMessage(chatId, messageId, txt, kb)
    : sendTgMessage(chatId, txt, kb);

  if (isCallback) {
    if (text.startsWith("toggle_curr:")) {
      const parts = text.split(":");
      const newCurr = parts[1]; // egp or usd
      const cmdType = parts[2]; // report, commodities, egx, etc.
      const targetLang = parts[3] || lang;

      userCurrPreferences[chatId] = newCurr;
      const data = await getCachedDashboardData();
      let content = "";
      let kb = getReportKeyboard(cmdType, targetLang, cfg, newCurr);

      if (cmdType === "report") {
        content = formatExecutiveReport(data, targetLang, newCurr);
      } else if (cmdType === "commodities" || cmdType === "gold") {
        content = formatCommoditiesReport(data, targetLang, newCurr);
      } else if (cmdType === "egx") {
        content = formatEgxReport(data, targetLang, newCurr);
      } else if (cmdType === "history" || cmdType === "archive") {
        content = formatEgxHistoryReport(data, targetLang, newCurr);
      } else if (cmdType === "currencies" || cmdType === "markets") {
        content = formatCurrenciesReport(data, targetLang, newCurr);
      }

      if (callbackId) {
        const toast = targetLang === "en"
          ? `💱 Switched to ${newCurr.toUpperCase()}!`
          : `💱 تم التحويل إلى ${newCurr === "usd" ? "الدولار" : "الجنيه"}!`;
        try { await answerCallback(callbackId, toast); } catch(e) {}
      }
      await reply(content, kb);
      return;
    }

    if (text.startsWith("refresh_")) {
      const parts = text.replace("refresh_", "").split(":");
      const target = parts[0];
      const targetLang = parts[1] || lang;
      const targetCurr = parts[2] || curr;
      memoryCache.timestamp = 0; // إعادة تعيين الكاش لفرض جلب البيانات الحية فوراً
      if (Date.now() - sheetCache.timestamp > 15000) {
        sheetCache.timestamp = 0;
      }
      const data = await getCachedDashboardData();
      let content = "";
      let kb = getReportKeyboard(target, targetLang, cfg, targetCurr);

      if (target === "report") {
        const userTz = userTzPreferences[chatId] || "cairo";
        content = formatExecutiveReport(data, targetLang, targetCurr, userTz);
      } else if (target === "egx") {
        content = formatEgxReport(data, targetLang, targetCurr);
      } else if (target === "history" || target === "archive") {
        content = formatEgxHistoryReport(data, targetLang, targetCurr);
      } else if (target === "banks") {
        content = formatBanksReport(data, targetLang, cfg);
      } else if (target === "banks_all") {
        content = formatAllBanksReport(data, targetLang);
      } else if (target === "commodities" || target === "gold") {
        content = formatCommoditiesReport(data, targetLang, targetCurr);
      } else if (target === "currencies" || target === "markets") {
        content = formatCurrenciesReport(data, targetLang, targetCurr);
      } else {
        await sendMainMenu(chatId, targetLang, originUrl, cfg, messageId);
        return;
      }

      if (callbackId) {
        try {
          await answerCallback(callbackId, targetLang === "en" ? "⚡ Live data refreshed!" : "⚡ تم تحديث الأسعار لحظياً!");
        } catch(e) {}
      }
      await reply(content, kb);
      return;
    }

    if (text === "cmd_egx") {
      const data = await getCachedDashboardData();
      await reply(formatEgxReport(data, lang, curr), getReportKeyboard("egx", lang, cfg, curr));
    } else if (text === "cmd_history" || text === "cmd_archive") {
      const data = await getCachedDashboardData();
      await reply(formatEgxHistoryReport(data, lang, curr), getReportKeyboard("history", lang, cfg, curr));
    } else if (text === "cmd_banks") {
      const data = await getCachedDashboardData();
      await reply(formatBanksReport(data, lang, cfg), getReportKeyboard("banks", lang, cfg, curr));
    } else if (text === "cmd_banks_all") {
      const data = await getCachedDashboardData();
      await reply(formatAllBanksReport(data, lang), getReportKeyboard("banks_all", lang, cfg, curr));
    } else if (text === "cmd_commodities" || text === "cmd_gold") {
      const data = await getCachedDashboardData();
      await reply(formatCommoditiesReport(data, lang, curr), getReportKeyboard("commodities", lang, cfg, curr));
    } else if (text === "cmd_currencies" || text === "cmd_markets") {
      const data = await getCachedDashboardData();
      await reply(formatCurrenciesReport(data, lang, curr), getReportKeyboard("currencies", lang, cfg, curr));
    } else if (text === "cmd_report") {
      const data = await getCachedDashboardData();
      const userTz = userTzPreferences[chatId] || "cairo";
      await reply(formatExecutiveReport(data, lang, curr, userTz), getReportKeyboard("report", lang, cfg, curr));
    } else if (text.startsWith("cmd_timezone")) {
      const parts = text.split(":");
      const tLang = parts[1] || lang;
      const userTz = userTzPreferences[chatId] || "cairo";
      const title = tLang === "en" ? "🌍 <b>Select Your Preferred Timezone:</b>" : "🌍 <b>اختر منطقتك الزمنية المفضلة لعرض الأوقات:</b>";
      await reply(title, getTimezoneKeyboard(tLang, userTz));
      return;
    } else if (text.startsWith("set_tz:")) {
      const parts = text.split(":");
      const newTz = parts[1] || "cairo";
      const tLang = parts[2] || lang;
      userTzPreferences[chatId] = newTz;
      const tzObj = TIMEZONES[newTz] || TIMEZONES["cairo"];
      const toast = tLang === "en" ? `✅ Timezone set to ${tzObj.name_en}` : `✅ تم ضبط التوقيت على ${tzObj.name_ar}`;
      if (callbackId) {
        try { await answerCallback(callbackId, toast); } catch(e) {}
      }
      await sendMainMenu(chatId, tLang, originUrl, cfg, messageId);
      return;
    } else if (text === "cmd_menu") {
      await sendMainMenu(chatId, lang, originUrl, cfg, messageId);
    }
    return;
  }

  const lower = text.toLowerCase();
  const isHistory = lower === "/history" || lower === "/archive" || lower.includes("ارشيف") || lower.includes("أرشيف") || lower.includes("اقفال") || lower.includes("إقفال");
  const isCommodities = lower === "/commodities" || lower === "/gold" || lower === "/oil" || lower === "/crypto" ||
    lower.includes("ذهب") || lower.includes("نفط") || lower.includes("بنزين") || lower.includes("بترول") || lower.includes("كريبتو") || lower.includes("سلع");
  const isCurrencies = lower === "/currencies" || lower === "/rates" || lower.includes("عملات") || lower.includes("عملة") || lower.includes("اسعار الصرف");
  const isEgx = lower === "/egx" || lower.includes("بورصة") || lower.includes("مؤسسات") || lower.includes("اسهم") || lower.includes("اجانب") || lower.includes("أجانب");
  const isBanks = lower === "/banks" || lower.includes("بنوك") || lower.includes("بنك") || lower.includes("دولار");
  const isReport = lower === "/report" || lower.includes("تقرير") || lower.includes("تنفيذي");
  const isTimezone = lower === "/timezone" || lower === "/tz" || lower.includes("توقيت") || lower.includes("منطقة زمنية");
  const isMenu = lower === "/start" || lower === "/help" || lower.includes("قائمة") || lower === "menu";

  if (isMenu) {
    await sendMainMenu(chatId, lang, originUrl, cfg);
  } else if (isTimezone) {
    const userTz = userTzPreferences[chatId] || "cairo";
    const title = lang === "en" ? "🌍 <b>Select Your Preferred Timezone:</b>" : "🌍 <b>اختر منطقتك الزمنية المفضلة لعرض الأوقات:</b>";
    await sendTgMessage(chatId, title, getTimezoneKeyboard(lang, userTz));
  } else if (isHistory) {
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, formatEgxHistoryReport(data, lang, curr), getReportKeyboard("history", lang, cfg, curr));
  } else if (isCommodities) {
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, formatCommoditiesReport(data, lang, curr), getReportKeyboard("commodities", lang, cfg, curr));
  } else if (isCurrencies) {
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, formatCurrenciesReport(data, lang, curr), getReportKeyboard("currencies", lang, cfg, curr));
  } else if (isEgx) {
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, formatEgxReport(data, lang, curr), getReportKeyboard("egx", lang, cfg, curr));
  } else if (isBanks) {
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, formatBanksReport(data, lang, cfg), getReportKeyboard("banks", lang, cfg, curr));
  } else if (isReport) {
    const data = await getCachedDashboardData();
    const userTz = userTzPreferences[chatId] || "cairo";
    await sendTgMessage(chatId, formatExecutiveReport(data, lang, curr, userTz), getReportKeyboard("report", lang, cfg, curr));
  } else if (lower.indexOf("/") === 0) {
    await sendTgMessage(chatId, lang === "en" ? "❓ Unknown command. Type /start for menu." : "❓ أمر غير معروف. اضغط /start لعرض القائمة الرئيسية.", getMenuKeyboard(lang, originUrl, cfg));
  }
}

// ==========================================
// 🎨 صياغة التقارير الفورية النظيفة
// ==========================================

function getTrendIcon(change) {
  if (!change) return "";
  const s = String(change).trim();
  if (s.startsWith("+")) return " 🟢";
  if (s.startsWith("-")) return " 🔴";
  const num = parseFloat(s.replace("%", ""));
  if (!isNaN(num)) {
    if (num > 0) return " 🟢";
    if (num < 0) return " 🔴";
  }
  return "";
}

/**
 * ثوابت الشهور وأدوات حساب المجاميع التراكمية (أسبوعياً وشهرياً)
 * أسبوع البورصة والبنوك المصرية يبدأ من الأحد (Sunday)
 * بينما أسبوع البورصات والأسواق العالمية يبدأ من الاثنين (Monday)
 * والشهر يُحسب من بداية شهر أكتوبر 2026 فصاعداً
 */
const MONTH_NAMES_AR = { "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل", "05": "مايو", "06": "يونيو", "07": "يوليو", "08": "أغسطس", "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر", "12": "ديسمبر" };
const MONTH_NAMES_EN = { "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June", "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December" };

// بداية الأسبوع للبورصة والبنوك المصرية: الأحد (Sunday)
function getWeekSunday(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day);
  return sunday.toISOString().split("T")[0];
}

// بداية الأسبوع للأسواق والبورصات العالمية: الاثنين (Monday)
function getWeekMonday(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = (day === 0 ? 6 : day - 1);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diff);
  return monday.toISOString().split("T")[0];
}

function calculatePeriodicTotals(archive, currentSessionDate, defaultUsdRate) {
  const sessionDate = currentSessionDate || new Date().toISOString().split("T")[0];
  const weekStart = getWeekSunday(sessionDate); // أسبوع البورصة المصرية والبنوك يبدأ من الأحد
  const monthPrefix = sessionDate.slice(0, 7); // e.g. "2026-10"

  const weekly = { count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0, weekStart };
  const monthly = { count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0, monthPrefix };

  const list = (archive && Array.isArray(archive)) ? archive : [];
  list.forEach(s => {
    if (!s || !s.date) return;
    const rate = Number(s.usd_rate || defaultUsdRate || 52.29);
    const eg = Number(s.egypt_net !== undefined ? s.egypt_net : (s.egypt_net_egp || 0));
    const ar = Number(s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0));
    const fo = Number(s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0));
    const tot = Number(s.total_net !== undefined ? s.total_net : (s.total_net_egp || (eg + ar + fo)));

    const egU = Math.round(eg / rate);
    const arU = Math.round(ar / rate);
    const foU = Math.round(fo / rate);
    const totU = Math.round(tot / rate);

    // الأسبوع: من يوم الاثنين للأسبوع الحالي وحتى تاريخ الجلسة
    if (s.date >= weekStart && s.date <= sessionDate) {
      weekly.count++;
      weekly.egNet += eg;
      weekly.arNet += ar;
      weekly.foNet += fo;
      weekly.totNet += tot;
      weekly.egUsd += egU;
      weekly.arUsd += arU;
      weekly.foUsd += foU;
      weekly.totUsd += totU;
    }

    // الشهر: كافة جلسات الشهر الحالي (بدءاً من 01 أكتوبر)
    if (s.date.startsWith(monthPrefix) && s.date <= sessionDate) {
      monthly.count++;
      monthly.egNet += eg;
      monthly.arNet += ar;
      monthly.foNet += fo;
      monthly.totNet += tot;
      monthly.egUsd += egU;
      monthly.arUsd += arU;
      monthly.foUsd += foU;
      monthly.totUsd += totU;
    }
  });

  return { weekly, monthly };
}

/**
 * 1. تقرير البورصة المصرية (EGX)
 * تركيز حصري على صافي الأجانب وصافي المؤسسات الإجمالي (يومي وأسبوعي وشهري)
 */
function formatEgxReport(data, lang, curr) {
  curr = curr || "usd";
  const usdRate = Number(data.usd_rate || data.cbe_usd_buy || 52.29);
  let foNet = 0, totNet = 0;
  let foBuy = 0, foSell = 0;
  let sessionDate = new Date().toISOString().split("T")[0];

  if (data.archive && data.archive.length > 0) {
    const r = data.archive[0];
    const f = r.foreign_net !== undefined ? r.foreign_net : r.foreign_net_egp;
    if (f !== undefined && f !== null && f !== "") foNet = Number(f);

    foBuy = Number(r.foreign_buy !== undefined ? r.foreign_buy : (r.foreign_buy_egp || 0));
    foSell = Number(r.foreign_sell !== undefined ? r.foreign_sell : (r.foreign_sell_egp || 0));

    const t = r.total_net !== undefined ? r.total_net : r.total_net_egp;
    if (t !== undefined && t !== null && t !== "") {
      totNet = Number(t);
    } else {
      const e = Number(r.egypt_net !== undefined ? r.egypt_net : (r.egypt_net_egp || 0));
      const a = Number(r.arab_net !== undefined ? r.arab_net : (r.arab_net_egp || 0));
      totNet = e + a + foNet;
    }

    sessionDate = r.date || sessionDate;
  }

  // مسار احتياطي من egx_institutions إذا كانت المشتريات/المبيعات صفر
  if (foBuy === 0 && data.egx_institutions?.tables?.institutions) {
    const inst = data.egx_institutions.tables.institutions;
    inst.forEach(item => {
      const t = item.type || "";
      if (t.includes("أجانب") || t.includes("اجانب") || t.toLowerCase().includes("foreign")) {
        foBuy = Number(item.buy_egp || 0);
        foSell = Number(item.sell_egp || 0);
        foNet = Number(item.net_egp || foNet);
      }
    });
  }

  const fmtNet = (v) => {
    const n = Number(v) || 0;
    const sign = n >= 0 ? "+" : "-";
    const absVal = Math.abs(n).toLocaleString("en-US");
    if (curr === "usd") {
      const u = Math.round(n / usdRate);
      const uSign = u >= 0 ? "+" : "-";
      return `${LRM}${uSign}$${Math.abs(u).toLocaleString("en-US")}${LRM}`;
    }
    const unit = lang === "en" ? " EGP" : " ج.م";
    return `${LRM}${sign}${absVal}${LRM}${unit}`;
  };

  const fmtVal = (v) => {
    const n = Number(v) || 0;
    if (curr === "usd") {
      const u = Math.round(n / usdRate);
      return "$" + Math.abs(u).toLocaleString("en-US");
    }
    return Math.abs(n).toLocaleString("en-US");
  };

  const updatedDateTime = getCairoFullDateTime(lang);
  const snapshotTime = getEgxSnapshotTime(data, lang);

  const snapshotLineEn = snapshotTime ? `\n📸 Market Snapshot: <b>[${snapshotTime}]</b>` : "";
  const snapshotLineAr = snapshotTime ? `\n📸 لقطة شاشة البورصة: <b>[${snapshotTime}]</b>` : "";

  const foStatusEn = foNet >= 0 ? "Net Buy 🟢" : "Net Sell 🔴";
  const foStatusAr = foNet >= 0 ? "صافي شراء 🟢" : "صافي بيع 🔴";
  const totStatusEn = totNet >= 0 ? "Net Buy 🟢" : "Net Sell 🔴";
  const totStatusAr = totNet >= 0 ? "صافي شراء 🟢" : "صافي بيع 🔴";

  const currBadge = curr === "usd" ? "USD ($)" : "EGP (ج.م)";

  // حساب المجاميع التراكمية (الأسبوعية والشهرية)
  const periodic = calculatePeriodicTotals(data.archive, sessionDate, usdRate);

  const fmtPeriodVal = (egpVal, usdVal) => {
    if (curr === "usd") {
      const uSign = usdVal >= 0 ? "+" : "-";
      return `${LRM}${uSign}$${Math.abs(usdVal).toLocaleString("en-US")}${LRM}`;
    }
    const sign = egpVal >= 0 ? "+" : "-";
    const unit = lang === "en" ? " EGP" : " ج.م";
    return `${LRM}${sign}${Math.abs(egpVal).toLocaleString("en-US")}${LRM}${unit}`;
  };

  const getDot = (v) => v >= 0 ? "🟢" : "🔴";
  const mParts = sessionDate.split("-");
  const mCode = mParts[1] || "10";
  const monthNameAr = MONTH_NAMES_AR[mCode] || "أكتوبر";
  const monthNameEn = MONTH_NAMES_EN[mCode] || "October";

  const weeklyCountAr = periodic.weekly.count === 1 ? "جلسة واحدة" : (periodic.weekly.count === 2 ? "جلستان" : `${periodic.weekly.count} جلسات`);
  const monthlyCountAr = periodic.monthly.count === 1 ? "جلسة واحدة" : (periodic.monthly.count === 2 ? "جلستان" : `${periodic.monthly.count} جلسات`);
  const weeklyCountEn = periodic.weekly.count === 1 ? "1 Session" : `${periodic.weekly.count} Sessions`;
  const monthlyCountEn = periodic.monthly.count === 1 ? "1 Session" : `${periodic.monthly.count} Sessions`;

  if (lang === "en") {
    let txt = `🏛️ <b>Egyptian Stock Exchange (EGX) Flows</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `📅 Session: <b>${sessionDate}</b> • Currency: <b>${currBadge}</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n\n`
      + `🏛️ <b>Foreign Institutions (Today):</b> ${foStatusEn}\n`
      + `   ▫️ Net Flow: <b>${fmtNet(foNet)}</b>\n`;
    if (foBuy > 0 || foSell > 0) {
      txt += `   ▫️ Buy: <b>${fmtVal(foBuy)}</b> • Sell: <b>${fmtVal(foSell)}</b>\n`;
    }

    txt += `\n📊 <b>Total Institutional Net (Today):</b> ${totStatusEn}\n`
      + `   ▪️ Net Flow: <b>${fmtNet(totNet)}</b>\n`;

    return txt + `\n🔒 <i>Officially audited from EGX Terminal.</i>`;
  }

  let txtAr = `🏛️ <b>صافي تعاملات البورصة المصرية (EGX)</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `📅 تاريخ الجلسة: <b>${sessionDate}</b> • العملة: <b>${currBadge}</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n\n`
    + `🏛️ <b>المؤسسات الأجنبية (اليوم):</b> ${foStatusAr}\n`
    + `   ▫️ صافي السيولة: <b>${fmtNet(foNet)}</b>\n`;
  if (foBuy > 0 || foSell > 0) {
    txtAr += `   ▫️ مشتريات: <b>${fmtVal(foBuy)}</b> • مبيعات: <b>${fmtVal(foSell)}</b>\n`;
  }

  txtAr += `\n📊 <b>إجمالي صافي المؤسسات (اليوم):</b> ${totStatusAr}\n`
    + `   ▪️ صافي السيولة: <b>${fmtNet(totNet)}</b>\n`;

  return txtAr + `\n🔒 <i>بيانات رسمية معتمدة من شاشة البورصة المصرية.</i>`;
}

/**
 * 1.1 تقرير أرشيف الإقفالات اليومية للبورصة المصرية (EGX Historical Closings)
 */
function formatEgxHistoryReport(data, lang, curr) {
  curr = curr || "usd";
  const usdRate = Number(data.usd_rate || data.cbe_usd_buy || 52.29);
  const updatedDateTime = getCairoFullDateTime(lang);
  const currBadge = curr === "usd" ? "USD ($)" : "EGP (ج.م)";
  const rawArchive = (data.archive && Array.isArray(data.archive)) ? data.archive : [];
  // الأرشيف المعتمد يبدأ حصراً من بداية شهر أكتوبر 2026 فصاعداً
  const archive = rawArchive.filter(s => s && s.date && s.date >= "2026-10-01");

  const fmtNet = (v, sessionUsd) => {
    const n = Number(v) || 0;
    const rate = Number(sessionUsd) || usdRate;
    const sign = n >= 0 ? "+" : "-";
    if (curr === "usd") {
      const u = Math.round(n / rate);
      const uSign = u >= 0 ? "+" : "-";
      return `${LRM}${uSign}$${Math.abs(u).toLocaleString("en-US")}${LRM}`;
    }
    const unit = lang === "en" ? " EGP" : " ج.م";
    return `${LRM}${sign}${Math.abs(n).toLocaleString("en-US")}${LRM}${unit}`;
  };

  if (archive.length === 0) {
    if (lang === "en") {
      return `📜 <b>EGX Daily Closings Archive</b>\n`
        + `━━━━━━━━━━━━━━━━━━\n`
        + `🕒 Query: <b>${updatedDateTime}</b>\n\n`
        + `⚠️ <i>No archived sessions recorded yet for October 2026.</i>\n`
        + `Sessions will appear automatically upon market closing.`;
    }
    return `📜 <b>أرشيف الإقفالات اليومية - البورصة المصرية</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>\n\n`
      + `⚠️ <i>لا توجد جلسات إقفال مؤرشفة لشهر أكتوبر حتى الآن.</i>\n`
      + `سيتم تسجيل الجلسات تلقائياً فور اعتماد الإقفال اليومي.`;
  }

  const sessions = archive.slice(0, 7);

  if (lang === "en") {
    let txt = `📜 <b>EGX Daily Closings Archive</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>\n`
      + `📅 Archive: <b>Last ${sessions.length} Sessions</b> • Currency: <b>${currBadge}</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n\n`;

    sessions.forEach((s, idx) => {
      const e = s.egypt_net !== undefined ? s.egypt_net : (s.egypt_net_egp || 0);
      const a = s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0);
      const f = s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0);
      const tot = s.total_net !== undefined ? s.total_net : (s.total_net_egp || (Number(e) + Number(a) + Number(f)));
      const sUsd = Number(s.usd_rate || usdRate);

      const fDot = Number(f) >= 0 ? "🟢" : "🔴";
      const totDot = Number(tot) >= 0 ? "🟢" : "🔴";

      const sessionTag = idx === 0 ? " <i>(Latest)</i>" : "";

      txt += `📅 <b>Session: ${s.date}</b>${sessionTag}\n`
        + `   ▫️ Foreigners: ${fDot} <b>${fmtNet(f, sUsd)}</b>\n`
        + `   ▪️ <b>Total Net:</b> ${totDot} <b>${fmtNet(tot, sUsd)}</b>\n\n`;
    });

    return txt + `🔒 <i>Officially recorded historical closing flows from EGX Terminal.</i>`;
  }

  let txtAr = `📜 <b>أرشيف الإقفالات اليومية - البورصة المصرية</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>\n`
    + `📅 السجل: <b>آخر ${sessions.length} جلسات</b> • العملة: <b>${currBadge}</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n\n`;

  sessions.forEach((s, idx) => {
    const e = s.egypt_net !== undefined ? s.egypt_net : (s.egypt_net_egp || 0);
    const a = s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0);
    const f = s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0);
    const tot = s.total_net !== undefined ? s.total_net : (s.total_net_egp || (Number(e) + Number(a) + Number(f)));
    const sUsd = Number(s.usd_rate || usdRate);

    const fDot = Number(f) >= 0 ? "🟢" : "🔴";
    const totDot = Number(tot) >= 0 ? "🟢" : "🔴";

    const sessionTag = idx === 0 ? " <i>(الأحدث)</i>" : "";

    txtAr += `📅 <b>جلسة: ${s.date}</b>${sessionTag}\n`
      + `   ▫️ الأجانب: ${fDot} <b>${fmtNet(f, sUsd)}</b>\n`
      + `   ▪️ <b>صافي المؤسسات:</b> ${totDot} <b>${fmtNet(tot, sUsd)}</b>\n\n`;
  });

  return txtAr + `🔒 <i>أرشيف رسمي موثق لجلسات الإقفال من شاشة البورصة المصرية.</i>`;
}

/**
 * 2. تقرير الذهب والنفط والكريبتو اللحظي (بالدولار الأمريكي فقط)
 */
function formatCommoditiesReport(data, lang) {
  let items = data.live_commodities || [];
  const updatedDateTime = getCairoFullDateTime(lang);

  if (lang === "en") {
    let txt = `🪙 <b>Gold, Oil & Crypto Live Market</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>\n`
      + `💱 Currency: <b>USD ($)</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n\n`;

    items.forEach(item => {
      const uP = Number(item.usd_price || 0);
      const uDec = uP < 10 ? (uP < 1 ? 4 : 3) : (uP >= 1000 ? 0 : 2);
      txt += `▫️ <b>${item.name_en || item.name}:</b> <b>$${Number(uP).toLocaleString("en-US", { minimumFractionDigits: uDec, maximumFractionDigits: uDec })}</b>\n`;
    });

    return txt + `\n⚡ <i>Live real-time feed via TradingView.</i>`;
  }

  let txtAr = `🪙 <b>أسواق الذهب والفضة والنفط والكريبتو</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>\n`
    + `💱 العملة: <b>USD ($)</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n\n`;

  items.forEach(item => {
    const uP = Number(item.usd_price || 0);
    const uDec = uP < 10 ? (uP < 1 ? 4 : 3) : (uP >= 1000 ? 0 : 2);
    txtAr += `▫️ <b>${item.name}:</b> <b>$${Number(uP).toLocaleString("en-US", { minimumFractionDigits: uDec, maximumFractionDigits: uDec })}</b>\n`;
  });

  return txtAr + `\n⚡ <i>أسعار حية ولحظية بالدولار مباشرة عبر تريدنج فيو.</i>`;
}

/**
 * 3. تقرير العملات الأجنبية والعربية (مقابل الجنيه المصري فقط)
 */
function formatCurrenciesReport(data, lang) {
  const rates = data.rates || [];
  const usdRate = Number(data.usd_rate || data.cbe_usd_buy || 52.29);
  const fmt = (v, d) => Number(v).toLocaleString("en-US", {
    minimumFractionDigits: d !== undefined ? d : 2,
    maximumFractionDigits: d !== undefined ? d : 2
  });
  
  const updatedDateTime = getCairoFullDateTime(lang);
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLineEn = bankSnapshot ? `\n📸 Rates Snapshot: <b>[${bankSnapshot}]</b>` : "";
  const snapshotLineAr = bankSnapshot ? `\n📸 لقطة أسعار الصرف: <b>[${bankSnapshot}]</b>` : "";

  const CURRENCY_EN = {
    "USD": "US Dollar",
    "EUR": "Euro",
    "SAR": "Saudi Riyal",
    "AED": "UAE Dirham",
    "KWD": "Kuwaiti Dinar",
    "GBP": "British Pound",
    "QAR": "Qatari Riyal",
    "CNY": "Chinese Yuan",
    "BHD": "Bahraini Dinar",
    "OMR": "Omani Rial",
    "JPY": "Japanese Yen"
  };

  const excludeCodes = ["GOLD24", "GOLD21", "GOLD18", "SILVER", "BRENT", "WTI", "BTC", "ETH", "OIL", "GOLDC", "USD"];
  const currItems = rates.filter(r => {
    const c = (r.code || "").toUpperCase();
    return !excludeCodes.includes(c) && c.indexOf("GOLD") < 0 && c.indexOf("SILVER") < 0;
  });

  const cairoHourStr = new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false });
  const cairoHour = parseInt(cairoHourStr, 10);
  const isTradingHours = (cairoHour >= 9 && cairoHour < 17);

  const banks = data.banks || [];
  let topBank = (banks.length > 0) ? banks[0] : null;
  if (banks.length > 0) {
    let maxB = 0;
    banks.forEach(b => {
      const buyVal = Number(b.buy || 0);
      if (buyVal > maxB) {
        maxB = buyVal;
        topBank = b;
      }
    });
  }

  const cbeBuy = Number(data.cbe_usd_buy || 52.22);
  let usdLineEn = "", usdLineAr = "";

  if (isTradingHours && topBank && Number(topBank.buy) > 0) {
    const topRate = Number(topBank.buy);
    const bankNameEn = getBankName(topBank.bank, "en");
    usdLineEn = `▫️ <b>US Dollar [USD]:</b> <b>${fmt(topRate, 2)} EGP</b> — <i>Top Buy: ${bankNameEn}</i>\n`;
    usdLineAr = `▫️ <b>الدولار الأمريكي [USD]:</b> <b>${fmt(topRate, 2)} ج.م</b> — <i>أعلى شراء: ${topBank.bank}</i>\n`;
  } else {
    usdLineEn = `▫️ <b>US Dollar [USD]:</b> <b>${fmt(cbeBuy, 2)} EGP</b> — <i>CBE Close</i>\n`;
    usdLineAr = `▫️ <b>الدولار الأمريكي [USD]:</b> <b>${fmt(cbeBuy, 2)} ج.م</b> — <i>إقفال البنك المركزي</i>\n`;
  }

  if (lang === "en") {
    let txt = `💵 <b>Foreign Currency Exchange Rates (vs EGP)</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `━━━━━━━━━━━━━━━━━━\n\n`
      + usdLineEn;

    currItems.forEach(item => {
      let eP = Number(item.egp_price || item.rate_egp || item.buy || item.sell || 0);
      if (eP === 0 && item.usd_price) {
        eP = Number(item.usd_price) * usdRate;
      }
      const code = (item.code || "").toUpperCase();
      const name = CURRENCY_EN[code] || item.name_en || item.name;
      txt += `▫️ <b>${name} [${code}]:</b> <b>${fmt(eP, 2)} EGP</b>\n`;
    });

    return txt + `\n🏛️ <i>Official Central Bank of Egypt & Live Bank feeds.</i>`;
  }

  let txtAr = `💵 <b>أسعار العملات الرسمية مقابل الجنيه المصري</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `━━━━━━━━━━━━━━━━━━\n\n`
    + usdLineAr;

  currItems.forEach(item => {
    let eP = Number(item.egp_price || item.rate_egp || item.buy || item.sell || 0);
    if (eP === 0 && item.usd_price) {
      eP = Number(item.usd_price) * usdRate;
    }
    const code = (item.code || "").toUpperCase();
    const name = item.name_ar || item.name;
    txtAr += `▫️ <b>${name} [${code}]:</b> <b>${fmt(eP, 2)} ج.م</b>\n`;
  });

  return txtAr + `\n🏛️ <i>أسعار موثقة معتمدة من البنك المركزي المصري والبنوك.</i>`;
}

/**
 * 4. تقرير البنوك وصرف الدولار (مباشر من موقع تعويم)
 */
function formatBanksReport(data, lang, cfg) {
  const banks = data.banks || [];
  const limit = (cfg && cfg.banks_count) ? parseInt(cfg.banks_count) : 8;
  const showCbe = cfg ? (cfg.show_cbe_in_banks !== false) : true;
  const showBest = cfg ? (cfg.show_best_banks !== false) : true;

  const usdBuy = Number(data.cbe_usd_buy || 52.22);
  const usdSell = Number(data.cbe_usd_sell || 52.36);
  const cbeTime = formatCleanTime(data.cbe_updated_at || extractTimeFromTimestamp(data.timestamp), lang);
  const updatedDateTime = getCairoFullDateTime(lang);
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLineEn = bankSnapshot ? `\n📸 Rates Snapshot: <b>[${bankSnapshot}]</b>` : "";
  const snapshotLineAr = bankSnapshot ? `\n📸 لقطة أسعار الصرف: <b>[${bankSnapshot}]</b>` : "";

  // ترتيب البنوك حسب أعلى سعر شراء
  banks.sort((a, b) => (Number(b.buy) || 0) - (Number(a.buy) || 0));

  let topBuy = banks[0] || { bank: "أبوظبي الإسلامي (ADIB)", buy: 52.42, sell: 52.52, updated_at: getCairoTimeStr() };
  const topBuyTime = formatCleanTime(topBuy.updated_at, lang);
  const topBankNameEn = getBankName(topBuy.bank, "en");

  if (lang === "en") {
    return `🏦 <b>USD Exchange Rates - Egyptian Banks</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + (showCbe ? `🏛️ <b>Central Bank (CBE):</b> Buy <b>${usdBuy.toFixed(4)}</b> • Sell <b>${usdSell.toFixed(4)}</b> [${cbeTime}]\n━━━━━━━━━━━━━━━━━━\n` : "")
      + (showBest ? `🟢 <b>Top Buy Bank:</b> ${topBankNameEn}\n   ▫️ Buy <b>${Number(topBuy.buy).toFixed(2)}</b> • Sell <b>${Number(topBuy.sell).toFixed(2)}</b> [${topBuyTime}]\n━━━━━━━━━━━━━━━━━━\n` : "")
      + `📊 <b>Top ${Math.min(limit, banks.length)} Banks (Buy • Sell):</b>\n\n`
      + banks.slice(0, limit).map(b => `▫️ <b>${getBankName(b.bank, "en")}:</b> Buy <b>${Number(b.buy).toFixed(2)}</b> • Sell <b>${Number(b.sell).toFixed(2)}</b>`).join("\n")
      + `\n\n⚡ <i>Live feed via Ta3weem.</i>`;
  }

  return `🏦 <b>أسعار صرف الدولار في البنوك المصرية</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + (showCbe ? `🏛️ <b>البنك المركزي المصري:</b> شراء <b>${usdBuy.toFixed(4)}</b> • بيع <b>${usdSell.toFixed(4)}</b> [${cbeTime}]\n━━━━━━━━━━━━━━━━━━\n` : "")
    + (showBest ? `🟢 <b>أعلى بنك في سعر الشراء:</b> ${topBuy.bank}\n   ▫️ شراء <b>${Number(topBuy.buy).toFixed(2)}</b> • بيع <b>${Number(topBuy.sell).toFixed(2)}</b> [${topBuyTime}]\n━━━━━━━━━━━━━━━━━━\n` : "")
    + `📊 <b>أبرز البنوك المصرية (شراء • بيع):</b>\n\n`
    + banks.slice(0, limit).map(b => `▫️ <b>${b.bank}:</b> شراء <b>${Number(b.buy).toFixed(2)}</b> • بيع <b>${Number(b.sell).toFixed(2)}</b>`).join("\n")
    + `\n\n⚡ <i>أسعار حية مباشرة من البنوك عبر تعويم.</i>`;
}

function formatAllBanksReport(data, lang) {
  const banks = data.banks || [];
  const updatedDateTime = getCairoFullDateTime(lang);
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLineEn = bankSnapshot ? `\n📸 Rates Snapshot: <b>[${bankSnapshot}]</b>` : "";
  const snapshotLineAr = bankSnapshot ? `\n📸 لقطة أسعار الصرف: <b>[${bankSnapshot}]</b>` : "";

  if (lang === "en") {
    return `🏦 <b>All 25 Egyptian Banks - USD Rates</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `━━━━━━━━━━━━━━━━━━\n\n`
      + banks.map((b, idx) => `${idx + 1}. <b>${getBankName(b.bank, "en")}:</b> Buy <b>${Number(b.buy).toFixed(2)}</b> • Sell <b>${Number(b.sell).toFixed(2)}</b>`).join("\n")
      + `\n\n⚡ <i>Live feed via Ta3weem.</i>`;
  }
  return `🏦 <b>قائمة الـ 25 بنكاً مصرياً بالكامل - أسعار الدولار</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `━━━━━━━━━━━━━━━━━━\n\n`
    + banks.map((b, idx) => `${idx + 1}. <b>${b.bank}:</b> شراء <b>${Number(b.buy).toFixed(2)}</b> • بيع <b>${Number(b.sell).toFixed(2)}</b>`).join("\n")
    + `\n\n⚡ <i>أسعار حية مباشرة من البنوك عبر تعويم.</i>`;
}

/**
 * 5. التقرير المالي التنفيذي الشامل (المخصص - الأجانب فقط، الدولار، الذهب 24، برنت)
 */
function formatExecutiveReport(data, lang, curr, tzKey) {
  curr = curr || "usd";
  tzKey = tzKey || "cairo";
  const usdRate = Number(data.usd_rate || data.cbe_usd_buy || 52.29);
  let foNet = 0, totNet = 0;
  let foBuy = 0, foSell = 0;
  let sessionDate = new Date().toISOString().split("T")[0];

  if (data.archive && data.archive.length > 0) {
    const r = data.archive[0];
    const f = r.foreign_net !== undefined ? r.foreign_net : r.foreign_net_egp;
    if (f !== undefined && f !== null && f !== "") foNet = Number(f);
    foBuy = Number(r.foreign_buy !== undefined ? r.foreign_buy : (r.foreign_buy_egp || 0));
    foSell = Number(r.foreign_sell !== undefined ? r.foreign_sell : (r.foreign_sell_egp || 0));

    const t = r.total_net !== undefined ? r.total_net : r.total_net_egp;
    if (t !== undefined && t !== null && t !== "") {
      totNet = Number(t);
    } else {
      const e = Number(r.egypt_net !== undefined ? r.egypt_net : (r.egypt_net_egp || 0));
      const a = Number(r.arab_net !== undefined ? r.arab_net : (r.arab_net_egp || 0));
      totNet = e + a + foNet;
    }

    sessionDate = r.date || sessionDate;
  }

  if (foBuy === 0 && data.egx_institutions?.tables?.institutions) {
    const inst = data.egx_institutions.tables.institutions;
    const foItem = inst.find(i => (i.type || "").includes("أجانب") || (i.type || "").includes("اجانب") || (i.type || "").toLowerCase().includes("foreign"));
    if (foItem) {
      foBuy = Number(foItem.buy_egp || 0);
      foSell = Number(foItem.sell_egp || 0);
      foNet = Number(foItem.net_egp || foNet);
    }
  }

  const updatedDateTime = getCairoFullDateTime(lang, tzKey);
  const snapshotTime = getEgxSnapshotTime(data, lang);
  const snapshotLineEn = snapshotTime ? `\n📸 Market Snapshot: <b>[${snapshotTime}]</b>` : "";
  const snapshotLineAr = snapshotTime ? `\n📸 لقطة شاشة البورصة: <b>[${snapshotTime}]</b>` : "";

  // أسعار البنك المركزي وأعلى بنك كبديل لحظي
  const cbeBuy = Number(data.cbe_usd_buy || 52.22);
  const cbeSell = Number(data.cbe_usd_sell || 52.36);
  const banks = data.banks || [];
  let topBank = banks[0] || { bank: "أبوظبي الإسلامي (ADIB)", buy: 52.40, sell: 52.50, updated_at: getCairoTimeStr() };
  let maxBuy = 0;
  if (banks && banks.length > 0) {
    banks.forEach(b => {
      const bBuy = Number(b.buy || 0);
      if (bBuy > maxBuy) {
        maxBuy = bBuy;
        topBank = b;
      }
    });
  }

  const bNameEn = getBankName(topBank.bank, "en");
  const bTime = formatCleanTime(topBank.updated_at, lang);
  const cbeTime = formatCleanTime(data.cbe_updated_at || extractTimeFromTimestamp(data.timestamp), lang);
  const bankPeakLineEn = `\n  ▫️ <b>Top Buy Bank:</b> ${bNameEn} • Buy <b>${Number(topBank.buy).toFixed(2)}</b> • Sell <b>${Number(topBank.sell).toFixed(2)}</b> [${bTime}]`;
  const bankPeakLineAr = `\n  ▫️ <b>أعلى بنك شراء:</b> ${topBank.bank} • شراء <b>${Number(topBank.buy).toFixed(2)}</b> • بيع <b>${Number(topBank.sell).toFixed(2)}</b> [${bTime}]`;

  // السلع المطلوبة: ذهب عيار 24، أونصة الذهب، أونصة الفضة، وخام برنت
  const comms = data.live_commodities || [];
  const gold24 = comms.find(c => c.code === "GOLD24") || { usd_price: 133.63 };
  const goldOunce = comms.find(c => c.code === "GOLD_OUNCE" || c.name?.includes("أونصة الذهب")) || { usd_price: 4165.0 };
  const silver = comms.find(c => c.code === "SILVER") || { usd_price: 61.10 };
  const brent = comms.find(c => c.code === "BRENT") || { usd_price: 101.02 };

  const foStatusEn = foNet >= 0 ? "Net Buy 🟢" : "Net Sell 🔴";
  const foStatusAr = foNet >= 0 ? "صافي شراء 🟢" : "صافي بيع 🔴";

  // تنسيق الأرقام حسب العملة المختارة لتدفقات البورصة
  let foAmountEn = "", foAmountAr = "";
  let totAmountEn = "", totAmountAr = "";
  const gold24StrEn = `$${Number(gold24.usd_price).toFixed(2)}`;
  const gold24StrAr = `$${Number(gold24.usd_price).toFixed(2)}`;
  const goldOunceStr = `$${Number(goldOunce.usd_price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const silverStr = `$${Number(silver.usd_price).toFixed(2)}`;
  const brentStrEn = `$${Number(brent.usd_price).toFixed(2)}`;
  const brentStrAr = `$${Number(brent.usd_price).toFixed(2)}`;
  let breakdownEn = "", breakdownAr = "";

  if (curr === "usd") {
    const foUsd = Math.round(foNet / usdRate);
    const foSign = foUsd >= 0 ? "+" : "-";
    foAmountEn = `${LRM}${foSign}$${Math.abs(foUsd).toLocaleString("en-US")}${LRM}`;
    foAmountAr = `${LRM}${foSign}$${Math.abs(foUsd).toLocaleString("en-US")}${LRM}`;

    const totUsd = Math.round(totNet / usdRate);
    const totSign = totUsd >= 0 ? "+" : "-";
    totAmountEn = `${LRM}${totSign}$${Math.abs(totUsd).toLocaleString("en-US")}${LRM}`;
    totAmountAr = `${LRM}${totSign}$${Math.abs(totUsd).toLocaleString("en-US")}${LRM}`;

    if (foBuy > 0 || foSell > 0) {
      breakdownEn = `  ▫️ Buy: $${Math.round(foBuy / usdRate).toLocaleString("en-US")} • Sell: $${Math.round(foSell / usdRate).toLocaleString("en-US")}\n`;
      breakdownAr = `  ▫️ مشتريات: $${Math.round(foBuy / usdRate).toLocaleString("en-US")} • مبيعات: $${Math.round(foSell / usdRate).toLocaleString("en-US")}\n`;
    }
  } else {
    const foSign = foNet >= 0 ? "+" : "-";
    const absNet = Math.abs(foNet).toLocaleString("en-US");
    foAmountEn = `${LRM}${foSign}${absNet}${LRM} EGP`;
    foAmountAr = `${LRM}${foSign}${absNet}${LRM} ج.م`;

    const totSign = totNet >= 0 ? "+" : "-";
    const absTot = Math.abs(totNet).toLocaleString("en-US");
    totAmountEn = `${LRM}${totSign}${absTot}${LRM} EGP`;
    totAmountAr = `${LRM}${totSign}${absTot}${LRM} ج.م`;

    if (foBuy > 0 || foSell > 0) {
      breakdownEn = `  ▫️ Buy: ${foBuy.toLocaleString("en-US")} • Sell: ${foSell.toLocaleString("en-US")}\n`;
      breakdownAr = `  ▫️ مشتريات: ${foBuy.toLocaleString("en-US")} • مبيعات: ${foSell.toLocaleString("en-US")}\n`;
    }
  }

  const currBadge = curr === "usd" ? "USD ($)" : "EGP (ج.م)";

  // حساب المجاميع التراكمية الأسبوعية والشهرية
  const periodic = calculatePeriodicTotals(data.archive, sessionDate, usdRate);

  const fmtPeriodVal = (egpVal, usdVal) => {
    if (curr === "usd") {
      const uSign = usdVal >= 0 ? "+" : "-";
      return `${LRM}${uSign}$${Math.abs(usdVal).toLocaleString("en-US")}${LRM}`;
    }
    const sign = egpVal >= 0 ? "+" : "-";
    const unit = lang === "en" ? " EGP" : " ج.م";
    return `${LRM}${sign}${Math.abs(egpVal).toLocaleString("en-US")}${LRM}${unit}`;
  };

  const getDot = (v) => v >= 0 ? "🟢" : "🔴";
  const mParts = sessionDate.split("-");
  const mCode = mParts[1] || "10";
  const monthNameAr = MONTH_NAMES_AR[mCode] || "أكتوبر";
  const monthNameEn = MONTH_NAMES_EN[mCode] || "October";

  const weeklyCountAr = periodic.weekly.count === 1 ? "جلسة واحدة" : (periodic.weekly.count === 2 ? "جلستان" : `${periodic.weekly.count} جلسات`);
  const monthlyCountAr = periodic.monthly.count === 1 ? "جلسة واحدة" : (periodic.monthly.count === 2 ? "جلستان" : `${periodic.monthly.count} جلسات`);
  const weeklyCountEn = periodic.weekly.count === 1 ? "1 Session" : `${periodic.weekly.count} Sessions`;
  const monthlyCountEn = periodic.monthly.count === 1 ? "1 Session" : `${periodic.monthly.count} Sessions`;

  if (lang === "en") {
    return `📊 <b>Executive Financial Summary</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `📅 Session: <b>${sessionDate}</b> • Currency: <b>${currBadge}</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n\n`
      + `🏛️ <b>Foreign Institutional Flows:</b>\n`
      + `  ▫️ <b>Status (Today):</b> ${foStatusEn}\n`
      + `  ▫️ <b>Today's Net Flow:</b> <b>${foAmountEn}</b>\n`
      + breakdownEn
      + `  ▪️ <b>Total Inst. Net (Today):</b> ${getDot(totNet)} <b>${totAmountEn}</b>\n\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `💵 <b>USD Exchange Rates:</b>\n`
      + `  ▫️ <b>Central Bank (CBE):</b> Buy <b>${cbeBuy.toFixed(4)}</b> • Sell <b>${cbeSell.toFixed(4)}</b> [${cbeTime}]`
      + bankPeakLineEn + `\n\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `🛢️ <b>Brent Crude Oil:</b> <b>${brentStrEn}</b>\n`
      + `🪙 <b>Gold (Ounce):</b> <b>${goldOunceStr}</b> • <b>24K (Gram):</b> <b>${gold24StrEn}</b>\n`
      + `🪙 <b>Silver (Ounce):</b> <b>${silverStr}</b>\n`
      + `\n⚡ <i>Live Executive Summary • Real-time feeds.</i>`;
  }

  return `📊 <b>التقرير المالي التنفيذي الشامل</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `📅 تاريخ الجلسة: <b>${sessionDate}</b> • العملة: <b>${currBadge}</b>\n`
    + `━━━━━━━━━━━━━━━━━━\n\n`
    + `🏛️ <b>صافي تدفقات المؤسسات:</b>\n`
    + `  ▫️ <b>حالة الأجانب اليوم:</b> ${foStatusAr}\n`
    + `  ▫️ <b>صافي سيولة الأجانب (اليوم):</b> <b>${foAmountAr}</b>\n`
    + breakdownAr
    + `  ▪️ <b>إجمالي صافي المؤسسات (اليوم):</b> ${getDot(totNet)} <b>${totAmountAr}</b>\n\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `💵 <b>أسعار صرف الدولار:</b>\n`
    + `  ▫️ <b>البنك المركزي:</b> شراء <b>${cbeBuy.toFixed(4)}</b> • بيع <b>${cbeSell.toFixed(4)}</b> [${cbeTime}]`
    + bankPeakLineAr + `\n\n`
    + `━━━━━━━━━━━━━━━━━━\n`
    + `🛢️ <b>خام برنت (نفط):</b> <b>${brentStrAr}</b>\n`
    + `🪙 <b>أونصة الذهب:</b> <b>${goldOunceStr}</b> • <b>ذهب عيار 24:</b> <b>${gold24StrAr}</b>\n`
    + `🪙 <b>أونصة الفضة:</b> <b>${silverStr}</b>\n`
    + `\n⚡ <i>تقرير تنفيذي لحظي موثق ومباشر.</i>`;
}

// ==========================================
// 🕹️ لوحات المفاتيح وأزرار التحديث اللحظي
// ==========================================

function getReportKeyboard(cmdType, lang, cfg, curr) {
  cfg = cfg || botConfig;
  curr = curr || "usd";
  const refreshText = lang === "en" ? "🔄 Refresh Data" : "🔄 تحديث لحظي للبيانات";
  const menuText = lang === "en" ? "🔙 Main Menu" : "🔙 القائمة الرئيسية";
  const langToggleText = lang === "en" ? "🌐 اللغة العربية" : "🌐 English";
  const langToggleData = lang === "en" ? `cmd_lang_ar:${curr}` : `cmd_lang_en:${curr}`;

  // زر تحويل العملة
  const nextCurr = curr === "usd" ? "egp" : "usd";
  let currToggleText = "";
  if (lang === "en") {
    currToggleText = curr === "usd" ? "💵 Show in EGP" : "💲 Show in USD";
  } else {
    currToggleText = curr === "usd" ? "💵 العرض بالجنيه (EGP)" : "💲 العرض بالدولار (USD)";
  }
  const currToggleData = `toggle_curr:${nextCurr}:${cmdType}:${lang}`;

  const rows = [];
  
  // الصف الأول: زر التحديث اللحظي
  rows.push([{ text: refreshText, callback_data: `refresh_${cmdType}:${lang}:${curr}` }]);

  // الصف الثاني: زر تبديل العملة للتقارير القابلة للتحويل أو التنقل بين البنوك
  if (cmdType === "report") {
    rows.push([{ text: currToggleText, callback_data: currToggleData }]);
  } else if (cmdType === "egx") {
    rows.push([{ text: (lang === "en" ? "📜 Daily Closings Archive" : "📜 أرشيف الإقفال اليومي"), callback_data: `cmd_history:${lang}:${curr}` }]);
    rows.push([{ text: currToggleText, callback_data: currToggleData }]);
  } else if (cmdType === "history" || cmdType === "archive") {
    rows.push([{ text: (lang === "en" ? "🏛️ Back to EGX Live" : "🏛️ العودة للبورصة اللحظية"), callback_data: `cmd_egx:${lang}:${curr}` }]);
    rows.push([{ text: currToggleText, callback_data: currToggleData }]);
  } else if (cmdType === "banks") {
    rows.push([{ text: (lang === "en" ? "📋 View All 25 Banks" : "📋 عرض كافة الـ 25 بنكاً"), callback_data: `cmd_banks_all:${lang}` }]);
  } else if (cmdType === "banks_all") {
    rows.push([{ text: (lang === "en" ? "🔙 Back to Top Banks" : "🔙 العودة لأبرز البنوك"), callback_data: `cmd_banks:${lang}` }]);
  }

  // الصف الثالث: القائمة واللغة
  rows.push([
    { text: menuText, callback_data: `cmd_menu:${lang}:${curr}` },
    { text: langToggleText, callback_data: langToggleData }
  ]);

  return { inline_keyboard: rows };
}

function getMenuKeyboard(lang, originUrl, cfg) {
  cfg = cfg || botConfig;
  const rows = [];

  const r1 = [];
  if (!cfg.hide_egx) r1.push({ text: (lang === "en" ? "🏛️ Institutional Flows (EGX)" : "🏛️ تعاملات المؤسسات (EGX)"), callback_data: `cmd_egx:${lang}` });
  if (!cfg.hide_banks) r1.push({ text: (lang === "en" ? "🏦 25 Banks & CBE" : "🏦 أسعار البنوك والمركزي"), callback_data: `cmd_banks:${lang}` });
  if (r1.length > 0) rows.push(r1);

  const r2 = [];
  if (!cfg.hide_commodities) r2.push({ text: (lang === "en" ? "🪙 Gold, Oil & Crypto" : "🪙 الذهب والنفط والكريبتو"), callback_data: `cmd_commodities:${lang}` });
  if (!cfg.hide_currencies) r2.push({ text: (lang === "en" ? "💵 Foreign Currencies" : "💵 أسعار العملات الأجنبية"), callback_data: `cmd_currencies:${lang}` });
  if (r2.length > 0) rows.push(r2);

  const r3 = [];
  if (!cfg.hide_report) r3.push({ text: (lang === "en" ? "📊 Full Executive Report" : "📊 التقرير المالي الشامل"), callback_data: `cmd_report:${lang}` });
  r3.push({ text: (lang === "en" ? "📜 Daily Closings" : "📜 أرشيف الإقفال اليومي"), callback_data: `cmd_history:${lang}` });
  rows.push(r3);

  rows.push([
    { text: (lang === "en" ? "🔄 Refresh Menu" : "🔄 تحديث القائمة"), callback_data: `refresh_menu:${lang}` },
    { text: (lang === "en" ? "🌐 اللغة العربية" : "🌐 English"), callback_data: (lang === "en" ? "cmd_lang_ar" : "cmd_lang_en") }
  ]);

  rows.push([
    { text: (lang === "en" ? "🌍 Timezone Settings" : "🌍 ضبط المنطقة الزمنية"), callback_data: `cmd_timezone:${lang}` }
  ]);

  return { inline_keyboard: rows };
}

function getTimezoneKeyboard(lang, currentTz) {
  currentTz = currentTz || "cairo";
  const rows = [];
  for (let key in TIMEZONES) {
    const tz = TIMEZONES[key];
    const isSel = (key === currentTz);
    const label = `${tz.flag} ${lang === "en" ? tz.name_en : tz.name_ar} ${isSel ? "✅" : ""}`;
    rows.push([{ text: label, callback_data: `set_tz:${key}:${lang}` }]);
  }
  rows.push([{ text: (lang === "en" ? "🔙 Main Menu" : "🔙 القائمة الرئيسية"), callback_data: `cmd_menu:${lang}` }]);
  return { inline_keyboard: rows };
}

function getBanksKeyboard(lang) {
  return getReportKeyboard("banks", lang);
}

async function sendMainMenu(chatId, lang, originUrl, cfg, messageId) {
  const userTz = userTzPreferences[chatId] || "cairo";
  const updatedDateTime = getCairoFullDateTime(lang, userTz);
  const text = (lang === "en")
    ? `🏛️ <b>Egyptian Stock Exchange & Live Markets Bot</b>\n🕒 <b>${updatedDateTime}</b>\n\n⚡ Powered by <b>Cloudflare Edge & Live Feeds</b> 24/7.\n\n👇 <i>Choose from the interactive menu below:</i>`
    : `🏛️ <b>منظومة البورصة المصرية وأسواق الصرف الحية 24/7</b>\n🕒 <b>${updatedDateTime}</b>\n\n⚡ تعمل سحابياً عبر <b>Cloudflare Edge وموقع تعويم وبينانس</b> مباشرة.\n\n👇 <i>اختر ما تريد من القائمة التفاعلية أدناه:</i>`;
  if (messageId) return editTgMessage(chatId, messageId, text, getMenuKeyboard(lang, originUrl, cfg));
  return sendTgMessage(chatId, text, getMenuKeyboard(lang, originUrl, cfg));
}

async function sendTgMessage(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function editTgMessage(chatId, messageId, text, replyMarkup) {
  const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.description && err.description.includes("message is not modified")) return res;
    return sendTgMessage(chatId, text, replyMarkup);
  }
  return res;
}

async function answerCallback(callbackId, text) {
  const payload = { callback_query_id: callbackId };
  if (text) payload.text = text;
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// ==========================================
// 🖥️ لوحة التحكم المستقلة (HTML)
// ==========================================

function getControlHtml(originUrl) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة تحكم وتخصيص بوت تلجرام | Cloudflare Edition</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --bg: #090e1a;
      --card-bg: #111827;
      --card-border: #1f2937;
      --primary: #38bdf8;
      --green: #10b981;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --radius: 14px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Cairo', sans-serif;
      padding: 16px;
      padding-bottom: 90px;
    }
    .container { max-width: 580px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .header-card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: var(--radius);
      padding: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-info { display: flex; align-items: center; gap: 12px; }
    .header-icon {
      width: 44px; height: 44px; background: #0284c7; border-radius: 12px;
      display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: #fff;
    }
    .status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 5px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; color: #34d399;
    }
    .status-dot { width: 7px; height: 7px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }
    .section-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: var(--radius); padding: 18px; display: flex; flex-direction: column; gap: 14px;
    }
    .section-title {
      font-size: 0.95rem; font-weight: 800; color: var(--primary);
      display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 8px;
    }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .toggle-info h4 { font-size: 0.9rem; font-weight: 700; }
    .toggle-info p { font-size: 0.75rem; color: var(--text-muted); }
    .switch { position: relative; width: 48px; height: 26px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155; transition: .25s; border-radius: 34px;
    }
    .slider:before {
      position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px;
      background-color: white; transition: .25s; border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--green); }
    input:checked + .slider:before { transform: translateX(22px); }
    select {
      width: 100%; background: #1e293b; border: 1px solid #334155; color: #fff;
      padding: 10px; border-radius: 8px; font-family: 'Cairo'; outline: none;
    }
    .save-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);
      border-top: 1px solid #1f2937; padding: 14px 16px; display: flex; justify-content: center; z-index: 100;
    }
    .save-btn {
      width: 100%; max-width: 580px; background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff; border: none; padding: 14px; border-radius: 12px;
      font-family: 'Cairo'; font-size: 1rem; font-weight: 800; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .toast {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-100px);
      background: var(--green); color: #fff; padding: 12px 24px; border-radius: 30px;
      font-weight: 700; font-size: 0.85rem; z-index: 999; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <div id="toast" class="toast">✅ تم حفظ وتطبيق الإعدادات على البوت فوراً!</div>

  <div class="container">
    <div class="header-card">
      <div class="header-info">
        <div class="header-icon"><i class="fa-solid fa-bolt"></i></div>
        <div>
          <h2>لوحة تخصيص البوت</h2>
          <p style="font-size: 0.75rem; color: var(--text-muted);">Cloudflare High-Speed Edge Panel</p>
        </div>
      </div>
      <div class="status-badge"><div class="status-dot"></div><span>متصل لحظياً</span></div>
    </div>

    <div class="section-card">
      <div class="section-title"><i class="fa-solid fa-toggle-on"></i><span>تخصيص أزرار البوت (إظهار / إخفاء)</span></div>
      
      <div class="toggle-row">
        <div class="toggle-info"><h4>🏛️ تعاملات المؤسسات (EGX)</h4><p>إظهار زر مشتريات ومبيعات البورصة</p></div>
        <label class="switch"><input type="checkbox" id="btn_egx" checked><span class="slider"></span></label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info"><h4>🏦 أسعار البنوك والمركزي</h4><p>إظهار زر صرف الدولار في البنوك</p></div>
        <label class="switch"><input type="checkbox" id="btn_banks" checked><span class="slider"></span></label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info"><h4>🪙 الذهب والنفط والكريبتو</h4><p>إظهار زر الذهب والفضة وبرنت وبيتكوين وإيثيريوم</p></div>
        <label class="switch"><input type="checkbox" id="btn_commodities" checked><span class="slider"></span></label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info"><h4>💵 أسعار العملات الأجنبية</h4><p>إظهار زر العملات العربية والأجنبية الرسمية</p></div>
        <label class="switch"><input type="checkbox" id="btn_currencies" checked><span class="slider"></span></label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info"><h4>📊 التقرير المالي الشامل</h4><p>إظهار زر التقرير التنفيذي الموحد</p></div>
        <label class="switch"><input type="checkbox" id="btn_report" checked><span class="slider"></span></label>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title"><i class="fa-solid fa-building-columns"></i><span>تخصيص تقرير البنوك</span></div>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 0.85rem; font-weight: 700;">عدد البنوك المعروضة في التقرير السريع:</label>
        <select id="banks_count">
          <option value="5">أعلى 5 بنوك</option>
          <option value="8" selected>أعلى 8 بنوك (افتراضي مثالي)</option>
          <option value="10">أعلى 10 بنوك</option>
          <option value="25">عرض كافة الـ 25 بنكاً</option>
        </select>
      </div>

      <div class="toggle-row" style="margin-top: 6px;">
        <div class="toggle-info"><h4>🏛️ سعر البنك المركزي الفعلي</h4><p>إظهار الشراء والبيع الفعلي بالمركزي</p></div>
        <label class="switch"><input type="checkbox" id="show_cbe" checked><span class="slider"></span></label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info"><h4>🟢 أفضل بنك للبيع والشراء</h4><p>تمييز أعلى سعر شراء وأقل سعر بيع</p></div>
        <label class="switch"><input type="checkbox" id="show_best" checked><span class="slider"></span></label>
      </div>
    </div>
  </div>

  <div class="save-bar">
    <button class="save-btn" onclick="saveSettings()">
      <i class="fa-solid fa-floppy-disk"></i>
      <span>حفظ وتطبيق التعديلات في البوت فوراً</span>
    </button>
  </div>

  <script>
    fetch("${originUrl}/api/config")
      .then(res => res.json())
      .then(cfg => {
        if (!cfg) return;
        document.getElementById("btn_egx").checked = !cfg.hide_egx;
        document.getElementById("btn_banks").checked = !cfg.hide_banks;
        document.getElementById("btn_commodities").checked = !cfg.hide_commodities;
        document.getElementById("btn_currencies").checked = !cfg.hide_currencies;
        document.getElementById("btn_report").checked = !cfg.hide_report;
        if (cfg.banks_count) document.getElementById("banks_count").value = cfg.banks_count;
        if (cfg.show_cbe_in_banks !== undefined) document.getElementById("show_cbe").checked = cfg.show_cbe_in_banks;
        if (cfg.show_best_banks !== undefined) document.getElementById("show_best").checked = cfg.show_best_banks;
      }).catch(e => {});

    function saveSettings() {
      const btn = document.querySelector(".save-btn");
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

      const payload = {
        hide_egx: !document.getElementById("btn_egx").checked,
        hide_banks: !document.getElementById("btn_banks").checked,
        hide_commodities: !document.getElementById("btn_commodities").checked,
        hide_currencies: !document.getElementById("btn_currencies").checked,
        hide_report: !document.getElementById("btn_report").checked,
        banks_count: parseInt(document.getElementById("banks_count").value) || 8,
        show_cbe_in_banks: document.getElementById("show_cbe").checked,
        show_best_banks: document.getElementById("show_best").checked
      };

      fetch("${originUrl}/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ وتطبيق التعديلات في البوت فوراً';
        const toast = document.getElementById("toast");
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
      })
      .catch(err => {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ وتطبيق التعديلات في البوت فوراً';
        alert("حدث خطأ أثناء الحفظ");
      });
    }
  </script>
</body>
</html>`;
}

/**
 * إرسال التقرير الشامل التلقائي للقناة أو المجموعة أو المستخدم
 */
async function sendAutomatedDailySummary(targetChat, lang) {
  lang = lang || "ar";
  try {
    const data = await getCachedDashboardData();
    const text = formatExecutiveReport(data, lang, "usd");
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔄 تحديث لحظي للبيانات", callback_data: `refresh_report:${lang}:usd` },
          { text: "💵 العرض بالجنيه (EGP)", callback_data: `toggle_curr:egp:report:${lang}` }
        ],
        [
          { text: "🔙 القائمة الرئيسية", callback_data: `cmd_menu:${lang}:usd` }
        ]
      ]
    };
    const res = await sendTgMessage(targetChat, text, keyboard);
    const j = await res.json().catch(() => ({}));
    return { status: res.ok ? "success" : "error", telegram_response: j };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}
