"""
API pour le module Examens & Évaluations
- Upload de sujets par les enseignants
- Gestion des sujets côté admin
- Construction et publication de l'emploi des examens
"""

import os
import shutil
from datetime import datetime
from typing import Optional, List
from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile,
)
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement
from app.models.academique import (
    SujetExamen, EmploiExamen, CreneauExamen, DemandeEmploi,
    Message, Enseignant, Matiere, Classe, Cycle, ClasseMatiere, Affectation,
    Trimestre, AnneeScolaire
)

router = APIRouter(prefix="/api/examens", tags=["Examens"])

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "sujets")
os.makedirs(UPLOAD_DIR, exist_ok=True)


ADMIN_TIER_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU"}


def _charger_sujet_ou_404(db: Session, sujet_id: int, etablissement_id: int) -> SujetExamen:
    """Charge un sujet en vérifiant qu'il appartient à l'établissement
    appelant (via son auteur, seule relation fiable — voir SujetExamen).
    404 (pas 403) pour ne jamais confirmer l'existence d'un sujet d'une
    autre école."""
    sujet = (
        db.query(SujetExamen)
        .join(Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id)
        .filter(SujetExamen.sujet_id == sujet_id, Enseignant.etablissement_id == etablissement_id)
        .first()
    )
    if not sujet:
        raise HTTPException(404, "Sujet non trouvé")
    return sujet


def _verifier_auteur_sujet(sujet: SujetExamen, current_user: dict) -> None:
    """En plus de l'établissement, un enseignant ne doit gérer que SES
    PROPRES sujets (le scénario de fuite avant-examen explicitement visé :
    un enseignant ne doit jamais pouvoir consulter/télécharger/modifier le
    sujet d'un collègue). Les comptes admin-tier de l'établissement
    contournent cette restriction (rôle déjà vérifié en amont par
    EXAMENS_ROLES au niveau du routeur)."""
    role = current_user.get("role", "")
    if role in ADMIN_TIER_ROLES:
        return
    if current_user.get("type") == "enseignant" and str(current_user.get("sub", "")) == str(sujet.enseignant_id):
        return
    raise HTTPException(403, "Accès refusé : ce sujet appartient à un autre enseignant")


# ================================================================
# PÉRIODES
# ================================================================
# Ce module imposait trois trimestres (`trimestre` = 1, 2 ou 3), alors que le
# reste du système gère de 1 à 12 périodes nommées librement. Une école à deux
# semestres se voyait donc proposer un « T3 » qui ne correspondait à rien, et
# aucun écran n'affichait le nom réel de la période.


def _annee_courante(db: Session, etablissement_id: int) -> Optional[AnneeScolaire]:
    """Année en cours DE CETTE ÉCOLE.

    Sans le filtre, `est_courante == "O"` renvoyait l'année de la première école
    venue : toutes les autres se voyaient proposer des périodes qui n'étaient
    pas les leurs.
    """
    base = db.query(AnneeScolaire).filter(AnneeScolaire.etablissement_id == etablissement_id)
    return (base.filter(AnneeScolaire.est_courante == "O").first()
            or base.order_by(AnneeScolaire.date_debut.desc()).first())


def _periodes_annee(db: Session, etablissement_id: int) -> List[Trimestre]:
    """Périodes réellement configurées pour cette école, dans l'ordre."""
    annee = _annee_courante(db, etablissement_id)
    if not annee:
        return []
    return db.query(Trimestre).filter(
        Trimestre.annee_id == annee.annee_id
    ).order_by(Trimestre.numero, Trimestre.date_debut).all()


def _resoudre_periode(
    db: Session, trimestre_id: Optional[int], numero: Optional[int], etablissement_id: int
) -> Trimestre:
    """Résout la période d'un sujet, par identifiant ou par ancien numéro.

    Accepter encore le numéro évite de casser un portail enseignant qui n'aurait
    pas été mis à jour, sans pour autant laisser entrer un numéro qui ne
    correspond à aucune période réelle de l'établissement.

    `Trimestre` est OWNERSHIP : son école se lit via `AnneeScolaire`. Un
    identifiant appartenant à une autre école répond 404, jamais 403 — on ne
    confirme pas l'existence de la période d'à côté.
    """
    if trimestre_id:
        periode = (
            db.query(Trimestre)
            .join(AnneeScolaire, Trimestre.annee_id == AnneeScolaire.annee_id)
            .filter(
                Trimestre.trimestre_id == trimestre_id,
                AnneeScolaire.etablissement_id == etablissement_id,
            )
            .first()
        )
        if not periode:
            raise HTTPException(404, "Période non trouvée")
        return periode

    periodes = _periodes_annee(db, etablissement_id)
    if not periodes:
        raise HTTPException(
            400,
            "Aucune période n'est configurée pour l'année en cours — "
            "définissez-les dans Paramètres > Calendrier avant de déposer un sujet.",
        )
    if numero:
        trouvee = next((p for p in periodes if p.numero == numero), None)
        if not trouvee:
            noms = ", ".join(p.libelle for p in periodes)
            raise HTTPException(
                400,
                f"Période {numero} inexistante. Périodes de cette année : {noms}.",
            )
        return trouvee
    raise HTTPException(400, "Période requise (trimestre_id)")


