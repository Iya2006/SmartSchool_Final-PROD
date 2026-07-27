import requests

API_URL = "http://localhost:8000"

def login():
    res = requests.post(f"{API_URL}/api/auth/login", json={"identifiant": "admin", "mot_de_passe": "password123"})
    if res.status_code == 200:
        return res.json().get("token")
    print("Login failed", res.text)
    return None

token = login()
if token:
    print("Logged in!")
    headers = {"Authorization": f"Bearer {token}"}
    # Test stats
    res = requests.get(f"{API_URL}/api/presences-agents/stats?date_debut=2026-07-22&date_fin=2026-07-22", headers=headers)
    print("Stats status:", res.status_code)
    if res.status_code != 200:
        print("Stats text:", res.text)
    
    # Test historique
    res2 = requests.get(f"{API_URL}/api/presences-agents/historique", headers=headers)
    print("Historique status:", res2.status_code)
    if res2.status_code != 200:
        print("Historique text:", res2.text)
