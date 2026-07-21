"""
SMARTSCHOOL — Seed Script
Génère des données de test réalistes pour l'Etablissement, les Classes,
les Élèves, les Inscriptions, et les Paiements.
"""
from datetime import date, timedelta
import random
from app.core.database import SessionLocal
from app.models.academique import (
    Etablissement, AnneeScolaire, Cycle, Niveau, Salle, Classe,
    Eleve, Enseignant, Inscription, Facture, Paiement
)

def seed_database():
    db = SessionLocal()
    print("Démarrage de l'injection des données de test...")

    # 1. Établissement
    etab = db.query(Etablissement).first()
    if not etab:
        etab = Etablissement(
            code="ETB-CKY-001",
            nom="Lycée d'Excellence de Conakry",
            type_etablissement="PUBLIC",
            region="CONAKRY"
        )
        db.add(etab)
        db.commit()
        db.refresh(etab)
        print("Établissement créé.")

    # 2. Année Scolaire
    annee = db.query(AnneeScolaire).first()
    if not annee:
        annee = AnneeScolaire(
            etablissement_id=etab.etablissement_id,
            code="2025-2026",
            libelle="Année Scolaire 2025-2026",
            date_debut=date(2025, 9, 1),
            date_fin=date(2026, 6, 30),
            est_courante="O",
            statut="EN_COURS"
        )
        db.add(annee)
        db.commit()
        db.refresh(annee)
        print("Année scolaire créée.")

    # 3. Cycle & Niveaux
    cycle = db.query(Cycle).first()
    if not cycle:
        cycle = Cycle(
            etablissement_id=etab.etablissement_id,
            code="CLG", libelle="Collège", ordre=2, duree_annees=4
        )
        db.add(cycle)
        db.commit()
        db.refresh(cycle)

        niv7 = Niveau(cycle_id=cycle.cycle_id, code="7A", libelle="7ème Année", ordre=1)
        niv8 = Niveau(cycle_id=cycle.cycle_id, code="8A", libelle="8ème Année", ordre=2)
        niv9 = Niveau(cycle_id=cycle.cycle_id, code="9A", libelle="9ème Année", ordre=3)
        niv10 = Niveau(cycle_id=cycle.cycle_id, code="10A", libelle="10ème Année", ordre=4, est_examen="O", examen_national="BEPC")
        db.add_all([niv7, niv8, niv9, niv10])
        db.commit()
        print("Cycle et Niveaux créés.")

    # 4. Salles & Classes
    if db.query(Classe).count() == 0:
        niveaux = db.query(Niveau).all()
        for i, niv in enumerate(niveaux):
            salle = Salle(etablissement_id=etab.etablissement_id, code=f"S{i+1}", nom=f"Salle {i+1}")
            db.add(salle)
            db.commit()

            classe = Classe(
                etablissement_id=etab.etablissement_id,
                annee_id=annee.annee_id,
                niveau_id=niv.niveau_id,
                salle_id=salle.salle_id,
                code=f"{niv.code}1",
                libelle=f"{niv.libelle} 1"
            )
            db.add(classe)
        db.commit()
        print("Classes créées.")

    # 5. Enseignants
    if db.query(Enseignant).count() == 0:
        for i in range(5):
            ens = Enseignant(
                etablissement_id=etab.etablissement_id,
                matricule=f"ENS-0000{i+1}",
                nom=random.choice(["DIALLO", "BARRY", "SOW", "CONDE", "CAMARA", "TOURE", "SYLLA", "BAH"]),
                prenom=random.choice(["Amadou", "Mamadou", "Fatoumata", "Ousmane", "Ibrahim", "Aissatou"]),
                sexe=random.choice(["M", "F"]),
                telephone=f"62{random.randint(1000000, 9999999)}"
            )
            db.add(ens)
        db.commit()
        print("Enseignants créés.")

    # 6. Élèves, Inscriptions, Factures, Paiements
    if db.query(Eleve).count() == 0:
        classes = db.query(Classe).all()
        for i in range(45):
            sexe = random.choice(["M", "F"])
            eleve = Eleve(
                etablissement_id=etab.etablissement_id,
                matricule=f"ELV-000{i+1:02d}",
                nom=random.choice(["DIALLO", "BARRY", "SOW", "CONDE", "CAMARA", "TOURE", "SYLLA", "BAH"]),
                prenom=random.choice(["Amadou", "Mamadou", "Fatoumata", "Ousmane", "Ibrahim", "Aissatou", "Kadiatou", "Alpha"]),
                sexe=sexe,
                date_naissance=date(2010, 1, 1) + timedelta(days=random.randint(0, 1000))
            )
            db.add(eleve)
            db.commit()
            db.refresh(eleve)

            # Inscription
            cl = random.choice(classes)
            insc = Inscription(
                eleve_id=eleve.eleve_id,
                classe_id=cl.classe_id,
                annee_id=annee.annee_id
            )
            db.add(insc)
            
            # Update effectif
            cl.effectif_actuel += 1
            db.commit()
            db.refresh(insc)

            # Facture 1.5M GNF
            facture = Facture(
                inscription_id=insc.inscription_id,
                numero_facture=f"F-2025-{i+1:04d}",
                montant_total=1500000,
                montant_net=1500000,
                montant_paye=0,
                montant_restant=1500000
            )
            db.add(facture)
            db.commit()
            db.refresh(facture)

            # Paiement (50% de chance d'avoir payé)
            if random.random() > 0.4:
                montant = random.choice([500000, 1500000])
                paiement = Paiement(
                    facture_id=facture.facture_id,
                    numero_recu=f"REC-2025-{i+1:04d}",
                    montant=montant,
                    mode_paiement=random.choice(["ESPECES", "ORANGE_MONEY", "MTN_MONEY"]),
                    date_paiement=date.today() - timedelta(days=random.randint(0, 45))
                )
                db.add(paiement)
                facture.montant_paye = montant
                facture.montant_restant = 1500000 - montant
                facture.statut = "PAYEE" if facture.montant_restant == 0 else "PARTIELLEMENT_PAYEE"
                db.commit()

        print("45 Élèves + Inscriptions + Paiements créés.")

    db.close()
    print("Injection terminée ! 🎉")

if __name__ == "__main__":
    seed_database()
