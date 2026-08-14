from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import date
from sqlalchemy import func, case, literal_column, or_
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import require_etablissement, require_roles
from app.models.academique import (
    ParametreComptabilite, ExerciceComptable, JournalComptable,
    CompteComptable, EcritureComptable, LigneEcriture, Comptable,
    Classe, Eleve, Fournisseur, Inscription
)
from app.core.security import hash_password

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

# ── POURQUOI CES DEUX FONCTIONS PRENNENT UN `commit` ─────────────────────────
#
# Elles sont appelées de deux endroits qui n'ont pas du tout les mêmes
# besoins :
#
#   * depuis une route de consultation (journaux, comptes, exercices), où
#     rien d'autre n'est en cours : le seed doit être écrit pour de bon,
#     sinon il recommence à chaque appel ;
#
#   * depuis `generer_ecriture_auto`, donc AU MILIEU d'une opération métier
#     déjà commencée — un encaissement, une dépense de salaire. Là, un
#     `commit` valide tout ce qui précède dans la même transaction, et si la
#     suite échoue, le `rollback` de l'appelant n'a plus rien à reprendre.
#
# Constaté sur la paie : deux dépenses de salaire enregistrées en
# comptabilité SANS bulletin de paie correspondant. De l'argent sorti des
# comptes sans trace de qui l'a reçu. `generer_ecriture_auto` promet dans sa
# docstring qu'elle ne commite pas ; c'était son propre premier appel qui
# rompait la promesse.

def init_comptabilite_globals(db: Session, commit: bool = True):
    """Seed des référentiels GLOBAUX (partagés par toutes les écoles) : codes
    journaux SYSCOHADA et plan comptable OHADA de base. Ne dépend d'aucun
    établissement — voir la classification GLOBAL/TENANT du chantier
    multi-écoles (.ai/MULTI_TENANT_PLAN.md, section E). JournalComptable et
    CompteComptable restent volontairement globaux dans ce chantier (décision
    produit validée : référentiel SYSCOHADA/OHADA partagé).

    `commit=False` quand on est déjà dans une transaction métier : voir la
    note d'atomicité ci-dessus."""
    if db.query(JournalComptable).count() == 0:
        db.add_all([
            JournalComptable(code='AC', nom='Achats', type_journal='ACHAT'),
            JournalComptable(code='VE', nom='Ventes', type_journal='VENTE'),
            JournalComptable(code='BQ', nom='Banque', type_journal='TRESORERIE'),
            JournalComptable(code='CA', nom='Caisse', type_journal='TRESORERIE'),
            JournalComptable(code='OD', nom='Opérations Diverses', type_journal='OD')
        ])

    if db.query(CompteComptable).count() == 0:
        db.add_all([
            CompteComptable(numero_compte="4111", libelle="Parents et Élèves", type_compte="ACTIF"),
            CompteComptable(numero_compte="5211", libelle="Banque locale", type_compte="ACTIF"),
            CompteComptable(numero_compte="5711", libelle="Caisse principale", type_compte="ACTIF"),
            CompteComptable(numero_compte="6011", libelle="Achat de marchandises", type_compte="CHARGE"),
            CompteComptable(numero_compte="7011", libelle="Ventes de marchandises", type_compte="PRODUIT"),
            CompteComptable(numero_compte="7061", libelle="Prestations de services (Scolarité)", type_compte="PRODUIT"),
        ])
    db.commit() if commit else db.flush()


