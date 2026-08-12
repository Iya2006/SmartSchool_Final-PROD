"""
SMARTSCHOOL API — Synchronisation Offline-First (Phase 1)

Rejoue les actions mises en file locale (IndexedDB via idb-keyval, voir
frontend/src/lib/offlineQueue.ts) pendant une coupure réseau, une fois la
connexion revenue. Périmètre volontairement restreint aux notes et présences
saisies par les enseignants (plan approuvé) — la comptabilité et les autres
modules restent "connexion requise" (cohérent avec le §12 du guide fourni :
les opérations financières ne doivent jamais être résolues automatiquement en
cas de conflit).

Chaque item d'un lot est traité INDÉPENDAMMENT — un item en échec/conflit ne
bloque jamais les autres, car la file locale peut contenir des actions de
plusieurs sessions/moments différents accumulées pendant la coupure.

Détection de conflit (Last-Write-Wins, §7 du guide pour les données
"simples") : le client envoie `base_updated_at`, l'horodatage de la donnée tel
qu'il le connaissait la dernière fois qu'il était en ligne. Si
`Note.updated_at` est plus récent que ça au moment de la synchro, quelqu'un
(ou le même enseignant depuis un autre appareil) a modifié la donnée
entretemps — on applique quand même la version locale (LWW), mais on le
signale explicitement dans `conflicts` pour que l'enseignant sache que sa
saisie hors-ligne a écrasé une modification concurrente. Pas de conflit géré
pour les présences : l'upsert par (inscription, date, demi-journée) EST déjà
la fusion automatique (deux appels ne peuvent pas légitimement diverger sur
la présence d'un même élève au même moment).
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.annee_lock import verifier_annee_modifiable
from app.core.database import get_db
from app.models.academique import Affectation, Classe, Evaluation, Note, Presence, Trimestre
from app.api.portail_enseignant import _enseignant_auth
from app.services.notation import valider_note

router = APIRouter(prefix="/api/sync", tags=["Synchronisation Offline"])


# ============================================================================
# NOTES — rejoue update_notes_batch_enseignant élément par élément
# ============================================================================

class NoteSyncItem(BaseModel):
    note_id: int
    valeur: Optional[float] = None
    est_absent: bool = False
    observation: Optional[str] = None
    base_updated_at: Optional[datetime] = None


class NotesSyncRequest(BaseModel):
    items: List[NoteSyncItem]


@router.post("/{enseignant_id}/notes")
def sync_notes(enseignant_id: int, data: NotesSyncRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    resultats = []
    conflicts = []

    for item in data.items:
        note = db.query(Note).filter(Note.note_id == item.note_id).first()
        if not note:
            resultats.append({"note_id": item.note_id, "statut": "INTROUVABLE"})
            continue

        evaluation = db.query(Evaluation).filter(Evaluation.evaluation_id == note.evaluation_id).first()
        if not evaluation or evaluation.enseignant_id != enseignant_id:
            resultats.append({"note_id": item.note_id, "statut": "REFUSE", "detail": "Note hors du périmètre de cet enseignant"})
            continue
        if evaluation.statut == "CENTRALISEE":
            resultats.append({"note_id": item.note_id, "statut": "REFUSE", "detail": "Évaluation déjà centralisée"})
            continue

        classe = db.query(Classe).filter(Classe.classe_id == evaluation.classe_id).first()
        try:
            verifier_annee_modifiable(db, classe.annee_id if classe else None)
        except HTTPException as e:
            resultats.append({"note_id": item.note_id, "statut": "REFUSE", "detail": e.detail})
            continue

        trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == evaluation.trimestre_id).first()
        if trimestre and trimestre.statut == "CLOTURE":
            resultats.append({"note_id": item.note_id, "statut": "REFUSE", "detail": f"{trimestre.libelle} est clôturé"})
            continue

        # Une note saisie hors ligne n'a traversé aucune validation serveur :
        # c'est ici, et nulle part ailleurs, qu'on peut encore la refuser.
        try:
            valeur = None if item.est_absent else valider_note(item.valeur, evaluation.note_sur)
        except ValueError as e:
            resultats.append({"note_id": item.note_id, "statut": "REFUSE", "detail": str(e)})
            continue

        conflit = bool(
            item.base_updated_at and note.updated_at
            and note.updated_at.replace(tzinfo=None) > item.base_updated_at.replace(tzinfo=None)
        )
        if conflit:
            conflicts.append({
                "note_id": item.note_id,
                "valeur_serveur": float(note.valeur) if note.valeur is not None else None,
                "valeur_appliquee": item.valeur,
                "modifie_le": note.updated_at.isoformat() if note.updated_at else None,
            })

        note.valeur = valeur
        note.est_absent = "O" if item.est_absent else "N"
        note.observation = item.observation
        note.updated_by = str(enseignant_id)
        resultats.append({"note_id": item.note_id, "statut": "CONFLIT_ECRASE" if conflit else "OK"})

    db.commit()
    nb_ok = sum(1 for r in resultats if r["statut"] in ("OK", "CONFLIT_ECRASE"))
    return {"resultats": resultats, "conflicts": conflicts, "nb_synchronises": nb_ok, "nb_total": len(data.items)}


# ============================================================================
# PRÉSENCES — rejoue enregistrer_appel élément par élément
# ============================================================================

class PresenceSyncItem(BaseModel):
    inscription_id: int
    statut: str  # PRESENT, ABSENT, RETARD


class PresencesSyncRequest(BaseModel):
    classe_id: int
    demi_journee: str
    date_presence: Optional[date] = None
    items: List[PresenceSyncItem]


@router.post("/{enseignant_id}/presences")
def sync_presences(enseignant_id: int, data: PresencesSyncRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    aff = db.query(Affectation).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.classe_id == data.classe_id,
        Affectation.statut == "ACTIVE",
    ).first()
    if not aff:
        raise HTTPException(403, "Vous n'êtes pas affecté à cette classe")

    classe = db.query(Classe).filter(Classe.classe_id == data.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    jour = data.date_presence or date.today()
    created = 0
    updated = 0

    for item in data.items:
        existing = db.query(Presence).filter(
            Presence.inscription_id == item.inscription_id,
            Presence.date_presence == jour,
            Presence.demi_journee == data.demi_journee,
        ).first()
        if existing:
            existing.statut_presence = item.statut
            existing.updated_by = str(enseignant_id)
            updated += 1
        else:
            db.add(Presence(
                inscription_id=item.inscription_id, date_presence=jour,
                demi_journee=data.demi_journee, statut_presence=item.statut,
                est_justifie="N", updated_by=str(enseignant_id),
            ))
            created += 1

    db.commit()
    return {
        "message": f"Appel synchronisé : {created} créées, {updated} mises à jour",
        "date": str(jour),
        "nb_synchronises": created + updated,
        "nb_total": len(data.items),
    }
