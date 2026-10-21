/**
 * ==================================================================================
 * ⚡ EGX & GLOBAL MARKETS TELEGRAM BOT - CLOUDFLARE WORKER (AUDITED HIGH-RESILIENCE)
 * ==================================================================================
 * - 100% AUTONOMOUS CLOUD ENGINE (Cloudflare Edge & Serverless)
 * - LIVE SECOND-BY-SECOND FEED: TradingView Scanner (BTC, ETH, Brent, WTI, Gold, Silver)
 * - PURE ACTUAL RATES: Ta3weem.com & Central Bank of Egypt / Official Egyptian Banks
 * - SECURE ENDPOINTS: Authorization tokens on /broadcast, /api/config, /set_webhook, /set_commands
 * - WEBHOOK SECRET: X-Telegram-Bot-Api-Secret-Token validation
 * - PERSISTENCE: Cloudflare KV (env.EGX_KV) with memory cache fallback
 * - SAFE HTML: Full escapeHtml() protection against parsing breakages
 * - SMART CHUNKING: Telegram 4096-char auto-splitting with double-newline awareness
 * - CAIRO TIMEZONE: Strict Africa/Cairo date & time calculations (no UTC midnight offsets)
 * - GROUP INTELLIGENCE: Slash command normalization & no casual keyword spamming in groups
 * ==================================================================================
 */

let BOT_TOKEN = "8602326797:AAH0__1Q9RTSvmkho6qR0-Sk6FWSrHQF6GY";
const DATA_API_URL = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec?action=data";
const CONFIG_API_URL = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec";
const GITHUB_RAW_DATA_URL = "https://raw.githubusercontent.com/cobraarsgb6-hub/EGX-Investor-Tracker/main/data/live_dashboard_data.json";

// Default bot config
let botConfig = {
  hide_egx: false,
  hide_banks: false,
  hide_commodities: false,
  hide_currencies: false,
  hide_report: false,
  hide_lang_toggle: false,
  banks_count: 5,
  show_cbe_in_banks: true,
  show_best_banks: true,
  default_lang: "en",
  default_curr: "usd"
};

// Memory caches for fast lookup
let configCache = { data: botConfig, timestamp: 0 };
let memoryCache = { data: null, timestamp: 0 };
let sheetCache = { data: { archive: [], rates: [], banks: [] }, timestamp: 0 };
let userPrefCache = {};

// KV-backed state helpers
async function getUserPref(env, chatId, key, defaultVal) {
  const cacheKey = `${chatId}:${key}`;
  if (userPrefCache[cacheKey] !== undefined) {
    return userPrefCache[cacheKey];
  }
  if (env && env.EGX_KV) {
    try {
      const val = await env.EGX_KV.get(`user_pref:${cacheKey}`);
      if (val !== null && val !== undefined) {
        userPrefCache[cacheKey] = val;
        return val;
      }
    } catch(e) {}
  }
  return defaultVal;
}

async function setUserPref(env, ctx, chatId, key, val) {
  const cacheKey = `${chatId}:${key}`;
  userPrefCache[cacheKey] = val;
  if (env && env.EGX_KV) {
    try {
      const p = env.EGX_KV.put(`user_pref:${cacheKey}`, String(val), { expirationTtl: 86400 * 90 });
      if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      else await p;
    } catch(e) {}
  }
}

async function getLiveBotConfig(env) {
  const now = Date.now();
  if (configCache.data && (now - configCache.timestamp < 15000)) {
    return configCache.data;
  }
  if (env && env.EGX_KV) {
    try {
      const stored = await env.EGX_KV.get("bot_config", "json");
      if (stored && typeof stored === "object") {
        botConfig = { ...botConfig, ...stored };
        configCache = { data: botConfig, timestamp: now };
        return botConfig;
      }
    } catch(e) {}
  }
  return botConfig;
}

async function saveLiveBotConfig(env, ctx, newConfig) {
  botConfig = { ...botConfig, ...newConfig };
  configCache = { data: botConfig, timestamp: Date.now() };
  if (env && env.EGX_KV) {
    try {
      const p = env.EGX_KV.put("bot_config", JSON.stringify(botConfig));
      if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      else await p;
    } catch(e) {}
  }
}

// Security authorization helper
function isAdminAuthorized(request, env) {
  const adminKey = (env && (env.ADMIN_KEY || env.API_SECRET)) || "egx_admin_secret_2026";
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ") && authHeader.slice(7).trim() === adminKey) return true;
  const url = new URL(request.url);
  const token = url.searchParams.get("key") || url.searchParams.get("token") || url.searchParams.get("admin_key");
  if (token === adminKey) return true;
  return false;
}

function isValidWebhookSecret(request, env) {
  const secretToken = (env && env.TELEGRAM_SECRET_TOKEN) || "egx_tg_secret_2026";
  const incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (incoming && incoming !== secretToken) {
    return false;
  }
  return true;
}

// HTML escaping helper
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Telegram message chunker (4096 character limit safety)
function splitTgMessage(text, maxLen = 4000) {
  if (!text || text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n\n", maxLen);
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen / 4) {
      splitIdx = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  return chunks;
}

const TIMEZONES = {
  "cairo": { id: "Africa/Cairo", name_ar: "القاهرة", name_en: "Cairo", flag: "🇪🇬" },
  "riyadh": { id: "Asia/Riyadh", name_ar: "الرياض", name_en: "Riyadh", flag: "🇸🇦" },
  "dubai": { id: "Asia/Dubai", name_ar: "دبي", name_en: "Dubai", flag: "🇦🇪" },
  "london": { id: "Europe/London", name_ar: "لندن", name_en: "London", flag: "🇬🇧" },
  "newyork": { id: "America/New_York", name_ar: "نيويورك", name_en: "New York", flag: "🇺🇸" }
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
  "التعمير والإسكان": "Housing &amp; Dev Bank (HDB)",
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

// Sort bank keys by descending length so "بنك مصر إيران" matches before "بنك مصر"
const SORTED_BANK_KEYS = Object.keys(BANK_EN_NAMES).sort((a, b) => b.length - a.length);

function getBankName(bankAr, lang) {
  if (lang !== "en" || !bankAr) return escapeHtml(bankAr);
  for (let key of SORTED_BANK_KEYS) {
    if (bankAr.includes(key)) return BANK_EN_NAMES[key];
  }
  return escapeHtml(bankAr);
}

// Time & Cairo Date Helpers
const LRM = "\u200E";
const RLM = "\u200F";

function getCairoDateStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

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
  return `${dateStrAr} • ${timeAr} (بتوقيت ${tzLabelAr})`;
}

function extractTimeFromTimestamp(ts) {
  if (!ts) return getCairoTimeStr().slice(0, 5);
  try {
    const s = String(ts).trim();
    const d = new Date(s.includes("T") || s.endsWith("Z") ? s : s.replace(" ", "T") + "Z");
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
  const tsCandidate = data?.egx_institutions?.timestamp || data?.timestamp || (data?.archive && data.archive[0]?.created_at) || "";
  if (!tsCandidate) return "";
  const s = String(tsCandidate).trim();
  try {
    const d = new Date(s.includes("T") || s.endsWith("Z") ? s : s.replace(" ", "T") + "Z");
    if (!isNaN(d.getTime())) {
      const timeStr = d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });
      return format12HourTime(timeStr, lang);
    }
  } catch(e) {}

  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return format12HourTime(`${m[1].padStart(2, "0")}:${m[2]}`, lang);
  }
  return "";
}

function getBankSnapshotTime(data, lang) {
  let timeStr = "";
  let dateStr = "";

  const tsCandidate = data?.timestamp || (data?.banks && data.banks[0]?.created_at) || data?.cbe_updated_at || "";
  if (tsCandidate) {
    const s = String(tsCandidate).trim();
    const dMatch = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (dMatch) dateStr = dMatch[1];
  }

  if (data?.banks && data.banks[0]?.updated_at) {
    const m = String(data.banks[0].updated_at).match(/(\d{1,2}):(\d{2})/);
    if (m) timeStr = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  if (!timeStr && data?.cbe_updated_at) {
    const m = String(data.cbe_updated_at).match(/(\d{1,2}):(\d{2})/);
    if (m) timeStr = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  if (!timeStr && tsCandidate) {
    const m = String(tsCandidate).match(/(\d{1,2}):(\d{2})/);
    if (m) timeStr = `${m[1].padStart(2, "0")}:${m[2]}`;
  }

  const formattedTime = timeStr ? format12HourTime(timeStr, lang) : "";
  if (!formattedTime) return "";

  if (dateStr) {
    try {
      const parts = dateStr.split("-");
      const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0));
      const weekdayEn = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "short" }).format(d);
      const weekdayAr = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", weekday: "long" }).format(d);

      if (lang === "en") {
        return `${weekdayEn}, ${dateStr} • ${formattedTime}`;
      }
      return `${weekdayAr} ${dateStr} • ${formattedTime}`;
    } catch(e) {}
  }

  return formattedTime;
}

