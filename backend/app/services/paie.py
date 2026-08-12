"""
SMARTSCHOOL — Calcul de la rémunération, source unique.

DEUX FAÇONS D'ÊTRE PAYÉ
-----------------------
* **MENSUEL** — un montant fixe, quel que soit le nombre d'heures. C'est le cas
  des instituteurs du primaire et de tout le personnel non enseignant
  (comptable, bibliothécaire, surveillant, gardien…).
* **HORAIRE** — le collège et le lycée. Le salaire se calcule à partir des
  heures réellement affectées.

LE TAUX
-------
Un enseignant porte un taux de référence. Une affectation peut le surcharger :
une heure de Terminale ne se paie pas comme une heure de 7ᵉ. On ne renseigne
l'exception que là où elle existe — même schéma que `coefficient_override` sur
les évaluations.

CE QUE CE MODULE NE FAIT PAS
----------------------------
Il ne crée aucune dépense. Les salaires ont leur propre module et leurs propres
écrans ; les mélanger aux dépenses de fonctionnement (fournitures, loyer,
électricité) rendrait les deux illisibles.

Il n'écrit rien : il calcule. La décision de payer, et la trace de ce paiement,
restent à l'appelant.
"""
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.academique import (
    Affectation, AnneeScolaire, Classe, Enseignant, Matiere, Utilisateur,
)

MODE_MENSUEL = "MENSUEL"
MODE_HORAIRE = "HORAIRE"

# Un mois scolaire compte quatre semaines de cours. Retenir 4,33 (52/12)
# facturerait des semaines de vacances ; les écoles guinéennes comptent en
# semaines travaillées, pas en moyenne annuelle.
SEMAINES_PAR_MOIS = Decimal("4")


def _dec(valeur) -> Decimal:
    return Decimal(str(valeur or 0))


def taux_effectif(affectation: Affectation, taux_enseignant) -> Decimal:
    """Tarif horaire retenu pour une affectation.

    L'exception d'abord, le taux de l'enseignant ensuite. `None` et `0` ne sont
    PAS équivalents : `None` signifie « rien de particulier ici », tandis qu'un
    0 explicite signifierait « cette heure n'est pas payée » — cas réel des
    heures bénévoles ou déjà couvertes par un forfait.
    """
    if affectation.taux_horaire is not None:
        return _dec(affectation.taux_horaire)
    return _dec(taux_enseignant)


def detail_heures_enseignant(
    db: Session, enseignant_id: int, annee_id: Optional[int] = None
) -> List[dict]:
    """Ligne par ligne : ce que l'enseignant assure, et à quel tarif.

    C'est ce détail que le bulletin de paie doit montrer. Un total sans son
    détail n'est pas contestable, donc pas vérifiable.

    Préchargement en lot : un enseignant a rarement plus de dix affectations,
    mais la préparation de paie boucle sur tout l'établissement.
    """
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        return []

    requete = db.query(Affectation).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.statut == "ACTIVE",
    )
    if annee_id:
        requete = requete.filter(Affectation.annee_id == annee_id)
    affectations = requete.all()
    if not affectations:
        return []

    classes = {
        c.classe_id: c for c in db.query(Classe).filter(
            Classe.classe_id.in_({a.classe_id for a in affectations})
        ).all()
    }
    matieres = {
        m.matiere_id: m for m in db.query(Matiere).filter(
            Matiere.matiere_id.in_({a.matiere_id for a in affectations})
        ).all()
    }

    lignes = []
    for a in affectations:
        heures = _dec(a.nb_heures_semaine)
        taux = taux_effectif(a, ens.taux_horaire)
        cl, mat = classes.get(a.classe_id), matieres.get(a.matiere_id)
        lignes.append({
            "affectation_id": a.affectation_id,
            "classe": cl.libelle if cl else "?",
            "matiere": mat.libelle if mat else "?",
            "heures_semaine": float(heures),
            "taux_horaire": float(taux),
            "taux_specifique": a.taux_horaire is not None,
            "montant_mensuel": float(heures * taux * SEMAINES_PAR_MOIS),
        })
    return sorted(lignes, key=lambda l: (l["classe"], l["matiere"]))


