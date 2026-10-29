"""
Côté poste : préparer ce qui part au cloud, et appliquer ce qui en arrive.

ENVOI
-----
Le journal local dit quelles lignes ont changé. Chacune part UNE fois par
lot, dans son état actuel (ou comme supprimée), à la place de sa première
apparition dans le journal : une ligne créée avant une autre qui la désigne
part avant elle. Le journal n'est vidé qu'après l'accusé du cloud : une
coupure en plein envoi ne perd rien, le lot repart tel quel (sans effet
double, puisque ce sont des états et non des incréments).

RÉCEPTION
---------
Une page de changements s'applique en une transaction, avec le drapeau
`application_distante` levé (ni garde de plage, ni journal) et les clés
étrangères vérifiées à la validation seulement : l'ordre à l'intérieur de la
page n'importe plus. Le curseur avance dans la même transaction : une page
est appliquée en entier, ou pas du tout et relue.

Une ligne qui a encore un changement local en attente n'est pas écrasée :
la version du poste part au prochain envoi, et le cloud tranche.
"""
import json
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.dialects import sqlite
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.sync.identifiants import application_distante
from app.sync.perimetre import colonne_cle, table
from app.sync.recalculs import cibles, fusionner, recalculer
from app.sync.serialisation import encoder, ligne_depuis_json, ligne_vers_json
from app.sync.tables_poste import ecrire_etat, journal_local, lire_etat, non_appliques, refus_locaux

TAILLE_LOT = 500
CURSEUR = "curseur_reception"


def changements_en_attente(moteur: Engine) -> int:
    with moteur.connect() as cx:
        return cx.execute(select(func.count()).select_from(journal_local)).scalar_one()


def noter_a_verifier(moteur: Engine, nombre: int) -> None:
    with moteur.begin() as cx:
        ecrire_etat(cx, "a_verifier", int(nombre or 0))


def a_verifier(moteur: Engine) -> int:
    with moteur.connect() as cx:
        return int(lire_etat(cx, "a_verifier") or 0)


def mis_de_cote(moteur: Engine) -> int:
    with moteur.connect() as cx:
        return sum(cx.execute(select(func.count()).select_from(t)).scalar_one() for t in (refus_locaux, non_appliques))


_DIALECTE = sqlite.dialect()


def _avant_en_json(t, brut: Optional[str]) -> Optional[dict]:
    """La ligne d'avant, notée par le déclencheur (valeurs brutes de SQLite),
    remise dans le format exact de `ligne_vers_json` : le cloud compare les
    deux champ par champ."""
    if not brut:
        return None
    valeurs = json.loads(brut)
    resultat = {}
    for c in t.columns:
        if c.name not in valeurs:
            continue
        valeur = valeurs[c.name]
        traitement = c.type.result_processor(_DIALECTE, None)
        if traitement is not None and valeur is not None:
            valeur = traitement(valeur)
        resultat[c.name] = encoder(c, valeur)
    return resultat


def construire_lot(moteur: Engine, limite: int = TAILLE_LOT) -> tuple[list[dict], int | None]:
    """(changements, numéro de la dernière entrée du journal couverte).

    Chaque ligne part avec son état actuel et, si elle existait déjà avant ce
    lot, son état d'avant le premier changement local (`avant`) : la base de
    la fusion à trois du cloud."""
    with moteur.connect() as cx:
        entrees = cx.execute(select(journal_local).order_by(journal_local.c.seq).limit(limite)).all()
        if not entrees:
            return [], None
        lignes: dict[tuple, dict] = {}
        for e in entrees:
            info = lignes.setdefault((e.nom_table, e.cle), {
                "premier": e.seq,
                # Créée dans ce lot : pas d'état d'avant, c'est une nouvelle ligne.
                "avant": None if e.operation == "I" else e.avant,
            })
            info["seq"], info["date"] = e.seq, e.date
        changements = []
        for (nom, cle), info in sorted(lignes.items(), key=lambda paire: paire[1]["premier"]):
            t = table(nom)
            ligne = cx.execute(select(t).where(colonne_cle(t) == cle)).mappings().first()
            base = {"seq": info["seq"], "table": nom, "cle": cle, "modifie_le": info["date"],
                    "avant": _avant_en_json(t, info["avant"])}
            if ligne is None:
                changements.append({**base, "operation": "D"})
            else:
                changements.append({**base, "operation": "U", "donnees": ligne_vers_json(t, ligne)})
        return changements, entrees[-1].seq


def accuser(moteur: Engine, jusqu_a: int, refus: list[dict]) -> None:
    """Le cloud a reçu le lot : ce qu'il a appliqué quitte le journal, ce
    qu'il a refusé est gardé avec sa raison."""
    with moteur.begin() as cx:
        cx.execute(delete(journal_local).where(journal_local.c.seq <= jusqu_a))
        for r in refus:
            cx.execute(sqlite.insert(refus_locaux).values(
                seq=r["seq"], nom_table=r["table"], cle=r["cle"], raison=r["raison"][:300],
            ).on_conflict_do_nothing())


