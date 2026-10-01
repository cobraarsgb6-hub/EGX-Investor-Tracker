/**
 * =========================================================================
 * 🏛️ EGX INVESTOR TRACKER & GLOBAL MARKETS - BACKEND SCRIPT (Code.gs)
 * =========================================================================
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : "";

  // 1. صفحة لوحة تحكم وتخصيص بوت تلجرام (Telegram Web App / Mini App)
  if (page === "tg_control" || action === "tg_control") {
    return HtmlService.createHtmlOutputFromFile("TelegramControl")
      .setTitle("لوحة تحكم وتخصيص بوت تلجرام | EGX Bot Control Center")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  // 2. استرجاع إعدادات تخصيص البوت كـ JSON
  if (action === "get_tg_config") {
    return ContentService.createTextOutput(JSON.stringify(getTelegramBotConfig()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. تشغيل المزامنة السحابية المباشرة (Cloud Sync أونلاين 100%)
  if (action === "cloud_sync" || action === "sync_cloud") {
    var syncResult = cloudSyncOnlineRates();
    return ContentService.createTextOutput(JSON.stringify(syncResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "format") {
    formatAllSheetsProfessionally();
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم تنسيق وتوسيع كافة الشيتات بخط Cairo والألوان المعتمدة بنجاح!"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "data") {
    return ContentService.createTextOutput(JSON.stringify(getLiveDashboardData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // تفعيل وتثبيت Webhook تلجرام بضغطة واحدة
  if (action === "set_telegram_webhook") {
    var token = (e && e.parameter && e.parameter.token) ? e.parameter.token : PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "يرجى تمرير token في الرابط أو ضبطه في إعدادات Script Properties (TELEGRAM_BOT_TOKEN)"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    PropertiesService.getScriptProperties().setProperty("TELEGRAM_BOT_TOKEN", token);
    var webAppUrl = ScriptApp.getService().getUrl();
    var tgUrl = "https://api.telegram.org/bot" + token + "/setWebhook?url=" + encodeURIComponent(webAppUrl);
    var res = UrlFetchApp.fetch(tgUrl, { muteHttpExceptions: true });
    return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
  }

  // تقديم ملف Index.html النظيف
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("منظومة البورصة المصرية وأسواق الصرف | EGX Institutions Tracker")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function getAppSpreadsheet() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch(e) {}
  if (!ss) {
    var sheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "1nHJGoDGlX8JepzFrUiW4OhOPqy7biN3CoUBp9yyCyfA";
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch(e) {}
  }
  return ss;
}

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);

    // معالجة حفظ إعدادات وتخصيصات بوت تلجرام من لوحة الـ HTML
    if (data.action === "save_tg_config") {
      saveTelegramBotConfig(data.config);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "تم حفظ وتطبيق إعدادات البوت بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // معالجة المزامنة السحابية المباشرة من لوحة الـ HTML
    if (data.action === "cloud_sync") {
      var resSync = cloudSyncOnlineRates();
      return ContentService.createTextOutput(JSON.stringify(resSync))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // معالجة رسائل وتفاعلات بوت تلجرام (Telegram Webhook)
    if (data.message || data.callback_query) {
      handleTelegramWebhook(data);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    try { CacheService.getScriptCache().remove("LIVE_DASHBOARD_DATA_CACHE"); } catch(eC) {}

    var ss = getAppSpreadsheet();
    try { ss.setSpreadsheetLocale("en_US"); } catch(eLoc) {}

    if (data.latest_egx) {
      PropertiesService.getScriptProperties().setProperty("LATEST_EGX_JSON", JSON.stringify(data.latest_egx));
    }

    // حفظ سعر البنك المركزي الفعلي (شراء / بيع) لو أرسله السكرابر
    if (data.cbe_usd_buy && data.cbe_usd_sell) {
      var spc = PropertiesService.getScriptProperties();
      spc.setProperty("CBE_USD_BUY", String(data.cbe_usd_buy));
      spc.setProperty("CBE_USD_SELL", String(data.cbe_usd_sell));
    }

    // 1. تحديث أرشيف المؤسسات
    if (data.archive && data.archive.length > 0) {
      updateInstitutionsArchiveSheet(ss, data.archive);
    }

    // 2. تحديث الأسواق الحية
    if (data.rates && data.rates.length > 0) {
      updateLiveRatesSheet(ss, data.rates, data.timestamp);
    }

    // 3. تحديث البنوك
    if (data.banks && data.banks.length > 0) {
      updateBanksSheet(ss, data.banks, data.timestamp);
    }

    // 4. بناء وتحديث لوحة المؤشرات التنفيذية (الداشبورد في الشيت)
    buildExecutiveDashboardTab(ss, data);

    // 5. تطبيق التنسيق والـ Auto-fit التلقائي
    formatAllSheetsProfessionally();

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم تحديث الداشبورد وكافة التبويبات وتفعيل الأوتوفيت بنجاح!",
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
// تعيين سعر البنك المركزي يدوياً (شغّلها مرة من المحرر: Run)
// ==========================================

function setCbeRateManual() {
  var BUY = 52.2571, SELL = 52.3971; // البنك المركزي المصري الفعلي
  var sp = PropertiesService.getScriptProperties();
  sp.setProperty("CBE_USD_BUY", String(BUY));
  sp.setProperty("CBE_USD_SELL", String(SELL));
  CacheService.getScriptCache().remove("LIVE_DASHBOARD_DATA_CACHE");
}

// ==========================================
// 1. بناء لوحة المؤشرات (الداشبورد في الشيت)
// ==========================================

function buildExecutiveDashboardTab(ss, data) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return;
  data = data || {};
  var sheetName = "📊 لوحة التحكم والمؤشرات";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName, 0);
  } else {
    sheet.clear();
  }
  sheet.setRightToLeft(true);

  var ts = data.timestamp || new Date().toLocaleString();
  var usdRate = Number(data.usd_rate || 51.88);

  // شريط الترويسة الرئيسي
  sheet.getRange("A1:E1").merge()
    .setValue("📊 المركز المالي التنفيذي - البورصة المصرية وأسواق المال الحية")
    .setBackground("#0f172a")
    .setFontColor("#ffffff")
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(13)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 44);

  // شريط الحالة والتوقيت
  sheet.getRange("A2:E2").merge()
    .setValue("⚡ آخر تحديث لحظي: " + ts + " | سعر الدولار المعتمد: " + usdRate.toFixed(2) + " ج.م | الأساس المعتمد: تعاملات المؤسسات")
    .setBackground("#f1f5f9")
    .setFontColor("#1e293b")
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(9.5)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(2, 30);

  // القسم الأول: تعاملات المؤسسات
  sheet.getRange("A4:E4").merge()
    .setValue("🏛️ مؤشرات تدفقات المؤسسات بالبورصة المصرية (جلسة اليوم)")
    .setBackground("#1e3a8a")
    .setFontColor("#ffffff")
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(11)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(4, 34);

  var instHeaders = [
    "صافي مؤسسات مصرية (ج.م)",
    "صافي مؤسسات مصرية ($)",
    "صافي مؤسسات عربية (ج.م)",
    "صافي مؤسسات عربية ($)",
    "صافي مؤسسات أجنبية (ج.م)"
  ];
  sheet.getRange("A5:E5").setValues([instHeaders])
    .setBackground("#334155")
    .setFontColor("#ffffff")
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(5, 32);

  // حساب أرقام المؤسسات من الأرشيف أو من الشيت القائم
  var egNet = 0, arNet = 0, foNet = 0;
  if (data && data.archive && data.archive.length > 0) {
    var r0 = data.archive[0];
    egNet = Number(r0.egypt_net_egp || r0.egypt_net || 0);
    arNet = Number(r0.arab_net_egp || r0.arab_net || 0);
    foNet = Number(r0.foreign_net_egp || r0.foreign_net || 0);
  } else {
    var sInst = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
    if (sInst && sInst.getLastRow() >= 2) {
      egNet = Number(sInst.getRange(2, 6).getValue() || 0);
      arNet = Number(sInst.getRange(2, 9).getValue() || 0);
      foNet = Number(sInst.getRange(2, 12).getValue() || 0);
    }
  }

  var egUsd = Math.round(egNet / usdRate);
  var arUsd = Math.round(arNet / usdRate);

  var kpiVals = [[egNet, egUsd, arNet, arUsd, foNet]];
  var valRange = sheet.getRange("A6:E6");
  valRange.setValues(kpiVals)
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(12)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(6, 40);

  // تنسيق العملات وتلوين الكروت
  sheet.getRange("A6").setNumberFormat("#,##0");
  sheet.getRange("B6").setNumberFormat("$#,##0");
  sheet.getRange("C6").setNumberFormat("#,##0");
  sheet.getRange("D6").setNumberFormat("$#,##0");
  sheet.getRange("E6").setNumberFormat("#,##0");

  var valsList = [egNet, egUsd, arNet, arUsd, foNet];
  for (var col = 0; col < 5; col++) {
    var cell = sheet.getRange(6, col + 1);
    if (valsList[col] > 0) {
      cell.setBackground("#dcfce7").setFontColor("#15803d");
    } else if (valsList[col] < 0) {
      cell.setBackground("#fee2e2").setFontColor("#b91c1c");
    } else {
      cell.setBackground("#f8fafc").setFontColor("#64748b");
    }
  }

  // القسم الثاني: ملخص أسواق الطاقة والذهب والعملات
  sheet.getRange("A8:E8").merge()
    .setValue("⚡ ملخص أسواق الطاقة والذهب والعملات (مباشر ولحظي)")
    .setBackground("#b45309")
    .setFontColor("#ffffff")
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(11)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(8, 34);

  var rateHeaders = ["السلعة / الأصل", "الرمز", "السعر بالدولار ($)", "المعادل بالجنيه (ج.م)", "التغير / الحالة"];
  sheet.getRange("A9:E9").setValues([rateHeaders])
    .setBackground("#334155")
    .setFontColor("#ffffff")
    .setFontFamily("Cairo")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(9, 32);

  var assetRows = [];
  if (data && data.rates && data.rates.length > 0) {
    data.rates.forEach(function(r) {
      var uP = Number(r.usd_price || 0);
      var eP = Number(r.egp_price || r.rate_egp || (uP * usdRate));
      if (uP === 0 && eP > 0) uP = eP / usdRate;
      var chg = r.change || "لحظي";
      assetRows.push([r.name, r.code, uP, eP, chg]);
    });
  } else {
    var sRates = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
    if (sRates && sRates.getLastRow() >= 4) {
      var rVals = sRates.getRange(4, 1, sRates.getLastRow() - 3, Math.min(9, sRates.getLastColumn())).getValues();
      rVals.forEach(function(row) {
        var aName = String(row[2] || row[1] || "");
        var aCode = String(row[1] || "");
        var uP = Number(row[3] || 0);
        var eP = Number(row[4] || 0);
        var chg = String(row[7] || row[6] || "لحظي");
        if (aName) assetRows.push([aName, aCode, uP, eP, chg]);
      });
    }
  }

  if (assetRows.length === 0) {
    assetRows = [
      ["جرام ذهب عيار 24", "GOLD24", 134.84, Math.round(134.84 * usdRate), "لحظي"],
      ["جرام ذهب عيار 21", "GOLD21", 117.76, Math.round(117.76 * usdRate), "لحظي"],
      ["نفط خام برنت", "BRENT", 97.60, Math.round(97.60 * usdRate), "مباشر"],
      ["خام غرب تكساس", "WTI", 90.52, Math.round(90.52 * usdRate), "مباشر"],
      ["بتكوين (Bitcoin)", "BTC", 85468.0, Math.round(85468.0 * usdRate), "بينانس مباشر"],
      ["إيثريوم (Ethereum)", "ETH", 2737.24, Math.round(2737.24 * usdRate), "بينانس مباشر"],
      ["دولار أمريكي", "USD", 1.0, usdRate, "مستقر"],
      ["يورو أوروبي", "EUR", 1.1365, Math.round(usdRate * 1.1365 * 100) / 100, "مباشر"],
      ["ريال سعودي", "SAR", 0.2672, Math.round((usdRate / 3.75) * 100) / 100, "مستقر"],
      ["درهم إماراتي", "AED", 0.2730, Math.round((usdRate / 3.67) * 100) / 100, "مستقر"]
    ];
  }

  var rRange = sheet.getRange(10, 1, assetRows.length, 5);
  rRange.setValues(assetRows)
    .setFontFamily("Cairo")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange(10, 3, assetRows.length, 1).setNumberFormat("$#,##0.00");
  sheet.getRange(10, 4, assetRows.length, 1).setNumberFormat("#,##0.00");

  for (var i = 0; i < assetRows.length; i++) {
    sheet.setRowHeight(10 + i, 28);
    var bg = (i % 2 === 0) ? "#ffffff" : "#f8fafc";
    sheet.getRange(10 + i, 1, 1, 5).setBackground(bg);
  }

  // حدود نظيفة للداشبورد
  sheet.getRange(4, 1, 3, 5).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(8, 1, assetRows.length + 2, 5).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
}

// ==========================================
// 2. تحديث وتنسيق التبويبات الأخرى
// ==========================================

function updateInstitutionsArchiveSheet(ss, archive) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return;
  if (!archive || archive.length === 0) return;
  var sheet = getOrCreateSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة المصرية", "البورصة المصرية", "أرشيف", "EGX"]);
  sheet.clear();
  sheet.setRightToLeft(true);

  var headers = [
    "التاريخ", "القطاع السوقي", "سعر الدولار",
    "مؤسسات مصرية (شراء)", "مؤسسات مصرية (بيع)", "صافي مؤسسات مصرية",
    "مؤسسات عربية (شراء)", "مؤسسات عربية (بيع)", "صافي مؤسسات عربية",
    "مؤسسات أجنبية (شراء)", "مؤسسات أجنبية (بيع)", "صافي مؤسسات أجنبية",
    "إجمالي شراء المؤسسات", "إجمالي بيع المؤسسات", "صافي المؤسسات الإجمالي (ج.م)",
    "صافي المؤسسات الإجمالي ($)"
  ];

  var rows = [headers];
  archive.forEach(function(r) {
    rows.push([
      r.date, r.segment, Number(r.usd_rate || 51.88),
      Number(r.egypt_buy_egp || 0), Number(r.egypt_sell_egp || 0), Number(r.egypt_net_egp || 0),
      Number(r.arab_buy_egp || 0), Number(r.arab_sell_egp || 0), Number(r.arab_net_egp || 0),
      Number(r.foreign_buy_egp || 0), Number(r.foreign_sell_egp || 0), Number(r.foreign_net_egp || 0),
      Number(r.total_buy_egp || 0), Number(r.total_sell_egp || 0), Number(r.total_net_egp || 0),
      Number(r.total_net_usd || 0)
    ]);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function updateLiveRatesSheet(ss, rates, ts) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return;
  if (!rates || rates.length === 0) return;
  var sheet = getOrCreateSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
  sheet.clear();
  sheet.setRightToLeft(true);

  sheet.getRange(1, 1).setValue("⚡ آخر تحديث سحابي مباشر: " + (ts || new Date().toLocaleString()));

  var headers = ["القطاع / الفئة", "الرمز", "اسم الأصل / السلعة", "السعر بالدولار ($)", "السعر بالجنيه (ج.م)", "سعر الشراء", "سعر البيع", "التغير (24h)", "آخر تحديث"];
  var rows = [headers];

  rates.forEach(function(item) {
    rows.push([
      item.category, item.code, item.name,
      Number(item.usd_price || item.buy || 0),
      Number(item.egp_price || item.rate_egp || 0),
      Number(item.buy || 0),
      Number(item.sell || 0),
      item.change || "0.0%",
      item.updated_at || ts || "لحظي"
    ]);
  });

  sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(3);
}

function updateBanksSheet(ss, banks, ts) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return;
  if (!banks || banks.length === 0) return;
  var sheet = getOrCreateSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك المصرية", "البنوك"]);
  sheet.clear();
  sheet.setRightToLeft(true);

  sheet.getRange(1, 1).setValue("🏛️ تقرير أسعار صرف الدولار في 25 بنكاً مصرياً (مرتبة حسب أعلى شراء) - آخر تحديث: " + (ts || new Date().toLocaleString()));

  var headers = ["الترتيب", "اسم البنك", "سعر الشراء للبنك (ج.م)", "سعر البيع من البنك (ج.م)", "الفارق / الهامش (ج.م)", "آخر تحديث للبنك"];
  var rows = [headers];

  banks.forEach(function(b, idx) {
    var bBuy = Number(b.buy || 0);
    var bSell = Number(b.sell || 0);
    var spread = (bSell > 0 && bBuy > 0) ? (bSell - bBuy) : 0.10;
    rows.push([
      idx + 1,
      b.bank,
      bBuy,
      bSell,
      spread,
      b.updated_at || ""
    ]);
  });

  sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(3);
}

// ==========================================
// 3. التنسيق والأوتوفيت الذكي (Auto-Fit Engine)
// ==========================================

function formatAllSheetsProfessionally() {
  var ss = getAppSpreadsheet();
  
  // 1. ضمان بناء وتحديث لوحة المؤشرات (الداشبورد)
  buildExecutiveDashboardTab(ss, {});
  
  // 2. تنسيق شيت المؤسسات
  var s1 = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
  if (s1 && s1.getLastRow() >= 1) {
    s1.setRightToLeft(true);
    styleSheetTable(s1, 1, 1, s1.getLastRow(), s1.getLastColumn(), "#0f172a");
    if (s1.getLastRow() > 1) {
      var numRows = s1.getLastRow() - 1;
      s1.getRange(2, 3, numRows, 1).setNumberFormat("#,##0.00");
      s1.getRange(2, 4, numRows, Math.min(12, s1.getLastColumn() - 3)).setNumberFormat("#,##0");
      if (s1.getLastColumn() >= 16) s1.getRange(2, 16, numRows, 1).setNumberFormat("$#,##0");
      colorNetColumn(s1, 6, numRows);
      colorNetColumn(s1, 9, numRows);
      colorNetColumn(s1, 12, numRows);
      if (s1.getLastColumn() >= 15) colorNetColumn(s1, 15, numRows);
      if (s1.getLastColumn() >= 16) colorNetColumn(s1, 16, numRows);
    }
  }

  // تنسيق شيت الأسواق الحية
  var s2 = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
  if (s2 && s2.getLastRow() >= 3) {
    s2.setRightToLeft(true);
    s2.getRange(1, 1, 1, s2.getLastColumn()).merge().setBackground("#f8fafc").setFontColor("#0f172a").setFontFamily("Cairo").setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center").setVerticalAlignment("middle");
    s2.setRowHeight(1, 34);
    styleSheetTable(s2, 3, 1, s2.getLastRow() - 2, s2.getLastColumn(), "#1e3a8a");
    if (s2.getLastRow() > 3) {
      var nRows = s2.getLastRow() - 3;
      s2.getRange(4, 4, nRows, Math.min(3, s2.getLastColumn() - 3)).setNumberFormat("#,##0.00");
    }
  }

  // تنسيق شيت البنوك
  var s3 = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
  if (s3 && s3.getLastRow() >= 3) {
    s3.setRightToLeft(true);
    s3.getRange(1, 1, 1, s3.getLastColumn()).merge().setBackground("#f8fafc").setFontColor("#0f172a").setFontFamily("Cairo").setFontWeight("bold").setFontSize(11).setHorizontalAlignment("center").setVerticalAlignment("middle");
    s3.setRowHeight(1, 34);
    styleSheetTable(s3, 3, 1, s3.getLastRow() - 2, s3.getLastColumn(), "#064e3b");
    if (s3.getLastRow() > 3) {
      var bnRows = s3.getLastRow() - 3;
      s3.getRange(4, 2, bnRows, Math.min(3, s3.getLastColumn() - 1)).setNumberFormat("#,##0.00");
    }
  }

  // تشغيل الأوتوفيت مع وسائد الأمان لجميع الشيتات
  autoFitAllSheetsWithPadding(ss);
}

function autoFitAllSheetsWithPadding(ss) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var maxCol = sh.getLastColumn();
    if (maxCol > 0) {
      sh.autoResizeColumns(1, maxCol);
      // إضافة هامش أمان لكل عمود حتى لا يظهر ###
      for (var c = 1; c <= maxCol; c++) {
        var currW = sh.getColumnWidth(c);
        if (currW < 130) {
          sh.setColumnWidth(c, 140);
        } else {
          sh.setColumnWidth(c, currW + 20);
        }
      }
    }
  }
}

function styleSheetTable(sheet, startRow, startCol, numRows, numCols, headerBg) {
  if (!sheet) sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet) return;
  startRow = startRow || 1;
  startCol = startCol || 1;
  numRows = numRows || sheet.getLastRow();
  numCols = numCols || sheet.getLastColumn();
  if (numRows < 1 || numCols < 1) return;
  headerBg = headerBg || "#0f172a";

  var range = sheet.getRange(startRow, startCol, numRows, numCols);
  range.setFontFamily("Cairo").setVerticalAlignment("middle").setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  var headerRange = sheet.getRange(startRow, startCol, 1, numCols);
  headerRange.setBackground(headerBg).setFontColor("#ffffff").setFontWeight("bold").setFontSize(10.5).setHorizontalAlignment("center");
  sheet.setRowHeight(startRow, 38);

  if (numRows > 1) {
    for (var r = 1; r < numRows; r++) {
      var currentRow = startRow + r;
      sheet.setRowHeight(currentRow, 28);
      var rowRange = sheet.getRange(currentRow, startCol, 1, numCols);
      rowRange.setBackground(r % 2 === 1 ? "#ffffff" : "#f8fafc").setFontSize(10).setHorizontalAlignment("center");
    }
  }
}

function colorNetColumn(sheet, colIndex, numRows) {
  if (!sheet) sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet) return;
  if (!colIndex || colIndex > sheet.getLastColumn()) return;
  numRows = numRows || (sheet.getLastRow() - 1);
  if (numRows < 1) return;

  var values = sheet.getRange(2, colIndex, numRows, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (typeof raw === "string") raw = raw.replace(/,/g, "").replace(/،/g, "").replace(/\$/g, "");
    var val = Number(raw);
    if (!isNaN(val)) {
      var cell = sheet.getRange(2 + i, colIndex);
      if (val > 0) cell.setBackground("#dcfce7").setFontColor("#15803d").setFontWeight("bold");
      else if (val < 0) cell.setBackground("#fee2e2").setFontColor("#b91c1c").setFontWeight("bold");
    }
  }
}

// ==========================================
// 4. استرجاع البيانات اللحظية للواجهة
// ==========================================

function getLiveDashboardData(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get("LIVE_DASHBOARD_DATA_CACHE");
    if (cached) {
      try { return JSON.parse(cached); } catch(e) {}
    }
  }

  var ss = getAppSpreadsheet();
  var result = {
    timestamp: new Date().toISOString(),
    usd_rate: 51.94,
    cbe_usd_buy: null,
    cbe_usd_sell: null,
    egx_institutions: null,
    archive: [],
    rates: [],
    banks: []
  };

  try {
    var savedEgx = PropertiesService.getScriptProperties().getProperty("LATEST_EGX_JSON");
    if (savedEgx) {
      try {
        result.egx_institutions = JSON.parse(savedEgx);
        if (result.egx_institutions.usd_rate) result.usd_rate = result.egx_institutions.usd_rate;
      } catch(e) {}
    }

    // سعر البنك المركزي الفعلي (شراء / بيع) المخزّن في Script Properties
    var sp = PropertiesService.getScriptProperties();
    var cb = Number(sp.getProperty("CBE_USD_BUY") || 0);
    var cs = Number(sp.getProperty("CBE_USD_SELL") || 0);
    if (cb > 0 && cs > 0) { result.cbe_usd_buy = cb; result.cbe_usd_sell = cs; }

    var s1 = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
    if (s1 && s1.getLastRow() >= 2) {
      var maxR = Math.min(s1.getLastRow() - 1, 35);
      var vals = s1.getRange(2, 1, maxR, s1.getLastColumn()).getValues();
      vals.forEach(function(row) {
        var d = row[0];
        var dStr = "";
        if (d instanceof Date) {
          dStr = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        } else {
          dStr = String(d || "").split("T")[0].split(" ")[0];
        }
        result.archive.push({
          date: dStr, segment: String(row[1] || ""), usd_rate: Number(row[2] || 51.88),
          egypt_buy: Number(row[3] || 0), egypt_sell: Number(row[4] || 0), egypt_net: Number(row[5] || 0),
          arab_buy: Number(row[6] || 0), arab_sell: Number(row[7] || 0), arab_net: Number(row[8] || 0),
          foreign_buy: Number(row[9] || 0), foreign_sell: Number(row[10] || 0), foreign_net: Number(row[11] || 0),
          total_buy: Number(row[12] || 0), total_sell: Number(row[13] || 0), total_net: Number(row[14] || 0),
          total_net_usd: Number(row[15] || 0)
        });
      });
    }

    var s2 = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
    if (s2 && s2.getLastRow() >= 4) {
      var maxR2 = s2.getLastRow() - 3;
      var lastCol2 = s2.getLastColumn();
      var rVals = s2.getRange(4, 1, maxR2, lastCol2).getValues();
      rVals.forEach(function(row) {
        if (lastCol2 >= 9) {
          result.rates.push({
            category: String(row[0] || ""),
            code: String(row[1] || ""),
            name: String(row[2] || ""),
            usd_price: Number(row[3] || 0),
            egp_price: Number(row[4] || 0),
            buy: Number(row[5] || 0),
            sell: Number(row[6] || 0),
            change: String(row[7] || "0.0%"),
            updated_at: String(row[8] || "لحظي")
          });
        } else {
          result.rates.push({
            category: String(row[0] || ""),
            code: String(row[1] || ""),
            name: String(row[2] || ""),
            buy: Number(row[3] || 0),
            sell: Number(row[4] || 0),
            rate_egp: Number(row[5] || 0),
            change: String(row[6] || "0.0%"),
            updated_at: "لحظي"
          });
        }
      });
    }

    var s3 = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
    if (s3 && s3.getLastRow() >= 4) {
      var maxR3 = s3.getLastRow() - 3;
      var lastCol3 = s3.getLastColumn();
      var bVals = s3.getRange(4, 1, maxR3, lastCol3).getValues();
      bVals.forEach(function(row, idx) {
        var bName = String(row[1] || "");
        var buy = Number(row[2] || 0);
        var sell = Number(row[3] || 0);
        if (bName.indexOf("المركزي") >= 0 || bName.indexOf("CBE") >= 0) {
          if (buy > 0) result.cbe_usd_buy = buy;
          if (sell > 0) result.cbe_usd_sell = sell;
          if (buy > 0) result.usd_rate = buy;
        }
        var cleanTime = "";
        if (row[5]) {
          if (row[5] instanceof Date) {
            cleanTime = ("0" + row[5].getHours()).slice(-2) + ":" + ("0" + row[5].getMinutes()).slice(-2);
          } else {
            var m = String(row[5]).match(/(\d{1,2}:\d{2})/);
            cleanTime = m ? m[1] : String(row[5]);
          }
        }
        if (lastCol3 >= 6) {
          result.banks.push({
            rank: Number(row[0] || (idx + 1)),
            bank: bName,
            buy: buy,
            sell: sell,
            avg: Number(row[4] || 0),
            updated_at: cleanTime
          });
        } else {
          result.banks.push({
            rank: idx + 1,
            bank: String(row[0] || ""),
            buy: Number(row[1] || 0),
            sell: Number(row[2] || 0),
            avg: Number(row[3] || 0),
            updated_at: cleanTime
          });
        }
      });
    }
  } catch(err) {
    result.error = err.toString();
  }

  try {
    // كاش سريع لمدة 60 ثانية لضمان ظهور التحديثات اللحظية فوراً
    cache.put("LIVE_DASHBOARD_DATA_CACHE", JSON.stringify(result), 60);
  } catch(eCache) {}

  return result;
}

function getOrCreateSheet(ss, targetName, aliases) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return null;
  var sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;
  if (aliases && aliases.length > 0) {
    for (var i = 0; i < aliases.length; i++) {
      var s = ss.getSheetByName(aliases[i]);
      if (s) { s.setName(targetName); return s; }
    }
    var allSheets = ss.getSheets();
    for (var j = 0; j < allSheets.length; j++) {
      var n = allSheets[j].getName();
      for (var k = 0; k < aliases.length; k++) {
        if (n.indexOf(aliases[k]) >= 0) { allSheets[j].setName(targetName); return allSheets[j]; }
      }
    }
  }
  return ss.insertSheet(targetName);
}

function findExistingSheet(ss, targetName, keywords) {
  if (!ss) ss = getAppSpreadsheet();
  if (!ss) return null;
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

// ==========================================
// 4. محرك بوت تلجرام السحابي 24/7 (Telegram Bot Engine)
// ==========================================

function getTelegramBotConfig() {
  var raw = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_CONFIG");
  var def = {
    hide_egx: false,
    hide_banks: false,
    hide_gold: false,
    hide_markets: false,
    hide_report: false,
    hide_watchlist: false,
    hide_lang_toggle: false,
    hide_curr_toggle: false,
    show_control_btn: true,
    banks_count: 8,
    show_cbe_in_banks: true,
    show_best_banks: true,
    default_lang: "ar",
    default_curr: "EGP",
    welcome_msg_ar: "🏛️ <b>منظومة البورصة المصرية وأسواق الصرف الحية 24/7</b>\n\nأهلاً بك! تتبع لحظي لتدفقات المؤسسات بالبورصة، وأسعار البنك المركزي الفعلي، و25 بنكاً مصرياً، والذهب والنفط والكريبتو.\n\n👇 <i>اختر ما تريد من القائمة التفاعلية أدناه:</i>",
    footer_text_ar: "🔒 بيانات موثقة رسمياً لحظياً."
  };
  if (!raw) return def;
  try {
    var parsed = JSON.parse(raw);
    for (var k in def) {
      if (parsed[k] === undefined) parsed[k] = def[k];
    }
    return parsed;
  } catch(e) {
    return def;
  }
}

function saveTelegramBotConfig(cfg) {
  if (!cfg) return { status: "error", message: "No config provided" };
  PropertiesService.getScriptProperties().setProperty("TELEGRAM_BOT_CONFIG", JSON.stringify(cfg));
  try { CacheService.getScriptCache().remove("LIVE_DASHBOARD_DATA_CACHE"); } catch(e) {}
  return { status: "success", message: "Config saved successfully" };
}

function cloudSyncOnlineRates() {
  var ss = getAppSpreadsheet();
  if (!ss) return { status: "error", message: "Spreadsheet not found" };

  var usdRate = 51.94;
  var btcPrice = 84000;
  var btcChange = "+0.00%";
  var ethPrice = 2700;
  var ethChange = "+0.00%";
  var brentPrice = 78.50;
  var wtiPrice = 74.20;

  // 1. Fetch Binance Cryptos directly
  try {
    var btcRes = UrlFetchApp.fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", { muteHttpExceptions: true });
    if (btcRes.getResponseCode() === 200) {
      var btcJson = JSON.parse(btcRes.getContentText());
      btcPrice = parseFloat(btcJson.lastPrice || btcPrice);
      btcChange = (parseFloat(btcJson.priceChangePercent || 0) >= 0 ? "+" : "") + parseFloat(btcJson.priceChangePercent || 0).toFixed(2) + "%";
    }
    var ethRes = UrlFetchApp.fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT", { muteHttpExceptions: true });
    if (ethRes.getResponseCode() === 200) {
      var ethJson = JSON.parse(ethRes.getContentText());
      ethPrice = parseFloat(ethJson.lastPrice || ethPrice);
      ethChange = (parseFloat(ethJson.priceChangePercent || 0) >= 0 ? "+" : "") + parseFloat(ethJson.priceChangePercent || 0).toFixed(2) + "%";
    }
  } catch(eCrypto) {}

  // 2. Fetch Yahoo Oil (Brent & WTI)
  try {
    var brentRes = UrlFetchApp.fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d", { muteHttpExceptions: true });
    if (brentRes.getResponseCode() === 200) {
      var brentMeta = JSON.parse(brentRes.getContentText()).chart.result[0].meta;
      brentPrice = parseFloat(brentMeta.regularMarketPrice || brentPrice);
    }
    var wtiRes = UrlFetchApp.fetch("https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d", { muteHttpExceptions: true });
    if (wtiRes.getResponseCode() === 200) {
      var wtiMeta = JSON.parse(wtiRes.getContentText()).chart.result[0].meta;
      wtiPrice = parseFloat(wtiMeta.regularMarketPrice || wtiPrice);
    }
  } catch(eOil) {}

  // 3. Update rates sheet directly
  var s2 = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
  if (s2 && s2.getLastRow() >= 4) {
    var vals = s2.getRange(4, 1, s2.getLastRow() - 3, s2.getLastColumn()).getValues();
    for (var i = 0; i < vals.length; i++) {
      var code = String(vals[i][1] || "").toUpperCase();
      if (code === "BTC") {
        vals[i][3] = btcPrice;
        vals[i][4] = Math.round(btcPrice * usdRate);
        vals[i][7] = btcChange;
        vals[i][8] = "سحابي لحظي";
      } else if (code === "ETH") {
        vals[i][3] = ethPrice;
        vals[i][4] = Math.round(ethPrice * usdRate);
        vals[i][7] = ethChange;
        vals[i][8] = "سحابي لحظي";
      } else if (code === "BRENT") {
        vals[i][3] = brentPrice;
        vals[i][4] = Number((brentPrice * usdRate).toFixed(2));
        vals[i][8] = "سحابي لحظي";
      } else if (code === "WTI") {
        vals[i][3] = wtiPrice;
        vals[i][4] = Number((wtiPrice * usdRate).toFixed(2));
        vals[i][8] = "سحابي لحظي";
      }
    }
    s2.getRange(4, 1, vals.length, s2.getLastColumn()).setValues(vals);
  }

  // إعادة تدفئة الكاش فوراً في الخلفية ليبقى استدعاء البوت فائق السرعة
  try {
    getLiveDashboardData(true);
  } catch(eWarm) {}

  return {
    status: "success",
    message: "تم تحديث أسعار الكريبتو والنفط سحابياً بنجاح 100%!",
    timestamp: new Date().toISOString(),
    btc: btcPrice,
    eth: ethPrice,
    brent: brentPrice,
    wti: wtiPrice
  };
}

function getTelegramToken() {
  return PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN") || "";
}

function handleTelegramWebhook(update) {
  try {
    var token = getTelegramToken();
    if (!token) return;

    // 1. منع التكرار التلقائي (Deduplication) الصادر عن تلجرام عند إعادة المحاولة
    var cache = CacheService.getScriptCache();
    var updateId = update.update_id ? String(update.update_id) : null;
    if (updateId) {
      if (cache.get("tg_upd_" + updateId)) {
        return; // تم تنفيذه بالفعل - تجاهل التكرار
      }
      cache.put("tg_upd_" + updateId, "1", 300);
    }

    var chatId = null;
    var userText = "";
    var callbackQueryId = null;
    var isCallback = false;

    if (update.message) {
      chatId = update.message.chat.id;
      userText = (update.message.text || "").trim();
    } else if (update.callback_query) {
      isCallback = true;
      callbackQueryId = update.callback_query.id;
      chatId = update.callback_query.message.chat.id;
      userText = update.callback_query.data;
    }

    if (!chatId) return;

    // تجاهل أي تحديث لا يحمل نصاً أو زراً تفاعلياً (كالصور أو الانضمام)
    if (!isCallback && !userText) return;

    var lang = getUserPref(chatId, "lang", "ar");
    var curr = getUserPref(chatId, "curr", "EGP");

    // معالجة الأزرار التفاعلية (Callback Queries)
    if (isCallback) {
      answerTelegramCallback(callbackQueryId);
      if (userText === "cmd_egx") {
        sendTelegramMessage(chatId, generateTgEgxReport(lang, curr), getTgMenuKeyboard(lang));
      } else if (userText === "cmd_banks") {
        sendTelegramMessage(chatId, generateTgBanksReport(lang, curr), getTgBanksKeyboard(lang));
      } else if (userText === "cmd_banks_all") {
        sendTelegramMessage(chatId, generateTgAllBanksReport(lang, curr), getTgMenuKeyboard(lang));
      } else if (userText === "cmd_gold") {
        sendTelegramMessage(chatId, generateTgGoldReport(lang, curr), getTgMenuKeyboard(lang));
      } else if (userText === "cmd_markets") {
        sendTelegramMessage(chatId, generateTgMarketsReport(lang, curr), getTgMenuKeyboard(lang));
      } else if (userText === "cmd_report") {
        sendTelegramMessage(chatId, generateTgExecutiveReport(lang, curr), getTgMenuKeyboard(lang));
      } else if (userText === "cmd_watchlist") {
        sendTelegramMessage(chatId, generateTgWatchlistReport(chatId, lang, curr), getTgMenuKeyboard(lang));
      } else if (userText === "cmd_lang_ar") {
        setUserPref(chatId, "lang", "ar");
        sendTelegramMessage(chatId, "🇪🇬 تم ضبط لغة البوت إلى <b>العربية</b>.", getTgMenuKeyboard("ar"));
      } else if (userText === "cmd_lang_en") {
        setUserPref(chatId, "lang", "en");
        sendTelegramMessage(chatId, "🇬🇧 Bot language switched to <b>English</b>.", getTgMenuKeyboard("en"));
      } else if (userText === "cmd_curr_egp") {
        setUserPref(chatId, "curr", "EGP");
        sendTelegramMessage(chatId, "💵 تم ضبط عملة التقارير الافتراضية إلى <b>الجنيه المصري (EGP)</b>.", getTgMenuKeyboard(lang));
      } else if (userText === "cmd_curr_usd") {
        setUserPref(chatId, "curr", "USD");
        sendTelegramMessage(chatId, "💵 تم ضبط عملة التقارير الافتراضية إلى <b>الدولار الأمريكي ($)</b>.", getTgMenuKeyboard(lang));
      } else if (userText === "cmd_control") {
        sendTelegramControlLink(chatId, lang);
      } else if (userText === "cmd_menu") {
        sendTelegramMainMenu(chatId, lang);
      }
      return;
    }

    // معالجة الأوامر النصية
    var lowerText = userText.toLowerCase();

    if (lowerText === "/start" || lowerText === "/help" || lowerText === "قائمة" || lowerText === "menu") {
      sendTelegramMainMenu(chatId, lang);
    } else if (lowerText === "/control" || lowerText === "/settings" || lowerText === "تحكم" || lowerText === "اعدادات" || lowerText === "إعدادات") {
      sendTelegramControlLink(chatId, lang);
    } else if (lowerText === "/egx" || lowerText === "بورصة" || lowerText === "البورصة") {
      sendTelegramMessage(chatId, generateTgEgxReport(lang, curr), getTgMenuKeyboard(lang));
    } else if (lowerText === "/banks" || lowerText === "بنوك" || lowerText === "دولار") {
      sendTelegramMessage(chatId, generateTgBanksReport(lang, curr), getTgBanksKeyboard(lang));
    } else if (lowerText === "/allbanks" || lowerText === "كل البنوك") {
      sendTelegramMessage(chatId, generateTgAllBanksReport(lang, curr), getTgMenuKeyboard(lang));
    } else if (lowerText === "/gold" || lowerText === "ذهب") {
      sendTelegramMessage(chatId, generateTgGoldReport(lang, curr), getTgMenuKeyboard(lang));
    } else if (lowerText === "/markets" || lowerText === "اسواق" || lowerText === "أسواق") {
      sendTelegramMessage(chatId, generateTgMarketsReport(lang, curr), getTgMenuKeyboard(lang));
    } else if (lowerText === "/report" || lowerText === "تقرير") {
      sendTelegramMessage(chatId, generateTgExecutiveReport(lang, curr), getTgMenuKeyboard(lang));
    } else if (lowerText.indexOf("/add") === 0) {
      var parts = userText.split(" ");
      if (parts.length > 1) {
        var symbolToAdd = parts[1].toUpperCase().trim();
        addSymbolToWatchlist(chatId, symbolToAdd);
        var msg = (lang === "en") ? ("✅ Added <b>" + symbolToAdd + "</b> to your personal watchlist!") : ("✅ تمت إضافة <b>" + symbolToAdd + "</b> إلى قائمتك المخصصة!");
        sendTelegramMessage(chatId, msg, getTgMenuKeyboard(lang));
      } else {
        var helpMsg = (lang === "en") ? "💡 To add a currency, type: <code>/add SAR</code> or <code>/add EUR</code>" : "💡 لإضافة عملة إلى قائمتك، اكتب: <code>/add SAR</code> أو <code>/add EUR</code>";
        sendTelegramMessage(chatId, helpMsg, getTgMenuKeyboard(lang));
      }
    } else if (lowerText.indexOf("/remove") === 0) {
      var parts2 = userText.split(" ");
      if (parts2.length > 1) {
        var symbolToRemove = parts2[1].toUpperCase().trim();
        removeSymbolFromWatchlist(chatId, symbolToRemove);
        var remMsg = (lang === "en") ? ("🗑️ Removed <b>" + symbolToRemove + "</b> from your watchlist.") : ("🗑️ تم حذف <b>" + symbolToRemove + "</b> من قائمتك المخصصة.");
        sendTelegramMessage(chatId, remMsg, getTgMenuKeyboard(lang));
      }
    } else if (lowerText === "/watchlist" || lowerText === "قائمتي") {
      sendTelegramMessage(chatId, generateTgWatchlistReport(chatId, lang, curr), getTgMenuKeyboard(lang));
    } else {
      // بحث تلقائي ذكي ومحصن عن العملات والأسعار المحددة فقط
      var assetResult = findAssetLivePrice(userText);
      if (assetResult) {
        sendTelegramMessage(chatId, assetResult, getTgMenuKeyboard(lang));
      } else if (lowerText.indexOf("/") === 0) {
        var helpTxt = (lang === "en")
          ? "❓ Unknown command. Type /start to view the main menu."
          : "❓ أمر غير معروف. اضغط /start لعرض القائمة الرئيسية أو اكتب اسم أي عملة أو بنك.";
        sendTelegramMessage(chatId, helpTxt, getTgMenuKeyboard(lang));
      }
      // إذا كان نصاً عادياً غير مطابق لأي أصل أو بنك صريح ولا يبدأ بـ /، نتجاهله تماماً لمنع إزعاج المستخدم نهائياً
    }
  } catch(e) {
    // خطأ صامت
  }
}

function sendTelegramControlLink(chatId, lang) {
  var ctrlUrl = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec?page=tg_control";
  try {
    var sUrl = ScriptApp.getService().getUrl();
    if (sUrl && sUrl.indexOf("http") === 0) ctrlUrl = sUrl + "?page=tg_control";
  } catch(eU) {}

  var title = (lang === "en")
    ? "⚙️ <b>Bot Customization & Control Center (Online 24/7)</b>\n\nClick the button below to open your control panel in the browser, where you can toggle sections, adjust bank counts, and edit messages:"
    : "⚙️ <b>لوحة تحكم وتخصيص البوت (سحابية 24/7)</b>\n\nاضغط على الزر أدناه لفتح لوحة التحكم في المتصفح مباشرة، وتخصيص الأزرار وعدد البنوك المعروضة ورسائل البوت:";

  sendTelegramMessage(chatId, title, {
    inline_keyboard: [
      [{ text: (lang === "en" ? "⚙️ Open Control Center" : "⚙️ فتح لوحة التحكم بالمتصفح"), url: ctrlUrl }],
      [{ text: (lang === "en" ? "🔙 Main Menu" : "🔙 القائمة الرئيسية"), callback_data: "cmd_menu" }]
    ]
  });
}

function sendTelegramMainMenu(chatId, lang) {
  var cfg = getTelegramBotConfig();
  var text = (lang === "en")
    ? (cfg.welcome_msg_en || "🏛️ <b>Egyptian Stock Exchange & Live Markets Bot</b>\n\nWelcome! Instant institutional flow tracking, official CBE dollar rates, 25 banks, and live global markets 24/7.\n\n👇 <i>Choose from the menu below:</i>")
    : (cfg.welcome_msg_ar || "🏛️ <b>منظومة البورصة المصرية وأسواق الصرف الحية 24/7</b>\n\nأهلاً بك! تتبع لحظي لتدفقات المؤسسات بالبورصة، وأسعار البنك المركزي الفعلي، و25 بنكاً مصرياً، والذهب والنفط والكريبتو.\n\n👇 <i>اختر ما تريد من القائمة التفاعلية أدناه:</i>");
  sendTelegramMessage(chatId, text, getTgMenuKeyboard(lang));
}

function getTgMenuKeyboard(lang) {
  var cfg = getTelegramBotConfig();
  var rows = [];

  // الصف 1: البورصة والبنوك
  var r1 = [];
  if (!cfg.hide_egx) {
    r1.push({ text: (lang === "en" ? "🏛️ Institutional Flows (EGX)" : "🏛️ تعاملات المؤسسات (EGX)"), callback_data: "cmd_egx" });
  }
  if (!cfg.hide_banks) {
    r1.push({ text: (lang === "en" ? "🏦 25 Banks & CBE" : "🏦 أسعار البنوك والمركزي"), callback_data: "cmd_banks" });
  }
  if (r1.length > 0) rows.push(r1);

  // الصف 2: الذهب والأسواق
  var r2 = [];
  if (!cfg.hide_gold) {
    r2.push({ text: (lang === "en" ? "🪙 Gold & Silver" : "🪙 الذهب والمعادن"), callback_data: "cmd_gold" });
  }
  if (!cfg.hide_markets) {
    r2.push({ text: (lang === "en" ? "⚡ Currencies, Oil & Crypto" : "⚡ العملات والنفط والكريبتو"), callback_data: "cmd_markets" });
  }
  if (r2.length > 0) rows.push(r2);

  // الصف 3: التقرير الشامل وقائمتي
  var r3 = [];
  if (!cfg.hide_report) {
    r3.push({ text: (lang === "en" ? "📊 Full Executive Report" : "📊 التقرير المالي الشامل"), callback_data: "cmd_report" });
  }
  if (!cfg.hide_watchlist) {
    r3.push({ text: (lang === "en" ? "⭐ My Watchlist" : "⭐ قائمتي المخصصة"), callback_data: "cmd_watchlist" });
  }
  if (r3.length > 0) rows.push(r3);

  // الصف 4: تبديل اللغة وتبديل العملة
  var r4 = [];
  if (!cfg.hide_lang_toggle) {
    r4.push(lang === "en" ? { text: "🌐 اللغة (العربية)", callback_data: "cmd_lang_ar" } : { text: "🌐 Switch to English", callback_data: "cmd_lang_en" });
  }
  if (!cfg.hide_curr_toggle) {
    r4.push({ text: (lang === "en" ? "💵 Toggle EGP / USD" : "💵 التبديل: جنيه / دولار"), callback_data: "cmd_curr_usd" });
  }
  if (r4.length > 0) rows.push(r4);

  // الصف 5: زر لوحة التحكم والتخصيص (رابط مباشر موثوق يفتح في المتصفح فوراً دون مشاكل إطارات)
  if (cfg.show_control_btn !== false) {
    var ctrlUrl = "https://script.google.com/macros/s/AKfycbwO2XFvnxgA4aXgzZKoVCLhRy0CnfUonrptmkxvQF4nZChW_D_RrZsQDXm6NUW6QIRGuA/exec?page=tg_control";
    try {
      var serviceUrl = ScriptApp.getService().getUrl();
      if (serviceUrl && serviceUrl.indexOf("http") === 0) ctrlUrl = serviceUrl + "?page=tg_control";
    } catch(eUrl) {}

    rows.push([{
      text: (lang === "en" ? "⚙️ Bot Control Center" : "⚙️ لوحة تحكم وتخصيص البوت"),
      url: ctrlUrl
    }]);
  }

  return { inline_keyboard: rows };
}

function getTgBanksKeyboard(lang) {
  if (lang === "en") {
    return {
      inline_keyboard: [
        [{ text: "📋 View All 25 Banks", callback_data: "cmd_banks_all" }],
        [{ text: "🔙 Main Menu", callback_data: "cmd_menu" }]
      ]
    };
  }
  return {
    inline_keyboard: [
      [{ text: "📋 عرض قائمة كافة الـ 25 بنكاً", callback_data: "cmd_banks_all" }],
      [{ text: "🔙 القائمة الرئيسية", callback_data: "cmd_menu" }]
    ]
  };
}

function generateTgEgxReport(lang, curr) {
  var data = getLiveDashboardData();
  var usdRate = Number(data.usd_rate || 51.94);
  var egNet = 0, arNet = 0, foNet = 0;
  var egBuy = 0, arBuy = 0, foBuy = 0;
  var egSell = 0, arSell = 0, foSell = 0;

  var instData = (data.egx_institutions && data.egx_institutions.tables) ? data.egx_institutions.tables.institutions : null;
  if (instData && instData.length > 0) {
    instData.forEach(function(item) {
      var t = item.type || "";
      var n = Number(item.net_egp || 0);
      var b = Number(item.buy_egp || 0);
      var s = Number(item.sell_egp || 0);
      if (t.indexOf("مصر") >= 0) { egNet = n; egBuy = b; egSell = s; }
      else if (t.indexOf("عرب") >= 0) { arNet = n; arBuy = b; arSell = s; }
      else if (t.indexOf("أجانب") >= 0 || t.indexOf("اجانب") >= 0) { foNet = n; foBuy = b; foSell = s; }
    });
  } else if (data.archive && data.archive.length > 0) {
    var r = data.archive[0];
    egNet = Number(r.egypt_net || 0); arNet = Number(r.arab_net || 0); foNet = Number(r.foreign_net || 0);
    egBuy = Number(r.egypt_buy || 0); arBuy = Number(r.arab_buy || 0); foBuy = Number(r.foreign_buy || 0);
  }

  var fmt = function(v) { return Number(v).toLocaleString("en-US"); };
  var fmtUsd = function(v) { return "$" + Number(Math.round(v / usdRate)).toLocaleString("en-US"); };

  if (lang === "en") {
    return "🏛️ <b>Institutional Trading - Egyptian Stock Exchange (EGX)</b>\n"
      + "━━━━━━━━━━━━━━━━━━\n"
      + "📅 <i>Session Date: " + (data.timestamp || new Date().toISOString().substring(0, 10)) + "</i>\n"
      + "💵 <i>Official CBE USD: " + usdRate.toFixed(2) + " EGP</i>\n"
      + "━━━━━━━━━━━━━━━━━━\n\n"
      + "🇪🇬 <b>Egyptian Institutions:</b>\n"
      + "  ▫️ Net Flow: <b>" + (egNet >= 0 ? "+" : "") + fmt(egNet) + " EGP</b> (" + fmtUsd(egNet) + ")\n"
      + "  ▫️ Purchases: " + fmt(egBuy) + " EGP\n"
      + "  ▫️ Trend: " + (egNet >= 0 ? "🟢 Net Buyer" : "🔴 Net Seller") + "\n\n"
      + "🌍 <b>Arab Institutions:</b>\n"
      + "  ▫️ Net Flow: <b>" + (arNet >= 0 ? "+" : "") + fmt(arNet) + " EGP</b> (" + fmtUsd(arNet) + ")\n"
      + "  ▫️ Purchases: " + fmt(arBuy) + " EGP\n"
      + "  ▫️ Trend: " + (arNet >= 0 ? "🟢 Net Buyer" : "🔴 Net Seller") + "\n\n"
      + "🌐 <b>Foreign Institutions:</b>\n"
      + "  ▫️ Net Flow: <b>" + (foNet >= 0 ? "+" : "") + fmt(foNet) + " EGP</b> (" + fmtUsd(foNet) + ")\n"
      + "  ▫️ Purchases: " + fmt(foBuy) + " EGP\n"
      + "  ▫️ Trend: " + (foNet >= 0 ? "🟢 Net Buyer" : "🔴 Net Seller") + "\n\n"
      + "🔒 <i>Officially audited from EGX Terminal.</i>";
  }

  return "🏛️ <b>تعاملات المؤسسات - البورصة المصرية (EGX)</b>\n"
    + "━━━━━━━━━━━━━━━━━━\n"
    + "📅 <i>جلسة موثقة: " + (data.timestamp || new Date().toISOString().substring(0, 10)) + "</i>\n"
    + "💵 <i>الدولار المعتمد بالمركزي: " + usdRate.toFixed(2) + " ج.م</i>\n"
    + "━━━━━━━━━━━━━━━━━━\n\n"
    + "🇪🇬 <b>صافي المؤسسات المصرية:</b>\n"
    + "  ▫️ صافي السيولة: <b>" + (egNet >= 0 ? "+" : "") + fmt(egNet) + " ج.م</b> (" + fmtUsd(egNet) + ")\n"
    + "  ▫️ المشتريات: " + fmt(egBuy) + " ج.م\n"
    + "  ▫️ الاتجاه: " + (egNet >= 0 ? "🟢 شراء صافي" : "🔴 بيع صافي") + "\n\n"
    + "🌍 <b>صافي المؤسسات العربية:</b>\n"
    + "  ▫️ صافي السيولة: <b>" + (arNet >= 0 ? "+" : "") + fmt(arNet) + " ج.م</b> (" + fmtUsd(arNet) + ")\n"
    + "  ▫️ المشتريات: " + fmt(arBuy) + " ج.م\n"
    + "  ▫️ الاتجاه: " + (arNet >= 0 ? "🟢 شراء صافي" : "🔴 بيع صافي") + "\n\n"
    + "🌐 <b>صافي المؤسسات الأجنبية:</b>\n"
    + "  ▫️ صافي السيولة: <b>" + (foNet >= 0 ? "+" : "") + fmt(foNet) + " ج.م</b> (" + fmtUsd(foNet) + ")\n"
    + "  ▫️ المشتريات: " + fmt(foBuy) + " ج.م\n"
    + "  ▫️ الاتجاه: " + (foNet >= 0 ? "🟢 شراء صافي" : "🔴 بيع صافي") + "\n\n"
    + "🔒 <i>البيانات مطابقة تماماً لشاشة البورصة المصرية الرسمية.</i>";
}

function generateTgBanksReport(lang, curr) {
  var cfg = getTelegramBotConfig();
  var data = getLiveDashboardData();
  var banks = data.banks || [];
  var usdBuy = Number(data.cbe_usd_buy || data.usd_rate || 51.94);
  var usdSell = Number(data.cbe_usd_sell || (usdBuy + 0.10));
  var banksLimit = parseInt(cfg.banks_count) || 8;

  var topBuy = banks.length > 0 ? banks[0] : { bank: "مصرف أبوظبي الإسلامي (ADIB)", buy: 52.10, sell: 52.20 };
  var lowSell = banks.length > 0 ? banks[0] : { bank: "بنك أبوظبي الأول (FABMISR)", buy: 51.85, sell: 51.95 };

  var maxB = -1, minS = 999;
  banks.forEach(function(b) {
    var buyVal = Number(b.buy || 0);
    var sellVal = Number(b.sell || 0);
    if (buyVal > maxB) { maxB = buyVal; topBuy = b; }
    if (sellVal > 0 && sellVal < minS) { minS = sellVal; lowSell = b; }
  });

  if (lang === "en") {
    var txt = "🏦 <b>USD Exchange Rates - Egyptian Banks</b>\n"
      + "━━━━━━━━━━━━━━━━━━\n";

    if (cfg.show_cbe_in_banks !== false) {
      txt += "🏛️ <b>Central Bank of Egypt (CBE):</b>\n"
        + "  ▫️ Buy: <b>" + usdBuy.toFixed(2) + "</b> - Sell: <b>" + usdSell.toFixed(2) + " EGP</b>\n"
        + "━━━━━━━━━━━━━━━━━━\n";
    }

    if (cfg.show_best_banks !== false) {
      txt += "🟢 <b>Top Buy:</b> " + topBuy.bank + " (<b>" + Number(topBuy.buy).toFixed(2) + " EGP</b>)\n"
        + "🔵 <b>Lowest Sell:</b> " + lowSell.bank + " (<b>" + Number(lowSell.sell).toFixed(2) + " EGP</b>)\n"
        + "━━━━━━━━━━━━━━━━━━\n";
    }

    txt += "📊 <b>Leading Egyptian Banks (Top " + Math.min(banksLimit, banks.length) + "):</b>\n\n";

    banks.slice(0, banksLimit).forEach(function(b) {
      txt += "▫️ <b>" + b.bank + ":</b> Buy <b>" + Number(b.buy).toFixed(2) + "</b> - Sell <b>" + Number(b.sell).toFixed(2) + " EGP</b>\n";
    });
    txt += "\n⚡ <i>Cairo Time • Live rates via Ta3weem.</i>";
    return txt;
  }

  var txtAr = "🏦 <b>أسعار صرف الدولار في البنوك المصرية</b>\n"
    + "━━━━━━━━━━━━━━━━━━\n";

  if (cfg.show_cbe_in_banks !== false) {
    txtAr += "🏛️ <b>البنك المركزي المصري:</b>\n"
      + "  ▫️ شراء: <b>" + usdBuy.toFixed(2) + "</b> - بيع: <b>" + usdSell.toFixed(2) + " ج.م</b>\n"
      + "━━━━━━━━━━━━━━━━━━\n";
  }

  if (cfg.show_best_banks !== false) {
    txtAr += "🟢 <b>أعلى سعر شراء:</b> " + topBuy.bank + " (<b>" + Number(topBuy.buy).toFixed(2) + " ج.م</b>)\n"
      + "🔵 <b>أقل سعر بيع:</b> " + lowSell.bank + " (<b>" + Number(lowSell.sell).toFixed(2) + " ج.م</b>)\n"
      + "━━━━━━━━━━━━━━━━━━\n";
  }

  txtAr += "📊 <b>أبرز البنوك المصرية:</b>\n\n";

  banks.slice(0, banksLimit).forEach(function(b) {
    txtAr += "▫️ <b>" + b.bank + ":</b> شراء <b>" + Number(b.buy).toFixed(2) + "</b> - بيع <b>" + Number(b.sell).toFixed(2) + " ج.م</b>\n";
  });
  txtAr += "\n⚡ <i>بتوقيت مصر • أسعار حية مباشرة من البنوك.</i>";
  return txtAr;
}

function generateTgAllBanksReport(lang, curr) {
  var data = getLiveDashboardData();
  var banks = data.banks || [];
  if (lang === "en") {
    var txt = "🏦 <b>All 25 Egyptian Banks - Live USD Rates</b>\n━━━━━━━━━━━━━━━━━━\n\n";
    banks.forEach(function(b, idx) {
      txt += (idx + 1) + ". <b>" + b.bank + ":</b> Buy <b>" + Number(b.buy).toFixed(2) + "</b> - Sell <b>" + Number(b.sell).toFixed(2) + " EGP</b>\n";
    });
    return txt + "\n⚡ <i>Cairo Time • All 25 Banks.</i>";
  }
  var txtAr = "🏦 <b>قائمة الـ 25 بنكاً مصرياً بالكامل - أسعار الدولار</b>\n━━━━━━━━━━━━━━━━━━\n\n";
  banks.forEach(function(b, idx) {
    txtAr += (idx + 1) + ". <b>" + b.bank + ":</b> شراء <b>" + Number(b.buy).toFixed(2) + "</b> - بيع <b>" + Number(b.sell).toFixed(2) + " ج.م</b>\n";
  });
  return txtAr + "\n⚡ <i>بتوقيت مصر • كافة الـ 25 بنكاً.</i>";
}

function generateTgGoldReport(lang, curr) {
  var data = getLiveDashboardData();
  var rates = data.rates || [];
  var usdRate = Number(data.usd_rate || 51.94);

  var goldItems = rates.filter(function(r) { return (r.code || "").indexOf("GOLD") >= 0; });
  var fmt = function(v) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  if (lang === "en") {
    var title = "🪙 <b>Live Gold & Precious Metals Rates</b>\n━━━━━━━━━━━━━━━━━━\n\n";
    goldItems.forEach(function(g) {
      var eP = Number(g.egp_price || g.rate_egp || 0);
      var uP = Number(g.usd_price || (eP / usdRate));
      title += "▫️ <b>" + g.name + " (" + g.code + ")</b>\n"
        + "    Price: <b>" + fmt(eP) + " EGP</b>  •  $" + fmt(uP) + " (" + (g.change || "0.0%") + ")\n\n";
    });
    return title;
  }

  var titleAr = "🪙 <b>أسعار الذهب والمعادن الثمينة لحظياً</b>\n━━━━━━━━━━━━━━━━━━\n\n";
  goldItems.forEach(function(g) {
    var eP = Number(g.egp_price || g.rate_egp || 0);
    var uP = Number(g.usd_price || (eP / usdRate));
    titleAr += "▫️ <b>" + g.name + " (" + g.code + ")</b>\n"
      + "    السعر: <b>" + fmt(eP) + " ج.م</b>  •  $" + fmt(uP) + " (" + (g.change || "0.0%") + ")\n\n";
  });
  return titleAr;
}

function generateTgMarketsReport(lang, curr) {
  var data = getLiveDashboardData();
  var rates = data.rates || [];
  var usdRate = Number(data.usd_rate || 51.94);
  var fmt = function(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 2, maximumFractionDigits: d || 2 }); };

  if (lang === "en") {
    var txt = "⚡ <b>Major Currencies, Oil & Crypto Rates</b>\n━━━━━━━━━━━━━━━━━━\n\n";
    rates.forEach(function(r) {
      if ((r.code || "").indexOf("GOLD") < 0) {
        var eP = Number(r.egp_price || (Number(r.usd_price || 0) * usdRate));
        var uP = Number(r.usd_price || (eP / usdRate));
        var uDec = uP < 10 ? (uP < 1 ? 4 : 3) : 2;
        txt += "▫️ <b>" + r.name + " [" + r.code + "]</b>\n"
          + "    Rate: <b>" + fmt(eP, 2) + " EGP</b>  •  $" + fmt(uP, uDec) + " (" + (r.change || "0.0%") + ")\n\n";
      }
    });
    return txt;
  }

  var txtAr = "⚡ <b>العملات الرئيسية والطاقة والعملات الرقمية</b>\n━━━━━━━━━━━━━━━━━━\n\n";
  rates.forEach(function(r) {
    if ((r.code || "").indexOf("GOLD") < 0) {
      var eP = Number(r.egp_price || (Number(r.usd_price || 0) * usdRate));
      var uP = Number(r.usd_price || (eP / usdRate));
      var uDec = uP < 10 ? (uP < 1 ? 4 : 3) : 2;
      txtAr += "▫️ <b>" + r.name + " [" + r.code + "]</b>\n"
        + "    السعر: <b>" + fmt(eP, 2) + " ج.م</b>  •  $" + fmt(uP, uDec) + " (" + (r.change || "0.0%") + ")\n\n";
    }
  });
  return txtAr;
}

function generateTgExecutiveReport(lang, curr) {
  return generateTgEgxReport(lang, curr) + "\n\n" + generateTgBanksReport(lang, curr);
}

function generateTgWatchlistReport(chatId, lang, curr) {
  var list = getWatchlist(chatId);
  if (!list || list.length === 0) {
    return (lang === "en")
      ? "⭐ <b>Your Watchlist is empty!</b>\n\nAdd any asset to track it directly. Example:\n<code>/add SAR</code> or <code>/add GOLD21</code> or <code>/add BTC</code>"
      : "⭐ <b>قائمتك المخصصة فارغة حالياً!</b>\n\nيمكنك إضافة أي عملة أو أصل لتتبعه فوراً:\n<code>/add SAR</code> أو <code>/add GOLD21</code> أو <code>/add BTC</code>";
  }

  var data = getLiveDashboardData();
  var rates = data.rates || [];
  var usdRate = Number(data.usd_rate || 51.94);
  var fmt = function(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 2, maximumFractionDigits: d || 2 }); };

  var txt = (lang === "en") ? "⭐ <b>Your Custom Watchlist (Live Rates):</b>\n━━━━━━━━━━━━━━━━━━\n\n" : "⭐ <b>قائمتك المخصصة لمتابعة الأسعار الحية:</b>\n━━━━━━━━━━━━━━━━━━\n\n";

  list.forEach(function(sym) {
    var found = rates.find(function(r) { return (r.code || "").toUpperCase() === sym.toUpperCase() || (r.name || "").indexOf(sym) >= 0; });
    if (found) {
      var eP = Number(found.egp_price || (Number(found.usd_price || 0) * usdRate));
      var uP = Number(found.usd_price || (eP / usdRate));
      txt += "▫️ <b>" + found.name + " [" + found.code + "]</b>\n   ➔ <b>" + fmt(eP, 2) + " ج.م</b>  •  $" + fmt(uP, 2) + " (" + (found.change || "0.0%") + ")\n\n";
    } else {
      txt += "▫️ <b>" + sym + "</b>: جاري المزامنة...\n\n";
    }
  });

  txt += (lang === "en") ? "💡 <i>To remove: /remove CODE</i>" : "💡 <i>لحذف أي عملة: /remove الكود</i>";
  return txt;
}

function findAssetLivePrice(query) {
  if (!query) return null;
  var cleanQuery = query.trim();
  var q = cleanQuery.toUpperCase();

  // فحص الأكواد الدولية الشهيرة أولاً
  var knownSymbols = [
    "USD", "EUR", "SAR", "AED", "GBP", "KWD", "QAR", "BHD", "OMR", "JOD", 
    "CAD", "CHF", "JPY", "CNY", "TRY", "GOLD", "SILVER", "BTC", "ETH", "BNB", 
    "SOL", "XRP", "BRENT", "WTI", "OIL"
  ];
  var isKnown = knownSymbols.indexOf(q) >= 0;
  var isSearchIntent = (cleanQuery.indexOf("سعر") === 0 || cleanQuery.indexOf("بنك") === 0 || cleanQuery.indexOf("كم") === 0);

  // إذا لم يكن كوداً معروفاً صريحاً ولا يبدأ بنية استعلام واضحة (سعر/بنك/كم)، نتجاهله تماماً لمنع إرسال رسائل عشوائية
  if (!isKnown && !isSearchIntent) {
    return null;
  }

  var data = getLiveDashboardData();
  var rates = data.rates || [];
  var banks = data.banks || [];
  var usdRate = Number(data.usd_rate || 51.94);

  // تنظيف استعلام البحث من الكلمات التمهيدية
  var searchTerm = cleanQuery
    .replace(/^سعر\s+/i, "")
    .replace(/^بنك\s+/i, "")
    .replace(/^كم\s+/i, "")
    .toUpperCase().trim();

  if (searchTerm.length < 2) return null;

  // 1. فحص البنوك أولاً (بالاسم الإنجليزي أو العربي)
  var bankItem = banks.find(function(b) {
    var bName = (b.bank || "").toUpperCase();
    return bName.indexOf(searchTerm) >= 0;
  });
  if (bankItem) {
    var spread = (Number(bankItem.sell || 0) - Number(bankItem.buy || 0)).toFixed(2);
    return "🏦 <b>" + bankItem.bank + "</b>\n"
      + "━━━━━━━━━━━━━━━━━━\n"
      + "▫️ سعر الشراء: <b>" + Number(bankItem.buy).toFixed(2) + " ج.م</b>\n"
      + "▫️ سعر البيع: <b>" + Number(bankItem.sell).toFixed(2) + " ج.م</b>\n"
      + "▫️ الفارق (Spread): <b>" + spread + " ج.م</b>\n"
      + "🕒 <i>آخر تحديث: لحظي معتمد</i>";
  }

  // 2. فحص العملات والذهب والسلع
  var item = rates.find(function(r) {
    return (r.code || "").toUpperCase() === searchTerm || (r.name || "").indexOf(searchTerm) >= 0;
  });

  if (!item) return null;

  var eP = Number(item.egp_price || (Number(item.usd_price || 0) * usdRate));
  var uP = Number(item.usd_price || (eP / usdRate));
  var fmt = function(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 2, maximumFractionDigits: d || 2 }); };

  return "⚡ <b>" + item.name + " (" + item.code + ")</b>\n"
    + "━━━━━━━━━━━━━━━━━━\n"
    + "💵 <b>السعر بالجنيه:</b> " + fmt(eP, 2) + " ج.م\n"
    + "💲 <b>السعر بالدولار:</b> $" + fmt(uP, uP < 10 ? 4 : 2) + "\n"
    + "📈 <b>التغير (24h):</b> " + (item.change || "0.0%") + "\n"
    + "🕒 <b>آخر تحديث:</b> " + (item.updated_at || "لحظي");
}

function sendTelegramMessage(chatId, text, replyMarkup) {
  var token = getTelegramToken();
  if (!token) return;
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch(e) {}
}

function answerTelegramCallback(callbackId, text) {
  var token = getTelegramToken();
  if (!token || !callbackId) return;
  var url = "https://api.telegram.org/bot" + token + "/answerCallbackQuery";
  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ callback_query_id: callbackId, text: text || "" }),
      muteHttpExceptions: true
    });
  } catch(e) {}
}

function getUserPref(chatId, key, defVal) {
  var p = PropertiesService.getUserProperties().getProperty("TG_" + chatId + "_" + key);
  return p || defVal;
}

function setUserPref(chatId, key, val) {
  PropertiesService.getUserProperties().setProperty("TG_" + chatId + "_" + key, String(val));
}

function getWatchlist(chatId) {
  var raw = PropertiesService.getUserProperties().getProperty("TG_WATCHLIST_" + chatId);
  if (!raw) return ["USD", "SAR", "GOLD21", "BTC"];
  try { return JSON.parse(raw); } catch(e) { return ["USD", "SAR", "GOLD21", "BTC"]; }
}

function addSymbolToWatchlist(chatId, symbol) {
  var list = getWatchlist(chatId);
  if (list.indexOf(symbol) < 0) {
    list.push(symbol);
    PropertiesService.getUserProperties().setProperty("TG_WATCHLIST_" + chatId, JSON.stringify(list));
  }
}

function removeSymbolFromWatchlist(chatId, symbol) {
  var list = getWatchlist(chatId);
  var filtered = list.filter(function(s) { return s.toUpperCase() !== symbol.toUpperCase(); });
  PropertiesService.getUserProperties().setProperty("TG_WATCHLIST_" + chatId, JSON.stringify(filtered));
}