def salaire_enseignant(
    db: Session, enseignant_id: int, annee_id: Optional[int] = None
) -> dict:
    """Rémunération mensuelle d'un enseignant, avec son détail."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        return {"base": 0.0, "mode": MODE_HORAIRE, "lignes": [], "total_heures": 0.0}

    mode = (ens.mode_remuneration or MODE_HORAIRE).upper()

    if mode == MODE_MENSUEL:
        # Le détail des heures reste affiché : l'école doit pouvoir voir la
        # charge réelle d'un instituteur, même si elle ne détermine pas sa paie.
        lignes = detail_heures_enseignant(db, enseignant_id, annee_id)
        return {
            "base": float(_dec(ens.salaire_base)),
            "mode": MODE_MENSUEL,
            "lignes": lignes,
            "total_heures": float(sum(_dec(l["heures_semaine"]) for l in lignes)),
            "explication": "Salaire mensuel fixe — les heures sont indicatives.",
        }

    lignes = detail_heures_enseignant(db, enseignant_id, annee_id)
    total = sum(_dec(l["montant_mensuel"]) for l in lignes)
    heures = sum(_dec(l["heures_semaine"]) for l in lignes)

    # Aucune heure à facturer, mais un montant mensuel écrit noir sur blanc sur
    # la fiche : c'est le cas de tout enseignant saisi avant que le mode
    # horaire n'existe, et de toute école qui négocie un forfait plutôt qu'un
    # tarif à l'heure. Le mode par défaut étant HORAIRE, s'en tenir au calcul
    # des heures ferait tomber leur paie à zéro — sans erreur, sans alerte,
    # juste un salaire disparu. Un montant explicitement saisi par l'école
    # prime sur un calcul qui n'a rien à calculer.
    fixe = _dec(ens.salaire_base)
    if not lignes and fixe > 0:
        return {
            "base": float(fixe),
            "mode": MODE_MENSUEL,
            "lignes": [],
            "total_heures": 0.0,
            "explication": (
                "Montant mensuel saisi sur la fiche — aucune heure affectée "
                "pour le calculer autrement."
            ),
        }

    return {
        "base": float(total),
        "mode": MODE_HORAIRE,
        "lignes": lignes,
        "total_heures": float(heures),
        "explication": (
            f"{heures} h/semaine × {SEMAINES_PAR_MOIS} semaines"
            if lignes else
            "Aucune heure affectée et aucun salaire mensuel saisi : "
            "rien à verser tant que l'un des deux n'est pas renseigné."
        ),
    }


def salaire_personnel(db: Session, utilisateur_id: int) -> dict:
    """Rémunération d'un membre du personnel non enseignant.

    Toujours mensuelle et fixe : un comptable, un surveillant ou un gardien
    n'est pas payé à l'heure de cours. La prime mensuelle, elle, s'ajoute
    au salaire de base — c'est un élément permanent du contrat, à ne pas
    confondre avec les primes exceptionnelles d'un mois donné.
    """
    u = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == utilisateur_id).first()
    if not u:
        return {"base": 0.0, "mode": MODE_MENSUEL, "lignes": [], "total_heures": 0.0}
    base = _dec(u.salaire_base) + _dec(u.prime_mensuelle)
    return {
        "base": float(base),
        "mode": MODE_MENSUEL,
        "lignes": [],
        "total_heures": 0.0,
        "explication": "Salaire mensuel fixe.",
    }


def net_a_payer(
    base: float,
    primes: float = 0.0,
    avances: float = 0.0,
    retenues_absences: float = 0.0,
) -> dict:
    """Décomposition du net. Ne descend jamais sous zéro.

    Une avance supérieure au salaire du mois donnerait un net négatif, donc un
    « paiement » que l'école devrait recevoir de son employé. Le reliquat est
    signalé plutôt que soustrait : c'est à l'école de décider si elle le reporte
    sur le mois suivant.
    """
    brut = _dec(base) + _dec(primes)
    retenues = _dec(avances) + _dec(retenues_absences)
    net = brut - retenues
    reliquat = Decimal("0")
    if net < 0:
        reliquat = -net
        net = Decimal("0")
    return {
        "brut": float(brut),
        "total_retenues": float(retenues),
        "net": float(net),
        "reliquat_reporte": float(reliquat),
    }


def annee_courante_id(db: Session, etablissement_id: int) -> Optional[int]:
    """Année en cours DE CETTE ÉCOLE — jamais celle de la première venue."""
    a = (
        db.query(AnneeScolaire.annee_id)
        .filter(
            AnneeScolaire.etablissement_id == etablissement_id,
            AnneeScolaire.est_courante == "O",
        )
        .first()
    )
    return a[0] if a else None


# Codes de cycle consideres comme primaire. Le libelle n'est pas fiable (une
# ecole peut ecrire « Primaire », une autre « Elementaire ») : c'est le CODE du
# cycle qui fait foi, et il est configure par l'ecole elle-meme.
CODES_PRIMAIRE = {"PRM", "PRIMAIRE", "PRI", "ELEM", "ELEMENTAIRE"}


def enseigne_au_primaire(db: Session, enseignant_id: int) -> bool:
    """Cet enseignant a-t-il au moins une classe de primaire ?"""
    from app.models.academique import Cycle, Niveau

    codes = (
        db.query(Cycle.code)
        .join(Niveau, Niveau.cycle_id == Cycle.cycle_id)
        .join(Classe, Classe.niveau_id == Niveau.niveau_id)
        .join(Affectation, Affectation.classe_id == Classe.classe_id)
        .filter(
            Affectation.enseignant_id == enseignant_id,
            Affectation.statut == "ACTIVE",
        )
        .distinct()
        .all()
    )
    return any((c[0] or "").strip().upper() in CODES_PRIMAIRE for c in codes)


def synchroniser_mode_remuneration(db: Session, enseignant_id: int) -> Optional[str]:
    """Aligne le mode de remuneration sur les affectations reelles.

    REGLE DE L'ECOLE : des qu'un enseignant est affecte a une classe de
    PRIMAIRE, il est paye au MOIS. Un instituteur assure toutes les matieres
    d'une meme classe ; le compter a l'heure n'aurait aucun sens.

    Au-dela du primaire, c'est l'HORAIRE.

    Appelee a chaque creation ou suppression d'affectation : le mode ne doit
    pas dependre de l'ordre dans lequel l'ecole a saisi les choses. Ne commit
    pas — l'appelant maitrise sa transaction.

    Renvoie le mode retenu, ou None si l'enseignant est introuvable.
    """
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        return None
    mode = MODE_MENSUEL if enseigne_au_primaire(db, enseignant_id) else MODE_HORAIRE
    if (ens.mode_remuneration or "").upper() != mode:
        ens.mode_remuneration = mode
        db.flush()
    return mode