def curseur(moteur: Engine) -> int:
    with moteur.connect() as cx:
        return int(lire_etat(cx, CURSEUR) or 0)


def _appliquer_un(cx, changement: dict) -> dict[str, set]:
    """Applique une ligne reçue ; rend les totaux qu'elle peut avoir faussés."""
    nom = changement["table"]
    t = table(nom)
    k = colonne_cle(t)
    avant = cx.execute(select(t).where(k == changement["cle"])).mappings().first()
    a_recalculer = cibles(nom, dict(avant) if avant else None, changement.get("donnees"))
    if changement["operation"] == "D":
        cx.execute(delete(t).where(k == changement["cle"]))
        return a_recalculer
    valeurs = ligne_depuis_json(t, changement["donnees"])
    ins = sqlite.insert(t).values(**valeurs)
    maj = {c: ins.excluded[c] for c in valeurs if c != k.name}
    cx.execute(ins.on_conflict_do_update(index_elements=[k.name], set_=maj) if maj
               else ins.on_conflict_do_nothing())
    return a_recalculer


def appliquer_changements(moteur: Engine, page: dict) -> int:
    """Applique une page reçue du cloud. Rend le nombre de lignes écrites.

    Chaque ligne s'applique dans son propre point de reprise : celle qui ne
    peut pas l'être (doublon avec une ligne du poste refusée par le cloud) est
    mise de côté avec sa raison, et le reste de la page passe. Une seule ligne
    ne bloque jamais toute la synchronisation.

    Les clés étrangères sont d'abord vérifiées à la validation seulement (l'ordre
    dans la page n'importe plus). Si une ligne désigne une ligne mise de côté,
    la validation échoue : la page est alors rejouée avec une vérification
    immédiate, ligne par ligne, et seules les lignes en cause sont écartées."""
    try:
        return _appliquer_page(moteur, page, verification_differee=True)
    except IntegrityError:
        return _appliquer_page(moteur, page, verification_differee=False)


def _appliquer_page(moteur: Engine, page: dict, verification_differee: bool) -> int:
    ecrites = 0
    a_recalculer: list[dict[str, set]] = []
    with moteur.begin() as cx:
        # Le drapeau d'abord : c'est la première écriture qui ouvre la
        # transaction, et le report des clés étrangères ne vaut qu'à l'intérieur.
        application_distante(cx, True)
        if verification_differee:
            cx.exec_driver_sql("PRAGMA defer_foreign_keys = ON")
        en_attente = set(cx.execute(select(journal_local.c.nom_table, journal_local.c.cle)).all())

        def tenter(changement: dict) -> bool:
            nom, cle = changement["table"], changement["cle"]
            try:
                with cx.begin_nested():
                    a_recalculer.append(_appliquer_un(cx, changement))
                # La ligne est maintenant celle du cloud : ce qui la concernait
                # (mise de côté, refus tranché par la direction) est réglé.
                for t in (non_appliques, refus_locaux):
                    cx.execute(delete(t).where(t.c.nom_table == nom, t.c.cle == cle))
                return True
            except IntegrityError as erreur:
                ins = sqlite.insert(non_appliques).values(
                    nom_table=nom, cle=cle, raison=_raison_locale(erreur), changement=json.dumps(changement))
                cx.execute(ins.on_conflict_do_update(index_elements=["nom_table", "cle"], set_={
                    "raison": ins.excluded.raison, "changement": ins.excluded.changement}))
                return False

        recus = set()
        for changement in page["changements"]:
            recus.add((changement["table"], changement["cle"]))
            if (changement["table"], changement["cle"]) in en_attente:
                continue
            ecrites += tenter(changement)
        # Ce qui avait été mis de côté passe peut-être maintenant (doublon
        # tranché, ligne attendue arrivée) : nouvelle tentative.
        for nom, cle, brut in cx.execute(select(non_appliques.c.nom_table, non_appliques.c.cle,
                                                non_appliques.c.changement)).all():
            if (nom, cle) not in recus and (nom, cle) not in en_attente and brut:
                ecrites += tenter(json.loads(brut))
        # Totaux recalculés depuis leur source, drapeau toujours levé : le
        # cloud fait le même calcul de son côté, inutile de le lui renvoyer.
        recalculer(cx, fusionner(*a_recalculer))
        ecrire_etat(cx, CURSEUR, page["curseur"])
        application_distante(cx, False)
    return ecrites


def _raison_locale(erreur: IntegrityError) -> str:
    message = str(erreur.orig).lower()
    if "unique" in message:
        return ("Doublon avec une donnée de ce poste (refusée par le serveur) : "
                "une valeur qui doit être unique est déjà prise ici.")
    if "foreign key" in message:
        return "Elle dépend d'une donnée mise de côté ou absente de ce poste."
    return "Donnée du serveur impossible à enregistrer sur ce poste."
