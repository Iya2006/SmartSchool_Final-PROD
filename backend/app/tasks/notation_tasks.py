"""
SMARTSCHOOL — Tâches worker du moteur de notation

Même contrat que app/tasks/bulletin_tasks.py : exécutées par un worker RQ,
pas par un process FastAPI — pas de `Depends(get_db)`, chaque tâche ouvre et
ferme sa propre session, et revérifie contre la base au moment de l'exécution
plutôt que de faire confiance au payload mis en file (le serveur reste
l'autorité, principe déjà appliqué dans sync.py et GET /eleves/delta).

Pourquoi ces deux calculs en particulier : ce sont les seules opérations du
module qui grossissent avec l'effectif. Le calcul d'une période traite
effectif × matières × évaluations, puis écrit un Bulletin et ses lignes par
élève — sur une classe de 160 élèves et 12 matières, la requête HTTP
synchrone tient la connexion ouverte plusieurs dizaines de secondes. Le reste
du module (aperçu, saisie, fiche de classement) reste synchrone : ces
opérations sont soit bornées, soit attendues immédiatement à l'écran.
"""
import os

from app.core.database import SessionLocal
from app.models.academique import AnneeScolaire, Bulletin, Classe, Inscription, Trimestre
from app.services.notation import (
    calculer_resultats_annuels,
    calculer_resultats_periode,
)


def _classe_verifiee(db, classe_id: int, etablissement_id: int) -> Classe:
    """Charge la classe en refusant net si elle a changé d'établissement.

    Isolation multi-école, même défense que bulletin_tasks.py : une tâche mise
    en file il y a longtemps ne doit jamais écrire dans les données d'une
    autre école « au cas où ».
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise ValueError(f"Classe {classe_id} introuvable")
    if classe.etablissement_id != etablissement_id:
        raise PermissionError(
            f"Classe {classe_id} appartient à l'établissement "
            f"{classe.etablissement_id}, pas {etablissement_id} — tâche refusée."
        )
    return classe


def calculer_periode_task(classe_id: int, trimestre_id: int, etablissement_id: int) -> dict:
    """Calcule et persiste les bulletins d'une période pour toute une classe.

    Rejoue les mêmes garde-fous que l'endpoint synchrone : une période clôturée
    entre-temps ne doit pas être recalculée par une tâche partie avant sa
    clôture. Idempotente — relancer produit le même résultat (les lignes de
    bulletin sont remplacées, pas empilées).
    """
    db = SessionLocal()
    try:
        _classe_verifiee(db, classe_id, etablissement_id)

        trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == trimestre_id).first()
        if not trimestre:
            raise ValueError(f"Période {trimestre_id} introuvable")
        if trimestre.statut == "CLOTURE":
            raise PermissionError(
                f"{trimestre.libelle} a été clôturé — recalcul refusé."
            )

        res = calculer_resultats_periode(db, classe_id, trimestre_id, persist=True)
        return {
            "classe": res["classe"],
            "periode": trimestre.libelle,
            "effectif": res["effectif"],
            "bulletins_crees": res["bulletins_crees"],
            "bulletins_total": res["bulletins_total"],
        }
    finally:
        db.close()


def calculer_annuel_task(classe_id: int, etablissement_id: int) -> dict:
    """Calcule et persiste les bulletins annuels d'une classe.

    Agrège les bulletins de période déjà calculés — à lancer une fois toutes
    les périodes de l'année calculées.
    """
    db = SessionLocal()
    try:
        classe = _classe_verifiee(db, classe_id, etablissement_id)
        annee = db.query(AnneeScolaire).filter(
            AnneeScolaire.annee_id == classe.annee_id
        ).first()

        res = calculer_resultats_annuels(db, classe_id, persist=True)
        return {
            "classe": res["classe"],
            "annee": annee.libelle if annee else None,
            "effectif": res["effectif"],
            "bulletins_crees": res.get("bulletins_crees"),
            "bulletins_total": res.get("bulletins_total"),
        }
    finally:
        db.close()


def generer_bulletins_classe_task(
    classe_id: int, etablissement_id: int,
    trimestre_id: int = None, type_bulletin: str = "TRIMESTRIEL",
) -> dict:
    """Génère les PDF de tous les bulletins d'une classe, en un seul lot.

    C'est le cas que la génération asynchrone d'un bulletin unique préparait
    sans le couvrir : imprimer une classe entière, c'est aujourd'hui autant
    d'appels HTTP que d'élèves, chacun reconstruisant le PDF en pleine requête.

    Un échec sur un élève n'interrompt pas le lot — le bulletin d'un élève ne
    doit pas empêcher l'impression des 159 autres. Les échecs sont remontés
    nommément dans le résultat pour que l'école sache exactement quoi reprendre.
    """
    from app.api.evaluations import _build_bulletin_pdf_bytes  # import tardif : évite un cycle

    db = SessionLocal()
    try:
        _classe_verifiee(db, classe_id, etablissement_id)

        query = db.query(Bulletin).join(
            Inscription, Inscription.inscription_id == Bulletin.inscription_id
        ).filter(
            Inscription.classe_id == classe_id,
            Bulletin.type_bulletin == type_bulletin,
        )
        query = (query.filter(Bulletin.trimestre_id == trimestre_id)
                 if trimestre_id else query.filter(Bulletin.trimestre_id.is_(None)))
        bulletins = query.all()
        if not bulletins:
            raise ValueError(
                "Aucun bulletin à imprimer : calculez d'abord les moyennes de la période."
            )

        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        upload_dir = os.path.join(backend_root, "uploads", "bulletins")
        os.makedirs(upload_dir, exist_ok=True)

        fichiers, echecs = [], []
        for bulletin in bulletins:
            try:
                pdf_bytes, nom_fichier = _build_bulletin_pdf_bytes(bulletin.bulletin_id, db)
                with open(os.path.join(upload_dir, nom_fichier), "wb") as f:
                    f.write(pdf_bytes)
                fichiers.append({
                    "bulletin_id": bulletin.bulletin_id,
                    "filename": nom_fichier,
                    "download_url": f"/uploads/bulletins/{nom_fichier}",
                })
            except Exception as exc:
                echecs.append({"bulletin_id": bulletin.bulletin_id, "erreur": str(exc)})

        return {
            "nb_generes": len(fichiers),
            "nb_echecs": len(echecs),
            "fichiers": fichiers,
            "echecs": echecs,
        }
    finally:
        db.close()