def init_comptabilite_tenant_defaults(db: Session, etablissement_id: int, commit: bool = True):
    """Seed des données TENANT propres à un établissement : PIN d'accès et
    exercice comptable par défaut. Avant le Lot 1 du chantier multi-écoles,
    ces deux éléments étaient uniques pour TOUTE la plateforme (un seul PIN,
    un seul exercice '2026' possible) — voir
    migrations/lot1_comptabilite_etablissement.py. Chaque établissement
    obtient désormais les siens, indépendants des autres écoles."""
    pin_param = db.query(ParametreComptabilite).filter(
        ParametreComptabilite.cle == 'PIN_ACCESS',
        ParametreComptabilite.etablissement_id == etablissement_id,
    ).first()
    if not pin_param:
        db.add(ParametreComptabilite(cle='PIN_ACCESS', valeur='123000', etablissement_id=etablissement_id))

    exo = db.query(ExerciceComptable).filter(
        ExerciceComptable.annee == '2026',
        ExerciceComptable.etablissement_id == etablissement_id,
    ).first()
    if not exo:
        db.add(ExerciceComptable(
            annee='2026', date_debut=date(2026, 1, 1), date_fin=date(2026, 12, 31),
            statut="OUVERT", etablissement_id=etablissement_id,
        ))

    # Comptable : table vestigiale — l'authentification dédiée a été retirée
    # (voir plus bas), conservée seulement pour compatibilité de schéma.
    # nom_utilisateur suffixé par l'établissement pour respecter la
    # contrainte UNIQUE globale existante sur cette colonne (non modifiée
    # dans ce lot : table morte, hors périmètre).
    if db.query(Comptable).filter(Comptable.etablissement_id == etablissement_id).count() == 0:
        db.add(Comptable(
            etablissement_id=etablissement_id,
            nom_utilisateur=f"sams-{etablissement_id}",
            mot_de_passe=hash_password("smart2025"),
            nom="Camara",
            prenom="Mohamed Sams Deen",
            statut="ACTIF",
        ))

    db.commit() if commit else db.flush()


def _get_exercice(db: Session, etablissement_id: int, exercice_id: Optional[int] = None) -> ExerciceComptable:
    """Récupère l'exercice demandé — vérifié appartenir à l'établissement
    appelant, jamais un exercice d'une autre école même si son ID est deviné
    — ou l'exercice ouvert par défaut de cet établissement.

    Seede les valeurs par défaut de CET établissement avant de chercher :
    avant le Lot 1, un seul exercice existait pour TOUTE la plateforme, donc
    n'importe quelle route pouvait compter sur le fait qu'il avait déjà été
    créé par une autre école. Depuis que chaque établissement a le sien,
    toute route qui dépend d'un exercice "ouvert" doit garantir elle-même
    qu'il existe déjà pour CET établissement, sinon une école tout juste
    créée échouerait en 400 dès sa première consultation (Balance, Grand
    Livre, Fournisseurs...) sans jamais être passée par /exercices ou /pin."""
    init_comptabilite_tenant_defaults(db, etablissement_id)
    if exercice_id:
        exo = db.query(ExerciceComptable).filter(
            ExerciceComptable.exercice_id == exercice_id,
            ExerciceComptable.etablissement_id == etablissement_id,
        ).first()
        if not exo:
            raise HTTPException(status_code=404, detail="Exercice introuvable")
        return exo
    exo = db.query(ExerciceComptable).filter(
        ExerciceComptable.statut == "OUVERT",
        ExerciceComptable.etablissement_id == etablissement_id,
    ).first()
    if not exo:
        raise HTTPException(status_code=400, detail="Aucun exercice comptable ouvert")
    return exo


# ============================================================================
# PONT AUTOMATIQUE FINANCE -> COMPTABILITÉ GÉNÉRALE (SYSCOHADA)
# ============================================================================
# Objectif : chaque opération financière réelle (facture, paiement, dépense,
# salaire) enregistrée depuis le module Finance (backend/app/api/finance.py)
# génère automatiquement une écriture comptable équilibrée ici, pour que la
# Balance, le Grand Livre, le Compte de Résultat et la Comptabilité Auxiliaire
# reflètent toujours la réalité sans double saisie manuelle.

# (numero_compte, libellé, type_compte)
COMPTE_ELEVES = ("4111", "Parents et Élèves", "ACTIF")
COMPTE_PRODUITS_SCOLARITE = ("7061", "Prestations de services (Scolarité)", "PRODUIT")
COMPTE_BANQUE = ("5211", "Banque locale", "ACTIF")
COMPTE_CAISSE = ("5711", "Caisse principale", "ACTIF")
COMPTE_MOBILE_MONEY = ("5715", "Mobile Money", "ACTIF")

