/**
 * ==================================================================================
 * ⚡ EGX & GLOBAL MARKETS TELEGRAM BOT - CLOUDFLARE WORKER (v2 - reviewed edition)
 * ==================================================================================
 * Data sources:
 *  - Ta3weem.com: Central Bank + commercial banks USD rates, currencies, gold (EGP)
 *  - TradingView scanner: BTC, ETH, Brent, WTI, Gold, Silver (fallbacks: Coinbase / Yahoo)
 *  - Google Apps Script (or GitHub raw JSON): EGX institutional flows archive
 *
 * Required secrets / bindings:
 *  - BOT_TOKEN       (secret)  Telegram bot token
 *  - ADMIN_KEY       (secret)  protects /control, /api/config, /broadcast, /set_webhook, /set_commands
 *  - WEBHOOK_SECRET  (secret)  Telegram webhook secret_token (A-Z a-z 0-9 _ -)
 *  - STATE           (KV)      stores bot config + per-user preferences
 *  - CHANNEL_ID      (var, optional) default broadcast target
 *
 * Rules:
 *  - Missing data is shown as "N/A" - never replaced with hardcoded numbers
 *  - Egyptian week (EGX & banks) starts on Sunday
 *  - Cumulative totals start from 2026-10-01
 * ==================================================================================
 */

let BOT_TOKEN = "";
let ENV = {};

const DATA_API_URL = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec?action=data";
const GITHUB_RAW_DATA_URL = "https://raw.githubusercontent.com/cobraarsgb6-hub/EGX-Investor-Tracker/main/data/live_dashboard_data.json";
const CUMULATIVE_START = "2026-10-01";
const LINE = "<code>─────────────────────────────</code>";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_CONFIG = {
  hide_egx: false,
  hide_banks: false,
  hide_commodities: false,
  hide_currencies: false,
  hide_report: false,
  banks_count: 5,
  show_cbe_in_banks: true,
  show_best_banks: true,
  default_lang: "en",
  default_curr: "usd"
};

const CONFIG_BOOLS = ["hide_egx", "hide_banks", "hide_commodities", "hide_currencies", "hide_report", "show_cbe_in_banks", "show_best_banks"];

const TIMEZONES = {
  cairo: { id: "Africa/Cairo", name_ar: "القاهرة", name_en: "Cairo", flag: "🇪🇬" },
  riyadh: { id: "Asia/Riyadh", name_ar: "الرياض", name_en: "Riyadh", flag: "🇸🇦" },
  dubai: { id: "Asia/Dubai", name_ar: "دبي", name_en: "Dubai", flag: "🇦🇪" },
  london: { id: "Europe/London", name_ar: "لندن", name_en: "London", flag: "🇬🇧" },
  newyork: { id: "America/New_York", name_ar: "نيويورك", name_en: "New York", flag: "🇺🇸" }
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
// الأطول أولاً حتى لا يتطابق "بنك مصر" قبل "مصر إيران"
const BANK_KEYS_SORTED = Object.keys(BANK_EN_NAMES).sort((a, b) => b.length - a.length);

function getBankName(bankAr, lang) {
  if (lang !== "en" || !bankAr) return bankAr;
  for (const key of BANK_KEYS_SORTED) {
    if (bankAr.includes(key)) return BANK_EN_NAMES[key];
  }
  return bankAr;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// اسم البنك جاهز للعرض داخل رسائل HTML
function bn(bankAr, lang) {
  return escapeHtml(getBankName(bankAr, lang));
}

// ==========================================
// 🧠 الكاش والحالة (KV + ذاكرة)
// ==========================================

let configCache = { data: null, ts: 0 };
let memoryCache = { data: null, timestamp: 0 };
let sheetCache = { data: { archive: [], rates: [], banks: [] }, timestamp: 0, lastTry: 0, stale: false };
const prefCache = new Map();

async function kvGetJson(key) {
  if (!ENV.STATE) return null;
  try {
    const v = await ENV.STATE.get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    console.error("KV get failed:", key, e.message);
    return null;
  }
}

async function kvPutJson(key, val) {
  if (!ENV.STATE) return false;
  try {
    await ENV.STATE.put(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error("KV put failed:", key, e.message);
    return false;
  }
}

async function getLiveBotConfig() {
  const now = Date.now();
  if (configCache.data && (!ENV.STATE || now - configCache.ts < 15000)) return configCache.data;
  const stored = await kvGetJson("config");
  const cfg = { ...DEFAULT_CONFIG, ...(stored || {}) };
  configCache = { data: cfg, ts: now };
  return cfg;
}

function sanitizeConfig(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const k of CONFIG_BOOLS) {
    if (typeof body[k] === "boolean") out[k] = body[k];
  }
  const n = parseInt(body.banks_count, 10);
  if (n >= 1 && n <= 50) out.banks_count = n;
  if (["en", "ar"].includes(body.default_lang)) out.default_lang = body.default_lang;
  if (["usd", "egp"].includes(body.default_curr)) out.default_curr = body.default_curr;
  return out;
}

async function saveConfig(patch) {
  const current = await getLiveBotConfig();
  const next = { ...current, ...patch };
  configCache = { data: next, ts: Date.now() };
  await kvPutJson("config", next);
  return next;
}

async function getPrefs(chatId) {
  const key = `u:${chatId}`;
  const c = prefCache.get(key);
  if (c && (!ENV.STATE || Date.now() - c.ts < 30000)) return c.data;
  const data = (await kvGetJson(key)) || {};
  prefCache.set(key, { data, ts: Date.now() });
  return data;
}

async function setPrefs(chatId, patch) {
  const cur = await getPrefs(chatId);
  const changed = Object.keys(patch).some(k => cur[k] !== patch[k]);
  if (!changed) return cur;
  const next = { ...cur, ...patch };
  prefCache.set(`u:${chatId}`, { data: next, ts: Date.now() });
  await kvPutJson(`u:${chatId}`, next);
  return next;
}

// ==========================================
// 🔢 دوال التوقيت والتنسيق
// ==========================================

const fmtNum = (v, d = 2) => Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const dot = v => ((Number(v) || 0) >= 0 ? "🟢" : "🔴");
const toUsd = (n, rate) => (rate ? Math.round(n / rate) : 0);
const currBadge = curr => (curr === "usd" ? "USD ($)" : "EGP (ج.م)");

function timeoutSignal(ms) {
  return (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
}

// تاريخ القاهرة (YYYY-MM-DD) وليس UTC
function cairoToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

function cairoHM(d) {
  return d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function getCairoTimeStr() {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
}

/**
 * تحويل أي طابع زمني إلى Date.
 * النصوص بدون منطقة زمنية ("2026-10-06 11:01:10") تُعتبر UTC (مصدرها GitHub Actions).
 * يفضّل أن يكتب المصدر ISO مع Z.
 */
function parseTs(ts) {
  if (!ts) return null;
  let s = String(ts).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) s = `${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:${m[4] || "00"}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function format12HourTime(timeStr, lang) {
  if (!timeStr) return "";
  const m = String(timeStr).trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return timeStr;
  let h = parseInt(m[1], 10);
  const isPm = h >= 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  const suffix = lang === "en" ? (isPm ? "PM" : "AM") : (isPm ? "م" : "ص");
  return `${h}:${m[2]} ${suffix}`;
}

function getCairoFullDateTime(lang, tzKey) {
  const tzObj = TIMEZONES[tzKey || "cairo"] || TIMEZONES.cairo;
  const d = new Date();
  const time24 = d.toLocaleTimeString("en-GB", { timeZone: tzObj.id, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const parts = time24.split(":");
  let hNum = parseInt(parts[0], 10);
  const isPm = hNum >= 12;
  if (hNum === 0) hNum = 12;
  else if (hNum > 12) hNum -= 12;
  const hms = `${hNum}:${parts[1] || "00"}:${parts[2] || "00"}`;

  if (lang === "en") {
    const dateStr = d.toLocaleDateString("en-US", { timeZone: tzObj.id, weekday: "short", month: "short", day: "numeric", year: "numeric" });
    return `${dateStr} • ${hms} ${isPm ? "PM" : "AM"} (${tzObj.name_en})`;
  }
  const dateStrAr = d.toLocaleDateString("ar-EG-u-nu-latn", { timeZone: tzObj.id, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${dateStrAr} • ${hms} ${isPm ? "م" : "ص"} (بتوقيت ${tzObj.name_ar})`;
}

function extractTimeFromTimestamp(ts) {
  const d = parseTs(ts);
  if (d) return cairoHM(d);
  const match = String(ts || "").match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : getCairoTimeStr().slice(0, 5);
}

function formatCleanTime(val, lang) {
  const match = String(val || "").trim().match(/(\d{1,2}):(\d{2})/);
  if (match) return format12HourTime(`${match[1].padStart(2, "0")}:${match[2]}`, lang);
  return format12HourTime(getCairoTimeStr(), lang);
}

function getEgxSnapshotTime(data, lang) {
  const tsCandidate = data?.egx_institutions?.timestamp || data?.timestamp || (data?.archive && data.archive[0]?.created_at) || "";
  const d = parseTs(tsCandidate);
  return d ? format12HourTime(cairoHM(d), lang) : "";
}

function getBankSnapshotTime(data, lang) {
  let timeStr = "";
  let dateStr = "";
  const tsCandidate = data?.timestamp || (data?.banks && data.banks[0]?.created_at) || data?.cbe_updated_at || "";
  const dMatch = String(tsCandidate).match(/(\d{4}-\d{2}-\d{2})/);
  if (dMatch) dateStr = dMatch[1];

  const candidates = [data?.banks && data.banks[0]?.updated_at, data?.cbe_updated_at, tsCandidate];
  for (const c of candidates) {
    const m = String(c || "").match(/(\d{1,2}):(\d{2})/);
    if (m) { timeStr = `${m[1].padStart(2, "0")}:${m[2]}`; break; }
  }

  const formattedTime = timeStr ? format12HourTime(timeStr, lang) : "";
  if (!formattedTime) return "";

  if (dateStr) {
    try {
      const p = dateStr.split("-");
      const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12, 0, 0));
      const wd = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ar-EG", { timeZone: "Africa/Cairo", weekday: lang === "en" ? "short" : "long" }).format(d);
      return lang === "en" ? `${wd}, ${dateStr} • ${formattedTime}` : `${wd} ${dateStr} • ${formattedTime}`;
    } catch (e) {}
  }
  return formattedTime;
}

// ==========================================
// 🔐 الأمان
// ==========================================

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function isAdmin(request, env, url) {
  if (!env.ADMIN_KEY) return false;
  const key = request.headers.get("x-admin-key") || url.searchParams.get("key") || "";
  return safeEqual(key, env.ADMIN_KEY);
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" }
});

const ADMIN_PATHS = ["/set_webhook", "/set_commands", "/broadcast", "/control", "/api/config"];
const BOT_PATHS = ["/set_webhook", "/set_commands", "/broadcast", "/webhook"];

