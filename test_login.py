import requests
try:
    res = requests.post("http://127.0.0.1:8000/api/auth/login", json={"identifiant": "admin", "mot_de_passe": "admin"}, timeout=10)
    print(res.status_code, res.text)
except Exception as e:
    print("Error:", e)
