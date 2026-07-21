import requests

# Login with correct credentials
login_url = "http://localhost:8300/api/auth/login"

# Try multiple passwords
for pwd in ["admin", "smartschool", "Admin123", "admin123"]:
    login_data = {"identifiant": "admin", "mot_de_passe": pwd}
    resp = requests.post(login_url, json=login_data)
    print(f"Password '{pwd}': {resp.status_code} -> {resp.text[:100]}")
    if resp.status_code == 200:
        token = resp.json().get("access_token")
        
        # Test create enseignant
        url = "http://localhost:8300/api/enseignants"
        payload = {
            "etablissement_id": 1,
            "nom": "Test",
            "prenom": "User",
            "sexe": "M",
            "telephone": "123456789",
            "type_contrat": "PERMANENT",
            "statut": "ACTIF"
        }
        headers = {"Authorization": f"Bearer {token}"}
        create_resp = requests.post(url, json=payload, headers=headers)
        print(f"\nCreate: {create_resp.status_code}")
        print(f"Response: {create_resp.text[:500]}")
        
        # Delete test enseignant if created
        if create_resp.status_code == 201:
            eid = create_resp.json().get("enseignant_id")
            if eid:
                del_resp = requests.delete(f"{url}/{eid}", headers=headers)
                print(f"Deleted test: {del_resp.status_code}")
        break