@router.get("/periodes")
def lister_periodes(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Périodes de l'année, pour les sélecteurs des deux écrans d'examens.

    Évite que le portail enseignant et le Centre des Examens réinventent
    chacun une liste « T1 T2 T3 » figée dans leur code.
    """
    periodes = _periodes_annee(db, etablissement_id)
    return [
        {
            "trimestre_id": p.trimestre_id,
            "numero": p.numero,
            "libelle": p.libelle,
            "code": p.code,
            "statut": p.statut,
            "date_debut": str(p.date_debut) if p.date_debut else None,
            "date_fin": str(p.date_fin) if p.date_fin else None,
        }
        for p in periodes
    ]


# ================================================================
# SUJETS D'EXAMEN
# ================================================================

@router.post("/sujets/upload", status_code=201)
async def upload_sujet(
    fichier: UploadFile = File(...),
    enseignant_id: int = Form(...),
    matiere_id: int = Form(...),
    titre: str = Form(...),
    trimestre_id: Optional[int] = Form(None),
    trimestre: Optional[int] = Form(None),
    duree_minutes: int = Form(...),
    classe_id: Optional[int] = Form(None),
    demande_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Upload d'un sujet d'examen par un enseignant.
    Le sujet est immédiatement envoyé à l'administration (statut ENVOYE)
    et un message de notification est créé pour l'admin.
    """
    # Validate — l'enseignant doit appartenir à l'établissement appelant, et
    # un compte enseignant ne peut déposer un sujet que sous sa propre
    # identité (jamais au nom d'un collègue) ; un admin peut déposer pour
    # n'importe quel enseignant de SON établissement.
    ens = db.query(Enseignant).filter(
        Enseignant.enseignant_id == enseignant_id, Enseignant.etablissement_id == etablissement_id
    ).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")
    if current_user.get("role") not in ADMIN_TIER_ROLES:
        if current_user.get("type") != "enseignant" or str(current_user.get("sub", "")) != str(enseignant_id):
            raise HTTPException(403, "Vous ne pouvez déposer un sujet que sous votre propre identité")

    mat = (
        db.query(Matiere)
        .join(Cycle, Cycle.cycle_id == Matiere.cycle_id)
        .filter(Matiere.matiere_id == matiere_id, Cycle.etablissement_id == etablissement_id)
        .first()
    )
    if not mat:
        raise HTTPException(404, "Matière non trouvée")

    if classe_id is not None:
        classe_valide = db.query(Classe.classe_id).filter(
            Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
        ).first()
        if not classe_valide:
            raise HTTPException(404, "Classe non trouvée")

    # Période : c'est celle de l'établissement qui fait foi. L'ancien numéro
    # 1/2/3 reste accepté (clients non encore mis à jour) mais il est résolu
    # vers une vraie période DE CETTE ÉCOLE — une école à deux semestres n'a
    # pas de « T3 », et un trimestre_id d'une autre école est refusé.
    periode = _resoudre_periode(db, trimestre_id, trimestre, etablissement_id)

    # Check file type
    allowed_types = [
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg", "image/png", "image/webp"
    ]
    if fichier.content_type and fichier.content_type not in allowed_types:
        raise HTTPException(400, f"Type de fichier non autorisé: {fichier.content_type}")

    # Save file
    ext = os.path.splitext(fichier.filename)[1] if fichier.filename else ".pdf"
    safe_name = f"sujet_{enseignant_id}_{matiere_id}_P{periode.numero}_{int(datetime.now().timestamp())}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(file_path, "wb") as buffer:
        content = await fichier.read()
        buffer.write(content)

    # Create record — directly ENVOYE (no draft step needed from portal)
    now = datetime.now()
    sujet = SujetExamen(
        demande_id=demande_id,
        enseignant_id=enseignant_id,
        matiere_id=matiere_id,
        classe_id=classe_id,
        trimestre_id=periode.trimestre_id,
        trimestre=periode.numero,
        titre=titre,
        fichier_nom=fichier.filename or safe_name,
        fichier_path=safe_name,
        fichier_type=ext.replace(".", ""),
        fichier_taille=len(content),
        duree_minutes=duree_minutes,
        statut="ENVOYE",
        date_envoi=now,
    )
    db.add(sujet)
    db.flush()  # get sujet_id before creating message

    # Create notification message to admin
    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=demande_id,
        expediteur_type="ENSEIGNANT",
        expediteur_id=enseignant_id,
        destinataire_type="ADMIN",
        objet_type="EXAMENS",
        sujet=f"Sujet déposé — {mat.libelle} ({periode.libelle})",
        contenu=(
            f"{ens.prenom} {ens.nom} a déposé le sujet \u00ab {titre} \u00bb "
            f"pour la matière {mat.libelle} — {periode.libelle}, "
            f"durée {duree_minutes} min (fichier : {fichier.filename or safe_name})."
        )
    )
    db.add(msg)
    db.commit()
    db.refresh(sujet)

    return {
        "message": f"Sujet \u00ab {titre} \u00bb envoyé à l'administration avec succès.",
        "sujet_id": sujet.sujet_id,
        "fichier_nom": sujet.fichier_nom,
        "statut": "ENVOYE"
    }


