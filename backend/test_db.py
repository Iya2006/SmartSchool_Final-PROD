from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

from app.models.academique import PresenceAgent, Enseignant, Utilisateur
presences = db.query(PresenceAgent).all()
for p in presences:
    print(p.presence_id, p.agent_id, p.type_agent, p.heure_arrivee, p.heure_depart)
