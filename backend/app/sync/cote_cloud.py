"""
Côté cloud : appliquer ce qu'un poste envoie, et lui dire ce qui a changé
dans son école depuis son dernier passage.

CE QU'UN POSTE ENVOIE
---------------------
Chaque changement arrive avec l'état COMPLET de la ligne (ou sa suppression),
jamais avec un incrément : le rejouer après une coupure n'a aucun effet de
plus. C'est ce qui rend l'envoi idempotent sans registre des lots.

Avant d'écrire, le cloud vérifie, avec les règles du périmètre
(`filtre_ecole`), que la ligne appartient à l'école du poste, avant ET après
le changement : un poste ne peut ni toucher une ligne d'une autre école, ni y
faire passer une des siennes.

Ce que le cloud ne peut pas appliquer (doublon d'une valeur unique, ligne
supprimée entre-temps, autre école) n'est jamais écarté en silence : la
version du poste est gardée dans `ss_sync_conflits` avec la raison en clair,
et le poste en est informé.

CE QU'UN POSTE REÇOIT
---------------------
Les entrées du journal publiées depuis son dernier passage, pour son école,
hors celles qu'il a lui-même envoyées, regroupées par ligne : la ligne telle
qu'elle est maintenant, ou sa suppression.
"""
import json
from collections import defaultdict
from datetime import datetime
from typing import Optional

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.academique import Appareil, SyncConflit, SyncJournal
from app.sync.identifiants import appareil_de, est_naturel
from app.sync.instantane import ligne_pour_le_poste
from app.sync.journal import TABLES_REMONTANTES, ecrire_au_nom_de, tables_journalisees_poste
from app.sync.perimetre import colonne_cle, filtre_ecole, table
from app.sync.recalculs import CHAMPS_CALCULES, cibles, fusionner, recalculer
from app.sync.serialisation import ligne_depuis_json, ligne_vers_json

LOT_MAX = 1000
PAGE_RECEPTION_MAX = 2000

# Données sensibles : modifiées des deux côtés en même temps, elles ne sont
# jamais tranchées automatiquement. La version du serveur est gardée et la
# direction choisit (écran « À vérifier »). Les autres : la plus récente gagne,
# et c'est consigné.
TABLES_SENSIBLES = frozenset({
    "ss_paiements", "ss_factures", "ss_echeances_factures", "ss_depenses",
    "ss_ecritures_comptables", "ss_lignes_ecritures", "ss_bulletins_paie",
    "ss_notes", "ss_inscriptions", "ss_utilisateurs",
})

# Verrou de PostgreSQL qui met les publications du journal à la file.
_VERROU_PUBLICATION = 734_201


class Refus(Exception):
    """Changement que le cloud refuse d'appliquer ; le message est pour la direction."""


# ── Publication du journal ─────────────────────────────────────────────────

def publier(db: Session) -> None:
    """Donne un numéro de publication aux entrées validées qui n'en ont pas,
    dans l'ordre de leur écriture. Une publication à la fois (verrou), si
    bien qu'un poste qui lit « après n » ne peut jamais rater une entrée :
    une écriture validée plus tard sera publiée plus tard, avec un numéro
    plus grand."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:v)"), {"v": _VERROU_PUBLICATION})
    db.execute(text("""
        UPDATE ss_sync_journal SET publie = a_publier.base + a_publier.rang
        FROM (
            SELECT seq,
                   (SELECT COALESCE(MAX(publie), 0) FROM ss_sync_journal) AS base,
                   ROW_NUMBER() OVER (ORDER BY seq) AS rang
            FROM ss_sync_journal WHERE publie IS NULL
        ) AS a_publier
        WHERE ss_sync_journal.seq = a_publier.seq
    """))
    db.commit()


def curseur_actuel(db: Session) -> int:
    """Jusqu'où le journal est publié, à cet instant."""
    publier(db)
    return db.query(func.max(SyncJournal.publie)).scalar() or 0


# ── Envoi d'un poste ───────────────────────────────────────────────────────

def _upsert(db: Session, t, valeurs: dict) -> None:
    cle = colonne_cle(t).name
    module = postgresql if db.get_bind().dialect.name == "postgresql" else sqlite
    ins = module.insert(t).values(**valeurs)
    maj = {nom: ins.excluded[nom] for nom in valeurs if nom != cle}
    db.execute(ins.on_conflict_do_update(index_elements=[cle], set_=maj) if maj
               else ins.on_conflict_do_nothing(index_elements=[cle]))


