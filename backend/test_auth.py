from app.core.database import SessionLocal
from app.models.academique import Utilisateur
from app.api.auth import create_access_token
from datetime import timedelta
import requests

db = SessionLocal()
user = db.query(Utilisateur).filter(Utilisateur.role == "ADMIN").first()
if not user:
    user = db.query(Utilisateur).first()
    
print("Found user:", user.nom_utilisateur)

access_token_expires = timedelta(minutes=60)
access_token = create_access_token(
    data={"sub": str(user.utilisateur_id), "role": user.role},
    expires_delta=access_token_expires
)

headers = {"Authorization": f"Bearer {access_token}"}
r2 = requests.get("http://localhost:8300/api/personnel?etablissement_id=1", headers=headers)
print("GET personnel:", r2.status_code, r2.text[:200])

r3 = requests.get("http://localhost:8300/api/personnel/stats?etablissement_id=1", headers=headers)
print("GET stats:", r3.status_code, r3.text[:200])
