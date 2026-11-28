"""
Convergence d'un poste et du cloud : une fois synchronisés, chaque table de
l'école doit contenir exactement les mêmes lignes des deux côtés.

    python -m tests.outils.convergence --cloud "<adresse de la base du cloud>" \\
        --poste <chemin de smartschool.db> --cle-hex <clé> --etablissement 1

La clé est celle de la base chiffrée du poste (variable POSTE_CLE_HEX
acceptée à la place de --cle-hex). Lecture seule des deux côtés.

Compare, pour chaque table qui voyage dans les deux sens, le nombre de lignes
de l'école et leur contenu, colonne par colonne. Une différence de
représentation entre PostgreSQL et SQLite (décimal ou flottant, date avec ou
sans fuseau) n'en est pas une : les valeurs sont ramenées à une forme commune.
"""
import argparse
import datetime as dt
import decimal
import os
import sys

from sqlalchemy import Numeric, create_engine

from app.sync.journal import tables_journalisees_cloud
from app.sync.perimetre import colonnes_cle, requete_lignes, table

# Colonnes qui diffèrent par construction. Le cloud ne garde pas le code de
# vérification des reçus qu'il émet (il le recalcule à chaque lecture) ; le
# poste le garde, pour réimprimer un reçu venu d'un autre appareil
# (core/recu_paiement.py). L'égalité des codes AFFICHÉS est vérifiée par
# tests/outils/parite_routes.py.
COLONNES_PROPRES_A_CHAQUE_COTE = {("ss_paiements", "code_verification")}


def normaliser(valeur, colonne):
    if valeur is None:
        return None
    if isinstance(colonne.type, Numeric) or isinstance(valeur, (decimal.Decimal, float)):
        echelle = getattr(colonne.type, "scale", None)
        return str(round(decimal.Decimal(str(valeur)), echelle if echelle is not None else 6).normalize())
    if isinstance(valeur, dt.datetime):
        if valeur.tzinfo is not None:
            valeur = valeur.astimezone(dt.timezone.utc).replace(tzinfo=None)
        return valeur.isoformat(timespec="microseconds")
    if isinstance(valeur, (dt.date, dt.time)):
        return valeur.isoformat()
    if isinstance(valeur, bytes):
        return valeur.hex()
    if isinstance(valeur, bool):
        return int(valeur)
    return valeur


def lignes(moteur, nom, etablissement_id):
    t = table(nom)
    cles = [c.name for c in colonnes_cle(t)]
    with moteur.connect() as cx:
        resultat = {}
        for ligne in cx.execute(requete_lignes(nom, etablissement_id)).mappings():
            cle = tuple(ligne[c] for c in cles)
            resultat[cle] = {c.name: normaliser(ligne[c.name], c) for c in t.columns}
        return resultat


def comparer(moteur_cloud, moteur_poste, etablissement_id, tables=None):
    """[(table, lignes cloud, lignes poste, écarts)] ; un écart est une chaîne
    lisible (clé absente d'un côté, ou colonne différente)."""
    bilan = []
    for nom in tables or tables_journalisees_cloud():
        cloud, poste = lignes(moteur_cloud, nom, etablissement_id), lignes(moteur_poste, nom, etablissement_id)
        ecarts = []
        for cle in sorted(set(cloud) | set(poste), key=str):
            if cle not in poste:
                ecarts.append(f"{cle} absente du poste")
            elif cle not in cloud:
                ecarts.append(f"{cle} absente du cloud")
            else:
                for colonne, valeur in cloud[cle].items():
                    if (nom, colonne) in COLONNES_PROPRES_A_CHAQUE_COTE:
                        continue
                    if poste[cle].get(colonne) != valeur:
                        ecarts.append(f"{cle}.{colonne} : cloud {valeur!r} / poste {poste[cle].get(colonne)!r}")
        bilan.append((nom, len(cloud), len(poste), ecarts))
    return bilan


def moteur_du_poste(chemin, cle_hex):
    if cle_hex:
        from app.core.database import moteur_chiffre
        return moteur_chiffre(chemin, cle_hex)
    return create_engine(f"sqlite:///{chemin}")


def main() -> int:
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("--cloud", required=True)
    a.add_argument("--poste", required=True)
    a.add_argument("--cle-hex", default=os.environ.get("POSTE_CLE_HEX"))
    a.add_argument("--etablissement", type=int, required=True)
    args = a.parse_args()
    bilan = comparer(create_engine(args.cloud), moteur_du_poste(args.poste, args.cle_hex), args.etablissement)
    differentes = [b for b in bilan if b[3]]
    print(f"{len(bilan)} tables comparées, {sum(b[1] for b in bilan)} lignes côté cloud : "
          f"{len(bilan) - len(differentes)} identiques, {len(differentes)} différentes")
    for nom, n_cloud, n_poste, ecarts in differentes:
        print(f"  ≠ {nom} : {n_cloud} lignes au cloud, {n_poste} sur le poste, {len(ecarts)} écart(s)")
        for e in ecarts[:4]:
            print(f"      {e}")
    return 1 if differentes else 0


if __name__ == "__main__":
    sys.exit(main())