def _existe(db: Session, nom: str, cle: int) -> bool:
    k = colonne_cle(table(nom))
    return db.execute(select(k).where(k == cle)).first() is not None


def _appartient(db: Session, nom: str, cle: int, etablissement_id: int) -> bool:
    k = colonne_cle(table(nom))
    return db.execute(select(k).where(k == cle, filtre_ecole(nom, etablissement_id))).first() is not None


def _libelles(champs: list[str]) -> str:
    """« montant_remise, classe_id » → « Montant remise, Classe » : la raison
    est lue par la direction, pas par un développeur."""
    lisibles = []
    for champ in champs:
        texte = champ[:-3] if champ.endswith("_id") else champ
        texte = texte.replace("_", " ")
        lisibles.append(texte[:1].upper() + texte[1:])
    return ", ".join(lisibles)


class Conflit:
    """Champ modifié des deux côtés : tranché ou laissé à la direction."""

    def __init__(self, raison: str, resolution: Optional[str], serveur: Optional[dict]):
        self.raison, self.resolution, self.serveur = raison, resolution, serveur


def _modifie_ailleurs_le(db: Session, nom: str, cle: int, numero: int) -> Optional[datetime]:
    J = SyncJournal
    return db.query(func.max(J.date_changement)).filter(
        J.nom_table == nom, J.cle == cle,
        or_(J.appareil_origine.is_(None), J.appareil_origine != numero),
    ).scalar()


def _poste_plus_recent(db: Session, nom: str, cle: int, appareil: Appareil, modifie_le: Optional[str]) -> bool:
    """Dernière modification gagnante, pour les données simples. Les dates
    sont en temps universel des deux côtés (horloge du poste, horloge du
    serveur) ; sans date du poste, le serveur garde sa version."""
    ailleurs = _modifie_ailleurs_le(db, nom, cle, appareil.appareil_id)
    if not modifie_le:
        return False
    if ailleurs is None:
        return True
    try:
        poste = datetime.fromisoformat(modifie_le).replace(tzinfo=None)
    except ValueError:
        return False
    return poste >= ailleurs.replace(tzinfo=None)


def _appliquer(db: Session, appareil: Appareil, changement: dict) -> tuple[dict, bool, list[Conflit]]:
    """Applique un changement. Rend (totaux à recalculer, faut-il renvoyer la
    ligne aux postes, conflits rencontrés)."""
    nom = changement.get("table")
    if nom not in tables_journalisees_poste():
        raise Refus("Cette donnée ne se synchronise pas.")
    t = table(nom)
    k = colonne_cle(t)
    cle = int(changement["cle"])
    etab = appareil.etablissement_id
    calcules = CHAMPS_CALCULES.get(nom, frozenset())

    ligne = db.execute(select(t).where(k == cle)).mappings().first()
    courant = ligne_vers_json(t, ligne) if ligne else None
    if courant is not None and not _appartient(db, nom, cle, etab):
        raise Refus("Cette donnée appartient à une autre école.")
    avant = changement.get("avant")
    conflits: list[Conflit] = []

    def modifies(version: dict) -> set:
        return {c for c in version if avant is not None and c in avant and c not in calcules
                and version[c] != avant[c]}

    if changement.get("operation") == "D":
        if courant is None:
            return {}, False, []
        if avant is not None and modifies(courant):
            if nom in TABLES_SENSIBLES:
                raise Refus("Supprimée sur ce poste, mais modifiée sur le serveur entre-temps : "
                            "la donnée est gardée, à vérifier.")
            if not _poste_plus_recent(db, nom, cle, appareil, changement.get("modifie_le")):
                conflits.append(Conflit("Supprimée sur ce poste, modifiée plus récemment ailleurs : "
                                        "la version du serveur est gardée.", "AUTO_SERVEUR", courant))
                return {}, True, conflits
        db.execute(delete(t).where(k == cle))
        return cibles(nom, courant), False, conflits

    donnees = changement.get("donnees") or {}
    if courant is None and appareil_de(cle) != appareil.appareil_id and not est_naturel(cle):
        # Une ligne qui n'est pas de ce poste et que le cloud n'a plus : elle
        # a été supprimée ailleurs pendant que le poste la modifiait. La
        # recréer en silence défairait une suppression voulue.
        raise Refus("Cette donnée a été supprimée sur le serveur pendant que ce poste la modifiait.")

    version = donnees
    if courant is not None and avant is not None:
        cote_poste, cote_serveur = modifies(donnees), modifies(courant)
        if cote_serveur:
            # Fusion à trois : on part de la version du serveur et on n'y
            # porte que ce que le poste a réellement changé.
            version = dict(courant)
            for c in cote_poste:
                version[c] = donnees[c]
            des_deux_cotes = sorted(c for c in cote_poste & cote_serveur if donnees[c] != courant[c])
            if des_deux_cotes:
                champs = _libelles(des_deux_cotes)
                if nom in TABLES_SENSIBLES:
                    for c in des_deux_cotes:
                        version[c] = courant[c]
                    conflits.append(Conflit(
                        f"Modifiée sur ce poste et sur le serveur en même temps ({champs}) : la version du "
                        "serveur est gardée en attendant votre choix.", None, courant))
                elif _poste_plus_recent(db, nom, cle, appareil, changement.get("modifie_le")):
                    conflits.append(Conflit(f"Modifiée des deux côtés ({champs}) : la modification de ce "
                                            "poste, plus récente, est gardée.", "AUTO_POSTE", courant))
                else:
                    for c in des_deux_cotes:
                        version[c] = courant[c]
                    conflits.append(Conflit(f"Modifiée des deux côtés ({champs}) : la modification du "
                                            "serveur, plus récente, est gardée.", "AUTO_SERVEUR", courant))

    valeurs = ligne_depuis_json(t, version)
    valeurs[k.name] = cle
    if nom in TABLES_REMONTANTES and "etablissement_id" in t.c and valeurs.get("etablissement_id") is None:
        valeurs["etablissement_id"] = etab
    _upsert(db, t, valeurs)
    if not _appartient(db, nom, cle, etab):
        raise Refus("Cette donnée n'appartient pas à l'école de ce poste.")
    # Le poste doit recevoir le résultat si la fusion a gardé des champs du serveur.
    renvoyer = any(version.get(c) != donnees.get(c) for c in version if c not in calcules)
    return cibles(nom, courant, donnees), renvoyer, conflits


