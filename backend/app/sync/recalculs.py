"""
Totaux recalculés depuis leur source après une synchronisation.

LE PROBLÈME
-----------
Plusieurs compteurs sont tenus par incrément au moment de l'écriture : le
montant payé d'une facture (`+= montant` à chaque encaissement), l'effectif
d'une classe, les exemplaires disponibles... Deux postes hors-ligne qui
encaissent chacun 100 000 sur la même facture écrivent chacun « payé :
100 000 ». Fusionner ces deux lignes, quelle que soit la règle, donne un
total faux : il en manque un.

LA RÈGLE
--------
Ces champs ne sont jamais fusionnés ni signalés en conflit : ils sont
recalculés depuis leur source (les paiements valides, les inscriptions
actives, les exemplaires...), sur le cloud après chaque envoi d'un poste,
et sur le poste après chaque réception. Les définitions sont celles déjà
appliquées par le code des modules ; elles ont été vérifiées sur les données
réelles (526 factures, 1 052 échéances, 20 classes : aucun écart).
"""
from collections import defaultdict
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import func, select, update
from sqlalchemy.engine import Connection

from app.sync.perimetre import table

# Champs recalculés : exclus de la fusion et des conflits.
CHAMPS_CALCULES = {
    "ss_factures": frozenset({"montant_paye", "montant_restant", "statut"}),
    "ss_echeances_factures": frozenset({"montant_paye", "statut"}),
    "ss_ouvrages": frozenset({"nb_exemplaires", "nb_disponibles"}),
    "ss_classes": frozenset({"effectif_actuel"}),
    "ss_seances": frozenset({"nb_presents", "nb_absents", "nb_retards"}),
}

# Quand une ligne de la table change, quel total en dépend : (table du total,
# colonne de la ligne qui le désigne).
_DEPENDANCES = {
    "ss_paiements": (("ss_factures", "facture_id"), ("ss_echeances_factures", "echeance_id")),
    "ss_factures": (("ss_factures", "facture_id"),),
    "ss_echeances_factures": (("ss_echeances_factures", "echeance_id"),),
    "ss_exemplaires": (("ss_ouvrages", "ouvrage_id"),),
    "ss_ouvrages": (("ss_ouvrages", "ouvrage_id"),),
    "ss_inscriptions": (("ss_classes", "classe_id"),),
    "ss_classes": (("ss_classes", "classe_id"),),
    "ss_presences": (("ss_seances", "seance_id"),),
    "ss_seances": (("ss_seances", "seance_id"),),
}


def cibles(nom_table: str, *versions: Optional[dict]) -> dict[str, set]:
    """Les totaux qu'un changement de `nom_table` peut fausser, d'après ses
    versions (avant et après : une inscription changée de classe touche les
    deux classes)."""
    resultat = defaultdict(set)
    for cible, colonne in _DEPENDANCES.get(nom_table, ()):
        for version in versions:
            if version and version.get(colonne) is not None:
                resultat[cible].add(int(version[colonne]))
    return resultat


def fusionner(*listes: dict[str, set]) -> dict[str, set]:
    total = defaultdict(set)
    for liste in listes:
        for nom, cles in liste.items():
            total[nom] |= cles
    return total


def _somme(valeur) -> Decimal:
    return Decimal(str(valeur or 0))


def _mettre_a_jour(cx: Connection, nom: str, cle_nom: str, cle, actuel, nouveau: dict) -> None:
    """N'écrit que ce qui change : une écriture inutile repartirait dans le journal."""
    changes = {c: v for c, v in nouveau.items() if actuel[c] != v}
    if changes:
        t = table(nom)
        cx.execute(update(t).where(t.c[cle_nom] == cle).values(**changes))


def _factures(cx: Connection, ids: Iterable[int]) -> None:
    f, p = table("ss_factures"), table("ss_paiements")
    for ligne in cx.execute(select(f.c.facture_id, f.c.montant_net, f.c.montant_paye, f.c.montant_restant, f.c.statut)
                            .where(f.c.facture_id.in_(list(ids)))).mappings().all():
        paye = _somme(cx.execute(select(func.coalesce(func.sum(p.c.montant), 0)).where(
            p.c.facture_id == ligne["facture_id"], p.c.statut == "VALIDE")).scalar())
        restant = _somme(ligne["montant_net"]) - paye
        # Même règle que l'encaissement et l'annulation (api/finance.py).
        statut = "EN_ATTENTE" if paye <= 0 else ("PAYEE" if restant <= 0 else "PARTIELLEMENT_PAYEE")
        _mettre_a_jour(cx, "ss_factures", "facture_id", ligne["facture_id"], ligne, {
            "montant_paye": paye, "montant_restant": max(restant, Decimal(0)), "statut": statut})


