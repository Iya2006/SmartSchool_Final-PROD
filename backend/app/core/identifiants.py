"""
SMARTSCHOOL — Unicité des identifiants de connexion (chantier multi-écoles).

`POST /api/auth/login` accepte UN champ `identifiant` et le cherche
successivement dans quatre tables (`auth.py`) :

    1. Utilisateur : nom_utilisateur | email | telephone
    2. Enseignant  : telephone | email | matricule
    3. Parent      : telephone_1 | email
    4. Eleve       : matricule

La résolution se fait par `.first()`. Si deux comptes partagent une même
valeur — dans la même table ou dans deux tables différentes — le premier
trouvé gagne et **le second ne peut plus jamais se connecter**, silencieusement.

En mono-établissement le risque restait théorique. En multi-écoles il devient
mécanique : deux écoles inscrivent naturellement des personnes différentes
portant le même numéro de téléphone, et rien ne les en empêchait.

Un index unique ne suffit pas : il ne couvre qu'une colonne d'une table, alors
que la collision peut être **inter-tables** (le téléphone d'un enseignant de
l'école A contre celui d'un utilisateur de l'école B). D'où ce contrôle
applicatif, appliqué à la création et à la modification, en complément des
index uniques posés par la migration
`lot12_unicite_identifiants_connexion.py`.

Le contrôle est **volontairement global** (toutes écoles confondues) : c'est la
seule portée qui corresponde à la façon dont le login résout réellement les
identifiants. Le message d'erreur ne révèle jamais À QUI appartient la valeur
déjà prise, ni dans quel établissement — un administrateur ne doit pas pouvoir
sonder l'annuaire des autres écoles.
"""
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.academique import Eleve, Enseignant, Parent, Utilisateur

# (modèle, colonne de clé primaire, colonnes servant d'identifiant au login)
_SOURCES = (
    (Utilisateur, "utilisateur_id", ("nom_utilisateur", "email", "telephone")),
    (Enseignant, "enseignant_id", ("telephone", "email", "matricule")),
    (Parent, "parent_id", ("telephone_1", "email")),
    (Eleve, "eleve_id", ("matricule",)),
)


def _normaliser(valeur: Optional[str]) -> Optional[str]:
    """Une chaîne vide ou blanche n'est pas un identifiant : elle ne doit ni
    être testée, ni bloquer quoi que ce soit."""
    if valeur is None:
        return None
    valeur = valeur.strip()
    return valeur or None


def identifiant_deja_pris(
    db: Session,
    valeur: Optional[str],
    ignorer: Optional[tuple] = None,
) -> bool:
    """`valeur` est-elle déjà utilisable pour se connecter ?

    `ignorer` : couple `(modèle, identifiant)` à exclure de la recherche, pour
    qu'une modification ne se heurte pas à l'enregistrement qu'elle modifie.
    """
    valeur = _normaliser(valeur)
    if valeur is None:
        return False

    modele_ignore, id_ignore = ignorer if ignorer else (None, None)

    for modele, cle_primaire, colonnes in _SOURCES:
        requete = db.query(getattr(modele, cle_primaire)).filter(
            or_(*[getattr(modele, c) == valeur for c in colonnes])
        )
        if modele is modele_ignore and id_ignore is not None:
            requete = requete.filter(getattr(modele, cle_primaire) != id_ignore)
        if requete.first():
            return True
    return False


def exiger_identifiants_libres(
    db: Session,
    valeurs: Iterable[Optional[str]],
    ignorer: Optional[tuple] = None,
) -> None:
    """Lève 409 si l'une des valeurs sert déjà à un compte existant.

    409 (et non 400) : la requête est bien formée, c'est l'état actuel des
    données qui l'empêche d'aboutir. Sans ce contrôle, la contrainte d'unicité
    de la base remontait en `IntegrityError` non capturée, donc en **500**.
    """
    for valeur in valeurs:
        if identifiant_deja_pris(db, valeur, ignorer=ignorer):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"L'identifiant « {_normaliser(valeur)} » est déjà utilisé par un compte "
                    "existant. Un même numéro de téléphone, e-mail ou matricule ne peut "
                    "servir qu'à un seul compte, car c'est avec lui que l'on se connecte."
                ),
            )
