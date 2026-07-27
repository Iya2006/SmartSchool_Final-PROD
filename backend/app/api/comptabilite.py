from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import date
from sqlalchemy import func, case, literal_column
from decimal import Decimal

from app.core.database import get_db
from app.models.academique import (
    ParametreComptabilite, ExerciceComptable, JournalComptable, 
    CompteComptable, EcritureComptable, LigneEcriture, Comptable, Etablissement,
    Classe, Eleve
)
from app.core.security import verify_password, hash_password
from app.core.auth import create_access_token

router = APIRouter(prefix="/api/comptabilite", tags=["Comptabilité"])

# --- SCHEMAS ---

class AuthRequest(BaseModel):
    nom_utilisateur: str
    mot_de_passe: str

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

class FournisseurCreate(BaseModel):
    nom: str
    code: str
    telephone: Optional[str] = None
    email: Optional[str] = None
    adresse: Optional[str] = None

class FournisseurOut(FournisseurCreate):
    fournisseur_id: int
    model_config = ConfigDict(from_attributes=True)

class LigneEcritureCreate(BaseModel):
    compte_id: int
    debit: float = 0.0
    credit: float = 0.0
    description: Optional[str] = None
    classe_id: Optional[int] = None
    eleve_id: Optional[int] = None
    fournisseur_id: Optional[int] = None
    departement: Optional[str] = None

class EcritureCreate(BaseModel):
    date_ecriture: date
    journal_id: int
    reference: Optional[str] = None
    libelle: str
    lignes: List[LigneEcritureCreate]

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
            CompteComptable(numero_compte="4111", libelle="Parents et Élèves", type_compte="ACTIF"),
            CompteComptable(numero_compte="5211", libelle="Banque locale", type_compte="ACTIF"),
            CompteComptable(numero_compte="5711", libelle="Caisse principale", type_compte="ACTIF"),
            CompteComptable(numero_compte="6011", libelle="Achat de marchandises", type_compte="CHARGE"),
            CompteComptable(numero_compte="7011", libelle="Ventes de marchandises", type_compte="PRODUIT"),
            CompteComptable(numero_compte="7061", libelle="Prestations de services (Scolarité)", type_compte="PRODUIT"),
        ])

    # 5. Seeder le comptable par défaut (sams) si vide
    if db.query(Comptable).count() == 0:
        db.add(Comptable(
            etablissement_id=1,
            nom_utilisateur="sams",
            mot_de_passe=hash_password("smart2025"),
            nom="Camara",
            prenom="Mohamed Sams Deen",
            telephone="623969686",
            email="sams@smartschool.gn",
            statut="ACTIF"
        ))
    
    db.commit()

def _get_exercice(db: Session, exercice_id: Optional[int] = None) -> ExerciceComptable:
    """Récupère l'exercice demandé ou l'exercice ouvert par défaut."""
    if exercice_id:
        exo = db.query(ExerciceComptable).filter(ExerciceComptable.exercice_id == exercice_id).first()
        if not exo:
            raise HTTPException(status_code=404, detail="Exercice introuvable")
        return exo
    exo = db.query(ExerciceComptable).filter(ExerciceComptable.statut == "OUVERT").first()
    if not exo:
        raise HTTPException(status_code=400, detail="Aucun exercice comptable ouvert")
    return exo

# --- ROUTES ---