COMPTES_CHARGE_PAR_CATEGORIE = {
    "SALAIRES": ("6611", "Charges de personnel", "CHARGE"),
    "FOURNITURES": ("6041", "Fournitures scolaires et administratives", "CHARGE"),
    "LOYER": ("6221", "Locations immobilières", "CHARGE"),
    "ENTRETIEN": ("6151", "Entretien et réparations", "CHARGE"),
}
COMPTE_CHARGE_DEFAUT = ("6288", "Autres charges diverses", "CHARGE")


def _get_or_create_compte(db: Session, compte_tuple) -> CompteComptable:
    numero_compte, libelle, type_compte = compte_tuple
    compte = db.query(CompteComptable).filter(CompteComptable.numero_compte == numero_compte).first()
    if not compte:
        compte = CompteComptable(numero_compte=numero_compte, libelle=libelle, type_compte=type_compte)
        db.add(compte)
        db.flush()
    return compte


def compte_tresorerie_pour_mode(mode_paiement: Optional[str]):
    """Retourne (compte_tuple, code_journal) selon le mode de paiement utilisé."""
    mode = (mode_paiement or "").upper()
    if mode in ("VIREMENT", "CHEQUE"):
        return COMPTE_BANQUE, "BQ"
    if mode in ("MOBILE_MONEY", "ORANGE_MONEY", "MTN_MONEY"):
        return COMPTE_MOBILE_MONEY, "CA"
    return COMPTE_CAISSE, "CA"


def compte_charge_pour_categorie(categorie: Optional[str]):
    cle = (categorie or "").strip().upper()
    return COMPTES_CHARGE_PAR_CATEGORIE.get(cle, COMPTE_CHARGE_DEFAUT)


def generer_ecriture_auto(
    db: Session,
    date_ecriture,
    journal_code: str,
    libelle: str,
    reference: Optional[str],
    lignes: list,
    etablissement_id: Optional[int],
) -> Optional[int]:
    """
    Crée une écriture comptable équilibrée dans LA MÊME transaction que
    l'opération métier appelante (aucun commit ici : c'est l'appelant qui
    commit le tout ensemble, pour garantir l'atomicité paiement <-> écriture).

    `lignes` : liste de dicts avec les clés
        compte (tuple numero/libelle/type), debit, credit,
        description, classe_id, eleve_id, fournisseur_id (optionnels).

    `etablissement_id` : établissement propriétaire de l'écriture — dérivé
    par l'appelant depuis une ressource déjà connue (jamais deviné ni
    défaulté à 1). Si absent (ex: inscription/facture introuvable côté
    appelant), aucune écriture n'est générée : voir le repli ci-dessous.

    Retourne l'ecriture_id, ou None si rien n'a pu être généré (ex: aucun
    établissement/exercice/journal disponible, ou lignes déséquilibrées) —
    dans ce cas l'opération métier d'origine n'est PAS bloquée par cette
    fonction, mais l'appelant doit alors décider quoi faire (voir usages
    dans finance.py).
    """
    if not etablissement_id:
        return None

    # `commit=False` : on est au milieu de l'opération métier de l'appelant.
    init_comptabilite_globals(db, commit=False)
    init_comptabilite_tenant_defaults(db, etablissement_id, commit=False)

    exo = db.query(ExerciceComptable).filter(
        ExerciceComptable.statut == "OUVERT",
        ExerciceComptable.etablissement_id == etablissement_id,
    ).first()
    journal = db.query(JournalComptable).filter(JournalComptable.code == journal_code).first()
    if not exo or not journal:
        return None

    total_debit = round(sum(float(l.get("debit") or 0) for l in lignes), 2)
    total_credit = round(sum(float(l.get("credit") or 0) for l in lignes), 2)
    if total_debit != total_credit or total_debit == 0:
        return None

    ecriture = EcritureComptable(
        date_ecriture=date_ecriture,
        journal_id=journal.journal_id,
        reference=reference,
        libelle=libelle,
        exercice_id=exo.exercice_id,
        etablissement_id=etablissement_id,
    )
    db.add(ecriture)
    db.flush()

    for l in lignes:
        compte = _get_or_create_compte(db, l["compte"])
        db.add(LigneEcriture(
            ecriture_id=ecriture.ecriture_id,
            compte_id=compte.compte_id,
            debit=l.get("debit") or 0,
            credit=l.get("credit") or 0,
            description=l.get("description"),
            classe_id=l.get("classe_id"),
            eleve_id=l.get("eleve_id"),
            fournisseur_id=l.get("fournisseur_id"),
        ))
    db.flush()
    return ecriture.ecriture_id


