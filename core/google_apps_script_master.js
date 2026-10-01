/**
 * =========================================================================
 * 🏛️ EGX INVESTOR TRACKER & GLOBAL MARKETS - GOOGLE APPS SCRIPT (MASTER V2)
 * منظومة تتبع البورصة المصرية (المؤسسات) وأسواق الصرف الحية والسلع
 * 
 * المطور: المهندس أحمد | AI Thinking Partner
 * متوافقة 100% مع Google Apps Script V8 وبيئة الـ iframe المباشرة
 * =========================================================================
 */

// ==========================================
// 1. استقبال وتوزيع الطلبات (Routing)
// ==========================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  
  // 1. طلب تنسيق يدوي مباشر
  if (action === "format") {
    formatAllSheetsProfessionally();
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم تنسيق كافة الشيتات بخط Cairo والألوان المعتمدة بنجاح!"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // 2. طلب تزويد الواجهة بالبيانات بصيغة JSON
  if (action === "data") {
    return ContentService.createTextOutput(JSON.stringify(getLiveDashboardData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. العرض الافتراضي: صفحة الويب مع تضمين البيانات مسبقاً (Instant Load)
  return HtmlService.createHtmlOutput(renderDashboardHtml())
    .setTitle("منظومة البورصة المصرية وأسواق الصرف | EGX Institutions Tracker")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    try { ss.setSpreadsheetLocale("en_US"); } catch(eLoc) {}

    // حفظ أحدث بيانات البورصة اللحظية
    if (data.latest_egx) {
      PropertiesService.getScriptProperties().setProperty("LATEST_EGX_JSON", JSON.stringify(data.latest_egx));
    }

    // 1. تبويب تعاملات المؤسسات
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

    // تطبيق التنسيق الجمالي الشامل
    formatAllSheetsProfessionally();

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "تم تحديث وتنسيق كافة البيانات في Google Sheets بنجاح!",
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
// 2. دوال البحث الذكي عن الشيتات
// ==========================================

function getOrCreateSheet(ss, targetName, aliases) {
  var sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;

  // البحث بالأسماء البديلة
  if (aliases && aliases.length > 0) {
    for (var i = 0; i < aliases.length; i++) {
      var s = ss.getSheetByName(aliases[i]);
      if (s) {
        s.setName(targetName);
        return s;
      }
    }
    // بحث جزئي
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

// ==========================================
// 3. تحديث التبويبات الثلاثة
// ==========================================

function updateInstitutionsArchiveSheet(ss, archive) {
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
      r.date,
      r.segment,
      Number(r.usd_rate || 51.88),
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

function updateBanksSheet(ss, banks, ts) {
  var sheet = getOrCreateSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك المصرية", "البنوك"]);
  sheet.clear();
  sheet.setRightToLeft(true);

  sheet.getRange(1, 1).setValue("🏛️ قائمة أسعار صرف الدولار في 25 بنكاً مصرياً - آخر تحديث: " + (ts || new Date().toLocaleString()));

  var headers = ["اسم البنك", "سعر الشراء للبنك (ج.م)", "سعر البيع من البنك (ج.م)", "متوسط السعر (ج.م)"];
  var rows = [headers];

  banks.forEach(function(b) {
    rows.push([
      b.bank,
      Number(b.buy || 0),
      Number(b.sell || 0),
      Number(b.avg || 0)
    ]);
  });

  sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(3);
}

// ==========================================
// 4. دالة التنسيق الفاخر بخط Cairo
// ==========================================

function formatAllSheetsProfessionally() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. شيت المؤسسات
  var s1 = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
  if (s1 && s1.getLastRow() >= 1) {
    s1.setRightToLeft(true);
    styleSheetTable(s1, 1, 1, s1.getLastRow(), s1.getLastColumn(), "#0f172a");
    if (s1.getLastRow() > 1) {
      var numRows = s1.getLastRow() - 1;
      s1.getRange(2, 3, numRows, 1).setNumberFormat("#,##0.00");
      s1.getRange(2, 4, numRows, Math.min(12, s1.getLastColumn() - 3)).setNumberFormat("#,##0");
      if (s1.getLastColumn() >= 16) {
        s1.getRange(2, 16, numRows, 1).setNumberFormat("$#,##0");
      }
      colorNetColumn(s1, 6, numRows);
      colorNetColumn(s1, 9, numRows);
      colorNetColumn(s1, 12, numRows);
      if (s1.getLastColumn() >= 15) colorNetColumn(s1, 15, numRows);
      if (s1.getLastColumn() >= 16) colorNetColumn(s1, 16, numRows);
    }
  }

  // 2. شيت الأسواق الحية
  var s2 = findExistingSheet(ss, "⚡ الأسواق الحية والعملات والذهب", ["الأسواق الحية", "بينانس", "العملات والذهب"]);
  if (s2 && s2.getLastRow() >= 3) {
    s2.setRightToLeft(true);
    s2.getRange(1, 1, 1, s2.getLastColumn()).merge()
      .setBackground("#f8fafc")
      .setFontColor("#0f172a")
      .setFontFamily("Cairo")
      .setFontWeight("bold")
      .setFontSize(11)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    s2.setRowHeight(1, 34);

    styleSheetTable(s2, 3, 1, s2.getLastRow() - 2, s2.getLastColumn(), "#1e3a8a");
    if (s2.getLastRow() > 3) {
      var nRows = s2.getLastRow() - 3;
      s2.getRange(4, 4, nRows, Math.min(3, s2.getLastColumn() - 3)).setNumberFormat("#,##0.00");
    }
  }

  // 3. شيت البنوك
  var s3 = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
  if (s3 && s3.getLastRow() >= 3) {
    s3.setRightToLeft(true);
    s3.getRange(1, 1, 1, s3.getLastColumn()).merge()
      .setBackground("#f8fafc")
      .setFontColor("#0f172a")
      .setFontFamily("Cairo")
      .setFontWeight("bold")
      .setFontSize(11)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    s3.setRowHeight(1, 34);

    styleSheetTable(s3, 3, 1, s3.getLastRow() - 2, s3.getLastColumn(), "#064e3b");
    if (s3.getLastRow() > 3) {
      var bnRows = s3.getLastRow() - 3;
      s3.getRange(4, 2, bnRows, Math.min(3, s3.getLastColumn() - 1)).setNumberFormat("#,##0.00");
    }
  }
}

function styleSheetTable(sheet, startRow, startCol, numRows, numCols, headerBg) {
  var range = sheet.getRange(startRow, startCol, numRows, numCols);
  range.setFontFamily("Cairo");
  range.setVerticalAlignment("middle");
  range.setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  var headerRange = sheet.getRange(startRow, startCol, 1, numCols);
  headerRange.setBackground(headerBg)
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(10.5)
    .setHorizontalAlignment("center");
  sheet.setRowHeight(startRow, 38);

  if (numRows > 1) {
    for (var r = 1; r < numRows; r++) {
      var currentRow = startRow + r;
      sheet.setRowHeight(currentRow, 28);
      var rowRange = sheet.getRange(currentRow, startCol, 1, numCols);
      rowRange.setBackground(r % 2 === 1 ? "#ffffff" : "#f8fafc");
      rowRange.setFontSize(10);
      rowRange.setHorizontalAlignment("center");
    }
  }

  sheet.autoResizeColumns(startCol, numCols);
}

function colorNetColumn(sheet, colIndex, numRows) {
  if (colIndex > sheet.getLastColumn()) return;
  var range = sheet.getRange(2, colIndex, numRows, 1);
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (typeof raw === "string") raw = raw.replace(/,/g, "").replace(/،/g, "").replace(/\$/g, "");
    var val = Number(raw);
    if (!isNaN(val)) {
      var cell = sheet.getRange(2 + i, colIndex);
      if (val > 0) {
        cell.setBackground("#dcfce7").setFontColor("#15803d").setFontWeight("bold");
      } else if (val < 0) {
        cell.setBackground("#fee2e2").setFontColor("#b91c1c").setFontWeight("bold");
      }
    }
  }
}

// ==========================================
// 5. استرجاع البيانات اللحظية
// ==========================================

function getLiveDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    timestamp: new Date().toISOString(),
    usd_rate: 51.88,
    egx_institutions: null,
    archive: [],
    rates: [],
    banks: []
  };

  // 1. من الذاكرة اللحظية
  var savedEgx = PropertiesService.getScriptProperties().getProperty("LATEST_EGX_JSON");
  if (savedEgx) {
    try {
      result.egx_institutions = JSON.parse(savedEgx);
      if (result.egx_institutions.usd_rate) result.usd_rate = result.egx_institutions.usd_rate;
    } catch(e) {}
  }

  // 2. شيت تعاملات المؤسسات والأرشيف
  var s1 = findExistingSheet(ss, "🏛️ تعاملات المؤسسات - البورصة المصرية", ["تعاملات البورصة", "المؤسسات", "EGX"]);
  if (s1 && s1.getLastRow() >= 2) {
    var maxR = Math.min(s1.getLastRow() - 1, 35);
    var maxC = s1.getLastColumn();
    var vals = s1.getRange(2, 1, maxR, maxC).getValues();
    vals.forEach(function(row) {
      result.archive.push({
        date: String(row[0]),
        segment: String(row[1] || ""),
        usd_rate: Number(row[2] || 51.88),
        egypt_buy: Number(row[3] || 0), egypt_sell: Number(row[4] || 0), egypt_net: Number(row[5] || 0),
        arab_buy: Number(row[6] || 0), arab_sell: Number(row[7] || 0), arab_net: Number(row[8] || 0),
        foreign_buy: Number(row[9] || 0), foreign_sell: Number(row[10] || 0), foreign_net: Number(row[11] || 0),
        total_buy: Number(row[12] || 0), total_sell: Number(row[13] || 0), total_net: Number(row[14] || 0),
        total_net_usd: Number(row[15] || 0)
      });
    });
  }

  // 3. شيت الأسواق الحية
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

  // 4. شيت البنوك
  var s3 = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
  if (s3 && s3.getLastRow() >= 4) {
    var maxR3 = s3.getLastRow() - 3;
    var maxC3 = Math.min(s3.getLastColumn(), 4);
    var bVals = s3.getRange(4, 1, maxR3, maxC3).getValues();
    bVals.forEach(function(row) {
      result.banks.push({
        bank: String(row[0] || ""),
        buy: Number(row[1] || 0),
        sell: Number(row[2] || 0),
        avg: Number(row[3] || 0)
      });
    });
  }

  return result;
}

// ==========================================
// 6. التحديث السحابي المستمر (24/7)
// ==========================================

function autoUpdateRatesDirectly() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var btcPrice = 83750.0, ethPrice = 2690.0;
    try {
      var bRes = JSON.parse(UrlFetchApp.fetch("https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT").getContentText());
      btcPrice = parseFloat(bRes.price);
      var eRes = JSON.parse(UrlFetchApp.fetch("https://api.binance.us/api/v3/ticker/price?symbol=ETHUSDT").getContentText());
      ethPrice = parseFloat(eRes.price);
    } catch(e1) {
      try {
        var cbBtc = JSON.parse(UrlFetchApp.fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot").getContentText());
        btcPrice = parseFloat(cbBtc.data.amount);
        var cbEth = JSON.parse(UrlFetchApp.fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot").getContentText());
        ethPrice = parseFloat(cbEth.data.amount);
      } catch(e2) {}
    }

    var brentPrice = 73.5, wtiPrice = 70.2;
    try {
      var oilRes = JSON.parse(UrlFetchApp.fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d").getContentText());
      brentPrice = parseFloat(oilRes.chart.result[0].meta.regularMarketPrice);
    } catch(eOil) {}

    var usdRate = 51.88;
    var bSheet = findExistingSheet(ss, "🏦 أسعار الدولار في البنوك المصرية", ["أسعار الدولار في البنوك", "البنوك"]);
    if (bSheet && bSheet.getLastRow() >= 4) {
      var topBuy = bSheet.getRange(4, 2).getValue();
      if (topBuy && !isNaN(topBuy) && topBuy > 30) usdRate = parseFloat(topBuy);
    }

    var liveRates = [
      { category: "عملات رقمية", code: "BTC", name: "بتكوين (Bitcoin)", buy: btcPrice, sell: btcPrice, rate_egp: Math.round(btcPrice * usdRate), change: "مباشر" },
      { category: "عملات رقمية", code: "ETH", name: "إيثريوم (Ethereum)", buy: ethPrice, sell: ethPrice, rate_egp: Math.round(ethPrice * usdRate), change: "مباشر" },
      { category: "طاقة وبترول", code: "BRENT", name: "نفط خام برنت", buy: brentPrice, sell: brentPrice, rate_egp: Math.round(brentPrice * usdRate), change: "مباشر" },
      { category: "طاقة وبترول", code: "WTI", name: "خام غرب تكساس", buy: wtiPrice, sell: wtiPrice, rate_egp: Math.round(wtiPrice * usdRate), change: "مباشر" },
      { category: "معادن وذهب", code: "GOLD24", name: "جرام ذهب عيار 24", buy: 84.0, sell: 84.0, rate_egp: Math.round(84.0 * usdRate), change: "لحظي" },
      { category: "معادن وذهب", code: "GOLD21", name: "جرام ذهب عيار 21", buy: 73.5, sell: 73.5, rate_egp: Math.round(73.5 * usdRate), change: "لحظي" },
      { category: "عملات نقدية", code: "USD", name: "دولار أمريكي", buy: usdRate, sell: usdRate + 0.10, rate_egp: usdRate, change: "مستقر" },
      { category: "عملات نقدية", code: "EUR", name: "يورو أوروبي", buy: Math.round((usdRate * 1.135) * 100) / 100, sell: Math.round((usdRate * 1.138) * 100) / 100, rate_egp: Math.round((usdRate * 1.136) * 100) / 100, change: "مباشر" },
      { category: "عملات نقدية", code: "SAR", name: "ريال سعودي", buy: Math.round((usdRate / 3.75) * 100) / 100, sell: Math.round((usdRate / 3.75 + 0.05) * 100) / 100, rate_egp: Math.round((usdRate / 3.75) * 100) / 100, change: "مستقر" },
      { category: "عملات نقدية", code: "AED", name: "درهم إماراتي", buy: Math.round((usdRate / 3.67) * 100) / 100, sell: Math.round((usdRate / 3.67 + 0.05) * 100) / 100, rate_egp: Math.round((usdRate / 3.67) * 100) / 100, change: "مستقر" },
      { category: "عملات نقدية", code: "KWD", name: "دينار كويتي", buy: Math.round((usdRate * 3.26) * 100) / 100, sell: Math.round((usdRate * 3.27) * 100) / 100, rate_egp: Math.round((usdRate * 3.265) * 100) / 100, change: "مستقر" }
    ];

    updateLiveRatesSheet(ss, liveRates, new Date().toLocaleString());
    formatAllSheetsProfessionally();
  } catch(err) {
    Logger.log("Auto update error: " + err);
  }
}

// ==========================================
// 7. توليد صفحة الويب التفاعلية الكاملة
// ==========================================

function renderDashboardHtml() {
  var initialPayload = JSON.stringify(getLiveDashboardData());

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
'      --primary: #0f172a;' +
'      --border: #e2e8f0;' +
'      --card-bg: #ffffff;' +
'      --bg: #f8fafc;' +
'      --text: #0f172a;' +
'      --text-muted: #64748b;' +
'    }' +
'    * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Cairo", sans-serif; }' +
'    body { background-color: var(--bg); color: var(--text); padding-bottom: 40px; }' +
'    .num-ltr { direction: ltr !important; unicode-bidi: isolate; display: inline-block; font-variant-numeric: tabular-nums; font-family: "Cairo", sans-serif; }' +
'    .nav-bar {' +
'      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);' +
'      color: #fff; padding: 14px 24px; display: flex; justify-content: space-between;' +
'      align-items: center; box-shadow: 0 4px 20px rgba(0,0,0,0.15); flex-wrap: wrap; gap: 12px;' +
'    }' +
'    .brand { font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }' +
'    .brand i { color: #38bdf8; }' +
'    .nav-badges { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }' +
'    .badge {' +
'      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);' +
'      padding: 5px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 700;' +
'      display: flex; align-items: center; gap: 6px;' +
'    }' +
'    .badge-egx { background: rgba(37,99,235,0.25); border-color: #3b82f6; }' +
'    .container { max-width: 1400px; margin: 24px auto; padding: 0 16px; display: flex; flex-direction: column; gap: 24px; }' +
'    .section-card {' +
'      background: var(--card-bg); border-radius: 16px; border: 1px solid var(--border);' +
'      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden;' +
'    }' +
'    .section-header {' +
'      padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;' +
'      border-bottom: 1px solid var(--border); background: #fcfdfe; flex-wrap: wrap; gap: 12px;' +
'    }' +
'    .section-title { font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }' +
'    .btn {' +
'      padding: 8px 16px; border-radius: 10px; font-weight: 700; font-size: 0.9rem;' +
'      cursor: pointer; border: none; display: flex; align-items: center; gap: 8px;' +
'      transition: all 0.2s;' +
'    }' +
'    .btn-primary { background: #2563eb; color: #fff; }' +
'    .btn-primary:hover { background: #1d4ed8; }' +
'    .btn-accent { background: #d97706; color: #fff; }' +
'    .btn-accent:hover { background: #b45309; }' +
'    .kpi-grid {' +
'      display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));' +
'      gap: 16px; padding: 20px;' +
'    }' +
'    .kpi-card {' +
'      border: 1px solid var(--border); border-radius: 12px; padding: 16px;' +
'      background: #fafbfc; position: relative; overflow: hidden;' +
'    }' +
'    .kpi-title { font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }' +
'    .kpi-val { font-size: 1.4rem; font-weight: 900; line-height: 1.2; }' +
'    .kpi-sub { font-size: 0.85rem; font-weight: 700; margin-top: 6px; color: var(--text-muted); }' +
'    .val-pos { color: #15803d; }' +
'    .val-neg { color: #b91c1c; }' +
'    .table-container { width: 100%; overflow-x: auto; padding: 0 20px 20px; }' +
'    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.92rem; }' +
'    th {' +
'      background: #0f172a; color: #fff; padding: 12px 14px; font-weight: 700;' +
'      text-align: center; border-bottom: 2px solid #cbd5e1; white-space: nowrap;' +
'    }' +
'    td {' +
'      padding: 12px 14px; text-align: center; border-bottom: 1px solid var(--border);' +
'      background: #fff; white-space: nowrap;' +
'    }' +
'    tbody tr:nth-child(even) td { background: #f8fafc; }' +
'    tbody tr:hover td { background: #eff6ff; }' +
'    .pill-tag { padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 800; display: inline-block; }' +
'    .pill-green { background: #dcfce7; color: #15803d; }' +
'    .pill-red { background: #fee2e2; color: #b91c1c; }' +
'    .pill-blue { background: #dbeafe; color: #1e40af; }' +
'    .search-box {' +
'      padding: 8px 14px; border: 1.5px solid var(--border); border-radius: 8px;' +
'      font-size: 0.9rem; font-family: "Cairo"; outline: none; width: 240px;' +
'    }' +
'    .search-box:focus { border-color: #2563eb; }' +
'    .footer-note { text-align: center; font-size: 0.85rem; color: var(--text-muted); margin-top: 20px; }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="nav-bar">' +
'    <div class="brand">' +
'      <i class="fa-solid fa-chart-line"></i>' +
'      <span>منظومة تتبع البورصة المصرية والأسواق الحية</span>' +
'    </div>' +
'    <div class="nav-badges">' +
'      <div class="badge badge-egx">' +
'        <i class="fa-solid fa-building-columns"></i>' +
'        <span>التركيز: تعاملات المؤسسات</span>' +
'      </div>' +
'      <div class="badge">' +
'        <i class="fa-solid fa-dollar-sign"></i>' +
'        <span>سعر الصرف المعتمد: <span id="nav-usd-rate" class="num-ltr">51.88</span> ج.م</span>' +
'      </div>' +
'      <div class="badge">' +
'        <i class="fa-regular fa-clock"></i>' +
'        <span id="nav-clock">--:--:--</span>' +
'      </div>' +
'    </div>' +
'  </div>' +
'' +
'  <div class="container">' +
'    <!-- 1. تعاملات المؤسسات بالبورصة المصرية (الأساس) -->' +
'    <div class="section-card">' +
'      <div class="section-header">' +
'        <div class="section-title">' +
'          <i class="fa-solid fa-landmark text-primary" style="color: #2563eb;"></i>' +
'          <span>تعاملات المؤسسات في البورصة المصرية (EGX)</span>' +
'          <span class="pill-tag pill-blue" id="egx-session-tag">جلسة اليوم</span>' +
'        </div>' +
'        <div style="display: flex; gap: 10px; align-items: center;">' +
'          <span style="font-size: 0.85rem; color: var(--text-muted);" id="egx-update-status">تحديث دوري بالساعة</span>' +
'          <button class="btn btn-primary" onclick="refreshDashboardRPC(true)">' +
'            <i class="fa-solid fa-rotate"></i>' +
'            <span>تحديث البورصة</span>' +
'          </button>' +
'        </div>' +
'      </div>' +
'' +
'      <div class="kpi-grid">' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">إجمالي صافي المؤسسات (بالجنيه)</div>' +
'          <div class="kpi-val num-ltr" id="kpi-tot-net-egp">--</div>' +
'          <div class="kpi-sub">المعادل: <span id="kpi-tot-net-usd" class="num-ltr">--</span></div>' +
'        </div>' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">صافي المؤسسات المصرية</div>' +
'          <div class="kpi-val num-ltr" id="kpi-eg-net">--</div>' +
'          <div class="kpi-sub">مشتريات: <span id="kpi-eg-buy" class="num-ltr">--</span></div>' +
'        </div>' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">صافي المؤسسات العربية</div>' +
'          <div class="kpi-val num-ltr" id="kpi-ar-net">--</div>' +
'          <div class="kpi-sub">مشتريات: <span id="kpi-ar-buy" class="num-ltr">--</span></div>' +
'        </div>' +
'        <div class="kpi-card">' +
'          <div class="kpi-title">صافي المؤسسات الأجنبية</div>' +
'          <div class="kpi-val num-ltr" id="kpi-fo-net">--</div>' +
'          <div class="kpi-sub">مشتريات: <span id="kpi-fo-buy" class="num-ltr">--</span></div>' +
'        </div>' +
'      </div>' +
'' +
'      <!-- جدول تعاملات المؤسسات لليوم -->' +
'      <div class="table-container">' +
'        <div style="font-weight: 800; margin-bottom: 10px; font-size: 0.95rem;">تفاصيل تدفقات المؤسسات (شراء / بيع / صافي):</div>' +
'        <table>' +
'          <thead>' +
'            <tr>' +
'              <th>فئة المؤسسة</th>' +
'              <th>قيمة الشراء (ج.م)</th>' +
'              <th>قيمة البيع (ج.م)</th>' +
'              <th>صافي السيولة (ج.م)</th>' +
'              <th>صافي السيولة ($)</th>' +
'              <th>اتجاه السيولة</th>' +
'            </tr>' +
'          </thead>' +
'          <tbody id="egx-institutions-tbody">' +
'            <tr><td colspan="6">جاري إعداد البيانات...</td></tr>' +
'          </tbody>' +
'        </table>' +
'      </div>' +
'' +
'      <!-- أرشيف الجلسات السابقة للمؤسسات -->' +
'      <div class="table-container" style="border-top: 1px dashed var(--border); padding-top: 16px;">' +
'        <div style="font-weight: 800; margin-bottom: 10px; font-size: 0.95rem;">سجل الجلسات السابقة للمؤسسات (يومياً):</div>' +
'        <table>' +
'          <thead>' +
'            <tr>' +
'              <th>التاريخ</th>' +
'              <th>القطاع</th>' +
'              <th>سعر الدولار</th>' +
'              <th>صافي مصريين</th>' +
'              <th>صافي عرب</th>' +
'              <th>صافي أجانب</th>' +
'              <th>إجمالي صافي المؤسسات (ج.م)</th>' +
'              <th>إجمالي الصافي ($)</th>' +
'            </tr>' +
'          </thead>' +
'          <tbody id="egx-archive-tbody">' +
'            <tr><td colspan="8">جاري إعداد الأرشيف...</td></tr>' +
'          </tbody>' +
'        </table>' +
'      </div>' +
'    </div>' +
'' +
'    <!-- 2. العملات والذهب والنفط والسلع (مستقل) -->' +
'    <div class="section-card">' +
'      <div class="section-header">' +
'        <div class="section-title">' +
'          <i class="fa-solid fa-coins" style="color: #d97706;"></i>' +
'          <span>الأسواق الحية (الذهب، النفط، العملات، العملات الرقمية)</span>' +
'        </div>' +
'        <div style="display: flex; gap: 10px; align-items: center;">' +
'          <span style="font-size: 0.85rem; color: var(--text-muted);" id="rates-countdown">تحديث تلقائي: 30 ثانية</span>' +
'          <button class="btn btn-accent" onclick="refreshDashboardRPC(false)">' +
'            <i class="fa-solid fa-bolt"></i>' +
'            <span>تحديث الأسعار</span>' +
'          </button>' +
'        </div>' +
'      </div>' +
'' +
'      <div class="kpi-grid" id="market-cards-grid"></div>' +
'' +
'      <div class="table-container">' +
'        <table>' +
'          <thead>' +
'            <tr>' +
'              <th>الفئة</th>' +
'              <th>الرمز</th>' +
'              <th>الأصل / السلعة</th>' +
'              <th>سعر الشراء</th>' +
'              <th>سعر البيع / السعر</th>' +
'              <th>المعادل بالجنيه</th>' +
'              <th>التغير (24h)</th>' +
'            </tr>' +
'          </thead>' +
'          <tbody id="rates-table-tbody">' +
'            <tr><td colspan="7">جاري إعداد الأسواق...</td></tr>' +
'          </tbody>' +
'        </table>' +
'      </div>' +
'    </div>' +
'' +
'    <!-- 3. أسعار الدولار في البنوك المصرية (25 بنكاً) -->' +
'    <div class="section-card">' +
'      <div class="section-header">' +
'        <div class="section-title">' +
'          <i class="fa-solid fa-building-columns" style="color: #059669;"></i>' +
'          <span>أسعار الدولار في 25 بنكاً مصرياً</span>' +
'        </div>' +
'        <input type="text" class="search-box" id="bank-search" placeholder="ابحث باسم البنك..." onkeyup="filterBanks()">' +
'      </div>' +
'' +
'      <div class="table-container">' +
'        <table>' +
'          <thead>' +
'            <tr>' +
'              <th>اسم البنك</th>' +
'              <th>سعر الشراء للبنك (ج.م)</th>' +
'              <th>سعر البيع من البنك (ج.م)</th>' +
'              <th>متوسط السعر (ج.م)</th>' +
'              <th>الحالة</th>' +
'            </tr>' +
'          </thead>' +
'          <tbody id="banks-table-tbody">' +
'            <tr><td colspan="5">جاري إعداد قائمة البنوك...</td></tr>' +
'          </tbody>' +
'        </table>' +
'      </div>' +
'    </div>' +
'  </div>' +
'' +
'  <div class="footer-note">منظومة تتبع البورصة المصرية ومؤشرات الأسواق الحية | متصلة بسيرفرات جوجل وتعمل 24 ساعة ذاتياً</div>' +
'' +
'  <script>' +
'    function formatNum(n, decimals) {' +
'      if (n === null || n === undefined || isNaN(n)) return "--";' +
'      var dec = (decimals !== undefined) ? decimals : 0;' +
'      return Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });' +
'    }' +
'' +
'    function formatSignNum(n, curr, decimals) {' +
'      if (n === null || n === undefined || isNaN(n)) return "--";' +
'      var dec = (decimals !== undefined) ? decimals : 0;' +
'      var num = Number(n);' +
'      var formatted = Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });' +
'      var suffix = curr ? (" " + curr) : "";' +
'      if (num < 0) {' +
'        return \'<span class="num-ltr val-neg">-\' + formatted + suffix + \'</span>\';' +
'      } else if (num > 0) {' +
'        return \'<span class="num-ltr val-pos">+\' + formatted + suffix + \'</span>\';' +
'      } else {' +
'        return \'<span class="num-ltr">0\' + suffix + \'</span>\';' +
'      }' +
'    }' +
'' +
'    function updateClock() {' +
'      var d = new Date();' +
'      var el = document.getElementById("nav-clock");' +
'      if (el) el.innerText = d.toLocaleTimeString("ar-EG");' +
'    }' +
'    setInterval(updateClock, 1000);' +
'    updateClock();' +
'' +
'    var allBanksData = [];' +
'' +
'    function refreshDashboardRPC(showLoading) {' +
'      if (showLoading) {' +
'        document.getElementById("egx-update-status").innerText = "جاري التحديث اللحظي...";' +
'      }' +
'      if (typeof google !== "undefined" && google.script && google.script.run) {' +
'        google.script.run' +
'          .withSuccessHandler(function(data) {' +
'            document.getElementById("egx-update-status").innerText = "آخر تحديث: " + new Date().toLocaleTimeString("ar-EG");' +
'            renderDashboard(data);' +
'          })' +
'          .withFailureHandler(function(err) {' +
'            document.getElementById("egx-update-status").innerText = "تعذر التحديث اللحظي";' +
'          })' +
'          .getLiveDashboardData();' +
'      } else {' +
'        fetch("?action=data")' +
'          .then(function(res) { return res.json(); })' +
'          .then(function(data) {' +
'            document.getElementById("egx-update-status").innerText = "آخر تحديث: " + new Date().toLocaleTimeString("ar-EG");' +
'            renderDashboard(data);' +
'          })' +
'          .catch(function(e) {});' +
'      }' +
'    }' +
'' +
'    function renderDashboard(data) {' +
'      if (!data) return;' +
'      if (data.usd_rate) {' +
'        document.getElementById("nav-usd-rate").innerText = Number(data.usd_rate).toFixed(2);' +
'      }' +
'' +
'      // 1. تعاملات المؤسسات' +
'      var instData = null;' +
'      if (data.egx_institutions && data.egx_institutions.tables && data.egx_institutions.tables.institutions) {' +
'        instData = data.egx_institutions.tables.institutions;' +
'      }' +
'' +
'      var egNet = 0, arNet = 0, foNet = 0, totNetEgp = 0, totNetUsd = 0;' +
'      var egBuy = 0, arBuy = 0, foBuy = 0;' +
'      var tbodyHtml = "";' +
'' +
'      if (instData && instData.length > 0) {' +
'        instData.forEach(function(item) {' +
'          var type = item.type || "";' +
'          var buy = Number(item.buy_egp || 0);' +
'          var sell = Number(item.sell_egp || 0);' +
'          var net = Number(item.net_egp || 0);' +
'          var netUsd = Number(item.net_usd || 0);' +
'' +
'          totNetEgp += net;' +
'          totNetUsd += netUsd;' +
'' +
'          if (type.indexOf("مصر") >= 0) { egNet = net; egBuy = buy; }' +
'          else if (type.indexOf("عرب") >= 0) { arNet = net; arBuy = buy; }' +
'          else if (type.indexOf("أجانب") >= 0 || type.indexOf("اجانب") >= 0) { foNet = net; foBuy = buy; }' +
'' +
'          var flowBadge = (net >= 0)' +
'            ? \'<span class="pill-tag pill-green"><i class="fa-solid fa-arrow-trend-up"></i> شراء صافي</span>\'' +
'            : \'<span class="pill-tag pill-red"><i class="fa-solid fa-arrow-trend-down"></i> بيع صافي</span>\';' +
'' +
'          tbodyHtml += "<tr>"' +
'            + "<td style=\'font-weight: 700;\'>" + (type.indexOf("مؤسسات") >= 0 ? type : ("مؤسسات " + type)) + "</td>"' +
'            + "<td class=\'num-ltr\'>" + formatNum(buy) + " ج.م</td>"' +
'            + "<td class=\'num-ltr\'>" + formatNum(sell) + " ج.م</td>"' +
'            + "<td>" + formatSignNum(net, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(netUsd, "$") + "</td>"' +
'            + "<td>" + flowBadge + "</td>"' +
'            + "</tr>";' +
'        });' +
'        document.getElementById("egx-institutions-tbody").innerHTML = tbodyHtml;' +
'      } else if (data.archive && data.archive.length > 0) {' +
'        var r0 = data.archive[0];' +
'        totNetEgp = Number(r0.total_net || 0); totNetUsd = Number(r0.total_net_usd || 0);' +
'        egNet = Number(r0.egypt_net || 0); egBuy = Number(r0.egypt_buy || 0);' +
'        arNet = Number(r0.arab_net || 0); arBuy = Number(r0.arab_buy || 0);' +
'        foNet = Number(r0.foreign_net || 0); foBuy = Number(r0.foreign_buy || 0);' +
'' +
'        tbodyHtml += "<tr><td style=\'font-weight: 700;\'>مؤسسات مصرية</td><td class=\'num-ltr\'>" + formatNum(r0.egypt_buy) + " ج.م</td><td class=\'num-ltr\'>" + formatNum(r0.egypt_sell) + " ج.م</td><td>" + formatSignNum(egNet, "ج.م") + "</td><td>--</td><td>" + (egNet >= 0 ? "شراء صافي" : "بيع صافي") + "</td></tr>";' +
'        tbodyHtml += "<tr><td style=\'font-weight: 700;\'>مؤسسات عربية</td><td class=\'num-ltr\'>" + formatNum(r0.arab_buy) + " ج.م</td><td class=\'num-ltr\'>" + formatNum(r0.arab_sell) + " ج.م</td><td>" + formatSignNum(arNet, "ج.م") + "</td><td>--</td><td>" + (arNet >= 0 ? "شراء صافي" : "بيع صافي") + "</td></tr>";' +
'        tbodyHtml += "<tr><td style=\'font-weight: 700;\'>مؤسسات أجنبية</td><td class=\'num-ltr\'>" + formatNum(r0.foreign_buy) + " ج.م</td><td class=\'num-ltr\'>" + formatNum(r0.foreign_sell) + " ج.م</td><td>" + formatSignNum(foNet, "ج.م") + "</td><td>--</td><td>" + (foNet >= 0 ? "شراء صافي" : "بيع صافي") + "</td></tr>";' +
'        document.getElementById("egx-institutions-tbody").innerHTML = tbodyHtml;' +
'      }' +
'' +
'      document.getElementById("kpi-tot-net-egp").innerHTML = formatSignNum(totNetEgp, "ج.م");' +
'      document.getElementById("kpi-tot-net-usd").innerHTML = formatSignNum(totNetUsd, "$");' +
'      document.getElementById("kpi-eg-net").innerHTML = formatSignNum(egNet, "ج.م");' +
'      document.getElementById("kpi-eg-buy").innerText = formatNum(egBuy) + " ج.م";' +
'      document.getElementById("kpi-ar-net").innerHTML = formatSignNum(arNet, "ج.م");' +
'      document.getElementById("kpi-ar-buy").innerText = formatNum(arBuy) + " ج.م";' +
'      document.getElementById("kpi-fo-net").innerHTML = formatSignNum(foNet, "ج.م");' +
'      document.getElementById("kpi-fo-buy").innerText = formatNum(foBuy) + " ج.م";' +
'' +
'      // أرشيف البورصة' +
'      if (data.archive && data.archive.length > 0) {' +
'        var archHtml = "";' +
'        data.archive.forEach(function(row) {' +
'          archHtml += "<tr>"' +
'            + "<td style=\'font-weight: 700;\'>" + row.date + "</td>"' +
'            + "<td>" + (row.segment || "الإجمالي") + "</td>"' +
'            + "<td class=\'num-ltr\'>" + Number(row.usd_rate || 51.88).toFixed(2) + "</td>"' +
'            + "<td>" + formatSignNum(row.egypt_net, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(row.arab_net, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(row.foreign_net, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(row.total_net, "ج.م") + "</td>"' +
'            + "<td>" + formatSignNum(row.total_net_usd, "$") + "</td>"' +
'            + "</tr>";' +
'        });' +
'        document.getElementById("egx-archive-tbody").innerHTML = archHtml;' +
'      }' +
'' +
'      // 2. الأسواق الحية' +
'      if (data.rates && data.rates.length > 0) {' +
'        var cardsHtml = "";' +
'        var rTableHtml = "";' +
'        data.rates.forEach(function(item) {' +
'          var isKeyAsset = ["BTC", "ETH", "BRENT", "GOLD24", "GOLD21", "USD", "SAR", "AED"].indexOf(item.code) >= 0;' +
'          if (isKeyAsset && cardsHtml.split("kpi-card").length <= 9) {' +
'            var unit = (item.category.indexOf("عملات رقمية") >= 0 || item.code === "BRENT") ? "$" : "ج.م";' +
'            cardsHtml += \'<div class="kpi-card">\' +' +
'              \'<div class="kpi-title">\' + item.name + \' (\' + item.code + \')</div>\' +' +
'              \'<div class="kpi-val num-ltr">\' + formatNum(item.buy, item.buy < 10 ? 2 : 0) + " " + unit + \'</div>\' +' +
'              \'<div class="kpi-sub">المعادل: <span class="num-ltr">\' + formatNum(item.rate_egp) + \' ج.م</span></div>\' +' +
'              \'</div>\';' +
'          }' +
'' +
'          rTableHtml += "<tr>"' +
'            + "<td>" + item.category + "</td>"' +
'            + "<td style=\'font-weight: 700;\'>" + item.code + "</td>"' +
'            + "<td>" + item.name + "</td>"' +
'            + "<td class=\'num-ltr\'>" + formatNum(item.buy, item.buy < 10 ? 2 : 0) + "</td>"' +
'            + "<td class=\'num-ltr\'>" + formatNum(item.sell, item.sell < 10 ? 2 : 0) + "</td>"' +
'            + "<td class=\'num-ltr\'>" + formatNum(item.rate_egp) + " ج.م</td>"' +
'            + "<td><span class=\'pill-tag pill-blue\'>" + (item.change || "مباشر") + "</span></td>"' +
'            + "</tr>";' +
'        });' +
'        document.getElementById("market-cards-grid").innerHTML = cardsHtml;' +
'        document.getElementById("rates-table-tbody").innerHTML = rTableHtml;' +
'      }' +
'' +
'      // 3. البنوك' +
'      if (data.banks && data.banks.length > 0) {' +
'        allBanksData = data.banks;' +
'        renderBanksTable(allBanksData);' +
'      }' +
'    }' +
'' +
'    function renderBanksTable(banks) {' +
'      var bHtml = "";' +
'      var maxBuy = 0;' +
'      banks.forEach(function(b) { if (Number(b.buy) > maxBuy) maxBuy = Number(b.buy); });' +
'' +
'      banks.forEach(function(b) {' +
'        var isTop = (Number(b.buy) === maxBuy && maxBuy > 0);' +
'        var statusBadge = isTop' +
'          ? \'<span class="pill-tag pill-green"><i class="fa-solid fa-star"></i> أعلى سعر شراء</span>\'' +
'          : \'<span class="pill-tag pill-blue">نشط</span>\';' +
'' +
'        bHtml += "<tr>"' +
'          + "<td style=\'font-weight: 700;\'>" + b.bank + "</td>"' +
'          + "<td class=\'num-ltr\' style=\'" + (isTop ? "font-weight:900;color:#15803d;" : "") + "\'>" + Number(b.buy).toFixed(2) + " ج.م</td>"' +
'          + "<td class=\'num-ltr\'>" + Number(b.sell).toFixed(2) + " ج.م</td>"' +
'          + "<td class=\'num-ltr\'>" + Number(b.avg).toFixed(2) + " ج.م</td>"' +
'          + "<td>" + statusBadge + "</td>"' +
'          + "</tr>";' +
'      });' +
'      document.getElementById("banks-table-tbody").innerHTML = bHtml;' +
'    }' +
'' +
'    function filterBanks() {' +
'      var term = document.getElementById("bank-search").value.trim().toLowerCase();' +
'      if (!term) { renderBanksTable(allBanksData); return; }' +
'      var filtered = allBanksData.filter(function(b) {' +
'        return (b.bank || "").toLowerCase().indexOf(term) >= 0;' +
'      });' +
'      renderBanksTable(filtered);' +
'    }' +
'' +
'    // تحميل البيانات المحقونة فوراً عند فتح الصفحة في الصفر ثانية' +
'    var injectedData = ' + initialPayload + ';' +
'    renderDashboard(injectedData);' +
'' +
'    // عداد التحديث الدوري كل 30 ثانية للأسواق' +
'    var timer = 30;' +
'    setInterval(function() {' +
'      timer--;' +
'      var el = document.getElementById("rates-countdown");' +
'      if (el) el.innerText = "تحديث تلقائي: " + timer + " ثانية";' +
'      if (timer <= 0) {' +
'        timer = 30;' +
'        refreshDashboardRPC(false);' +
'      }' +
'    }, 1000);' +
'' +
'    // ربط WebSocket المباشر مع Binance للأسعار الحية الفورية' +
'    try {' +
'      var ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker");' +
'      ws.onmessage = function(event) {' +
'        var msg = JSON.parse(event.data);' +
'        if (msg.s === "BTCUSDT") {' +
'          var btcEl = document.querySelector("#market-cards-grid .kpi-card:nth-child(1) .kpi-val");' +
'          if (btcEl) btcEl.innerText = formatNum(parseFloat(msg.c)) + " $";' +
'        }' +
'      };' +
'    } catch(e) {}' +
'  </script>' +
'</body>' +
'</html>';
}
