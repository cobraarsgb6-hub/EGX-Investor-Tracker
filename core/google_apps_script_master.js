/**
 * =========================================================================
 * 🏛️ EGX INVESTOR TRACKER & GLOBAL MARKETS - GOOGLE APPS SCRIPT (MASTER V3.1)
 * منظومة تتبع البورصة المصرية (المؤسسات) وأسواق الصرف والسلع الحية
 * 
 * المطور: المهندس أحمد | AI Thinking Partner
 * متوافقة 100% مع Google Apps Script V8 وبيئة الـ iframe والمتصفح المستقل
 * مزودة بـ 4 أنماط تصميمية احترافية قابلة للتبديل الفوري بنقرة زر
 * =========================================================================
 */

// ==========================================
// 🎨 قائمة الأنماط التصميمية الأربعة (4 Themes)
// ==========================================
var THEMES = {
  terminal: {
    name: "بلومبرج المؤسسي (Terminal Elite)",
    sheetBg: "#0b0f19",
    headerBg: "#0f172a",
    headerText: "#38bdf8",
    bodyBg: "#111827",
    bodyText: "#f9fafb",
    altBg: "#1f2937",
    borderColor: "#374151",
    subHeaderBg: "#1e293b",
    subHeaderText: "#94a3b8",
    posBg: "#064e3b",
    posText: "#34d399",
    negBg: "#7f1d1d",
    negText: "#f87171",
    accent: "#38bdf8"
  },
  swiss: {
    name: "النمط البنكي السويسري (Swiss Banking Clean)",
    sheetBg: "#f8fafc",
    headerBg: "#1e3a8a",
    headerText: "#ffffff",
    bodyBg: "#ffffff",
    bodyText: "#0f172a",
    altBg: "#f8fafc",
    borderColor: "#cbd5e1",
    subHeaderBg: "#f1f5f9",
    subHeaderText: "#334155",
    posBg: "#dcfce7",
    posText: "#15803d",
    negBg: "#fee2e2",
    negText: "#b91c1c",
    accent: "#0284c7"
  },
  matrix: {
    name: "منصة التداول والتحليل (Trading Matrix)",
    sheetBg: "#0d1117",
    headerBg: "#161b22",
    headerText: "#58a6ff",
    bodyBg: "#0d1117",
    bodyText: "#e6edf3",
    altBg: "#21262d",
    borderColor: "#30363d",
    subHeaderBg: "#21262d",
    subHeaderText: "#8b949e",
    posBg: "#1b4729",
    posText: "#3fb950",
    negBg: "#5c1d24",
    negText: "#f85149",
    accent: "#e3b341"
  },
  csuite: {
    name: "التقرير التنفيذي للقيادات (C-Suite Minimalist)",
    sheetBg: "#f1f5f9",
    headerBg: "#334155",
    headerText: "#ffffff",
    bodyBg: "#ffffff",
    bodyText: "#1e293b",
    altBg: "#f8fafc",
    borderColor: "#cbd5e1",
    subHeaderBg: "#f1f5f9",
    subHeaderText: "#475569",
    posBg: "#e0f2fe",
    posText: "#0369a1",
    negBg: "#ffe4e6",
    negText: "#be123c",
    accent: "#475569"
  }
};

// ==========================================
// 1. القائمة المخصصة في Google Sheets (UI Menu)
// ==========================================

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("🏛️ منصة البورصة والأسواق")
    .addItem("🔄 تحديث وتنسيق فوري لكافة الشيتات", "formatAllSheetsProfessionally")
    .addSeparator()
    .addSubMenu(ui.createMenu("🎨 اختيار التصميم (4 Themes)")
      .addItem("💻 1. بلومبرج المؤسسي (Terminal Elite)", "applyThemeTerminal")
      .addItem("🏦 2. النمط البنكي السويسري (Swiss Banking)", "applyThemeSwiss")
      .addItem("📈 3. منصة التداول والتحليل (Trading Matrix)", "applyThemeMatrix")
      .addItem("📊 4. التقرير التنفيذي (C-Suite Minimalist)", "applyThemeCSuite"))
    .addSeparator()
    .addItem("📊 بناء وتحديث تبويب الملخص التنفيذي", "rebuildExecutiveTab")
    .addItem("🌐 فتح لوحة الويب التفاعلية المباشرة", "openDashboardModal")
    .addToUi();
}

function applyThemeTerminal() { applyActiveTheme("terminal"); }
function applyThemeSwiss() { applyActiveTheme("swiss"); }
function applyThemeMatrix() { applyActiveTheme("matrix"); }
function applyThemeCSuite() { applyActiveTheme("csuite"); }

function applyActiveTheme(themeKey) {
  PropertiesService.getScriptProperties().setProperty("ACTIVE_THEME", themeKey);
  rebuildExecutiveTab();
  formatAllSheetsProfessionally();
  try {
    var th = THEMES[themeKey] || THEMES.swiss;
    SpreadsheetApp.getActiveSpreadsheet().toast("تم تطبيق تصميم: " + th.name, "🎨 تم تغيير المظهر بنجاح", 4);
  } catch(e) {}
}

function getActiveThemeKey() {
  return PropertiesService.getScriptProperties().getProperty("ACTIVE_THEME") || "swiss";
}

function openDashboardModal() {
  var html = HtmlService.createHtmlOutput(renderDashboardHtml())
    .setWidth(1280)
    .setHeight(850)
    .setTitle("منظومة البورصة المصرية وأسواق الصرف الحية");
  SpreadsheetApp.getUi().showModalDialog(html, "📊 لوحة المتابعة التنفيذية المباشرة");
}

function rebuildExecutiveTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = getLiveDashboardData();
  updateExecutiveSummarySheet(ss, data.archive, data.banks, data.rates, data.timestamp);
}

