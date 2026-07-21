"""
SMARTSCHOOL API — Routes Finance (TypesFrais, Factures, Échéanciers, Paiements, Dépenses)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date as date_type
from app.core.database import get_db
from app.models.academique import (
    TypeFrais, Facture, EcheanceFacture, Paiement, Depense,
    Inscription, Classe, Eleve, AnneeScolaire, Enseignant, Utilisateur
)
from app.schemas.schemas import (
    TypeFraisCreate, TypeFraisOut,
    FactureCreate, FactureOut,
    EcheanceFactureOut,
    PaiementCreate, PaiementOut,
    DepenseCreate, DepenseOut
)

router = APIRouter(prefix="/api/finance", tags=["Finance"])


# ============================================================================
# PARAMÈTRES FINANCIERS — lecture des réglages configurables via /parametres/finance
# (stockés dans ss_parametres, categorie='FINANCE')
# ============================================================================
import json as _json

FINANCE_DEFAULTS = {
    "devise": "GNF",
    "modes_paiement": ["ESPECES", "VIREMENT", "ORANGE_MONEY", "MTN_MONEY", "CHEQUE"],
    "frequence_paiement": "ANNUEL",
    "recu_prefixe": "REC",
    "penalite_active": False,
    "penalite_type": "POURCENTAGE",  # POURCENTAGE | MONTANT
    "penalite_valeur": 0,
    "penalite_delai_jours": 0,
    "reduction_active": False,
    "reductions": [],  # ex: [{"rang": 2, "pourcentage": 10}, {"rang": 3, "pourcentage": 15}]
}


def get_finance_settings(db: Session, etablissement_id: int = 1) -> dict:
    """Lit les paramètres de la catégorie FINANCE (ss_parametres), avec valeurs par défaut."""
    from app.models.academique import ParametreEtablissement
    settings = dict(FINANCE_DEFAULTS)
    rows = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "FINANCE"
    ).all()
    for row in rows:
        key = row.cle.replace("finance.", "")
        if key not in FINANCE_DEFAULTS:
            continue
        try:
            if row.type_valeur == "BOOLEAN":
                settings[key] = row.valeur == "true"
            elif row.type_valeur == "NUMBER":
                settings[key] = float(row.valeur)
            elif row.type_valeur == "JSON":
                settings[key] = _json.loads(row.valeur)
            else:
                settings[key] = row.valeur
        except (ValueError, _json.JSONDecodeError):
            continue
    return settings


def calculer_rang_fratrie(db: Session, eleve_id: int, annee_id: int) -> int:
    """Calcule le rang (1er, 2e, 3e enfant...) d'un élève parmi les enfants actifs
    liés au(x) même(s) parent(s), triés par date de naissance (aîné = rang 1)."""
    from app.models.academique import EleveParent

    lien = db.query(EleveParent).filter(EleveParent.eleve_id == eleve_id).first()
    if not lien:
        return 1

    freres_ids = [
        l.eleve_id for l in
        db.query(EleveParent).filter(EleveParent.parent_id == lien.parent_id).all()
    ]
    if len(freres_ids) <= 1:
        return 1

    freres = (
        db.query(Eleve)
        .join(Inscription, Inscription.eleve_id == Eleve.eleve_id)
        .filter(
            Eleve.eleve_id.in_(freres_ids),
            Inscription.annee_id == annee_id,
            Inscription.statut == "ACTIVE"
        )
        .order_by(Eleve.date_naissance.asc())
        .distinct()
        .all()
    )
    for idx, e in enumerate(freres, start=1):
        if e.eleve_id == eleve_id:
            return idx
    return 1


def calculer_reduction_montant(montant: float, rang: int, settings: dict) -> float:
    """Retourne le montant de la réduction fratrie applicable (0 si aucune règle ne correspond)."""
    if not settings.get("reduction_active"):
        return 0.0
    for regle in settings.get("reductions") or []:
        try:
            if int(regle.get("rang")) == rang:
                pourcentage = float(regle.get("pourcentage", 0))
                return round(montant * pourcentage / 100, 2)
        except (TypeError, ValueError):
            continue
    return 0.0


def calculer_penalite(montant_restant: float, jours_retard: int, settings: dict) -> float:
    """Calcule la pénalité de retard applicable, si activée et le délai de grâce dépassé."""
    if not settings.get("penalite_active") or jours_retard <= 0:
        return 0.0
    delai = int(settings.get("penalite_delai_jours", 0) or 0)
    if jours_retard <= delai:
        return 0.0
    if settings.get("penalite_type") == "MONTANT":
        return float(settings.get("penalite_valeur", 0) or 0)
    pourcentage = float(settings.get("penalite_valeur", 0) or 0)
    return round(montant_restant * pourcentage / 100, 2)


# ============================================================================
# TYPES DE FRAIS
# ============================================================================

@router.get("/types-frais", response_model=List[TypeFraisOut])
def list_types_frais(db: Session = Depends(get_db)):
    return db.query(TypeFrais).order_by(TypeFrais.categorie, TypeFrais.libelle).all()


@router.post("/types-frais", response_model=TypeFraisOut, status_code=201)
def create_type_frais(data: TypeFraisCreate, db: Session = Depends(get_db)):
    existing = db.query(TypeFrais).filter(TypeFrais.code == data.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Le code '{data.code}' est déjà utilisé")
    tf = TypeFrais(
        code=data.code.upper(),
        libelle=data.libelle,
        categorie=data.categorie,
        montant_defaut=data.montant_defaut,
        est_obligatoire=data.est_obligatoire,
        frequence=data.frequence,
        statut="ACTIF"
    )
    db.add(tf)
    db.commit()
    db.refresh(tf)
    return tf


@router.put("/types-frais/{type_frais_id}", response_model=TypeFraisOut)
def update_type_frais(type_frais_id: int, data: TypeFraisCreate, db: Session = Depends(get_db)):
    tf = db.query(TypeFrais).filter(TypeFrais.type_frais_id == type_frais_id).first()
    if not tf:
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")
    # Check code uniqueness if changed
    if data.code.upper() != tf.code:
        existing = db.query(TypeFrais).filter(TypeFrais.code == data.code.upper()).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Le code '{data.code}' est déjà utilisé")
    tf.code = data.code.upper()
    tf.libelle = data.libelle
    tf.categorie = data.categorie
    tf.montant_defaut = data.montant_defaut
    tf.est_obligatoire = data.est_obligatoire
    tf.frequence = data.frequence
    db.commit()
    db.refresh(tf)
    return tf


@router.delete("/types-frais/{type_frais_id}")
def delete_type_frais(type_frais_id: int, db: Session = Depends(get_db)):
    tf = db.query(TypeFrais).filter(TypeFrais.type_frais_id == type_frais_id).first()
    if not tf:
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")
    # Check if any facture is linked
    linked = db.query(Facture).filter(Facture.type_frais_id == type_frais_id).count()
    if linked > 0:
        raise HTTPException(status_code=400, detail=f"Ce type de frais est lié à {linked} facture(s). Impossible de le supprimer.")
    db.delete(tf)
    db.commit()
    return {"message": "Type de frais supprimé"}


# ============================================================================
# FACTURES — avec info élève
# ============================================================================

@router.get("/factures")
def list_factures(
    etablissement_id: int = 1,
    annee_id: int = 1,
    statut: Optional[str] = None,
    classe_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retourne toutes les factures avec infos élève, classe et type de frais."""
    query = (
        db.query(Facture, Eleve, Classe, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id
        )
    )
    if statut:
        query = query.filter(Facture.statut == statut)
    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)

    results = query.order_by(Facture.date_facture.desc()).offset(skip).limit(limit).all()

    factures = []
    for facture, eleve, classe, type_frais in results:
        echeances = db.query(EcheanceFacture).filter(EcheanceFacture.facture_id == facture.facture_id).all()
        factures.append({
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "date_facture": str(facture.date_facture) if facture.date_facture else None,
            "montant_total": float(facture.montant_total or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": float(facture.montant_restant or 0),
            "statut": facture.statut,
            "inscription_id": facture.inscription_id,
            "type_frais_id": facture.type_frais_id,
            "type_frais_libelle": type_frais.libelle if type_frais else "N/A",
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "classe_nom": classe.libelle,
            "classe_id": classe.classe_id,
            "echeances": [
                {
                    "echeance_id": e.echeance_id,
                    "libelle": e.libelle,
                    "date_limite": str(e.date_limite),
                    "montant_attendu": float(e.montant_attendu or 0),
                    "montant_paye": float(e.montant_paye or 0),
                    "statut": e.statut
                } for e in echeances
            ]
        })
    return factures


@router.get("/factures/stats")
def stats_factures(etablissement_id: int = 1, annee_id: int = 1, db: Session = Depends(get_db)):
    query_base = (
        db.query(Facture)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id)
    )

    total_facture = query_base.with_entities(func.coalesce(func.sum(Facture.montant_net), 0)).scalar()
    total_paye = query_base.with_entities(func.coalesce(func.sum(Facture.montant_paye), 0)).scalar()
    total_restant = query_base.with_entities(func.coalesce(func.sum(Facture.montant_restant), 0)).scalar()

    nb_payees = query_base.filter(Facture.statut == "PAYEE").count()
    nb_en_retard = query_base.filter(Facture.statut == "EN_RETARD").count()
    nb_en_attente = query_base.filter(Facture.statut == "EN_ATTENTE").count()
    nb_partielles = query_base.filter(Facture.statut == "PARTIELLEMENT_PAYEE").count()

    return {
        "total_facture": float(total_facture),
        "total_paye": float(total_paye),
        "total_restant": float(total_restant),
        "taux_recouvrement": round(float(total_paye) / float(total_facture) * 100, 1) if float(total_facture) > 0 else 0,
        "nb_payees": nb_payees,
        "nb_en_retard": nb_en_retard,
        "nb_en_attente": nb_en_attente,
        "nb_partielles": nb_partielles,
        "total_factures": nb_payees + nb_en_retard + nb_en_attente + nb_partielles
    }


