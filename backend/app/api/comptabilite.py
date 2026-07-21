from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import date
from sqlalchemy import func

from app.core.database import get_db
from app.models.academique import (
    ParametreComptabilite, ExerciceComptable, JournalComptable, 
    CompteComptable, EcritureComptable, LigneEcriture
)

router = APIRouter(prefix="/api/comptabilite", tags=["Comptabilité"])

# --- SCHEMAS ---

class ExerciceCreate(BaseModel):
    annee: str
    date_debut: date
    date_fin: date

class ExerciceOut(ExerciceCreate):
    exercice_id: int
    statut: str
    model_config = ConfigDict(from_attributes=True)

class JournalCreate(BaseModel):
    code: str
    nom: str
    type_journal: str


class CompteCreate(BaseModel):
    numero_compte: str
    libelle: str
    type_compte: str

class CompteOut(CompteCreate):
    compte_id: int
    model_config = ConfigDict(from_attributes=True)

class JournalOut(BaseModel):
    journal_id: int
    code: str
    nom: str
    type_journal: str
    model_config = ConfigDict(from_attributes=True)

class LigneEcritureCreate(BaseModel):
    compte_id: int
    debit: float = 0.0
    credit: float = 0.0
    description: Optional[str] = None

class EcritureCreate(BaseModel):
    date_ecriture: date
    journal_id: int
    reference: Optional[str] = None
    libelle: str
    lignes: List[LigneEcritureCreate]

class PinChangeRequest(BaseModel):
    ancien_pin: str
    nouveau_pin: str

class PinVerifyRequest(BaseModel):
    pin: str

# --- UTILITAIRES ---

def init_comptabilite_defaults(db: Session):
    # 1. Vérifier/Créer le PIN
    pin_param = db.query(ParametreComptabilite).filter(ParametreComptabilite.cle == 'PIN_ACCESS').first()
    if not pin_param:
        db.add(ParametreComptabilite(cle='PIN_ACCESS', valeur='123000'))
    
    # 2. Exercice par défaut (2026)
    exo = db.query(ExerciceComptable).filter(ExerciceComptable.annee == '2026').first()
    if not exo:
        db.add(ExerciceComptable(annee='2026', date_debut=date(2026, 1, 1), date_fin=date(2026, 12, 31), statut="OUVERT"))
    
    # 3. Journaux par défaut
    if db.query(JournalComptable).count() == 0:
        db.add_all([
            JournalComptable(code='AC', nom='Achats', type_journal='ACHAT'),
            JournalComptable(code='VE', nom='Ventes', type_journal='VENTE'),
            JournalComptable(code='BQ', nom='Banque', type_journal='TRESORERIE'),
            JournalComptable(code='CA', nom='Caisse', type_journal='TRESORERIE'),
            JournalComptable(code='OD', nom='Opérations Diverses', type_journal='OD')
        ])
        
    # 4. Plan comptable OHADA basique (quelques comptes)
    if db.query(CompteComptable).count() == 0:
        db.add_all([
            CompteComptable(numero_compte="4111", libelle="Clients ordinaires", type_compte="ACTIF"),
            CompteComptable(numero_compte="5211", libelle="Banque locale", type_compte="ACTIF"),
            CompteComptable(numero_compte="5711", libelle="Caisse principale", type_compte="ACTIF"),
            CompteComptable(numero_compte="6011", libelle="Achat de marchandises", type_compte="CHARGE"),
            CompteComptable(numero_compte="7011", libelle="Ventes de marchandises", type_compte="PRODUIT"),
            CompteComptable(numero_compte="7061", libelle="Prestations de services (Scolarité)", type_compte="PRODUIT"),
        ])
    
    db.commit()

# --- ROUTES ---


@router.get("/pin/status")
def get_pin_status(db: Session = Depends(get_db)):
    """Indique si un PIN d'accès comptabilité est configuré (jamais la valeur elle-même)."""
    init_comptabilite_defaults(db)
    db.commit()
    pin_param = db.query(ParametreComptabilite).filter(ParametreComptabilite.cle == 'PIN_ACCESS').first()
    return {"configured": bool(pin_param and pin_param.valeur)}


@router.post("/pin/verify")
def verify_pin(data: PinVerifyRequest, db: Session = Depends(get_db)):
    """Vérifie qu'un code PIN correspond au PIN d'accès comptabilité configuré."""
    init_comptabilite_defaults(db)
    db.commit()
    pin_param = db.query(ParametreComptabilite).filter(ParametreComptabilite.cle == 'PIN_ACCESS').first()
    valide = bool(pin_param) and data.pin == pin_param.valeur
    return {"valid": valide}


@router.put("/pin")
def changer_pin(data: PinChangeRequest, db: Session = Depends(get_db)):
    """Modifie le PIN d'accès comptabilité (nécessite l'ancien PIN)."""
    init_comptabilite_defaults(db)
    db.commit()
    pin_param = db.query(ParametreComptabilite).filter(ParametreComptabilite.cle == 'PIN_ACCESS').first()
    if not pin_param or data.ancien_pin != pin_param.valeur:
        raise HTTPException(status_code=400, detail="L'ancien PIN est incorrect")
    if not data.nouveau_pin or len(data.nouveau_pin) < 4:
        raise HTTPException(status_code=400, detail="Le nouveau PIN doit contenir au moins 4 caractères")
    pin_param.valeur = data.nouveau_pin
    db.commit()
    return {"message": "PIN d'accès comptabilité modifié avec succès"}


