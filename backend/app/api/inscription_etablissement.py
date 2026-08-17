"""
SMARTSCHOOL API — Inscription d'une école à la plateforme.

Une école ne peut pas être créée par elle-même via
`POST /api/parametrage/etablissements` : cette route est réservée au
SUPER_ADMIN, c'est-à-dire à l'éditeur de la plateforme. Un fondateur qui arrive
sur le site n'a aucun compte, donc aucun jeton, donc aucun moyen d'entrer —
l'œuf et la poule.

Ce module ouvre la seule porte publique nécessaire, et rien de plus :

    POST /api/inscription-etablissement   (sans authentification)

Il crée l'école **EN ATTENTE**, son année scolaire, ses types d'évaluation et
le compte du fondateur en ADMIN de cette école. Il ne renvoie **aucun jeton** :
tant que la plateforme n'a pas validé l'inscription, le compte existe mais ne
peut pas se connecter (contrôle dans `auth.py::unified_login`).

Pourquoi une validation manuelle plutôt qu'une activation immédiate : sans
elle, n'importe qui crée une école sur la plateforme. Le coût est un écran de
validation côté SUPER_ADMIN ; le bénéfice est de garder la main sur qui entre.

CE QUE CE MODULE NE FAIT PAS
----------------------------
Il ne réimplémente ni l'isolation multi-écoles, ni le RBAC, ni la génération
d'identifiants : il appelle ce qui existe (`exiger_identifiants_libres`,
`amorcer_types_evaluation`, `hash_password`). Le seul endroit où il décide
quelque chose, c'est le statut initial de l'école.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.auth import ADMIN_TIER_ROLES, require_roles
from app.core.database import get_db
from app.core.identifiants import exiger_identifiants_libres
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur
from app.services.referentiel_evaluation import amorcer_types_evaluation
from app.services.referentiel_scolaire import amorcer_referentiel_scolaire

router = APIRouter(prefix="/api/inscription-etablissement", tags=["Inscription établissement"])

# Réservé à l'éditeur de la plateforme : valider une école, c'est décider qui
# entre. Ce n'est pas une opération d'administration d'école.
_require_super_admin = require_roles("SUPER_ADMIN")

# Statuts d'un établissement. La colonne existait déjà (défaut "ACTIF") mais
# n'était lue nulle part — c'est ce module qui lui donne enfin un sens.
STATUT_EN_ATTENTE = "EN_ATTENTE"
STATUT_ACTIF = "ACTIF"
STATUT_REFUSE = "REFUSE"
STATUT_SUSPENDU = "SUSPENDU"

TYPES_ETABLISSEMENT = {"PRIMAIRE", "COLLEGE", "LYCEE", "COMPLEXE", "AUTRE"}


class DemandeInscription(BaseModel):
    """Ce que le fondateur saisit. Aucun champ n'est inventé : tous existent
    sur `Etablissement` ou `Utilisateur`."""
    # ── L'école ──
    nom_etablissement: str
    type_etablissement: str
    ville: Optional[str] = None
    adresse: Optional[str] = None
    telephone_etablissement: Optional[str] = None
    email_etablissement: Optional[str] = None

    # ── Le fondateur, qui devient l'administrateur de cette école ──
    nom: str
    prenom: str
    email: str
    telephone: str
    mot_de_passe: str

    @field_validator("nom_etablissement", "nom", "prenom")
    @classmethod
    def _non_vide(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Ce champ doit contenir au moins 2 caractères.")
        return v

    @field_validator("type_etablissement")
    @classmethod
    def _type_connu(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if v not in TYPES_ETABLISSEMENT:
            raise ValueError(f"Type d'établissement inconnu. Valeurs acceptées : {sorted(TYPES_ETABLISSEMENT)}")
        return v

    @field_validator("mot_de_passe")
    @classmethod
    def _mot_de_passe_solide(cls, v: str) -> str:
        if len(v or "") < 8:
            raise ValueError("Le mot de passe doit contenir au moins 8 caractères.")
        return v

    @field_validator("email")
    @classmethod
    def _email_plausible(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Adresse e-mail invalide.")
        return v


def _annee_scolaire_courante() -> tuple:
    """Année scolaire en cours, découpée sur septembre comme en Guinée."""
    aujourd_hui = date.today()
    debut = aujourd_hui.year if aujourd_hui.month >= 9 else aujourd_hui.year - 1
    return debut, debut + 1


def _code_libre(db: Session, nom: str) -> str:
    """Code d'établissement dérivé du nom, unique sur la plateforme.

    `Etablissement.code` est unique globalement : on ne peut donc pas le
    laisser saisir librement par le fondateur sans lui infliger un refus
    incompréhensible (« ce code est pris » — par une école qu'il ne voit pas).
    Il est généré, et suffixé tant qu'il est occupé.
    """
    base = "".join(c for c in nom.upper() if c.isalnum())[:8] or "ECOLE"
    candidat, n = base, 1
    while db.query(Etablissement.etablissement_id).filter(
        Etablissement.code == candidat
    ).first():
        n += 1
        suffixe = str(n)
        candidat = f"{base[:8 - len(suffixe)]}{suffixe}"
    return candidat


@router.post("", status_code=201)
@limiter.limit("3/hour")
def inscrire_etablissement(
    request: Request,
    data: DemandeInscription,
    db: Session = Depends(get_db),
):
    """Inscription publique d'une école. Aucune authentification requise.

    L'école est créée EN ATTENTE et le fondateur ne reçoit **aucun jeton** :
    il ne pourra se connecter qu'une fois la plateforme ayant validé. Renvoyer
    un jeton ici viderait la validation de son sens.

    Limité à 3 tentatives par heure et par adresse : cette route est la seule
    porte publique qui écrit en base.

    Tout se fait dans UNE transaction. Une école créée sans son administrateur
    serait inutilisable et invisible — personne ne pourrait ni s'y connecter,
    ni la supprimer.
    """
    # Les identifiants de connexion sont GLOBAUX sur la plateforme (le login
    # résout par email/téléphone/matricule) : un doublon rendrait le second
    # compte définitivement inconnectable. 409, sans révéler à qui il appartient.
    exiger_identifiants_libres(db, [data.email, data.telephone])

    try:
        etablissement = Etablissement(
            code=_code_libre(db, data.nom_etablissement),
            nom=data.nom_etablissement,
            type_etablissement=data.type_etablissement,
            statut=STATUT_EN_ATTENTE,
            ville=data.ville,
            adresse=data.adresse,
            telephone=data.telephone_etablissement,
            email=data.email_etablissement,
            directeur=f"{data.prenom} {data.nom}",
            created_by="inscription-publique",
        )
        db.add(etablissement)
        db.flush()

        debut, fin = _annee_scolaire_courante()
        db.add(AnneeScolaire(
            etablissement_id=etablissement.etablissement_id,
            code=f"{debut}-{fin}", libelle=f"{debut}-{fin}",
            date_debut=date(debut, 9, 1), date_fin=date(fin, 7, 31),
            statut="EN_COURS", est_courante="O",
        ))

        # Sans ses types d'évaluation, l'école ne pourrait ni créer une épreuve
        # ni calculer une moyenne le jour de son activation.
        amorcer_types_evaluation(db, etablissement.etablissement_id)

        # Cycles et niveaux du programme guinéen. Sans eux, l'école est
        # inutilisable dès son premier écran : une classe exige un niveau, et
        # une matière un cycle. Une école inscrite ici se retrouvait à devoir
        # « créer ses cycles dans Paramètres » — alors qu'aucun écran ne le
        # permet, et que ce référentiel est le même pour toutes les écoles.
        amorcer_referentiel_scolaire(
            db, etablissement.etablissement_id, data.type_etablissement
        )

        # Le fondateur EST l'administrateur de son école. Pas un SUPER_ADMIN :
        # ce rôle est celui de l'éditeur de la plateforme, et le donner ici
        # ouvrirait l'accès à toutes les autres écoles.
        db.add(Utilisateur(
            etablissement_id=etablissement.etablissement_id,
            nom=data.nom, prenom=data.prenom,
            nom_utilisateur=data.email,
            email=data.email, telephone=data.telephone,
            mot_de_passe=hash_password(data.mot_de_passe),
            role="ADMIN", statut="ACTIF",
        ))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, f"L'inscription n'a pas pu être enregistrée : {exc}")

    return {
        "message": (
            "Votre demande a bien été enregistrée. Elle est en cours de "
            "vérification par SmartSchool ; vous recevrez la confirmation à "
            f"{data.email}. Vous pourrez vous connecter dès qu'elle sera validée."
        ),
        "etablissement": data.nom_etablissement,
        "statut": STATUT_EN_ATTENTE,
    }


# ════════════════════════════════════════════════════════════════════════
# VALIDATION — côté éditeur de la plateforme
# ════════════════════════════════════════════════════════════════════════

class DecisionInscription(BaseModel):
    motif: Optional[str] = None


@router.get("/demandes", dependencies=[Depends(_require_super_admin)])
def lister_demandes(statut: str = STATUT_EN_ATTENTE, db: Session = Depends(get_db)):
    """Demandes d'inscription, pour l'écran de validation du SUPER_ADMIN.

    Opération plateforme : c'est la seule famille de routes qui regarde
    plusieurs écoles à la fois, et elle est fermée à tout autre rôle.
    """
    ecoles = db.query(Etablissement).filter(
        Etablissement.statut == statut
    ).order_by(Etablissement.created_date.desc()).all()

    # Le demandeur en une requête, pas une par école.
    admins = {}
    if ecoles:
        for u in db.query(Utilisateur).filter(
            Utilisateur.etablissement_id.in_([e.etablissement_id for e in ecoles]),
            Utilisateur.role == "ADMIN",
        ).all():
            admins.setdefault(u.etablissement_id, u)

    resultat = []
    for e in ecoles:
        admin = admins.get(e.etablissement_id)
        resultat.append({
            "etablissement_id": e.etablissement_id,
            "code": e.code,
            "nom": e.nom,
            "type_etablissement": e.type_etablissement,
            "ville": e.ville,
            "adresse": e.adresse,
            "telephone": e.telephone,
            "email": e.email,
            "statut": e.statut,
            "date_demande": e.created_date.isoformat() if e.created_date else None,
            "demandeur": {
                "nom": f"{admin.prenom} {admin.nom}",
                "email": admin.email,
                "telephone": admin.telephone,
            } if admin else None,
        })
    return resultat


def _ecole_ou_404(db: Session, etablissement_id: int) -> Etablissement:
    e = db.query(Etablissement).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    if not e:
        raise HTTPException(404, "Établissement non trouvé")
    return e


@router.put("/{etablissement_id}/valider", dependencies=[Depends(_require_super_admin)])
def valider_inscription(etablissement_id: int, db: Session = Depends(get_db)):
    """Active l'école : son administrateur peut désormais se connecter."""
    ecole = _ecole_ou_404(db, etablissement_id)
    if ecole.statut == STATUT_ACTIF:
        return {"message": f"{ecole.nom} est déjà active.", "statut": STATUT_ACTIF}
    ecole.statut = STATUT_ACTIF
    db.commit()
    return {
        "message": f"{ecole.nom} est activée. Son administrateur peut se connecter.",
        "etablissement_id": ecole.etablissement_id,
        "statut": STATUT_ACTIF,
    }


@router.put("/{etablissement_id}/refuser", dependencies=[Depends(_require_super_admin)])
def refuser_inscription(
    etablissement_id: int,
    data: DecisionInscription,
    db: Session = Depends(get_db),
):
    """Refuse une demande, sans rien supprimer.

    L'école et son compte restent en base, marqués REFUSE : effacer une demande
    ferait perdre la trace de qui a essayé, et laisserait le même code
    d'établissement se recréer indéfiniment.
    """
    ecole = _ecole_ou_404(db, etablissement_id)
    ecole.statut = STATUT_REFUSE
    if data.motif:
        # Le motif rejoint le slogan ? Non : on ne détourne pas un champ métier.
        # Il est renvoyé à l'appelant pour affichage/notification, et n'est pas
        # persisté tant qu'aucune colonne ne lui est destinée (dette signalée).
        pass
    db.commit()
    return {
        "message": f"La demande de {ecole.nom} a été refusée.",
        "etablissement_id": ecole.etablissement_id,
        "statut": STATUT_REFUSE,
        "motif": data.motif,
    }


@router.put("/{etablissement_id}/suspendre", dependencies=[Depends(_require_super_admin)])
def suspendre_etablissement(
    etablissement_id: int,
    data: DecisionInscription,
    db: Session = Depends(get_db),
):
    """Suspend une école active : ses comptes ne peuvent plus se connecter.

    Les données restent intactes — une suspension n'est pas une suppression.
    """
    ecole = _ecole_ou_404(db, etablissement_id)
    ecole.statut = STATUT_SUSPENDU
    db.commit()
    return {
        "message": f"{ecole.nom} est suspendue.",
        "etablissement_id": ecole.etablissement_id,
        "statut": STATUT_SUSPENDU,
        "motif": data.motif,
    }