// ==========================================
// 2. استقبال وتوزيع الطلبات (Routing)
// ==========================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  
  if (action === "format") {
    formatAllSheetsProfessionally();
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم تنسيق كافة الشيتات بنجاح!"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "theme") {
    var th = (e && e.parameter && e.parameter.name) ? e.parameter.name : "swiss";
    if (THEMES[th]) applyActiveTheme(th);
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      theme: th,
      message: "تم تبديل التصميم بنجاح!"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "data") {
    return ContentService.createTextOutput(JSON.stringify(getLiveDashboardData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var out = HtmlService.createHtmlOutputFromFile("Index");
    var rawHtml = out.getContent();
    if (!rawHtml || (rawHtml.indexOf("<!DOCTYPE") === -1 && rawHtml.indexOf("<html") === -1 && rawHtml.indexOf("<body") === -1)) {
      throw new Error("Index file does not contain valid HTML");
    }
    return out
      .setTitle("منظومة البورصة المصرية وأسواق الصرف | EGX Institutions Tracker")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (err) {
    return HtmlService.createHtmlOutput(renderDashboardHtml())
      .setTitle("منظومة البورصة المصرية وأسواق الصرف | EGX Institutions Tracker")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }
}

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    try { ss.setSpreadsheetLocale("en_US"); } catch(eLoc) {}

    if (data.latest_egx) {
      PropertiesService.getScriptProperties().setProperty("LATEST_EGX_JSON", JSON.stringify(data.latest_egx));
    }

    // 1. تبويب تعاملات المؤسسات (الأرشيف التراكمي المدمج)
    if (data.archive && data.archive.length > 0) {
      updateInstitutionsArchiveSheet(ss, data.archive);
    }

    // 2. تبويب الأسواق الحية
    if (data.rates && data.rates.length > 0) {
      updateLiveRatesSheet(ss, data.rates, data.timestamp);
    }

    // 3. تبويب أسعار الدولار في البنوك
    if (data.banks && data.banks.length > 0) {
      updateBanksSheet(ss, data.banks, data.timestamp);
    }

    // 4. تبويب الملخص التنفيذي والتراكمي (التبويب الأول الرئيسي)
    var allArchive = getSheetArchiveRows(ss);
    updateExecutiveSummarySheet(ss, allArchive.length > 0 ? allArchive : data.archive, data.banks, data.rates, data.timestamp);

    // تطبيق التنسيق الفاخر طبقاً للثيم النشط
    formatAllSheetsProfessionally();

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم تحديث وتنسيق كافة البيانات والشيتات في Google Sheets بنجاح!",
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 3. أدوات معالجة التاريخ والتقويم والتراكميات
// ==========================================

function normalizeDateStr(d) {
  if (!d) return "";
  if (d instanceof Date) {
    var yr = d.getFullYear();
    var mo = ("0" + (d.getMonth() + 1)).slice(-2);
    var da = ("0" + d.getDate()).slice(-2);
    return yr + "-" + mo + "-" + da;
  }
  var s = String(d).trim();
  var mIso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) {
    return mIso[1] + "-" + ("0" + mIso[2]).slice(-2) + "-" + ("0" + mIso[3]).slice(-2);
  }
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    var y = parsed.getFullYear();
    var m = ("0" + (parsed.getMonth() + 1)).slice(-2);
    var dt = ("0" + parsed.getDate()).slice(-2);
    return y + "-" + m + "-" + dt;
  }
  return s.split("T")[0].split(" ")[0].trim();
}

function getWeekSunday(dateStr) {
  var norm = normalizeDateStr(dateStr) || "2026-10-05";
  var d = new Date(norm + "T12:00:00Z");
  if (isNaN(d.getTime())) return norm;
  var day = d.getUTCDay(); // 0 is Sunday
  var sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day);
  return normalizeDateStr(sunday);
}

