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

PORTÉE — révisée pour les enseignants et les parents
-----------------------------------------------------
Le contrôle était volontairement GLOBAL, parce que le login résolvait
globalement. Cela rendait impossible un cas parfaitement légitime :

    L'école A inscrit le parent au 622 00 00 00.
    L'école B, où son deuxième enfant est scolarisé, ne peut PAS l'inscrire.

Même blocage pour un enseignant exerçant dans plusieurs établissements.

Depuis la migration `2026_08_multi_01`, une personne a **une fiche par école**
et le login accepte un **code d'établissement** pour lever l'ambiguïté. La
portée du contrôle suit :

* `Enseignant` et `Parent` — unicité **PAR ÉCOLE**. Deux écoles peuvent
  inscrire le même numéro ; à l'intérieur d'une école il reste unique.
* `Utilisateur` et `Eleve` — unicité **GLOBALE**, inchangée. Un compte
  administratif se connecte sans code d'école : deux valeurs identiques y
  seraient impossibles à départager. Le matricule d'un élève porte déjà
  l'identifiant de son école, il ne peut pas entrer en collision.

Le message d'erreur ne révèle jamais À QUI appartient la valeur déjà prise, ni
dans quel établissement — un administrateur ne doit pas pouvoir sonder
l'annuaire des autres écoles.
"""
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.academique import Eleve, Enseignant, Parent, Utilisateur

# (modèle, clé primaire, colonnes servant d'identifiant, portée de l'unicité)
#
# `par_ecole=True` : la valeur peut se répéter d'une école à l'autre, mais reste
# unique à l'intérieur d'une école. C'est le cas des personnes qui exercent ou
# ont des enfants dans plusieurs établissements.
_SOURCES = (
    (Utilisateur, "utilisateur_id", ("nom_utilisateur", "email", "telephone"), False),
    (Enseignant, "enseignant_id", ("telephone", "email", "matricule"), True),
    (Parent, "parent_id", ("telephone_1", "email"), True),
    (Eleve, "eleve_id", ("matricule",), False),
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
    etablissement_id: Optional[int] = None,
) -> bool:
    """`valeur` est-elle déjà utilisable pour se connecter ?

    `ignorer` : couple `(modèle, identifiant)` à exclure de la recherche, pour
    qu'une modification ne se heurte pas à l'enregistrement qu'elle modifie.

    `etablissement_id` : école dans laquelle on crée le compte. Les tables à
    portée « par école » (enseignants, parents) ne sont alors examinées que
    dans cette école — c'est ce qui permet à deux établissements d'inscrire la
    même personne.

    Sans `etablissement_id`, le contrôle reste GLOBAL sur toutes les tables :
    comportement d'origine, conservé pour les appelants qui ne savent pas dans
    quelle école ils écrivent. Plus strict, donc jamais dangereux.
    """
    valeur = _normaliser(valeur)
    if valeur is None:
        return False

    modele_ignore, id_ignore = ignorer if ignorer else (None, None)

    for modele, cle_primaire, colonnes, par_ecole in _SOURCES:
        requete = db.query(getattr(modele, cle_primaire)).filter(
            or_(*[getattr(modele, c) == valeur for c in colonnes])
        )
        if par_ecole and etablissement_id is not None:
            requete = requete.filter(modele.etablissement_id == etablissement_id)
        if modele is modele_ignore and id_ignore is not None:
            requete = requete.filter(getattr(modele, cle_primaire) != id_ignore)
        if requete.first():
            return True
    return False


def exiger_identifiants_libres(
    db: Session,
    valeurs: Iterable[Optional[str]],
    ignorer: Optional[tuple] = None,
    etablissement_id: Optional[int] = None,
) -> None:
    """Lève 409 si l'une des valeurs sert déjà à un compte existant.

    409 (et non 400) : la requête est bien formée, c'est l'état actuel des
    données qui l'empêche d'aboutir. Sans ce contrôle, la contrainte d'unicité
    de la base remontait en `IntegrityError` non capturée, donc en **500**.
    """
    for valeur in valeurs:
        if identifiant_deja_pris(db, valeur, ignorer=ignorer,
                                 etablissement_id=etablissement_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"L'identifiant « {_normaliser(valeur)} » est déjà utilisé dans cet "
                    "établissement. Un même numéro de téléphone, e-mail ou matricule ne "
                    "peut y servir qu'à un seul compte, car c'est avec lui que l'on se "
                    "connecte."
                ),
            )