@router.post("/auth")
def auth_comptabilite(req: AuthRequest, db: Session = Depends(get_db)):
    init_comptabilite_defaults(db) # Initialize if first time
    
    comptable = db.query(Comptable).filter(
        (Comptable.nom_utilisateur == req.nom_utilisateur) |
        (Comptable.telephone == req.nom_utilisateur) |
        (Comptable.email == req.nom_utilisateur)
    ).first()
    if not comptable:
        raise HTTPException(status_code=401, detail="Nom d'utilisateur ou mot de passe incorrect")
        
    if comptable.statut != "ACTIF":
        raise HTTPException(status_code=403, detail="Ce compte est inactif")
        
    if not verify_password(req.mot_de_passe, comptable.mot_de_passe):
        raise HTTPException(status_code=401, detail="Nom d'utilisateur ou mot de passe incorrect")
        
    # Nom de l'établissement
    etab = db.query(Etablissement).filter(Etablissement.etablissement_id == comptable.etablissement_id).first()
    etablissement_nom = etab.nom if etab else "Établissement inconnu"
    
    # Générer le token JWT
    token_data = {
        "sub": str(comptable.comptable_id),
        "nom": comptable.nom,
        "prenom": comptable.prenom,
        "role": "COMPTABLE",
        "type": "comptable",
    }
    token = create_access_token(token_data)
    
    return {
        "success": True,
        "token": token,
        "comptable_id": comptable.comptable_id,
        "nom": comptable.nom,
        "prenom": comptable.prenom,
        "etablissement_id": comptable.etablissement_id,
        "etablissement_nom": etablissement_nom
    }


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

    # 4. Créer les lignes (avec axes analytiques)
    for ligne in ecriture.lignes:
        nouvelle_ligne = LigneEcriture(
            ecriture_id=new_ecriture.ecriture_id,
            compte_id=ligne.compte_id,
            debit=ligne.debit,
            credit=ligne.credit,
            description=ligne.description,
            classe_id=ligne.classe_id,
            eleve_id=ligne.eleve_id,
            fournisseur_id=ligne.fournisseur_id,
            departement=ligne.departement,
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


# ============================================================================
# ENDPOINTS PHASE 1 — BALANCE DES COMPTES
# ============================================================================

@router.get("/balance")
def get_balance(
    exercice_id: Optional[int] = Query(None, description="ID de l'exercice (défaut: exercice ouvert)"),
    db: Session = Depends(get_db)
):
    """
    Balance Générale des comptes.
    Calcule côté serveur le cumul débit/crédit et les soldes (débiteur/créditeur) 
    pour chaque compte ayant eu des mouvements durant l'exercice.
    """
    exo = _get_exercice(db, exercice_id)
    
    # Agrégation SQL par compte
    rows = (
        db.query(
            CompteComptable.compte_id,
            CompteComptable.numero_compte,
            CompteComptable.libelle,
            CompteComptable.type_compte,
            func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit"),
        )
        .join(LigneEcriture, LigneEcriture.compte_id == CompteComptable.compte_id)
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .group_by(CompteComptable.compte_id, CompteComptable.numero_compte, CompteComptable.libelle, CompteComptable.type_compte)
        .order_by(CompteComptable.numero_compte)
        .all()
    )
    
    balance = []
    total_debit_global = 0
    total_credit_global = 0
    total_solde_debiteur = 0
    total_solde_crediteur = 0
    
    for row in rows:
        td = float(row.total_debit)
        tc = float(row.total_credit)
        solde = td - tc
        sd = solde if solde > 0 else 0
        sc = abs(solde) if solde < 0 else 0
        
        total_debit_global += td
        total_credit_global += tc
        total_solde_debiteur += sd
        total_solde_crediteur += sc
        
        balance.append({
            "compte_id": row.compte_id,
            "numero_compte": row.numero_compte,
            "libelle": row.libelle,
            "type_compte": row.type_compte,
            "total_debit": td,
            "total_credit": tc,
            "solde_debiteur": sd,
            "solde_crediteur": sc,
        })
    
    return {
        "exercice": {"exercice_id": exo.exercice_id, "annee": exo.annee, "statut": exo.statut},
        "balance": balance,
        "totaux": {
            "total_debit": total_debit_global,
            "total_credit": total_credit_global,
            "total_solde_debiteur": total_solde_debiteur,
            "total_solde_crediteur": total_solde_crediteur,
        }
    }


# ============================================================================
# ENDPOINTS PHASE 1 — COMPTE DE RÉSULTAT (ANALYTIQUE)
# ============================================================================

@router.get("/compte-de-resultat")
def get_compte_de_resultat(
    exercice_id: Optional[int] = Query(None),
    group_by: Optional[str] = Query(None, description="Axe analytique: 'classe', 'eleve', 'departement' ou None"),
    db: Session = Depends(get_db)
):
    """
    Compte de Résultat avec option de ventilation analytique.
    - Charges = comptes commençant par '6'
    - Produits = comptes commençant par '7'
    - group_by permet de ventiler par classe, élève ou département
    """
    exo = _get_exercice(db, exercice_id)
    
    if group_by and group_by not in ("classe", "eleve", "departement", "none"):
        raise HTTPException(status_code=400, detail="group_by doit être 'classe', 'eleve', 'departement' ou 'none'")
    
    if group_by == "none":
        group_by = None
    
    # --- Pas de ventilation analytique ---
    if not group_by:
        # Charges
        charges_rows = (
            db.query(
                CompteComptable.numero_compte,
                CompteComptable.libelle,
                func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
                func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit"),
            )
            .join(LigneEcriture, LigneEcriture.compte_id == CompteComptable.compte_id)
            .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
            .filter(EcritureComptable.exercice_id == exo.exercice_id)
            .filter(CompteComptable.numero_compte.like("6%"))
            .group_by(CompteComptable.numero_compte, CompteComptable.libelle)
            .order_by(CompteComptable.numero_compte)
            .all()
        )
        
        produits_rows = (
            db.query(
                CompteComptable.numero_compte,
                CompteComptable.libelle,
                func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
                func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit"),
            )
            .join(LigneEcriture, LigneEcriture.compte_id == CompteComptable.compte_id)
            .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
            .filter(EcritureComptable.exercice_id == exo.exercice_id)
            .filter(CompteComptable.numero_compte.like("7%"))
            .group_by(CompteComptable.numero_compte, CompteComptable.libelle)
            .order_by(CompteComptable.numero_compte)
            .all()
        )
        
        charges = [{"numero_compte": r.numero_compte, "libelle": r.libelle, "montant": float(r.total_debit) - float(r.total_credit)} for r in charges_rows]
        produits = [{"numero_compte": r.numero_compte, "libelle": r.libelle, "montant": float(r.total_credit) - float(r.total_debit)} for r in produits_rows]
        
        total_charges = sum(c["montant"] for c in charges)
        total_produits = sum(p["montant"] for p in produits)
        
        return {
            "exercice": {"exercice_id": exo.exercice_id, "annee": exo.annee},
            "group_by": None,
            "charges": charges,
            "produits": produits,
            "total_charges": total_charges,
            "total_produits": total_produits,
            "resultat_net": total_produits - total_charges,
        }
    
    # --- Avec ventilation analytique ---
    # Déterminer la colonne de groupement
    if group_by == "classe":
        group_col = LigneEcriture.classe_id
        label_query = lambda db, ids: {c.classe_id: f"{c.code} - {c.libelle}" for c in db.query(Classe).filter(Classe.classe_id.in_(ids)).all()} if ids else {}
    elif group_by == "eleve":
        group_col = LigneEcriture.eleve_id
        label_query = lambda db, ids: {e.eleve_id: f"{e.prenom} {e.nom}" for e in db.query(Eleve).filter(Eleve.eleve_id.in_(ids)).all()} if ids else {}
    else:  # departement
        group_col = LigneEcriture.departement
        label_query = None
    
    # Requête groupée
    rows = (
        db.query(
            group_col.label("group_key"),
            CompteComptable.numero_compte,
            CompteComptable.libelle,
            func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit"),
        )
        .join(LigneEcriture, LigneEcriture.compte_id == CompteComptable.compte_id)
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .filter(CompteComptable.numero_compte.like("6%") | CompteComptable.numero_compte.like("7%"))
        .group_by(group_col, CompteComptable.numero_compte, CompteComptable.libelle)
        .order_by(group_col, CompteComptable.numero_compte)
        .all()
    )
    
    # Récupérer les libellés pour les axes numériques (classe_id, eleve_id)
    if label_query:
        unique_ids = set(r.group_key for r in rows if r.group_key is not None)
        labels = label_query(db, list(unique_ids))
    else:
        labels = {}
    
    # Organiser par groupe
    groups = {}
    for r in rows:
        key = r.group_key
        key_label = str(key) if key is not None else "Non affecté"
        if label_query and key is not None:
            key_label = labels.get(key, str(key))
        
        if key_label not in groups:
            groups[key_label] = {"label": key_label, "charges": [], "produits": [], "total_charges": 0, "total_produits": 0}
        
        montant_charge = float(r.total_debit) - float(r.total_credit)
        montant_produit = float(r.total_credit) - float(r.total_debit)
        
        if r.numero_compte.startswith("6"):
            groups[key_label]["charges"].append({"numero_compte": r.numero_compte, "libelle": r.libelle, "montant": montant_charge})
            groups[key_label]["total_charges"] += montant_charge
        elif r.numero_compte.startswith("7"):
            groups[key_label]["produits"].append({"numero_compte": r.numero_compte, "libelle": r.libelle, "montant": montant_produit})
            groups[key_label]["total_produits"] += montant_produit
    
    # Calculer résultats par groupe
    result_groups = []
    total_charges = 0
    total_produits = 0
    for g in groups.values():
        g["resultat_net"] = g["total_produits"] - g["total_charges"]
        result_groups.append(g)
        total_charges += g["total_charges"]
        total_produits += g["total_produits"]
    
    return {
        "exercice": {"exercice_id": exo.exercice_id, "annee": exo.annee},
        "group_by": group_by,
        "groupes": result_groups,
        "total_charges": total_charges,
        "total_produits": total_produits,
        "resultat_net": total_produits - total_charges,
    }


# ============================================================================
# ENDPOINTS PHASE 1 — GRAND LIVRE
# ============================================================================

@router.get("/grand-livre")
def get_grand_livre(
    exercice_id: Optional[int] = Query(None),
    compte_id: Optional[int] = Query(None, description="Filtrer par un compte spécifique"),
    journal_id: Optional[int] = Query(None, description="Filtrer par journal"),
    db: Session = Depends(get_db)
):
    """
    Grand Livre : toutes les écritures détaillées, groupées par compte, 
    avec solde progressif.
    """
    exo = _get_exercice(db, exercice_id)
    
    # Construire la requête de base
    query = (
        db.query(
            CompteComptable.compte_id,
            CompteComptable.numero_compte,
            CompteComptable.libelle.label("compte_libelle"),
            CompteComptable.type_compte,
            EcritureComptable.ecriture_id,
            EcritureComptable.date_ecriture,
            EcritureComptable.reference,
            EcritureComptable.libelle.label("ecriture_libelle"),
            JournalComptable.code.label("journal_code"),
            LigneEcriture.debit,
            LigneEcriture.credit,
            LigneEcriture.description,
        )
        .join(LigneEcriture, LigneEcriture.compte_id == CompteComptable.compte_id)
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .join(JournalComptable, JournalComptable.journal_id == EcritureComptable.journal_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
    )
    
    if compte_id:
        query = query.filter(CompteComptable.compte_id == compte_id)
    if journal_id:
        query = query.filter(EcritureComptable.journal_id == journal_id)
    
    query = query.order_by(CompteComptable.numero_compte, EcritureComptable.date_ecriture, EcritureComptable.ecriture_id)
    rows = query.all()
    
    # Grouper par compte avec solde progressif
    comptes_dict = {}
    for r in rows:
        cid = r.compte_id
        if cid not in comptes_dict:
            comptes_dict[cid] = {
                "compte_id": cid,
                "numero_compte": r.numero_compte,
                "libelle": r.compte_libelle,
                "type_compte": r.type_compte,
                "mouvements": [],
                "total_debit": 0,
                "total_credit": 0,
                "solde_progressif": 0,
            }
        
        d = float(r.debit)
        c = float(r.credit)
        comptes_dict[cid]["total_debit"] += d
        comptes_dict[cid]["total_credit"] += c
        comptes_dict[cid]["solde_progressif"] += d - c
        
        comptes_dict[cid]["mouvements"].append({
            "date": r.date_ecriture.isoformat() if r.date_ecriture else None,
            "journal": r.journal_code,
            "reference": r.reference,
            "libelle": r.ecriture_libelle,
            "description_ligne": r.description,
            "debit": d,
            "credit": c,
            "solde_progressif": comptes_dict[cid]["solde_progressif"],
        })
    
    return {
        "exercice": {"exercice_id": exo.exercice_id, "annee": exo.annee},
        "comptes": list(comptes_dict.values())
    }


# ============================================================================
# ENDPOINTS PHASE 1 — MOUVEMENTS D'UN COMPTE
# ============================================================================

@router.get("/comptes/{compte_id}/mouvements")
def get_mouvements_compte(
    compte_id: int,
    exercice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Détail des mouvements d'un compte spécifique avec solde progressif.
    """
    compte = db.query(CompteComptable).filter(CompteComptable.compte_id == compte_id).first()
    if not compte:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    
    exo = _get_exercice(db, exercice_id)
    
    rows = (
        db.query(
            EcritureComptable.date_ecriture,
            EcritureComptable.reference,
            EcritureComptable.libelle.label("ecriture_libelle"),
            JournalComptable.code.label("journal_code"),
            LigneEcriture.debit,
            LigneEcriture.credit,
            LigneEcriture.description,
        )
        .join(LigneEcriture, LigneEcriture.ecriture_id == EcritureComptable.ecriture_id)
        .join(JournalComptable, JournalComptable.journal_id == EcritureComptable.journal_id)
        .filter(LigneEcriture.compte_id == compte_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .order_by(EcritureComptable.date_ecriture, EcritureComptable.ecriture_id)
        .all()
    )
    
    mouvements = []
    solde_progressif = 0
    total_debit = 0
    total_credit = 0
    
    for r in rows:
        d = float(r.debit)
        c = float(r.credit)
        solde_progressif += d - c
        total_debit += d
        total_credit += c
        
        mouvements.append({
            "date": r.date_ecriture.isoformat() if r.date_ecriture else None,
            "journal": r.journal_code,
            "reference": r.reference,
            "libelle": r.ecriture_libelle,
            "description": r.description,
            "debit": d,
            "credit": c,
            "solde_progressif": solde_progressif,
        })
    
    return {
        "compte": {
            "compte_id": compte.compte_id,
            "numero_compte": compte.numero_compte,
            "libelle": compte.libelle,
            "type_compte": compte.type_compte,
        },
        "exercice": {"exercice_id": exo.exercice_id, "annee": exo.annee},
        "mouvements": mouvements,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "solde_final": solde_progressif,
    }


# ============================================================================
# COMPTABILITÉ AUXILIAIRE (SUIVI PARENTS/ÉLÈVES & FOURNISSEURS)
# ============================================================================

@router.get("/auxiliaire/fournisseurs")
def get_auxiliaire_fournisseurs(
    exercice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Liste les fournisseurs avec leur cumul débit/crédit et leur solde."""
    exo = _get_exercice(db, exercice_id)
    
    # Récupérer tous les fournisseurs
    fournisseurs = db.query(Fournisseur).filter(Fournisseur.statut == "ACTIF").all()
    
    # Agrégation des mouvements
    mouvements = (
        db.query(
            LigneEcriture.fournisseur_id,
            func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit")
        )
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .filter(LigneEcriture.fournisseur_id != None)
        .group_by(LigneEcriture.fournisseur_id)
        .all()
    )
    
    mvt_map = {m.fournisseur_id: (float(m.total_debit), float(m.total_credit)) for m in mouvements}
    
    result = []
    for f in fournisseurs:
        td, tc = mvt_map.get(f.fournisseur_id, (0.0, 0.0))
        # Pour un fournisseur, un solde créditeur (tc - td > 0) signifie que l'école lui doit de l'argent
        solde = tc - td
        result.append({
            "fournisseur_id": f.fournisseur_id,
            "code": f.code,
            "nom": f.nom,
            "telephone": f.telephone,
            "email": f.email,
            "adresse": f.adresse,
            "total_debit": td,
            "total_credit": tc,
            "solde": solde, # positif si l'école doit, négatif si trop-payé
        })
        
    return result

@router.post("/auxiliaire/fournisseurs", response_model=FournisseurOut)
def creer_fournisseur(fournisseur: FournisseurCreate, db: Session = Depends(get_db)):
    """Créer un nouveau fournisseur tiers."""
    # Vérifier l'unicité du code
    existing = db.query(Fournisseur).filter(Fournisseur.code == fournisseur.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce code fournisseur existe déjà")
        
    nouveau = Fournisseur(
        etablissement_id=1, # Etablissement par défaut
        code=fournisseur.code,
        nom=fournisseur.nom,
        telephone=fournisseur.telephone,
        email=fournisseur.email,
        adresse=fournisseur.adresse,
        statut="ACTIF"
    )
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.get("/auxiliaire/fournisseurs/{fournisseur_id}/compte")
def get_historique_fournisseur(
    fournisseur_id: int,
    exercice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Historique chronologique des factures et paiements pour un fournisseur."""
    fournisseur = db.query(Fournisseur).filter(Fournisseur.fournisseur_id == fournisseur_id).first()
    if not fournisseur:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")
        
    exo = _get_exercice(db, exercice_id)
    
    rows = (
        db.query(
            EcritureComptable.date_ecriture,
            EcritureComptable.reference,
            EcritureComptable.libelle.label("ecriture_libelle"),
            JournalComptable.code.label("journal_code"),
            LigneEcriture.debit,
            LigneEcriture.credit,
            LigneEcriture.description,
            CompteComptable.numero_compte,
        )
        .join(LigneEcriture, LigneEcriture.ecriture_id == EcritureComptable.ecriture_id)
        .join(JournalComptable, JournalComptable.journal_id == EcritureComptable.journal_id)
        .join(CompteComptable, CompteComptable.compte_id == LigneEcriture.compte_id)
        .filter(LigneEcriture.fournisseur_id == fournisseur_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .order_by(EcritureComptable.date_ecriture, EcritureComptable.ecriture_id)
        .all()
    )
    
    mouvements = []
    solde_progressif = 0.0
    total_debit = 0.0
    total_credit = 0.0
    
    for r in rows:
        d = float(r.debit)
        c = float(r.credit)
        # Pour les fournisseurs : le crédit augmente la dette, le débit la diminue
        solde_progressif += c - d
        total_debit += d
        total_credit += c
        
        mouvements.append({
            "date": r.date_ecriture.isoformat() if r.date_ecriture else None,
            "journal": r.journal_code,
            "reference": r.reference,
            "libelle": r.ecriture_libelle,
            "compte_general": r.numero_compte,
            "description": r.description,
            "debit": d,
            "credit": c,
            "solde_progressif": solde_progressif,
        })
        
    return {
        "fournisseur": {
            "fournisseur_id": fournisseur.fournisseur_id,
            "code": fournisseur.code,
            "nom": fournisseur.nom,
            "telephone": fournisseur.telephone,
        },
        "mouvements": mouvements,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "solde_final": solde_progressif
    }

@router.get("/auxiliaire/parents-eleves")
def get_auxiliaire_parents_eleves(
    exercice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Liste tous les parents/élèves ayant eu des mouvements comptables sur l'exercice."""
    exo = _get_exercice(db, exercice_id)
    
    # Agrégation des écritures par élève
    mouvements = (
        db.query(
            LigneEcriture.eleve_id,
            func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit")
        )
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .filter(LigneEcriture.eleve_id != None)
        .group_by(LigneEcriture.eleve_id)
        .all()
    )
    
    if not mouvements:
        return []
        
    eleve_ids = [m.eleve_id for m in mouvements]
    
    # Récupérer les infos des élèves concernés
    eleves = db.query(Eleve).filter(Eleve.eleve_id.in_(eleve_ids)).all()
    eleve_map = {e.eleve_id: e for e in eleves}
    
    # Récupérer les classes actuelles de ces élèves pour l'exercice
    inscriptions = (
        db.query(Inscription.eleve_id, Classe.code.label("classe_code"))
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.eleve_id.in_(eleve_ids))
        .filter(Inscription.statut == "ACTIVE")
        .all()
    )
    class_map = {i.eleve_id: i.classe_code for i in inscriptions}
    
    result = []
    for m in mouvements:
        el = eleve_map.get(m.eleve_id)
        if not el:
            continue
            
        td = float(m.total_debit)
        tc = float(m.total_credit)
        # Pour un élève/parent, un solde débiteur (td - tc > 0) représente ce qu'il doit à l'école
        solde = td - tc
        
        result.append({
            "eleve_id": el.eleve_id,
            "matricule": el.matricule,
            "nom": el.nom,
            "prenom": el.prenom,
            "classe": class_map.get(el.eleve_id, "N/A"),
            "total_debit": td,
            "total_credit": tc,
            "solde": solde, # positif = à payer par le parent, négatif = trop perçu
        })
        
    return result

@router.get("/auxiliaire/parents-eleves/{eleve_id}/compte")
def get_historique_parent_eleve(
    eleve_id: int,
    exercice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Historique chronologique des factures de scolarité et paiements d'un élève."""
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève introuvable")
        
    exo = _get_exercice(db, exercice_id)
    
    rows = (
        db.query(
            EcritureComptable.date_ecriture,
            EcritureComptable.reference,
            EcritureComptable.libelle.label("ecriture_libelle"),
            JournalComptable.code.label("journal_code"),
            LigneEcriture.debit,
            LigneEcriture.credit,
            LigneEcriture.description,
            CompteComptable.numero_compte,
        )
        .join(LigneEcriture, LigneEcriture.ecriture_id == EcritureComptable.ecriture_id)
        .join(JournalComptable, JournalComptable.journal_id == EcritureComptable.journal_id)
        .join(CompteComptable, CompteComptable.compte_id == LigneEcriture.compte_id)
        .filter(LigneEcriture.eleve_id == eleve_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .order_by(EcritureComptable.date_ecriture, EcritureComptable.ecriture_id)
        .all()
    )
    
    mouvements = []
    solde_progressif = 0.0
    total_debit = 0.0
    total_credit = 0.0
    
    for r in rows:
        d = float(r.debit)
        c = float(r.credit)
        # Pour les clients/élèves : le débit augmente la créance, le crédit la diminue (règlement reçu)
        solde_progressif += d - c
        total_debit += d
        total_credit += c
        
        mouvements.append({
            "date": r.date_ecriture.isoformat() if r.date_ecriture else None,
            "journal": r.journal_code,
            "reference": r.reference,
            "libelle": r.ecriture_libelle,
            "compte_general": r.numero_compte,
            "description": r.description,
            "debit": d,
            "credit": c,
            "solde_progressif": solde_progressif,
        })
        
    return {
        "eleve": {
            "eleve_id": eleve.eleve_id,
            "matricule": eleve.matricule,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
        },
        "mouvements": mouvements,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "solde_final": solde_progressif
    }

