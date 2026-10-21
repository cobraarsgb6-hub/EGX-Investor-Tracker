import time
import json
import os
import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from curl_cffi import requests
from lxml import html

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_FILE = os.path.join(BASE_DIR, "data", "ta3weem_rates.json")
TA3WEEM_CACHE_TTL = 1800  # 30 minutes cache to avoid excessive scraping & TLS blocks

CURRENCY_METADATA = {
    "USD": {"name": "دولار أمريكي (USD)", "name_ar": "دولار أمريكي", "flag": "🇺🇸"},
    "EUR": {"name": "يورو أوروبي (EUR)", "name_ar": "يورو أوروبي", "flag": "🇪🇺"},
    "GBP": {"name": "جنيه إسترليني (GBP)", "name_ar": "جنيه إسترليني", "flag": "🇬🇧"},
    "SAR": {"name": "ريال سعودي (SAR)", "name_ar": "ريال سعودي", "flag": "🇸🇦"},
    "AED": {"name": "درهم إماراتي (AED)", "name_ar": "درهم إماراتي", "flag": "🇦🇪"},
    "QAR": {"name": "ريال قطري (QAR)", "name_ar": "ريال قطري", "flag": "🇶🇦"},
    "KWD": {"name": "دينار كويتي (KWD)", "name_ar": "دينار كويتي", "flag": "🇰🇼"},
    "BHD": {"name": "دينار بحريني (BHD)", "name_ar": "دينار بحريني", "flag": "🇧🇭"},
    "JPY": {"name": "ين ياباني (JPY)", "name_ar": "ين ياباني (100)", "flag": "🇯🇵"},
    "JOD": {"name": "دينار أردني (JOD)", "name_ar": "دينار أردني", "flag": "🇯🇴"},
    "OMR": {"name": "ريال عماني (OMR)", "name_ar": "ريال عماني", "flag": "🇴🇲"},
    "CHF": {"name": "فرنك سويسري (CHF)", "name_ar": "فرنك سويسري", "flag": "🇨🇭"},
    "SEK": {"name": "كرونة سويدية (SEK)", "name_ar": "كرونة سويدية", "flag": "🇸🇪"},
    "NOK": {"name": "كرونة نرويجية (NOK)", "name_ar": "كرونة نرويجية", "flag": "🇳🇴"},
    "DKK": {"name": "كرونة دانماركية (DKK)", "name_ar": "كرونة دانماركية", "flag": "🇩🇰"},
    "CNY": {"name": "يوان صيني (CNY)", "name_ar": "يوان صيني", "flag": "🇨🇳"},
    "CAD": {"name": "دولار كندي (CAD)", "name_ar": "دولار كندي", "flag": "🇨🇦"},
    "AUD": {"name": "دولار أسترالي (AUD)", "name_ar": "دولار أسترالي", "flag": "🇦🇺"},
}
ALL_CURRENCY_CODES = list(CURRENCY_METADATA.keys())

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
}

def fetch_crypto_rates() -> List[Dict[str, Any]]:
    """
    Fetches real-time BTC and ETH prices from Binance public ticker.
    """
    cryptos = [
        {"sym": "BTCUSDT", "name": "بتكوين", "code": "BTC", "icon": "🪙", "default_price": 86000.0},
        {"sym": "ETHUSDT", "name": "إيثريوم", "code": "ETH", "icon": "🔷", "default_price": 2730.0}
    ]
    results = []
    for item in cryptos:
        try:
            r = requests.get(f"https://api.binance.com/api/v3/ticker/24hr?symbol={item['sym']}", timeout=3)
            if r.status_code == 200:
                d = r.json()
                price = float(d.get("lastPrice", item["default_price"]))
                pct = float(d.get("priceChangePercent", 0.0))
                results.append({
                    "name": item["name"],
                    "code": item["code"],
                    "icon": item["icon"],
                    "usd_price": price,
                    "usd_price_formatted": f"${price:,.2f}",
                    "change_24h": f"{pct:+.2f}%",
                    "is_positive": pct >= 0
                })
                continue
        except Exception:
            pass
        results.append({
            "name": item["name"],
            "code": item["code"],
            "icon": item["icon"],
            "usd_price": item["default_price"],
            "usd_price_formatted": f"${item['default_price']:,.2f}",
            "change_24h": "+0.00%",
            "is_positive": True
        })
    return results