@router.post("/factures", status_code=201)
def create_facture(data: FactureCreate, db: Session = Depends(get_db)):
    """Crée une facture pour une inscription avec possibilité d'échéancier."""
    # Vérifier l'inscription
    inscription = db.query(Inscription).filter(Inscription.inscription_id == data.inscription_id).first()
    if not inscription:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    # Vérifier le type de frais
    type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == data.type_frais_id).first()
    if not type_frais:
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")

    # Valider les échéances si fournies
    if data.echeances:
        total_echeances = sum(e.montant_attendu for e in data.echeances)
        if abs(total_echeances - data.montant_total) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"La somme des échéances ({total_echeances:,.0f}) doit être égale au montant total ({data.montant_total:,.0f})"
            )

    # Générer numéro de facture en se basant sur le numéro le plus élevé existant (évite les doublons)
    last_facture = db.query(Facture).order_by(Facture.numero_facture.desc()).first()
    if last_facture and last_facture.numero_facture.startswith("FAC-"):
        try:
            max_num = int(last_facture.numero_facture.split("-")[1])
        except ValueError:
            max_num = 0
    else:
        max_num = 0
    numero_facture = f"FAC-{max_num + 1:06d}"

    facture = Facture(
        inscription_id=data.inscription_id,
        type_frais_id=data.type_frais_id,
        numero_facture=numero_facture,
        montant_total=data.montant_total,
        montant_remise=0,
        montant_net=data.montant_total,
        montant_paye=0,
        montant_restant=data.montant_total,
        statut="EN_ATTENTE"
    )
    db.add(facture)
    db.flush()  # Pour obtenir l'ID

    # Créer les échéances
    for ech_data in data.echeances:
        echeance = EcheanceFacture(
            facture_id=facture.facture_id,
            libelle=ech_data.libelle,
            date_limite=ech_data.date_limite,
            montant_attendu=ech_data.montant_attendu,
            montant_paye=0,
            statut="EN_ATTENTE"
        )
        db.add(echeance)

    db.commit()
    db.refresh(facture)

    return {
        "facture_id": facture.facture_id,
        "numero_facture": facture.numero_facture,
        "montant_total": float(facture.montant_total),
        "statut": facture.statut,
        "message": f"Facture {numero_facture} créée avec succès"
    }


from app.schemas.schemas import GenererFacturesClasseRequest

@router.post("/factures/generer-classe", status_code=201)
def generer_factures_classe(
    data: GenererFacturesClasseRequest,
    db: Session = Depends(get_db)
):
    """Génère les factures pour tous les élèves d'une classe en un clic."""
    # Récupérer toutes les inscriptions de la classe
    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == data.classe_id,
        Inscription.annee_id == data.annee_id,
        Inscription.statut == "ACTIVE"
    ).all()

    if not inscriptions:
        raise HTTPException(status_code=404, detail="Aucun élève actif dans cette classe")

    type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == data.type_frais_id).first()
    if not type_frais:
        raise HTTPException(status_code=404, detail="Type de frais non trouvé")

    created_count = 0
    skipped_count = 0

    # Récupérer le plus grand numéro de facture existant UNE SEULE FOIS avant la boucle
    # pour garantir que chaque nouveau numéro est unique
    last_facture = db.query(Facture).order_by(Facture.numero_facture.desc()).first()
    if last_facture and last_facture.numero_facture.startswith("FAC-"):
        try:
            max_num = int(last_facture.numero_facture.split("-")[1])
        except ValueError:
            max_num = 0
    else:
        max_num = 0

    finance_settings = get_finance_settings(db) if data.appliquer_reductions else None

    for inscription in inscriptions:
        # Vérifier si une facture de ce type existe déjà pour cette inscription
        existing = db.query(Facture).filter(
            Facture.inscription_id == inscription.inscription_id,
            Facture.type_frais_id == data.type_frais_id
        ).first()
        if existing:
            skipped_count += 1
            continue

        # Numéro unique basé sur le max_num + offset courant
        numero_facture = f"FAC-{max_num + created_count + 1:06d}"

        # Réduction fratrie (optionnelle, configurée dans /parametres/finance)
        montant_remise = 0.0
        if finance_settings is not None:
            rang = calculer_rang_fratrie(db, inscription.eleve_id, data.annee_id)
            montant_remise = calculer_reduction_montant(data.montant, rang, finance_settings)
        montant_net = data.montant - montant_remise

        facture = Facture(
            inscription_id=inscription.inscription_id,
            type_frais_id=data.type_frais_id,
            numero_facture=numero_facture,
            montant_total=data.montant,
            montant_remise=montant_remise,
            montant_net=montant_net,
            montant_paye=0,
            montant_restant=montant_net,
            statut="EN_ATTENTE"
        )
        db.add(facture)
        db.flush()

        # Créer les échéances si fournies
        if data.echeances:
            for ech in data.echeances:
                echeance = EcheanceFacture(
                    facture_id=facture.facture_id,
                    libelle=ech.libelle,
                    date_limite=ech.date_limite,
                    montant_attendu=ech.montant_attendu,
                    montant_paye=0,
                    statut="EN_ATTENTE"
                )
                db.add(echeance)
        else:
            # Si aucune échéance n'est précisée, créer une échéance unique par défaut
            from datetime import date
            echeance = EcheanceFacture(
                facture_id=facture.facture_id,
                libelle="Paiement unique",
                date_limite=date.today(),
                montant_attendu=montant_net,
                montant_paye=0,
                statut="EN_ATTENTE"
            )
            db.add(echeance)

        created_count += 1

    db.commit()
    return {
        "message": f"{created_count} facture(s) générée(s), {skipped_count} déjà existante(s)",
        "created": created_count,
        "skipped": skipped_count
    }


# ============================================================================
# PAIEMENTS — avec fractionnement et mise à jour des échéances
# ============================================================================

@router.get("/paiements")
def list_paiements(
    etablissement_id: int = 1,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    results = (
        db.query(Paiement, Facture, Eleve)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id)
        .order_by(Paiement.date_paiement.desc())
        .offset(skip).limit(limit).all()
    )

    return [
        {
            "paiement_id": p.paiement_id,
            "numero_recu": p.numero_recu,
            "date_paiement": str(p.date_paiement) if p.date_paiement else None,
            "montant": float(p.montant),
            "mode_paiement": p.mode_paiement,
            "reference_externe": p.reference_externe,
            "statut": p.statut,
            "facture_id": p.facture_id,
            "echeance_id": p.echeance_id,
            "numero_facture": f.numero_facture,
            "eleve_nom": e.nom,
            "eleve_prenom": e.prenom
        }
        for p, f, e in results
    ]


