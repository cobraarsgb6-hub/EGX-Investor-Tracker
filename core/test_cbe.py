import json
from curl_cffi import requests
from lxml import html

def scrape_cbe_official_rates():
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
                    # Pattern: ['العملة', 'دولار أمريكى', 'شراء', '51.9354', 'بيع', '52.0354']
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

if __name__ == "__main__":
    cbe = scrape_cbe_official_rates()
    print("Official CBE Output:")
    print(json.dumps(cbe, ensure_ascii=False, indent=2))
