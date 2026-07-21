import requests

# 1. Login
data = {"identifiant": "admin", "mot_de_passe": "password123"}
r = requests.post("http://localhost:8300/api/auth/login", json=data)
if r.status_code != 200:
    print("Login failed:", r.status_code, r.text)
    data = {"identifiant": "admin", "mot_de_passe": "admin"}
    r = requests.post("http://localhost:8300/api/auth/login", json=data)
    if r.status_code != 200:
        print("Login failed again:", r.status_code, r.text)
        exit(1)

token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 2. Get personnel
r2 = requests.get("http://localhost:8300/api/personnel?etablissement_id=1", headers=headers)
print("GET personnel:", r2.status_code, r2.text[:200])

# 3. Get stats
r3 = requests.get("http://localhost:8300/api/personnel/stats?etablissement_id=1", headers=headers)
print("GET stats:", r3.status_code, r3.text[:200])