def _raison(erreur: IntegrityError) -> str:
    message = str(erreur.orig).lower()
    if "unique" in message or "duplicate" in message:
        return ("Doublon : une valeur qui doit être unique (identifiant de connexion, matricule, "
                "numéro...) existe déjà sur le serveur.")
    if "foreign key" in message or "clé étrangère" in message:
        return "Cette donnée désigne une autre donnée absente du serveur (supprimée entre-temps ?)."
    if "not null" in message or "null value" in message:
        return "Donnée incomplète : une information obligatoire manque."
    return "Le serveur a refusé cette donnée."


def appliquer_lot(db: Session, appareil: Appareil, changements: list[dict]) -> dict:
    """Applique un lot envoyé par `appareil`, dans l'ordre reçu (celui des
    écritures sur le poste, qui respectait déjà les clés étrangères). Ce
    qu'une première passe ne peut pas écrire est retenté une fois à la fin
    (une ligne qui attend une autre ligne du même lot)."""
    deja_refuses = {
        (c.seq_poste, c.nom_table, c.cle): c.raison
        for c in db.query(SyncConflit).filter(
            SyncConflit.appareil_id == appareil.appareil_id,
            SyncConflit.seq_poste.in_([int(ch["seq"]) for ch in changements] or [-1]),
        )
    }
    ecrire_au_nom_de(db.connection(), appareil.appareil_id)
    refuses, a_reprendre, a_recalculer, a_renvoyer, conflits = [], [], [], [], []

    def tenter(changement, derniere_chance: bool) -> None:
        try:
            with db.begin_nested():
                totaux, renvoyer, rencontres = _appliquer(db, appareil, changement)
            a_recalculer.append(totaux)
            if renvoyer:
                a_renvoyer.append(changement)
            conflits.extend((changement, c) for c in rencontres)
        except Refus as refus:
            refuses.append((changement, str(refus)))
        except IntegrityError as erreur:
            if derniere_chance:
                refuses.append((changement, _raison(erreur)))
            else:
                a_reprendre.append(changement)

    for changement in changements:
        empreinte = (int(changement["seq"]), changement.get("table"), int(changement["cle"]))
        if empreinte in deja_refuses:
            # Lot renvoyé après une coupure : ce refus est déjà enregistré.
            refuses.append((changement, deja_refuses[empreinte]))
            continue
        tenter(changement, derniere_chance=False)
    for changement in a_reprendre:
        tenter(changement, derniere_chance=True)

    # Ce qui suit n'est plus « venu du poste » : les totaux recalculés et les
    # lignes fusionnées doivent lui revenir, comme à tous les autres postes.
    ecrire_au_nom_de(db.connection(), None)
    recalculer(db.connection(), fusionner(*a_recalculer))
    for changement in a_renvoyer:
        db.add(SyncJournal(nom_table=changement["table"], cle=int(changement["cle"]), operation="U",
                           etablissement_id=appareil.etablissement_id, appareil_origine=None))

    def consigner(changement, raison, resolution=None, serveur=None):
        maintenant = datetime.now() if resolution else None
        db.add(SyncConflit(
            etablissement_id=appareil.etablissement_id, appareil_id=appareil.appareil_id,
            seq_poste=int(changement["seq"]), nom_table=str(changement.get("table"))[:64],
            cle=int(changement["cle"]), operation=str(changement.get("operation", "U"))[:1],
            donnees=json.dumps(changement.get("donnees"), ensure_ascii=False) if changement.get("donnees") else None,
            donnees_serveur=json.dumps(serveur, ensure_ascii=False) if serveur else None,
            raison=raison[:300], resolution=resolution, resolu_le=maintenant,
            resolu_par="Synchronisation" if resolution else None,
        ))

    for changement, raison in refuses:
        if (int(changement["seq"]), changement.get("table"), int(changement["cle"])) not in deja_refuses:
            consigner(changement, raison)
    for changement, conflit in conflits:
        consigner(changement, conflit.raison, conflit.resolution, conflit.serveur)

    appareil.dernier_contact = datetime.now()
    db.commit()
    return {
        "refus": [{"seq": int(c["seq"]), "table": c.get("table"), "cle": int(c["cle"]), "raison": r}
                  for c, r in refuses],
        "a_verifier": sum(1 for _, c in conflits if c.resolution is None),
    }