function calculatePeriodicTotals(archive, currentSessionDate, defaultUsdRate) {
  var sessionDate = normalizeDateStr(currentSessionDate) || "2026-10-05";
  var weekStart = getWeekSunday(sessionDate);
  var monthPrefix = sessionDate.slice(0, 7); // "2026-10"

  var weekly = { count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0, weekStart: weekStart };
  var monthly = { count: 0, egNet: 0, arNet: 0, foNet: 0, totNet: 0, egUsd: 0, arUsd: 0, foUsd: 0, totUsd: 0, monthPrefix: monthPrefix };

  var list = (archive && Array.isArray(archive)) ? archive : [];
  list.forEach(function(s) {
    if (!s || !s.date) return;
    var dStr = normalizeDateStr(s.date);
    if (!dStr) return;

    var rate = Number(s.usd_rate || defaultUsdRate || 52.42);
    var eg = Number(s.egypt_net !== undefined ? s.egypt_net : (s.egypt_net_egp || 0));
    var ar = Number(s.arab_net !== undefined ? s.arab_net : (s.arab_net_egp || 0));
    var fo = Number(s.foreign_net !== undefined ? s.foreign_net : (s.foreign_net_egp || 0));
    var tot = Number(s.total_net !== undefined ? s.total_net : (s.total_net_egp || (eg + ar + fo)));

    var egU = Math.round(eg / rate);
    var arU = Math.round(ar / rate);
    var foU = Math.round(fo / rate);
    var totU = Math.round(tot / rate);

    // الأسبوع: يبدأ من الأحد وحتى تاريخ الجلسة
    if (dStr >= weekStart && dStr <= sessionDate) {
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

    // الشهر: يبدأ حصراً من 01 أكتوبر 2026 فصاعداً
    if (dStr.indexOf(monthPrefix) === 0 && dStr >= "2026-10-01" && dStr <= sessionDate) {
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

  return { weekly: weekly, monthly: monthly };
}

// ==========================================
// 4. دوال البحث والإنشاء الذكي للشيتات
// ==========================================

function getOrCreateSheet(ss, targetName, aliases) {
  var sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;

  if (aliases && aliases.length > 0) {
    for (var i = 0; i < aliases.length; i++) {
      var s = ss.getSheetByName(aliases[i]);
      if (s) {
        s.setName(targetName);
        return s;
      }
    }
    var allSheets = ss.getSheets();
    for (var j = 0; j < allSheets.length; j++) {
      var n = allSheets[j].getName();
      for (var k = 0; k < aliases.length; k++) {
        if (n.indexOf(aliases[k]) >= 0) {
          allSheets[j].setName(targetName);
          return allSheets[j];
        }
      }
    }
  }

  return ss.insertSheet(targetName);
}

function findExistingSheet(ss, targetName, keywords) {
  var s = ss.getSheetByName(targetName);
  if (s) return s;
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var n = allSheets[i].getName();
    for (var j = 0; j < keywords.length; j++) {
      if (n.indexOf(keywords[j]) >= 0) return allSheets[i];
    }
  }
  return null;
}

function getSheetArchiveRows(ss) {
  var s1 = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
  var list = [];
  if (s1 && s1.getLastRow() >= 2) {
    var maxR = Math.min(s1.getLastRow() - 1, 40);
    var vals = s1.getRange(2, 1, maxR, s1.getLastColumn()).getValues();
    vals.forEach(function(row) {
      list.push({
        date: normalizeDateStr(row[0]),
        segment: String(row[1] || ""),
        usd_rate: Number(row[2] || 52.42),
        egypt_buy: Number(row[3] || 0), egypt_sell: Number(row[4] || 0), egypt_net: Number(row[5] || 0),
        arab_buy: Number(row[6] || 0), arab_sell: Number(row[7] || 0), arab_net: Number(row[8] || 0),
        foreign_buy: Number(row[9] || 0), foreign_sell: Number(row[10] || 0), foreign_net: Number(row[11] || 0),
        total_buy: Number(row[12] || 0), total_sell: Number(row[13] || 0), total_net: Number(row[14] || 0),
        total_net_usd: Number(row[15] || 0)
      });
    });
  }
  return list;
}

// ==========================================
// 5. تحديث الشيتات الأربعة
// ==========================================

// التبويب 1: الملخص التنفيذي والتراكمي (The Executive Dashboard)
function updateExecutiveSummarySheet(ss, archive, banks, rates, ts) {
  var sheet = getOrCreateSheet(ss, "📊 الملخص التنفيذي والتراكمي", ["الملخص التنفيذي", "التراكمي", "Executive"]);
  sheet.setRightToLeft(true);
  sheet.clear();

  var usdRate = 52.42;
  if (banks && banks.length > 0 && Number(banks[0].buy) > 30) {
    usdRate = Number(banks[0].buy);
  }

  var latestDate = (archive && archive.length > 0) ? normalizeDateStr(archive[0].date) : "2026-10-05";
  var periodic = calculatePeriodicTotals(archive, latestDate, usdRate);

  var r0 = (archive && archive.length > 0) ? archive[0] : {};
  var todayFoNet = Number(r0.foreign_net !== undefined ? r0.foreign_net : (r0.foreign_net_egp || 0));
  var todayTotNet = Number(r0.total_net !== undefined ? r0.total_net : (r0.total_net_egp || 0));
  var todayFoUsd = Math.round(todayFoNet / usdRate);
  var todayTotUsd = Math.round(todayTotNet / usdRate);

  var topBank = (banks && banks.length > 0) ? banks[0] : { bank: "أبوظبي الإسلامي (ADIB)", buy: 52.42, sell: 52.52 };
  var gold24 = 0, brent = 0;
  if (rates && rates.length > 0) {
    rates.forEach(function(r) {
      if (r.code === "GOLD24") gold24 = Number(r.buy || r.sell || 0);
      if (r.code === "BRENT") brent = Number(r.buy || r.sell || 0);
    });
  }

  sheet.getRange(1, 1).setValue("🏛️ منظومة البورصة المصرية وأسواق المال - التقرير المالي التنفيذي والتراكمي");
  sheet.getRange(2, 1).setValue("🕒 توقيت المزامنة: " + (ts || new Date().toLocaleString()) + " بتوقيت مصر | سعر الدولار المعتمد: " + usdRate.toFixed(2) + " ج.م");

  var summaryHeaders = ["الفترة / المؤشر", "صافي تعاملات الأجانب (ج.م)", "صافي تعاملات الأجانب ($)", "إجمالي صافي المؤسسات (ج.م)", "إجمالي صافي المؤسسات ($)", "عدد الجلسات", "توجيه السيولة"];
  var summaryRows = [
    summaryHeaders,
    [
      "جلسة اليوم (" + latestDate + ")",
      todayFoNet, todayFoUsd,
      todayTotNet, todayTotUsd,
      "جلسة واحدة",
      todayFoNet >= 0 ? "🟢 صافي شراء للأجانب" : "🔴 صافي بيع للأجانب"
    ],
    [
      "إجمالي الأسبوع (بدءاً من الأحد " + periodic.weekly.weekStart + ")",
      periodic.weekly.foNet, periodic.weekly.foUsd,
      periodic.weekly.totNet, periodic.weekly.totUsd,
      periodic.weekly.count + " جلسات",
      periodic.weekly.foNet >= 0 ? "🟢 تراكمي شراء أسبوعي" : "🔴 تراكمي بيع أسبوعي"
    ],
    [
      "إجمالي شهر أكتوبر 2026 التراكمي",
      periodic.monthly.foNet, periodic.monthly.foUsd,
      periodic.monthly.totNet, periodic.monthly.totUsd,
      periodic.monthly.count + " جلسات",
      periodic.monthly.totNet >= 0 ? "🟢 أداء مؤسسي إيجابي" : "🔴 ضغط بيعي مؤسسي"
    ]
  ];

  sheet.getRange(4, 1, summaryRows.length, summaryHeaders.length).setValues(summaryRows);

  var marketHeaders = ["الأصل / المؤشر", "سعر الشراء / العالمي", "سعر البيع / المعادل", "أفضل بنك / المصدر"];
  var marketRows = [
    marketHeaders,
    ["أعلى سعر شراء للدولار (البنوك)", Number(topBank.buy).toFixed(2) + " ج.م", Number(topBank.sell).toFixed(2) + " ج.م", topBank.bank],
    ["سعر البنك المركزي (CBE)", "52.3624 ج.م", "52.5006 ج.م", "البنك المركزي المصري"],
    ["جرام الذهب عيار 24", (gold24 > 0 ? ("$" + gold24.toFixed(2)) : "$133.60"), (gold24 > 0 ? (Math.round(gold24 * usdRate) + " ج.م") : "7,005 ج.م"), "TradingView Live"],
    ["نفط خام برنت", (brent > 0 ? ("$" + brent.toFixed(2)) : "$100.85"), (brent > 0 ? (Math.round(brent * usdRate) + " ج.م") : "5,285 ج.م"), "عقود برنت الآجلة"]
  ];

  sheet.getRange(10, 1, marketRows.length, marketHeaders.length).setValues(marketRows);

  try {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  } catch(e) {}
}

// التبويب 2: تعاملات المؤسسات والأرشيف
function updateInstitutionsArchiveSheet(ss, archive) {
  var sheet = getOrCreateSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة المصرية", "البورصة المصرية", "أرشيف", "EGX"]);
  sheet.setRightToLeft(true);

  var headers = [
    "التاريخ", "القطاع السوقي", "سعر الدولار",
    "مؤسسات مصرية (شراء)", "مؤسسات مصرية (بيع)", "صافي مؤسسات مصرية",
    "مؤسسات عربية (شراء)", "مؤسسات عربية (بيع)", "صافي مؤسسات عربية",
    "مؤسسات أجنبية (شراء)", "مؤسسات أجنبية (بيع)", "صافي مؤسسات أجنبية",
    "إجمالي شراء المؤسسات", "إجمالي بيع المؤسسات", "صافي المؤسسات الإجمالي (ج.م)",
    "صافي المؤسسات الإجمالي ($)"
  ];

  var existingMap = {};
  if (sheet.getLastRow() >= 2) {
    var oldVals = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    oldVals.forEach(function(r) {
      var dStr = normalizeDateStr(r[0]);
      var seg = String(r[1] || "").trim();
      if (dStr) {
        existingMap[dStr + "_" + seg] = [
          dStr, seg, Number(r[2] || 52.42),
          Number(r[3] || 0), Number(r[4] || 0), Number(r[5] || 0),
          Number(r[6] || 0), Number(r[7] || 0), Number(r[8] || 0),
          Number(r[9] || 0), Number(r[10] || 0), Number(r[11] || 0),
          Number(r[12] || 0), Number(r[13] || 0), Number(r[14] || 0),
          Number(r[15] || 0)
        ];
      }
    });
  }

  archive.forEach(function(r) {
    var dStr = normalizeDateStr(r.date);
    var seg = String(r.segment || "").trim();
    if (dStr) {
      existingMap[dStr + "_" + seg] = [
        dStr, seg, Number(r.usd_rate || 52.42),
        Number(r.egypt_buy_egp || 0), Number(r.egypt_sell_egp || 0), Number(r.egypt_net_egp || 0),
        Number(r.arab_buy_egp || 0), Number(r.arab_sell_egp || 0), Number(r.arab_net_egp || 0),
        Number(r.foreign_buy_egp || 0), Number(r.foreign_sell_egp || 0), Number(r.foreign_net_egp || 0),
        Number(r.total_buy_egp || 0), Number(r.total_sell_egp || 0), Number(r.total_net_egp || 0),
        Number(r.total_net_usd || 0)
      ];
    }
  });

  var allRows = Object.values(existingMap);
  allRows.sort(function(a, b) { return String(b[0]).localeCompare(String(a[0])); });

  sheet.clear();
  var out = [headers].concat(allRows);
  sheet.getRange(1, 1, out.length, headers.length).setValues(out);
  sheet.setFrozenRows(1);
}

// التبويب 3: الأسواق الحية والسلع
function updateLiveRatesSheet(ss, rates, ts) {
  var sheet = getOrCreateSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب", "السلع والذهب"]);
  sheet.clear();
  sheet.setRightToLeft(true);

  sheet.getRange(1, 1).setValue("⚡ آخر تحديث سحابي مباشر: " + (ts || new Date().toLocaleString()));

  var headers = ["القطاع / الفئة", "الرمز", "اسم الأصل / السلعة", "سعر الشراء", "سعر البيع / السعر الحالي", "المعادل بالجنيه", "التغير (24h)"];
  var rows = [headers];

  rates.forEach(function(item) {
    rows.push([
      item.category,
      item.code,
      item.name,
      Number(item.buy || 0),
      Number(item.sell || 0),
      Number(item.rate_egp || 0),
      item.change || "0.0%"
    ]);
  });

  sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(3);
}

// التبويب 4: أسعار الدولار في 25 بنكاً
function updateBanksSheet(ss, banks, ts) {
  var sheet = getOrCreateSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك المصرية", "البنوك"]);
  sheet.clear();
  sheet.setRightToLeft(true);

  sheet.getRange(1, 1).setValue("🏛️ قائمة أسعار صرف الدولار في 25 بنكاً مصرياً - آخر تحديث: " + (ts || new Date().toLocaleString()));

  var headers = ["اسم البنك", "سعر الشراء للبنك (ج.م)", "سعر البيع من البنك (ج.م)", "متوسط السعر (ج.م)", "وقت التحديث"];
  var rows = [headers];

  banks.forEach(function(b) {
    rows.push([
      b.bank,
      Number(b.buy || 0),
      Number(b.sell || 0),
      Number(b.avg || 0),
      String(b.updated_at || "")
    ]);
  });

  sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(3);
}

// ==========================================
// 6. دالة التنسيق الاحترافي المتكيفة مع الثيم
// ==========================================

function formatAllSheetsProfessionally() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var themeKey = getActiveThemeKey();
  var th = THEMES[themeKey] || THEMES.swiss;

  // إذا لم يكن تبويب الملخص موجوداً، نقوم ببنائه أولاً
  var s0 = findExistingSheet(ss, "📊 الملخص التنفيذي والتراكمي", ["الملخص التنفيذي", "التراكمي"]);
  if (!s0 || s0.getLastRow() < 4) {
    rebuildExecutiveTab();
    s0 = findExistingSheet(ss, "📊 الملخص التنفيذي والتراكمي", ["الملخص التنفيذي", "التراكمي"]);
  }

  // 1. تنسيق تبويب الملخص التنفيذي
  if (s0 && s0.getLastRow() >= 4) {
    s0.setRightToLeft(true);
    s0.getRange(1, 1, 1, 7).merge()
      .setBackground(th.headerBg).setFontColor(th.headerText)
      .setFontFamily("Cairo").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center").setVerticalAlignment("middle");
    s0.setRowHeight(1, 40);

    s0.getRange(2, 1, 1, 7).merge()
      .setBackground(th.subHeaderBg).setFontColor(th.subHeaderText)
      .setFontFamily("Cairo").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
    s0.setRowHeight(2, 28);

    styleSheetTable(s0, 4, 1, 4, 7, th);
    var nSum = 3;
    s0.getRange(5, 2, nSum, 1).setNumberFormat("#,##0");
    s0.getRange(5, 3, nSum, 1).setNumberFormat("$#,##0");
    s0.getRange(5, 4, nSum, 1).setNumberFormat("#,##0");
    s0.getRange(5, 5, nSum, 1).setNumberFormat("$#,##0");
    colorNetColumn(s0, 2, nSum, th);
    colorNetColumn(s0, 3, nSum, th);
    colorNetColumn(s0, 4, nSum, th);
    colorNetColumn(s0, 5, nSum, th);

    if (s0.getLastRow() >= 14) {
      styleSheetTable(s0, 10, 1, 5, 4, th);
    }
    autoFitColumns(s0, 7);
  }

  // 2. تنسيق تبويب تعاملات المؤسسات
  var s1 = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
  if (s1 && s1.getLastRow() >= 1) {
    s1.setRightToLeft(true);
    styleSheetTable(s1, 1, 1, s1.getLastRow(), s1.getLastColumn(), th);
    if (s1.getLastRow() > 1) {
      var numRows = s1.getLastRow() - 1;
      s1.getRange(2, 1, numRows, 1).setNumberFormat("@"); // نص صريح للتاريخ منعاً لتشوهات المناطق الزمنية
      s1.getRange(2, 3, numRows, 1).setNumberFormat("#,##0.00");
      s1.getRange(2, 4, numRows, Math.min(12, s1.getLastColumn() - 3)).setNumberFormat("#,##0");
      if (s1.getLastColumn() >= 16) {
        s1.getRange(2, 16, numRows, 1).setNumberFormat("$#,##0");
      }
      colorNetColumn(s1, 6, numRows, th);
      colorNetColumn(s1, 9, numRows, th);
      colorNetColumn(s1, 12, numRows, th);
      if (s1.getLastColumn() >= 15) colorNetColumn(s1, 15, numRows, th);
      if (s1.getLastColumn() >= 16) colorNetColumn(s1, 16, numRows, th);
    }
    autoFitColumns(s1, s1.getLastColumn());
  }

  // 3. تنسيق تبويب الأسواق الحية
  var s2 = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
  if (s2 && s2.getLastRow() >= 3) {
    s2.setRightToLeft(true);
    s2.getRange(1, 1, 1, s2.getLastColumn()).merge()
      .setBackground(th.subHeaderBg).setFontColor(th.subHeaderText)
      .setFontFamily("Cairo").setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center").setVerticalAlignment("middle");
    s2.setRowHeight(1, 32);

    styleSheetTable(s2, 3, 1, s2.getLastRow() - 2, s2.getLastColumn(), th);
    if (s2.getLastRow() > 3) {
      var nRows = s2.getLastRow() - 3;
      s2.getRange(4, 4, nRows, Math.min(3, s2.getLastColumn() - 3)).setNumberFormat("#,##0.00");
    }
    autoFitColumns(s2, s2.getLastColumn());
  }

  // 4. تنسيق تبويب البنوك
  var s3 = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
  if (s3 && s3.getLastRow() >= 3) {
    s3.setRightToLeft(true);
    s3.getRange(1, 1, 1, s3.getLastColumn()).merge()
      .setBackground(th.subHeaderBg).setFontColor(th.subHeaderText)
      .setFontFamily("Cairo").setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center").setVerticalAlignment("middle");
    s3.setRowHeight(1, 32);

    styleSheetTable(s3, 3, 1, s3.getLastRow() - 2, s3.getLastColumn(), th);
    if (s3.getLastRow() > 3) {
      var nBRows = s3.getLastRow() - 3;
      s3.getRange(4, 2, nBRows, 3).setNumberFormat("#,##0.00");
    }
    autoFitColumns(s3, s3.getLastColumn());
  }
}

function styleSheetTable(sheet, startRow, startCol, numRows, numCols, th) {
  th = th || THEMES.swiss;
  
  // ترويسة الجدول
  var header = sheet.getRange(startRow, startCol, 1, numCols);
  header.setBackground(th.headerBg)
    .setFontColor(th.headerText)
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(startRow, 32);

  // جسم الجدول: ضبط لون الخلفية ولون النص معاً لمنع النص الخفي
  if (numRows > 1) {
    var body = sheet.getRange(startRow + 1, startCol, numRows - 1, numCols);
    body.setFontFamily("Cairo")
      .setFontColor(th.bodyText)
      .setBackground(th.bodyBg)
      .setFontSize(9.5)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    
    for (var r = 1; r < numRows; r++) {
      sheet.setRowHeight(startRow + r, 28);
      if (r % 2 === 0) {
        sheet.getRange(startRow + r, startCol, 1, numCols).setBackground(th.altBg);
      }
    }
  }

  var all = sheet.getRange(startRow, startCol, numRows, numCols);
  all.setBorder(true, true, true, true, true, true, th.borderColor, SpreadsheetApp.BorderStyle.SOLID);
}

function colorNetColumn(sheet, colIndex, numRows, th) {
  th = th || THEMES.swiss;
  var startR = sheet.getLastRow() - numRows + 1;
  if (startR < 2) return;
  var range = sheet.getRange(startR, colIndex, numRows, 1);
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (typeof raw === "string") raw = raw.replace(/,/g, "").replace(/،/g, "").replace(/\$/g, "");
    var val = Number(raw);
    if (!isNaN(val)) {
      var cell = range.getCell(1 + i, 1);
      if (val > 0) {
        cell.setBackground(th.posBg).setFontColor(th.posText).setFontWeight("bold");
      } else if (val < 0) {
        cell.setBackground(th.negBg).setFontColor(th.negText).setFontWeight("bold");
      }
    }
  }
}

function autoFitColumns(sheet, maxCols) {
  try {
    for (var c = 1; c <= maxCols; c++) {
      sheet.autoResizeColumn(c);
      var w = sheet.getColumnWidth(c);
      if (w < 95) sheet.setColumnWidth(c, 95);
      if (w > 260) sheet.setColumnWidth(c, 260);
    }
  } catch(e) {}
}

// ==========================================
// 7. استرجاع البيانات اللحظية مع التراكميات
// ==========================================

function getLiveDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    timestamp: new Date().toISOString(),
    usd_rate: 52.42,
    active_theme: getActiveThemeKey(),
    egx_institutions: null,
    archive: [],
    rates: [],
    banks: [],
    periodic: null
  };

  var savedEgx = PropertiesService.getScriptProperties().getProperty("LATEST_EGX_JSON");
  if (savedEgx) {
    try {
      result.egx_institutions = JSON.parse(savedEgx);
      if (result.egx_institutions.usd_rate) result.usd_rate = result.egx_institutions.usd_rate;
    } catch(e) {}
  }

  // 1. الأرشيف
  result.archive = getSheetArchiveRows(ss);

  // 2. الأسواق الحية
  var s2 = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
  if (s2 && s2.getLastRow() >= 4) {
    var maxR2 = s2.getLastRow() - 3;
    var maxC2 = Math.min(s2.getLastColumn(), 7);
    var rVals = s2.getRange(4, 1, maxR2, maxC2).getValues();
    rVals.forEach(function(row) {
      result.rates.push({
        category: String(row[0] || ""),
        code: String(row[1] || ""),
        name: String(row[2] || ""),
        buy: Number(row[3] || 0),
        sell: Number(row[4] || 0),
        rate_egp: Number(row[5] || 0),
        change: String(row[6] || "مباشر")
      });
    });
  }

  // 3. البنوك
  var s3 = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
  if (s3 && s3.getLastRow() >= 4) {
    var maxR3 = s3.getLastRow() - 3;
    var maxC3 = Math.min(s3.getLastColumn(), 5);
    var bVals = s3.getRange(4, 1, maxR3, maxC3).getValues();
    bVals.forEach(function(row) {
      result.banks.push({
        bank: String(row[0] || ""),
        buy: Number(row[1] || 0),
        sell: Number(row[2] || 0),
        avg: Number(row[3] || 0),
        updated_at: String(row[4] || "")
      });
    });
  }

  if (result.banks && result.banks.length > 0 && Number(result.banks[0].buy) > 30) {
    result.usd_rate = Number(result.banks[0].buy);
  }

  // 4. حساب التراكميات
  var latestDate = (result.archive && result.archive.length > 0) ? result.archive[0].date : "2026-10-05";
  result.periodic = calculatePeriodicTotals(result.archive, latestDate, result.usd_rate);

  return result;
}