@router.get("/journaux", response_model=List[JournalOut])
def get_journaux(db: Session = Depends(get_db)):
    init_comptabilite_defaults(db)
    return db.query(JournalComptable).all()

@router.post("/journaux", response_model=JournalOut)
def create_journal(journal: JournalCreate, db: Session = Depends(get_db)):
    db_journal = db.query(JournalComptable).filter(JournalComptable.code == journal.code).first()
    if db_journal:
        raise HTTPException(status_code=400, detail="Ce code journal existe déjà")
    
    nouveau = JournalComptable(**journal.dict())
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.get("/exercices", response_model=List[ExerciceOut])
def get_exercices(db: Session = Depends(get_db)):
    init_comptabilite_defaults(db)
    return db.query(ExerciceComptable).order_by(ExerciceComptable.annee.desc()).all()

@router.post("/exercices", response_model=ExerciceOut)
def create_exercice(exo: ExerciceCreate, db: Session = Depends(get_db)):
    db_exo = db.query(ExerciceComptable).filter(ExerciceComptable.annee == exo.annee).first()
    if db_exo:
        raise HTTPException(status_code=400, detail="Cet exercice existe déjà")
    
    nouveau = ExerciceComptable(**exo.dict(), statut="OUVERT")
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.post("/exercices/{exercice_id}/cloturer")
def cloturer_exercice(exercice_id: int, db: Session = Depends(get_db)):
    exo = db.query(ExerciceComptable).filter(ExerciceComptable.exercice_id == exercice_id).first()
    if not exo:
        raise HTTPException(status_code=404, detail="Exercice introuvable")
    
    exo.statut = "CLOTURE"
    db.commit()
    return {"success": True, "message": "Exercice clôturé avec succès"}

@router.get("/comptes", response_model=List[CompteOut])
def get_comptes(db: Session = Depends(get_db)):
    init_comptabilite_defaults(db)
    return db.query(CompteComptable).order_by(CompteComptable.numero_compte).all()

@router.post("/comptes", response_model=CompteOut)
def create_compte(compte: CompteCreate, db: Session = Depends(get_db)):
    db_compte = db.query(CompteComptable).filter(CompteComptable.numero_compte == compte.numero_compte).first()
    if db_compte:
        raise HTTPException(status_code=400, detail="Ce numéro de compte existe déjà")
    
    nouveau = CompteComptable(**compte.dict())
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.post("/ecritures")
def creer_ecriture(ecriture: EcritureCreate, db: Session = Depends(get_db)):
    # 1. Vérifier l'équilibre
    total_debit = sum(l.debit for l in ecriture.lignes)
    total_credit = sum(l.credit for l in ecriture.lignes)
    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(status_code=400, detail=f"L'écriture n'est pas équilibrée (Débit: {total_debit}, Crédit: {total_credit})")
    
    if len(ecriture.lignes) < 2:
        raise HTTPException(status_code=400, detail="Une écriture doit comporter au moins 2 lignes")

    # 2. Trouver l'exercice courant
    exo = db.query(ExerciceComptable).filter(ExerciceComptable.statut == "OUVERT").first()
    if not exo:
        raise HTTPException(status_code=400, detail="Aucun exercice comptable ouvert")

    # 3. Créer l'entête
    new_ecriture = EcritureComptable(
        date_ecriture=ecriture.date_ecriture,
        journal_id=ecriture.journal_id,
        reference=ecriture.reference,
        libelle=ecriture.libelle,
        exercice_id=exo.exercice_id
    )
    db.add(new_ecriture)
    db.flush() # pour avoir l'ID

    # 4. Créer les lignes
    for ligne in ecriture.lignes:
        nouvelle_ligne = LigneEcriture(
            ecriture_id=new_ecriture.ecriture_id,
            compte_id=ligne.compte_id,
            debit=ligne.debit,
            credit=ligne.credit,
            description=ligne.description
        )
        db.add(nouvelle_ligne)
        
    db.commit()
    return {"success": True, "message": "Écriture enregistrée avec succès", "ecriture_id": new_ecriture.ecriture_id}

@router.get("/ecritures")
def get_ecritures(db: Session = Depends(get_db)):
    ecritures = db.query(EcritureComptable).order_by(EcritureComptable.date_ecriture.desc(), EcritureComptable.created_at.desc()).limit(100).all()
    result = []
    for e in ecritures:
        journal = db.query(JournalComptable).filter(JournalComptable.journal_id == e.journal_id).first()
        lignes = db.query(LigneEcriture).filter(LigneEcriture.ecriture_id == e.ecriture_id).all()
        lignes_formattees = []
        for l in lignes:
            compte = db.query(CompteComptable).filter(CompteComptable.compte_id == l.compte_id).first()
            lignes_formattees.append({
                "compte": f"{compte.numero_compte} - {compte.libelle}",
                "debit": float(l.debit),
                "credit": float(l.credit)
            })
            
        result.append({
            "ecriture_id": e.ecriture_id,
            "date": e.date_ecriture,
            "journal": journal.code,
            "reference": e.reference,
            "libelle": e.libelle,
            "lignes": lignes_formattees
        })
    return result
