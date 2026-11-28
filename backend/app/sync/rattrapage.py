"""
Lignes anciennes sans école : rattachées une fois, au démarrage du cloud.

Une table qui porte `etablissement_id` appartient à une école par cette
colonne (app/sync/perimetre.py). Deux tables la rendent facultative, et leurs
lignes les plus anciennes ne l'ont pas : les présences des agents (« jamais
peuplée avant le Lot 9 ») et les pointages des élèves. Les écrans les
comptaient quand même — par l'agent, par l'élève — mais aucun poste ne les
recevait : l'historique des présences montrait 10 lignes en ligne et 1 sur le
poste (constaté en comparant un poste au cloud).

Le code actuel renseigne l'école à chaque création : il ne reste que les
anciennes lignes. On les rattache à l'école de leur agent ou de leur élève.
Idempotent (seules les lignes sans école sont touchées), sans risque à
plusieurs processus, et journalisé comme toute écriture : les postes déjà
installés reçoivent ces lignes à leur synchronisation suivante.
"""
from sqlalchemy import and_, exists, select, update
from sqlalchemy.engine import Engine

from app.sync.perimetre import table


def _ecole_de(source, cle_source, cle_ligne):
    """L'école de la ligne liée (agent, élève), en sous-requête corrélée."""
    return select(source.c.etablissement_id).where(cle_source == cle_ligne).scalar_subquery()


def rattacher_les_lignes_sans_ecole(moteur: Engine) -> dict[str, int]:
    presences = table("ss_presences_agents")
    pointages = table("ss_pointage_eleves")
    enseignants = table("ss_enseignants")
    utilisateurs = table("ss_utilisateurs")
    eleves = table("ss_eleves")

    regles = [
        ("ss_presences_agents (enseignants)", presences, presences.c.type_agent == "ENSEIGNANT",
         enseignants, enseignants.c.enseignant_id, presences.c.agent_id),
        ("ss_presences_agents (personnel)", presences, presences.c.type_agent == "PERSONNEL",
         utilisateurs, utilisateurs.c.utilisateur_id, presences.c.agent_id),
        ("ss_pointage_eleves", pointages, True,
         eleves, eleves.c.eleve_id, pointages.c.eleve_id),
    ]
    rattachees = {}
    with moteur.begin() as cx:
        for nom, cible, condition, source, cle_source, cle_ligne in regles:
            rattachees[nom] = cx.execute(
                update(cible)
                .where(
                    cible.c.etablissement_id.is_(None),
                    condition,
                    exists().where(and_(cle_source == cle_ligne, source.c.etablissement_id.isnot(None))),
                )
                .values(etablissement_id=_ecole_de(source, cle_source, cle_ligne))
                .execution_options(synchronize_session=False)
            ).rowcount
    return {nom: n for nom, n in rattachees.items() if n}