@router.post("/paiements", status_code=201)
def create_paiement(data: PaiementCreate, db: Session = Depends(get_db)):
    """Enregistre un paiement avec mise à jour facture et échéance si applicable."""
    facture = db.query(Facture).filter(Facture.facture_id == data.facture_id).first()
    if not facture:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    if float(facture.montant_restant or 0) <= 0:
        raise HTTPException(status_code=400, detail="Cette facture est déjà entièrement payée")

    if data.montant <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être supérieur à 0")

    if data.montant > float(facture.montant_restant or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Le montant ({data.montant:,.0f}) dépasse le reste à payer ({float(facture.montant_restant):,.0f})"
        )

    # Mettre à jour l'échéance si précisée
    if data.echeance_id:
        echeance = db.query(EcheanceFacture).filter(
            EcheanceFacture.echeance_id == data.echeance_id,
            EcheanceFacture.facture_id == data.facture_id
        ).first()
        if not echeance:
            raise HTTPException(status_code=404, detail="Échéance non trouvée pour cette facture")

        echeance.montant_paye = float(echeance.montant_paye or 0) + data.montant
        if echeance.montant_paye >= float(echeance.montant_attendu or 0):
            echeance.statut = "PAYEE"
        else:
            echeance.statut = "PARTIELLEMENT_PAYEE"

    # Générer numéro de reçu (préfixe configurable via /parametres/finance)
    settings = get_finance_settings(db)
    prefixe_recu = settings.get("recu_prefixe") or "REC"
    count = db.query(func.count(Paiement.paiement_id)).scalar() or 0
    numero_recu = f"{prefixe_recu}-{count + 1:06d}"

    paiement = Paiement(
        facture_id=data.facture_id,
        echeance_id=data.echeance_id,
        numero_recu=numero_recu,
        montant=data.montant,
        mode_paiement=data.mode_paiement,
        reference_externe=data.reference_externe,
        devise=settings.get("devise") or "GNF",
        statut="VALIDE"
    )
    db.add(paiement)

    # Mettre à jour la facture
    facture.montant_paye = float(facture.montant_paye or 0) + data.montant
    facture.montant_restant = float(facture.montant_net or 0) - float(facture.montant_paye)
    if facture.montant_restant <= 0:
        facture.statut = "PAYEE"
        facture.montant_restant = 0
    else:
        facture.statut = "PARTIELLEMENT_PAYEE"

    db.commit()
    db.refresh(paiement)

    return {
        "paiement_id": paiement.paiement_id,
        "numero_recu": numero_recu,
        "montant": float(paiement.montant),
        "mode_paiement": paiement.mode_paiement,
        "statut": paiement.statut,
        "facture_statut": facture.statut,
        "message": f"Paiement enregistré. Reçu N° {numero_recu}"
    }


# ============================================================================
# DÉPENSES
# ============================================================================

@router.get("/depenses", response_model=List[DepenseOut])
def list_depenses(
    etablissement_id: int = 1,
    annee_id: int = 1,
    categorie: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )
    if categorie:
        query = query.filter(Depense.categorie == categorie)
    return query.order_by(Depense.date_depense.desc()).offset(skip).limit(limit).all()


@router.post("/depenses", response_model=DepenseOut, status_code=201)
def create_depense(data: DepenseCreate, db: Session = Depends(get_db)):
    dep = Depense(**data.model_dump())
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


@router.put("/depenses/{depense_id}/approuver")
def approuver_depense(depense_id: int, db: Session = Depends(get_db)):
    dep = db.query(Depense).filter(Depense.depense_id == depense_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dépense non trouvée")
    if dep.statut != "EN_ATTENTE":
        raise HTTPException(status_code=400, detail="Cette dépense ne peut pas être approuvée")
    dep.statut = "APPROUVEE"
    db.commit()
    return {"message": "Dépense approuvée"}


@router.get("/depenses/stats")
def stats_depenses(etablissement_id: int = 1, annee_id: int = 1, db: Session = Depends(get_db)):
    query_base = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )
    total = query_base.with_entities(func.coalesce(func.sum(Depense.montant), 0)).scalar()
    par_categorie = query_base.with_entities(
        Depense.categorie,
        func.sum(Depense.montant).label("total")
    ).group_by(Depense.categorie).order_by(func.sum(Depense.montant).desc()).all()

    return {
        "total_depenses": float(total),
        "par_categorie": [{"categorie": r.categorie, "total": float(r.total)} for r in par_categorie]
    }


# ============================================================================
# MODULE IMPAYÉS — Suivi avancé des retards et impayés
# ============================================================================

