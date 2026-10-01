import json
from core.archive import save_institution_snapshot, get_daily_history, get_weekly_summary, get_monthly_summary

with open('data/latest_sb_1.json', encoding='utf-8') as f:
    data = json.load(f)

saved = save_institution_snapshot(data)
print("Saved today snapshot:", saved)

daily = get_daily_history('1')
print(f"Daily records: {len(daily)}")
if daily:
    r = daily[0]
    print(f"Date: {r['date']}")
    print(f"Total Inflow (دخل): {r['total_inflow_egp']:,.0f} EGP (${r['total_inflow_usd']:,.2f})")
    print(f"Total Outflow (خرج): {r['total_outflow_egp']:,.0f} EGP (${r['total_outflow_usd']:,.2f})")
    print(f"Total Net Flow: {r['total_net_egp']:,.0f} EGP (${r['total_net_usd']:,.2f})")
    print(f"Foreign Institutions Net: {r['foreign_net_egp']:,.0f} EGP (${r['foreign_net_usd']:,.2f})")
