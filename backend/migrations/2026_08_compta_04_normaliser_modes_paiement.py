"""
Migration — un mode de paiement écrit d'une seule façon.

CE QUE ÇA RÈGLE
---------------
`mode_paiement` était du texte libre. Chaque écran y écrivait sa version :

    Espèces       2416      ESPECES         17
    Orange Money   763      ORANGE_MONEY     7
    Virement       821      Cash            (paiement groupé des salaires)

À l'écran, le panneau « Répartition par Mode » affichait **0 GNF partout** : il
regroupe sur les codes de référence, et aucune valeur enregistrée ne leur
correspondait. Le comptable ne pouvait donc pas répondre à la question la plus
élémentaire d'un rapprochement de caisse : combien est rentré en espèces ?

Le tri par mode ne servait à rien non plus, pour la même raison.

CE QUI EST FAIT
---------------
Chaque valeur est ramenée à son code de référence par
`app/core/modes_paiement.py` — la même fonction que celle qui garde désormais
l'écriture. Les libellés lisibles, les casses, les accents et « Cash » tombent
tous sur le bon code.

Ce qui n'est reconnu par personne n'est PAS rangé d'office sous « AUTRE » :
c'est listé, et l'école tranche. Une valeur inconnue mise dans une case
fourre-tout disparaîtrait des totaux tout aussi sûrement qu'avant, mais sans
qu'on puisse s'en apercevoir.

Concerne les encaissements (`ss_paiements`) et les décaissements
(`ss_depenses`) : les deux portent la même colonne et le même défaut.

Idempotente : une valeur déjà normalisée n'est pas réécrite.

Run with: python backend/migrations/2026_08_compta_04_normaliser_modes_paiement.py
          python backend/migrations/2026_08_compta_04_normaliser_modes_paiement.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine
from app.core.modes_paiement import normaliser_mode_paiement

CIBLES = [
    ("ss_paiements", "paiement_id", "encaissements"),
    ("ss_depenses", "depense_id", "decaissements"),
]


def _valeurs(conn, table: str):
    return conn.execute(text(
        f"SELECT mode_paiement, count(*) FROM {table} "
        f"WHERE mode_paiement IS NOT NULL GROUP BY 1 ORDER BY 2 DESC"
    )).fetchall()


def migrate() -> int:
    inconnus = {}
    with engine.begin() as conn:
        for table, _cle, libelle in CIBLES:
            print(f"\n── {libelle} ({table}) ──")
            corrigees = 0
            for valeur, nb in _valeurs(conn, table):
                code = normaliser_mode_paiement(valeur)
                if code is None:
                    inconnus.setdefault(table, []).append((valeur, nb))
                    continue
                if code == valeur:
                    print(f"   [=]  {valeur:<20} {nb:>5} deja normalise")
                    continue
                conn.execute(text(
                    f"UPDATE {table} SET mode_paiement = :c WHERE mode_paiement = :v"
                ), {"c": code, "v": valeur})
                print(f"   [OK] {valeur:<20} {nb:>5} -> {code}")
                corrigees += nb
            if not corrigees:
                print("   rien a corriger")

    if inconnus:
        print("\n[A TRANCHER] des valeurs qu'aucun code de reference ne couvre.")
        print("Elles ne sont PAS rangees sous « AUTRE » d'office : ce serait les")
        print("faire disparaitre des totaux sans que personne ne s'en apercoive.\n")
        for table, valeurs in inconnus.items():
            for valeur, nb in valeurs:
                print(f"   {table:<16} « {valeur} »  {nb} ligne(s)")
        return 1

    print("\n[DONE] Tous les modes de paiement portent un code de reference.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        for table, _cle, libelle in CIBLES:
            print(f"\n{libelle} ({table}) :")
            total_inconnu = 0
            for valeur, nb in _valeurs(conn, table):
                code = normaliser_mode_paiement(valeur)
                marque = "[OK]  " if code == valeur else ("[!!]  " if code is None else "[A FAIRE]")
                if code is None:
                    total_inconnu += nb
                print(f"   {marque} {str(valeur):<20} {nb:>6} ligne(s)")
            if total_inconnu:
                print(f"   -> {total_inconnu} ligne(s) sans code de reference")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