# ── « À vérifier » : la direction tranche ─────────────────────────────────

class ResolutionImpossible(Exception):
    """La version choisie ne peut pas être enregistrée ; le message le dit."""


def conflits_de(db: Session, etablissement_id: int, a_verifier_seulement: bool = True) -> list[dict]:
    requete = db.query(SyncConflit, Appareil).outerjoin(
        Appareil, Appareil.appareil_id == SyncConflit.appareil_id
    ).filter(SyncConflit.etablissement_id == etablissement_id)
    if a_verifier_seulement:
        requete = requete.filter(SyncConflit.resolution.is_(None))
    return [{
        "conflit_id": c.conflit_id,
        "table": c.nom_table,
        "cle": c.cle,
        "operation": c.operation,
        "raison": c.raison,
        "poste": f"P{a.rang}" + (f" — {a.nom}" if a.nom else "") if a else None,
        "cree_le": c.cree_le.isoformat() if c.cree_le else None,
        "version_poste": json.loads(c.donnees) if c.donnees else None,
        "version_serveur": json.loads(c.donnees_serveur) if c.donnees_serveur else None,
        "resolution": c.resolution,
        "resolu_par": c.resolu_par,
        "resolu_le": c.resolu_le.isoformat() if c.resolu_le else None,
    } for c, a in requete.order_by(SyncConflit.conflit_id.desc()).limit(500)]


