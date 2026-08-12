"""
Migration — réparer les affectations qui portent 0 heure par semaine.

LE PROBLÈME
-----------
Le salaire d'un enseignant du collège ou du lycée se calcule à partir de ses
heures : `heures/semaine × taux horaire × 4 semaines`. Une affectation à
0 heure vaut donc 0 GNF, et un enseignant dont toutes les affectations sont à
0 ne perçoit rien — sans erreur, sans alerte, sans que rien à l'écran ne le
signale.

Les 12 affectations en base portent toutes 0 heure. Elles ont été créées avant
que la route d'affectation n'hérite des heures de la matière : elles n'ont
jamais eu de valeur, elles n'ont pas été mises à zéro.

D'OÙ VIENT LA VALEUR
--------------------
Pas d'une moyenne, pas d'une valeur par défaut, pas d'une intuition : de la
grille horaire de l'école elle-même. `ss_classe_matieres` porte, pour chaque
couple (classe, matière), le nombre d'heures hebdomadaires que l'école a
défini. L'affectation porte le même couple. La correspondance est exacte.

    UPDATE ss_affectations a
    SET    nb_heures_semaine = cm.nb_heures_semaine
    FROM   ss_classe_matieres cm
    WHERE  cm.classe_id = a.classe_id AND cm.matiere_id = a.matiere_id

CE QU'ON NE FAIT PAS
--------------------
Aucune affectation sans grille horaire correspondante n'est complétée. Inventer
« 2 heures par défaut » écrirait un salaire faux avec l'autorité d'une donnée
saisie. Ces cas sont LISTÉS pour que l'école les renseigne elle-même, depuis la
fiche de l'enseignant.

De même, une affectation dont la grille indique explicitement 0 heure reste à
0 : c'est peut-être voulu (matière assurée bénévolement, forfait déjà couvert).

Idempotente : relancer ne change rien une fois les heures posées, puisque seule
une affectation à 0 est touchée.

Run with: python backend/migrations/2026_08_paie_02_heures_affectations.py
          python backend/migrations/2026_08_paie_02_heures_affectations.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine


def _etat(conn):
    total = conn.execute(text("SELECT count(*) FROM ss_affectations")).scalar()
    a_zero = conn.execute(text(
        "SELECT count(*) FROM ss_affectations WHERE COALESCE(nb_heures_semaine, 0) = 0"
    )).scalar()
    reparables = conn.execute(text("""
        SELECT count(*) FROM ss_affectations a
        JOIN ss_classe_matieres cm
          ON cm.classe_id = a.classe_id AND cm.matiere_id = a.matiere_id
        WHERE COALESCE(a.nb_heures_semaine, 0) = 0
          AND COALESCE(cm.nb_heures_semaine, 0) > 0
    """)).scalar()
    return total, a_zero, reparables


def _orphelines(conn):
    """Affectations à 0 h que la grille horaire ne permet PAS de compléter."""
    return conn.execute(text("""
        SELECT a.affectation_id,
               COALESCE(e.prenom || ' ' || e.nom, '?') AS enseignant,
               COALESCE(c.libelle, '?')                AS classe,
               COALESCE(m.libelle, '?')                AS matiere,
               CASE WHEN cm.classe_matiere_id IS NULL
                    THEN 'aucune grille horaire pour ce couple classe/matiere'
                    ELSE 'grille horaire a 0 heure' END AS motif
        FROM ss_affectations a
        LEFT JOIN ss_classe_matieres cm
               ON cm.classe_id = a.classe_id AND cm.matiere_id = a.matiere_id
        LEFT JOIN ss_enseignants e ON e.enseignant_id = a.enseignant_id
        LEFT JOIN ss_classes    c ON c.classe_id     = a.classe_id
        LEFT JOIN ss_matieres   m ON m.matiere_id    = a.matiere_id
        WHERE COALESCE(a.nb_heures_semaine, 0) = 0
          AND COALESCE(cm.nb_heures_semaine, 0) = 0
        ORDER BY enseignant, classe, matiere
    """)).fetchall()


def migrate() -> int:
    with engine.begin() as conn:
        total, a_zero, reparables = _etat(conn)
        print(f"Affectations : {total} | a 0 heure : {a_zero} | "
              f"reparables depuis la grille horaire : {reparables}")

        if reparables:
            conn.execute(text("""
                UPDATE ss_affectations a
                SET    nb_heures_semaine = cm.nb_heures_semaine
                FROM   ss_classe_matieres cm
                WHERE  cm.classe_id  = a.classe_id
                  AND  cm.matiere_id = a.matiere_id
                  AND  COALESCE(a.nb_heures_semaine, 0) = 0
                  AND  COALESCE(cm.nb_heures_semaine, 0) > 0
            """))
            print(f"[OK]   {reparables} affectation(s) alignee(s) sur la grille horaire")
        else:
            print("[=]    rien a reparer depuis la grille horaire")

        restantes = _orphelines(conn)

    if restantes:
        print(f"\n[A COMPLETER] {len(restantes)} affectation(s) que la grille ne "
              f"permet pas de renseigner.")
        print("Rien n'est invente : l'ecole doit saisir ces heures depuis la fiche")
        print("de l'enseignant. Tant qu'elles restent a 0, ces heures ne sont pas")
        print("remunerees — ce qui est peut-etre voulu (benevolat, forfait).\n")
        for aff_id, ens, classe, matiere, motif in restantes:
            print(f"   #{aff_id:<5} {ens:<26} {matiere:<22} {classe:<14} — {motif}")
    else:
        print("\n[DONE] Plus aucune affectation a 0 heure.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        total, a_zero, reparables = _etat(conn)
        print(f"Affectations : {total} | a 0 heure : {a_zero} | "
              f"encore reparables : {reparables}")
        restantes = _orphelines(conn)
        if restantes:
            print(f"\n{len(restantes)} a completer a la main :")
            for aff_id, ens, classe, matiere, motif in restantes:
                print(f"   #{aff_id:<5} {ens:<26} {matiere:<22} {classe:<14} — {motif}")

        print("\nHeures par enseignant (base du salaire horaire) :")
        for nom, heures, nb in conn.execute(text("""
            SELECT e.prenom || ' ' || e.nom AS nom,
                   COALESCE(SUM(a.nb_heures_semaine), 0) AS heures,
                   count(a.affectation_id) AS nb
            FROM ss_enseignants e
            LEFT JOIN ss_affectations a
                   ON a.enseignant_id = e.enseignant_id AND a.statut = 'ACTIVE'
            GROUP BY e.enseignant_id, nom
            ORDER BY heures DESC, nom
        """)):
            marque = "   " if heures else "[0]"
            print(f"   {marque} {nom:<28} {float(heures):>6.1f} h/sem  "
                  f"({nb} affectation(s))")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