@router.get("/sujets")
def get_sujets(
    response: Response,
    enseignant_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    trimestre: Optional[int] = None,
    statut: Optional[str] = None,
    q: Optional[str] = Query(None, description="Recherche titre / matière / classe / enseignant"),
    skip: int = 0,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste des sujets - filtrable par enseignant, période, statut.

    Toujours restreinte à l'établissement appelant. Un compte enseignant ne
    voit que ses propres sujets (le paramètre enseignant_id, s'il tente de
    désigner un collègue, est ignoré) ; un admin peut filtrer par n'importe
    quel enseignant de son établissement.

    `trimestre_id` filtre sur la période réelle ; `trimestre` (numéro) reste
    accepté pour les appelants non mis à jour.

    POURQUOI LA PAGE NE CHARGEAIT PLUS
    ----------------------------------
    Cette route renvoyait TOUS les sujets de l'école, et pour chacun d'eux
    rechargeait l'enseignant, la matière et la classe — une requête chacun.
    Sur une année complète (2 674 sujets), cela faisait plus de huit mille
    allers-retours en base pour un seul affichage : le Centre des Examens
    tournait indéfiniment sans jamais s'afficher.

    Les trois libellés sont maintenant chargés en trois requêtes groupées,
    quel que soit le nombre de sujets, et la liste est paginée. Le total réel
    part dans l'en-tête `X-Total-Count`, comme sur les autres listes.
    """
    query = db.query(SujetExamen).join(Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id).filter(
        Enseignant.etablissement_id == etablissement_id
    )
    if current_user.get("role") not in ADMIN_TIER_ROLES and current_user.get("type") == "enseignant":
        query = query.filter(SujetExamen.enseignant_id == current_user.get("sub"))
    else:
        # Un brouillon n'est pas un dépôt : l'enseignant ne l'a pas encore
        # envoyé. L'écran les écartait déjà à l'affichage, mais le total, lui,
        # les comptait — et une page entière de brouillons paraissait vide
        # alors que le compteur annonçait des sujets.
        query = query.filter(SujetExamen.statut != "BROUILLON")
        if enseignant_id:
            query = query.filter(SujetExamen.enseignant_id == enseignant_id)
    if trimestre_id:
        query = query.filter(SujetExamen.trimestre_id == trimestre_id)
    elif trimestre:
        query = query.filter(SujetExamen.trimestre == trimestre)
    if statut:
        query = query.filter(SujetExamen.statut == statut)

    # La recherche porte sur TOUTE la base, pas sur la page affichée : filtrer
    # côté navigateur ne trouvait un sujet que s'il était déjà à l'écran, ce
    # qui rend la loupe trompeuse dès la deuxième page.
    if q and q.strip():
        terme = f"%{q.strip()}%"
        query = (
            query.outerjoin(Matiere, Matiere.matiere_id == SujetExamen.matiere_id)
            .outerjoin(Classe, Classe.classe_id == SujetExamen.classe_id)
            .filter(or_(
                SujetExamen.titre.ilike(terme),
                Matiere.libelle.ilike(terme),
                Classe.libelle.ilike(terme),
                Enseignant.nom.ilike(terme),
                Enseignant.prenom.ilike(terme),
            ))
        )

    response.headers["X-Total-Count"] = str(query.count())
    sujets = query.order_by(SujetExamen.date_depot.desc()).offset(skip).limit(limit).all()
    if not sujets:
        return []

    # Libellés des périodes en une requête : la boucle ci-dessous en émettait
    # déjà trois par sujet, inutile d'en ajouter une quatrième. Restreinte à
    # l'école appelante : `Trimestre` sans filtre chargeait le calendrier de
    # toute la plateforme.
    periodes = {
        p.trimestre_id: p
        for p in db.query(Trimestre)
        .join(AnneeScolaire, Trimestre.annee_id == AnneeScolaire.annee_id)
        .filter(AnneeScolaire.etablissement_id == etablissement_id)
        .all()
    }
    # Enseignants, matières et classes de la page : trois requêtes au total,
    # au lieu de trois PAR SUJET.
    enseignants = {
        e.enseignant_id: e for e in db.query(Enseignant).filter(
            Enseignant.enseignant_id.in_({s.enseignant_id for s in sujets})
        ).all()
    }
    matieres = {
        m.matiere_id: m for m in db.query(Matiere).filter(
            Matiere.matiere_id.in_({s.matiere_id for s in sujets})
        ).all()
    }
    classe_ids = {s.classe_id for s in sujets if s.classe_id}
    classes = {
        c.classe_id: c for c in db.query(Classe).filter(
            Classe.classe_id.in_(classe_ids)
        ).all()
    } if classe_ids else {}

    result = []
    for s in sujets:
        ens = enseignants.get(s.enseignant_id)
        mat = matieres.get(s.matiere_id)
        cls = classes.get(s.classe_id) if s.classe_id else None
        result.append({
            "sujet_id": s.sujet_id,
            "demande_id": s.demande_id,
            "enseignant_id": s.enseignant_id,
            "enseignant_nom": f"{ens.prenom} {ens.nom}" if ens else "?",
            "enseignant_specialite": ens.specialite if ens else None,
            "matiere_id": s.matiere_id,
            "matiere_code": mat.code if mat else "?",
            "matiere_libelle": mat.libelle if mat else "?",
            "classe_id": s.classe_id,
            "classe_libelle": cls.libelle if cls else None,
            "trimestre": s.trimestre,
            "trimestre_id": s.trimestre_id,
            "periode_libelle": (
                periodes[s.trimestre_id].libelle if s.trimestre_id in periodes
                else (f"Période {s.trimestre}" if s.trimestre else "Période inconnue")
            ),
            "titre": s.titre,
            "fichier_nom": s.fichier_nom,
            "fichier_path": s.fichier_path,
            "fichier_type": s.fichier_type,
            "fichier_taille": s.fichier_taille,
            "duree_minutes": s.duree_minutes,
            "statut": s.statut,
            "commentaire": s.commentaire,
            "date_depot": str(s.date_depot) if s.date_depot else None,
            "date_envoi": str(s.date_envoi) if s.date_envoi else None,
        })
    return result


@router.put("/sujets/{sujet_id}/envoyer")
def envoyer_sujet(
    sujet_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """L'enseignant envoie son sujet à l'admin."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    if sujet.statut not in ["BROUILLON", "REJETE"]:
        raise HTTPException(400, f"Le sujet est déjà '{sujet.statut}', impossible de l'envoyer.")

    sujet.statut = "ENVOYE"
    sujet.date_envoi = datetime.now()

    # Create notification message to admin
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == sujet.enseignant_id).first()
    mat = db.query(Matiere).filter(Matiere.matiere_id == sujet.matiere_id).first()
    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=sujet.demande_id,
        expediteur_type="ENSEIGNANT",
        expediteur_id=sujet.enseignant_id,
        destinataire_type="ADMIN",
        objet_type="EXAMENS",
        sujet=f"Sujet déposé — {mat.libelle if mat else '?'} (T{sujet.trimestre})",
        contenu=f"{ens.prenom if ens else ''} {ens.nom if ens else ''} a envoyé le sujet '{sujet.titre}' ({sujet.fichier_nom}, {sujet.duree_minutes} min)."
    )
    db.add(msg)
    db.commit()

    return {"message": f"Sujet '{sujet.titre}' envoyé à l'administration.", "statut": "ENVOYE"}


