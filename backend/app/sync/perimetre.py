"""
Périmètre d'un établissement : les lignes de chaque table qui lui appartiennent.

C'est la base du poste local. À l'installation, un appareil reçoit EXACTEMENT
ces lignes, ni plus (aucune donnée d'une autre école), ni moins (aucune
référence cassée). La synchronisation s'appuie ensuite sur la même définition.

Trois façons, pour une table, d'appartenir à un établissement :

1. Elle porte `etablissement_id` : les lignes de cet établissement.
2. Elle n'en porte pas mais pointe, par clé étrangère, vers une table du
   périmètre (`ss_notes` → `ss_evaluations` → `ss_classes`) : les lignes dont
   TOUS les parents renseignés sont dans le périmètre. Calculé par sous-requêtes, jamais
   en chargeant des listes d'identifiants en mémoire (5 000 élèves, des
   centaines de milliers de présences).
3. C'est un référentiel commun à toutes les écoles (plan comptable SYSCOHADA) :
   copié en entier. Il ne sert jamais à rattacher une autre table, sinon les
   lignes comptables de TOUTES les écoles suivraient.

Deux exceptions sont traitées explicitement :
- un parent dont les enfants sont dans plusieurs écoles n'a pas toujours
  l'`etablissement_id` de cette école : il suit ses enfants (`ss_eleve_parent`) ;
- `ss_photos_en_attente` désigne son élève ou son parent par
  `entity_type` + `entity_id`, sans clé étrangère.

Une table impossible à rattacher lève une erreur : on ne veut jamais en
oublier une en silence (voir tests/test_sync_perimetre.py).
"""
from functools import lru_cache

from sqlalchemy import Table, and_, or_, select
from sqlalchemy.sql import Select

from app.core.database import Base
import app.models.academique  # noqa: F401 — enregistre toutes les tables

REFERENTIELS_COMMUNS = frozenset({"ss_comptes_comptables", "ss_journaux_comptables"})

# La mécanique de synchronisation elle-même : propre à chaque base, jamais
# copiée d'une base à l'autre. Le registre des postes et l'empreinte de leurs
# jetons restent sur le cloud, comme son journal des changements.
TABLES_HORS_SYNCHRO = frozenset({"ss_appareils", "ss_sync_journal", "ss_sync_conflits"})


class TableHorsPerimetre(Exception):
    """Table qu'aucune règle ne rattache à un établissement."""


def tables_ordonnees() -> list[Table]:
    """Toutes les tables, parents avant enfants (ordre d'import)."""
    return list(Base.metadata.sorted_tables)


def table(nom: str) -> Table:
    return Base.metadata.tables[nom]


def colonnes_cle(t: Table) -> list:
    return list(t.primary_key.columns)


def colonne_cle(t: Table):
    """Clé primaire simple. Seules les tables visées par une clé étrangère en
    ont besoin ; une table à clé composée (`ss_sequences_matricule`) porte
    directement `etablissement_id` et n'est jamais un parent."""
    cles = colonnes_cle(t)
    if len(cles) != 1:
        raise TableHorsPerimetre(f"{t.name} : clé composée, ne peut pas servir de parent")
    return cles[0]


def _filtre(nom_table: str, etablissement_id: int, en_cours: frozenset = frozenset()):
    """Condition SQL qui sélectionne les lignes de `nom_table` dans le périmètre."""
    t = table(nom_table)

    if nom_table in REFERENTIELS_COMMUNS:
        return True

    if nom_table == "ss_parents":
        lien = table("ss_eleve_parent")
        eleves = _cles_du_perimetre("ss_eleves", etablissement_id, en_cours | {nom_table})
        enfants_ici = select(lien.c.parent_id).where(lien.c.eleve_id.in_(eleves))
        return or_(t.c.etablissement_id == etablissement_id, t.c.parent_id.in_(enfants_ici))

    if nom_table == "ss_photos_en_attente":
        eleves = _cles_du_perimetre("ss_eleves", etablissement_id, en_cours | {nom_table})
        parents = _cles_du_perimetre("ss_parents", etablissement_id, en_cours | {nom_table})
        return or_(
            (t.c.entity_type == "eleve") & t.c.entity_id.in_(eleves),
            (t.c.entity_type == "parent") & t.c.entity_id.in_(parents),
        )

    if "etablissement_id" in t.c:
        return t.c.etablissement_id == etablissement_id

    # TOUS les parents renseignés doivent être dans le périmètre, pas un seul :
    # un lien élève↔parent dont le parent est ici mais l'élève dans une autre
    # école partait sinon avec l'export (trouvé par
    # tests/test_sync_instantane.py). Et au moins un parent doit être
    # renseigné : une ligne orpheline n'appartient à personne.
    conditions, renseignes = [], []
    for fk in t.foreign_keys:
        parent = fk.column.table.name
        if parent in REFERENTIELS_COMMUNS or parent == nom_table or parent in en_cours:
            continue
        colonne = fk.parent
        conditions.append(or_(colonne.is_(None), colonne.in_(
            _cles_du_perimetre(parent, etablissement_id, en_cours | {nom_table}))))
        renseignes.append(colonne.isnot(None))
    if not conditions:
        raise TableHorsPerimetre(f"{nom_table} : aucun lien vers un établissement")
    return and_(*conditions, or_(*renseignes))


def filtre_ecole(nom_table: str, etablissement_id: int):
    """Condition SQL : la ligne appartient à l'école `etablissement_id`. La
    même règle sert à l'installation, à la réception et au contrôle de ce
    qu'un poste envoie."""
    return _filtre(nom_table, etablissement_id)


def _cles_du_perimetre(nom_table: str, etablissement_id: int, en_cours: frozenset = frozenset()) -> Select:
    """Sous-requête des clés primaires de `nom_table` dans le périmètre."""
    t = table(nom_table)
    return select(colonne_cle(t)).where(_filtre(nom_table, etablissement_id, en_cours))


def requete_lignes(nom_table: str, etablissement_id: int) -> Select:
    """Toutes les colonnes des lignes du périmètre, triées par clé primaire."""
    t = table(nom_table)
    return select(t).where(_filtre(nom_table, etablissement_id)).order_by(*colonnes_cle(t))


@lru_cache(maxsize=1)
def verifier_toutes_les_tables() -> tuple[str, ...]:
    """Vérifie que chaque table synchronisée a une règle. Rend leurs noms dans
    l'ordre d'import."""
    noms = []
    for t in tables_ordonnees():
        if t.name in TABLES_HORS_SYNCHRO:
            continue
        requete_lignes(t.name, 0)
        noms.append(t.name)
    return tuple(noms)


__all__ = [
    "REFERENTIELS_COMMUNS",
    "TABLES_HORS_SYNCHRO",
    "TableHorsPerimetre",
    "colonne_cle",
    "colonnes_cle",
    "requete_lignes",
    "table",
    "tables_ordonnees",
    "verifier_toutes_les_tables",
]