# --- ROUTES ---

# NOTE: L'ancienne authentification maison ("POST /auth" + modèle Comptable +
# JWT type="comptable") a été retirée : elle créait une double session en
# parallèle du JWT principal SmartSchool (localStorage smartschool_token +
# sessionStorage comptabilite_auth), ce qui fragilisait la session globale
# (un 401 sur ce module pouvait déconnecter tout l'admin). L'accès au module
# Comptabilité passe désormais uniquement par le JWT principal + les rôles
# FINANCE_ROLES (voir backend/main.py), exactement comme le module Finance.

# ============================================================================
# PIN D'ACCÈS COMPTABILITÉ — code additionnel demandé avant certaines actions
# sensibles côté frontend (indépendant du JWT). Ces deux routes n'existaient
# pas côté backend alors que le frontend (parametres/finance et profil) les
# appelait déjà, causant des 404 systématiques.
# ============================================================================

class PinChangeRequest(BaseModel):
    ancien_pin: str
    nouveau_pin: str

@router.get("/pin/status")
def get_pin_status(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    init_comptabilite_tenant_defaults(db, etablissement_id)
    param = db.query(ParametreComptabilite).filter(
        ParametreComptabilite.cle == "PIN_ACCESS",
        ParametreComptabilite.etablissement_id == etablissement_id,
    ).first()
    return {"configured": bool(param and param.valeur)}

@router.put("/pin")
def changer_pin(data: PinChangeRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    init_comptabilite_tenant_defaults(db, etablissement_id)
    param = db.query(ParametreComptabilite).filter(
        ParametreComptabilite.cle == "PIN_ACCESS",
        ParametreComptabilite.etablissement_id == etablissement_id,
    ).first()
    if not param or param.valeur != data.ancien_pin:
        raise HTTPException(status_code=400, detail="PIN actuel incorrect")
    if not data.nouveau_pin or len(data.nouveau_pin) < 4:
        raise HTTPException(status_code=400, detail="Le nouveau PIN doit contenir au moins 4 caractères")
    param.valeur = data.nouveau_pin
    db.commit()
    return {"message": "PIN mis à jour avec succès"}


@router.get("/journaux", response_model=List[JournalOut])
def get_journaux(db: Session = Depends(get_db)):
    # GLOBAL (référentiel SYSCOHADA partagé) — pas de filtre par établissement.
    init_comptabilite_globals(db)
    return db.query(JournalComptable).all()

@router.post("/journaux", response_model=JournalOut,
             dependencies=[Depends(require_roles("SUPER_ADMIN"))])
def create_journal(journal: JournalCreate, db: Session = Depends(get_db)):
    """Le referentiel des journaux est PARTAGE par toutes les ecoles : y
    ajouter une ligne l'ajoute pour tout le monde. Reserve a l'editeur de
    la plateforme — une ecole ne decide pas du plan comptable des autres."""
    db_journal = db.query(JournalComptable).filter(JournalComptable.code == journal.code).first()
    if db_journal:
        raise HTTPException(status_code=400, detail="Ce code journal existe déjà")

    nouveau = JournalComptable(**journal.dict())
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.get("/exercices", response_model=List[ExerciceOut])
def get_exercices(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    init_comptabilite_tenant_defaults(db, etablissement_id)
    return (
        db.query(ExerciceComptable)
        .filter(ExerciceComptable.etablissement_id == etablissement_id)
        .order_by(ExerciceComptable.annee.desc())
        .all()
    )

@router.post("/exercices", response_model=ExerciceOut)
def create_exercice(exo: ExerciceCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    db_exo = db.query(ExerciceComptable).filter(
        ExerciceComptable.annee == exo.annee,
        ExerciceComptable.etablissement_id == etablissement_id,
    ).first()
    if db_exo:
        raise HTTPException(status_code=400, detail="Cet exercice existe déjà")

    nouveau = ExerciceComptable(**exo.dict(), statut="OUVERT", etablissement_id=etablissement_id)
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.get("/comptes", response_model=List[CompteOut])
def get_comptes(db: Session = Depends(get_db)):
    # GLOBAL (plan comptable OHADA partagé) — pas de filtre par établissement.
    init_comptabilite_globals(db)
    return db.query(CompteComptable).order_by(CompteComptable.numero_compte).all()

@router.post("/comptes", response_model=CompteOut,
             dependencies=[Depends(require_roles("SUPER_ADMIN"))])
def create_compte(compte: CompteCreate, db: Session = Depends(get_db)):
    """Meme raison que pour les journaux : le plan comptable OHADA est
    commun, seul l'editeur de la plateforme l'etend."""
    db_compte = db.query(CompteComptable).filter(CompteComptable.numero_compte == compte.numero_compte).first()
    if db_compte:
        raise HTTPException(status_code=400, detail="Ce numéro de compte existe déjà")
    
    nouveau = CompteComptable(**compte.dict())
    db.add(nouveau)
    db.commit()
    db.refresh(nouveau)
    return nouveau

@router.post("/ecritures")
def creer_ecriture(ecriture: EcritureCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # 1. Vérifier l'équilibre
    total_debit = sum(l.debit for l in ecriture.lignes)
    total_credit = sum(l.credit for l in ecriture.lignes)
    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(status_code=400, detail=f"L'écriture n'est pas équilibrée (Débit: {total_debit}, Crédit: {total_credit})")

    if len(ecriture.lignes) < 2:
        raise HTTPException(status_code=400, detail="Une écriture doit comporter au moins 2 lignes")

    # 2. Trouver l'exercice courant de CET établissement (jamais un autre) —
    # _get_exercice seede aussi les valeurs par défaut si c'est la toute
    # première action comptable de cet établissement.
    exo = _get_exercice(db, etablissement_id)

    # 2bis. Vérifier que les axes analytiques référencés (classe/élève/
    # fournisseur) appartiennent bien à CET établissement — une écriture
    # manuelle ne doit jamais pouvoir pointer vers une ressource d'une autre
    # école (les comptes/journaux restent GLOBAUX, pas de vérification pour eux).
    classe_ids = {l.classe_id for l in ecriture.lignes if l.classe_id}
    eleve_ids = {l.eleve_id for l in ecriture.lignes if l.eleve_id}
    fournisseur_ids = {l.fournisseur_id for l in ecriture.lignes if l.fournisseur_id}

    if classe_ids:
        trouvees = {c.classe_id for c in db.query(Classe.classe_id).filter(
            Classe.classe_id.in_(classe_ids), Classe.etablissement_id == etablissement_id
        ).all()}
        if trouvees != classe_ids:
            raise HTTPException(status_code=403, detail="Classe(s) référencée(s) invalide(s) pour cet établissement")

    if eleve_ids:
        trouvees = {e.eleve_id for e in db.query(Eleve.eleve_id).filter(
            Eleve.eleve_id.in_(eleve_ids), Eleve.etablissement_id == etablissement_id
        ).all()}
        if trouvees != eleve_ids:
            raise HTTPException(status_code=403, detail="Élève(s) référencé(s) invalide(s) pour cet établissement")

    if fournisseur_ids:
        trouvees = {f.fournisseur_id for f in db.query(Fournisseur.fournisseur_id).filter(
            Fournisseur.fournisseur_id.in_(fournisseur_ids), Fournisseur.etablissement_id == etablissement_id
        ).all()}
        if trouvees != fournisseur_ids:
            raise HTTPException(status_code=403, detail="Fournisseur(s) référencé(s) invalide(s) pour cet établissement")

    # 3. Créer l'entête
    new_ecriture = EcritureComptable(
        date_ecriture=ecriture.date_ecriture,
        journal_id=ecriture.journal_id,
        reference=ecriture.reference,
        libelle=ecriture.libelle,
        exercice_id=exo.exercice_id,
        etablissement_id=etablissement_id,
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
def get_ecritures(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    ecritures = (
        db.query(EcritureComptable)
        .filter(EcritureComptable.etablissement_id == etablissement_id)
        .order_by(EcritureComptable.date_ecriture.desc(), EcritureComptable.created_at.desc())
        .limit(100)
        .all()
    )
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
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Balance Générale des comptes.
    Calcule côté serveur le cumul débit/crédit et les soldes (débiteur/créditeur)
    pour chaque compte ayant eu des mouvements durant l'exercice.
    """
    exo = _get_exercice(db, etablissement_id, exercice_id)

    # Agrégation SQL par compte — filtre double (exercice + etablissement_id)
    # : le filtre par exercice suffit en théorie (un exercice appartient à un
    # seul établissement), mais le filtre explicite est conservé en défense
    # en profondeur plutôt que de reposer uniquement sur une garantie indirecte.
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
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Compte de Résultat avec option de ventilation analytique.
    - Charges = comptes commençant par '6'
    - Produits = comptes commençant par '7'
    - group_by permet de ventiler par classe, élève ou département
    """
    exo = _get_exercice(db, etablissement_id, exercice_id)
    
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
            .filter(EcritureComptable.etablissement_id == etablissement_id)
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
            .filter(EcritureComptable.etablissement_id == etablissement_id)
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
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Grand Livre : toutes les écritures détaillées, groupées par compte,
    avec solde progressif.
    """
    exo = _get_exercice(db, etablissement_id, exercice_id)

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
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Détail des mouvements d'un compte spécifique avec solde progressif.
    Le compte lui-même est GLOBAL (plan comptable partagé) — seuls les
    mouvements (écritures) sont scopés par établissement.
    """
    compte = db.query(CompteComptable).filter(CompteComptable.compte_id == compte_id).first()
    if not compte:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    exo = _get_exercice(db, etablissement_id, exercice_id)

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
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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
    response: Response,
    exercice_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste les fournisseurs de CET établissement avec leur cumul débit/crédit
    et leur solde. Avant le Lot 1 du chantier multi-écoles, cette route
    retournait TOUS les fournisseurs de la plateforme sans distinction
    d'établissement — corrigé ici."""
    exo = _get_exercice(db, etablissement_id, exercice_id)

    # Récupérer les fournisseurs de CET établissement uniquement
    fq = db.query(Fournisseur).filter(
        Fournisseur.statut == "ACTIF",
        Fournisseur.etablissement_id == etablissement_id,
    )
    if search:
        like = f"%{search}%"
        fq = fq.filter(or_(Fournisseur.nom.ilike(like), Fournisseur.code.ilike(like)))
    fournisseurs = fq.all()

    # Agrégation des mouvements
    mouvements = (
        db.query(
            LigneEcriture.fournisseur_id,
            func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit")
        )
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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

    total = len(result)
    response.headers["X-Total-Count"] = str(total)
    return result[skip:skip + limit]

@router.post("/auxiliaire/fournisseurs", response_model=FournisseurOut)
def creer_fournisseur(fournisseur: FournisseurCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Créer un nouveau fournisseur tiers, rattaché à l'établissement du
    compte authentifié (jamais une valeur par défaut codée en dur)."""
    # Vérifier l'unicité du code
    # NOTE : Fournisseur.code est UNIQUE au niveau de TOUTE la plateforme
    # (contrainte DB existante, non modifiée dans ce lot — voir le rapport de
    # fin de Lot 1, "problèmes restants" : deux écoles ne peuvent pas encore
    # utiliser le même code fournisseur).
    existing = db.query(Fournisseur).filter(Fournisseur.code == fournisseur.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce code fournisseur existe déjà")

    nouveau = Fournisseur(
        etablissement_id=etablissement_id,
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
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Historique chronologique des factures et paiements pour un fournisseur.
    Vérifie que le fournisseur appartient bien à l'établissement appelant —
    avant le Lot 1, n'importe quel fournisseur_id deviné était accessible
    depuis n'importe quelle école."""
    fournisseur = db.query(Fournisseur).filter(
        Fournisseur.fournisseur_id == fournisseur_id,
        Fournisseur.etablissement_id == etablissement_id,
    ).first()
    if not fournisseur:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")

    exo = _get_exercice(db, etablissement_id, exercice_id)

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
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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
    response: Response,
    exercice_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste les parents/élèves de CET établissement ayant eu des mouvements
    comptables sur l'exercice. Avant le Lot 1, cette route retournait les
    élèves de TOUTE la plateforme sans distinction d'établissement — l'une
    des fuites les plus sensibles trouvées lors de l'audit (soldes financiers
    d'élèves d'autres écoles visibles)."""
    exo = _get_exercice(db, etablissement_id, exercice_id)

    # Agrégation des écritures par élève, restreinte à CET établissement
    mouvements = (
        db.query(
            LigneEcriture.eleve_id,
            func.coalesce(func.sum(LigneEcriture.debit), 0).label("total_debit"),
            func.coalesce(func.sum(LigneEcriture.credit), 0).label("total_credit")
        )
        .join(EcritureComptable, EcritureComptable.ecriture_id == LigneEcriture.ecriture_id)
        .filter(EcritureComptable.exercice_id == exo.exercice_id)
        .filter(EcritureComptable.etablissement_id == etablissement_id)
        .filter(LigneEcriture.eleve_id != None)
        .group_by(LigneEcriture.eleve_id)
        .all()
    )

    if not mouvements:
        response.headers["X-Total-Count"] = "0"
        return []

    eleve_ids = [m.eleve_id for m in mouvements]

    # Récupérer les infos des élèves concernés — filtre etablissement_id en
    # défense en profondeur (déjà implicitement garanti par le filtre sur
    # les écritures ci-dessus, mais jamais supposé).
    eleves = db.query(Eleve).filter(
        Eleve.eleve_id.in_(eleve_ids), Eleve.etablissement_id == etablissement_id
    ).all()
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

    if search:
        q = search.lower()
        result = [
            r for r in result
            if q in r["nom"].lower() or q in r["prenom"].lower()
            or q in (r["matricule"] or "").lower() or q in (r["classe"] or "").lower()
        ]

    total = len(result)
    response.headers["X-Total-Count"] = str(total)
    return result[skip:skip + limit]

@router.get("/auxiliaire/parents-eleves/{eleve_id}/compte")
def get_historique_parent_eleve(
    eleve_id: int,
    exercice_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Historique chronologique des factures de scolarité et paiements d'un
    élève. Vérifie que l'élève appartient bien à l'établissement appelant —
    avant le Lot 1, n'importe quel eleve_id deviné exposait l'historique
    financier complet de cet élève, quelle que soit son école."""
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève introuvable")

    exo = _get_exercice(db, etablissement_id, exercice_id)

    inscription_active = (
        db.query(Inscription)
        .filter(Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE")
        .order_by(Inscription.inscription_id.desc())
        .first()
    )

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
        .filter(EcritureComptable.etablissement_id == etablissement_id)
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
            "inscription_id": inscription_active.inscription_id if inscription_active else None,
        },
        "mouvements": mouvements,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "solde_final": solde_progressif
    }