@router.put("/sujets/{sujet_id}/valider")
def valider_sujet(sujet_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """L'admin valide un sujet reçu. Met à jour le statut de la demande si tout est validé.

    L'enseignant est prévenu, au même titre qu'en cas de rejet : jusqu'ici seule
    la mauvaise nouvelle circulait, si bien qu'un professeur ayant déposé son
    sujet ne savait jamais s'il avait été accepté — et relançait.
    """
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    sujet.statut = "VALIDE"

    mat = db.query(Matiere).filter(Matiere.matiere_id == sujet.matiere_id).first()
    periode = db.query(Trimestre).filter(
        Trimestre.trimestre_id == sujet.trimestre_id
    ).first() if sujet.trimestre_id else None
    libelle_periode = periode.libelle if periode else f"Période {sujet.trimestre}"
    db.add(Message(
        expediteur_type="ADMIN",
        destinataire_type="ENSEIGNANT",
        destinataire_id=sujet.enseignant_id,
        objet_type="EXAMENS",
        etablissement_id=etablissement_id,
        sujet=f"Sujet validé — {mat.libelle if mat else '?'} ({libelle_periode})",
        contenu=(
            f"Votre sujet « {sujet.titre} » a été validé par l'administration. "
            "Aucune action de votre part n'est nécessaire."
        ),
    ))

    # Check if all sujets for this demande are now validated → mark demande as TRAITE
    if sujet.demande_id:
        sujets_demande = db.query(SujetExamen).filter(
            SujetExamen.demande_id == sujet.demande_id,
            SujetExamen.statut.in_(["ENVOYE", "VALIDE"])
        ).all()
        all_valides = all(s.statut == "VALIDE" or s.sujet_id == sujet_id for s in sujets_demande)
        if all_valides and len(sujets_demande) > 0:
            demande = db.query(DemandeEmploi).filter(
                DemandeEmploi.demande_id == sujet.demande_id
            ).first()
            if demande and demande.statut == "EN_COURS":
                demande.statut = "TRAITE"

    db.commit()
    return {"message": "Sujet validé.", "statut": "VALIDE"}


@router.put("/sujets/{sujet_id}/rejeter")
def rejeter_sujet(sujet_id: int, raison: str = "", db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """L'admin rejette un sujet avec commentaire."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    sujet.statut = "REJETE"
    sujet.commentaire = raison

    # Notify teacher
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == sujet.enseignant_id).first()
    mat = db.query(Matiere).filter(Matiere.matiere_id == sujet.matiere_id).first()
    _periode = db.query(Trimestre).filter(
        Trimestre.trimestre_id == sujet.trimestre_id
    ).first() if sujet.trimestre_id else None
    _libelle_periode = _periode.libelle if _periode else f"Période {sujet.trimestre}"
    msg = Message(
        etablissement_id=etablissement_id,
        expediteur_type="ADMIN",
        destinataire_type="ENSEIGNANT",
        destinataire_id=sujet.enseignant_id,
        objet_type="EXAMENS",
        sujet=f"Sujet rejeté — {mat.libelle if mat else '?'} ({_libelle_periode})",
        contenu=f"Votre sujet '{sujet.titre}' a été rejeté. Raison: {raison or 'Non spécifiée'}. Veuillez soumettre un nouveau sujet."
    )
    db.add(msg)
    db.commit()
    return {"message": "Sujet rejeté, enseignant notifié."}


@router.delete("/sujets/{sujet_id}")
def supprimer_sujet(
    sujet_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Supprimer un sujet (brouillon ou envoyé uniquement)."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    if sujet.statut not in ["BROUILLON", "ENVOYE"]:
        raise HTTPException(400, "Seuls les sujets non validés peuvent être supprimés.")

    # Delete file
    file_path = os.path.join(UPLOAD_DIR, sujet.fichier_path)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(sujet)
    db.commit()
    return {"message": "Sujet supprimé."}


class SujetModifier(BaseModel):
    titre: str
    duree_minutes: int
    trimestre_id: Optional[int] = None
    trimestre: Optional[int] = None


@router.put("/sujets/{sujet_id}/modifier")
def modifier_sujet(
    sujet_id: int,
    data: SujetModifier,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """L'enseignant modifie les métadonnées d'un sujet non encore validé.
    La modification est immédiatement visible côté admin (pas de re-notification).
    """
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    if sujet.statut == "VALIDE":
        raise HTTPException(400, "Un sujet validé ne peut plus être modifié.")
    sujet.titre = data.titre
    sujet.duree_minutes = data.duree_minutes
    # Même résolution qu'au dépôt : la période réelle fait foi, l'ancien numéro
    # reste accepté pour un client non mis à jour.
    if data.trimestre_id or data.trimestre:
        periode = _resoudre_periode(db, data.trimestre_id, data.trimestre, etablissement_id)
        sujet.trimestre_id = periode.trimestre_id
        sujet.trimestre = periode.numero
    db.commit()
    return {"message": "Sujet mis à jour.", "sujet_id": sujet_id}


# Serve uploaded files
from fastapi.responses import FileResponse

@router.get("/sujets/{sujet_id}/fichier")
def telecharger_sujet(
    sujet_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Télécharger le fichier d'un sujet.

    Scénario de fuite explicitement visé par ce lot : avant, n'importe quel
    compte EXAMENS_ROLES (y compris un simple enseignant) pouvait télécharger
    le sujet d'un collègue — voire d'une autre école — avant l'examen, sans
    aucune vérification. Désormais : établissement + auteur du sujet
    (ou admin de cet établissement) uniquement.
    """
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    file_path = os.path.join(UPLOAD_DIR, sujet.fichier_path)
    if not os.path.exists(file_path):
        raise HTTPException(404, "Fichier non trouvé sur le serveur")
    return FileResponse(file_path, filename=sujet.fichier_nom)


# ================================================================
# STATISTIQUES ADMIN - CENTRE D'ÉVALUATION
# ================================================================

@router.get("/admin/stats")
def get_exam_stats(
    trimestre_id: Optional[int] = None,
    trimestre: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Statistiques pour le Centre des Examens, restreintes à cette école."""
    q = db.query(SujetExamen).join(Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id).filter(
        Enseignant.etablissement_id == etablissement_id
    )
    if trimestre_id:
        q = q.filter(SujetExamen.trimestre_id == trimestre_id)
    elif trimestre:
        q = q.filter(SujetExamen.trimestre == trimestre)

    all_sujets = q.all()
    total = len(all_sujets)
    brouillons = len([s for s in all_sujets if s.statut == "BROUILLON"])
    envoyes = len([s for s in all_sujets if s.statut == "ENVOYE"])
    valides = len([s for s in all_sujets if s.statut == "VALIDE"])
    rejetes = len([s for s in all_sujets if s.statut == "REJETE"])

    # Enseignants uniques ayant soumis
    ens_ids = set(s.enseignant_id for s in all_sujets if s.statut in ["ENVOYE", "VALIDE"])
    total_enseignants = db.query(Enseignant).filter(
        Enseignant.statut == "ACTIF", Enseignant.etablissement_id == etablissement_id
    ).count()

    return {
        "total_sujets": total,
        "brouillons": brouillons,
        "envoyes": envoyes,
        "valides": valides,
        "rejetes": rejetes,
        "enseignants_soumis": len(ens_ids),
        "total_enseignants": total_enseignants,
        "taux_soumission": round(len(ens_ids) / max(total_enseignants, 1) * 100, 1),
    }


# ================================================================
# SUJETS ATTENDUS ET MANQUANTS
# ================================================================
# Le tableau de bord n'affichait qu'un « taux de soumission » : le nombre
# d'enseignants ayant déposé, divisé par le nombre d'enseignants actifs. Il ne
# disait ni QUI manquait, ni POUR QUELLE MATIÈRE — pour relancer, il fallait
# deviner. L'information existe pourtant : les affectations disent exactement
# quel enseignant assure quelle matière dans quelle classe.


def _attendus_par_affectation(db: Session, etablissement_id: int) -> List[dict]:
    """Un sujet attendu par affectation active de l'année en cours.

    Préchargement en lot : une école de 40 classes × 12 matières produit ~500
    lignes, et interroger enseignant/matière/classe pour chacune remettrait le
    N+1 que ce projet a déjà payé cher ailleurs.

    `Affectation` n'a pas de colonne établissement : elle est isolée par son
    `annee_id`, qui appartient déjà à une seule école. Partir de l'année de
    l'appelant suffit donc à ne compter que ses propres affectations.
    """
    annee = _annee_courante(db, etablissement_id)
    if not annee:
        return []

    affectations = db.query(Affectation).filter(
        Affectation.annee_id == annee.annee_id,
        Affectation.statut == "ACTIVE",
    ).all()
    if not affectations:
        return []

    enseignants = {
        e.enseignant_id: e for e in db.query(Enseignant).filter(
            Enseignant.enseignant_id.in_({a.enseignant_id for a in affectations})
        ).all()
    }
    matieres = {
        m.matiere_id: m for m in db.query(Matiere).filter(
            Matiere.matiere_id.in_({a.matiere_id for a in affectations})
        ).all()
    }
    classes = {
        c.classe_id: c for c in db.query(Classe).filter(
            Classe.classe_id.in_({a.classe_id for a in affectations})
        ).all()
    }

    attendus = []
    for a in affectations:
        ens, mat, cls = (enseignants.get(a.enseignant_id),
                         matieres.get(a.matiere_id), classes.get(a.classe_id))
        if not (ens and mat and cls) or cls.statut != "ACTIVE":
            continue
        attendus.append({
            "enseignant_id": a.enseignant_id,
            "enseignant_nom": f"{ens.prenom} {ens.nom}",
            "enseignant_telephone": ens.telephone,
            "matiere_id": a.matiere_id,
            "matiere_libelle": mat.libelle,
            "classe_id": a.classe_id,
            "classe_libelle": cls.libelle,
        })
    return attendus


@router.get("/sujets/suivi")
def suivi_sujets(
    trimestre_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Sujets attendus, reçus et manquants pour une période, nommément.

    Remplace un pourcentage qu'on subit par une liste sur laquelle on agit :
    « Mathématiques 8ème A — M. Diallo » se relance, « 0 % » ne se relance pas.

    Un sujet compte comme reçu dès qu'il est déposé pour le couple
    (enseignant, matière) — la classe n'est pas exigée, beaucoup d'écoles
    déposant un sujet commun à toutes les classes d'un même niveau.
    """
    periodes = _periodes_annee(db, etablissement_id)
    if not periodes:
        return {
            "periode": None, "attendus": 0, "recus": 0, "manquants": [],
            "message": "Aucune période configurée pour l'année en cours.",
        }
    # `trimestre_id` est cherché dans les périodes DE CETTE ÉCOLE : un
    # identifiant appartenant à une autre ne correspond à rien et retombe
    # simplement sur la période en cours, sans jamais rien en révéler.
    periode = next((p for p in periodes if p.trimestre_id == trimestre_id), None) if trimestre_id else None
    if periode is None:
        periode = next((p for p in periodes if p.statut == "EN_COURS"), periodes[0])

    attendus = _attendus_par_affectation(db, etablissement_id)
    recus = db.query(SujetExamen).join(
        Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id
    ).filter(
        Enseignant.etablissement_id == etablissement_id,
        SujetExamen.trimestre_id == periode.trimestre_id,
        SujetExamen.statut.in_(["ENVOYE", "RECU", "VALIDE"]),
    ).all()
    couples_recus = {(s.enseignant_id, s.matiere_id) for s in recus}

    manquants = [
        a for a in attendus
        if (a["enseignant_id"], a["matiere_id"]) not in couples_recus
    ]
    # Une même matière assurée dans plusieurs classes ne se relance qu'une fois.
    par_enseignant: dict = {}
    for m in manquants:
        cle = (m["enseignant_id"], m["matiere_id"])
        entree = par_enseignant.setdefault(cle, {
            "enseignant_id": m["enseignant_id"],
            "enseignant_nom": m["enseignant_nom"],
            "enseignant_telephone": m["enseignant_telephone"],
            "matiere_id": m["matiere_id"],
            "matiere_libelle": m["matiere_libelle"],
            "classes": [],
        })
        entree["classes"].append(m["classe_libelle"])

    lignes = sorted(
        par_enseignant.values(),
        key=lambda x: (x["enseignant_nom"], x["matiere_libelle"]),
    )
    attendus_uniques = {(a["enseignant_id"], a["matiere_id"]) for a in attendus}
    nb_attendus = len(attendus_uniques)
    nb_recus = len(attendus_uniques & couples_recus)

    return {
        "periode": {
            "trimestre_id": periode.trimestre_id,
            "libelle": periode.libelle,
            "statut": periode.statut,
        },
        "attendus": nb_attendus,
        "recus": nb_recus,
        "manquants": lignes,
        "taux_couverture": round(100.0 * nb_recus / nb_attendus, 1) if nb_attendus else None,
        # Sujets déposés hors affectation connue : ni une erreur ni un manque,
        # mais l'école doit pouvoir s'en apercevoir.
        "hors_affectation": len(couples_recus - attendus_uniques),
    }


class RelanceSujets(BaseModel):
    trimestre_id: int
    enseignant_ids: Optional[List[int]] = None   # None = tous ceux qui manquent
    message: Optional[str] = None


@router.post("/sujets/relancer")
def relancer_sujets(
    data: RelanceSujets,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Relance nommément les enseignants dont le sujet manque.

    Relancer tout le monde use la crédibilité du message : un enseignant à jour
    qui reçoit un rappel cesse de les lire. On n'écrit qu'à ceux qui manquent,
    et on leur rappelle laquelle de leurs matières est concernée.

    Les destinataires sortent du suivi de l'école appelante : des identifiants
    d'enseignants d'une autre école glissés dans `enseignant_ids` ne trouvent
    aucune correspondance et ne reçoivent donc rien.
    """
    suivi = suivi_sujets(data.trimestre_id, db, etablissement_id)
    manquants = suivi["manquants"]
    if data.enseignant_ids:
        cibles = set(data.enseignant_ids)
        manquants = [m for m in manquants if m["enseignant_id"] in cibles]
    if not manquants:
        return {"message": "Aucun sujet manquant — personne à relancer.", "relances": 0}

    periode = suivi["periode"]["libelle"] if suivi["periode"] else "la période en cours"
    par_enseignant: dict = {}
    for m in manquants:
        par_enseignant.setdefault(m["enseignant_id"], []).append(m["matiere_libelle"])

    for enseignant_id, matieres in par_enseignant.items():
        db.add(Message(
            etablissement_id=etablissement_id,
            expediteur_type="ADMIN",
            destinataire_type="ENSEIGNANT",
            destinataire_id=enseignant_id,
            objet_type="EXAMENS",
            sujet=f"Sujet(s) d'examen attendu(s) — {periode}",
            contenu=(
                (data.message + "\n\n" if data.message else "")
                + "Nous n'avons pas encore reçu votre sujet pour : "
                + ", ".join(sorted(set(matieres)))
                + f" ({periode}). Merci de le déposer depuis votre portail."
            ),
        ))
    db.commit()
    return {
        "message": f"{len(par_enseignant)} enseignant(s) relancé(s).",
        "relances": len(par_enseignant),
    }


class DemandeSujets(BaseModel):
    trimestre_id: int
    titre: Optional[str] = None
    description: Optional[str] = None


@router.post("/sujets/demander", status_code=201)
def demander_sujets(
    data: DemandeSujets,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Ouvre une campagne de collecte des sujets et prévient les enseignants.

    Ce geste n'existait que dans l'écran Communication, sous la forme d'une
    « demande » de type EXAMENS : le Centre des Examens, seul endroit où l'on
    constate l'absence de sujets, n'offrait aucun moyen de les réclamer.

    « TOUS_ENSEIGNANTS » s'entend au sein de l'établissement appelant : la
    demande et le message portent son identifiant, jamais un envoi à l'échelle
    de la plateforme.
    """
    periode = _resoudre_periode(db, data.trimestre_id, None, etablissement_id)

    titre = data.titre or f"Dépôt des sujets d'examen — {periode.libelle}"
    description = data.description or (
        f"Merci de déposer vos sujets d'examen pour {periode.libelle} "
        "depuis votre portail enseignant, onglet Examens."
    )

    demande = DemandeEmploi(
        etablissement_id=etablissement_id,
        titre=titre,
        description=description,
        objet_type="EXAMENS",
        classes_concernees="TOUTES",
        trimestre=periode.numero,
    )
    db.add(demande)
    db.flush()

    db.add(Message(
        etablissement_id=etablissement_id,
        demande_id=demande.demande_id,
        expediteur_type="ADMIN",
        destinataire_type="TOUS_ENSEIGNANTS",
        objet_type="EXAMENS",
        sujet=titre,
        contenu=description,
    ))
    db.commit()
    return {
        "message": "Demande envoyée à tous les enseignants.",
        "demande_id": demande.demande_id,
        "periode": periode.libelle,
    }


# ================================================================
# EMPLOI DES EXAMENS
# ================================================================

class EmploiExamenCreate(BaseModel):
    trimestre: int
    titre: str
    date_debut: str  # YYYY-MM-DD
    date_fin: str
    demande_id: Optional[int] = None

class CreneauExamenCreate(BaseModel):
    classe_id: int
    matiere_id: int
    date_examen: str  # YYYY-MM-DD
    heure_debut: str
    heure_fin: str
    salle: Optional[str] = None
    surveillant_type: str = "ENSEIGNANT"
    surveillant_id: Optional[int] = None
    surveillant_nom: Optional[str] = None


@router.post("/emploi", status_code=201)
def creer_emploi_examen(data: EmploiExamenCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Créer un emploi du temps d'examen."""
    from datetime import date as date_type
    emploi = EmploiExamen(
        etablissement_id=etablissement_id,
        demande_id=data.demande_id,
        trimestre=data.trimestre,
        titre=data.titre,
        date_debut=datetime.strptime(data.date_debut, "%Y-%m-%d").date(),
        date_fin=datetime.strptime(data.date_fin, "%Y-%m-%d").date(),
    )
    db.add(emploi)
    db.commit()
    db.refresh(emploi)
    return {"message": "Emploi d'examen créé.", "emploi_examen_id": emploi.emploi_examen_id}


@router.get("/emploi")
def lister_emplois_examen(trimestre: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Liste des emplois d'examen."""
    q = db.query(EmploiExamen).filter(EmploiExamen.etablissement_id == etablissement_id)
    if trimestre:
        q = q.filter(EmploiExamen.trimestre == trimestre)
    emplois = q.order_by(EmploiExamen.date_creation.desc()).all()
    result = []
    for e in emplois:
        nb = db.query(CreneauExamen).filter(CreneauExamen.emploi_examen_id == e.emploi_examen_id).count()
        result.append({
            "emploi_examen_id": e.emploi_examen_id,
            "trimestre": e.trimestre,
            "titre": e.titre,
            "date_debut": str(e.date_debut),
            "date_fin": str(e.date_fin),
            "statut": e.statut,
            "nb_creneaux": nb,
            "date_creation": str(e.date_creation) if e.date_creation else None,
        })
    return result


@router.get("/emploi/{emploi_id}")
def get_emploi_examen(emploi_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Détail d'un emploi d'examen avec tous ses créneaux."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")

    creneaux = db.query(CreneauExamen).filter(
        CreneauExamen.emploi_examen_id == emploi_id
    ).order_by(CreneauExamen.date_examen, CreneauExamen.heure_debut).all()

    creneaux_data = []
    for c in creneaux:
        mat = db.query(Matiere).filter(Matiere.matiere_id == c.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == c.classe_id).first()
        surv_nom = c.surveillant_nom
        if c.surveillant_type == "ENSEIGNANT" and c.surveillant_id:
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == c.surveillant_id).first()
            surv_nom = f"{ens.prenom} {ens.nom}" if ens else surv_nom

        creneaux_data.append({
            "creneau_examen_id": c.creneau_examen_id,
            "classe_id": c.classe_id,
            "classe_libelle": cls.libelle if cls else "?",
            "matiere_id": c.matiere_id,
            "matiere_code": mat.code if mat else "?",
            "matiere_libelle": mat.libelle if mat else "?",
            "date_examen": str(c.date_examen),
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "salle": c.salle,
            "surveillant_type": c.surveillant_type,
            "surveillant_id": c.surveillant_id,
            "surveillant_nom": surv_nom,
        })

    return {
        "emploi_examen_id": emploi.emploi_examen_id,
        "trimestre": emploi.trimestre,
        "titre": emploi.titre,
        "date_debut": str(emploi.date_debut),
        "date_fin": str(emploi.date_fin),
        "statut": emploi.statut,
        "creneaux": creneaux_data,
    }


@router.post("/emploi/{emploi_id}/creneaux")
def ajouter_creneau_examen(emploi_id: int, data: CreneauExamenCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Ajouter un créneau à l'emploi d'examen."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")

    # La classe référencée doit appartenir à cet établissement — jamais
    # acceptée aveuglément depuis le body.
    classe_valide = db.query(Classe.classe_id).filter(
        Classe.classe_id == data.classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe_valide:
        raise HTTPException(404, "Classe non trouvée")

    creneau = CreneauExamen(
        emploi_examen_id=emploi_id,
        classe_id=data.classe_id,
        matiere_id=data.matiere_id,
        date_examen=datetime.strptime(data.date_examen, "%Y-%m-%d").date(),
        heure_debut=data.heure_debut,
        heure_fin=data.heure_fin,
        salle=data.salle,
        surveillant_type=data.surveillant_type,
        surveillant_id=data.surveillant_id,
        surveillant_nom=data.surveillant_nom,
    )
    db.add(creneau)
    db.commit()
    db.refresh(creneau)
    return {"message": "Créneau ajouté.", "creneau_examen_id": creneau.creneau_examen_id}


@router.delete("/emploi/{emploi_id}/creneaux/{creneau_id}")
def supprimer_creneau_examen(emploi_id: int, creneau_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Supprimer un créneau d'examen."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")
    c = db.query(CreneauExamen).filter(
        CreneauExamen.creneau_examen_id == creneau_id,
        CreneauExamen.emploi_examen_id == emploi_id
    ).first()
    if not c:
        raise HTTPException(404, "Créneau non trouvé")
    db.delete(c)
    db.commit()
    return {"message": "Créneau supprimé."}


@router.put("/emploi/{emploi_id}/publier")
def publier_emploi_examen(emploi_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Publier l'emploi d'examen et notifier enseignants + élèves."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")

    nb = db.query(CreneauExamen).filter(CreneauExamen.emploi_examen_id == emploi_id).count()
    if nb == 0:
        raise HTTPException(400, "Aucun créneau dans cet emploi. Ajoutez des créneaux avant de publier.")

    emploi.statut = "PUBLIE"

    # Send notification to all teachers
    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=emploi.demande_id,
        expediteur_type="ADMIN",
        destinataire_type="TOUS_ENSEIGNANTS",
        objet_type="EXAMENS",
        sujet=f"📋 Emploi des examens publié — T{emploi.trimestre}",
        contenu=f"L'emploi des examens '{emploi.titre}' ({emploi.date_debut} au {emploi.date_fin}) est maintenant disponible. Consultez votre dashboard pour les détails."
    )
    db.add(msg)
    db.commit()

    return {"message": f"Emploi d'examen publié avec {nb} créneaux. Tous les enseignants ont été notifiés."}