// ==========================================
// 8. توليد صفحة الويب التفاعلية بـ 4 تصاميم
// ==========================================

function renderDashboardHtml() {
  var initialPayload = JSON.stringify(getLiveDashboardData());
  var activeTheme = getActiveThemeKey();

  return '<!DOCTYPE html>' +
'<html lang="ar" dir="rtl">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>منظومة البورصة المصرية وأسواق الصرف والسلع الحية</title>' +
'  <link rel="preconnect" href="https://fonts.googleapis.com">' +
'  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">' +
'  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">' +
'  <style>' +
'    :root {' +
'      --bg: #f8fafc; --card-bg: #ffffff; --border: #cbd5e1; --text: #0f172a;' +
'      --text-muted: #64748b; --primary: #1e3a8a; --header-bg: #1e3a8a; --header-text: #ffffff;' +
'      --accent: #0284c7; --pos-bg: #dcfce7; --pos-text: #15803d; --neg-bg: #fee2e2; --neg-text: #b91c1c;' +
'    }' +
'    body.theme-terminal {' +
'      --bg: #0b0f19; --card-bg: #111827; --border: #374151; --text: #f9fafb;' +
'      --text-muted: #9ca3af; --primary: #38bdf8; --header-bg: #0f172a; --header-text: #38bdf8;' +
'      --accent: #38bdf8; --pos-bg: #064e3b; --pos-text: #34d399; --neg-bg: #7f1d1d; --neg-text: #f87171;' +
'    }' +
'    body.theme-swiss {' +
'      --bg: #f8fafc; --card-bg: #ffffff; --border: #cbd5e1; --text: #0f172a;' +
'      --text-muted: #64748b; --primary: #1e3a8a; --header-bg: #1e3a8a; --header-text: #ffffff;' +
'      --accent: #0284c7; --pos-bg: #dcfce7; --pos-text: #15803d; --neg-bg: #fee2e2; --neg-text: #b91c1c;' +
'    }' +
'    body.theme-matrix {' +
'      --bg: #0d1117; --card-bg: #161b22; --border: #30363d; --text: #e6edf3;' +
'      --text-muted: #8b949e; --primary: #58a6ff; --header-bg: #21262d; --header-text: #58a6ff;' +
'      --accent: #e3b341; --pos-bg: #1b4729; --pos-text: #3fb950; --neg-bg: #5c1d24; --neg-text: #f85149;' +
'    }' +
'    body.theme-csuite {' +
'      --bg: #f1f5f9; --card-bg: #ffffff; --border: #cbd5e1; --text: #1e293b;' +
'      --text-muted: #475569; --primary: #334155; --header-bg: #334155; --header-text: #f8fafc;' +
'      --accent: #475569; --pos-bg: #e0f2fe; --pos-text: #0369a1; --neg-bg: #ffe4e6; --neg-text: #be123c;' +
'    }' +
'    * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Cairo", sans-serif; }' +
'    body { background-color: var(--bg); color: var(--text); padding-bottom: 40px; transition: background 0.3s, color 0.3s; }' +
'    .num-ltr { direction: ltr !important; unicode-bidi: isolate; display: inline-block; font-variant-numeric: tabular-nums; }' +
'    .nav-bar {' +
'      background: var(--header-bg); color: var(--header-text); padding: 14px 24px;' +
'      display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 20px rgba(0,0,0,0.15); flex-wrap: wrap; gap: 12px;' +
'    }' +
'    .brand { font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }' +
'    .brand i { color: var(--accent); }' +
'    .nav-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }' +
'    .theme-select-box {' +
'      background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);' +
'      color: #fff; padding: 7px 14px; border-radius: 8px; font-weight: 700; font-size: 0.9rem;' +
'      outline: none; cursor: pointer;' +
'    }' +
'    .theme-select-box option { background: #0f172a; color: #fff; }' +
'    .container { max-width: 1440px; margin: 24px auto; padding: 0 16px; display: flex; flex-direction: column; gap: 24px; }' +
'    .section-card {' +
'      background: var(--card-bg); border-radius: 16px; border: 1px solid var(--border);' +
'      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden;' +
'    }' +
'    .section-header {' +
'      padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;' +
'      border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.02); flex-wrap: wrap; gap: 12px;' +
'    }' +
'    .section-title { font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 10px; color: var(--text); }' +
'    .btn {' +
'      padding: 8px 16px; border-radius: 10px; font-weight: 700; font-size: 0.9rem;' +
'      cursor: pointer; border: none; display: flex; align-items: center; gap: 8px; transition: all 0.2s;' +
'    }' +
'    .btn-primary { background: var(--primary); color: #fff; }' +
'    .kpi-grid {' +
'      display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; padding: 20px;' +
'    }' +
'    .kpi-card {' +
'      border: 1px solid var(--border); border-radius: 12px; padding: 16px;' +
'      background: var(--card-bg); position: relative; overflow: hidden;' +
'    }' +
'    .kpi-title { font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }' +
'    .kpi-val { font-size: 1.45rem; font-weight: 900; line-height: 1.2; }' +
'    .kpi-sub { font-size: 0.85rem; font-weight: 700; margin-top: 6px; color: var(--text-muted); }' +
'    .val-pos { color: var(--pos-text); font-weight: 800; }' +
'    .val-neg { color: var(--neg-text); font-weight: 800; }' +
'    .table-container { width: 100%; overflow-x: auto; padding: 0 20px 20px; }' +
'    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.92rem; }' +
'    th {' +
'      background: var(--header-bg); color: var(--header-text); padding: 12px 14px; font-weight: 700;' +
'      text-align: center; border-bottom: 2px solid var(--border); white-space: nowrap;' +
'    }' +
'    td {' +
'      padding: 12px 14px; text-align: center; border-bottom: 1px solid var(--border);' +
'      background: var(--card-bg); color: var(--text); white-space: nowrap;' +
'    }' +
'    tbody tr:nth-child(even) td { background: rgba(0,0,0,0.03); }' +
'    .pill-tag { padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 800; display: inline-block; }' +
'    .pill-green { background: var(--pos-bg); color: var(--pos-text); }' +
'    .pill-red { background: var(--neg-bg); color: var(--neg-text); }' +
'    .pill-blue { background: rgba(56, 189, 248, 0.15); color: var(--primary); }' +
'    .search-box {' +
'      padding: 8px 14px; border: 1.5px solid var(--border); border-radius: 8px;' +
'      font-size: 0.9rem; font-family: "Cairo"; outline: none; width: 240px; background: var(--card-bg); color: var(--text);' +
'    }' +
'  </style>' +
'</head>' +
'<body class="theme-' + activeTheme + '">' +
'  <div class="nav-bar">' +
'    <div class="brand">' +
'      <i class="fa-solid fa-chart-line"></i>' +
'      <span>منظومة تتبع البورصة المصرية وأسواق المال</span>' +
'    </div>' +
'    <div class="nav-controls">' +
'      <div style="display: flex; align-items: center; gap: 8px;">' +
'        <i class="fa-solid fa-palette"></i>' +
'        <select id="themeSelector" class="theme-select-box" onchange="switchThemeUI(this.value)">' +
'          <option value="terminal">💻 بلومبرج المؤسسي (Terminal Elite)</option>' +
'          <option value="swiss">🏦 النمط البنكي السويسري (Swiss Banking)</option>' +
'          <option value="matrix">📈 منصة التداول والتحليل (Trading Matrix)</option>' +
'          <option value="csuite">📊 التقرير التنفيذي (C-Suite Minimalist)</option>' +
'        </select>' +
'      </div>' +
'      <div style="font-size: 0.85rem; font-weight: 700;">الدولار: <span id="nav-usd-rate" class="num-ltr">52.42</span> ج.م</div>' +
'      <div style="font-size: 0.85rem; font-weight: 700;"><span id="nav-clock">--:--:--</span></div>' +
'    </div>' +
'  </div>' +
'' +
'  <div class="container">' +
'    <!-- 1. بطاقات المؤشرات التنفيذية والتراكمية -->' +
'    <div class="section-card">' +
'      <div class="section-header">' +
'        <div class="section-title">' +
'          <i class="fa-solid fa-gauge-high" style="color: var(--primary);"></i>' +
'          <span>المؤشرات المالية التنفيذية والتراكمية (مباشر)</span>' +
'          <span class="pill-tag pill-blue" id="session-tag">جلسة اليوم</span>' +
'        </div>' +
'        <button class="btn btn-primary" onclick="refreshDashboardRPC(true)">' +
'          <i class="fa-solid fa-rotate"></i>' +
'          <span>تحديث لحظي</span>' +
'        </button>' +
'      </div>' +
'' +
'      <div class="kpi-grid">' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">صافي تعاملات الأجانب (اليوم)</div>' +
'          <div class="kpi-val num-ltr" id="kpi-today-fo">--</div>' +
'          <div class="kpi-sub">المعادل: <span id="kpi-today-fo-usd" class="num-ltr">--</span></div>' +
'        </div>' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">إجمالي صافي المؤسسات (اليوم)</div>' +
'          <div class="kpi-val num-ltr" id="kpi-today-tot">--</div>' +
'          <div class="kpi-sub">المعادل: <span id="kpi-today-tot-usd" class="num-ltr">--</span></div>' +
'        </div>' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">تراكمي الأسبوع - صافي الأجانب (من الأحد)</div>' +
'          <div class="kpi-val num-ltr" id="kpi-week-fo">--</div>' +
'          <div class="kpi-sub">إجمالي المؤسسات: <span id="kpi-week-tot" class="num-ltr">--</span></div>' +
'        </div>' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">تراكمي شهر أكتوبر 2026 - صافي الأجانب</div>' +
'          <div class="kpi-val num-ltr" id="kpi-month-fo">--</div>' +
'          <div class="kpi-sub">إجمالي المؤسسات: <span id="kpi-month-tot" class="num-ltr">--</span></div>' +
'        </div>' +
'      </div>' +
'    </div>' +
'' +
'    <!-- 2. جدول تعاملات المؤسسات لليوم والأرشيف -->' +
'    <div class="section-card">' +
'      <div class="section-header">' +
'        <div class="section-title">' +
'          <i class="fa-solid fa-building-columns" style="color: var(--primary);"></i>' +
'          <span>سجل تعاملات المؤسسات بالبورصة المصرية (EGX)</span>' +
'        </div>' +
'      </div>' +
'      <div class="table-container">' +
'        <table>' +
'          <thead>' +
'            <tr>' +
'              <th>التاريخ</th><th>القطاع</th><th>سعر الدولار</th>' +
'              <th>صافي الأجانب (ج.م)</th><th>صافي الأجانب ($)</th>' +
'              <th>إجمالي صافي المؤسسات (ج.م)</th><th>إجمالي الصافي ($)</th><th>حالة السوق</th>' +
'            </tr>' +
'          </thead>' +
'          <tbody id="egx-archive-tbody">' +
'            <tr><td colspan="8">جاري تحميل الأرشيف...</td></tr>' +
'          </tbody>' +
'        </table>' +
'      </div>' +
'    </div>' +
'' +
'    <!-- 3. أسعار الدولار في البنوك والأسواق الحية -->' +
'    <div class="section-card">' +
'      <div class="section-header">' +
'        <div class="section-title">' +
'          <i class="fa-solid fa-money-bill-trend-up" style="color: var(--accent);"></i>' +
'          <span>أسعار الدولار في البنوك المصرية (25 بنكاً) والسلع الحية</span>' +
'        </div>' +
'        <input type="text" id="bankSearch" class="search-box" placeholder="🔍 بحث في البنوك..." onkeyup="filterBanks(this.value)">' +
'      </div>' +
'      <div class="table-container">' +
'        <table>' +
'          <thead>' +
'            <tr>' +
'              <th>البنك</th><th>شراء (ج.م)</th><th>بيع (ج.م)</th><th>المتوسط</th><th>وقت التحديث</th>' +
'            </tr>' +
'          </thead>' +
'          <tbody id="banks-tbody">' +
'            <tr><td colspan="5">جاري تحميل أسعار البنوك...</td></tr>' +
'          </tbody>' +
'        </table>' +
'      </div>' +
'    </div>' +
'  </div>' +
'' +
'  <script>' +
'    var INITIAL_DATA = ' + initialPayload + ';' +
'    var CURRENT_THEME = "' + activeTheme + '";' +
'' +
'    function formatNum(n, dec) {' +
'      if (n === null || n === undefined || isNaN(n)) return "--";' +
'      return Number(n).toLocaleString("en-US", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });' +
'    }' +
'    function formatSignNum(n, unit) {' +
'      if (n === null || n === undefined || isNaN(n)) return "--";' +
'      var num = Number(n);' +
'      var cls = num >= 0 ? "val-pos" : "val-neg";' +
'      var sign = num >= 0 ? "+" : "-";' +
'      var absStr = formatNum(Math.abs(num));' +
'      return "<span class=\'" + cls + "\'>" + sign + (unit === "$" ? "$" : "") + absStr + (unit && unit !== "$" ? (" " + unit) : "") + "</span>";' +
'    }' +
'' +
'    function switchThemeUI(themeKey) {' +
'      CURRENT_THEME = themeKey;' +
'      document.body.className = "theme-" + themeKey;' +
'      document.getElementById("themeSelector").value = themeKey;' +
'      try { localStorage.setItem("SELECTED_THEME", themeKey); } catch(e) {}' +
'      if (typeof google !== "undefined" && google.script && google.script.run) {' +
'        google.script.run.applyActiveTheme(themeKey);' +
'      }' +
'    }' +
'' +
'    function refreshDashboardRPC(showLoading) {' +
'      if (typeof google !== "undefined" && google.script && google.script.run) {' +
'        google.script.run' +
'          .withSuccessHandler(function(data) { renderDashboard(data); })' +
'          .getLiveDashboardData();' +
'      } else {' +
'        fetch("?action=data")' +
'          .then(function(res) { return res.json(); })' +
'          .then(function(data) { renderDashboard(data); });' +
'      }' +
'    }' +
'' +
'    var allBanks = [];' +
'    function renderDashboard(data) {' +
'      if (!data) return;' +
'      if (data.usd_rate) document.getElementById("nav-usd-rate").innerText = Number(data.usd_rate).toFixed(2);' +
'      allBanks = data.banks || [];' +
'' +
'      // 1. KPI cards' +
'      var p = data.periodic || {};' +
'      var r0 = (data.archive && data.archive.length > 0) ? data.archive[0] : {};' +
'      var rate = Number(data.usd_rate || 52.42);' +
'      var todayFo = Number(r0.foreign_net || 0);' +
'      var todayTot = Number(r0.total_net || 0);' +
'' +
'      document.getElementById("kpi-today-fo").innerHTML = formatSignNum(todayFo, "ج.م");' +
'      document.getElementById("kpi-today-fo-usd").innerHTML = formatSignNum(Math.round(todayFo / rate), "$");' +
'      document.getElementById("kpi-today-tot").innerHTML = formatSignNum(todayTot, "ج.م");' +
'      document.getElementById("kpi-today-tot-usd").innerHTML = formatSignNum(Math.round(todayTot / rate), "$");' +
'' +
'      if (p.weekly) {' +
'        var wFoSign = formatSignNum(p.weekly.foNet, "ج.م");' +
'        var wFoUsd = " ($" + formatNum(Math.abs(p.weekly.foUsd)) + ")";' +
'        document.getElementById("kpi-week-fo").innerHTML = wFoSign + wFoUsd;' +
'        document.getElementById("kpi-week-tot").innerHTML = formatSignNum(p.weekly.totNet, "ج.م");' +
'      }' +
'      if (p.monthly) {' +
'        var mFoSign = formatSignNum(p.monthly.foNet, "ج.م");' +
'        var mFoUsd = " ($" + formatNum(Math.abs(p.monthly.foUsd)) + ")";' +
'        document.getElementById("kpi-month-fo").innerHTML = mFoSign + mFoUsd;' +
'        document.getElementById("kpi-month-tot").innerHTML = formatSignNum(p.monthly.totNet, "ج.م");' +
'      }' +
'' +
'      // 2. Archive table' +
'      if (data.archive && data.archive.length > 0) {' +
'        var aHtml = "";' +
'        data.archive.forEach(function(row) {' +
'          var fNet = Number(row.foreign_net || 0);' +
'          var tNet = Number(row.total_net || 0);' +
'          var rUsd = Number(row.usd_rate || rate);' +
'          var statusBadge = fNet >= 0' +
'            ? "<span class=\'pill-tag pill-green\'>شراء أجانب</span>"' +
'            : "<span class=\'pill-tag pill-red\'>بيع أجانب</span>";' +
'' +
'          aHtml += "<tr>"' +
'            + "<td style=\'font-weight: 700;\'>" + (row.date || "--") + "</td>"' +
'            + "<td>" + (row.segment || "الرئيسي") + "</td>"' +
'            + "<td class=\'num-ltr\'>" + rUsd.toFixed(2) + "</td>"' +
'            + "<td>" + formatSignNum(fNet, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(Math.round(fNet / rUsd), "$") + "</td>"' +
'            + "<td>" + formatSignNum(tNet, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(Math.round(tNet / rUsd), "$") + "</td>"' +
'            + "<td>" + statusBadge + "</td>"' +
'            + "</tr>";' +
'        });' +
'        document.getElementById("egx-archive-tbody").innerHTML = aHtml;' +
'      }' +
'' +
'      renderBanksTable(allBanks);' +
'    }' +
'' +
'    function renderBanksTable(list) {' +
'      var bHtml = "";' +
'      list.forEach(function(b) {' +
'        bHtml += "<tr>"' +
'          + "<td style=\'font-weight: 700;\'>" + b.bank + "</td>"' +
'          + "<td class=\'num-ltr\' style=\'color: var(--pos-text); font-weight: 800;\'>" + Number(b.buy).toFixed(2) + "</td>"' +
'          + "<td class=\'num-ltr\'>" + Number(b.sell).toFixed(2) + "</td>"' +
'          + "<td class=\'num-ltr\'>" + Number(b.avg).toFixed(2) + "</td>"' +
'          + "<td>" + (b.updated_at || "--") + "</td>"' +
'          + "</tr>";' +
'      });' +
'      document.getElementById("banks-tbody").innerHTML = bHtml;' +
'    }' +
'' +
'    function filterBanks(query) {' +
'      var q = (query || "").toLowerCase();' +
'      var filtered = allBanks.filter(function(b) { return (b.bank || "").toLowerCase().indexOf(q) >= 0; });' +
'      renderBanksTable(filtered);' +
'    }' +
'' +
'    setInterval(function() {' +
'      document.getElementById("nav-clock").innerText = new Date().toLocaleTimeString("ar-EG");' +
'    }, 1000);' +
'' +
'    document.addEventListener("DOMContentLoaded", function() {' +
'      var savedTheme = CURRENT_THEME;' +
'      try { savedTheme = localStorage.getItem("SELECTED_THEME") || CURRENT_THEME; } catch(e) {}' +
'      switchThemeUI(savedTheme);' +
'      renderDashboard(INITIAL_DATA);' +
'    });' +
'  </script>' +
'</body>' +
'</html>';
}
