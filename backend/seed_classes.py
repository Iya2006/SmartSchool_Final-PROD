import sys
import os

sys.path.append('C:/Users/hp/SMART_SCHOOL_FINAL/backend')
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.academique import Classe, Eleve, Inscription, Niveau, Etablissement, AnneeScolaire
from datetime import date
from sqlalchemy import text
import traceback

db = SessionLocal()

try:
    print("Fetching global params...")
    etab = db.query(Etablissement).first()
    if not etab:
        etab = Etablissement(nom="SMARTSCHOOL", email="contact@smartschool.edu", pays="Guinée")
        db.add(etab)
        db.commit()
        db.refresh(etab)

    annee = db.query(AnneeScolaire).first()
    if not annee:
        annee = AnneeScolaire(annee_scolaire="2025-2026", date_debut=date(2025,9,1), date_fin=date(2026,6,30), statut="EN_COURS")
        db.add(annee)
        db.commit()
        db.refresh(annee)
    
    niveau = db.query(Niveau).first()
    if not niveau:
        niveau = Niveau(nom="Primaire", etablissement_id=etab.etablissement_id)
        db.add(niveau)
        db.commit()
        db.refresh(niveau)

    class_data = [
        {"nom": "Class 1", "effectif": 45},
        {"nom": "Class 2", "effectif": 42},
        {"nom": "Class 3", "effectif": 48},
        {"nom": "Class 4", "effectif": 50},
        {"nom": "Class 5", "effectif": 47},
        {"nom": "Class 6", "effectif": 43},
        {"nom": "Class 7", "effectif": 51},
        {"nom": "Class 8", "effectif": 49},
        {"nom": "Class 9", "effectif": 46},
        {"nom": "Class 10", "effectif": 52},
        {"nom": "Class 11", "effectif": 48},
        {"nom": "Class 12", "effectif": 50},
        {"nom": "7A1", "effectif": 30},
        {"nom": "7A2", "effectif": 35},
        {"nom": "8A1", "effectif": 32},
        {"nom": "8A2", "effectif": 30},
        {"nom": "9A1", "effectif": 38},
        {"nom": "9A2", "effectif": 29},
        {"nom": "10 - A", "effectif": 40},
        {"nom": "10 - B", "effectif": 42},
        {"nom": "10 - C", "effectif": 39},
        {"nom": "11A2", "effectif": 41},
        {"nom": "12A1", "effectif": 39},
        {"nom": "12A2", "effectif": 45},
    ]

    classes_db = []
    print("Inserting/Finding classes...")
    for cd in class_data:
        c = db.query(Classe).filter_by(libelle=cd["nom"]).first()
        if not c:
            c = Classe(
                etablissement_id=etab.etablissement_id,
                annee_id=annee.annee_id,
                niveau_id=niveau.niveau_id,
                libelle=cd["nom"],
                code=cd["nom"].replace(" ", "").upper()[:10],
                capacite_max=cd["effectif"] + 5,
                effectif_actuel=cd["effectif"],
                statut="ACTIF"
            )
            db.add(c)
        classes_db.append(c)
    
    db.commit()
    for c in classes_db:
        db.refresh(c)

    # Add specific mocked students for 10 - A, 10 - B, 10 - C
    eleves_data = [
        {"nom": "Johnson", "prenom": "Emma", "sexe": "F", "matricule": "12", "classe": "10 - A", "att": "Présent", "phone": "9876543210"},
        {"nom": "Carter", "prenom": "Liam", "sexe": "M", "matricule": "11", "classe": "10 - B", "att": "Absent", "phone": "9123456789"},
        {"nom": "Patel", "prenom": "Sophia", "sexe": "F", "matricule": "13", "classe": "10 - C", "att": "Présent", "phone": "9988776655"},
        {"nom": "Williams", "prenom": "Noah", "sexe": "M", "matricule": "12", "classe": "10 - C", "att": "En retard", "phone": "9090909090"},
        {"nom": "Thomas", "prenom": "Ava", "sexe": "F", "matricule": "11", "classe": "10 - A", "att": "Présent", "phone": "9812345678"},
    ]

    print("Inserting Eleves...")
    for i, ed in enumerate(eleves_data):
        el = db.query(Eleve).filter_by(nom=ed["nom"], prenom=ed["prenom"]).first()
        if not el:
            el = Eleve(
                etablissement_id=etab.etablissement_id,
                matricule=ed["matricule"] + f"_{i}",
                nom=ed["nom"],
                prenom=ed["prenom"],
                sexe=ed["sexe"],
                telephone=ed["phone"],
                date_naissance=date(2010, 1, 1),
                statut="ACTIF"
            )
            db.add(el)
            db.commit()
            db.refresh(el)
        
        c = next((c for c in classes_db if c.libelle == ed["classe"]), None)
        if c:
            insc = db.query(Inscription).filter_by(eleve_id=el.eleve_id, classe_id=c.classe_id).first()
            if not insc:
                insc = Inscription(
                    eleve_id=el.eleve_id,
                    classe_id=c.classe_id,
                    annee_id=annee.annee_id,
                    statut="ACTIVE"
                )
                db.add(insc)
    
    db.commit()
    print("Success! Classes & Students seeded.")

except Exception as e:
    print("Error!")
    traceback.print_exc()
    db.rollback()
finally:
    db.close()