def fetch_oil_rates() -> List[Dict[str, Any]]:
    """
    Fetches real-time Brent and WTI crude oil prices.
    """
    commodities = [
        {"sym": "BZ=F", "name": "نفط برنت (خام)", "code": "BRENT", "icon": "🛢️", "unit": "$/برميل", "default": 96.0},
        {"sym": "CL=F", "name": "خام غرب تكساس (WTI)", "code": "WTI", "icon": "⚡", "unit": "$/برميل", "default": 90.25}
    ]
    results = []
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    for item in commodities:
        try:
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{item['sym']}?interval=1d",
                headers=headers,
                impersonate="chrome124",
                timeout=3
            )
            if r.status_code == 200:
                meta = r.json().get("chart", {}).get("result", [{}])[0].get("meta", {})
                price = float(meta.get("regularMarketPrice", item["default"]))
                prev = float(meta.get("chartPreviousClose", price))
                pct = round(((price - prev) / prev) * 100, 2) if prev else 0.0
                results.append({
                    "name": item["name"],
                    "code": item["code"],
                    "icon": item["icon"],
                    "unit": item["unit"],
                    "usd_price": price,
                    "usd_price_formatted": f"${price:,.2f}",
                    "change_24h": f"{pct:+.2f}%",
                    "is_positive": pct >= 0
                })
                continue
        except Exception:
            pass
        results.append({
            "name": item["name"],
            "code": item["code"],
            "icon": item["icon"],
            "unit": item["unit"],
            "usd_price": item["default"],
            "usd_price_formatted": f"${item['default']:,.2f}",
            "change_24h": "+0.00%",
            "is_positive": True
        })
    return results

def scrape_cbe_official_rates() -> Dict[str, Any]:
    """
    Secondary fallback scraper directly from Central Bank of Egypt website (https://www.cbe.org.eg/ar).
    Used only if Ta3weem CBE scraping is unavailable.
    """
    result = {
        "source": "البنك المركزي المصري (CBE)",
        "source_url": "https://www.cbe.org.eg/ar",
        "usd_buy": 54.4463,
        "usd_sell": 54.5863,
        "usd_rate": 54.5163,
        "currencies": {}
    }
    try:
        r = requests.get("https://www.cbe.org.eg/ar", headers=HEADERS, impersonate="chrome124", timeout=8)
        if r.status_code == 200:
            tree = html.fromstring(r.text)
            nodes = tree.xpath('//*[contains(@class, "fex-currency-detail")]')
            for node in nodes:
                card = node
                while card is not None and len(card.xpath('.//text()')) < 6:
                    card = card.getparent()
                if card is not None:
                    texts = [t.strip() for t in card.xpath('.//text()') if t.strip()]
                    if len(texts) >= 6 and 'شراء' in texts and 'بيع' in texts:
                        c_name = texts[1]
                        try:
                            buy_idx = texts.index('شراء') + 1
                            sell_idx = texts.index('بيع') + 1
                            buy_val = float(texts[buy_idx].replace(',', ''))
                            sell_val = float(texts[sell_idx].replace(',', ''))
                            avg_val = round((buy_val + sell_val) / 2, 4)
                            
                            code = "OTHER"
                            if "دولار" in c_name:
                                code = "USD"
                                result["usd_buy"] = buy_val
                                result["usd_sell"] = sell_val
                                result["usd_rate"] = avg_val
                            elif "يورو" in c_name:
                                code = "EUR"
                            elif "إسترلينى" in c_name or "استرليني" in c_name:
                                code = "GBP"
                            elif "سعودى" in c_name:
                                code = "SAR"
                            elif "إماراتى" in c_name:
                                code = "AED"
                            elif "كويتى" in c_name:
                                code = "KWD"
                                
                            if code not in result["currencies"]:
                                result["currencies"][code] = {
                                    "name": c_name,
                                    "code": code,
                                    "buy": buy_val,
                                    "sell": sell_val,
                                    "avg": avg_val
                                }
                        except (ValueError, IndexError):
                            pass
    except Exception as e:
        print(f"[CBE Fallback Scrape Note] {e}")
        
    return result