def _echeances(cx: Connection, ids: Iterable[int]) -> None:
    e, p = table("ss_echeances_factures"), table("ss_paiements")
    for ligne in cx.execute(select(e.c.echeance_id, e.c.montant_attendu, e.c.montant_paye, e.c.statut)
                            .where(e.c.echeance_id.in_(list(ids)))).mappings().all():
        paye = _somme(cx.execute(select(func.coalesce(func.sum(p.c.montant), 0)).where(
            p.c.echeance_id == ligne["echeance_id"], p.c.statut == "VALIDE")).scalar())
        if paye <= 0:
            # Rien de payé : « en retard » reste « en retard ».
            statut = ligne["statut"] if ligne["statut"] in ("EN_ATTENTE", "EN_RETARD") else "EN_ATTENTE"
        else:
            statut = "PAYEE" if paye >= _somme(ligne["montant_attendu"]) else "PARTIELLEMENT_PAYEE"
        _mettre_a_jour(cx, "ss_echeances_factures", "echeance_id", ligne["echeance_id"], ligne,
                       {"montant_paye": paye, "statut": statut})


def _ouvrages(cx: Connection, ids: Iterable[int]) -> None:
    o, x = table("ss_ouvrages"), table("ss_exemplaires")
    for ligne in cx.execute(select(o.c.ouvrage_id, o.c.nb_exemplaires, o.c.nb_disponibles)
                            .where(o.c.ouvrage_id.in_(list(ids)))).mappings().all():
        total = cx.execute(select(func.count()).where(x.c.ouvrage_id == ligne["ouvrage_id"])).scalar()
        dispo = cx.execute(select(func.count()).where(
            x.c.ouvrage_id == ligne["ouvrage_id"], x.c.statut == "DISPONIBLE")).scalar()
        _mettre_a_jour(cx, "ss_ouvrages", "ouvrage_id", ligne["ouvrage_id"], ligne,
                       {"nb_exemplaires": total, "nb_disponibles": dispo})


def _classes(cx: Connection, ids: Iterable[int]) -> None:
    c, i = table("ss_classes"), table("ss_inscriptions")
    for ligne in cx.execute(select(c.c.classe_id, c.c.effectif_actuel)
                            .where(c.c.classe_id.in_(list(ids)))).mappings().all():
        effectif = cx.execute(select(func.count()).where(
            i.c.classe_id == ligne["classe_id"], i.c.statut == "ACTIVE")).scalar()
        _mettre_a_jour(cx, "ss_classes", "classe_id", ligne["classe_id"], ligne, {"effectif_actuel": effectif})


def _seances(cx: Connection, ids: Iterable[int]) -> None:
    s, p = table("ss_seances"), table("ss_presences")
    for ligne in cx.execute(select(s.c.seance_id, s.c.appel_fait, s.c.nb_presents, s.c.nb_absents, s.c.nb_retards)
                            .where(s.c.seance_id.in_(list(ids)))).mappings().all():
        if ligne["appel_fait"] != "O":
            continue  # pas d'appel : les compteurs restent vides (api/seances.py)
        comptes = dict(cx.execute(select(p.c.statut_presence, func.count()).where(
            p.c.seance_id == ligne["seance_id"]).group_by(p.c.statut_presence)).all())
        _mettre_a_jour(cx, "ss_seances", "seance_id", ligne["seance_id"], ligne, {
            "nb_presents": comptes.get("PRESENT", 0),
            "nb_absents": comptes.get("ABSENT", 0) + comptes.get("ABSENT_JUSTIFIE", 0),
            "nb_retards": comptes.get("RETARD", 0),
        })


_RECALCULS = {
    "ss_factures": _factures,
    "ss_echeances_factures": _echeances,
    "ss_ouvrages": _ouvrages,
    "ss_classes": _classes,
    "ss_seances": _seances,
}


def recalculer(cx: Connection, a_faire: dict[str, set]) -> None:
    for nom, ids in a_faire.items():
        ordonnes = sorted(ids)
        for debut in range(0, len(ordonnes), 500):
            _RECALCULS[nom](cx, ordonnes[debut:debut + 500])
