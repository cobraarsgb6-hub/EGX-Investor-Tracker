import sys
import argparse
import time
from core.scraper import fetch_investors_from_egx, MARKET_SEGMENTS
from core.converter import get_usd_egp_rate, format_currency
from core.exporter import export_to_excel

def print_separator(char="=", length=80):
    print(char * length)

def display_table(title: str, items: list, usd_rate: float):
    print(f"\n📊 {title}")
    print_separator("-", 95)
    header = f"{'الفئة':<10} | {'قيمة الشراء (EGP)':<20} | {'قيمة البيع (EGP)':<20} | {'صافي القيمة (EGP)':<20} | {'صافي (USD)':<15}"
    print(header)
    print_separator("-", 95)
    
    for item in items:
        cat = item['type']
        buy_egp = f"{item['buy_egp']:>18,.0f}"
        sell_egp = f"{item['sell_egp']:>18,.0f}"
        net_egp = f"{item['net_egp']:>18,.0f}"
        net_usd = f"{item['net_usd']:>13,.2f} $"
        sign = "+" if item['net_egp'] > 0 else ""
        
        print(f"{cat:<10} | {buy_egp} | {sell_egp} | {sign}{net_egp} | {sign}{net_usd}")
        
    print_separator("-", 95)

def main():
    parser = argparse.ArgumentParser(description="سحب ومتابعة تعاملات فئات المستثمرين في البورصة المصرية (بالجنيه والدولار)")
    parser.add_argument("--sb", default="1", choices=["1", "2", "3", "4"], help="نوع السوق (1=الكل، 2=الأسهم، 3=السندات، 4=الأذون)")
    parser.add_argument("--rate", type=float, default=None, help="سعر صرف مخصص للدولار (اختياري)")
    parser.add_argument("--export", default=None, help="مسار تصدير ملف الإكسيل")
    args = parser.parse_args()

    print_separator("=")
    print("📈 برنامج متابعة فئات المستثمرين في البورصة المصرية (EGX Investor Flow)")
    print_separator("=")
    
    live_rate = args.rate or get_usd_egp_rate()
    print(f"💵 سعر صرف الدولار المعتمد: 1 USD = {live_rate:.2f} EGP")
    print(f"📌 القطاع المختار: {MARKET_SEGMENTS.get(args.sb)}")
    print("⏳ جاري الاتصال بموقع البورصة المصرية وتخطي حماية F5 WAF...")
    
    start_time = time.time()
    try:
        data = fetch_investors_from_egx(sb=args.sb, custom_usd_rate=args.rate)
        elapsed = time.time() - start_time
        print(f"✅ تم سحب البيانات بنجاح خلال {elapsed:.1f} ثانية!")
        
        # Display All
        display_table("1. إجمالي تعاملات المستثمرين (الصورة المطلوبة)", data["tables"]["all"], live_rate)
        # Display Individuals
        display_table("2. تعاملات الأفراد (Individuals)", data["tables"]["individuals"], live_rate)
        # Display Institutions
        display_table("3. تعاملات المؤسسات (Institutions)", data["tables"]["institutions"], live_rate)

        # Export to Excel
        base_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = os.path.join(base_dir, "data")
        os.makedirs(data_dir, exist_ok=True)
        export_file = args.export or os.path.join(data_dir, f"EGX_Investors_{time.strftime('%Y%m%d_%H%M%S')}.xlsx")
        export_to_excel(data, export_file)
        print(f"\n💾 تم حفظ التقرير في ملف إكسيل منسق:\n   -> {export_file}")

    except Exception as e:
        print(f"\n❌ حدث خطأ: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