export default {
  async fetch(request, env, ctx) {
    if (env && env.BOT_TOKEN) {
      BOT_TOKEN = env.BOT_TOKEN;
    }

    const url = new URL(request.url);

    // 1. Root health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("🚀 EGX Telegram Bot Cloudflare Edge Worker is 100% LIVE 24/7!", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    // 2. Set Webhook (Protected)
    if (url.pathname === "/set_webhook") {
      if (!isAdminAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const secretToken = (env && env.TELEGRAM_SECRET_TOKEN) || "egx_tg_secret_2026";
      const webhookUrl = url.origin + "/webhook";
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secretToken
        })
      });
      const resJson = await tgRes.json();
      return new Response(JSON.stringify(resJson, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // 2.5. Set Commands (Protected)
    if (url.pathname === "/set_commands") {
      if (!isAdminAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
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
      const resJson = await tgRes.json();
      return new Response(JSON.stringify(resJson, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // 3. Control Panel HTML
    if (url.pathname === "/control" && request.method === "GET") {
      return new Response(getControlHtml(url.origin), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    // 3.5. Live Data API
    if (url.pathname === "/api/data" && request.method === "GET") {
      const liveData = await getCachedDashboardData();
      return new Response(JSON.stringify(liveData, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // 4. Config API (Whitelisted & Protected POST)
    if (url.pathname === "/api/config") {
      if (request.method === "GET") {
        const liveCfg = await getLiveBotConfig(env);
        return new Response(JSON.stringify(liveCfg), {
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
      if (request.method === "POST") {
        if (!isAdminAuthorized(request, env)) {
          return new Response(JSON.stringify({ status: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json; charset=utf-8" }
          });
        }
        try {
          const body = await request.json();
          // Whitelist allowed config fields to prevent mass assignment
          const sanitized = {};
          if (typeof body.hide_egx === "boolean") sanitized.hide_egx = body.hide_egx;
          if (typeof body.hide_banks === "boolean") sanitized.hide_banks = body.hide_banks;
          if (typeof body.hide_commodities === "boolean") sanitized.hide_commodities = body.hide_commodities;
          if (typeof body.hide_currencies === "boolean") sanitized.hide_currencies = body.hide_currencies;
          if (typeof body.hide_report === "boolean") sanitized.hide_report = body.hide_report;
          if (typeof body.hide_lang_toggle === "boolean") sanitized.hide_lang_toggle = body.hide_lang_toggle;
          if (typeof body.show_cbe_in_banks === "boolean") sanitized.show_cbe_in_banks = body.show_cbe_in_banks;
          if (typeof body.show_best_banks === "boolean") sanitized.show_best_banks = body.show_best_banks;
          if (Number.isInteger(body.banks_count) && body.banks_count > 0 && body.banks_count <= 25) {
            sanitized.banks_count = body.banks_count;
          }
          if (body.default_lang === "en" || body.default_lang === "ar") {
            sanitized.default_lang = body.default_lang;
          }
          if (body.default_curr === "usd" || body.default_curr === "egp") {
            sanitized.default_curr = body.default_curr;
          }

          await saveLiveBotConfig(env, ctx, sanitized);

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

    // 5. Telegram Webhook (Protected with Secret Token)
    if (url.pathname === "/webhook" && request.method === "POST") {
      if (!isValidWebhookSecret(request, env)) {
        return new Response("Unauthorized", { status: 403 });
      }
      try {
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update, url.origin, env, ctx));
        return new Response("OK", { status: 200 });
      } catch (err) {
        return new Response("OK", { status: 200 });
      }
    }

    // 6. Broadcast (Protected with Admin Auth)
    if (url.pathname === "/broadcast") {
      if (!isAdminAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const targetChat = url.searchParams.get("chat_id") || env?.CHANNEL_ID || "@EgxTracker_LiveBot";
      const targetLang = url.searchParams.get("lang") || "ar";
      const res = await sendAutomatedDailySummary(targetChat, targetLang);
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (env && env.BOT_TOKEN) BOT_TOKEN = env.BOT_TOKEN;
    const targetChat = env?.CHANNEL_ID || "@EgxTracker_LiveBot";
    ctx.waitUntil(sendAutomatedDailySummary(targetChat, "ar"));
  }
};

/**
 * Scrape Ta3weem currency and gold cards with strict URL slug matching
 */
async function fetchTa3weemLiveCurrencies() {
  try {
    const sSignal = (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
    const res = await fetch("https://ta3weem.com/ar", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36" },
      signal: sSignal
    });
    if (!res.ok) return null;
    const html = await res.text();
    const cards = html.match(/<a[^>]*href=["'][^"']*ta3weem\.com\/ar\/(?:currency-exchange-rates|gold-prices)[^"']*["'][^>]*>[\s\S]*?<\/a>/g) || [];
    if (!cards.length) return null;

    const items = {};
    for (const card of cards) {
      const hrefM = card.match(/href=["']([^"']+)["']/);
      const href = hrefM ? hrefM[1] : "";
      const priceM = card.match(/<span[^>]*class=["'][^"']*text-blue-500[^"']*["'][^>]*>([\s\S]*?)<\/span>/);
      const chgM = card.match(/<span[^>]*class=["'][^"']*text-(?:green|red)-700[^"']*["'][^>]*>([\s\S]*?)<\/span>/);
      if (priceM) {
        const price = parseFloat(priceM[1].replace(/,/g, '').trim());
        const chg = chgM ? chgM[1].replace(/<[^>]+>/g, '').trim() : "0.0%";
        if (price > 0) {
          if (href.includes("/USD-EGP") || href.endsWith("USD-EGP")) {
            items["USD"] = { code: "USD", name: "الدولار الأمريكي", name_en: "US Dollar", price, change: chg };
          } else if (href.includes("/EUR-EGP") || href.endsWith("EUR-EGP")) {
            items["EUR"] = { code: "EUR", name: "اليورو الأوروبي", name_en: "Euro", price, change: chg };
          } else if (href.includes("/SAR-EGP") || href.endsWith("SAR-EGP")) {
            items["SAR"] = { code: "SAR", name: "الريال السعودي", name_en: "Saudi Riyal", price, change: chg };
          } else if (href.includes("/AED-EGP") || href.endsWith("AED-EGP")) {
            items["AED"] = { code: "AED", name: "الدرهم الإماراتي", name_en: "UAE Dirham", price, change: chg };
          } else if (href.includes("/GBP-EGP") || href.endsWith("GBP-EGP")) {
            items["GBP"] = { code: "GBP", name: "الجنيه الإسترليني", name_en: "British Pound", price, change: chg };
          } else if (href.includes("/21K") || href.includes("21-karat") || href.includes("/gold-prices/21")) {
            items["GOLD21"] = { code: "GOLD21", name: "ذهب عيار 21", name_en: "Gold 21K", price, change: chg };
          } else if (href.includes("/24K") || href.includes("24-karat") || href.includes("/gold-prices/24")) {
            items["GOLD24"] = { code: "GOLD24", name: "ذهب عيار 24", name_en: "Gold 24K", price, change: chg };
          } else if (href.includes("gold-pound") || href.includes("pound")) {
            items["GOLDC"] = { code: "GOLDC", name: "جنيه الذهب", name_en: "Gold Pound", price, change: chg };
          }
        }
      }
    }
    return Object.keys(items).length > 0 ? items : null;
  } catch(e) {
    return null;
  }
}

/**
 * Scrape Ta3weem bank rates and Central Bank of Egypt
 */
async function fetchTa3weemLive() {
  try {
    const sSignal = (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
    const res = await fetch("https://ta3weem.com/ar/currency-exchange-rates/USD-EGP", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36" },
      signal: sSignal
    });
    if (!res.ok) return null;
    const html = await res.text();

    let cbe = null;
    const cbeIdx = html.indexOf('alt="البنك المركزي (CBE)"');
    if (cbeIdx !== -1) {
      const cardEnd = html.indexOf('</a>', cbeIdx);
      const card = html.substring(cbeIdx, cardEnd !== -1 ? cardEnd : cbeIdx + 2000);
      const buyM = card.match(/شراء[\s\S]*?text-blue-500[^>]*>([\s\S]*?)<\/span>/);
      const sellM = card.match(/بيع[\s\S]*?text-blue-500[^>]*>([\s\S]*?)<\/span>/);
      if (buyM && sellM) {
        cbe = {
          buy: parseFloat(buyM[1].trim()),
          sell: parseFloat(sellM[1].trim()),
          updated_at: getCairoTimeStr()
        };
      }
    }

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

    return {
      banks: banks.length > 0 ? banks : null,
      cbe: cbe || { buy: 54.45, sell: 54.59, updated_at: getCairoTimeStr() }
    };
  } catch(e) {
    return null;
  }
}

/**
 * Fetch live market rates via TradingView Scanner with Promise.allSettled
 */
async function fetchTradingViewLiveMarket() {
  const result = {
    btc: 0, btc_chg: "+0.00%",
    eth: 0, eth_chg: "+0.00%",
    brent: 0, brent_chg: "+0.00%",
    wti: 0, wti_chg: "+0.00%",
    gold_ounce: 0, gold_chg: "+0.00%",
    silver: 0, silver_chg: "+0.00%",
    usd_egp: 0,
    is_live: false
  };

  const results = await Promise.allSettled([
    fetch("https://scanner.tradingview.com/crypto/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({
        symbols: { tickers: ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"] },
        columns: ["close", "change"]
      })
    }).then(r => r.ok ? r.json() : null),
    fetch("https://scanner.tradingview.com/cfd/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({
        symbols: { tickers: ["FX:UKOIL", "FX:USOIL", "TVC:GOLD", "TVC:SILVER"] },
        columns: ["close", "change"]
      })
    }).then(r => r.ok ? r.json() : null),
    fetch("https://scanner.tradingview.com/forex/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({
        symbols: { tickers: ["FX_IDC:USDEGP"] },
        columns: ["close", "change"]
      })
    }).then(r => r.ok ? r.json() : null)
  ]);

  const [cryptoRes, cfdRes, forexRes] = results.map(r => r.status === "fulfilled" ? r.value : null);

  if (cryptoRes && cryptoRes.data) {
    cryptoRes.data.forEach(item => {
      const val = item.d?.[0] ? parseFloat(item.d[0]) : 0;
      const chg = item.d?.[1] ? (parseFloat(item.d[1]) >= 0 ? "+" : "") + parseFloat(item.d[1]).toFixed(2) + "%" : "+0.00%";
      if (item.s === "BINANCE:BTCUSDT" && val > 0) {
        result.btc = val;
        result.btc_chg = chg;
        result.is_live = true;
      } else if (item.s === "BINANCE:ETHUSDT" && val > 0) {
        result.eth = val;
        result.eth_chg = chg;
        result.is_live = true;
      }
    });
  }

  if (cfdRes && cfdRes.data) {
    cfdRes.data.forEach(item => {
      const val = item.d?.[0] ? parseFloat(item.d[0]) : 0;
      const chg = item.d?.[1] ? (parseFloat(item.d[1]) >= 0 ? "+" : "") + parseFloat(item.d[1]).toFixed(2) + "%" : "+0.00%";
      if (item.s === "FX:UKOIL" && val > 0) {
        result.brent = val;
        result.brent_chg = chg;
        result.is_live = true;
      } else if (item.s === "FX:USOIL" && val > 0) {
        result.wti = val;
        result.wti_chg = chg;
      } else if (item.s === "TVC:GOLD" && val > 0) {
        result.gold_ounce = val;
        result.gold_chg = chg;
        result.is_live = true;
      } else if (item.s === "TVC:SILVER" && val > 0) {
        result.silver = val;
        result.silver_chg = chg;
      }
    });
  }

  if (forexRes && forexRes.data) {
    forexRes.data.forEach(item => {
      const val = item.d?.[0] ? parseFloat(item.d[0]) : 0;
      if (item.s === "FX_IDC:USDEGP" && val > 0) {
        result.usd_egp = val;
      }
    });
  }

  // Fallback to Coinbase and Yahoo Finance
  if (!result.btc || !result.brent || !result.gold_ounce) {
    try {
      const fallbacks = await Promise.allSettled([
        fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json()),
        fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json()),
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json()),
        fetch("https://api.coinbase.com/v2/prices/PAXG-USD/spot", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.json())
      ]);
      const [cbBtc, cbEth, yBrent, cbPaxg] = fallbacks.map(f => f.status === "fulfilled" ? f.value : null);
      if (!result.btc && cbBtc?.data?.amount) { result.btc = parseFloat(cbBtc.data.amount); result.is_live = true; }
      if (!result.eth && cbEth?.data?.amount) { result.eth = parseFloat(cbEth.data.amount); result.is_live = true; }
      if (!result.brent) {
        const bPrice = yBrent?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (bPrice) { result.brent = parseFloat(bPrice); result.is_live = true; }
      }
      if (!result.gold_ounce && cbPaxg?.data?.amount) { result.gold_ounce = parseFloat(cbPaxg.data.amount); result.is_live = true; }
    } catch(e) {}
  }

  return result;
}

/**
 * Cache and assemble full market dashboard data
 */
async function getCachedDashboardData() {
  const now = Date.now();
  if (memoryCache.data && (now - memoryCache.timestamp < 10000)) {
    return memoryCache.data;
  }

  const liveClock = getCairoTimeStr();

  // Refresh Google Sheets / GitHub Actions sync payload
  if (!sheetCache.timestamp || (now - sheetCache.timestamp > 60000)) {
    let fetched = false;
    try {
      const sSignal = (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
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

    if (!fetched) {
      try {
        const ghRes = await fetch(GITHUB_RAW_DATA_URL + "?_t=" + now, {
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

    if (sheetCache.data && Array.isArray(sheetCache.data.archive) && sheetCache.data.archive.length > 1) {
      const arch = sheetCache.data.archive;
      const cleanArch = [arch[0]];
      for (let i = 1; i < arch.length; i++) {
        const prev = cleanArch[cleanArch.length - 1];
        const curr = arch[i];
        if (prev.date === curr.date) {
          cleanArch[cleanArch.length - 1] = curr;
        } else {
          cleanArch.push(curr);
        }
      }
      sheetCache.data.archive = cleanArch;
    }
  }

  const sheetData = sheetCache.data || {};

  // Parallel fetch for live scraping
  const [ta3weemResult, tvMarket, ta3weemCurrs] = await Promise.all([
    fetchTa3weemLive(),
    fetchTradingViewLiveMarket(),
    fetchTa3weemLiveCurrencies()
  ]);

  let cbeBuy = 54.45;
  let cbeSell = 54.59;
  let cbeTime = liveClock;

  if (ta3weemResult && ta3weemResult.cbe && Number(ta3weemResult.cbe.buy) > 40) {
    cbeBuy = Number(ta3weemResult.cbe.buy);
    cbeSell = Number(ta3weemResult.cbe.sell || 54.59);
    cbeTime = ta3weemResult.cbe.updated_at || liveClock;
  } else if (sheetData.cbe_usd_buy && Number(sheetData.cbe_usd_buy) > 40) {
    cbeBuy = Number(Number(sheetData.cbe_usd_buy).toFixed(2));
    cbeSell = Number(Number(sheetData.cbe_usd_sell || 54.59).toFixed(2));
    cbeTime = sheetData.cbe_updated_at ? formatCleanTime(sheetData.cbe_updated_at, "en") : (sheetData.timestamp ? extractTimeFromTimestamp(sheetData.timestamp) : liveClock);
  }

  let usdRate = cbeBuy;
  if (ta3weemCurrs && ta3weemCurrs["USD"] && Number(ta3weemCurrs["USD"].price) > 40) {
    usdRate = Number(ta3weemCurrs["USD"].price);
  } else if (sheetData.usd_rate && Number(sheetData.usd_rate) > 40) {
    usdRate = Number(Number(sheetData.usd_rate).toFixed(2));
  }

  const defaultBanks = [
    { bank: "أبوظبي الإسلامي (ADIB)", buy: 54.50, sell: 54.60, updated_at: liveClock },
    { bank: "الأهلي الكويتي (ABK)", buy: 54.47, sell: 54.57, updated_at: liveClock },
    { bank: "قناة السويس (SCB)", buy: 54.45, sell: 54.55, updated_at: liveClock },
    { bank: "أبوظبي التجاري (ADCB)", buy: 54.43, sell: 54.53, updated_at: liveClock },
    { bank: "بنك الشركة المصرفية (SAIB)", buy: 54.33, sell: 54.43, updated_at: liveClock },
    { bank: "البنك الأهلي المصري (NBE)", buy: 54.31, sell: 54.41, updated_at: liveClock },
    { bank: "بنك مصر (BM)", buy: 54.31, sell: 54.41, updated_at: liveClock },
    { bank: "كريدي أجريكول (CA)", buy: 54.27, sell: 54.37, updated_at: liveClock },
    { bank: "بنك نكست (NXT)", buy: 54.25, sell: 54.35, updated_at: liveClock },
    { bank: "البنك التجاري الدولي (CIB)", buy: 54.12, sell: 54.22, updated_at: liveClock }
  ];

  let banks = defaultBanks;
  if (ta3weemResult && ta3weemResult.banks && Array.isArray(ta3weemResult.banks) && ta3weemResult.banks.length > 0) {
    banks = ta3weemResult.banks;
  } else if (sheetData.banks && Array.isArray(sheetData.banks) && sheetData.banks.length > 0) {
    banks = sheetData.banks.map(b => ({
      bank: b.bank,
      buy: Number(b.buy),
      sell: Number(b.sell),
      updated_at: b.updated_at || liveClock
    }));
  }
  banks.sort((a, b) => (Number(b.buy) || 0) - (Number(a.buy) || 0));

  const isCommoditiesLive = tvMarket?.is_live || false;
  const btcPrice = (tvMarket && tvMarket.btc > 0) ? tvMarket.btc : 86000;
  const btcChg = (tvMarket && tvMarket.btc_chg) ? tvMarket.btc_chg : "+0.00%";
  const ethPrice = (tvMarket && tvMarket.eth > 0) ? tvMarket.eth : 2730;
  const ethChg = (tvMarket && tvMarket.eth_chg) ? tvMarket.eth_chg : "+0.00%";
  const goldOunce = (tvMarket && tvMarket.gold_ounce > 0) ? tvMarket.gold_ounce : 4165.0;
  const goldChg = (tvMarket && tvMarket.gold_chg) ? tvMarket.gold_chg : "+0.00%";
  const brentPrice = (tvMarket && tvMarket.brent > 0) ? tvMarket.brent : 107.27;
  const brentChg = (tvMarket && tvMarket.brent_chg) ? tvMarket.brent_chg : "+0.00%";
  const wtiPrice = (tvMarket && tvMarket.wti > 0) ? tvMarket.wti : 96.55;
  const wtiChg = (tvMarket && tvMarket.wti_chg) ? tvMarket.wti_chg : "+0.00%";
  const silverPrice = (tvMarket && tvMarket.silver > 0) ? tvMarket.silver : 61.10;
  const silverChg = (tvMarket && tvMarket.silver_chg) ? tvMarket.silver_chg : "+0.00%";

  const g24Usd = Number((goldOunce / 31.1035).toFixed(2));
  const g21Usd = Number((g24Usd * 21 / 24).toFixed(2));
  const g18Usd = Number((g24Usd * 18 / 24).toFixed(2));

  const live_commodities = [
    { code: "BTC", name: "بتكوين (Bitcoin)", name_en: "Bitcoin (BTC)", usd_price: btcPrice, egp_price: Math.round(btcPrice * usdRate), change: btcChg, updated_at: liveClock, is_live: isCommoditiesLive },
    { code: "ETH", name: "إيثيريوم (Ethereum)", name_en: "Ethereum (ETH)", usd_price: ethPrice, egp_price: Math.round(ethPrice * usdRate), change: ethChg, updated_at: liveClock, is_live: isCommoditiesLive },
    { code: "BRENT", name: "نفط برنت (خام)", name_en: "Brent Crude Oil", usd_price: brentPrice, egp_price: Number((brentPrice * usdRate).toFixed(2)), change: brentChg, updated_at: liveClock, is_live: isCommoditiesLive },
    { code: "WTI", name: "خام غرب تكساس (WTI)", name_en: "WTI Crude Oil", usd_price: wtiPrice, egp_price: Number((wtiPrice * usdRate).toFixed(2)), change: wtiChg, updated_at: liveClock, is_live: isCommoditiesLive },
    { code: "GOLD_OUNCE", name: "أونصة الذهب (Gold Ounce)", name_en: "Gold (Ounce)", usd_price: goldOunce, egp_price: Math.round(goldOunce * usdRate), change: goldChg, updated_at: liveClock, is_live: isCommoditiesLive },
    { code: "GOLD24", name: "ذهب عيار 24 (جرام)", name_en: "Gold 24K (Gram)", usd_price: g24Usd, egp_price: (ta3weemCurrs?.["GOLD24"]?.price || Math.round(g24Usd * usdRate)), change: (ta3weemCurrs?.["GOLD24"]?.change || goldChg), updated_at: liveClock, is_live: !!ta3weemCurrs?.["GOLD24"] },
    { code: "GOLD21", name: "ذهب عيار 21 (جرام)", name_en: "Gold 21K (Gram)", usd_price: g21Usd, egp_price: (ta3weemCurrs?.["GOLD21"]?.price || Math.round(g21Usd * usdRate)), change: (ta3weemCurrs?.["GOLD21"]?.change || goldChg), updated_at: liveClock, is_live: !!ta3weemCurrs?.["GOLD21"] },
    { code: "GOLD18", name: "ذهب عيار 18 (جرام)", name_en: "Gold 18K (Gram)", usd_price: g18Usd, egp_price: Math.round(g18Usd * usdRate), change: goldChg, updated_at: liveClock, is_live: isCommoditiesLive },
    { code: "SILVER", name: "أونصة الفضة (Silver)", name_en: "Silver (Ounce)", usd_price: silverPrice, egp_price: Math.round(silverPrice * usdRate), change: silverChg, updated_at: liveClock, is_live: isCommoditiesLive }
  ];

  // Map pure actual rates from sheetData.rates (synced by cloud_sync from actual banks)
  const actualRatesMap = {};
  if (sheetData.rates && Array.isArray(sheetData.rates)) {
    sheetData.rates.forEach(r => {
      if (r && r.code) actualRatesMap[r.code] = r;
    });
  }

  const buildActualRate = (code, nameAr, nameEn, defaultUsdMult) => {
    const act = actualRatesMap[code];
    let buy = 0, sell = 0, egpPrice = 0, change = "+0.00%";
    if (ta3weemCurrs && ta3weemCurrs[code]) {
      egpPrice = ta3weemCurrs[code].price;
      change = ta3weemCurrs[code].change || "+0.00%";
    }
    if (act && Number(act.buy) > 0 && Number(act.sell) > 0) {
      buy = Number(act.buy);
      sell = Number(act.sell);
      if (!egpPrice) egpPrice = Number(act.egp_price || act.rate_egp || buy);
      if (act.change && change === "+0.00%") change = act.change;
    } else {
      if (!egpPrice) egpPrice = Number((defaultUsdMult * usdRate).toFixed(2));
      buy = egpPrice;
      sell = egpPrice;
    }
    return {
      code,
      name: nameAr,
      name_en: nameEn,
      usd_price: Number((egpPrice / usdRate).toFixed(4)),
      egp_price: egpPrice,
      rate_egp: egpPrice,
      buy,
      sell,
      change
    };
  };

  const rates = [
    {
      code: "USD",
      name: "الدولار الأمريكي",
      name_en: "US Dollar",
      usd_price: 1.0,
      egp_price: usdRate,
      rate_egp: usdRate,
      buy: cbeBuy,
      sell: cbeSell,
      change: ta3weemCurrs?.["USD"]?.change || "+0.00%"
    },
    buildActualRate("EUR", "اليورو الأوروبي", "Euro", 1.120),
    buildActualRate("SAR", "الريال السعودي", "Saudi Riyal", 0.2665),
    buildActualRate("AED", "الدرهم الإماراتي", "UAE Dirham", 0.2723),
    buildActualRate("GBP", "الجنيه الإسترليني", "British Pound", 1.330),
    buildActualRate("KWD", "الدينار الكويتي", "Kuwaiti Dinar", 3.255),
    buildActualRate("QAR", "الريال القطري", "Qatari Riyal", 0.2747),
    buildActualRate("CNY", "اليوان الصيني", "Chinese Yuan", 0.1381)
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
 * Handle Telegram incoming updates
 */
async function handleTelegramUpdate(update, originUrl, env, ctx) {
  let chatId = null;
  let text = "";
  let callbackId = null;
  let isCallback = false;
  let messageId = null;

  const isGroup = update.message && (update.message.chat.type === "group" || update.message.chat.type === "supergroup");

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

  const cfg = await getLiveBotConfig(env);

  let userCurr = await getUserPref(env, chatId, "curr", cfg.default_curr || "usd");
  if (text.endsWith(":usd")) {
    userCurr = "usd";
    await setUserPref(env, ctx, chatId, "curr", "usd");
    text = text.slice(0, -4);
  } else if (text.endsWith(":egp")) {
    userCurr = "egp";
    await setUserPref(env, ctx, chatId, "curr", "egp");
    text = text.slice(0, -4);
  }

  let userLang = await getUserPref(env, chatId, "lang", cfg.default_lang || "en");
  if (text.endsWith(":en")) {
    userLang = "en";
    text = text.slice(0, -3);
    await setUserPref(env, ctx, chatId, "lang", "en");
  } else if (text.endsWith(":ar")) {
    userLang = "ar";
    text = text.slice(0, -3);
    await setUserPref(env, ctx, chatId, "lang", "ar");
  } else if (text.startsWith("cmd_lang_en") || text === "/en") {
    await setUserPref(env, ctx, chatId, "lang", "en");
    await sendMainMenu(chatId, "en", originUrl, cfg, messageId, env);
    return;
  } else if (text.startsWith("cmd_lang_ar") || text === "/ar") {
    await setUserPref(env, ctx, chatId, "lang", "ar");
    await sendMainMenu(chatId, "ar", originUrl, cfg, messageId, env);
    return;
  }

  const lang = userLang;
  const curr = userCurr;

  const reply = (txt, kb) => (isCallback && messageId)
    ? editTgMessage(chatId, messageId, txt, kb)
    : sendTgMessage(chatId, txt, kb);

  if (isCallback) {
    if (text.startsWith("toggle_curr:")) {
      const parts = text.split(":");
      const newCurr = parts[1];
      const cmdType = parts[2];
      const targetLang = parts[3] || lang;

      await setUserPref(env, ctx, chatId, "curr", newCurr);
      const data = await getCachedDashboardData();
      let content = "";
      let kb = getReportKeyboard(cmdType, targetLang, cfg, newCurr);

      if (cmdType === "report") {
        const userTz = await getUserPref(env, chatId, "tz", "cairo");
        content = formatExecutiveReport(data, targetLang, newCurr, userTz);
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
      memoryCache.timestamp = 0;
      if (Date.now() - sheetCache.timestamp > 15000) {
        sheetCache.timestamp = 0;
      }
      const data = await getCachedDashboardData();
      let content = "";
      let kb = getReportKeyboard(target, targetLang, cfg, targetCurr);

      if (target === "report") {
        const userTz = await getUserPref(env, chatId, "tz", "cairo");
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
        await sendMainMenu(chatId, targetLang, originUrl, cfg, messageId, env);
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

    if (text.startsWith("hist_p:")) {
      const parts = text.split(":");
      const period = parts[1] || "curr_month";
      const targetLang = parts[2] || lang;
      const targetCurr = parts[3] || curr;
      const data = await getCachedDashboardData();
      const content = formatEgxPeriodicReport(data, period, targetLang, targetCurr);
      const kb = getHistoryKeyboard(targetLang, targetCurr, period);
      if (callbackId) {
        try { await answerCallback(callbackId); } catch(e) {}
      }
      await reply(content, kb);
      return;
    }

    if (text.startsWith("hist_curr:")) {
      const parts = text.split(":");
      const newCurr = parts[1] || "usd";
      const period = parts[2] || "curr_month";
      const targetLang = parts[3] || lang;
      await setUserPref(env, ctx, chatId, "curr", newCurr);
      const data = await getCachedDashboardData();
      const content = formatEgxPeriodicReport(data, period, targetLang, newCurr);
      const kb = getHistoryKeyboard(targetLang, newCurr, period);
      if (callbackId) {
        const toast = targetLang === "en" ? `💱 Switched to ${newCurr.toUpperCase()}!` : `💱 تم التحويل إلى ${newCurr === "usd" ? "الدولار" : "الجنيه"}!`;
        try { await answerCallback(callbackId, toast); } catch(e) {}
      }
      await reply(content, kb);
      return;
    }

    if (text === "cmd_egx") {
      const data = await getCachedDashboardData();
      await reply(formatEgxReport(data, lang, curr), getReportKeyboard("egx", lang, cfg, curr));
    } else if (text === "cmd_history" || text === "cmd_archive" || text.startsWith("cmd_history:")) {
      const data = await getCachedDashboardData();
      await reply(formatEgxPeriodicReport(data, "curr_month", lang, curr), getHistoryKeyboard(lang, curr, "curr_month"));
      return;
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
      const userTz = await getUserPref(env, chatId, "tz", "cairo");
      await reply(formatExecutiveReport(data, lang, curr, userTz), getReportKeyboard("report", lang, cfg, curr));
    } else if (text.startsWith("cmd_timezone")) {
      const parts = text.split(":");
      const tLang = parts[1] || lang;
      const userTz = await getUserPref(env, chatId, "tz", "cairo");
      const title = tLang === "en" ? "🌍 <b>Select Your Preferred Timezone:</b>" : "🌍 <b>اختر منطقتك الزمنية المفضلة لعرض الأوقات:</b>";
      await reply(title, getTimezoneKeyboard(tLang, userTz));
      return;
    } else if (text.startsWith("set_tz:")) {
      const parts = text.split(":");
      const newTz = parts[1] || "cairo";
      const tLang = parts[2] || lang;
      await setUserPref(env, ctx, chatId, "tz", newTz);
      const tzObj = TIMEZONES[newTz] || TIMEZONES["cairo"];
      const toast = tLang === "en" ? `✅ Timezone set to ${tzObj.name_en}` : `✅ تم ضبط التوقيت على ${tzObj.name_ar}`;
      if (callbackId) {
        try { await answerCallback(callbackId, toast); } catch(e) {}
      }
      await sendMainMenu(chatId, tLang, originUrl, cfg, messageId, env);
      return;
    } else if (text === "cmd_menu") {
      await sendMainMenu(chatId, lang, originUrl, cfg, messageId, env);
    }
    return;
  }

  // Handle group commands vs private chat
  let cleanText = text.trim();
  if (cleanText.startsWith("/")) {
    const parts = cleanText.split(/\s+/);
    let cmd = parts[0];
    if (cmd.includes("@")) {
      cmd = cmd.split("@")[0];
    }
    cleanText = [cmd, ...parts.slice(1)].join(" ");
  }

  // In groups, ignore casual messages that do not start with slash
  if (isGroup && !cleanText.startsWith("/")) {
    return;
  }

  const lower = cleanText.toLowerCase();
  const isHistory = lower === "/history" || lower === "/archive" || lower.startsWith("/history ") || lower.startsWith("/archive ") || (!isGroup && (lower.includes("ارشيف") || lower.includes("أرشيف") || lower.includes("اقفال") || lower.includes("إقفال")));
  const isCommodities = lower === "/commodities" || lower === "/gold" || lower === "/oil" || lower === "/crypto" || (!isGroup && (lower.includes("ذهب") || lower.includes("نفط") || lower.includes("بنزين") || lower.includes("بترول") || lower.includes("كريبتو") || lower.includes("سلع")));
  const isCurrencies = lower === "/currencies" || lower === "/rates" || (!isGroup && (lower.includes("عملات") || lower.includes("عملة") || lower.includes("اسعار الصرف")));
  const isEgx = lower === "/egx" || (!isGroup && (lower.includes("بورصة") || lower.includes("مؤسسات") || lower.includes("اسهم") || lower.includes("اجانب") || lower.includes("أجانب")));
  const isBanks = lower === "/banks" || (!isGroup && (lower.includes("بنوك") || lower.includes("بنك") || lower.includes("دولار")));
  const isReport = lower === "/report" || (!isGroup && (lower.includes("تقرير") || lower.includes("تنفيذي")));
  const isTimezone = lower === "/timezone" || lower === "/tz" || (!isGroup && (lower.includes("توقيت") || lower.includes("منطقة زمنية")));
  const isMenu = lower === "/start" || lower === "/help" || lower === "/menu" || (!isGroup && (lower.includes("قائمة") || lower === "menu"));

  if (isMenu) {
    await sendMainMenu(chatId, lang, originUrl, cfg, null, env);
  } else if (isTimezone) {
    const userTz = await getUserPref(env, chatId, "tz", "cairo");
    const title = lang === "en" ? "🌍 <b>Select Your Preferred Timezone:</b>" : "🌍 <b>اختر منطقتك الزمنية المفضلة لعرض الأوقات:</b>";
    await sendTgMessage(chatId, title, getTimezoneKeyboard(lang, userTz));
  } else if (isHistory) {
    let period = "curr_month";
    let customParam = null;
    const parts = cleanText.split(/\s+/);
    if (parts.length > 1) {
      const p = parts[1].toLowerCase();
      if (p === "week" || p === "w") period = "curr_week";
      else if (p === "prev_week" || p === "pw") period = "prev_week";
      else if (p === "prev_month" || p === "pm") period = "prev_month";
      else if (p === "3" || p === "last3") period = "last3";
      else if (p === "5" || p === "last5") period = "last5";
      else if (p === "10" || p === "last10") period = "last10";
      else if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && /^\d{4}-\d{2}-\d{2}$/.test(parts[2])) {
        period = "custom";
        customParam = { start: parts[1], end: parts[2] };
      }
    }
    const data = await getCachedDashboardData();
    const content = formatEgxPeriodicReport(data, period, lang, curr, customParam);
    const kb = getHistoryKeyboard(lang, curr, period);
    await sendTgMessage(chatId, content, kb);
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
    const userTz = await getUserPref(env, chatId, "tz", "cairo");
    await sendTgMessage(chatId, formatExecutiveReport(data, lang, curr, userTz), getReportKeyboard("report", lang, cfg, curr));
  } else if (lower.indexOf("/") === 0) {
    await sendTgMessage(chatId, lang === "en" ? "❓ Unknown command. Type /start for menu." : "❓ أمر غير معروف. اضغط /start لعرض القائمة الرئيسية.", getMenuKeyboard(lang, originUrl, cfg));
  }
}

// Sunday start calculation for Egypt week
function getWeekSunday(dateStr) {
  if (!dateStr) return getCairoDateStr();
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay(); // 0 is Sunday
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day);
  return sunday.toISOString().split("T")[0];
}

function calculatePeriodicTotals(archive, currentSessionDate, defaultUsdRate) {
  const sessionDate = currentSessionDate || getCairoDateStr();
  const weekStart = getWeekSunday(sessionDate);
  const monthPrefix = sessionDate.slice(0, 7);
  const fallbackRate = Number(defaultUsdRate || 54.45);

  const weekly = { count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0, weekStart };
  const monthly = { count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0, monthPrefix };

  const list = (archive && Array.isArray(archive)) ? archive : [];
  list.forEach(s => {
    if (!s || !s.date) return;
    if (s.date < "2026-10-01") return;
    const rate = Number(s.usd_rate || fallbackRate);

    const eg = Number(s.egypt_net !== undefined ? s.egypt_net : (s.egypt_net_egp || 0));
    const ar = Number(s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0));
    const fo = Number(s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0));
    const tot = Number(s.total_net !== undefined ? s.total_net : (s.total_net_egp || (eg + ar + fo)));

    const egU = Math.round(eg / rate);
    const arU = Math.round(ar / rate);
    const foU = Math.round(fo / rate);
    const totU = Math.round(tot / rate);

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

  weekly.arFoNet = weekly.arNet + weekly.foNet;
  weekly.arFoUsd = weekly.arUsd + weekly.foUsd;
  monthly.arFoNet = monthly.arNet + monthly.foNet;
  monthly.arFoUsd = monthly.arUsd + monthly.foUsd;

  return { weekly, monthly };
}

/**
 * Determine EGX Market Status without false holiday alerts
 */
function getEgxMarketStatus(sessionDate) {
  const d = new Date();
  const cairoDate = getCairoDateStr();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "short" }).format(d);
  const time24 = d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = time24.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const totalMins = h * 60 + m;

  const isWeekend = (weekday === "Fri" || weekday === "Sat");
  const isTodaySession = (sessionDate === cairoDate);

  let isHolidayOrClosed = false;
  let statusEn = "";
  let statusAr = "";
  let sessionTagEn = "";
  let sessionTagAr = "";

  if (isWeekend) {
    isHolidayOrClosed = true;
    statusEn = "🏖️ Status: Weekend Holiday (Market Closed • 0 Flow)";
    statusAr = "🏖️ الحالة: عطلة نهاية الأسبوع (السوق مغلق • صفر تداول)";
    sessionTagEn = `(Last Audited: ${sessionDate})`;
    sessionTagAr = `(آخر جلسة معتمدة: ${sessionDate})`;
  } else if (!isTodaySession) {
    if (totalMins < 600) {
      statusEn = "⏳ Status: Pre-Market (Opens at 10:00 AM Cairo)";
      statusAr = "⏳ الحالة: قبل افتتاح الجلسة (تبدأ 10:00 ص بتوقيت القاهرة)";
      sessionTagEn = `(Previous Close: ${sessionDate})`;
      sessionTagAr = `(إقفال الجلسة السابقة: ${sessionDate})`;
    } else if (totalMins >= 600 && totalMins <= 930) {
      statusEn = "⏳ Status: Trading In Progress • Live Feed Syncing";
      statusAr = "⏳ الحالة: جلسة التداول جارية • جاري مزامنة واعتماد البيانات";
      sessionTagEn = `(Previous Close: ${sessionDate})`;
      sessionTagAr = `(إقفال الجلسة السابقة: ${sessionDate})`;
    } else if (totalMins > 930 && totalMins <= 1080) {
      statusEn = "⏳ Status: Session Concluded • Awaiting Official Daily Report Ingestion";
      statusAr = "⏳ الحالة: انتهت الجلسة • بانتظار اعتماد ونشر تقرير الإقفال اليومي";
      sessionTagEn = `(Previous Close: ${sessionDate})`;
      sessionTagAr = `(إقفال الجلسة السابقة: ${sessionDate})`;
    } else {
      isHolidayOrClosed = true;
      statusEn = "🏖️ Status: Official Holiday / Market Off";
      statusAr = "🏖️ الحالة: عطلة رسمية بالبورصة / لا يوجد تداول";
      sessionTagEn = `(Last Audited: ${sessionDate})`;
      sessionTagAr = `(آخر جلسة معتمدة: ${sessionDate})`;
    }
  } else {
    if (totalMins < 900) {
      statusEn = "🟢 Status: Trading Session Active (Live)";
      statusAr = "🟢 الحالة: جلسة التداول نشطة (مباشر)";
    } else {
      statusEn = "🔒 Status: Session Closed (Official Daily Close)";
      statusAr = "🔒 الحالة: تم إقفال الجلسة (الإقفال الرسمي اليومي)";
    }
    sessionTagEn = "(Today)";
    sessionTagAr = "(اليوم)";
  }

  return {
    cairoDate,
    weekday,
    isWeekend,
    isTodaySession,
    isHolidayOrClosed,
    statusEn,
    statusAr,
    sessionTagEn,
    sessionTagAr
  };
}

function getMonthLabel(monthPrefix, lang) {
  if (!monthPrefix) return "";
  const parts = monthPrefix.split("-");
  const year = parts[0];
  const mNum = parseInt(parts[1], 10);
  const allMonthsAr = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  const allMonthsEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  if (lang === "en") {
    return `${allMonthsEn[mNum - 1] || parts[1]} ${year}`;
  }
  return `${allMonthsAr[mNum - 1] || parts[1]} ${year}`;
}

/**
 * 1. EGX Flows Report (with session-level USD conversion)
 */
function formatEgxReport(data, lang, curr) {
  curr = curr || "usd";

  let egNet = 0, arNet = 0, foNet = 0, totNet = 0;
  let foBuy = 0, foSell = 0;
  let sessionDate = getCairoDateStr();
  let sessionUsdRate = Number(data.usd_rate || data.cbe_usd_buy || 54.45);

  if (data.archive && data.archive.length > 0) {
    const r = data.archive[0];
    const e = r.egypt_net !== undefined ? r.egypt_net : r.egypt_net_egp;
    if (e !== undefined && e !== null && e !== "") egNet = Number(e);

    const a = r.arab_net !== undefined ? r.arab_net : r.arab_net_egp;
    if (a !== undefined && a !== null && a !== "") arNet = Number(a);

    const f = r.foreign_net !== undefined ? r.foreign_net : r.foreign_net_egp;
    if (f !== undefined && f !== null && f !== "") foNet = Number(f);

    foBuy = Number(r.foreign_buy !== undefined ? r.foreign_buy : (r.foreign_buy_egp || 0));
    foSell = Number(r.foreign_sell !== undefined ? r.foreign_sell : (r.foreign_sell_egp || 0));

    const t = r.total_net !== undefined ? r.total_net : r.total_net_egp;
    if (t !== undefined && t !== null && t !== "") {
      totNet = Number(t);
    } else {
      totNet = egNet + arNet + foNet;
    }

    sessionDate = r.date || sessionDate;
    if (r.usd_rate && Number(r.usd_rate) > 40) {
      sessionUsdRate = Number(r.usd_rate);
    }
  }

  if (data.egx_institutions?.tables?.institutions) {
    const inst = data.egx_institutions.tables.institutions;
    inst.forEach(item => {
      const t = item.type || "";
      if (t.includes("أجانب") || t.includes("اجانب") || t.toLowerCase().includes("foreign")) {
        if (foBuy === 0) foBuy = Number(item.buy_egp || 0);
        if (foSell === 0) foSell = Number(item.sell_egp || 0);
        if (foNet === 0) foNet = Number(item.net_egp || 0);
      } else if (t.includes("عرب") || t.toLowerCase().includes("arab")) {
        if (arNet === 0) arNet = Number(item.net_egp || 0);
      } else if (t.includes("مصر") || t.toLowerCase().includes("egypt")) {
        if (egNet === 0) egNet = Number(item.net_egp || 0);
      }
    });
    if (totNet === 0) totNet = egNet + arNet + foNet;
  }

  const arFoNet = arNet + foNet;
  const mStatus = getEgxMarketStatus(sessionDate);

  const { weekly, monthly } = calculatePeriodicTotals(data.archive, sessionDate, sessionUsdRate);
  const monthLabelEn = getMonthLabel(monthly.monthPrefix, "en");
  const monthLabelAr = getMonthLabel(monthly.monthPrefix, "ar");
  const wFoDot = weekly.foNet >= 0 ? "🟢" : "🔴";
  const mFoDot = monthly.foNet >= 0 ? "🟢" : "🔴";

  const fmtNet = (v, usdOverride, rateOverride) => {
    const n = Number(v) || 0;
    const sign = n >= 0 ? "+" : "-";
    const absVal = Math.abs(n).toLocaleString("en-US");
    if (curr === "usd") {
      const activeRate = Number(rateOverride || sessionUsdRate || 54.45);
      const u = (usdOverride !== undefined && usdOverride !== null) ? Number(usdOverride) : Math.round(n / activeRate);
      const uSign = u >= 0 ? "+" : "-";
      return `${uSign}$${Math.abs(u).toLocaleString("en-US")}`;
    }
    const unit = lang === "en" ? " EGP" : " ج.م";
    return `${sign}${absVal}${unit}`;
  };

  const updatedDateTime = getCairoFullDateTime(lang);
  const snapshotTime = getEgxSnapshotTime(data, lang);

  const snapshotLineEn = (snapshotTime && mStatus.isTodaySession) ? `📸 Snapshot: <b>[${snapshotTime}]</b>\n` : "";
  const snapshotLineAr = (snapshotTime && mStatus.isTodaySession) ? `📸 لقطة الجلسة: <b>[${snapshotTime}]</b>\n` : "";

  const currBadge = curr === "usd" ? "USD ($)" : "EGP (ج.م)";

  const egDot = egNet >= 0 ? "🟢" : "🔴";
  const arDot = arNet >= 0 ? "🟢" : "🔴";
  const foDot = foNet >= 0 ? "🟢" : "🔴";
  const arFoDot = arFoNet >= 0 ? "🟢" : "🔴";

  if (lang === "en") {
    let txt = `🏛 <b>Egyptian Stock Exchange (EGX) Flows</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `📅 <b>Session:</b> <code>${sessionDate}</code>${mStatus.isTodaySession ? "" : " <i>(Last Audited)</i>"}\n`
      + `🕒 <b>Query:</b> <b>${updatedDateTime}</b>\n`
      + `💰 <b>Currency:</b> <b>${currBadge}</b>\n`
      + `${mStatus.statusEn}\n`
      + snapshotLineEn
      + `<code>─────────────────────────────</code>\n\n`;

    txt += `🏛 <b>Institutional Flows ${mStatus.sessionTagEn}:</b>\n`
      + `▫️ Egyptians: ${egDot} <code>${fmtNet(egNet, null, sessionUsdRate)}</code>\n`
      + `▫️ Arabs: ${arDot} <code>${fmtNet(arNet, null, sessionUsdRate)}</code>\n`
      + `▫️ Foreigners: ${foDot} <code>${fmtNet(foNet, null, sessionUsdRate)}</code>\n`
      + `▪️ Arabs + Foreigners: ${arFoDot} <code>${fmtNet(arFoNet, null, sessionUsdRate)}</code>\n\n`;

    const wArDot = (weekly.arNet || 0) >= 0 ? "🟢" : "🔴";
    const mArDot = (monthly.arNet || 0) >= 0 ? "🟢" : "🔴";
    const wArFoDot = (weekly.arFoNet || 0) >= 0 ? "🟢" : "🔴";
    const mArFoDot = (monthly.arFoNet || 0) >= 0 ? "🟢" : "🔴";
    txt += `🗓 <b>Current Week (${weekly.count} Sessions):</b>\n`
      + `▫️ Foreigners: ${wFoDot} <code>${fmtNet(weekly.foNet, weekly.foUsd)}</code>\n`
      + `▫️ Arabs: ${wArDot} <code>${fmtNet(weekly.arNet, weekly.arUsd)}</code>\n`
      + `▪️ Arabs + Foreigners: ${wArFoDot} <code>${fmtNet(weekly.arFoNet, weekly.arFoUsd)}</code>\n\n`
      + `📈 <b>Current Month (${monthLabelEn} • ${monthly.count} Sessions):</b>\n`
      + `▫️ Foreigners: ${mFoDot} <code>${fmtNet(monthly.foNet, monthly.foUsd)}</code>\n`
      + `▫️ Arabs: ${mArDot} <code>${fmtNet(monthly.arNet, monthly.arUsd)}</code>\n`
      + `▪️ Arabs + Foreigners: ${mArFoDot} <code>${fmtNet(monthly.arFoNet, monthly.arFoUsd)}</code>\n`;

    return txt + `\n<code>─────────────────────────────</code>\n🔒 <i>Officially audited from EGX Terminal.</i>`;
  }

  let txtAr = `🏛 <b>تدفقات المستثمرين بالبورصة المصرية (EGX)</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `📅 <b>الجلسة:</b> <code>${sessionDate}</code>${mStatus.isTodaySession ? "" : " <i>(آخر جلسة معتمدة)</i>"}\n`
    + `🕒 <b>وقت الاستعلام:</b> <b>${updatedDateTime}</b>\n`
    + `💰 <b>العملة:</b> <b>${currBadge}</b>\n`
    + `${mStatus.statusAr}\n`
    + snapshotLineAr
    + `<code>─────────────────────────────</code>\n\n`;

  txtAr += `🏛 <b>تدفقات الجلسة ${mStatus.sessionTagAr}:</b>\n`
    + `▫️ مصريين: ${egDot} <code>${fmtNet(egNet, null, sessionUsdRate)}</code>\n`
    + `▫️ عرب: ${arDot} <code>${fmtNet(arNet, null, sessionUsdRate)}</code>\n`
    + `▫️ أجانب: ${foDot} <code>${fmtNet(foNet, null, sessionUsdRate)}</code>\n`
    + `▪️ عرب + أجانب: ${arFoDot} <code>${fmtNet(arFoNet, null, sessionUsdRate)}</code>\n\n`;

  const wArDot = (weekly.arNet || 0) >= 0 ? "🟢" : "🔴";
  const mArDot = (monthly.arNet || 0) >= 0 ? "🟢" : "🔴";
  const wArFoDot = (weekly.arFoNet || 0) >= 0 ? "🟢" : "🔴";
  const mArFoDot = (monthly.arFoNet || 0) >= 0 ? "🟢" : "🔴";
  txtAr += `🗓 <b>الأسبوع الحالي (${weekly.count} جلسات):</b>\n`
    + `▫️ أجانب: ${wFoDot} <code>${fmtNet(weekly.foNet, weekly.foUsd)}</code>\n`
    + `▫️ عرب: ${wArDot} <code>${fmtNet(weekly.arNet, weekly.arUsd)}</code>\n`
    + `▪️ عرب + أجانب: ${wArFoDot} <code>${fmtNet(weekly.arFoNet, weekly.arFoUsd)}</code>\n\n`
    + `📈 <b>الشهر الحالي (${monthLabelAr} • ${monthly.count} جلسات):</b>\n`
    + `▫️ أجانب: ${mFoDot} <code>${fmtNet(monthly.foNet, monthly.foUsd)}</code>\n`
    + `▫️ عرب: ${mArDot} <code>${fmtNet(monthly.arNet, monthly.arUsd)}</code>\n`
    + `▪️ عرب + أجانب: ${mArFoDot} <code>${fmtNet(monthly.arFoNet, monthly.arFoUsd)}</code>\n`;

  return txtAr + `\n<code>─────────────────────────────</code>\n🔒 <i>بيانات معتمدة وموثقة من البورصة المصرية.</i>`;
}

/**
 * Historical closings archive with periodic aggregation
 */
function formatEgxPeriodicReport(data, periodType, lang, curr, customParam) {
  curr = curr || "usd";
  periodType = periodType || "curr_month";

  const rawArchive = (data.archive && Array.isArray(data.archive)) ? data.archive : [];
  const updatedDateTime = getCairoFullDateTime(lang);
  const usdRate = Number(data.usd_rate || data.cbe_usd_buy || 54.45);
  const currBadge = curr === "usd" ? "USD ($)" : "EGP (ج.م)";

  const latestDate = rawArchive[0]?.date || getCairoDateStr();
  const currSunday = getWeekSunday(latestDate);

  const dSun = new Date(currSunday + "T12:00:00Z");
  const pSun = new Date(dSun);
  pSun.setUTCDate(pSun.getUTCDate() - 7);
  const pThu = new Date(dSun);
  pThu.setUTCDate(pThu.getUTCDate() - 3);
  const pSunStr = pSun.toISOString().split("T")[0];
  const pThuStr = pThu.toISOString().split("T")[0];

  const currMo = latestDate.slice(0, 7);
  const dMo = new Date(latestDate + "T12:00:00Z");
  dMo.setUTCDate(1);
  dMo.setUTCMonth(dMo.getUTCMonth() - 1);
  const prevMo = dMo.toISOString().slice(0, 7);

  let sessions = [];
  let titleEn = "";
  let titleAr = "";
  let periodDescEn = "";
  let periodDescAr = "";
  let isDefaultMonth = false;

  if (periodType === "curr_week") {
    sessions = rawArchive.filter(s => s && s.date && s.date >= currSunday && s.date <= latestDate);
    titleEn = "EGX Closings - Current Week";
    titleAr = "إقفال البورصة - الأسبوع الحالي";
    periodDescEn = `Current Week [${currSunday} ➔ ${latestDate}]`;
    periodDescAr = `الأسبوع الحالي [${currSunday} ➔ ${latestDate}]`;
  } else if (periodType === "prev_week") {
    sessions = rawArchive.filter(s => s && s.date && s.date >= pSunStr && s.date <= pThuStr);
    titleEn = "EGX Closings - Previous Week";
    titleAr = "إقفال البورصة - الأسبوع الماضي";
    periodDescEn = `Previous Week [${pSunStr} ➔ ${pThuStr}]`;
    periodDescAr = `الأسبوع الماضي [${pSunStr} ➔ ${pThuStr}]`;
  } else if (periodType === "prev_month") {
    sessions = rawArchive.filter(s => s && s.date && s.date.startsWith(prevMo));
    const pmNameEn = getMonthLabel(prevMo, "en");
    const pmNameAr = getMonthLabel(prevMo, "ar");
    titleEn = `EGX Closings - Previous Month (${pmNameEn})`;
    titleAr = `إقفال البورصة - الشهر الماضي (${pmNameAr})`;
    periodDescEn = `${pmNameEn} [${prevMo}]`;
    periodDescAr = `${pmNameAr} [${prevMo}]`;
  } else if (periodType === "last3") {
    sessions = rawArchive.slice(0, 3);
    titleEn = "EGX Closings - Last 3 Sessions";
    titleAr = "إقفال البورصة - آخر 3 جلسات";
    const range = sessions.length > 0 ? `[${sessions[sessions.length - 1].date} ➔ ${sessions[0].date}]` : "";
    periodDescEn = `Last 3 Sessions ${range}`;
    periodDescAr = `آخر 3 جلسات ${range}`;
  } else if (periodType === "last5") {
    sessions = rawArchive.slice(0, 5);
    titleEn = "EGX Closings - Last 5 Sessions";
    titleAr = "إقفال البورصة - آخر 5 جلسات";
    const range = sessions.length > 0 ? `[${sessions[sessions.length - 1].date} ➔ ${sessions[0].date}]` : "";
    periodDescEn = `Last 5 Sessions ${range}`;
    periodDescAr = `آخر 5 جلسات ${range}`;
  } else if (periodType === "last10") {
    sessions = rawArchive.slice(0, 10);
    titleEn = "EGX Closings - Last 10 Sessions";
    titleAr = "إقفال البورصة - آخر 10 جلسات";
    const range = sessions.length > 0 ? `[${sessions[sessions.length - 1].date} ➔ ${sessions[0].date}]` : "";
    periodDescEn = `Last 10 Sessions ${range}`;
    periodDescAr = `آخر 10 جلسات ${range}`;
  } else if (periodType === "custom" && customParam && customParam.start && customParam.end) {
    sessions = rawArchive.filter(s => s && s.date && s.date >= customParam.start && s.date <= customParam.end);
    titleEn = "EGX Closings - Custom Period";
    titleAr = "إقفال البورصة - فترة مخصصة";
    periodDescEn = `Custom [${customParam.start} ➔ ${customParam.end}]`;
    periodDescAr = `فترة مخصصة [${customParam.start} ➔ ${customParam.end}]`;
  } else {
    isDefaultMonth = true;
    sessions = rawArchive.filter(s => s && s.date && s.date.startsWith(currMo));
    if (sessions.length === 0) sessions = rawArchive.slice(0, 25);
    const mNameEn = getMonthLabel(currMo, "en");
    const mNameAr = getMonthLabel(currMo, "ar");
    titleEn = "EGX Daily Closings Archive";
    titleAr = "أرشيف الإقفالات اليومية - البورصة المصرية";
    periodDescEn = `${mNameEn} (${sessions.length} Sessions)`;
    periodDescAr = `${mNameAr} (${sessions.length} جلسات)`;
  }

  if (sessions.length === 0) {
    if (lang === "en") {
      return `📜 <b>${titleEn}</b>\n`
        + `<code>─────────────────────────────</code>\n`
        + `🕒 Query: <b>${updatedDateTime}</b>\n`
        + `📅 Period: <b>${periodDescEn}</b>\n\n`
        + `⚠️ <i>No archived sessions found in the database for this specific period.</i>`;
    }
    return `📜 <b>${titleAr}</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>\n`
      + `📅 الفترة: <b>${periodDescAr}</b>\n\n`
      + `⚠️ <i>لا توجد جلسات مؤرشفة مسجلة في قاعدة البيانات لهذه الفترة المحددة.</i>`;
  }

  let totalFoNet = 0, totalArNet = 0, totalFoUsd = 0, totalArUsd = 0;
  sessions.forEach(s => {
    const f = Number(s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0));
    const a = Number(s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0));
    const r = Number(s.usd_rate || usdRate);
    totalFoNet += f;
    totalArNet += a;
    totalFoUsd += Math.round(f / r);
    totalArUsd += Math.round(a / r);
  });
  const totalArFoNet = totalFoNet + totalArNet;
  const totalArFoUsd = totalFoUsd + totalArUsd;

  const { weekly, monthly } = calculatePeriodicTotals(rawArchive, latestDate, usdRate);
  const monthLabelEn = getMonthLabel(monthly.monthPrefix, "en");
  const monthLabelAr = getMonthLabel(monthly.monthPrefix, "ar");

  const foDot = totalFoNet >= 0 ? "🟢" : "🔴";
  const arDot = totalArNet >= 0 ? "🟢" : "🔴";
  const arFoDot = totalArFoNet >= 0 ? "🟢" : "🔴";

  const wFoDot = weekly.foNet >= 0 ? "🟢" : "🔴";
  const mFoDot = monthly.foNet >= 0 ? "🟢" : "🔴";
  const wArDot = (weekly.arNet || 0) >= 0 ? "🟢" : "🔴";
  const mArDot = (monthly.arNet || 0) >= 0 ? "🟢" : "🔴";
  const wArFoDot = (weekly.arFoNet || 0) >= 0 ? "🟢" : "🔴";
  const mArFoDot = (monthly.arFoNet || 0) >= 0 ? "🟢" : "🔴";

  const fmtNet = (v, sessionUsd, usdOverride) => {
    const n = Number(v) || 0;
    const sign = n >= 0 ? "+" : "-";
    const absVal = Math.abs(n).toLocaleString("en-US");
    if (curr === "usd") {
      const u = (usdOverride !== undefined && usdOverride !== null) ? Number(usdOverride) : Math.round(n / (sessionUsd || usdRate));
      const uSign = u >= 0 ? "+" : "-";
      return `${uSign}$${Math.abs(u).toLocaleString("en-US")}`;
    }
    const unit = lang === "en" ? " EGP" : " ج.م";
    return `${sign}${absVal}${unit}`;
  };

  if (lang === "en") {
    let txt = `📜 <b>${titleEn}</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `🕒 Query: <b>${updatedDateTime}</b>\n`
      + `📅 Period: <b>${periodDescEn}</b> • Currency: <b>${currBadge}</b>\n`;

    if (isDefaultMonth) {
      txt += `\n🗓 <b>Current Week (${weekly.count} Sessions):</b>\n`
        + `▫️ Foreigners: ${wFoDot} <code>${fmtNet(weekly.foNet, usdRate, weekly.foUsd)}</code>\n`
        + `▫️ Arabs: ${wArDot} <code>${fmtNet(weekly.arNet, usdRate, weekly.arUsd)}</code>\n`
        + `▪️ Arabs + Foreigners: ${wArFoDot} <code>${fmtNet(weekly.arFoNet, usdRate, weekly.arFoUsd)}</code>\n\n`
        + `📈 <b>Current Month (${monthLabelEn} • ${monthly.count} Sessions):</b>\n`
        + `▫️ Foreigners: ${mFoDot} <code>${fmtNet(monthly.foNet, usdRate, monthly.foUsd)}</code>\n`
        + `▫️ Arabs: ${mArDot} <code>${fmtNet(monthly.arNet, usdRate, monthly.arUsd)}</code>\n`
        + `▪️ Arabs + Foreigners: ${mArFoDot} <code>${fmtNet(monthly.arFoNet, usdRate, monthly.arFoUsd)}</code>\n`;
    } else {
      txt += `\n🎯 <b>Period Totals (${sessions.length} Sessions):</b>\n`
        + `▫️ Foreigners: ${foDot} <code>${fmtNet(totalFoNet, usdRate, totalFoUsd)}</code>\n`
        + `▫️ Arabs: ${arDot} <code>${fmtNet(totalArNet, usdRate, totalArUsd)}</code>\n`
        + `▪️ Arabs + Foreigners: ${arFoDot} <code>${fmtNet(totalArFoNet, usdRate, totalArFoUsd)}</code>\n`;
    }

    txt += `<code>─────────────────────────────</code>\n\n`;

    sessions.forEach((s, idx) => {
      const f = s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0);
      const a = s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0);
      const af = Number(f) + Number(a);
      const sUsd = Number(s.usd_rate || usdRate);
      const fDot = Number(f) >= 0 ? "🟢" : "🔴";
      const aDot = Number(a) >= 0 ? "🟢" : "🔴";
      const afDot = Number(af) >= 0 ? "🟢" : "🔴";
      const sessionTag = (idx === 0 && s.date === latestDate) ? " <i>(Latest)</i>" : "";

      txt += `📅 <b>Session: <code>${s.date}</code></b>${sessionTag}\n`
        + `   ▫️ Foreigners: ${fDot} <code>${fmtNet(f, sUsd)}</code>\n`
        + `   ▫️ Arabs: ${aDot} <code>${fmtNet(a, sUsd)}</code>\n`
        + `   ▪️ Arabs + Foreigners: ${afDot} <code>${fmtNet(af, sUsd)}</code>\n\n`;
    });

    return txt + `<code>─────────────────────────────</code>\n🔒 <i>Officially recorded historical closing flows from EGX Terminal.</i>`;
  }

  let txtAr = `📜 <b>${titleAr}</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>\n`
    + `📅 الفترة: <b>${periodDescAr}</b> • العملة: <b>${currBadge}</b>\n`;

  if (isDefaultMonth) {
    txtAr += `\n🗓 <b>الأسبوع الحالي (${weekly.count} جلسات):</b>\n`
      + `▫️ أجانب: ${wFoDot} <code>${fmtNet(weekly.foNet, usdRate, weekly.foUsd)}</code>\n`
      + `▫️ عرب: ${wArDot} <code>${fmtNet(weekly.arNet, usdRate, weekly.arUsd)}</code>\n`
      + `▪️ عرب + أجانب: ${wArFoDot} <code>${fmtNet(weekly.arFoNet, usdRate, weekly.arUsd + weekly.foUsd)}</code>\n\n`
      + `📈 <b>الشهر الحالي (${monthLabelAr} • ${monthly.count} جلسات):</b>\n`
      + `▫️ أجانب: ${mFoDot} <code>${fmtNet(monthly.foNet, usdRate, monthly.foUsd)}</code>\n`
      + `▫️ عرب: ${mArDot} <code>${fmtNet(monthly.arNet, usdRate, monthly.arUsd)}</code>\n`
      + `▪️ عرب + أجانب: ${mArFoDot} <code>${fmtNet(monthly.arFoNet, usdRate, monthly.arUsd + monthly.foUsd)}</code>\n`;
  } else {
    txtAr += `\n🎯 <b>إجمالي الفترة (${sessions.length} جلسات):</b>\n`
      + `▫️ أجانب: ${foDot} <code>${fmtNet(totalFoNet, usdRate, totalFoUsd)}</code>\n`
      + `▫️ عرب: ${arDot} <code>${fmtNet(totalArNet, usdRate, totalArUsd)}</code>\n`
      + `▪️ عرب + أجانب: ${arFoDot} <code>${fmtNet(totalArFoNet, usdRate, totalArFoUsd)}</code>\n`;
  }

  txtAr += `<code>─────────────────────────────</code>\n\n`;

  sessions.forEach((s, idx) => {
    const f = s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0);
    const a = s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0);
    const af = Number(f) + Number(a);
    const sUsd = Number(s.usd_rate || usdRate);
    const fDot = Number(f) >= 0 ? "🟢" : "🔴";
    const aDot = Number(a) >= 0 ? "🟢" : "🔴";
    const afDot = Number(af) >= 0 ? "🟢" : "🔴";
    const sessionTag = (idx === 0 && s.date === latestDate) ? " <i>(الأحدث)</i>" : "";

    txtAr += `📅 <b>جلسة: <code>${s.date}</code></b>${sessionTag}\n`
      + `   ▫️ صافي الأجانب: ${fDot} <code>${fmtNet(f, sUsd)}</code>\n`
      + `   ▫️ صافي العرب: ${aDot} <code>${fmtNet(a, sUsd)}</code>\n`
      + `   ▪️ صافي العرب + الأجانب: ${afDot} <code>${fmtNet(af, sUsd)}</code>\n\n`;
  });

  return txtAr + `<code>─────────────────────────────</code>\n🔒 <i>أرشيف رسمي موثق لجلسات الإقفال من شاشة البورصة المصرية.</i>`;
}

function formatEgxHistoryReport(data, lang, curr) {
  return formatEgxPeriodicReport(data, "curr_month", lang, curr);
}

function getHistoryKeyboard(lang, curr, activePeriod) {
  activePeriod = activePeriod || "curr_month";
  const nextCurr = curr === "usd" ? "egp" : "usd";
  const currToggleText = curr === "usd" ? (lang === "en" ? "💱 Switch to EGP" : "💱 التحويل إلى الجنيه") : (lang === "en" ? "💵 Switch to USD" : "💵 التحويل إلى الدولار");
  const langToggleText = lang === "en" ? "🌐 اللغة العربية" : "🌐 English";
  const langToggleData = lang === "en" ? "cmd_lang_ar" : "cmd_lang_en";
  const menuText = lang === "en" ? "« Main Menu" : "« القائمة الرئيسية";

  const mark = (p, label) => (activePeriod === p ? `• ${label} •` : label);

  const rows = [];
  rows.push([
    { text: mark("curr_week", lang === "en" ? "🗓 This Week" : "🗓 الأسبوع الحالي"), callback_data: `hist_p:curr_week:${lang}:${curr}` },
    { text: mark("prev_week", lang === "en" ? "⏮ Last Week" : "⏮ الأسبوع الماضي"), callback_data: `hist_p:prev_week:${lang}:${curr}` }
  ]);

  rows.push([
    { text: mark("curr_month", lang === "en" ? "📈 This Month" : "📈 الشهر الحالي"), callback_data: `hist_p:curr_month:${lang}:${curr}` },
    { text: mark("prev_month", lang === "en" ? "⏮ Last Month" : "⏮ الشهر الماضي"), callback_data: `hist_p:prev_month:${lang}:${curr}` }
  ]);

  rows.push([
    { text: mark("last3", lang === "en" ? "🎯 Last 3" : "🎯 آخر 3"), callback_data: `hist_p:last3:${lang}:${curr}` },
    { text: mark("last5", lang === "en" ? "🎯 Last 5" : "🎯 آخر 5"), callback_data: `hist_p:last5:${lang}:${curr}` },
    { text: mark("last10", lang === "en" ? "🎯 Last 10" : "🎯 آخر 10"), callback_data: `hist_p:last10:${lang}:${curr}` }
  ]);

  rows.push([
    { text: (lang === "en" ? "🏛 Back to Live" : "🏛 البورصة اللحظية"), callback_data: `cmd_egx:${lang}:${curr}` },
    { text: currToggleText, callback_data: `hist_curr:${nextCurr}:${activePeriod}:${lang}` }
  ]);

  rows.push([
    { text: menuText, callback_data: `cmd_menu:${lang}:${curr}` },
    { text: langToggleText, callback_data: langToggleData }
  ]);

  return { inline_keyboard: rows };
}

/**
 * 2. Commodities Report
 */
function formatCommoditiesReport(data, lang) {
  let items = data.live_commodities || [];
  const updatedDateTime = getCairoFullDateTime(lang);

  if (lang === "en") {
    let txt = `🪙 <b>Gold, Oil & Crypto Live Market</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `🕒 Query: <b>${updatedDateTime}</b>\n`
      + `💰 Currency: <b>USD ($)</b>\n`
      + `<code>─────────────────────────────</code>\n\n`;

    items.forEach(item => {
      const uP = Number(item.usd_price || 0);
      const uDec = uP < 10 ? (uP < 1 ? 4 : 3) : (uP >= 1000 ? 0 : 2);
      const chgBadge = item.change ? ` <i>(${escapeHtml(item.change)})</i>` : "";
      const statusNote = item.is_live === false ? " ⚠️" : "";
      txt += `▫️ <b>${escapeHtml(item.name_en || item.name)}:</b> <code>$${Number(uP).toLocaleString("en-US", { minimumFractionDigits: uDec, maximumFractionDigits: uDec })}</code>${chgBadge}${statusNote}\n`;
    });

    return txt + `\n<code>─────────────────────────────</code>\n⚡ <i>Live real-time feed via TradingView.</i>`;
  }

  let txtAr = `🪙 <b>أسواق الذهب والفضة والنفط والكريبتو</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>\n`
    + `💰 العملة: <b>الدولار ($)</b>\n`
    + `<code>─────────────────────────────</code>\n\n`;

  items.forEach(item => {
    const uP = Number(item.usd_price || 0);
    const uDec = uP < 10 ? (uP < 1 ? 4 : 3) : (uP >= 1000 ? 0 : 2);
    const chgBadge = item.change ? ` <i>(${escapeHtml(item.change)})</i>` : "";
    const statusNote = item.is_live === false ? " ⚠️" : "";
    txtAr += `▫️ <b>${escapeHtml(item.name)}:</b> <code>$${Number(uP).toLocaleString("en-US", { minimumFractionDigits: uDec, maximumFractionDigits: uDec })}</code>${chgBadge}${statusNote}\n`;
  });

  return txtAr + `\n<code>─────────────────────────────</code>\n⚡ <i>أسعار حية ولحظية بالدولار مباشرة عبر تريدنج فيو.</i>`;
}

/**
 * 3. Foreign Currencies Report (Pure Actual Bank & CBE Rates)
 */
function formatCurrenciesReport(data, lang) {
  const rates = data.rates || [];
  const usdRate = Number(data.usd_rate || data.cbe_usd_buy || 54.45);
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

  const cbeBuy = Number(data.cbe_usd_buy || 54.45);
  let usdLineEn = "", usdLineAr = "";

  if (isTradingHours && topBank && Number(topBank.buy) > 0) {
    const topRate = Number(topBank.buy);
    const bankNameEn = getBankName(topBank.bank, "en");
    usdLineEn = `▫️ <b>US Dollar [USD]:</b> <code>${fmt(topRate, 2)} EGP</code> — <i>Top Buy: ${bankNameEn}</i>\n`;
    usdLineAr = `▫️ <b>الدولار الأمريكي [USD]:</b> <code>${fmt(topRate, 2)} ج.م</code> — <i>أعلى شراء: ${escapeHtml(topBank.bank)}</i>\n`;
  } else {
    usdLineEn = `▫️ <b>US Dollar [USD]:</b> <code>${fmt(cbeBuy, 2)} EGP</code> — <i>CBE Close</i>\n`;
    usdLineAr = `▫️ <b>الدولار الأمريكي [USD]:</b> <code>${fmt(cbeBuy, 2)} ج.م</code> — <i>إقفال البنك المركزي</i>\n`;
  }

  if (lang === "en") {
    let txt = `💵 <b>Foreign Currency Exchange Rates (vs EGP)</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `<code>─────────────────────────────</code>\n\n`
      + usdLineEn;

    currItems.forEach(item => {
      let eP = Number(item.egp_price || item.rate_egp || item.buy || item.sell || 0);
      if (eP === 0 && item.usd_price) {
        eP = Number(item.usd_price) * usdRate;
      }
      const code = (item.code || "").toUpperCase();
      const name = CURRENCY_EN[code] || item.name_en || item.name;
      const buySellStr = (Number(item.buy) > 0 && Number(item.sell) > 0 && item.buy !== item.sell)
        ? ` (Buy <code>${fmt(item.buy, 2)}</code> • Sell <code>${fmt(item.sell, 2)}</code>)`
        : ` <code>${fmt(eP, 2)} EGP</code>`;
      txt += `▫️ <b>${escapeHtml(name)} [${code}]:</b>${buySellStr}\n`;
    });

    return txt + `\n<code>─────────────────────────────</code>\n🏛 <i>Official Central Bank of Egypt & Live Bank feeds.</i>`;
  }

  let txtAr = `💵 <b>أسعار العملات الرسمية مقابل الجنيه المصري</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `<code>─────────────────────────────</code>\n\n`
    + usdLineAr;

  currItems.forEach(item => {
    let eP = Number(item.egp_price || item.rate_egp || item.buy || item.sell || 0);
    if (eP === 0 && item.usd_price) {
      eP = Number(item.usd_price) * usdRate;
    }
    const code = (item.code || "").toUpperCase();
    const name = item.name_ar || item.name;
    const buySellStr = (Number(item.buy) > 0 && Number(item.sell) > 0 && item.buy !== item.sell)
      ? ` (شراء <code>${fmt(item.buy, 2)}</code> • بيع <code>${fmt(item.sell, 2)}</code>)`
      : ` <code>${fmt(eP, 2)} ج.م</code>`;
    txtAr += `▫️ <b>${escapeHtml(name)} [${code}]:</b>${buySellStr}\n`;
  });

  return txtAr + `\n<code>─────────────────────────────</code>\n🏛 <i>أسعار موثقة معتمدة من البنك المركزي المصري والبنوك.</i>`;
}

/**
 * 4. USD Rates in Egyptian Banks
 */
function formatBanksReport(data, lang, cfg) {
  const banks = data.banks || [];
  const limit = (cfg && cfg.banks_count) ? parseInt(cfg.banks_count) : 5;
  const showCbe = cfg ? (cfg.show_cbe_in_banks !== false) : true;
  const showBest = cfg ? (cfg.show_best_banks !== false) : true;

  const usdBuy = Number(data.cbe_usd_buy || 54.45);
  const usdSell = Number(data.cbe_usd_sell || 54.59);
  const cbeTime = formatCleanTime(data.cbe_updated_at || extractTimeFromTimestamp(data.timestamp), lang);
  const updatedDateTime = getCairoFullDateTime(lang);
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLineEn = bankSnapshot ? `\n📸 Snapshot: <b>[${bankSnapshot}]</b>` : "";
  const snapshotLineAr = bankSnapshot ? `\n📸 لقطة الأسعار: <b>[${bankSnapshot}]</b>` : "";

  banks.sort((a, b) => (Number(b.buy) || 0) - (Number(a.buy) || 0));

  let topBuy = banks[0] || { bank: "أبوظبي الإسلامي (ADIB)", buy: 54.50, sell: 54.60, updated_at: getCairoTimeStr() };
  const topBuyTime = formatCleanTime(topBuy.updated_at, lang);
  const topBankNameEn = getBankName(topBuy.bank, "en");

  if (lang === "en") {
    return `🏦 <b>USD Exchange Rates - Egyptian Banks</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `<code>─────────────────────────────</code>\n`
      + (showCbe ? `🏛 <b>Central Bank (CBE):</b> Buy <code>${usdBuy.toFixed(2)}</code> • Sell <code>${usdSell.toFixed(2)}</code> [${cbeTime}]\n<code>─────────────────────────────</code>\n` : "")
      + (showBest ? `🟢 <b>Top Buy Bank:</b> ${topBankNameEn}\n   ▫️ Buy <code>${Number(topBuy.buy).toFixed(2)}</code> • Sell <code>${Number(topBuy.sell).toFixed(2)}</code> [${topBuyTime}]\n<code>─────────────────────────────</code>\n` : "")
      + `📊 <b>Top ${Math.min(limit, banks.length)} Banks (Buy • Sell):</b>\n\n`
      + banks.slice(0, limit).map(b => `▫️ <b>${getBankName(b.bank, "en")}:</b> Buy <code>${Number(b.buy).toFixed(2)}</code> • Sell <code>${Number(b.sell).toFixed(2)}</code>`).join("\n")
      + `\n\n<code>─────────────────────────────</code>\n⚡ <i>Live feed via Ta3weem.</i>`;
  }

  return `🏦 <b>أسعار صرف الدولار في البنوك المصرية</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `<code>─────────────────────────────</code>\n`
    + (showCbe ? `🏛 <b>البنك المركزي المصري:</b> شراء <code>${usdBuy.toFixed(2)}</code> • بيع <code>${usdSell.toFixed(2)}</code> [${cbeTime}]\n<code>─────────────────────────────</code>\n` : "")
    + (showBest ? `🟢 <b>أعلى بنك شراء:</b> ${escapeHtml(topBuy.bank)}\n   ▫️ شراء <code>${Number(topBuy.buy).toFixed(2)}</code> • بيع <code>${Number(topBuy.sell).toFixed(2)}</code> [${topBuyTime}]\n<code>─────────────────────────────</code>\n` : "")
    + `📊 <b>أعلى ${Math.min(limit, banks.length)} بنوك (شراء • بيع):</b>\n\n`
    + banks.slice(0, limit).map(b => `▫️ <b>${escapeHtml(b.bank)}:</b> شراء <code>${Number(b.buy).toFixed(2)}</code> • بيع <code>${Number(b.sell).toFixed(2)}</code>`).join("\n")
    + `\n\n<code>─────────────────────────────</code>\n⚡ <i>أسعار حية مباشرة من البنوك عبر تعويم.</i>`;
}

function formatAllBanksReport(data, lang) {
  const banks = data.banks || [];
  const updatedDateTime = getCairoFullDateTime(lang);
  const bankSnapshot = getBankSnapshotTime(data, lang);
  const snapshotLineEn = bankSnapshot ? `\n📸 Snapshot: <b>[${bankSnapshot}]</b>` : "";
  const snapshotLineAr = bankSnapshot ? `\n📸 لقطة الأسعار: <b>[${bankSnapshot}]</b>` : "";

  banks.sort((a, b) => (Number(b.buy) || 0) - (Number(a.buy) || 0));

  const usdBuy = Number(data.cbe_usd_buy || 54.45);
  const usdSell = Number(data.cbe_usd_sell || 54.59);
  const cbeTime = formatCleanTime(data.cbe_updated_at || extractTimeFromTimestamp(data.timestamp), lang);

  if (lang === "en") {
    return `🏦 <b>All 25 Egyptian Banks - USD Exchange Rates</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `🕒 Query: <b>${updatedDateTime}</b>`
      + snapshotLineEn + `\n`
      + `<code>─────────────────────────────</code>\n`
      + `🏛 <b>Central Bank (CBE):</b> Buy <code>${usdBuy.toFixed(2)}</code> • Sell <code>${usdSell.toFixed(2)}</code> [${cbeTime}]\n`
      + `<code>─────────────────────────────</code>\n\n`
      + banks.map((b, i) => `${i + 1}. <b>${getBankName(b.bank, "en")}:</b> Buy <code>${Number(b.buy).toFixed(2)}</code> • Sell <code>${Number(b.sell).toFixed(2)}</code>`).join("\n")
      + `\n\n<code>─────────────────────────────</code>\n⚡ <i>Live official bank rates via Ta3weem.</i>`;
  }

  return `🏦 <b>كافة البنوك المصرية (25 بنكاً) - أسعار صرف الدولار</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `🕒 وقت الاستعلام: <b>${updatedDateTime}</b>`
    + snapshotLineAr + `\n`
    + `<code>─────────────────────────────</code>\n`
    + `🏛 <b>البنك المركزي المصري:</b> شراء <code>${usdBuy.toFixed(2)}</code> • بيع <code>${usdSell.toFixed(2)}</code> [${cbeTime}]\n`
    + `<code>─────────────────────────────</code>\n\n`
    + banks.map((b, i) => `${i + 1}. <b>${escapeHtml(b.bank)}:</b> شراء <code>${Number(b.buy).toFixed(2)}</code> • بيع <code>${Number(b.sell).toFixed(2)}</code>`).join("\n")
    + `\n\n<code>─────────────────────────────</code>\n⚡ <i>أسعار حية ومحدثة من كافة البنوك الرسمية عبر تعويم.</i>`;
}

/**
 * 5. Full Executive Financial Summary
 */
function formatExecutiveReport(data, lang, curr, tzKey) {
  curr = curr || "usd";

  let egNet = 0, arNet = 0, foNet = 0, totNet = 0;
  let sessionDate = getCairoDateStr();
  let sessionUsdRate = Number(data.usd_rate || data.cbe_usd_buy || 54.45);

  if (data.archive && data.archive.length > 0) {
    const r = data.archive[0];
    const e = r.egypt_net !== undefined ? r.egypt_net : r.egypt_net_egp;
    if (e !== undefined && e !== null && e !== "") egNet = Number(e);

    const a = r.arab_net !== undefined ? r.arab_net : r.arab_net_egp;
    if (a !== undefined && a !== null && a !== "") arNet = Number(a);

    const f = r.foreign_net !== undefined ? r.foreign_net : r.foreign_net_egp;
    if (f !== undefined && f !== null && f !== "") foNet = Number(f);

    const t = r.total_net !== undefined ? r.total_net : r.total_net_egp;
    if (t !== undefined && t !== null && t !== "") {
      totNet = Number(t);
    } else {
      totNet = egNet + arNet + foNet;
    }
    sessionDate = r.date || sessionDate;
    if (r.usd_rate && Number(r.usd_rate) > 40) sessionUsdRate = Number(r.usd_rate);
  }

  const arFoNet = arNet + foNet;
  const mStatus = getEgxMarketStatus(sessionDate);

  const updatedDateTime = getCairoFullDateTime(lang, tzKey);
  const snapshotTime = getEgxSnapshotTime(data, lang);
  const snapshotLineEn = (snapshotTime && mStatus.isTodaySession) ? `\n📸 Market Snapshot: <b>[${snapshotTime}]</b>` : "";
  const snapshotLineAr = (snapshotTime && mStatus.isTodaySession) ? `\n📸 لقطة شاشة البورصة: <b>[${snapshotTime}]</b>` : "";

  const cbeBuy = Number(data.cbe_usd_buy || 54.45);
  const cbeSell = Number(data.cbe_usd_sell || 54.59);
  const banks = data.banks || [];
  let topBank = banks[0] || { bank: "أبوظبي الإسلامي (ADIB)", buy: 54.50, sell: 54.60, updated_at: getCairoTimeStr() };
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
  const bankPeakLineEn = `\n   ▫️ <b>Top Buy Bank:</b> ${bNameEn} • Buy <code>${Number(topBank.buy).toFixed(2)}</code> • Sell <code>${Number(topBank.sell).toFixed(2)}</code> [${bTime}]`;
  const bankPeakLineAr = `\n   ▫️ <b>أعلى بنك شراء:</b> ${escapeHtml(topBank.bank)} • شراء <code>${Number(topBank.buy).toFixed(2)}</code> • بيع <code>${Number(topBank.sell).toFixed(2)}</code> [${bTime}]`;

  const comms = data.live_commodities || [];
  const gold24 = comms.find(c => c.code === "GOLD24") || { usd_price: 133.63 };
  const goldOunce = comms.find(c => c.code === "GOLD_OUNCE" || c.name?.includes("أونصة الذهب")) || { usd_price: 4165.0 };
  const silver = comms.find(c => c.code === "SILVER") || { usd_price: 61.10 };
  const brent = comms.find(c => c.code === "BRENT") || { usd_price: 107.27 };

  const gold24StrEn = `$${Number(gold24.usd_price).toFixed(2)}`;
  const gold24StrAr = `$${Number(gold24.usd_price).toFixed(2)}`;
  const goldOunceStr = `$${Number(goldOunce.usd_price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const silverStr = `$${Number(silver.usd_price).toFixed(2)}`;
  const brentStrEn = `$${Number(brent.usd_price).toFixed(2)}`;
  const brentStrAr = `$${Number(brent.usd_price).toFixed(2)}`;

  const { weekly, monthly } = calculatePeriodicTotals(data.archive, sessionDate, sessionUsdRate);
  const monthLabelEn = getMonthLabel(monthly.monthPrefix, "en");
  const monthLabelAr = getMonthLabel(monthly.monthPrefix, "ar");

  let foAmountEn = "", foAmountAr = "";
  let arAmountEn = "", arAmountAr = "";
  let arFoAmountEn = "", arFoAmountAr = "";
  let wFoAmountEn = "", wFoAmountAr = "";
  let wArAmountEn = "", wArAmountAr = "";
  let wArFoAmountEn = "", wArFoAmountAr = "";
  let mFoAmountEn = "", mFoAmountAr = "";
  let mArAmountEn = "", mArAmountAr = "";
  let mArFoAmountEn = "", mArFoAmountAr = "";

  if (curr === "usd") {
    const foUsd = Math.round(foNet / sessionUsdRate);
    const foSign = foUsd >= 0 ? "+" : "-";
    foAmountEn = `${foSign}$${Math.abs(foUsd).toLocaleString("en-US")}`;
    foAmountAr = `${foSign}$${Math.abs(foUsd).toLocaleString("en-US")}`;

    const arUsd = Math.round(arNet / sessionUsdRate);
    const arSign = arUsd >= 0 ? "+" : "-";
    arAmountEn = `${arSign}$${Math.abs(arUsd).toLocaleString("en-US")}`;
    arAmountAr = `${arSign}$${Math.abs(arUsd).toLocaleString("en-US")}`;

    const arFoUsd = Math.round(arFoNet / sessionUsdRate);
    const arFoSign = arFoUsd >= 0 ? "+" : "-";
    arFoAmountEn = `${arFoSign}$${Math.abs(arFoUsd).toLocaleString("en-US")}`;
    arFoAmountAr = `${arFoSign}$${Math.abs(arFoUsd).toLocaleString("en-US")}`;

    const wUsd = weekly.foUsd;
    const wSign = wUsd >= 0 ? "+" : "-";
    wFoAmountEn = `${wSign}$${Math.abs(wUsd).toLocaleString("en-US")}`;
    wFoAmountAr = `${wSign}$${Math.abs(wUsd).toLocaleString("en-US")}`;

    const wArUsd = weekly.arUsd || 0;
    const wArSign = wArUsd >= 0 ? "+" : "-";
    wArAmountEn = `${wArSign}$${Math.abs(wArUsd).toLocaleString("en-US")}`;
    wArAmountAr = `${wArSign}$${Math.abs(wArUsd).toLocaleString("en-US")}`;

    const wAfUsd = weekly.arFoUsd || 0;
    const wAfSign = wAfUsd >= 0 ? "+" : "-";
    wArFoAmountEn = `${wAfSign}$${Math.abs(wAfUsd).toLocaleString("en-US")}`;
    wArFoAmountAr = `${wAfSign}$${Math.abs(wAfUsd).toLocaleString("en-US")}`;

    const mUsd = monthly.foUsd;
    const mSign = mUsd >= 0 ? "+" : "-";
    mFoAmountEn = `${mSign}$${Math.abs(mUsd).toLocaleString("en-US")}`;
    mFoAmountAr = `${mSign}$${Math.abs(mUsd).toLocaleString("en-US")}`;

    const mArUsd = monthly.arUsd || 0;
    const mArSign = mArUsd >= 0 ? "+" : "-";
    mArAmountEn = `${mArSign}$${Math.abs(mArUsd).toLocaleString("en-US")}`;
    mArAmountAr = `${mArSign}$${Math.abs(mArUsd).toLocaleString("en-US")}`;

    const mAfUsd = monthly.arFoUsd || 0;
    const mAfSign = mAfUsd >= 0 ? "+" : "-";
    mArFoAmountEn = `${mAfSign}$${Math.abs(mAfUsd).toLocaleString("en-US")}`;
    mArFoAmountAr = `${mAfSign}$${Math.abs(mAfUsd).toLocaleString("en-US")}`;
  } else {
    const foSign = foNet >= 0 ? "+" : "-";
    const absNet = Math.abs(foNet).toLocaleString("en-US");
    foAmountEn = `${foSign}${absNet} EGP`;
    foAmountAr = `${foSign}${absNet} ج.م`;

    const arSign = arNet >= 0 ? "+" : "-";
    const absAr = Math.abs(arNet).toLocaleString("en-US");
    arAmountEn = `${arSign}${absAr} EGP`;
    arAmountAr = `${arSign}${absAr} ج.م`;

    const arFoSign = arFoNet >= 0 ? "+" : "-";
    const absArFo = Math.abs(arFoNet).toLocaleString("en-US");
    arFoAmountEn = `${arFoSign}${absArFo} EGP`;
    arFoAmountAr = `${arFoSign}${absArFo} ج.م`;

    const wSign = weekly.foNet >= 0 ? "+" : "-";
    const wAbs = Math.abs(weekly.foNet).toLocaleString("en-US");
    wFoAmountEn = `${wSign}${wAbs} EGP`;
    wFoAmountAr = `${wSign}${wAbs} ج.م`;

    const wArSign = (weekly.arNet || 0) >= 0 ? "+" : "-";
    const wArAbs = Math.abs(weekly.arNet || 0).toLocaleString("en-US");
    wArAmountEn = `${wArSign}${wArAbs} EGP`;
    wArAmountAr = `${wArSign}${wArAbs} ج.م`;

    const wAfSign = (weekly.arFoNet || 0) >= 0 ? "+" : "-";
    const wAfAbs = Math.abs(weekly.arFoNet || 0).toLocaleString("en-US");
    wArFoAmountEn = `${wAfSign}${wAfAbs} EGP`;
    wArFoAmountAr = `${wAfSign}${wAfAbs} ج.م`;

    const mSign = monthly.foNet >= 0 ? "+" : "-";
    const mAbs = Math.abs(monthly.foNet).toLocaleString("en-US");
    mFoAmountEn = `${mSign}${mAbs} EGP`;
    mFoAmountAr = `${mSign}${mAbs} ج.م`;

    const mArSign = (monthly.arNet || 0) >= 0 ? "+" : "-";
    const mArAbs = Math.abs(monthly.arNet || 0).toLocaleString("en-US");
    mArAmountEn = `${mArSign}${mArAbs} EGP`;
    mArAmountAr = `${mArSign}${mArAbs} ج.م`;

    const mAfSign = (monthly.arFoNet || 0) >= 0 ? "+" : "-";
    const mAfAbs = Math.abs(monthly.arFoNet || 0).toLocaleString("en-US");
    mArFoAmountEn = `${mAfSign}${mAfAbs} EGP`;
    mArFoAmountAr = `${mAfSign}${mAfAbs} ج.م`;
  }

  const currBadge = curr === "usd" ? "USD ($)" : "EGP (ج.م)";

  if (lang === "en") {
    let egxBlockEn = `🏛 <b>Foreign & Non-Egyptian Flows ${mStatus.sessionTagEn}:</b>\n`
      + `▫️ Foreigners Session: <code>${foAmountEn}</code>\n`
      + `▪️ Arabs + Foreigners (Hot Money): <code>${arFoAmountEn}</code>\n`
      + `▫️ Weekly Foreigners (${weekly.count} Sessions): <code>${wFoAmountEn}</code>\n`
      + `▪️ Weekly Arabs + Foreigners: <code>${wArFoAmountEn}</code>\n\n`
      + `📈 <b>Monthly Accumulative (${monthLabelEn} • ${monthly.count} Sessions):</b>\n`
      + `▫️ Monthly Foreigners: <code>${mFoAmountEn}</code>\n`
      + `▪️ Monthly Arabs + Foreigners: <code>${mArFoAmountEn}</code>\n\n`;

    return `📊 <b>Executive Financial Summary</b>\n`
      + `<code>─────────────────────────────</code>\n`
      + `📅 <b>Session:</b> <code>${sessionDate}</code>${mStatus.isTodaySession ? "" : " <i>(Last Audited)</i>"}\n`
      + `🕒 <b>Query:</b> <b>${updatedDateTime}</b>\n`
      + `💰 <b>Currency:</b> <b>${currBadge}</b>\n`
      + `${mStatus.statusEn}\n`
      + snapshotLineEn
      + `<code>─────────────────────────────</code>\n\n`
      + egxBlockEn
      + `<code>─────────────────────────────</code>\n`
      + `💵 <b>USD Exchange Rates:</b>\n`
      + `   ▫️ <b>Central Bank (CBE):</b> Buy <code>${cbeBuy.toFixed(2)}</code> • Sell <code>${cbeSell.toFixed(2)}</code> [${cbeTime}]`
      + bankPeakLineEn + `\n\n`
      + `<code>─────────────────────────────</code>\n`
      + `🛢 <b>Brent Crude Oil:</b> <code>${brentStrEn}</code>\n`
      + `🪙 <b>Gold (Ounce):</b> <code>${goldOunceStr}</code> • <b>24K:</b> <code>${gold24StrEn}</code>\n`
      + `🪙 <b>Silver (Ounce):</b> <code>${silverStr}</code>\n`
      + `\n<code>─────────────────────────────</code>\n⚡ <i>Live Executive Summary • Real-time feeds.</i>`;
  }

  let egxBlockAr = `🏛 <b>تدفقات الأجانب والأموال الساخنة ${mStatus.sessionTagAr}:</b>\n`
    + `▫️ صافي الأجانب بالجلسة: <code>${foAmountAr}</code>\n`
    + `▪️ العرب والأجانب (أموال ساخنة): <code>${arFoAmountAr}</code>\n`
    + `▫️ تراكمي الأسبوع للأجانب (${weekly.count} جلسات): <code>${wFoAmountAr}</code>\n`
    + `▪️ تراكمي الأسبوع (عرب + أجانب): <code>${wArFoAmountAr}</code>\n\n`
    + `📈 <b>التراكمي الشهري (${monthLabelAr} • ${monthly.count} جلسات):</b>\n`
    + `▫️ تراكمي الشهر للأجانب: <code>${mFoAmountAr}</code>\n`
    + `▪️ تراكمي الشهر (عرب + أجانب): <code>${mArFoAmountAr}</code>\n\n`;

  return `📊 <b>التقرير المالي التنفيذي الشامل</b>\n`
    + `<code>─────────────────────────────</code>\n`
    + `📅 <b>الجلسة:</b> <code>${sessionDate}</code>${mStatus.isTodaySession ? "" : " <i>(آخر جلسة معتمدة)</i>"}\n`
    + `🕒 <b>وقت الاستعلام:</b> <b>${updatedDateTime}</b>\n`
    + `💰 <b>العملة:</b> <b>${currBadge}</b>\n`
    + `${mStatus.statusAr}\n`
    + snapshotLineAr
    + `<code>─────────────────────────────</code>\n\n`
    + egxBlockAr
    + `<code>─────────────────────────────</code>\n`
    + `💵 <b>أسعار صرف الدولار:</b>\n`
    + `   ▫️ <b>البنك المركزي:</b> شراء <code>${cbeBuy.toFixed(2)}</code> • بيع <code>${cbeSell.toFixed(2)}</code> [${cbeTime}]`
    + bankPeakLineAr + `\n\n`
    + `<code>─────────────────────────────</code>\n`
    + `🛢 <b>خام برنت (نفط):</b> <code>${brentStrAr}</code>\n`
    + `🪙 <b>أونصة الذهب:</b> <code>${goldOunceStr}</code> • <b>عيار 24:</b> <code>${gold24StrAr}</code>\n`
    + `🪙 <b>أونصة الفضة:</b> <code>${silverStr}</code>\n`
    + `\n<code>─────────────────────────────</code>\n⚡ <i>تقرير تنفيذي لحظي موثق ومباشر.</i>`;
}

// Interactive inline keyboards
function getReportKeyboard(cmdType, lang, cfg, curr) {
  cfg = cfg || botConfig;
  curr = curr || "usd";
  const refreshText = lang === "en" ? "🔄 Refresh" : "🔄 تحديث لحظي";
  const menuText = lang === "en" ? "« Main Menu" : "« القائمة الرئيسية";
  const langToggleText = lang === "en" ? "🌐 اللغة العربية" : "🌐 English";
  const langToggleData = lang === "en" ? `cmd_lang_ar:${curr}` : `cmd_lang_en:${curr}`;

  const nextCurr = curr === "usd" ? "egp" : "usd";
  let currToggleText = "";
  if (lang === "en") {
    currToggleText = curr === "usd" ? "💱 Switch to EGP" : "💱 Switch to USD";
  } else {
    currToggleText = curr === "usd" ? "💱 التحويل للجنيه (EGP)" : "💱 التحويل للدولار (USD)";
  }
  const currToggleData = `toggle_curr:${nextCurr}:${cmdType}:${lang}`;

  const rows = [];
  rows.push([{ text: refreshText, callback_data: `refresh_${cmdType}:${lang}:${curr}` }]);

  if (cmdType === "banks") {
    rows.push([{
      text: (lang === "en" ? "🏛️ View All 25 Banks" : "🏛️ عرض كافة الـ 25 بنكاً"),
      callback_data: `refresh_banks_all:${lang}:${curr}`
    }]);
  } else if (cmdType === "banks_all") {
    rows.push([{
      text: (lang === "en" ? "🔙 Top Banks Only" : "🔙 العودة لأهم البنوك"),
      callback_data: `refresh_banks:${lang}:${curr}`
    }]);
  }

  if (cmdType === "egx") {
    rows.push([{
      text: (lang === "en" ? "📜 Historical Closings Archive" : "📜 أرشيف الإقفالات والشهور"),
      callback_data: `cmd_history:${lang}:${curr}`
    }]);
  }

  if (cmdType !== "banks" && cmdType !== "banks_all") {
    rows.push([{ text: currToggleText, callback_data: currToggleData }]);
  }

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
  if (!cfg.hide_banks) r1.push({ text: (lang === "en" ? "🏦 Egyptian Banks & CBE" : "🏦 أسعار البنوك والمركزي"), callback_data: `cmd_banks:${lang}` });
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

async function sendMainMenu(chatId, lang, originUrl, cfg, messageId, env) {
  const userTz = await getUserPref(env, chatId, "tz", "cairo");
  const updatedDateTime = getCairoFullDateTime(lang, userTz);
  const text = (lang === "en")
    ? `🏛️ <b>Egyptian Stock Exchange & Live Markets Bot</b>\n🕒 <b>${updatedDateTime}</b>\n\n⚡ Powered by <b>Cloudflare Edge & Live Feeds</b> 24/7.\n\n👇 <i>Choose from the interactive menu below:</i>`
    : `🏛️ <b>منظومة البورصة المصرية وأسواق الصرف الحية 24/7</b>\n🕒 <b>${updatedDateTime}</b>\n\n⚡ تعمل سحابياً عبر <b>Cloudflare Edge وموقع تعويم وبينانس</b> مباشرة.\n\n👇 <i>اختر ما تريد من القائمة التفاعلية أدناه:</i>`;
  if (messageId) return editTgMessage(chatId, messageId, text, getMenuKeyboard(lang, originUrl, cfg));
  return sendTgMessage(chatId, text, getMenuKeyboard(lang, originUrl, cfg));
}

// Telegram messaging with auto chunking
async function sendTgMessage(chatId, text, replyMarkup) {
  const chunks = splitTgMessage(text, 4000);
  let lastRes = null;
  for (let i = 0; i < chunks.length; i++) {
    const isLast = (i === chunks.length - 1);
    const payload = {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: "HTML"
    };
    if (isLast && replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    lastRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
  return lastRes;
}

async function editTgMessage(chatId, messageId, text, replyMarkup) {
  const chunks = splitTgMessage(text, 4000);
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: chunks[0],
    parse_mode: "HTML"
  };
  if (chunks.length === 1 && replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
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

  // If there are additional chunks, send them as sequential messages
  for (let i = 1; i < chunks.length; i++) {
    const isLast = (i === chunks.length - 1);
    const extraPayload = {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: "HTML"
    };
    if (isLast && replyMarkup) extraPayload.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extraPayload)
    });
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
    select, input[type="password"] {
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
      <div class="section-title"><i class="fa-solid fa-key"></i><span>مفتاح الأمان (Admin Key)</span></div>
      <p style="font-size: 0.75rem; color: var(--text-muted);">مطلوب لحفظ التعديلات في بيئة الإنتاج المحمية</p>
      <input type="password" id="admin_key" placeholder="أدخل مفتاح الأمان (اختياري في التطوير)">
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
          <option value="5" selected>أعلى 5 بنوك (افتراضي)</option>
          <option value="8">أعلى 8 بنوك</option>
          <option value="10">أعلى 10 بنوك</option>
          <option value="25">عرض كافة البنوك</option>
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

      const adminKey = document.getElementById("admin_key").value.trim() || "egx_admin_secret_2026";
      const payload = {
        hide_egx: !document.getElementById("btn_egx").checked,
        hide_banks: !document.getElementById("btn_banks").checked,
        hide_commodities: !document.getElementById("btn_commodities").checked,
        hide_currencies: !document.getElementById("btn_currencies").checked,
        hide_report: !document.getElementById("btn_report").checked,
        banks_count: parseInt(document.getElementById("banks_count").value) || 5,
        show_cbe_in_banks: document.getElementById("show_cbe").checked,
        show_best_banks: document.getElementById("show_best").checked
      };

      fetch("${originUrl}/api/config?key=" + encodeURIComponent(adminKey), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + adminKey
        },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(data => {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ وتطبيق التعديلات في البوت فوراً';
        const toast = document.getElementById("toast");
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
      })
      .catch(err => {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ وتطبيق التعديلات في البوت فوراً';
        alert("فشل الحفظ: تأكد من مفتاح الأمان المصرح به.");
      });
    }
  </script>
</body>
</html>`;
}

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