@router.get("/impayes")
def list_impayes(
    etablissement_id: int = 1,
    annee_id: int = 1,
    classe_id: Optional[int] = None,
    statut: Optional[str] = None,
    type_frais_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    """
    Tableau complet des impayés avec informations élève, classe et parent.
    Retourne les factures non-payées avec calcul des jours de retard.
    """
    from datetime import date as today_type
    from app.models.academique import Parent, EleveParent, Niveau

    today = today_type.today()
    finance_settings = get_finance_settings(db, etablissement_id)

    query = (
        db.query(Facture, Eleve, Classe, Inscription, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
        )
    )

    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)
    if statut:
        query = query.filter(Facture.statut == statut)
    if type_frais_id:
        query = query.filter(Facture.type_frais_id == type_frais_id)

    results = query.order_by(Facture.montant_restant.desc()).offset(skip).limit(limit).all()

    impayes = []
    for facture, eleve, classe, inscription, type_frais in results:
        # Récupérer le parent responsable financier
        lien_parent = (
            db.query(EleveParent, Parent)
            .join(Parent, EleveParent.parent_id == Parent.parent_id)
            .filter(EleveParent.eleve_id == eleve.eleve_id)
            .first()
        )

        # Récupérer l'échéance la plus ancienne en retard
        echeances = db.query(EcheanceFacture).filter(
            EcheanceFacture.facture_id == facture.facture_id,
            EcheanceFacture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE"])
        ).order_by(EcheanceFacture.date_limite).all()

        # Calculer les jours de retard depuis l'échéance la plus ancienne
        jours_retard = 0
        date_limite_proche = None
        if echeances:
            date_limite_proche = echeances[0].date_limite
            if date_limite_proche and date_limite_proche < today:
                jours_retard = (today - date_limite_proche).days

        parent_nom = ""
        parent_tel = ""
        if lien_parent:
            _, parent = lien_parent
            parent_nom = f"{parent.prenom} {parent.nom}"
            parent_tel = parent.telephone_1

        montant_restant = float(facture.montant_restant or 0)
        penalite_estimee = calculer_penalite(montant_restant, jours_retard, finance_settings)

        impayes.append({
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "type_frais_libelle": type_frais.libelle if type_frais else "N/A",
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "eleve_matricule": eleve.matricule,
            "eleve_telephone": eleve.telephone or "",
            "classe_id": classe.classe_id,
            "classe_nom": classe.libelle,
            "parent_nom": parent_nom,
            "parent_telephone": parent_tel,
            "montant_total": float(facture.montant_total or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": montant_restant,
            "statut": facture.statut,
            "date_facture": str(facture.date_facture) if facture.date_facture else None,
            "date_limite": str(date_limite_proche) if date_limite_proche else None,
            "jours_retard": jours_retard,
            "penalite_estimee": penalite_estimee,
            "montant_du_avec_penalite": round(montant_restant + penalite_estimee, 2),
        })

    return impayes


@router.get("/retards")
def list_retards(
    etablissement_id: int = 1,
    annee_id: int = 1,
    classe_id: Optional[int] = None,
    niveau_id: Optional[int] = None,
    jours_min: int = 0,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    """
    Liste des élèves en retard de paiement, classés par ancienneté du retard.
    Calcule le nombre de jours de retard pour chaque échéance dépassée.
    """
    from datetime import date as today_type
    from app.models.academique import Niveau

    today = today_type.today()
    finance_settings = get_finance_settings(db, etablissement_id)

    query = (
        db.query(EcheanceFacture, Facture, Eleve, Classe)
        .join(Facture, EcheanceFacture.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            EcheanceFacture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE"]),
            EcheanceFacture.date_limite < today
        )
    )

    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)
    if niveau_id:
        query = query.filter(Classe.niveau_id == niveau_id)

    results = query.order_by(EcheanceFacture.date_limite).offset(skip).limit(limit).all()

    retards = []
    for echeance, facture, eleve, classe in results:
        jours_retard = (today - echeance.date_limite).days if echeance.date_limite else 0
        if jours_retard < jours_min:
            continue
        montant_restant = float(echeance.montant_attendu or 0) - float(echeance.montant_paye or 0)
        penalite_estimee = calculer_penalite(montant_restant, jours_retard, finance_settings)

        retards.append({
            "echeance_id": echeance.echeance_id,
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "classe_id": classe.classe_id,
            "classe_nom": classe.libelle,
            "libelle_echeance": echeance.libelle,
            "date_limite": str(echeance.date_limite),
            "montant_attendu": float(echeance.montant_attendu or 0),
            "montant_paye": float(echeance.montant_paye or 0),
            "montant_restant": montant_restant,
            "jours_retard": jours_retard,
            "statut": echeance.statut,
            "penalite_estimee": penalite_estimee,
            "montant_du_avec_penalite": round(montant_restant + penalite_estimee, 2),
        })

    # Trier par jours de retard décroissant (plus ancien en premier)
    retards.sort(key=lambda x: x["jours_retard"], reverse=True)
    return retards


@router.get("/solvabilite")
def tableau_solvabilite(
    etablissement_id: int = 1,
    annee_id: int = 1,
    classe_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Tableau de solvabilité : évalue la situation financière de chaque élève.
    Indicateurs : SOLVABLE (100% payé), PARTIEL (>50%), NON_SOLVABLE (<50%), CRITIQUE (0%)
    """
    query = (
        db.query(Eleve, Inscription, Classe)
        .join(Inscription, Eleve.eleve_id == Inscription.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Inscription.statut == "ACTIVE"
        )
    )
    if classe_id:
        query = query.filter(Classe.classe_id == classe_id)

    results = query.order_by(Eleve.nom, Eleve.prenom).all()

    solvabilite = []
    for eleve, inscription, classe in results:
        factures = db.query(Facture).filter(
            Facture.inscription_id == inscription.inscription_id
        ).all()

        total_facture = sum(float(f.montant_net or 0) for f in factures)
        total_paye = sum(float(f.montant_paye or 0) for f in factures)
        total_restant = total_facture - total_paye

        if total_facture == 0:
            taux = 100
            indicateur = "AUCUNE_FACTURE"
        else:
            taux = round(total_paye / total_facture * 100, 1)
            if taux >= 100:
                indicateur = "SOLVABLE"
            elif taux >= 50:
                indicateur = "PARTIEL"
            elif taux > 0:
                indicateur = "NON_SOLVABLE"
            else:
                indicateur = "CRITIQUE"

        solvabilite.append({
            "eleve_id": eleve.eleve_id,
            "eleve_nom": eleve.nom,
            "eleve_prenom": eleve.prenom,
            "eleve_matricule": eleve.matricule,
            "classe_id": classe.classe_id,
            "classe_nom": classe.libelle,
            "total_facture": total_facture,
            "total_paye": total_paye,
            "total_restant": total_restant,
            "taux_paiement": taux,
            "indicateur": indicateur,
            "nb_factures": len(factures),
        })

    return solvabilite


@router.get("/solde-eleve/{eleve_id}")
def solde_eleve(eleve_id: int, annee_id: int = 1, db: Session = Depends(get_db)):
    """
    Solde financier en temps réel d'un élève avec historique complet des paiements.
    """
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(status_code=404, detail="Élève non trouvé")

    inscriptions = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.annee_id == annee_id,
        Inscription.statut == "ACTIVE"
    ).all()

    total_facture = 0
    total_paye = 0
    factures_detail = []

    for inscription in inscriptions:
        factures = db.query(Facture).filter(
            Facture.inscription_id == inscription.inscription_id
        ).all()

        for facture in factures:
            total_facture += float(facture.montant_net or 0)
            total_paye += float(facture.montant_paye or 0)

            type_frais = None
            if facture.type_frais_id:
                type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()
            libelle_frais = type_frais.libelle if type_frais else "Frais Scolaires (Standard)"

            paiements = db.query(Paiement).filter(
                Paiement.facture_id == facture.facture_id
            ).order_by(Paiement.date_paiement.desc()).all()

            echeances = db.query(EcheanceFacture).filter(
                EcheanceFacture.facture_id == facture.facture_id
            ).all()

            factures_detail.append({
                "facture_id": facture.facture_id,
                "numero_facture": facture.numero_facture,
                "libelle_frais": libelle_frais,
                "montant_total": float(facture.montant_net or 0),
                "montant_paye": float(facture.montant_paye or 0),
                "montant_restant": float(facture.montant_restant or 0),
                "statut": facture.statut,
                "date_facture": str(facture.date_facture) if facture.date_facture else None,
                "echeances": [
                    {
                        "echeance_id": e.echeance_id,
                        "libelle": e.libelle,
                        "date_limite": str(e.date_limite),
                        "montant_attendu": float(e.montant_attendu or 0),
                        "montant_paye": float(e.montant_paye or 0),
                        "statut": e.statut
                    } for e in echeances
                ],
                "paiements": [
                    {
                        "paiement_id": p.paiement_id,
                        "numero_recu": p.numero_recu,
                        "date_paiement": str(p.date_paiement),
                        "montant": float(p.montant),
                        "mode_paiement": p.mode_paiement,
                    } for p in paiements
                ]
            })

    return {
        "eleve_id": eleve.eleve_id,
        "eleve_nom": eleve.nom,
        "eleve_prenom": eleve.prenom,
        "eleve_matricule": eleve.matricule,
        "total_facture": total_facture,
        "total_paye": total_paye,
        "total_restant": total_facture - total_paye,
        "taux_paiement": round(total_paye / total_facture * 100, 1) if total_facture > 0 else 0,
        "factures": factures_detail,
    }


@router.get("/dashboard")
def dashboard_financier(
    etablissement_id: int = 1,
    annee_id: int = 1,
    db: Session = Depends(get_db)
):
    """
    Tableau de bord financier complet avec KPIs, évolution mensuelle et répartition.
    """
    from datetime import date as today_type, timedelta
    from sqlalchemy import extract

    today = today_type.today()

    # === KPIs de base ===
    query_base = (
        db.query(Facture)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id)
    )

    total_facture = float(query_base.with_entities(func.coalesce(func.sum(Facture.montant_net), 0)).scalar())
    total_paye = float(query_base.with_entities(func.coalesce(func.sum(Facture.montant_paye), 0)).scalar())
    total_restant = float(query_base.with_entities(func.coalesce(func.sum(Facture.montant_restant), 0)).scalar())

    nb_impayes = query_base.filter(
        Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
    ).count()
    nb_payees = query_base.filter(Facture.statut == "PAYEE").count()
    total_eleves = (
        db.query(func.count(Inscription.inscription_id))
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id, Inscription.statut == "ACTIVE")
        .scalar()
    ) or 0

    taux_recouvrement = round(total_paye / total_facture * 100, 1) if total_facture > 0 else 0

    total_depenses = float(
        db.query(func.coalesce(func.sum(Depense.montant), 0))
        .filter(
            Depense.etablissement_id == etablissement_id,
            Depense.annee_id == annee_id,
            Depense.statut == "VALIDE"
        ).scalar()
    )
    solde_caisse = total_paye - total_depenses

    # === Revenus du jour / semaine / mois ===
    debut_semaine = today - timedelta(days=today.weekday())
    debut_mois = today.replace(day=1)
    debut_annee = today.replace(month=1, day=1)

    def sum_paiements_periode(date_debut: today_type):
        result = (
            db.query(func.coalesce(func.sum(Paiement.montant), 0))
            .join(Facture, Paiement.facture_id == Facture.facture_id)
            .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
            .join(Classe, Inscription.classe_id == Classe.classe_id)
            .filter(
                Classe.etablissement_id == etablissement_id,
                Paiement.date_paiement >= date_debut,
                Paiement.statut == "VALIDE"
            ).scalar()
        )
        return float(result)

    revenus_jour = sum_paiements_periode(today)
    revenus_semaine = sum_paiements_periode(debut_semaine)
    revenus_mois = sum_paiements_periode(debut_mois)
    revenus_annee = sum_paiements_periode(debut_annee)

    # === Évolution mensuelle (12 derniers mois) ===
    evolution = []
    MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    for i in range(11, -1, -1):
        mois_date = (today.replace(day=1) - timedelta(days=i * 30))
        mois_num = mois_date.month
        annee_num = mois_date.year

        montant_mois = float(
            db.query(func.coalesce(func.sum(Paiement.montant), 0))
            .join(Facture, Paiement.facture_id == Facture.facture_id)
            .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
            .join(Classe, Inscription.classe_id == Classe.classe_id)
            .filter(
                Classe.etablissement_id == etablissement_id,
                extract("month", Paiement.date_paiement) == mois_num,
                extract("year", Paiement.date_paiement) == annee_num,
                Paiement.statut == "VALIDE"
            ).scalar()
        )

        facture_mois = float(
            db.query(func.coalesce(func.sum(Facture.montant_net), 0))
            .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
            .join(Classe, Inscription.classe_id == Classe.classe_id)
            .filter(
                Classe.etablissement_id == etablissement_id,
                Inscription.annee_id == annee_id,
                extract("month", Facture.date_facture) == mois_num,
                extract("year", Facture.date_facture) == annee_num,
            ).scalar()
        )

        evolution.append({
            "mois": MOIS_LABELS[mois_num - 1],
            "encaisse": montant_mois,
            "facture": facture_mois,
        })

    # === Répartition par classe ===
    repartition_classes = (
        db.query(
            Classe.libelle,
            func.coalesce(func.sum(Facture.montant_paye), 0).label("total_paye"),
            func.coalesce(func.sum(Facture.montant_restant), 0).label("total_restant"),
        )
        .join(Inscription, Classe.classe_id == Inscription.classe_id)
        .join(Facture, Inscription.inscription_id == Facture.inscription_id)
        .filter(Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id)
        .group_by(Classe.libelle)
        .order_by(func.sum(Facture.montant_paye).desc())
        .limit(10)
        .all()
    )

    # === Répartition par mode de paiement ===
    repartition_modes = (
        db.query(
            Paiement.mode_paiement,
            func.count(Paiement.paiement_id).label("nb"),
            func.sum(Paiement.montant).label("total"),
        )
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Classe.etablissement_id == etablissement_id)
        .group_by(Paiement.mode_paiement)
        .all()
    )

    return {
        "kpis": {
            "total_facture": total_facture,
            "total_paye": total_paye,
            "total_restant": total_restant,
            "taux_recouvrement": taux_recouvrement,
            "nb_impayes": nb_impayes,
            "nb_payees": nb_payees,
            "nb_eleves": total_eleves,
            "revenus_jour": revenus_jour,
            "revenus_semaine": revenus_semaine,
            "revenus_mois": revenus_mois,
            "revenus_annee": revenus_annee,
            "total_depenses": total_depenses,
            "solde_caisse": solde_caisse,
        },
        "evolution_mensuelle": evolution,
        "repartition_classes": [
            {"classe": r.libelle, "encaisse": float(r.total_paye), "restant": float(r.total_restant)}
            for r in repartition_classes
        ],
        "repartition_modes": [
            {"mode": r.mode_paiement, "nb": r.nb, "total": float(r.total)}
            for r in repartition_modes
        ],
    }


@router.get("/rapports/journalier")
def rapport_journalier(
    etablissement_id: int = 1,
    annee_id: int = 1,
    date_rapport: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Rapport financier journalier avec détail des paiements du jour."""
    from datetime import date as today_type
    target_date = today_type.fromisoformat(date_rapport) if date_rapport else today_type.today()

    paiements = (
        db.query(Paiement, Facture, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Paiement.date_paiement == target_date,
            Paiement.statut == "VALIDE"
        )
        .order_by(Paiement.created_date.desc())
        .all()
    )

    total_jour = sum(float(p.montant) for p, _, _, _ in paiements)

    return {
        "date": str(target_date),
        "total_encaisse": total_jour,
        "nb_paiements": len(paiements),
        "paiements": [
            {
                "numero_recu": p.numero_recu,
                "eleve_nom": f"{e.prenom} {e.nom}",
                "classe": c.libelle,
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
                "numero_facture": f.numero_facture,
            }
            for p, f, e, c in paiements
        ]
    }


@router.get("/rapports/mensuel")
def rapport_mensuel(
    etablissement_id: int = 1,
    annee_id: int = 1,
    mois: Optional[int] = None,
    annee: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Rapport financier mensuel avec KPIs et détail par classe."""
    from datetime import date as today_type
    from sqlalchemy import extract

    today = today_type.today()
    mois_cible = mois or today.month
    annee_cible = annee or today.year

    query_pay = (
        db.query(Paiement, Facture, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            extract("month", Paiement.date_paiement) == mois_cible,
            extract("year", Paiement.date_paiement) == annee_cible,
            Paiement.statut == "VALIDE"
        )
    )

    paiements = query_pay.all()
    total_encaisse = sum(float(p.montant) for p, _, _, _ in paiements)

    # Par classe
    par_classe: dict = {}
    for p, f, e, c in paiements:
        nom_classe = c.libelle
        if nom_classe not in par_classe:
            par_classe[nom_classe] = {"classe": nom_classe, "encaisse": 0, "nb_paiements": 0}
        par_classe[nom_classe]["encaisse"] += float(p.montant)
        par_classe[nom_classe]["nb_paiements"] += 1

    # Impayés du mois
    query_impayes = (
        db.query(func.coalesce(func.sum(Facture.montant_restant), 0))
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
        )
    )
    total_impayes = float(query_impayes.scalar())

    MOIS_LABELS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                   "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

    return {
        "mois": MOIS_LABELS[mois_cible - 1],
        "annee": annee_cible,
        "total_encaisse": total_encaisse,
        "total_impayes": total_impayes,
        "nb_paiements": len(paiements),
        "par_classe": list(par_classe.values()),
        "paiements": [
            {
                "numero_recu": p.numero_recu,
                "eleve_nom": f"{e.prenom} {e.nom}",
                "classe": c.libelle,
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
                "date_paiement": str(p.date_paiement),
            }
            for p, f, e, c in paiements
        ]
    }


@router.get("/avis-paiement/{facture_id}")
def avis_paiement(facture_id: int, db: Session = Depends(get_db)):
    """
    Données structurées pour générer un avis de paiement / reçu PDF.
    Contient toutes les informations nécessaires à l'impression.
    """
    from app.models.academique import Etablissement, Parent, EleveParent, Niveau

    facture = db.query(Facture).filter(Facture.facture_id == facture_id).first()
    if not facture:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    inscription = db.query(Inscription).filter(
        Inscription.inscription_id == facture.inscription_id
    ).first()
    if not inscription:
        raise HTTPException(status_code=404, detail="Inscription associée à cette facture introuvable")
    eleve = db.query(Eleve).filter(Eleve.eleve_id == inscription.eleve_id).first()
    classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    if not eleve or not classe:
        raise HTTPException(status_code=404, detail="Élève ou classe associé(e) à cette facture introuvable")
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    type_frais = None
    if facture.type_frais_id:
        type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()

    echeances = db.query(EcheanceFacture).filter(
        EcheanceFacture.facture_id == facture_id
    ).all()

    paiements = db.query(Paiement).filter(
        Paiement.facture_id == facture_id,
        Paiement.statut == "VALIDE"
    ).order_by(Paiement.date_paiement).all()

    lien_parent = (
        db.query(EleveParent, Parent)
        .join(Parent, EleveParent.parent_id == Parent.parent_id)
        .filter(EleveParent.eleve_id == eleve.eleve_id)
        .first()
    )
    parent_info = {}
    if lien_parent:
        _, parent = lien_parent
        parent_info = {
            "nom": f"{parent.prenom} {parent.nom}",
            "telephone": parent.telephone_1,
            "email": parent.email or "",
        }

    return {
        "facture": {
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "date_facture": str(facture.date_facture) if facture.date_facture else None,
            "montant_total": float(facture.montant_total or 0),
            "montant_net": float(facture.montant_net or 0),
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": float(facture.montant_restant or 0),
            "statut": facture.statut,
            "type_frais": type_frais.libelle if type_frais else "Frais scolaires",
        },
        "eleve": {
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "classe": classe.libelle if classe else "",
        },
        "etablissement": {
            "nom": etablissement.nom if etablissement else "SmartSchool",
            "adresse": getattr(etablissement, "adresse", "") or "",
            "telephone": getattr(etablissement, "telephone", "") or "",
            "email": getattr(etablissement, "email", "") or "",
            "logo_url": getattr(etablissement, "logo_url", "") or "",
            "directeur": getattr(etablissement, "directeur", "") or "",
        },
        "parent": parent_info,
        "echeances": [
            {
                "echeance_id": e.echeance_id,
                "libelle": e.libelle,
                "date_limite": str(e.date_limite),
                "montant_attendu": float(e.montant_attendu or 0),
                "montant_paye": float(e.montant_paye or 0),
                "statut": e.statut,
            } for e in echeances
        ],
        "paiements": [
            {
                "paiement_id": p.paiement_id,
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement),
                "montant": float(p.montant),
                "mode_paiement": p.mode_paiement,
            } for p in paiements
        ]
    }


# ============================================================================
# RAPPELS AUTOMATIQUES — Configuration et notifications
# ============================================================================

# Stockage en mémoire (en production, utiliser une table BDD)
_rappels_config = {
    "actif": True,
    "avant_echeance_jours": [3, 7],
    "apres_echeance_jours": [1, 3, 7, 14],
    "canal": "SYSTEME",
    "message_template": "Cher(e) {parent_nom}, le paiement de {montant} GNF pour {eleve_nom} est attendu le {date_limite}. Merci de régulariser."
}


@router.get("/rappels/config")
def get_rappels_config():
    """Retourne la configuration actuelle des rappels automatiques."""
    return _rappels_config


@router.post("/rappels/configurer")
def configurer_rappels(config: dict, db: Session = Depends(get_db)):
    """Met à jour la configuration des rappels automatiques."""
    global _rappels_config
    _rappels_config.update(config)
    return {"message": "Configuration des rappels mise à jour", "config": _rappels_config}


@router.post("/communication/notifier-impayes")
def notifier_impayes(
    etablissement_id: int = 1,
    annee_id: int = 1,
    db: Session = Depends(get_db)
):
    """
    Déclenche l'envoi de notifications groupées aux parents des élèves en retard.
    Prépare les messages (canal SYSTEME pour l'instant, extensible SMS/Email).
    """
    from app.models.academique import Parent, EleveParent, Message
    from datetime import date as today_type

    today = today_type.today()

    # Récupérer tous les impayés actifs
    impayes = (
        db.query(Facture, Eleve, Classe)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"])
        )
        .all()
    )

    notifies = 0
    for facture, eleve, classe in impayes:
        lien = (
            db.query(EleveParent, Parent)
            .join(Parent, EleveParent.parent_id == Parent.parent_id)
            .filter(EleveParent.eleve_id == eleve.eleve_id)
            .first()
        )
        if lien:
            _, parent = lien
            # Créer un message de notification dans le système
            message = Message(
                expediteur_type="ADMIN",
                destinataire_type="PARENT",
                destinataire_id=parent.parent_id,
                objet_type="PAIEMENT",
                sujet=f"Rappel de paiement — {eleve.prenom} {eleve.nom}",
                contenu=f"Bonjour {parent.prenom} {parent.nom},\n\nNous vous rappelons que le solde restant dû pour votre enfant {eleve.prenom} {eleve.nom} ({classe.libelle}) est de {float(facture.montant_restant or 0):,.0f} GNF.\n\nMerci de régulariser votre situation au secrétariat.\n\nCordialement,\nLa Direction",
                statut="ENVOYE",
            )
            db.add(message)
            notifies += 1

    db.commit()
    return {
        "message": f"{notifies} notification(s) envoyée(s) aux parents",
        "nb_notifies": notifies,
        "nb_impayes": len(impayes)
    }


# ============================================================================
# REÇU PDF — Génération de reçu de paiement au format PDF
# ============================================================================

@router.get("/paiements/{paiement_id}/recu-pdf")
def generer_recu_pdf(paiement_id: int, db: Session = Depends(get_db)):
    """Génère un reçu de paiement au format PDF et le retourne en téléchargement."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement
    import io
    from datetime import date as today_type

    # Récupérer le paiement avec toutes les jointures nécessaires
    result = (
        db.query(Paiement, Facture, Inscription, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Paiement.paiement_id == paiement_id)
        .first()
    )

    if not result:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    paiement, facture, inscription, eleve, classe = result

    # Récupérer l'établissement
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    adresse_ecole = getattr(etablissement, "adresse", "") or ""
    tel_ecole = getattr(etablissement, "telephone", "") or ""
    email_ecole = getattr(etablissement, "email", "") or ""

    # Créer le buffer PDF
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largeur, hauteur = A4

    # === En-tête : informations de l'établissement ===
    y = hauteur - 2 * cm

    # Zone logo (placeholder rectangle)
    pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
    pdf.rect(2 * cm, y - 1.5 * cm, 2.5 * cm, 2 * cm)
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(3.25 * cm, y - 0.7 * cm, "LOGO")

    # Nom de l'école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 9)
    if adresse_ecole:
        pdf.drawCentredString(largeur / 2, y, adresse_ecole)
        y -= 0.4 * cm
    if tel_ecole or email_ecole:
        contact = f"Tél: {tel_ecole}" if tel_ecole else ""
        if email_ecole:
            contact += f"  |  Email: {email_ecole}" if contact else f"Email: {email_ecole}"
        pdf.drawCentredString(largeur / 2, y, contact)
        y -= 0.4 * cm

    # Ligne de séparation
    y -= 0.5 * cm
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    # === Titre du reçu ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, "REÇU DE PAIEMENT")

    # Numéro de reçu
    y -= 0.8 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(largeur / 2, y, f"N° {paiement.numero_recu}")

    # === Informations de l'élève ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE L'ÉLÈVE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.setStrokeColorRGB(0.5, 0.5, 0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Nom complet :  {eleve.prenom} {eleve.nom}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Matricule :  {eleve.matricule or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Classe :  {classe.libelle}")

    # === Détails du paiement ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "DÉTAILS DU PAIEMENT")
    y -= 0.2 * cm
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Montant payé :  {float(paiement.montant):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Mode de paiement :  {paiement.mode_paiement or 'N/A'}")
    y -= 0.5 * cm
    date_str = str(paiement.date_paiement) if paiement.date_paiement else str(today_type.today())
    pdf.drawString(2.5 * cm, y, f"Date du paiement :  {date_str}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Référence :  {paiement.reference_externe or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Devise :  {paiement.devise or 'GNF'}")

    # === Informations de la facture ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE LA FACTURE")
    y -= 0.2 * cm
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"N° Facture :  {facture.numero_facture}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant total :  {float(facture.montant_total or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Total payé :  {float(facture.montant_paye or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Reste à payer :  {float(facture.montant_restant or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Statut facture :  {facture.statut}")

    # === Pied de page : date et signature ===
    y -= 2 * cm
    pdf.setLineWidth(1)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.8 * cm
    pdf.setFont("Helvetica", 9)
    pdf.drawString(2 * cm, y, f"Date d'émission : {today_type.today().strftime('%d/%m/%Y')}")
    pdf.drawRightString(largeur - 2 * cm, y, "Signature et cachet")

    y -= 1.5 * cm
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.drawCentredString(largeur / 2, y, "Ce reçu est généré automatiquement par SmartSchool. Conservez-le pour vos archives.")

    # === Filigrane ===
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane, _bool
    settings = get_documents_settings(db, classe.etablissement_id)
    if _bool(settings.get("documents.filigrane_recus", "false")):
        dessiner_filigrane(pdf, largeur, hauteur, settings)

    # Finaliser le PDF
    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    # Retourner le PDF en téléchargement
    filename = f"recu_{paiement.numero_recu}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============================================================================
# FOURNISSEURS — Liste des fournisseurs avec totaux
# ============================================================================

@router.get("/fournisseurs")
def list_fournisseurs(
    etablissement_id: int = 1,
    annee_id: int = 1,
    db: Session = Depends(get_db)
):
    """Retourne la liste des fournisseurs uniques avec le total des dépenses et le nombre de transactions."""
    results = (
        db.query(
            Depense.fournisseur,
            func.coalesce(func.sum(Depense.montant), 0).label("total_depenses"),
            func.count(Depense.depense_id).label("nb_transactions"),
        )
        .filter(
            Depense.etablissement_id == etablissement_id,
            Depense.annee_id == annee_id,
            Depense.fournisseur.isnot(None),
            Depense.fournisseur != ""
        )
        .group_by(Depense.fournisseur)
        .order_by(func.sum(Depense.montant).desc())
        .all()
    )

    return [
        {
            "fournisseur": r.fournisseur,
            "total_depenses": float(r.total_depenses),
            "nb_transactions": r.nb_transactions,
        }
        for r in results
    ]


# ============================================================================
# RÈGLEMENTS FOURNISSEURS — Créer un paiement fournisseur (dépense)
# ============================================================================

@router.post("/reglements-fournisseurs", status_code=201)
def creer_reglement_fournisseur(
    data: dict,
    db: Session = Depends(get_db)
):
    """
    Crée un décaissement (dépense) de n'importe quelle catégorie.
    Champs attendus : categorie, fournisseur (optionnel), montant, description,
                       reference, mode_paiement, beneficiaire,
                       etablissement_id (optionnel, défaut 1), annee_id (optionnel, défaut 1).
    """
    CATEGORIES_VALIDES = [
        'FOURNISSEUR', 'SALAIRES', 'FOURNITURES', 'MAINTENANCE',
        'EQUIPEMENT', 'TRANSPORT', 'COMMUNICATION', 'AUTRE'
    ]

    categorie = data.get("categorie", "FOURNITURES").upper()
    if categorie not in CATEGORIES_VALIDES:
        categorie = "AUTRE"

    montant = data.get("montant")
    if not montant or float(montant) <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être supérieur à 0")

    description = data.get("description", "")
    reference = data.get("reference", "")
    fournisseur = data.get("fournisseur") or data.get("beneficiaire") or ""
    etablissement_id = data.get("etablissement_id", 1)
    annee_id = data.get("annee_id", 1)

    libelle = description[:300] if description else f"Décaissement {categorie}"

    dep = Depense(
        etablissement_id=etablissement_id,
        annee_id=annee_id,
        categorie=categorie,
        libelle=libelle,
        montant=float(montant),
        fournisseur=fournisseur,
        reference=reference[:150] if reference else None,
        statut="EN_ATTENTE",
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)

    return {
        "depense_id": dep.depense_id,
        "fournisseur": dep.fournisseur,
        "reference": dep.reference,
        "montant": float(dep.montant),
        "categorie": dep.categorie,
        "statut": dep.statut,
        "message": f"Décaissement '{categorie}' créé avec succès"
    }


@router.put("/depenses/{depense_id}/valider")
def valider_depense(depense_id: int, db: Session = Depends(get_db)):
    """
    Valide une dépense (décaissement) qui était EN_ATTENTE.
    """
    dep = db.query(Depense).filter(Depense.depense_id == depense_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dépense non trouvée")
    
    if dep.statut == "VALIDE":
        raise HTTPException(status_code=400, detail="Cette dépense est déjà validée")
        
    dep.statut = "VALIDE"
    db.commit()
    db.refresh(dep)
    
    return {"message": "Dépense validée avec succès", "depense_id": dep.depense_id, "statut": dep.statut}


# ============================================================================
# DÉCAISSEMENTS — Vue consolidée des sorties de fonds
# ============================================================================

@router.get("/decaissements")
def list_decaissements(
    etablissement_id: int = 1,
    annee_id: int = 1,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    categorie: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Vue consolidée de toutes les sorties de fonds (dépenses).
    Retourne les transactions détaillées et un résumé par catégorie.
    """
    from datetime import date as today_type

    query = db.query(Depense).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )

    # Filtres optionnels
    if date_debut:
        query = query.filter(Depense.date_depense >= today_type.fromisoformat(date_debut))
    if date_fin:
        query = query.filter(Depense.date_depense <= today_type.fromisoformat(date_fin))
    if categorie:
        query = query.filter(Depense.categorie == categorie)

    # Récupérer les transactions
    transactions = query.order_by(Depense.date_depense.desc()).offset(skip).limit(limit).all()

    # Calculer les totaux par catégorie (sur la même base filtrée, sans pagination)
    query_totaux = db.query(
        Depense.categorie,
        func.coalesce(func.sum(Depense.montant), 0).label("total"),
        func.count(Depense.depense_id).label("nb"),
    ).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    )
    if date_debut:
        query_totaux = query_totaux.filter(Depense.date_depense >= today_type.fromisoformat(date_debut))
    if date_fin:
        query_totaux = query_totaux.filter(Depense.date_depense <= today_type.fromisoformat(date_fin))
    if categorie:
        query_totaux = query_totaux.filter(Depense.categorie == categorie)

    totaux_par_categorie = query_totaux.group_by(Depense.categorie).all()

    # Total général
    total_general = sum(float(r.total) for r in totaux_par_categorie)

    return {
        "total_general": total_general,
        "par_categorie": [
            {"categorie": r.categorie, "total": float(r.total), "nb_transactions": r.nb}
            for r in totaux_par_categorie
        ],
        "transactions": [
            {
                "depense_id": d.depense_id,
                "categorie": d.categorie,
                "description": d.libelle,
                "montant": float(d.montant or 0),
                "date_depense": str(d.date_depense) if d.date_depense else None,
                "fournisseur": d.fournisseur or "",
                "reference": d.reference or "",
                "statut": d.statut,
            }
            for d in transactions
        ],
    }


# ============================================================================
# ANNULATION DE PAIEMENT — Annuler un paiement et reverser les montants
# ============================================================================

@router.put("/paiements/{paiement_id}/annuler")
def annuler_paiement(
    paiement_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """
    Annule un paiement et reverse les montants sur la facture et l'échéance associée.
    Champs attendus : motif (raison de l'annulation).
    """
    motif = data.get("motif", "")
    if not motif:
        raise HTTPException(status_code=400, detail="Le motif d'annulation est obligatoire")

    # Récupérer le paiement
    paiement = db.query(Paiement).filter(Paiement.paiement_id == paiement_id).first()
    if not paiement:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    if paiement.statut == "ANNULE":
        raise HTTPException(status_code=400, detail="Ce paiement est déjà annulé")

    montant_paiement = float(paiement.montant or 0)

    # Mettre à jour le statut du paiement
    paiement.statut = "ANNULE"
    paiement.motif_annulation = motif

    # Reverser les montants sur la facture
    facture = db.query(Facture).filter(Facture.facture_id == paiement.facture_id).first()
    if facture:
        facture.montant_paye = max(0, float(facture.montant_paye or 0) - montant_paiement)
        facture.montant_restant = float(facture.montant_net or 0) - float(facture.montant_paye)

        # Mettre à jour le statut de la facture
        if facture.montant_paye <= 0:
            facture.statut = "EN_ATTENTE"
        elif facture.montant_restant <= 0:
            facture.statut = "PAYEE"
            facture.montant_restant = 0
        else:
            facture.statut = "PARTIELLEMENT_PAYEE"

    # Reverser les montants sur l'échéance si applicable
    if paiement.echeance_id:
        echeance = db.query(EcheanceFacture).filter(
            EcheanceFacture.echeance_id == paiement.echeance_id
        ).first()
        if echeance:
            echeance.montant_paye = max(0, float(echeance.montant_paye or 0) - montant_paiement)
            if echeance.montant_paye <= 0:
                echeance.statut = "EN_ATTENTE"
            elif echeance.montant_paye >= float(echeance.montant_attendu or 0):
                echeance.statut = "PAYEE"
            else:
                echeance.statut = "PARTIELLEMENT_PAYEE"

    db.commit()

    return {
        "paiement_id": paiement.paiement_id,
        "numero_recu": paiement.numero_recu,
        "montant_annule": montant_paiement,
        "motif": motif,
        "facture_statut": facture.statut if facture else None,
        "message": f"Paiement {paiement.numero_recu} annulé avec succès. Montant de {montant_paiement:,.0f} GNF reversé."
    }


# ============================================================================
# ACOMPTES — Paiements partiels (avances sur factures non soldées)
# ============================================================================

@router.get("/acomptes")
def list_acomptes(
    etablissement_id: int = 1,
    annee_id: int = 1,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Liste les paiements qui constituent des acomptes (avances).
    Un acompte est un paiement validé dont la facture associée a encore un montant restant > 0.
    """
    results = (
        db.query(Paiement, Facture, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            Inscription.annee_id == annee_id,
            Paiement.statut == "VALIDE",
            Facture.montant_restant > 0
        )
        .order_by(Paiement.date_paiement.desc())
        .offset(skip).limit(limit)
        .all()
    )

    # Calculer les totaux
    total_acomptes = sum(float(p.montant) for p, _, _, _ in results)
    total_restant = sum(float(f.montant_restant or 0) for _, f, _, _ in results)

    return {
        "total_acomptes": total_acomptes,
        "total_restant_du": total_restant,
        "nb_acomptes": len(results),
        "acomptes": [
            {
                "paiement_id": p.paiement_id,
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement) if p.date_paiement else None,
                "montant_paye": float(p.montant),
                "mode_paiement": p.mode_paiement,
                "facture_id": f.facture_id,
                "numero_facture": f.numero_facture,
                "montant_total_facture": float(f.montant_total or 0),
                "montant_paye_facture": float(f.montant_paye or 0),
                "montant_restant_facture": float(f.montant_restant or 0),
                "statut_facture": f.statut,
                "eleve_nom": e.nom,
                "eleve_prenom": e.prenom,
                "eleve_matricule": e.matricule,
                "classe_nom": c.libelle,
            }
            for p, f, e, c in results
        ],
    }


# ============================================================================
# FACTURES — Générer PDF
# ============================================================================

@router.get("/factures/{facture_id}/pdf")
def generer_facture_pdf(facture_id: int, db: Session = Depends(get_db)):
    """Génère une facture au format PDF et la retourne en téléchargement."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement, Inscription, Eleve, Classe, TypeFrais
    import io

    # Récupérer la facture avec toutes les jointures nécessaires
    result = (
        db.query(Facture, Inscription, Eleve, Classe, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(Facture.facture_id == facture_id)
        .first()
    )

    if not result:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    facture, inscription, eleve, classe, type_frais = result

    # Récupérer l'établissement
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    adresse_ecole = getattr(etablissement, "adresse", "") or ""
    tel_ecole = getattr(etablissement, "telephone", "") or ""
    email_ecole = getattr(etablissement, "email", "") or ""

    # Créer le buffer PDF
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largeur, hauteur = A4

    # === En-tête : informations de l'établissement ===
    y = hauteur - 2 * cm

    # Zone logo (placeholder rectangle)
    pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
    pdf.rect(2 * cm, y - 1.5 * cm, 2.5 * cm, 2 * cm)
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(3.25 * cm, y - 0.7 * cm, "LOGO")

    # Nom de l'école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 9)
    if adresse_ecole:
        pdf.drawCentredString(largeur / 2, y, adresse_ecole)
        y -= 0.4 * cm
    if tel_ecole or email_ecole:
        contact = f"Tél: {tel_ecole}" if tel_ecole else ""
        if email_ecole:
            contact += f"  |  Email: {email_ecole}" if contact else f"Email: {email_ecole}"
        pdf.drawCentredString(largeur / 2, y, contact)
        y -= 0.4 * cm

    # Ligne de séparation
    y -= 0.5 * cm
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    # === Titre de la facture ===
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, "FACTURE")

    # Numéro de facture
    y -= 0.8 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(largeur / 2, y, f"N° {facture.numero_facture}")
    
    # Date de facture
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(largeur / 2, y, f"Date: {facture.date_facture}")

    # === Informations de l'élève ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE L'ÉLÈVE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.setStrokeColorRGB(0.5, 0.5, 0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Nom complet :  {eleve.prenom} {eleve.nom}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Matricule :  {eleve.matricule or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Classe :  {classe.libelle}")

    # === Détails de la facture ===
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "DÉTAILS DE LA FACTURE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    libelle_frais = type_frais.libelle if type_frais else "Frais Scolaires (Non spécifié)"
    pdf.drawString(2.5 * cm, y, f"Motif :  {libelle_frais}")
    
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Statut :  {facture.statut}")

    y -= 1.0 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2.5 * cm, y, f"Montant Total : {float(facture.montant_total or 0):,.0f} GNF")
    y -= 0.5 * cm
    if float(facture.montant_remise or 0) > 0:
        pdf.drawString(2.5 * cm, y, f"Remise : -{float(facture.montant_remise):,.0f} GNF")
        y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant Net : {float(facture.montant_net or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant Payé : {float(facture.montant_paye or 0):,.0f} GNF")
    y -= 0.7 * cm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColorRGB(0.8, 0.1, 0.1) # Rouge pour le reste
    pdf.drawString(2.5 * cm, y, f"Reste à payer : {float(facture.montant_restant or 0):,.0f} GNF")
    
    pdf.setFillColorRGB(0, 0, 0) # Retour noir

    # === Bas de page ===
    y -= 3 * cm
    pdf.setFont("Helvetica", 9)
    pdf.drawCentredString(largeur / 2, y, "Merci de votre confiance.")
    
    # Numérotation page
    pdf.drawString(largeur - 3 * cm, 2 * cm, "Page 1/1")

    # === Filigrane ===
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane, _bool
    settings = get_documents_settings(db, classe.etablissement_id)
    if _bool(settings.get("documents.filigrane_recus", "false")):
        dessiner_filigrane(pdf, largeur, hauteur, settings)

    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture_{facture.numero_facture}.pdf"}
    )


# ============================================================================
# SALAIRES — Gestion des salaires des employés
# ============================================================================

@router.get("/salaires/employes")
def list_employes_salaires(
    etablissement_id: int = 1,
    annee_id: int = 1,
    mois: Optional[str] = None,   # format: "2026-06"
    db: Session = Depends(get_db)
):
    """
    Liste tous les enseignants et le personnel administratif actifs avec leur historique de paiements.
    """
    enseignants = (
        db.query(Enseignant)
        .filter(
            Enseignant.etablissement_id == etablissement_id,
            Enseignant.statut == "ACTIF",
            Enseignant.salaire_base > 0
        )
        .all()
    )

    personnel = (
        db.query(Utilisateur)
        .filter(
            Utilisateur.etablissement_id == etablissement_id,
            Utilisateur.statut == "ACTIF",
            Utilisateur.salaire_base > 0
        )
        .all()
    )

    result = []
    # --- Traitement des Enseignants ---
    for ens in enseignants:
        historique = (
            db.query(Depense)
            .filter(
                Depense.etablissement_id == etablissement_id,
                Depense.categorie == "SALAIRES",
                Depense.fournisseur == f"ENS_{ens.enseignant_id}",
                Depense.statut == "VALIDE"
            )
            .order_by(Depense.date_depense.desc())
            .limit(12)
            .all()
        )

        paye_ce_mois = False
        if mois:
            paye_ce_mois = any(
                dep.date_depense and dep.date_depense.strftime("%Y-%m") == mois
                for dep in historique
            )

        total_paye = sum(float(dep.montant) for dep in historique)

        result.append({
            "id": f"ENS_{ens.enseignant_id}",
            "type_employe": "ENSEIGNANT",
            "nom": ens.nom,
            "prenom": ens.prenom,
            "role_label": "Enseignant",
            "salaire_base": float(ens.salaire_base) if ens.salaire_base else 0,
            "prime_mensuelle": float(ens.prime_mensuelle) if ens.prime_mensuelle else 0,
            "telephone": ens.telephone,
            "paye_ce_mois": paye_ce_mois,
            "total_paye_annee": total_paye,
            "nb_paiements": len(historique),
            "historique": [
                {
                    "depense_id": dep.depense_id,
                    "date": dep.date_depense.isoformat() if dep.date_depense else None,
                    "montant": float(dep.montant),
                    "libelle": dep.libelle,
                    "statut": dep.statut,
                }
                for dep in historique
            ]
        })

    # --- Traitement du Personnel ---
    for p in personnel:
        historique = (
            db.query(Depense)
            .filter(
                Depense.etablissement_id == etablissement_id,
                Depense.categorie == "SALAIRES",
                Depense.fournisseur == f"PERS_{p.utilisateur_id}",
                Depense.statut == "VALIDE"
            )
            .order_by(Depense.date_depense.desc())
            .limit(12)
            .all()
        )

        paye_ce_mois = False
        if mois:
            paye_ce_mois = any(
                dep.date_depense and dep.date_depense.strftime("%Y-%m") == mois
                for dep in historique
            )

        total_paye = sum(float(dep.montant) for dep in historique)

        result.append({
            "id": f"PERS_{p.utilisateur_id}",
            "type_employe": "PERSONNEL",
            "nom": p.nom,
            "prenom": p.prenom,
            "role_label": p.role,
            "salaire_base": float(p.salaire_base) if p.salaire_base else 0,
            "prime_mensuelle": float(p.prime_mensuelle) if p.prime_mensuelle else 0,
            "telephone": p.telephone,
            "paye_ce_mois": paye_ce_mois,
            "total_paye_annee": total_paye,
            "nb_paiements": len(historique),
            "historique": [
                {
                    "depense_id": dep.depense_id,
                    "date": dep.date_depense.isoformat() if dep.date_depense else None,
                    "montant": float(dep.montant),
                    "libelle": dep.libelle,
                    "statut": dep.statut,
                }
                for dep in historique
            ]
        })

    # Tri global par nom, prénom
    result.sort(key=lambda x: (x["nom"].lower(), x["prenom"].lower()))

    return result


@router.post("/salaires/payer", status_code=201)
def payer_salaire_employe(data: dict, db: Session = Depends(get_db)):
    """
    Enregistre le paiement de salaire d'un employé (Enseignant ou Personnel).
    Champs: enseignant_id (ex: 'ENS_1' ou 'PERS_2'), montant, mois (ex: '2026-06'), description, etablissement_id, annee_id
    """
    employe_id_str = data.get("enseignant_id")
    montant = data.get("montant")
    mois = data.get("mois", "")
    description = data.get("description", "")
    etablissement_id = data.get("etablissement_id", 1)
    annee_id = data.get("annee_id", 1)

    if not employe_id_str:
        raise HTTPException(status_code=400, detail="Identifiant employé obligatoire")
    if not montant or float(montant) <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    prefix, emp_id = employe_id_str.split("_", 1)
    emp_id = int(emp_id)

    if prefix == "ENS":
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == emp_id).first()
        if not ens:
            raise HTTPException(status_code=404, detail="Enseignant introuvable")
        nom_complet = f"{ens.prenom} {ens.nom}"
    elif prefix == "PERS":
        pers = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == emp_id).first()
        if not pers:
            raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
        nom_complet = f"{pers.prenom} {pers.nom}"
    else:
        raise HTTPException(status_code=400, detail="Type d'employé inconnu")

    libelle = description or f"Salaire {nom_complet} — {mois}"

    dep = Depense(
        etablissement_id=etablissement_id,
        annee_id=annee_id,
        categorie="SALAIRES",
        libelle=libelle[:300],
        montant=float(montant),
        date_depense=date_type.today(),
        fournisseur=employe_id_str,  # Garde la trace 'ENS_1' ou 'PERS_2'
        statut="VALIDE",  # salaire directement validé
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)

    return {
        "depense_id": dep.depense_id,
        "enseignant": nom_complet,
        "montant": float(dep.montant),
        "mois": mois,
        "statut": dep.statut,
        "message": f"Salaire de {nom_complet} enregistré avec succès"
    }


@router.delete("/salaires/{depense_id}")
def annuler_salaire(depense_id: int, db: Session = Depends(get_db)):
    """Annule un paiement de salaire."""
    dep = db.query(Depense).filter(
        Depense.depense_id == depense_id,
        Depense.categorie == "SALAIRES"
    ).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    dep.statut = "ANNULE"
    db.commit()
    return {"message": "Paiement annulé"}