def resoudre_conflit(db: Session, conflit: SyncConflit, choix: str, auteur: str) -> None:
    """SERVEUR : la ligne reste celle du serveur, et lui est republiée pour
    que le poste s'y aligne (y compris en effaçant une ligne que le serveur
    n'a jamais acceptée). POSTE : la version du poste est enregistrée, et part
    vers tous les postes. Dans les deux cas, les mêmes contrôles d'école que
    pour une synchronisation."""
    if conflit.resolution is not None:
        raise ResolutionImpossible("Ce conflit a déjà été tranché.")
    t = table(conflit.nom_table)
    k = colonne_cle(t)
    etab = conflit.etablissement_id
    ecrire_au_nom_de(db.connection(), None)

    if choix == "POSTE":
        if conflit.operation == "D":
            if _existe(db, conflit.nom_table, conflit.cle):
                if not _appartient(db, conflit.nom_table, conflit.cle, etab):
                    raise ResolutionImpossible("Cette donnée appartient à une autre école.")
                courant = db.execute(select(t).where(k == conflit.cle)).mappings().first()
                db.execute(delete(t).where(k == conflit.cle))
                recalculer(db.connection(), cibles(conflit.nom_table, ligne_vers_json(t, courant)))
        else:
            if not conflit.donnees:
                raise ResolutionImpossible("La version du poste n'a pas été conservée.")
            valeurs = ligne_depuis_json(t, json.loads(conflit.donnees))
            valeurs[k.name] = conflit.cle
            try:
                with db.begin_nested():
                    _upsert(db, t, valeurs)
                    if not _appartient(db, conflit.nom_table, conflit.cle, etab):
                        raise ResolutionImpossible("Cette donnée n'appartient pas à cette école.")
            except IntegrityError as erreur:
                raise ResolutionImpossible(
                    _raison(erreur) + " Corrigez d'abord la donnée en double, puis recommencez.")
            recalculer(db.connection(), cibles(conflit.nom_table, json.loads(conflit.donnees)))
    else:
        # Republier la ligne telle qu'elle est (ou son absence) : le poste,
        # qui garde peut-être sa version refusée, s'aligne à la réception.
        operation = "U" if _existe(db, conflit.nom_table, conflit.cle) else "D"
        db.add(SyncJournal(nom_table=conflit.nom_table, cle=conflit.cle, operation=operation,
                           etablissement_id=etab, appareil_origine=None))

    conflit.resolution = "POSTE" if choix == "POSTE" else "SERVEUR"
    conflit.resolu_par = (auteur or "")[:100]
    conflit.resolu_le = datetime.now()
    db.commit()


# ── Réception par un poste ─────────────────────────────────────────────────

def changements_pour(db: Session, appareil: Appareil, depuis: int, limite: int = PAGE_RECEPTION_MAX) -> dict:
    """Ce qui a changé dans l'école du poste depuis la publication `depuis`."""
    publier(db)
    etab, numero = appareil.etablissement_id, appareil.appareil_id
    J = SyncJournal
    plafond = db.query(func.max(J.publie)).scalar() or 0
    entrees = db.execute(
        select(J.publie, J.nom_table, J.cle, J.operation, J.etablissement_id)
        .where(J.publie > depuis, J.publie <= plafond,
               or_(J.etablissement_id == etab, J.etablissement_id.is_(None)),
               or_(J.appareil_origine.is_(None), J.appareil_origine != numero))
        .order_by(J.publie).limit(limite)
    ).all()
    complet = len(entrees) < limite
    curseur = plafond if complet else entrees[-1].publie

    # Une ligne modifiée dix fois ne voyage qu'une fois, dans son état actuel,
    # à la place de sa première apparition (un parent avant ses enfants).
    lignes: dict[tuple, dict] = {}
    for e in entrees:
        info = lignes.setdefault((e.nom_table, e.cle), {"premier": e.publie})
        info.update(operation=e.operation, ecole=e.etablissement_id, publie=e.publie)

    a_lire = defaultdict(list)
    for (nom, cle), info in lignes.items():
        if info["operation"] != "D":
            a_lire[nom].append(cle)
    trouvees = {}
    for nom, cles in a_lire.items():
        t = table(nom)
        k = colonne_cle(t)
        for debut in range(0, len(cles), 500):
            requete = select(t).where(k.in_(cles[debut:debut + 500]), filtre_ecole(nom, etab))
            for ligne in db.execute(requete).mappings():
                trouvees[(nom, ligne[k.name])] = ligne_pour_le_poste(t, ligne)

    changements = []
    for (nom, cle), info in sorted(lignes.items(), key=lambda paire: paire[1]["premier"]):
        base = {"table": nom, "cle": cle, "publie": info["publie"]}
        if info["operation"] != "D" and (nom, cle) in trouvees:
            changements.append({**base, "operation": "U", "donnees": trouvees[(nom, cle)]})
        elif info["operation"] == "D" or info["ecole"] == etab:
            # Supprimée, ou sortie de l'école. Une suppression est livrée même
            # sans école connue : les identifiants sont uniques sur toute la
            # plateforme, effacer une ligne que le poste n'a pas ne fait rien.
            changements.append({**base, "operation": "D"})
        # Sinon : ligne partagée qui ne concerne pas cette école.

    # Ce qui attend la direction pour toute l'école, quel que soit le poste
    # d'origine : chaque poste peut l'afficher, même s'il n'y est pour rien.
    a_verifier = db.query(func.count(SyncConflit.conflit_id)).filter(
        SyncConflit.etablissement_id == etab, SyncConflit.resolution.is_(None)).scalar()

    appareil.dernier_contact = datetime.now()
    db.commit()
    return {"changements": changements, "curseur": curseur, "suivant": not complet, "a_verifier": a_verifier}
