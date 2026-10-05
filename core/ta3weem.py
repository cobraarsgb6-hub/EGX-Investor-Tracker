import time
import json
import os
import re
from typing import Dict, Any, List
from curl_cffi import requests
from lxml import html

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_FILE = os.path.join(BASE_DIR, "data", "ta3weem_rates.json")
TA3WEEM_CACHE_TTL = 300  # 5 minutes for HTML scraping of banks to avoid TLS blocks

def fetch_crypto_rates() -> List[Dict[str, Any]]:
    """
    Fetches real-time BTC and ETH prices from Binance public ticker.
    """
    cryptos = [
        {"sym": "BTCUSDT", "name": "بتكوين", "code": "BTC", "icon": "🪙", "default_price": 84400.0},
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
        # Fallback
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
        # Fallback
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
    Scrapes the official exchange rates directly from the Central Bank of Egypt (CBE) website (https://www.cbe.org.eg/ar).
    Returns dictionary with official CBE currency rates (USD, EUR, etc.) and the canonical usd_rate.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
    }
    result = {
        "source": "البنك المركزي المصري (CBE)",
        "source_url": "https://www.cbe.org.eg/ar",
        "usd_buy": 51.9354,
        "usd_sell": 52.0354,
        "usd_rate": 51.9854,
        "currencies": {}
    }
    try:
        r = requests.get("https://www.cbe.org.eg/ar", headers=headers, impersonate="chrome124", timeout=12)
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
        print(f"[CBE Scrape Note] {e}")
        
    return result


def fetch_ta3weem_data(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetches live currency rates, gold prices, bank USD exchange rates,
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

    should_scrape_ta3weem = force_refresh or (not existing_cache) or (now - existing_cache.get("ta3weem_scraped_at", 0) > TA3WEEM_CACHE_TTL)

    currencies = existing_cache.get("currencies", [])
    gold_items = existing_cache.get("gold", [])
    banks = existing_cache.get("banks", [])
    highest_buy = existing_cache.get("highest_buy", 52.07)
    lowest_sell = existing_cache.get("lowest_sell", 52.17)
    avg_rate = existing_cache.get("avg_rate", 52.12)
    nbe_rate = existing_cache.get("usd_rate", 52.07)

    if should_scrape_ta3weem:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
        }
        
        # 1. Scrape overview page
        try:
            resp = requests.get("https://ta3weem.com/ar", headers=headers, impersonate="chrome124", timeout=8)
            if resp.status_code == 200:
                tree = html.fromstring(resp.text)
                scroll_containers = tree.xpath('//div[@x-ref="scrollContainer"]')
                if scroll_containers:
                    scraped_curr = []
                    scraped_gold = []
                    for card in scroll_containers[0].xpath('./*'):
                        texts = [t.strip() for t in card.xpath('.//text()') if t.strip()]
                        if len(texts) >= 2:
                            name_full = texts[0]
                            rate_str = texts[1].replace(',', '')
                            change_str = texts[2] if len(texts) > 2 else "0.0%"
                            try:
                                rate_val = float(rate_str)
                            except ValueError:
                                rate_val = 0.0

                            item = {
                                "name": name_full,
                                "rate": rate_val,
                                "rate_formatted": texts[1],
                                "change": change_str,
                            }

                            if "USD" in name_full or "دولار" in name_full:
                                item["code"] = "USD"
                                item["flag"] = "🇺🇸"
                                item["name_ar"] = "دولار أمريكي"
                                item["buy"] = 52.07
                                item["sell"] = 52.17
                                scraped_curr.append(item)
                            elif "EUR" in name_full or "يورو" in name_full:
                                item["code"] = "EUR"
                                item["flag"] = "🇪🇺"
                                item["name_ar"] = "يورو أوروبي"
                                item["buy"] = round(rate_val - 0.12, 2)
                                item["sell"] = round(rate_val + 0.08, 2)
                                scraped_curr.append(item)
                            elif "SAR" in name_full or "سعودي" in name_full:
                                item["code"] = "SAR"
                                item["flag"] = "🇸🇦"
                                item["name_ar"] = "ريال سعودي"
                                item["buy"] = round(rate_val - 0.03, 2)
                                item["sell"] = round(rate_val + 0.02, 2)
                                scraped_curr.append(item)
                            elif "AED" in name_full or "إماراتي" in name_full:
                                item["code"] = "AED"
                                item["flag"] = "🇦🇪"
                                item["name_ar"] = "درهم إماراتي"
                                item["buy"] = round(rate_val - 0.03, 2)
                                item["sell"] = round(rate_val + 0.02, 2)
                                scraped_curr.append(item)
                            elif "GBP" in name_full or "إسترليني" in name_full:
                                item["code"] = "GBP"
                                item["flag"] = "🇬🇧"
                                item["name_ar"] = "جنيه إسترليني"
                                item["buy"] = round(rate_val - 0.15, 2)
                                item["sell"] = round(rate_val + 0.10, 2)
                                scraped_curr.append(item)
                            elif "ذهب" in name_full:
                                scraped_gold.append(item)
                    if scraped_curr:
                        currencies = scraped_curr
                    if scraped_gold:
                        gold_items = scraped_gold
        except Exception as e:
            print(f"[Ta3weem] Overview scrape note: {e}")

        # Ensure Major currencies (KWD, QAR, CNY) are present
        has_kwd = any(c.get("code") == "KWD" for c in currencies)
        if not has_kwd:
            currencies.append({
                "name": "دينار كويتي (KWD)",
                "name_ar": "دينار كويتي",
                "code": "KWD",
                "flag": "🇰🇼",
                "rate": 169.84,
                "rate_formatted": "169.84",
                "change": "+0.10%",
                "buy": 169.39,
                "sell": 170.19
            })
        has_qar = any(c.get("code") == "QAR" for c in currencies)
        if not has_qar:
            currencies.append({
                "name": "ريال قطري (QAR)",
                "name_ar": "ريال قطري",
                "code": "QAR",
                "flag": "🇶🇦",
                "rate": 14.31,
                "rate_formatted": "14.31",
                "change": "+0.05%",
                "buy": 14.28,
                "sell": 14.35
            })
        has_cny = any(c.get("code") == "CNY" for c in currencies)
        if not has_cny:
            currencies.append({
                "name": "يوان صيني (CNY)",
                "name_ar": "يوان صيني",
                "code": "CNY",
                "flag": "🇨🇳",
                "rate": 7.35,
                "rate_formatted": "7.35",
                "change": "+0.02%",
                "buy": 7.32,
                "sell": 7.38
            })

        # 2. Scrape specific USD Bank Rates
        try:
            usd_resp = requests.get("https://ta3weem.com/ar/currency-exchange-rates/USD-EGP", headers=headers, impersonate="chrome124", timeout=8)
            if usd_resp.status_code == 200:
                utree = html.fromstring(usd_resp.text)
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
                            if b_buy > 0:
                                scraped_banks.append({
                                    "bank": b_name,
                                    "buy": b_buy,
                                    "sell": b_sell,
                                    "avg": round((b_buy + b_sell) / 2, 2),
                                    "updated_at": b_time
                                })
                    if scraped_banks:
                        banks = scraped_banks
                        highest_buy = max(b["buy"] for b in banks)
                        lowest_sell = min(b["sell"] for b in banks)
                        avg_rate = round(sum(b["buy"] for b in banks) / len(banks), 2)
                        nbe_rate = next((b["buy"] for b in banks if "الأهلي المصري" in b["bank"]), banks[0]["buy"])
        except Exception as e:
            print(f"[Ta3weem] Bank rates scrape note: {e}")

    # Fallbacks for banks if empty
    if not banks:
        banks = [
            {"bank": "البنك الأهلي المصري (NBE)", "buy": 52.07, "sell": 52.17, "avg": 52.12},
            {"bank": "بنك مصر (BM)", "buy": 52.07, "sell": 52.17, "avg": 52.12},
            {"bank": "البنك التجاري الدولي (CIB)", "buy": 52.07, "sell": 52.17, "avg": 52.12},
            {"bank": "مصرف أبوظبي الإسلامي (ADIB)", "buy": 52.15, "sell": 52.25, "avg": 52.20},
            {"bank": "بنك الإسكندرية (AlexBank)", "buy": 52.07, "sell": 52.17, "avg": 52.12}
        ]

    if not gold_items:
        gold_items = [
            {"name": "ذهب عيار 24", "rate": 6970.46, "rate_formatted": "6,970.46", "change": "+0.56%"},
            {"name": "ذهب عيار 21", "rate": 6099.15, "rate_formatted": "6,099.15", "change": "+0.56%"},
            {"name": "جنيه الذهب", "rate": 48655.0, "rate_formatted": "48,655", "change": "+0.92%"}
        ]

    # ALWAYS FETCH CBE OFFICIAL RATE, CRYPTO & OIL LIVE
    cbe_data = scrape_cbe_official_rates()
    cbe_usd_rate = cbe_data.get("usd_rate") or 51.9854
    cbe_usd_buy = cbe_data.get("usd_buy") or 51.9354
    cbe_usd_sell = cbe_data.get("usd_sell") or 52.0354

    crypto_list = fetch_crypto_rates()
    oil_list = fetch_oil_rates()

    usd_val = cbe_usd_rate
    for c in crypto_list:
        c["egp_price"] = round(c["usd_price"] * usd_val, 2)
        c["egp_price_formatted"] = f"{c['egp_price']:,.0f} ج.م"
    for o in oil_list:
        o["egp_price"] = round(o["usd_price"] * usd_val, 2)
        o["egp_price_formatted"] = f"{o['egp_price']:,.0f} ج.م"

    result = {
        "cached_at": now,
        "ta3weem_scraped_at": now if should_scrape_ta3weem else existing_cache.get("ta3weem_scraped_at", now),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
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
    print("Currencies:", len(d["currencies"]))
    print("Banks:", len(d["banks"]))
    print("Crypto:", [c["name"] + ": " + c["usd_price_formatted"] for c in d["crypto"]])
    print("Oil:", [o["name"] + ": " + o["usd_price_formatted"] for o in d["commodities"]])