export default {
  async fetch(request, env, ctx) {
    ENV = env || {};
    if (!ENV.STATE && ENV.EGX_KV) ENV.STATE = ENV.EGX_KV;
    BOT_TOKEN = ENV.BOT_TOKEN || "";
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("🚀 EGX Telegram Bot Cloudflare Edge Worker is LIVE", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (ADMIN_PATHS.includes(url.pathname) && !isAdmin(request, ENV, url)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (BOT_PATHS.includes(url.pathname) && !BOT_TOKEN) {
      return json({ status: "error", message: "BOT_TOKEN secret is not configured" }, 500);
    }

    if (url.pathname === "/set_webhook") {
      if (!ENV.WEBHOOK_SECRET) return json({ status: "error", message: "WEBHOOK_SECRET is not configured" }, 500);
      const webhookUrl = url.origin + "/webhook";
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(ENV.WEBHOOK_SECRET)}`);
      return json(await tgRes.json());
    }

    if (url.pathname === "/set_commands") {
      const commands = [
        { command: "start", description: "Main menu / القائمة الرئيسية" },
        { command: "egx", description: "Institutional flows / تعاملات المؤسسات بالبورصة" },
        { command: "banks", description: "USD rates in Egyptian banks / أسعار الدولار بالبنوك والمركزي" },
        { command: "commodities", description: "Gold, oil & crypto / الذهب والنفط والكريبتو" },
        { command: "currencies", description: "Foreign currency rates / أسعار العملات" },
        { command: "report", description: "Full executive report / التقرير الشامل" }
      ];
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands })
      });
      return json(await tgRes.json());
    }

    if (url.pathname === "/control" && request.method === "GET") {
      return new Response(getControlHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/api/data" && request.method === "GET") {
      return json(await getCachedDashboardData());
    }

    if (url.pathname === "/api/config") {
      if (request.method === "GET") return json(await getLiveBotConfig());
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const cfg = await saveConfig(sanitizeConfig(body));
          return json({ status: "success", config: cfg });
        } catch (e) {
          return json({ status: "error", message: e.message }, 400);
        }
      }
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!ENV.WEBHOOK_SECRET || !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", ENV.WEBHOOK_SECRET)) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update).catch(e => console.error("update failed:", e && e.stack || e)));
      } catch (e) {
        console.error("bad webhook body:", e.message);
      }
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/broadcast") {
      const targetChat = url.searchParams.get("chat_id") || ENV.CHANNEL_ID || "@EgxTracker_LiveBot";
      const targetLang = url.searchParams.get("lang") === "en" ? "en" : "ar";
      return json(await sendAutomatedDailySummary(targetChat, targetLang));
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ENV = env || {};
    if (!ENV.STATE && ENV.EGX_KV) ENV.STATE = ENV.EGX_KV;
    BOT_TOKEN = ENV.BOT_TOKEN || "";
    if (!BOT_TOKEN) return;
    const targetChat = ENV.CHANNEL_ID || "@EgxTracker_LiveBot";
    ctx.waitUntil(sendAutomatedDailySummary(targetChat, "ar"));
  }
};

// ==========================================
// 📡 جلب البيانات الحية
// ==========================================

const CURR_META = {
  USD: { name: "الدولار الأمريكي", name_en: "US Dollar", flag: "🇺🇸" },
  EUR: { name: "اليورو الأوروبي", name_en: "Euro", flag: "🇪🇺" },
  GBP: { name: "الجنيه الإسترليني", name_en: "British Pound", flag: "🇬🇧" },
  SAR: { name: "الريال السعودي", name_en: "Saudi Riyal", flag: "🇸🇦" },
  AED: { name: "الدرهم الإماراتي", name_en: "UAE Dirham", flag: "🇦🇪" },
  QAR: { name: "الريال القطري", name_en: "Qatari Riyal", flag: "🇶🇦" },
  KWD: { name: "الدينار الكويتي", name_en: "Kuwaiti Dinar", flag: "🇰🇼" },
  BHD: { name: "الدينار البحريني", name_en: "Bahraini Dinar", flag: "🇧🇭" },
  OMR: { name: "الريال العماني", name_en: "Omani Rial", flag: "🇴🇲" },
  JOD: { name: "الدينار الأردني", name_en: "Jordanian Dinar", flag: "🇯🇴" },
  JPY: { name: "الين الياباني (100)", name_en: "Japanese Yen (100)", flag: "🇯🇵" },
  CHF: { name: "الفرنك السويسري", name_en: "Swiss Franc", flag: "🇨🇭" },
  CAD: { name: "الدولار الكندي", name_en: "Canadian Dollar", flag: "🇨🇦" },
  AUD: { name: "الدولار الأسترالي", name_en: "Australian Dollar", flag: "🇦🇺" },
  CNY: { name: "اليوان الصيني", name_en: "Chinese Yuan", flag: "🇨🇳" },
  SEK: { name: "الكرونة السويدية", name_en: "Swedish Krona", flag: "🇸🇪" },
  NOK: { name: "الكرونة النرويجية", name_en: "Norwegian Krone", flag: "🇳🇴" },
  DKK: { name: "الكرونة الدنماركية", name_en: "Danish Krone", flag: "🇩🇰" }
};

// أصول غير العملات تظهر في تقرير العملات (ذهب/فضة/طاقة/كريبتو) — أسماء ثنائية اللغة
const ASSET_META = {
  GOLD: { name: "أونصة الذهب", name_en: "Gold Ounce (XAU)", icon: "🏆" },
  GOLD21: { name: "ذهب عيار 21 (جرام)", name_en: "Gold 21K (Gram)", icon: "🥇" },
  GOLD24: { name: "ذهب عيار 24 (جرام)", name_en: "Gold 24K (Gram)", icon: "🥇" },
  GOLD18: { name: "ذهب عيار 18 (جرام)", name_en: "Gold 18K (Gram)", icon: "🥈" },
  GOLDC: { name: "جنيه الذهب", name_en: "Gold Pound Coin", icon: "🪙" },
  GOLD_OUNCE: { name: "أونصة الذهب", name_en: "Gold Ounce (XAU)", icon: "🏆" },
  SILVER: { name: "أونصة الفضة", name_en: "Silver Ounce (XAG)", icon: "🪙" },
  BRENT: { name: "نفط برنت (خام)", name_en: "Brent Crude Oil", icon: "🛢️" },
  WTI: { name: "خام غرب تكساس (WTI)", name_en: "WTI Crude Oil", icon: "⚡" },
  BTC: { name: "بتكوين", name_en: "Bitcoin", icon: "🪙" },
  ETH: { name: "إيثريوم", name_en: "Ethereum", icon: "🔷" }
};

const FIAT_CODES = Object.keys(CURR_META);
// كل عملات تعويم غير الموجودة في الصفحة الرئيسية (13 عملة)
const EXTRA_FX = ["QAR", "KWD", "BHD", "JPY", "JOD", "OMR", "CHF", "SEK", "NOK", "DKK", "CNY", "CAD", "AUD"];

const stripTags = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/**
 * العملات والذهب من الصفحة الرئيسية لتعويم.
 * المطابقة بالـ slug الموجود في الرابط (كود العملة) وليس بعنوان البطاقة.
 */
async function fetchTa3weemLiveCurrencies() {
  try {
    const res = await fetch("https://ta3weem.com/ar", { headers: { "User-Agent": UA }, signal: timeoutSignal(6000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const cards = html.match(/<a[^>]*href=["']https:\/\/ta3weem\.com\/ar\/(?:currency-exchange-rates|gold-prices)[^"']*["'][^>]*>[\s\S]*?<\/a>/g) || [];
    if (!cards.length) throw new Error("no cards found (page layout changed?)");

    const items = {};
    for (const card of cards) {
      const href = (card.match(/href=["']([^"']+)["']/) || [])[1] || "";
      const titleM = card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      const priceM = card.match(/<span[^>]*class=["'][^"']*text-blue-500[^"']*["'][^>]*>([\s\S]*?)<\/span>/);
      const chgM = card.match(/<span[^>]*class=["'][^"']*text-(green|red)-700[^"']*["'][^>]*>([\s\S]*?)<\/span>/);
      if (!titleM || !priceM) continue;
      const title = stripTags(titleM[1]);
      const price = parseFloat(stripTags(priceM[1]).replace(/,/g, ""));
      if (!(price > 0)) continue;

      let chg = "0.0%";
      if (chgM) {
        chg = stripTags(chgM[2]);
        if (chgM[1] === "red" && !chg.startsWith("-")) chg = "-" + chg.replace(/^\+/, "");
        else if (chgM[1] === "green" && !chg.startsWith("+") && !chg.startsWith("-")) chg = "+" + chg;
      }

      const curM = href.match(/currency-exchange-rates\/([A-Za-z]{3})-?EGP/i);
      if (curM) {
        const code = curM[1].toUpperCase();
        if (CURR_META[code]) items[code] = { code, ...CURR_META[code], price, change: chg };
        continue;
      }
      if (href.includes("gold-prices")) {
        const slug = ((href.match(/gold-prices\/([A-Za-z0-9]+)/) || [])[1] || "").toUpperCase();
        const GOLD_SLUGS = { GOLD24K: "GOLD24", GOLD21K: "GOLD21", GOLD18K: "GOLD18", GOLDPOUND: "GOLDC" };
        let code = GOLD_SLUGS[slug];
        if (!code) { // مسار احتياطي بالعنوان لو تغيّر الـ slug
          if (title.includes("جنيه الذهب")) code = "GOLDC";
          else if (title.includes("21")) code = "GOLD21";
          else if (title.includes("24")) code = "GOLD24";
          else if (title.includes("18")) code = "GOLD18";
        }
        if (code) items[code] = { code, price, change: chg };
      }
    }
    return Object.keys(items).length > 0 ? items : null;
  } catch (e) {
    console.error("ta3weem currencies failed:", e.message);
    return null;
  }
}

/**
 * تحليل صفحة عملة في تعويم (USD-EGP, KWD-EGP, ...): بطاقة البنك المركزي + جدول البنوك
 */
function parseTa3weemFxHtml(html) {
  let cbe = null;
  const cbeIdx = html.indexOf('alt="البنك المركزي (CBE)"');
  if (cbeIdx !== -1) {
    const cardEnd = html.indexOf("</a>", cbeIdx);
    const card = html.substring(cbeIdx, cardEnd !== -1 ? cardEnd : cbeIdx + 2000);
    const buyM = card.match(/شراء[\s\S]*?text-blue-500[^>]*>([\s\S]*?)<\/span>/);
    const sellM = card.match(/بيع[\s\S]*?text-blue-500[^>]*>([\s\S]*?)<\/span>/);
    if (buyM && sellM) {
      const buy = parseFloat(buyM[1].trim());
      const sell = parseFloat(sellM[1].trim());
      if (buy > 0 && sell > 0) cbe = { buy, sell, updated_at: getCairoTimeStr() };
    }
  }

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const banks = [];
  for (let i = 1; i < rows.length; i++) {
    const tds = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    if (tds.length < 4) continue;
    const name = stripTags(tds[0]);
    const buyM = stripTags(tds[1]).match(/(\d+\.\d+)/);
    const sellM = stripTags(tds[2]).match(/(\d+\.\d+)/);
    const timeM = stripTags(tds[3]).match(/(\d{1,2}:\d{2})/);
    if (!name || !buyM || !sellM) continue;
    const buy = parseFloat(buyM[1]), sell = parseFloat(sellM[1]);
    if (!(buy > 0) || !(sell > 0)) continue; // تجاهل البنوك اللي سعرها 0.00 (مش محدث)
    banks.push({ bank: name, buy, sell, updated_at: timeM ? timeM[1] : "اليوم" });
  }
  return { cbe, banks };
}

async function fetchTa3weemFxPage(code) {
  const url = `https://ta3weem.com/ar/currency-exchange-rates/${code}-EGP`;
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ua = attempt === 0 ? UA : "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
      const res = await fetch(url, { headers: { "User-Agent": ua }, signal: timeoutSignal(9000) });
      if (res.ok) {
        return parseTa3weemFxHtml(await res.text());
      }
      lastErr = new Error(`${code} HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`${code} fetch failed`);
}

/**
 * البنك المركزي والبنوك التجارية (دولار) من تعويم
 */
async function fetchTa3weemLive() {
  try {
    const { cbe, banks } = await fetchTa3weemFxPage("USD");
    if (!cbe && !banks.length) throw new Error("nothing parsed (page layout changed?)");
    return { banks: banks.length ? banks : null, cbe };
  } catch (e) {
    console.error("ta3weem banks failed:", e.message);
    return null;
  }
}

/**
 * العملات الإضافية (EXTRA_FX): السعر = أعلى سعر شراء بين البنوك (زي الصفحة الرئيسية)،
 * وشراء/بيع = أسعار البنك المركزي. كاش 3 دقائق لتوفير الطلبات.
 */
let fxExtraCache = { data: null, ts: 0 };
async function fetchTa3weemExtraFx() {
  const now = Date.now();
  if (fxExtraCache.data && now - fxExtraCache.ts < 180000) return fxExtraCache.data;
  const results = await Promise.allSettled(EXTRA_FX.map(fetchTa3weemFxPage));
  const out = {};
  results.forEach((r, i) => {
    const code = EXTRA_FX[i];
    if (r.status !== "fulfilled") { console.error("ta3weem fx failed:", code, r.reason && r.reason.message); return; }
    const { cbe, banks } = r.value;
    const top = banks.reduce((m, b) => Math.max(m, b.buy), 0);
    // سعر CBE الرسمي (منتصف الشراء/البيع) ليتطابق مع الداشبورد، والاحتياطي أعلى شراء
    const price = cbe ? Number(((cbe.buy + cbe.sell) / 2).toFixed(2)) : top;
    if (price > 0) out[code] = { code, ...CURR_META[code], price, buy: cbe ? cbe.buy : null, sell: cbe ? cbe.sell : null };
  });
  if (Object.keys(out).length) { fxExtraCache = { data: out, ts: now }; return out; }
  return (fxExtraCache.data && now - fxExtraCache.ts < 600000) ? fxExtraCache.data : null;
}

async function tvScan(market, tickers) {
  const res = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ symbols: { tickers }, columns: ["close", "change"] }),
    signal: timeoutSignal(6000)
  });
  if (!res.ok) throw new Error(`TradingView ${market} HTTP ${res.status}`);
  const j = await res.json();
  return j.data || [];
}

const pctStr = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? (n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "+0.00%";
};

/**
 * الأسواق اللحظية: كريبتو، ذهب، فضة، برنت و WTI (القيمة 0 = غير متاح)
 */
async function fetchTradingViewLiveMarket() {
  const r = { btc: 0, btc_chg: "+0.00%", eth: 0, eth_chg: "+0.00%", brent: 0, brent_chg: "+0.00%", wti: 0, wti_chg: "+0.00%", gold_ounce: 0, gold_chg: "+0.00%", silver: 0, silver_chg: "+0.00%", usd_egp: 0 };

  const results = await Promise.allSettled([
    tvScan("crypto", ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]),
    tvScan("cfd", ["FX:UKOIL", "FX:USOIL", "TVC:GOLD", "TVC:SILVER"]),
    tvScan("forex", ["FX_IDC:USDEGP"])
  ]);

  const map = {
    "BINANCE:BTCUSDT": ["btc", "btc_chg"],
    "BINANCE:ETHUSDT": ["eth", "eth_chg"],
    "FX:UKOIL": ["brent", "brent_chg"],
    "FX:USOIL": ["wti", "wti_chg"],
    "TVC:GOLD": ["gold_ounce", "gold_chg"],
    "TVC:SILVER": ["silver", "silver_chg"],
    "FX_IDC:USDEGP": ["usd_egp", null]
  };

  results.forEach(p => {
    if (p.status !== "fulfilled") { console.error("TradingView failed:", p.reason && p.reason.message); return; }
    p.value.forEach(item => {
      const target = map[item.s];
      const val = parseFloat(item.d?.[0]);
      if (!target || !(val > 0)) return;
      r[target[0]] = val;
      if (target[1]) r[target[1]] = pctStr(item.d?.[1]);
    });
  });

  // مسارات احتياطية (بدون أي قيم ثابتة)
  try {
    if (!r.btc || !r.eth) {
      const [cbBtc, cbEth] = await Promise.all([
        fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { signal: timeoutSignal(5000) }).then(x => x.json()).catch(() => null),
        fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: timeoutSignal(5000) }).then(x => x.json()).catch(() => null)
      ]);
      if (!r.btc && cbBtc?.data?.amount) r.btc = parseFloat(cbBtc.data.amount);
      if (!r.eth && cbEth?.data?.amount) r.eth = parseFloat(cbEth.data.amount);
    }
    if (!r.brent) {
      const y = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d", { headers: { "User-Agent": "Mozilla/5.0" }, signal: timeoutSignal(5000) }).then(x => x.json()).catch(() => null);
      const bPrice = y?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (bPrice) r.brent = parseFloat(bPrice);
    }
    if (!r.gold_ounce) {
      // PAXG (توكن مدعوم بالذهب) كبديل تقريبي لأونصة الذهب
      const g = await fetch("https://api.coinbase.com/v2/prices/PAXG-USD/spot", { signal: timeoutSignal(5000) }).then(x => x.json()).catch(() => null);
      if (g?.data?.amount) r.gold_ounce = parseFloat(g.data.amount);
    }
  } catch (e) {
    console.error("market fallbacks failed:", e.message);
  }
  return r;
}

// ترتيب الأرشيف من الأحدث للأقدم وإزالة التواريخ المكررة (نحتفظ بآخر نسخة)
function normalizeArchive(arch) {
  if (!Array.isArray(arch)) return [];
  const sorted = arch.filter(r => r && r.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const out = [];
  for (const r of sorted) {
    if (out.length && out[out.length - 1].date === r.date) out[out.length - 1] = r;
    else out.push(r);
  }
  return out;
}

async function getCachedDashboardData() {
  const now = Date.now();
  if (memoryCache.data && now - memoryCache.timestamp < 10000) return memoryCache.data;

  const liveClock = getCairoTimeStr();

  // 1. شيت البورصة (كاش 60 ثانية، ومحاولة جديدة كل 15 ثانية كحد أدنى عند الفشل)
  if ((sheetCache.stale || !sheetCache.timestamp || now - sheetCache.timestamp > 60000) && now - sheetCache.lastTry > 15000) {
    sheetCache.lastTry = now;
    sheetCache.stale = false;
    const accept = j => j && ((Array.isArray(j.archive) && j.archive.length > 0) || (Array.isArray(j.banks) && j.banks.length > 0));
    let fresh = null;
    try {
      const r = await fetch(DATA_API_URL, { headers: { "User-Agent": "Cloudflare-Worker-EGX" }, signal: timeoutSignal(5000), redirect: "follow" });
      if (r.ok) { const j = await r.json(); if (accept(j)) fresh = j; }
    } catch (e) { console.error("sheet fetch failed:", e.message); }
    if (!fresh) {
      try {
        const r = await fetch(GITHUB_RAW_DATA_URL, { headers: { "User-Agent": "Cloudflare-Worker-EGX" }, signal: timeoutSignal(5000) });
        if (r.ok) { const j = await r.json(); if (accept(j)) fresh = j; }
      } catch (e) { console.error("github fetch failed:", e.message); }
    }
    if (fresh) {
      sheetCache.data = { ...fresh, archive: normalizeArchive(fresh.archive) };
      sheetCache.timestamp = now;
    }
  }
  const sheetData = sheetCache.data || {};

  // 2. المصادر الحية بالتوازي
  const settled = await Promise.allSettled([fetchTa3weemLive(), fetchTradingViewLiveMarket(), fetchTa3weemLiveCurrencies(), fetchTa3weemExtraFx()]);
  settled.forEach(s => { if (s.status === "rejected") console.error("source rejected:", s.reason && s.reason.message); });
  const ta = settled[0].status === "fulfilled" ? settled[0].value : null;
  const tv = (settled[1].status === "fulfilled" && settled[1].value) || {};
  const currs = settled[2].status === "fulfilled" ? settled[2].value : null;
  const extraFx = settled[3].status === "fulfilled" ? settled[3].value : null;

  const archive = Array.isArray(sheetData.archive) ? sheetData.archive : [];

  // البنك المركزي
  const cbeLive = ta && ta.cbe;
  const cbeBuy = (cbeLive && cbeLive.buy > 40) ? cbeLive.buy
    : (tv.usd_egp > 40 ? tv.usd_egp : (Number(sheetData.cbe_usd_buy) > 40 ? Number(sheetData.cbe_usd_buy) : null));
  const cbeSell = (cbeLive && cbeLive.sell > 40) ? cbeLive.sell
    : (Number(sheetData.cbe_usd_sell) > 40 ? Number(sheetData.cbe_usd_sell) : null);
  const cbeTime = cbeLive ? cbeLive.updated_at : (sheetData.cbe_updated_at || "");

  // سعر الدولار المعتمد (null = غير متاح)
  const usdRate = (currs?.USD?.price > 40) ? currs.USD.price
    : (cbeBuy || Number(sheetData.usd_rate) || Number(archive[0]?.usd_rate) || null);

  // البنوك
  const banksLive = !!(ta && ta.banks && ta.banks.length);
  const banksSrc = banksLive ? ta.banks : (Array.isArray(sheetData.banks) ? sheetData.banks : []);
  const banks = banksSrc.slice().sort((a, b) => (Number(b.buy) || 0) - (Number(a.buy) || 0));

  // السلع
  const egp = usd => (usd > 0 && usdRate ? Math.round(usd * usdRate * 100) / 100 : null);
  const mk = (code, name, name_en, usd, chg, egpOverride) => ({
    code, name, name_en,
    usd_price: usd > 0 ? usd : null,
    egp_price: egpOverride || egp(usd),
    change: usd > 0 ? chg : null,
    updated_at: usd > 0 ? liveClock : null
  });

  const goldOunce = tv.gold_ounce > 0 ? tv.gold_ounce : 0;
  const g24 = goldOunce ? Number((goldOunce / 31.1035).toFixed(2)) : 0;
  const g21 = g24 ? Number((g24 * 21 / 24).toFixed(2)) : 0;
  const g18 = g24 ? Number((g24 * 18 / 24).toFixed(2)) : 0;

  const live_commodities = [
    mk("BTC", "بتكوين (Bitcoin)", "Bitcoin (BTC)", tv.btc, tv.btc_chg),
    mk("ETH", "إيثيريوم (Ethereum)", "Ethereum (ETH)", tv.eth, tv.eth_chg),
    mk("BRENT", "نفط برنت (خام)", "Brent Crude Oil", tv.brent, tv.brent_chg),
    mk("WTI", "خام غرب تكساس (WTI)", "WTI Crude Oil", tv.wti, tv.wti_chg),
    mk("GOLD_OUNCE", "أونصة الذهب (Gold Ounce)", "Gold (Ounce)", goldOunce, tv.gold_chg),
    mk("GOLD24", "ذهب عيار 24 (جرام)", "Gold 24K (Gram)", g24, currs?.GOLD24?.change || tv.gold_chg, currs?.GOLD24?.price),
    mk("GOLD21", "ذهب عيار 21 (جرام)", "Gold 21K (Gram)", g21, currs?.GOLD21?.change || tv.gold_chg, currs?.GOLD21?.price),
    mk("GOLD18", "ذهب عيار 18 (جرام)", "Gold 18K (Gram)", g18, currs?.GOLD18?.change || tv.gold_chg, currs?.GOLD18?.price),
    mk("SILVER", "أونصة الفضة (Silver)", "Silver (Ounce)", tv.silver, tv.silver_chg)
  ];

  // العملات: ما جاء فعلاً من تعويم + احتياطي كامل من بيانات السحابة (sheetData)
  const rates = [];
  if (usdRate) {
    rates.push({ code: "USD", ...CURR_META.USD, usd_price: 1, egp_price: usdRate, rate_egp: usdRate, buy: cbeBuy, sell: cbeSell, change: currs?.USD?.change || null });
  }
  ["EUR", "SAR", "AED", "GBP"].forEach(code => {
    const c = currs && currs[code];
    if (!c) return;
    rates.push({ code, name: c.name, name_en: c.name_en, usd_price: usdRate ? Number((c.price / usdRate).toFixed(4)) : null, egp_price: c.price, rate_egp: c.price, change: c.change });
  });
  EXTRA_FX.forEach(code => {
    const c = extraFx && extraFx[code];
    if (!c) return;
    rates.push({ code, name: c.name, name_en: c.name_en, usd_price: usdRate ? Number((c.price / usdRate).toFixed(4)) : null, egp_price: c.price, rate_egp: c.price, buy: c.buy, sell: c.sell, change: null });
  });

  // Fallback to sheetData.rates if live Ta3weem scrape was blocked or returned only USD
  if (rates.length <= 1 && Array.isArray(sheetData.rates) && sheetData.rates.length > 0) {
    sheetData.rates.forEach(r => {
      const cCode = (r.code || "").toUpperCase();
      if (cCode === "USD" || rates.some(x => x.code === cCode)) return;
      const meta = CURR_META[cCode] || ASSET_META[cCode] || { name: r.name, name_en: r.name_en || r.name };
      const eP = Number(r.egp_price || r.rate_egp || 0);
      const uP = r.usd_price ? Number(r.usd_price) : (usdRate && eP ? Number((eP / usdRate).toFixed(4)) : null);
      rates.push({
        code: cCode,
        name: meta.name || r.name,
        name_en: meta.name_en || r.name_en || r.name,
        usd_price: uP,
        egp_price: eP,
        rate_egp: eP,
        buy: r.buy,
        sell: r.sell,
        change: r.change || null
      });
    });
  }

  const sources = {
    sheet: sheetCache.timestamp > 0 && now - sheetCache.timestamp < 5 * 60000,
    banks: banksLive || (Array.isArray(banks) && banks.length > 0),
    cbe: !!cbeLive || !!cbeBuy,
    currencies: !!currs || (rates.length > 1),
    fx_extra: !!extraFx || (rates.length > 1),
    markets: !!(tv.btc || tv.brent || tv.gold_ounce)
  };

  const fullData = {
    usd_rate: usdRate,
    cbe_usd_buy: cbeBuy,
    cbe_usd_sell: cbeSell,
    cbe_updated_at: cbeTime,
    timestamp: sheetData.timestamp || "",
    egx_institutions: sheetData.egx_institutions || sheetData.latest_egx || null,
    archive,
    rates,
    banks,
    live_commodities,
    sources
  };

  memoryCache = { data: fullData, timestamp: now };
  return fullData;
}

// ==========================================
// 🤖 معالجة أوامر تلجرام
// ==========================================

function renderReport(type, data, lang, curr, cfg, tz) {
  switch (type) {
    case "report": return formatExecutiveReport(data, lang, curr, tz);
    case "egx": return formatEgxReport(data, lang, curr, tz);
    case "history": case "archive": return formatEgxPeriodicReport(data, "curr_month", lang, curr, null, tz);
    case "banks": return formatBanksReport(data, lang, cfg, tz);
    case "banks_all": return formatAllBanksReport(data, lang, tz);
    case "commodities": case "gold": return formatCommoditiesReport(data, lang, tz);
    case "currencies": case "markets": return formatCurrenciesReport(data, lang, tz);
    default: return null;
  }
}

const KB_TYPE = { gold: "commodities", markets: "currencies", archive: "history" };

async function handleTelegramUpdate(update) {
  let chatId = null, text = "", callbackId = null, messageId = null;
  let isCallback = false, isPrivate = true;

  if (update.callback_query) {
    isCallback = true;
    callbackId = update.callback_query.id;
    messageId = update.callback_query.message?.message_id;
    chatId = update.callback_query.message?.chat?.id;
    text = update.callback_query.data || "";
  } else if (update.message) {
    chatId = update.message.chat.id;
    isPrivate = update.message.chat.type === "private";
    text = (update.message.text || "").trim().replace(/^(\/\w+)@\w+/, "$1");
  }
  if (!chatId) return;

  // الأزرار التي تعرض رسالة منبثقة تُجاب لاحقاً، والباقي فوراً
  const toastCbs = ["refresh_", "toggle_curr:", "hist_curr:", "set_tz:"];
  if (isCallback && callbackId && !toastCbs.some(p => text.startsWith(p))) {
    try { await answerCallback(callbackId); } catch (e) {}
  }

  const cfg = await getLiveBotConfig();
  const prefs = await getPrefs(chatId);
  let curr = prefs.curr || cfg.default_curr || "usd";
  let lang = prefs.lang || cfg.default_lang || "en";
  const tz = TIMEZONES[prefs.tz] ? prefs.tz : "cairo";

  // لاحقات العملة واللغة موجودة في بيانات الأزرار فقط
  if (isCallback) {
    const patch = {};
    if (text.endsWith(":usd") || text.endsWith(":egp")) { curr = text.slice(-3); text = text.slice(0, -4); patch.curr = curr; }
    if (text.endsWith(":en") || text.endsWith(":ar")) { lang = text.slice(-2); text = text.slice(0, -3); patch.lang = lang; }
    if (Object.keys(patch).length) await setPrefs(chatId, patch);
  }

  if (text.startsWith("cmd_lang_en") || text === "/en") {
    await setPrefs(chatId, { lang: "en" });
    await sendMainMenu(chatId, "en", cfg, isCallback ? messageId : null, tz);
    return;
  }
  if (text.startsWith("cmd_lang_ar") || text === "/ar") {
    await setPrefs(chatId, { lang: "ar" });
    await sendMainMenu(chatId, "ar", cfg, isCallback ? messageId : null, tz);
    return;
  }

  const reply = (txt, kb) => (isCallback && messageId) ? editTgMessage(chatId, messageId, txt, kb) : sendTgMessage(chatId, txt, kb);
  const toast = async msg => { if (callbackId) { try { await answerCallback(callbackId, msg); } catch (e) {} } };

  // ===== أزرار الـ Inline =====
  if (isCallback) {
    if (text.startsWith("toggle_curr:")) {
      const parts = text.split(":");
      const newCurr = parts[1] === "egp" ? "egp" : "usd";
      const type = parts[2] || "report";
      await setPrefs(chatId, { curr: newCurr });
      const data = await getCachedDashboardData();
      const content = renderReport(type, data, lang, newCurr, cfg, tz);
      await toast(lang === "en" ? `💱 Switched to ${newCurr.toUpperCase()}!` : `💱 تم التحويل إلى ${newCurr === "usd" ? "الدولار" : "الجنيه"}!`);
      if (content) await reply(content, getReportKeyboard(KB_TYPE[type] || type, lang, cfg, newCurr));
      return;
    }

    if (text.startsWith("refresh_")) {
      const target = text.replace("refresh_", "").split(":")[0];
      memoryCache.timestamp = 0;
      sheetCache.stale = true;
      if (target === "menu") { await toast(lang === "en" ? "⚡ Refreshed!" : "⚡ تم التحديث!"); await sendMainMenu(chatId, lang, cfg, messageId, tz); return; }
      const data = await getCachedDashboardData();
      const content = renderReport(target, data, lang, curr, cfg, tz);
      await toast(lang === "en" ? "⚡ Live data refreshed!" : "⚡ تم تحديث الأسعار لحظياً!");
      if (!content) { await sendMainMenu(chatId, lang, cfg, messageId, tz); return; }
      await reply(content, getReportKeyboard(KB_TYPE[target] || target, lang, cfg, curr));
      return;
    }

    if (text.startsWith("hist_p:")) {
      const period = text.split(":")[1] || "curr_month";
      const data = await getCachedDashboardData();
      await reply(formatEgxPeriodicReport(data, period, lang, curr, null, tz), getHistoryKeyboard(lang, curr, period));
      return;
    }

    if (text.startsWith("hist_curr:")) {
      const parts = text.split(":");
      const newCurr = parts[1] === "egp" ? "egp" : "usd";
      const period = parts[2] || "curr_month";
      await setPrefs(chatId, { curr: newCurr });
      const data = await getCachedDashboardData();
      await toast(lang === "en" ? `💱 Switched to ${newCurr.toUpperCase()}!` : `💱 تم التحويل إلى ${newCurr === "usd" ? "الدولار" : "الجنيه"}!`);
      await reply(formatEgxPeriodicReport(data, period, lang, newCurr, null, tz), getHistoryKeyboard(lang, newCurr, period));
      return;
    }

    if (text.startsWith("cmd_timezone")) {
      const title = lang === "en" ? "🌍 <b>Select Your Preferred Timezone:</b>" : "🌍 <b>اختر منطقتك الزمنية المفضلة لعرض الأوقات:</b>";
      await reply(title, getTimezoneKeyboard(lang, tz));
      return;
    }

    if (text.startsWith("set_tz:")) {
      const newTz = TIMEZONES[text.split(":")[1]] ? text.split(":")[1] : "cairo";
      await setPrefs(chatId, { tz: newTz });
      const tzObj = TIMEZONES[newTz];
      await toast(lang === "en" ? `✅ Timezone set to ${tzObj.name_en}` : `✅ تم ضبط التوقيت على ${tzObj.name_ar}`);
      await sendMainMenu(chatId, lang, cfg, messageId, newTz);
      return;
    }

    if (text === "cmd_menu") { await sendMainMenu(chatId, lang, cfg, messageId, tz); return; }

    if (text.startsWith("cmd_")) {
      const type = text.slice(4);
      const data = await getCachedDashboardData();
      const content = renderReport(type, data, lang, curr, cfg, tz);
      if (!content) return;
      const kb = (type === "history" || type === "archive")
        ? getHistoryKeyboard(lang, curr, "curr_month")
        : getReportKeyboard(KB_TYPE[type] || type, lang, cfg, curr);
      await reply(content, kb);
    }
    return;
  }

  // ===== رسائل نصية =====
  const lower = text.toLowerCase();
  const cmd = lower.split(/\s+/)[0];
  const has = (...words) => isPrivate && words.some(w => lower.includes(w));

  const isHistory = ["/history", "/archive"].includes(cmd) || has("ارشيف", "أرشيف", "اقفال", "إقفال");
  const isCommodities = ["/commodities", "/gold", "/oil", "/crypto"].includes(cmd) || has("ذهب", "نفط", "بنزين", "بترول", "كريبتو", "سلع");
  const isCurrencies = ["/currencies", "/rates"].includes(cmd) || has("عملات", "عملة", "اسعار الصرف");
  const isEgx = cmd === "/egx" || has("بورصة", "مؤسسات", "اسهم", "اجانب", "أجانب");
  const isBanks = cmd === "/banks" || has("بنوك", "بنك", "دولار");
  const isReport = cmd === "/report" || has("تقرير", "تنفيذي");
  const isTimezone = ["/timezone", "/tz"].includes(cmd) || has("توقيت", "منطقة زمنية");
  const isMenu = ["/start", "/help"].includes(cmd) || has("قائمة") || lower === "menu";

  if (isMenu) {
    await sendMainMenu(chatId, lang, cfg, null, tz);
  } else if (isTimezone) {
    const title = lang === "en" ? "🌍 <b>Select Your Preferred Timezone:</b>" : "🌍 <b>اختر منطقتك الزمنية المفضلة لعرض الأوقات:</b>";
    await sendTgMessage(chatId, title, getTimezoneKeyboard(lang, tz));
  } else if (isHistory) {
    const rawTokens = text.split(/\s+/).slice(1);
    let period = "curr_month";
    let customParam = null;
    const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (rawTokens.length >= 2 && isDate(rawTokens[0]) && isDate(rawTokens[1])) {
      period = "custom";
      const [a, b] = rawTokens;
      customParam = { start: a <= b ? a : b, end: a <= b ? b : a };
    } else if (rawTokens.length >= 1) {
      const t0 = rawTokens[0].toLowerCase();
      if (["week", "w", "curr_week"].includes(t0) || t0.includes("اسبوع") || t0.includes("أسبوع")) period = "curr_week";
      else if (["prev_week", "last_week", "lw"].includes(t0) || t0.includes("ماضي")) period = "prev_week";
      else if (["month", "m", "curr_month"].includes(t0) || t0.includes("شهر")) period = "curr_month";
      else if (["prev_month", "last_month", "lm"].includes(t0)) period = "prev_month";
      else if (t0 === "3") period = "last3";
      else if (t0 === "5") period = "last5";
      else if (t0 === "10") period = "last10";
    }
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, formatEgxPeriodicReport(data, period, lang, curr, customParam, tz), getHistoryKeyboard(lang, curr, period));
  } else if (isCommodities || isCurrencies || isEgx || isBanks || isReport) {
    const type = isCommodities ? "commodities" : isCurrencies ? "currencies" : isEgx ? "egx" : isBanks ? "banks" : "report";
    const data = await getCachedDashboardData();
    await sendTgMessage(chatId, renderReport(type, data, lang, curr, cfg, tz), getReportKeyboard(type, lang, cfg, curr));
  } else if (cmd.startsWith("/") && isPrivate) {
    await sendTgMessage(chatId, lang === "en" ? "❓ Unknown command. Type /start for menu." : "❓ أمر غير معروف. اضغط /start لعرض القائمة الرئيسية.", getMenuKeyboard(lang, cfg));
  }
}

// ==========================================
// 🎨 أدوات حساب التراكمي والحالة
// ==========================================

function getTrendIcon(change) {
  if (!change) return "";
  const s = String(change).trim();
  if (s.startsWith("+")) return " 🟢";
  if (s.startsWith("-")) return " 🔴";
  const num = parseFloat(s.replace("%", ""));
  if (!isNaN(num)) return num > 0 ? " 🟢" : num < 0 ? " 🔴" : "";
  return "";
}

// بداية الأسبوع للبورصة والبنوك المصرية: الأحد
function getWeekSunday(dateStr) {
  if (!dateStr) return cairoToday();
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split("T")[0];
}

function getMonthLabel(monthPrefix, lang) {
  if (!monthPrefix) return "";
  const [year, m] = monthPrefix.split("-");
  const ar = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const en = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const idx = parseInt(m, 10) - 1;
  return `${(lang === "en" ? en : ar)[idx] || m} ${year}`;
}

const pickNum = (r, a, b) => {
  const v = r[a] !== undefined ? r[a] : r[b];
  return (v !== undefined && v !== null && v !== "") ? Number(v) : null;
};

function calculatePeriodicTotals(archive, sessionDate, defaultRate) {
  sessionDate = sessionDate || cairoToday();
  const weekStart = getWeekSunday(sessionDate);
  const monthPrefix = sessionDate.slice(0, 7);
  const blank = () => ({ count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0 });
  const weekly = { ...blank(), weekStart };
  const monthly = { ...blank(), monthPrefix };

  const add = (t, v) => {
    t.count++;
    t.egNet += v.eg; t.arNet += v.ar; t.foNet += v.fo; t.totNet += v.tot;
    t.egUsd += v.egU; t.arUsd += v.arU; t.foUsd += v.foU; t.totUsd += v.totU;
  };

  (Array.isArray(archive) ? archive : []).forEach(s => {
    if (!s || !s.date || s.date < CUMULATIVE_START || s.date > sessionDate) return;
    const rate = Number(s.usd_rate || defaultRate) || 0;
    const eg = pickNum(s, "egypt_net", "egypt_net_egp") || 0;
    const ar = pickNum(s, "arab_net", "arab_net_egp") || 0;
    const fo = pickNum(s, "foreign_net", "foreign_net_egp") || 0;
    const t = pickNum(s, "total_net", "total_net_egp");
    const tot = t !== null ? t : eg + ar + fo;
    const v = { eg, ar, fo, tot, egU: toUsd(eg, rate), arU: toUsd(ar, rate), foU: toUsd(fo, rate), totU: toUsd(tot, rate) };
    if (s.date >= weekStart) add(weekly, v);
    if (s.date.startsWith(monthPrefix)) add(monthly, v);
  });

  weekly.arFoNet = weekly.arNet + weekly.foNet;
  weekly.arFoUsd = weekly.arUsd + weekly.foUsd;
  monthly.arFoNet = monthly.arNet + monthly.foNet;
  monthly.arFoUsd = monthly.arUsd + monthly.foUsd;
  return { weekly, monthly };
}

// آخر جلسة (مع مسار احتياطي من egx_institutions)
function getSessionFlows(data) {
  const out = { egNet: 0, arNet: 0, foNet: 0, totNet: 0, sessionDate: cairoToday(), sessionRate: 0 };
  const r = data.archive && data.archive[0];
  if (r) {
    out.egNet = pickNum(r, "egypt_net", "egypt_net_egp") ?? 0;
    out.arNet = pickNum(r, "arab_net", "arab_net_egp") ?? 0;
    out.foNet = pickNum(r, "foreign_net", "foreign_net_egp") ?? 0;
    const t = pickNum(r, "total_net", "total_net_egp");
    out.totNet = t !== null ? t : out.egNet + out.arNet + out.foNet;
    out.sessionDate = r.date || out.sessionDate;
    out.sessionRate = Number(r.usd_rate) || 0;
  }
  const inst = data.egx_institutions?.tables?.institutions;
  if (Array.isArray(inst)) {
    inst.forEach(item => {
      const t = (item.type || "").toLowerCase();
      const net = Number(item.net_egp || 0);
      if (t.includes("أجانب") || t.includes("اجانب") || t.includes("foreign")) { if (out.foNet === 0) out.foNet = net; }
      else if (t.includes("عرب") || t.includes("arab")) { if (out.arNet === 0) out.arNet = net; }
      else if (t.includes("مصر") || t.includes("egypt")) { if (out.egNet === 0) out.egNet = net; }
    });
    if (out.totNet === 0) out.totNet = out.egNet + out.arNet + out.foNet;
  }
  return out;
}

const sourceDown = data => !!(data.sources && data.sources.sheet === false);

/**
 * حالة البورصة اللحظية. لا نقول "عطلة رسمية" إلا لعطلة نهاية الأسبوع المؤكدة؛
 * غير ذلك قد يكون عطلة أو تأخر في البيانات أو عطل في المصدر.
 */
function getEgxMarketStatus(sessionDate, dataSourceDown) {
  const d = new Date();
  const cairoDate = cairoToday();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "short" }).format(d);
  const h = parseInt(cairoHM(d).split(":")[0], 10);
  const isWeekend = weekday === "Fri" || weekday === "Sat";
  const isTodaySession = sessionDate === cairoDate;
  const lastEn = `(Last Audited: ${sessionDate})`;
  const lastAr = `(آخر جلسة معتمدة: ${sessionDate})`;
  let statusEn, statusAr, sessionTagEn, sessionTagAr;

  if (isWeekend) {
    statusEn = "🏖️ Status: Weekend Holiday (Market Closed • 0 Flow)";
    statusAr = "🏖️ الحالة: عطلة نهاية الأسبوع (السوق مغلق • صفر تداول)";
    sessionTagEn = lastEn; sessionTagAr = lastAr;
  } else if (!isTodaySession) {
    if (h < 10) {
      statusEn = "⏳ Status: Pre-Market (Opens at 10:00 AM Cairo)";
      statusAr = "⏳ الحالة: قبل افتتاح الجلسة (تبدأ 10:00 ص بتوقيت القاهرة)";
      sessionTagEn = `(Previous Close: ${sessionDate})`;
      sessionTagAr = `(إقفال الجلسة السابقة: ${sessionDate})`;
    } else if (dataSourceDown) {
      statusEn = "⚠️ Status: Data source unavailable (showing last audited session)";
      statusAr = "⚠️ الحالة: مصدر البيانات غير متاح (عرض آخر جلسة معتمدة)";
      sessionTagEn = lastEn; sessionTagAr = lastAr;
    } else {
      statusEn = "⚠️ Status: No session recorded today (holiday or data delay)";
      statusAr = "⚠️ الحالة: لا توجد جلسة مسجلة اليوم (عطلة أو تأخر في البيانات)";
      sessionTagEn = lastEn; sessionTagAr = lastAr;
    }
  } else {
    if (h < 15) { statusEn = "🟢 Status: Trading Session Active (Live)"; statusAr = "🟢 الحالة: جلسة التداول نشطة (مباشر)"; }
    else { statusEn = "🔒 Status: Session Closed (Official Daily Close)"; statusAr = "🔒 الحالة: تم إقفال الجلسة (الإقفال الرسمي اليومي)"; }
    sessionTagEn = "(Today)"; sessionTagAr = "(اليوم)";
  }
  return { cairoDate, weekday, isWeekend, isTodaySession, statusEn, statusAr, sessionTagEn, sessionTagAr };
}

// صافي التدفق بالدولار (حسب سعر الجلسة) أو بالجنيه
function fmtFlow(v, curr, lang, rate, usdOverride) {
  const n = Number(v) || 0;
  if (curr === "usd") {
    const hasUsd = usdOverride !== undefined && usdOverride !== null;
    if (hasUsd || rate) {
      const u = hasUsd ? Number(usdOverride) : Math.round(n / rate);
      return `${u >= 0 ? "+" : "-"}$${Math.abs(u).toLocaleString("en-US")}`;
    }
  }
  return `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString("en-US")}${lang === "en" ? " EGP" : " ج.م"}`;
}

// ==========================================
// 🎨 صياغة التقارير
// ==========================================

/** 1. تقرير البورصة المصرية */
function formatEgxReport(data, lang, curr, tz) {
  curr = curr || "usd";
  const T = (e, a) => (lang === "en" ? e : a);
  const usdRate = Number(data.usd_rate) || 0;
  const s = getSessionFlows(data);
  const rate = s.sessionRate || usdRate; // سعر الجلسة وليس السعر الحالي
  const arFo = s.arNet + s.foNet;
  const mStatus = getEgxMarketStatus(s.sessionDate, sourceDown(data));
  const { weekly, monthly } = calculatePeriodicTotals(data.archive, s.sessionDate, rate);
  const f = (v, usd) => fmtFlow(v, curr, lang, rate, usd);
  const fl = (icon, label, v, usd) => `${icon} ${label}: ${dot(v)} <code>${f(v, usd)}</code>\n`;
  const snapshotTime = getEgxSnapshotTime(data, lang);
  const snapshotLine = (snapshotTime && mStatus.isTodaySession) ? `📸 ${T("Snapshot", "لقطة الجلسة")}: <b>[${snapshotTime}]</b>\n` : "";

  const labEg = T("Egyptians", "مصريين"), labAr = T("Arabs", "عرب"), labFo = T("Foreigners", "أجانب"), labAf = T("Arabs + Foreigners", "عرب + أجانب");

  let txt = `🏛 <b>${T("Egyptian Stock Exchange (EGX) Flows", "تدفقات المستثمرين بالبورصة المصرية (EGX)")}</b>\n${LINE}\n`
    + `📅 <b>${T("Session", "الجلسة")}:</b> <code>${s.sessionDate}</code>${mStatus.isTodaySession ? "" : T(" <i>(Last Audited)</i>", " <i>(آخر جلسة معتمدة)</i>")}\n`
    + `🕒 <b>${T("Query", "وقت الاستعلام")}:</b> <b>${getCairoFullDateTime(lang, tz)}</b>\n`
    + `💰 <b>${T("Currency", "العملة")}:</b> <b>${currBadge(curr)}</b>\n`
    + `${T(mStatus.statusEn, mStatus.statusAr)}\n`
    + snapshotLine
    + `${LINE}\n\n`;

  txt += `🏛 <b>${T("Institutional Flows", "تدفقات الجلسة")} ${T(mStatus.sessionTagEn, mStatus.sessionTagAr)}:</b>\n`
    + fl("▫️", labEg, s.egNet) + fl("▫️", labAr, s.arNet) + fl("▫️", labFo, s.foNet) + fl("▪️", labAf, arFo) + "\n";

  txt += `🗓 <b>${T(`Current Week (${weekly.count} Sessions)`, `الأسبوع الحالي (${weekly.count} جلسات)`)}:</b>\n`
    + fl("▫️", labFo, weekly.foNet, weekly.foUsd) + fl("▫️", labAr, weekly.arNet, weekly.arUsd) + fl("▪️", labAf, weekly.arFoNet, weekly.arFoUsd) + "\n";

  const mLabel = getMonthLabel(monthly.monthPrefix, lang);
  txt += `📈 <b>${T(`Current Month (${mLabel} • ${monthly.count} Sessions)`, `الشهر الحالي (${mLabel} • ${monthly.count} جلسات)`)}:</b>\n`
    + fl("▫️", labFo, monthly.foNet, monthly.foUsd) + fl("▫️", labAr, monthly.arNet, monthly.arUsd) + fl("▪️", labAf, monthly.arFoNet, monthly.arFoUsd);

  return txt + `\n${LINE}\n🔒 <i>${T("Officially audited from EGX Terminal.", "بيانات رسمية معتمدة من شاشة البورصة المصرية.")}</i>`;
}

/** 1.1 أرشيف الإقفالات (أسبوعي، شهري، فترات مخصصة) */
function formatEgxPeriodicReport(data, periodType, lang, curr, customParam, tz) {
  periodType = periodType || "curr_month";
  curr = curr || "usd";
  const T = (e, a) => (lang === "en" ? e : a);
  const usdRate = Number(data.usd_rate) || 0;
  const updatedDateTime = getCairoFullDateTime(lang, tz);
  const rawArchive = normalizeArchive(data.archive);
  const f = (v, rate, usd) => fmtFlow(v, curr, lang, rate, usd);

  const latestDate = rawArchive[0]?.date || cairoToday();
  const currSunday = getWeekSunday(latestDate);
  const cSun = new Date(currSunday + "T12:00:00Z");
  const pSun = new Date(cSun); pSun.setUTCDate(cSun.getUTCDate() - 7);
  const pThu = new Date(cSun); pThu.setUTCDate(cSun.getUTCDate() - 3);
  const pSunStr = pSun.toISOString().split("T")[0];
  const pThuStr = pThu.toISOString().split("T")[0];
  const currMo = latestDate.slice(0, 7);
  const dMo = new Date(latestDate + "T12:00:00Z");
  dMo.setUTCDate(1);
  dMo.setUTCMonth(dMo.getUTCMonth() - 1);
  const prevMo = dMo.toISOString().slice(0, 7);

  const range = ss => (ss.length ? `[${ss[ss.length - 1].date} ➔ ${ss[0].date}]` : "");
  let sessions = [], title = "", desc = "", isDefaultMonth = false;

  if (periodType === "curr_week") {
    sessions = rawArchive.filter(s => s.date >= currSunday && s.date <= latestDate);
    title = T("EGX Closings - Current Week", "إقفال البورصة - الأسبوع الحالي");
    desc = T(`Current Week [${currSunday} ➔ ${latestDate}]`, `الأسبوع الحالي [${currSunday} ➔ ${latestDate}]`);
  } else if (periodType === "prev_week") {
    sessions = rawArchive.filter(s => s.date >= pSunStr && s.date <= pThuStr);
    title = T("EGX Closings - Previous Week", "إقفال البورصة - الأسبوع الماضي");
    desc = T(`Previous Week [${pSunStr} ➔ ${pThuStr}]`, `الأسبوع الماضي [${pSunStr} ➔ ${pThuStr}]`);
  } else if (periodType === "prev_month") {
    sessions = rawArchive.filter(s => s.date.startsWith(prevMo));
    const pm = getMonthLabel(prevMo, lang);
    title = T(`EGX Closings - Previous Month (${pm})`, `إقفال البورصة - الشهر الماضي (${pm})`);
    desc = `${pm} [${prevMo}]`;
  } else if (["last3", "last5", "last10"].includes(periodType)) {
    const n = parseInt(periodType.slice(4), 10);
    sessions = rawArchive.slice(0, n);
    title = T(`EGX Closings - Last ${n} Sessions`, `إقفال البورصة - آخر ${n} جلسات`);
    desc = T(`Last ${n} Sessions ${range(sessions)}`, `آخر ${n} جلسات ${range(sessions)}`);
  } else if (periodType === "custom" && customParam && customParam.start && customParam.end) {
    sessions = rawArchive.filter(s => s.date >= customParam.start && s.date <= customParam.end);
    title = T("EGX Closings - Custom Period", "إقفال البورصة - فترة مخصصة");
    desc = T(`Custom [${customParam.start} ➔ ${customParam.end}]`, `فترة مخصصة [${customParam.start} ➔ ${customParam.end}]`);
  } else {
    isDefaultMonth = true;
    sessions = rawArchive.filter(s => s.date.startsWith(currMo));
    if (sessions.length === 0) sessions = rawArchive.slice(0, 25);
    const mName = getMonthLabel(currMo, lang);
    title = T("EGX Daily Closings Archive", "أرشيف الإقفالات اليومية - البورصة المصرية");
    desc = T(`${mName} (${sessions.length} Sessions)`, `${mName} (${sessions.length} جلسات)`);
  }

  const head = `📜 <b>${title}</b>\n${LINE}\n🕒 ${T("Query", "وقت الاستعلام")}: <b>${updatedDateTime}</b>\n`;

  if (sessions.length === 0) {
    return head + `📅 ${T("Period", "الفترة")}: <b>${desc}</b>\n\n⚠️ <i>${T("No archived sessions found in the database for this specific period.", "لا توجد جلسات مؤرشفة مسجلة في قاعدة البيانات لهذه الفترة المحددة.")}</i>`;
  }

  const labFo = T("Foreigners", "أجانب"), labAr = T("Arabs", "عرب"), labAf = T("Arabs + Foreigners", "عرب + أجانب");
  const fl = (icon, label, v, rate, usd, indent) => `${indent || ""}${icon} ${label}: ${dot(v)} <code>${f(v, rate, usd)}</code>\n`;

  let txt = head + `📅 ${T("Period", "الفترة")}: <b>${desc}</b> • ${T("Currency", "العملة")}: <b>${currBadge(curr)}</b>\n`;

  if (isDefaultMonth) {
    const { weekly, monthly } = calculatePeriodicTotals(rawArchive, latestDate, usdRate);
    const mLabel = getMonthLabel(monthly.monthPrefix, lang);
    txt += `\n🗓 <b>${T(`Current Week (${weekly.count} Sessions)`, `الأسبوع الحالي (${weekly.count} جلسات)`)}:</b>\n`
      + fl("▫️", labFo, weekly.foNet, usdRate, weekly.foUsd) + fl("▫️", labAr, weekly.arNet, usdRate, weekly.arUsd) + fl("▪️", labAf, weekly.arFoNet, usdRate, weekly.arFoUsd)
      + `\n📈 <b>${T(`Current Month (${mLabel} • ${monthly.count} Sessions)`, `الشهر الحالي (${mLabel} • ${monthly.count} جلسات)`)}:</b>\n`
      + fl("▫️", labFo, monthly.foNet, usdRate, monthly.foUsd) + fl("▫️", labAr, monthly.arNet, usdRate, monthly.arUsd) + fl("▪️", labAf, monthly.arFoNet, usdRate, monthly.arFoUsd);
  } else {
    let fo = 0, foU = 0, ar = 0, arU = 0;
    sessions.forEach(s => {
      const sRate = Number(s.usd_rate || usdRate) || 0;
      const sf = pickNum(s, "foreign_net", "foreign_net_egp") || 0;
      const sa = pickNum(s, "arab_net", "arab_net_egp") || 0;
      fo += sf; foU += toUsd(sf, sRate);
      ar += sa; arU += toUsd(sa, sRate);
    });
    txt += `\n🎯 <b>${T(`Period Totals (${sessions.length} Sessions)`, `إجمالي الفترة (${sessions.length} جلسات)`)}:</b>\n`
      + fl("▫️", labFo, fo, usdRate, foU) + fl("▫️", labAr, ar, usdRate, arU) + fl("▪️", labAf, fo + ar, usdRate, foU + arU);
  }

  txt += `${LINE}\n\n`;

  sessions.forEach((s, idx) => {
    const sf = pickNum(s, "foreign_net", "foreign_net_egp") || 0;
    const sa = pickNum(s, "arab_net", "arab_net_egp") || 0;
    const sRate = Number(s.usd_rate || usdRate) || 0;
    const tag = (idx === 0 && s.date === latestDate) ? T(" <i>(Latest)</i>", " <i>(الأحدث)</i>") : "";
    txt += `📅 <b>${T("Session", "جلسة")}: <code>${s.date}</code></b>${tag}\n`
      + fl("▫️", T("Foreigners", "صافي الأجانب"), sf, sRate, null, "   ")
      + fl("▫️", T("Arabs", "صافي العرب"), sa, sRate, null, "   ")
      + fl("▪️", T("Arabs + Foreigners", "صافي العرب + الأجانب"), sf + sa, sRate, null, "   ") + "\n";
  });

  return txt + `${LINE}\n🔒 <i>${T("Officially recorded historical closing flows from EGX Terminal.", "أرشيف رسمي موثق لجلسات الإقفال من شاشة البورصة المصرية.")}</i>`;
}

/** 2. الذهب والنفط والكريبتو (بالدولار فقط) */
function formatCommoditiesReport(data, lang, tz) {
  const T = (e, a) => (lang === "en" ? e : a);
  const items = data.live_commodities || [];
  let txt = `🪙 <b>${T("Gold, Oil &amp; Crypto Live Market", "أسواق الذهب والفضة والنفط والكريبتو")}</b>\n${LINE}\n`
    + `🕒 ${T("Query", "وقت الاستعلام")}: <b>${getCairoFullDateTime(lang, tz)}</b>\n`
    + `💰 ${T("Currency", "العملة")}: <b>USD ($)</b>\n${LINE}\n\n`;

  items.forEach(item => {
    const meta = ASSET_META[String(item.code || "").toUpperCase()] || null;
    const name = lang === "en"
      ? (meta?.name_en || item.name_en || item.code)
      : (meta?.name || item.name);
    if (!item.usd_price) { txt += `▫️ <b>${name}:</b> <code>N/A</code> ⚠️\n`; return; }
    const uP = Number(item.usd_price);
    const dec = uP < 10 ? (uP < 1 ? 4 : 3) : (uP >= 1000 ? 0 : 2);
    const chg = item.change ? ` <i>(${escapeHtml(item.change)})</i>${getTrendIcon(item.change)}` : "";
    txt += `▫️ <b>${name}:</b> <code>$${fmtNum(uP, dec)}</code>${chg}\n`;
  });

  if (data.sources && data.sources.markets === false) {
    txt += `\n⚠️ <i>${T("Market feed unavailable right now.", "مصدر الأسواق غير متاح حالياً.")}</i>\n`;
  }
  return txt + `\n${LINE}\n⚡ <i>${T("Live real-time feed via TradingView.", "أسعار حية ولحظية بالدولار مباشرة عبر تريدنج فيو.")}</i>`;
}

/** 3. العملات مقابل الجنيه */
function formatCurrenciesReport(data, lang, tz) {
  const T = (e, a) => (lang === "en" ? e : a);
  const isEn = lang === "en";
  const ltr = isEn ? "\u200E" : "";
  const rates = Array.isArray(data.rates) ? data.rates : [];
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLine = bankSnapshot ? `\n📸 ${T("Rates Snapshot", "لقطة أسعار الصرف")}: <b>[${bankSnapshot}]</b>` : "";
  const unit = T("EGP", "ج.م");

  const cairoHour = parseInt(cairoHM(new Date()).split(":")[0], 10);
  const isTradingHours = cairoHour >= 9 && cairoHour < 17;
  const topBank = (data.banks && data.banks[0]) || null;
  const cbeBuy = Number(data.cbe_usd_buy) || 0;
  const usdRate = Number(data.usd_rate || cbeBuy || 54.40);

  let usdLine;
  if (isTradingHours && topBank && Number(topBank.buy) > 0) {
    usdLine = `${ltr}🇺🇸 <b>${T("US Dollar", "الدولار الأمريكي")} [USD]:</b> <code>${fmtNum(topBank.buy)} ${unit}</code> — <i>${T("Top Buy", "أعلى شراء")}: ${bn(topBank.bank, lang)}</i>\n`;
  } else if (cbeBuy > 0) {
    usdLine = `${ltr}🇺🇸 <b>${T("US Dollar", "الدولار الأمريكي")} [USD]:</b> <code>${fmtNum(cbeBuy)} ${unit}</code> — <i>${T("CBE Official", "المركزي CBE")}</i>\n`;
  } else {
    usdLine = `${ltr}🇺🇸 <b>${T("US Dollar", "الدولار الأمريكي")} [USD]:</b> <code>N/A</code> ⚠️\n`;
  }

  // توحيد الاسم حسب اللغة من الخريطة الثنائية
  const seen = new Set(["USD"]);
  const fiat = [], assets = [];
  rates.forEach(item => {
    const code = String(item.code || "").toUpperCase();
    if (!code || seen.has(code)) return;
    seen.add(code);
    const meta = CURR_META[code] || ASSET_META[code] || {};
    const name = isEn
      ? (meta.name_en || item.name_en || code)
      : (meta.name || item.name || code);
    const eP = Number(item.egp_price ?? item.rate_egp ?? 0);
    const uP = Number(item.usd_price ?? (usdRate > 0 && eP > 0 ? (eP / usdRate) : 0));
    const flag = meta.flag ? (meta.flag + " ") : (meta.icon ? (meta.icon + " ") : "▫️ ");
    const row = { code, name, flag, eP, uP };
    if (CURR_META[code]) {
      fiat.push(row);
    } else {
      assets.push(row);
    }
  });

  fiat.sort((a, b) => FIAT_CODES.indexOf(a.code) - FIAT_CODES.indexOf(b.code));
  assets.sort((a, b) => Object.keys(ASSET_META).indexOf(a.code) - Object.keys(ASSET_META).indexOf(b.code));

  let txt = `💵 <b>${T("Foreign Currency Exchange Rates (vs EGP)", "أسعار العملات الرسمية مقابل الجنيه المصري")}</b>\n${LINE}\n`
    + `🕒 ${T("Query", "وقت الاستعلام")}: <b>${getCairoFullDateTime(lang, tz)}</b>${snapshotLine}\n${LINE}\n\n` + usdLine;

  fiat.forEach(r => {
    txt += `${ltr}${r.flag}<b>${escapeHtml(r.name)}</b> [<code>${r.code}</code>]: <code>${r.eP > 0 ? fmtNum(r.eP) : "N/A"}</code> ${unit}${r.eP > 0 ? "" : " ⚠️"}\n`;
  });

  if (assets.length) {
    txt += `\n🪙 <b>${T("Precious Metals, Energy &amp; Crypto", "المعادن الثمينة والطاقة والكريبتو")}</b>\n`;
    assets.forEach(r => {
      const isLocalGold = ["GOLD21", "GOLD24", "GOLD18", "GOLDC"].includes(r.code);
      if (isLocalGold) {
        const uSub = r.uP > 0 ? ` (~$${fmtNum(r.uP, 2)})` : "";
        txt += `${ltr}${r.flag}<b>${escapeHtml(r.name)}</b> [<code>${r.code}</code>]: <code>${r.eP > 0 ? fmtNum(r.eP) : "N/A"}</code> ${unit}${uSub}\n`;
      } else {
        const uPStr = r.uP > 0 ? `$${fmtNum(r.uP, r.uP >= 1000 ? 0 : 2)}` : "N/A";
        const eSub = r.eP > 0 ? ` (~${fmtNum(r.eP, 0)} ${unit})` : "";
        txt += `${ltr}${r.flag}<b>${escapeHtml(r.name)}</b> [<code>${r.code}</code>]: <code>${uPStr}</code>${eSub}\n`;
      }
    });
  }

  if (data.sources && data.sources.currencies === false && fiat.length <= 1) {
    txt += `\n⚠️ <i>${T("Other currencies unavailable right now.", "باقي العملات غير متاحة حالياً.")}</i>\n`;
  }
  return txt + `\n${LINE}\n🏛 <i>${T("Official Central Bank of Egypt &amp; Live Bank feeds.", "أسعار موثقة معتمدة من البنك المركزي المصري والبنوك.")}</i>`;
}

/** 4. البنوك وصرف الدولار */
function formatBanksReport(data, lang, cfg, tz) {
  const T = (e, a) => (lang === "en" ? e : a);
  const banks = data.banks || [];
  const limit = (cfg && parseInt(cfg.banks_count, 10)) || 5;
  const showCbe = cfg ? cfg.show_cbe_in_banks !== false : true;
  const showBest = cfg ? cfg.show_best_banks !== false : true;
  const cbeBuy = Number(data.cbe_usd_buy) || 0;
  const cbeSell = Number(data.cbe_usd_sell) || 0;
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLine = bankSnapshot ? `\n📸 ${T("Snapshot", "لقطة الأسعار")}: <b>[${bankSnapshot}]</b>` : "";
  const buyL = T("Buy", "شراء"), sellL = T("Sell", "بيع");

  let txt = `🏦 <b>${T("USD Exchange Rates - Egyptian Banks", "أسعار صرف الدولار في البنوك المصرية")}</b>\n${LINE}\n`
    + `🕒 ${T("Query", "وقت الاستعلام")}: <b>${getCairoFullDateTime(lang, tz)}</b>${snapshotLine}\n${LINE}\n`;

  if (showCbe) {
    if (cbeBuy > 0) {
      const cbeTime = formatCleanTime(data.cbe_updated_at || extractTimeFromTimestamp(data.timestamp), lang);
      txt += `🏛 <b>${T("Central Bank (CBE)", "البنك المركزي المصري")}:</b> ${buyL} <code>${cbeBuy.toFixed(2)}</code> • ${sellL} <code>${cbeSell ? cbeSell.toFixed(2) : "N/A"}</code> [${cbeTime}]\n${LINE}\n`;
    } else {
      txt += `🏛 <b>${T("Central Bank (CBE)", "البنك المركزي المصري")}:</b> <code>N/A</code> ⚠️\n${LINE}\n`;
    }
  }

  if (!banks.length) {
    return txt + `⚠️ <i>${T("No bank data available right now.", "لا توجد بيانات للبنوك حالياً.")}</i>`;
  }

  const topBuy = banks[0];
  if (showBest) {
    txt += `🟢 <b>${T("Top Buy Bank", "أعلى بنك شراء")}:</b> ${bn(topBuy.bank, lang)}\n   ▫️ ${buyL} <code>${Number(topBuy.buy).toFixed(2)}</code> • ${sellL} <code>${Number(topBuy.sell).toFixed(2)}</code> [${formatCleanTime(topBuy.updated_at, lang)}]\n${LINE}\n`;
  }
  txt += `📊 <b>${T(`Top ${Math.min(limit, banks.length)} Banks (Buy • Sell)`, `أعلى ${Math.min(limit, banks.length)} بنوك (شراء • بيع)`)}:</b>\n\n`
    + banks.slice(0, limit).map(b => `▫️ <b>${bn(b.bank, lang)}:</b> ${buyL} <code>${Number(b.buy).toFixed(2)}</code> • ${sellL} <code>${Number(b.sell).toFixed(2)}</code>`).join("\n");

  if (data.sources && data.sources.banks === false && (!banks || !banks.length)) {
    txt += `\n\n⚠️ <i>${T("Live bank feed unavailable - showing last saved rates.", "مصدر البنوك الحي غير متاح - عرض آخر أسعار محفوظة.")}</i>`;
  }
  return txt + `\n\n${LINE}\n⚡ <i>${T("Live feed via Ta3weem.", "أسعار حية مباشرة من البنوك عبر تعويم.")}</i>`;
}

function formatAllBanksReport(data, lang, tz) {
  const T = (e, a) => (lang === "en" ? e : a);
  const banks = data.banks || [];
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLine = bankSnapshot ? `\n📸 ${T("Snapshot", "لقطة الأسعار")}: <b>[${bankSnapshot}]</b>` : "";
  const buyL = T("Buy", "شراء"), sellL = T("Sell", "بيع");

  let txt = `🏦 <b>${T(`All Egyptian Banks (${banks.length}) - USD Rates`, `قائمة كافة البنوك المصرية (${banks.length} بنكاً) - أسعار الدولار`)}</b>\n${LINE}\n`
    + `🕒 ${T("Query", "وقت الاستعلام")}: <b>${getCairoFullDateTime(lang, tz)}</b>${snapshotLine}\n${LINE}\n\n`;
  txt += banks.length
    ? banks.map((b, i) => `${i + 1}. <b>${bn(b.bank, lang)}:</b> ${buyL} <code>${Number(b.buy).toFixed(2)}</code> • ${sellL} <code>${Number(b.sell).toFixed(2)}</code>`).join("\n")
    : `⚠️ <i>${T("No bank data available right now.", "لا توجد بيانات للبنوك حالياً.")}</i>`;
  return txt + `\n\n${LINE}\n⚡ <i>${T("Live feed via Ta3weem.", "أسعار حية مباشرة من البنوك عبر تعويم.")}</i>`;
}

/** 5. التقرير التنفيذي الشامل */
function formatExecutiveReport(data, lang, curr, tzKey) {
  curr = curr || "usd";
  tzKey = tzKey || "cairo";
  const T = (e, a) => (lang === "en" ? e : a);
  const usdRate = Number(data.usd_rate) || 0;
  const s = getSessionFlows(data);
  const rate = s.sessionRate || usdRate;
  const arFo = s.arNet + s.foNet;
  const mStatus = getEgxMarketStatus(s.sessionDate, sourceDown(data));
  const { weekly, monthly } = calculatePeriodicTotals(data.archive, s.sessionDate, rate);
  const f = (v, usd) => fmtFlow(v, curr, lang, rate, usd);
  const fl = (icon, label, v, usd) => `${icon} ${label}: <code>${f(v, usd)}</code>\n`;
  const snapshotTime = getEgxSnapshotTime(data, lang);
  const snapshotLine = (snapshotTime && mStatus.isTodaySession) ? `📸 ${T("Market Snapshot", "لقطة شاشة البورصة")}: <b>[${snapshotTime}]</b>\n` : "";

  const labFo = T("Foreigners", "أجانب"), labAr = T("Arabs", "عرب"), labAf = T("Arabs + Foreigners", "عرب + أجانب");
  const mLabel = getMonthLabel(monthly.monthPrefix, lang);

  const egxBlock = `🏛 <b>${T("Non-Egyptian Flows", "تدفقات غير المصريين")} ${T(mStatus.sessionTagEn, mStatus.sessionTagAr)}:</b>\n`
    + fl("▫️", labFo, s.foNet) + fl("▫️", labAr, s.arNet) + fl("▪️", labAf, arFo) + "\n"
    + `🗓 <b>${T(`Current Week (${weekly.count} Sessions)`, `الأسبوع الحالي (${weekly.count} جلسات)`)}:</b>\n`
    + fl("▫️", labFo, weekly.foNet, weekly.foUsd) + fl("▫️", labAr, weekly.arNet, weekly.arUsd) + fl("▪️", labAf, weekly.arFoNet, weekly.arFoUsd) + "\n"
    + `📈 <b>${T(`Current Month (${mLabel} • ${monthly.count} Sessions)`, `الشهر الحالي (${mLabel} • ${monthly.count} جلسات)`)}:</b>\n`
    + fl("▫️", labFo, monthly.foNet, monthly.foUsd) + fl("▫️", labAr, monthly.arNet, monthly.arUsd) + fl("▪️", labAf, monthly.arFoNet, monthly.arFoUsd) + "\n";

  // الدولار
  const cbeBuy = Number(data.cbe_usd_buy) || 0;
  const cbeSell = Number(data.cbe_usd_sell) || 0;
  const topBank = (data.banks && data.banks[0]) || null;
  const buyL = T("Buy", "شراء"), sellL = T("Sell", "بيع");
  let usdBlock = `💵 <b>${T("USD Exchange Rates", "أسعار صرف الدولار")}:</b>\n`;
  if (cbeBuy > 0) {
    const cbeTime = formatCleanTime(data.cbe_updated_at || extractTimeFromTimestamp(data.timestamp), lang);
    usdBlock += `   ▫️ <b>${T("Central Bank (CBE)", "البنك المركزي")}:</b> ${buyL} <code>${cbeBuy.toFixed(2)}</code> • ${sellL} <code>${cbeSell ? cbeSell.toFixed(2) : "N/A"}</code> [${cbeTime}]`;
  } else {
    usdBlock += `   ▫️ <b>${T("Central Bank (CBE)", "البنك المركزي")}:</b> <code>N/A</code> ⚠️`;
  }
  if (topBank) {
    usdBlock += `\n   ▫️ <b>${T("Top Buy Bank", "أعلى بنك شراء")}:</b> ${bn(topBank.bank, lang)} • ${buyL} <code>${Number(topBank.buy).toFixed(2)}</code> • ${sellL} <code>${Number(topBank.sell).toFixed(2)}</code> [${formatCleanTime(topBank.updated_at, lang)}]`;
  }

  // السلع
  const comms = data.live_commodities || [];
  const get = code => comms.find(c => c.code === code);
  const usdStr = (item, dec) => (item && item.usd_price ? "$" + fmtNum(item.usd_price, dec) : "N/A ⚠️");
  const brent = usdStr(get("BRENT"), 2), ounce = usdStr(get("GOLD_OUNCE"), 2), g24 = usdStr(get("GOLD24"), 2), silver = usdStr(get("SILVER"), 2);

  return `📊 <b>${T("Executive Financial Summary", "التقرير المالي التنفيذي الشامل")}</b>\n${LINE}\n`
    + `📅 <b>${T("Session", "الجلسة")}:</b> <code>${s.sessionDate}</code>${mStatus.isTodaySession ? "" : T(" <i>(Last Audited)</i>", " <i>(آخر جلسة معتمدة)</i>")}\n`
    + `🕒 <b>${T("Query", "وقت الاستعلام")}:</b> <b>${getCairoFullDateTime(lang, tzKey)}</b>\n`
    + `💰 <b>${T("Currency", "العملة")}:</b> <b>${currBadge(curr)}</b>\n`
    + `${T(mStatus.statusEn, mStatus.statusAr)}\n`
    + snapshotLine
    + `${LINE}\n\n`
    + egxBlock
    + `${LINE}\n`
    + usdBlock + `\n\n`
    + `${LINE}\n`
    + `🛢 <b>${T("Brent Crude Oil", "خام برنت (نفط)")}:</b> <code>${brent}</code>\n`
    + `🪙 <b>${T("Gold (Ounce)", "أونصة الذهب")}:</b> <code>${ounce}</code> • <b>${T("24K", "عيار 24")}:</b> <code>${g24}</code>\n`
    + `🪙 <b>${T("Silver (Ounce)", "أونصة الفضة")}:</b> <code>${silver}</code>\n`
    + `\n${LINE}\n⚡ <i>${T("Live Executive Summary • Real-time feeds.", "تقرير تنفيذي لحظي موثق ومباشر.")}</i>`;
}

// ==========================================
// 🕹️ لوحات المفاتيح
// ==========================================

function getHistoryKeyboard(lang, curr, activePeriod) {
  activePeriod = activePeriod || "curr_month";
  const T = (e, a) => (lang === "en" ? e : a);
  const nextCurr = curr === "usd" ? "egp" : "usd";
  const currToggleText = curr === "usd" ? T("💱 Switch to EGP", "💱 التحويل إلى الجنيه") : T("💵 Switch to USD", "💵 التحويل إلى الدولار");
  const mark = (p, label) => (activePeriod === p ? `• ${label} •` : label);
  const hp = (p, label) => ({ text: mark(p, label), callback_data: `hist_p:${p}:${lang}:${curr}` });

  return {
    inline_keyboard: [
      [hp("curr_week", T("🗓 This Week", "🗓 الأسبوع الحالي")), hp("prev_week", T("⏮ Last Week", "⏮ الأسبوع الماضي"))],
      [hp("curr_month", T("📈 This Month", "📈 الشهر الحالي")), hp("prev_month", T("⏮ Last Month", "⏮ الشهر الماضي"))],
      [hp("last3", T("🎯 Last 3", "🎯 آخر 3")), hp("last5", T("🎯 Last 5", "🎯 آخر 5")), hp("last10", T("🎯 Last 10", "🎯 آخر 10"))],
      [
        { text: T("🏛 Back to Live", "🏛 البورصة اللحظية"), callback_data: `cmd_egx:${lang}:${curr}` },
        { text: currToggleText, callback_data: `hist_curr:${nextCurr}:${activePeriod}:${lang}` }
      ],
      [
        { text: T("« Main Menu", "« القائمة الرئيسية"), callback_data: `cmd_menu:${lang}:${curr}` },
        { text: T("🌐 اللغة العربية", "🌐 English"), callback_data: lang === "en" ? "cmd_lang_ar" : "cmd_lang_en" }
      ]
    ]
  };
}

function getReportKeyboard(cmdType, lang, cfg, curr) {
  cfg = cfg || DEFAULT_CONFIG;
  curr = curr || "usd";
  if (cmdType === "history" || cmdType === "archive") return getHistoryKeyboard(lang, curr, "curr_month");

  const T = (e, a) => (lang === "en" ? e : a);
  const nextCurr = curr === "usd" ? "egp" : "usd";
  const currToggleText = T(curr === "usd" ? "💱 Switch to EGP" : "💱 Switch to USD", curr === "usd" ? "💱 التحويل للجنيه (EGP)" : "💱 التحويل للدولار (USD)");
  const currToggleData = `toggle_curr:${nextCurr}:${cmdType}:${lang}`;

  const rows = [[{ text: T("🔄 Refresh", "🔄 تحديث لحظي"), callback_data: `refresh_${cmdType}:${lang}:${curr}` }]];

  if (cmdType === "report") {
    rows.push([{ text: currToggleText, callback_data: currToggleData }]);
  } else if (cmdType === "egx") {
    rows.push([{ text: T("📊 Closings Archive", "📊 أرشيف الإقفال"), callback_data: `cmd_history:${lang}:${curr}` }]);
    rows.push([{ text: currToggleText, callback_data: currToggleData }]);
  } else if (cmdType === "banks") {
    rows.push([{ text: T("📋 Show All Banks", "📋 إظهار كافة البنوك"), callback_data: `cmd_banks_all:${lang}` }]);
  } else if (cmdType === "banks_all") {
    const n = parseInt(cfg.banks_count, 10) || 5;
    rows.push([{ text: T(`« Top ${n} Banks Only`, `« أعلى ${n} بنوك فقط`), callback_data: `cmd_banks:${lang}` }]);
  }

  rows.push([
    { text: T("« Main Menu", "« القائمة الرئيسية"), callback_data: `cmd_menu:${lang}:${curr}` },
    { text: T("🌐 اللغة العربية", "🌐 English"), callback_data: lang === "en" ? `cmd_lang_ar:${curr}` : `cmd_lang_en:${curr}` }
  ]);
  return { inline_keyboard: rows };
}

function getMenuKeyboard(lang, cfg) {
  cfg = cfg || DEFAULT_CONFIG;
  const T = (e, a) => (lang === "en" ? e : a);
  const rows = [];

  const r1 = [];
  if (!cfg.hide_egx) r1.push({ text: T("🏛️ Institutional Flows (EGX)", "🏛️ تعاملات المؤسسات (EGX)"), callback_data: `cmd_egx:${lang}` });
  if (!cfg.hide_banks) r1.push({ text: T("🏦 Egyptian Banks & CBE", "🏦 أسعار البنوك والمركزي"), callback_data: `cmd_banks:${lang}` });
  if (r1.length) rows.push(r1);

  const r2 = [];
  if (!cfg.hide_commodities) r2.push({ text: T("🪙 Gold, Oil & Crypto", "🪙 الذهب والنفط والكريبتو"), callback_data: `cmd_commodities:${lang}` });
  if (!cfg.hide_currencies) r2.push({ text: T("💵 Foreign Currencies", "💵 أسعار العملات الأجنبية"), callback_data: `cmd_currencies:${lang}` });
  if (r2.length) rows.push(r2);

  const r3 = [];
  if (!cfg.hide_report) r3.push({ text: T("📊 Full Executive Report", "📊 التقرير المالي الشامل"), callback_data: `cmd_report:${lang}` });
  r3.push({ text: T("📜 Daily Closings", "📜 أرشيف الإقفال اليومي"), callback_data: `cmd_history:${lang}` });
  rows.push(r3);

  rows.push([
    { text: T("🔄 Refresh Menu", "🔄 تحديث القائمة"), callback_data: `refresh_menu:${lang}` },
    { text: T("🌐 اللغة العربية", "🌐 English"), callback_data: lang === "en" ? "cmd_lang_ar" : "cmd_lang_en" }
  ]);
  rows.push([{ text: T("🌍 Timezone Settings", "🌍 ضبط المنطقة الزمنية"), callback_data: `cmd_timezone:${lang}` }]);
  return { inline_keyboard: rows };
}

function getTimezoneKeyboard(lang, currentTz) {
  currentTz = currentTz || "cairo";
  const rows = Object.keys(TIMEZONES).map(key => {
    const tz = TIMEZONES[key];
    return [{ text: `${tz.flag} ${lang === "en" ? tz.name_en : tz.name_ar} ${key === currentTz ? "✅" : ""}`, callback_data: `set_tz:${key}:${lang}` }];
  });
  rows.push([{ text: lang === "en" ? "🔙 Main Menu" : "🔙 القائمة الرئيسية", callback_data: `cmd_menu:${lang}` }]);
  return { inline_keyboard: rows };
}

// ==========================================
// ✉️ إرسال الرسائل
// ==========================================

function splitMessage(text, max = 4000) {
  const chunks = [];
  let cur = "";
  for (let line of text.split("\n")) {
    while (line.length > max) { // سطر واحد أطول من الحد
      if (cur) { chunks.push(cur); cur = ""; }
      chunks.push(line.slice(0, max));
      line = line.slice(max);
    }
    if (cur.length + line.length + 1 > max && cur) { chunks.push(cur); cur = ""; }
    cur += line + "\n";
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.length ? chunks : [text];
}

async function tgCall(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.clone().text().catch(() => "");
    console.error(`Telegram ${method} failed:`, res.status, body.slice(0, 300));
  }
  return res;
}

async function sendTgMessage(chatId, text, replyMarkup) {
  const chunks = splitMessage(text);
  let res;
  for (let i = 0; i < chunks.length; i++) {
    const payload = { chat_id: chatId, text: chunks[i], parse_mode: "HTML" };
    if (replyMarkup && i === chunks.length - 1) payload.reply_markup = replyMarkup;
    res = await tgCall("sendMessage", payload);
  }
  return res;
}

async function editTgMessage(chatId, messageId, text, replyMarkup) {
  if (text.length > 4000) return sendTgMessage(chatId, text, replyMarkup);
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.description && err.description.includes("message is not modified")) return res;
    console.error("editMessageText failed:", err.description);
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

async function sendMainMenu(chatId, lang, cfg, messageId, tz) {
  const updatedDateTime = getCairoFullDateTime(lang, tz);
  const text = lang === "en"
    ? `🏛️ <b>Egyptian Stock Exchange &amp; Live Markets Bot</b>\n🕒 <b>${updatedDateTime}</b>\n\n⚡ Powered by <b>Cloudflare Edge &amp; Live Feeds</b> 24/7.\n\n👇 <i>Choose from the interactive menu below:</i>`
    : `🏛️ <b>منظومة البورصة المصرية وأسواق الصرف الحية 24/7</b>\n🕒 <b>${updatedDateTime}</b>\n\n⚡ تعمل سحابياً عبر <b>Cloudflare Edge وموقع تعويم وتريدنج فيو</b> مباشرة.\n\n👇 <i>اختر ما تريد من القائمة التفاعلية أدناه:</i>`;
  const kb = getMenuKeyboard(lang, cfg);
  return messageId ? editTgMessage(chatId, messageId, text, kb) : sendTgMessage(chatId, text, kb);
}

async function sendAutomatedDailySummary(targetChat, lang) {
  lang = lang || "ar";
  try {
    const data = await getCachedDashboardData();
    const text = formatExecutiveReport(data, lang, "usd", "cairo");
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔄 تحديث لحظي للبيانات", callback_data: `refresh_report:${lang}:usd` },
          { text: "💵 العرض بالجنيه (EGP)", callback_data: `toggle_curr:egp:report:${lang}` }
        ],
        [{ text: "🔙 القائمة الرئيسية", callback_data: `cmd_menu:${lang}:usd` }]
      ]
    };
    const res = await sendTgMessage(targetChat, text, keyboard);
    const j = await res.json().catch(() => ({}));
    return { status: res.ok ? "success" : "error", telegram_response: j };
  } catch (err) {
    console.error("daily summary failed:", err.message);
    return { status: "error", message: err.message };
  }
}

// ==========================================
// 🖥️ لوحة التحكم (محمية بـ ADMIN_KEY: /control?key=...)
// ==========================================

function getControlHtml() {
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
    :root { --bg:#090e1a; --card-bg:#111827; --card-border:#1f2937; --primary:#38bdf8; --green:#10b981; --text:#f8fafc; --text-muted:#94a3b8; --radius:14px; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background-color:var(--bg); color:var(--text); font-family:'Cairo',sans-serif; padding:16px; padding-bottom:90px; }
    .container { max-width:580px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
    .header-card { background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%); border:1px solid rgba(56,189,248,0.25); border-radius:var(--radius); padding:18px; display:flex; align-items:center; justify-content:space-between; }
    .header-info { display:flex; align-items:center; gap:12px; }
    .header-icon { width:44px; height:44px; background:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; color:#fff; }
    .status-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); padding:5px 10px; border-radius:20px; font-size:0.75rem; font-weight:700; color:#34d399; }
    .status-dot { width:7px; height:7px; background:#10b981; border-radius:50%; box-shadow:0 0 8px #10b981; }
    .section-card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:var(--radius); padding:18px; display:flex; flex-direction:column; gap:14px; }
    .section-title { font-size:0.95rem; font-weight:800; color:var(--primary); display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:8px; }
    .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03); }
    .toggle-info h4 { font-size:0.9rem; font-weight:700; }
    .toggle-info p { font-size:0.75rem; color:var(--text-muted); }
    .switch { position:relative; width:48px; height:26px; }
    .switch input { opacity:0; width:0; height:0; }
    .slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#334155; transition:.25s; border-radius:34px; }
    .slider:before { position:absolute; content:""; height:20px; width:20px; left:3px; bottom:3px; background-color:white; transition:.25s; border-radius:50%; }
    input:checked + .slider { background-color:var(--green); }
    input:checked + .slider:before { transform:translateX(22px); }
    select { width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px; font-family:'Cairo'; outline:none; }
    .save-bar { position:fixed; bottom:0; left:0; right:0; background:rgba(15,23,42,0.95); backdrop-filter:blur(10px); border-top:1px solid #1f2937; padding:14px 16px; display:flex; justify-content:center; z-index:100; }
    .save-btn { width:100%; max-width:580px; background:linear-gradient(135deg,#10b981 0%,#059669 100%); color:#fff; border:none; padding:14px; border-radius:12px; font-family:'Cairo'; font-size:1rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
    .toast { position:fixed; top:20px; left:50%; transform:translateX(-50%) translateY(-100px); background:var(--green); color:#fff; padding:12px 24px; border-radius:30px; font-weight:700; font-size:0.85rem; z-index:999; transition:all 0.3s cubic-bezier(0.4,0,0.2,1); box-shadow:0 10px 25px rgba(0,0,0,0.4); }
    .toast.show { transform:translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <div id="toast" class="toast">✅ تم حفظ وتطبيق الإعدادات على البوت!</div>

  <div class="container">
    <div class="header-card">
      <div class="header-info">
        <div class="header-icon"><i class="fa-solid fa-bolt"></i></div>
        <div>
          <h2>لوحة تخصيص البوت</h2>
          <p style="font-size:0.75rem;color:var(--text-muted);">Cloudflare High-Speed Edge Panel</p>
        </div>
      </div>
      <div class="status-badge"><div class="status-dot"></div><span>متصل لحظياً</span></div>
    </div>

    <div class="section-card">
      <div class="section-title"><i class="fa-solid fa-toggle-on"></i><span>تخصيص أزرار البوت (إظهار / إخفاء)</span></div>
      <div class="toggle-row"><div class="toggle-info"><h4>🏛️ تعاملات المؤسسات (EGX)</h4><p>إظهار زر مشتريات ومبيعات البورصة</p></div><label class="switch"><input type="checkbox" id="btn_egx" checked><span class="slider"></span></label></div>
      <div class="toggle-row"><div class="toggle-info"><h4>🏦 أسعار البنوك والمركزي</h4><p>إظهار زر صرف الدولار في البنوك</p></div><label class="switch"><input type="checkbox" id="btn_banks" checked><span class="slider"></span></label></div>
      <div class="toggle-row"><div class="toggle-info"><h4>🪙 الذهب والنفط والكريبتو</h4><p>إظهار زر الذهب والفضة وبرنت وبيتكوين وإيثيريوم</p></div><label class="switch"><input type="checkbox" id="btn_commodities" checked><span class="slider"></span></label></div>
      <div class="toggle-row"><div class="toggle-info"><h4>💵 أسعار العملات الأجنبية</h4><p>إظهار زر العملات العربية والأجنبية الرسمية</p></div><label class="switch"><input type="checkbox" id="btn_currencies" checked><span class="slider"></span></label></div>
      <div class="toggle-row"><div class="toggle-info"><h4>📊 التقرير المالي الشامل</h4><p>إظهار زر التقرير التنفيذي الموحد</p></div><label class="switch"><input type="checkbox" id="btn_report" checked><span class="slider"></span></label></div>
    </div>

    <div class="section-card">
      <div class="section-title"><i class="fa-solid fa-building-columns"></i><span>تخصيص تقرير البنوك</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:0.85rem;font-weight:700;">عدد البنوك المعروضة في التقرير السريع:</label>
        <select id="banks_count">
          <option value="5" selected>أعلى 5 بنوك (افتراضي)</option>
          <option value="8">أعلى 8 بنوك</option>
          <option value="10">أعلى 10 بنوك</option>
          <option value="25">عرض كافة البنوك</option>
        </select>
      </div>
      <div class="toggle-row" style="margin-top:6px;"><div class="toggle-info"><h4>🏛️ سعر البنك المركزي الفعلي</h4><p>إظهار الشراء والبيع الفعلي بالمركزي</p></div><label class="switch"><input type="checkbox" id="show_cbe" checked><span class="slider"></span></label></div>
      <div class="toggle-row"><div class="toggle-info"><h4>🟢 أفضل بنك للبيع والشراء</h4><p>تمييز أعلى سعر شراء وأقل سعر بيع</p></div><label class="switch"><input type="checkbox" id="show_best" checked><span class="slider"></span></label></div>
    </div>
  </div>

  <div class="save-bar">
    <button class="save-btn" onclick="saveSettings()">
      <i class="fa-solid fa-floppy-disk"></i>
      <span>حفظ وتطبيق التعديلات في البوت</span>
    </button>
  </div>

  <script>
    var KEY = new URLSearchParams(location.search).get("key") || "";
    var HEADERS = { "Content-Type": "application/json", "x-admin-key": KEY };
    var SAVE_HTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ وتطبيق التعديلات في البوت';

    fetch("/api/config", { headers: HEADERS })
      .then(function (res) { return res.json(); })
      .then(function (cfg) {
        if (!cfg) return;
        document.getElementById("btn_egx").checked = !cfg.hide_egx;
        document.getElementById("btn_banks").checked = !cfg.hide_banks;
        document.getElementById("btn_commodities").checked = !cfg.hide_commodities;
        document.getElementById("btn_currencies").checked = !cfg.hide_currencies;
        document.getElementById("btn_report").checked = !cfg.hide_report;
        if (cfg.banks_count) document.getElementById("banks_count").value = String(cfg.banks_count);
        if (cfg.show_cbe_in_banks !== undefined) document.getElementById("show_cbe").checked = cfg.show_cbe_in_banks;
        if (cfg.show_best_banks !== undefined) document.getElementById("show_best").checked = cfg.show_best_banks;
      }).catch(function () {});

    function saveSettings() {
      var btn = document.querySelector(".save-btn");
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
      var payload = {
        hide_egx: !document.getElementById("btn_egx").checked,
        hide_banks: !document.getElementById("btn_banks").checked,
        hide_commodities: !document.getElementById("btn_commodities").checked,
        hide_currencies: !document.getElementById("btn_currencies").checked,
        hide_report: !document.getElementById("btn_report").checked,
        banks_count: parseInt(document.getElementById("banks_count").value) || 5,
        show_cbe_in_banks: document.getElementById("show_cbe").checked,
        show_best_banks: document.getElementById("show_best").checked
      };
      fetch("/api/config", { method: "POST", headers: HEADERS, body: JSON.stringify(payload) })
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then(function () {
          btn.innerHTML = SAVE_HTML;
          var toast = document.getElementById("toast");
          toast.classList.add("show");
          setTimeout(function () { toast.classList.remove("show"); }, 3000);
        })
        .catch(function () {
          btn.innerHTML = SAVE_HTML;
          alert("حدث خطأ أثناء الحفظ (تأكد من المفتاح ?key=)");
        });
    }
  </script>
</body>
</html>`;
}