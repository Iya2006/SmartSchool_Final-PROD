from app.api.presence_agent import get_historique_presences, get_presences_stats
from test_db import db
from datetime import date

try:
    print("Testing get_historique_presences...")
    res = get_historique_presences(db=db)
    print("Historique length:", len(res))
    
    print("Testing get_presences_stats...")
    stats = get_presences_stats(db=db)
    print("Stats KPIs:", stats["kpis"])
except Exception as e:
    import traceback
    traceback.print_exc()