def scrape_single_currency(code: str) -> Optional[Dict[str, Any]]:
    """
    Scrapes an individual currency page from Ta3weem (18 total).
    Extracts official CBE buy/sell rates, best market buy/sell, and market average.
    """
    url = f"https://ta3weem.com/ar/currency-exchange-rates/{code}-EGP"
    for prof in ("chrome124", "safari17_0"):
        try:
            r = requests.get(url, headers=HEADERS, impersonate=prof, timeout=12)
            if r.status_code == 200:
                tree = html.fromstring(r.text)
                text = " ".join(tree.text_content().split())
                cbe_m = re.search(r"البنك المركزي \(CBE\)\s*شراء:\s*([\d.]+)\s*بيع:\s*([\d.]+)", text)
                best_m = re.search(r"أعلى سعر شراء\s*([\d.]+)", text)
                low_m = re.search(r"أقل سعر بيع\s*([\d.]+)", text)
                avg_m = re.search(r"متوسط السعر\s*([\d.]+)", text)
                
                cbe_buy = float(cbe_m.group(1)) if cbe_m else None
                cbe_sell = float(cbe_m.group(2)) if cbe_m else None
                best_buy = float(best_m.group(1)) if best_m else None
                best_sell = float(low_m.group(1)) if low_m else None
                avg_val = float(avg_m.group(1)) if avg_m else None
                
                if cbe_buy and cbe_sell:
                    cbe_mid = round((cbe_buy + cbe_sell) / 2, 4)
                elif best_buy:
                    cbe_mid = best_buy
                    cbe_buy = best_buy
                    cbe_sell = best_buy
                else:
                    return None
                    
                # Outlier protection (e.g. 0.00 sell for KWD/CHF/CAD, 0.34 for JPY)
                if not best_sell or best_sell <= 0 or abs(best_sell - cbe_mid) / cbe_mid > 0.10:
                    best_sell = cbe_sell
                if not best_buy or best_buy <= 0 or abs(best_buy - cbe_mid) / cbe_mid > 0.10:
                    best_buy = cbe_buy
                if not avg_val or avg_val <= 0 or abs(avg_val - cbe_mid) / cbe_mid > 0.10:
                    avg_val = round(cbe_mid, 2)
                    
                meta = CURRENCY_METADATA.get(code, {"name": f"{code} (EGP)", "name_ar": code, "flag": "🌐"})
                
                res = {
                    "code": code,
                    "name": meta["name"],
                    "name_ar": meta["name_ar"],
                    "flag": meta["flag"],
                    "rate": round(cbe_mid, 2),
                    "rate_formatted": f"{cbe_mid:,.2f}",
                    "buy": round(cbe_buy, 2),
                    "sell": round(cbe_sell, 2),
                    "cbe_buy": round(cbe_buy, 4),
                    "cbe_sell": round(cbe_sell, 4),
                    "best_buy": round(best_buy, 2),
                    "best_sell": round(best_sell, 2),
                    "avg": round(avg_val, 2),
                    "source": "البنك المركزي المصري (CBE) عبر Ta3weem",
                    "change": "+0.00%",
                    "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                if code == "USD":
                    res["_tree"] = tree
                return res
        except Exception:
            time.sleep(0.3)
    return None

def fetch_gold_prices() -> List[Dict[str, Any]]:
    """
    Scrapes the 3 gold cards from the Ta3weem homepage.
    """
    try:
        r = requests.get("https://ta3weem.com/ar", headers=HEADERS, impersonate="chrome124", timeout=8)
        if r.status_code == 200:
            tree = html.fromstring(r.text)
            scroll = tree.xpath('//div[@x-ref="scrollContainer"]')
            if scroll:
                scraped_gold = []
                for card in scroll[0].xpath('./*'):
                    texts = [t.strip() for t in card.xpath('.//text()') if t.strip()]
                    if len(texts) >= 2 and any("ذهب" in t for t in texts):
                        name_full = texts[0]
                        rate_str = texts[1].replace(',', '')
                        change_str = texts[2] if len(texts) > 2 else "+0.00%"
                        try:
                            rate_val = float(rate_str)
                            scraped_gold.append({
                                "name": name_full,
                                "rate": rate_val,
                                "rate_formatted": f"{rate_val:,.2f}",
                                "change": change_str
                            })
                        except ValueError:
                            pass
                if len(scraped_gold) >= 3:
                    return scraped_gold
    except Exception as e:
        print(f"[Ta3weem] Gold scrape note: {e}")
    return []

def fetch_ta3weem_data(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetches live currency rates (all 18 currencies), gold prices, USD bank exchange rates (25 banks + CBE),
    commodities (Brent, WTI), and crypto (BTC, ETH).
    Uses Central Bank of Egypt (CBE) as the official canonical source of truth for exchange rates.
    """
    now = time.time()
    existing_cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                existing_cache = json.load(f)
        except Exception:
            pass

    # Fast Cache Return: Sub-millisecond TTFB without blocking network requests
    if not force_refresh and existing_cache:
        cache_ts = existing_cache.get("cached_at") or existing_cache.get("ta3weem_scraped_at", 0)
        if (now - cache_ts) < TA3WEEM_CACHE_TTL and existing_cache.get("currencies") and len(existing_cache.get("currencies", [])) >= 8 and existing_cache.get("banks"):
            return existing_cache

    should_scrape_ta3weem = force_refresh or (not existing_cache) or (now - existing_cache.get("ta3weem_scraped_at", 0) > TA3WEEM_CACHE_TTL)

    currencies = existing_cache.get("currencies", [])
    gold_items = existing_cache.get("gold", [])
    banks = existing_cache.get("banks", [])
    highest_buy = existing_cache.get("highest_buy", 54.50)
    lowest_sell = existing_cache.get("lowest_sell", 54.20)
    avg_rate = existing_cache.get("avg_rate", 54.36)

    banks_scraped_ok = False if should_scrape_ta3weem else bool(existing_cache.get("banks_fresh", False))

    if should_scrape_ta3weem:
        # 1. Scrape all 18 currencies concurrently
        try:
            with ThreadPoolExecutor(max_workers=6) as ex:
                scraped_list = [c for c in ex.map(scrape_single_currency, ALL_CURRENCY_CODES) if c]
            
            if scraped_list:
                # Merge with existing cache so if any individual currency failed, its old entry is preserved
                curr_map = {c["code"]: c for c in currencies}
                for c in scraped_list:
                    curr_map[c["code"]] = c
                
                # Order currencies in standard order
                currencies = [curr_map[code] for code in ALL_CURRENCY_CODES if code in curr_map]
                print(f"[Ta3weem] ✅ Scraped {len(currencies)}/18 live currencies from Ta3weem")
        except Exception as e:
            print(f"[Ta3weem] Currency batch scrape error: {e}")

        # 2. Extract USD bank rates table from USD page response
        usd_item = next((c for c in currencies if c.get("code") == "USD"), None)
        if usd_item and "_tree" in usd_item:
            utree = usd_item.pop("_tree")
            try:
                tables = utree.xpath('//table')
                if tables:
                    tbl = tables[0]
                    scraped_banks = []
                    for tr in tbl.xpath('.//tr')[1:]:
                        cells = tr.xpath('.//td')
                        if len(cells) >= 3:
                            b_name = ' '.join(cells[0].text_content().split())
                            buy_text = cells[1].text_content().strip()
                            sell_text = cells[2].text_content().strip()
                            buy_nums = re.findall(r'(\d+\.\d+)', buy_text)
                            sell_nums = re.findall(r'(\d+\.\d+)', sell_text)
                            b_buy = float(buy_nums[0]) if buy_nums else 0.0
                            b_sell = float(sell_nums[0]) if sell_nums else 0.0
                            b_time = ""
                            if len(cells) >= 4:
                                time_m = re.search(r'(\d{1,2}:\d{2})', cells[3].text_content())
                                if time_m:
                                    b_time = time_m.group(1)
                            # Outlier protection for USD banks
                            if 45.0 <= b_buy <= 65.0 and 45.0 <= b_sell <= 65.0:
                                scraped_banks.append({
                                    "bank": b_name,
                                    "buy": b_buy,
                                    "sell": b_sell,
                                    "avg": round((b_buy + b_sell) / 2, 2),
                                    "updated_at": b_time
                                })
                    if scraped_banks:
                        banks = scraped_banks
                        banks_scraped_ok = True
                        highest_buy = usd_item.get("best_buy") or max(b["buy"] for b in banks)
                        lowest_sell = usd_item.get("best_sell") or min(b["sell"] for b in banks)
                        avg_rate = usd_item.get("avg") or round(sum(b["buy"] for b in banks) / len(banks), 2)
            except Exception as e:
                print(f"[Ta3weem] Bank rates parse error: {e}")

        # 3. Scrape gold prices
        scraped_gold = fetch_gold_prices()
        if scraped_gold:
            gold_items = scraped_gold

    # Fallbacks for banks if empty
    if not banks:
        banks = [
            {"bank": "البنك الأهلي المصري (NBE)", "buy": 54.33, "sell": 54.43, "avg": 54.38},
            {"bank": "بنك مصر (BM)", "buy": 54.33, "sell": 54.43, "avg": 54.38},
            {"bank": "البنك التجاري الدولي (CIB)", "buy": 54.34, "sell": 54.44, "avg": 54.39},
            {"bank": "مصرف أبوظبي الإسلامي (ADIB)", "buy": 54.38, "sell": 54.48, "avg": 54.43},
            {"bank": "بنك الإسكندرية (AlexBank)", "buy": 54.33, "sell": 54.43, "avg": 54.38}
        ]

    # Prepend Central Bank of Egypt (CBE) to banks list if not present
    usd_curr = next((c for c in currencies if c.get("code") == "USD"), None)
    cbe_usd_buy = usd_curr.get("cbe_buy", 54.33) if usd_curr else 54.33
    cbe_usd_sell = usd_curr.get("cbe_sell", 54.47) if usd_curr else 54.47
    cbe_usd_rate = usd_curr.get("rate", 54.40) if usd_curr else 54.40

    cbe_bank_entry = {
        "bank": "البنك المركزي المصري (CBE)",
        "buy": round(cbe_usd_buy, 2),
        "sell": round(cbe_usd_sell, 2),
        "avg": round((cbe_usd_buy + cbe_usd_sell) / 2, 2),
        "updated_at": "الرسمي"
    }
    if not any("المركزي" in b["bank"] for b in banks):
        banks.insert(0, cbe_bank_entry)

    if not gold_items:
        gold_items = [
            {"name": "ذهب عيار 24", "rate": 7177.24, "rate_formatted": "7,177.24", "change": "+0.48%"},
            {"name": "ذهب عيار 21", "rate": 6280.00, "rate_formatted": "6,280.00", "change": "+0.08%"},
            {"name": "جنيه الذهب", "rate": 50240.0, "rate_formatted": "50,240", "change": "+0.08%"}
        ]

    # Build CBE official structure directly from our scraped currencies (no extra 10s request needed)
    cbe_data = {
        "source": "البنك المركزي المصري (CBE)",
        "source_url": "https://www.cbe.org.eg/ar",
        "usd_buy": cbe_usd_buy,
        "usd_sell": cbe_usd_sell,
        "usd_rate": cbe_usd_rate,
        "currencies": {
            c["code"]: {
                "name": c.get("name_ar", c["code"]),
                "code": c["code"],
                "buy": c.get("cbe_buy", c.get("buy", 0)),
                "sell": c.get("cbe_sell", c.get("sell", 0)),
                "avg": c.get("rate", 0)
            } for c in currencies
        }
    }

    crypto_list = fetch_crypto_rates()
    oil_list = fetch_oil_rates()

    for c in crypto_list:
        c["egp_price"] = round(c["usd_price"] * cbe_usd_rate, 2)
        c["egp_price_formatted"] = f"{c['egp_price']:,.0f} ج.م"
    for o in oil_list:
        o["egp_price"] = round(o["usd_price"] * cbe_usd_rate, 2)
        o["egp_price_formatted"] = f"{o['egp_price']:,.0f} ج.م"

    result = {
        "cached_at": now,
        "ta3weem_scraped_at": now if should_scrape_ta3weem else existing_cache.get("ta3weem_scraped_at", now),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "banks_fresh": banks_scraped_ok,
        "banks_scraped_at_str": (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%H:%M") if (banks_scraped_ok and should_scrape_ta3weem) else existing_cache.get("banks_scraped_at_str", ""),
        "source": "البنك المركزي المصري (CBE) + منصات الطاقة والكريبتو العالمية",
        "source_url": "https://www.cbe.org.eg/ar",
        "cbe_official": cbe_data,
        "usd_rate": round(cbe_usd_rate, 2),
        "cbe_usd_buy": cbe_usd_buy,
        "cbe_usd_sell": cbe_usd_sell,
        "highest_buy": highest_buy,
        "lowest_sell": lowest_sell,
        "avg_rate": avg_rate,
        "currencies": currencies,
        "gold": gold_items,
        "banks": banks,
        "crypto": crypto_list,
        "commodities": oil_list
    }

    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result

if __name__ == "__main__":
    t0 = time.time()
    d = fetch_ta3weem_data(force_refresh=True)
    print(f"Fetched in {time.time()-t0:.2f}s")
    print(f"Currencies ({len(d['currencies'])}): {[c['code'] for c in d['currencies']]}")
    print(f"Banks ({len(d['banks'])}): First={d['banks'][0]['bank']} -> {d['banks'][0]['buy']}")
    print(f"USD Summary: Highest={d['highest_buy']}, Lowest={d['lowest_sell']}, Avg={d['avg_rate']}")
    print("Gold:", [g["name"] + ": " + g["rate_formatted"] for g in d["gold"]])
    print("Crypto:", [c["name"] + ": " + c["usd_price_formatted"] for c in d["crypto"]])
    print("Oil:", [o["name"] + ": " + o["usd_price_formatted"] for o in d["commodities"]])
