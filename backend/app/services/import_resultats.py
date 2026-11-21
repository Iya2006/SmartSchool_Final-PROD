"""
SMARTSCHOOL — Importer les résultats d'une classe depuis un tableau.

**Pourquoi.** Beaucoup d'écoles ont déjà leurs moyennes dans un classeur Excel
tenu à la main. Pour obtenir un classement et des bulletins dans SmartSchool,
il fallait jusqu'ici ressaisir chaque note de chaque épreuve de chaque matière
— des jours de travail pour un résultat qu'elles possèdent déjà. L'import
reprend le tableau tel qu'il est.

**Ce que cela ne remplace pas.** La saisie épreuve par épreuve reste là,
inchangée, et reste la seule manière d'obtenir le détail par devoir, les
classements en cours de période et les relevés par épreuve. L'import est une
porte d'entrée supplémentaire pour les écoles qui travaillent autrement.

**Deux formats, parce que les écoles n'ont pas toutes le même tableau.**

- `DETAILLE` : une ligne par élève, une colonne par matière. Le bulletin
  ressemble alors à un vrai bulletin, avec le détail des matières.
- `SIMPLE` : une ligne par élève, une seule colonne de moyenne générale. Se
  remplit en cinq minutes ; le classement et les mentions sortent, mais le
  bulletin n'a aucun détail par matière.

Le format est déduit des en-têtes, et l'appelant peut l'imposer.

**Comment cela se branche sur l'existant.** L'import n'invente aucun calcul :
il écrit des bulletins de période (`Bulletin` + `BulletinLigne`), exactement
comme le ferait le calcul à partir des notes. Toute la machine en aval —
moyenne annuelle, rang, mention, bulletins annuels — continue de fonctionner
sans savoir d'où viennent les chiffres. Une école qui importe chaque semestre
obtient donc ses résultats de fin d'année automatiquement.

**Le rapprochement des élèves est strict et rend des comptes.** Un élève du
fichier qui ne correspond à personne n'est pas créé, et un élève de la classe
absent du fichier n'est pas effacé : les deux sont signalés. Attribuer la
moyenne d'un élève à un homonyme serait une faute invisible et durable.
"""
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.academique import (
    Bulletin, BulletinLigne, Classe, ClasseMatiere, Eleve, Inscription, Matiere,
)
from app.services.import_tabulaire import normaliser_entete
from app.services.notation import (
    RANG_NIVEAU, appliquer_rangs, get_appreciation, get_bareme_effectif,
    get_cycle_key, get_mention, normaliser_note, repercuter_rangs_niveau,
)

FORMAT_DETAILLE = "DETAILLE"
FORMAT_SIMPLE = "SIMPLE"

# Intitulés acceptés pour chaque colonne d'identité. Les fichiers reçus ne
# portent jamais deux fois le même intitulé d'une école à l'autre.
_COLS_MATRICULE = ("matricule", "n matricule", "no matricule", "num matricule", "matr", "immatriculation")
_COLS_NOM = ("nom", "noms", "nom eleve", "nom de l eleve", "nom et prenom", "nom prenom", "nom complet")
_COLS_PRENOM = ("prenom", "prenoms", "prenom eleve", "prenom de l eleve")
_COLS_MOYENNE = (
    "moyenne", "moyenne generale", "moy", "moy gen", "moy generale",
    "moyenne gen", "moyenne annuelle", "moyenne semestrielle", "moyenne trimestrielle",
    "mg", "moy g",
)

# Colonnes d'habillage présentes dans presque tous les tableaux d'école : on
# les ignore en silence plutôt que de les signaler comme matières inconnues,
# ce qui noierait les vraies anomalies.
_COLS_IGNOREES = (
    "rang", "rg", "mention", "observation", "observations", "appreciation",
    "appreciations", "classe", "sexe", "genre", "decision", "resultat",
    "total", "total points", "points", "coefficient", "coefficients",
    "effectif", "date de naissance", "naissance", "nee le", "ne le", "age",
    "n", "no", "numero", "ordre", "n ordre", "lieu de naissance", "matieres",
)


class ImportImpossible(Exception):
    """Le fichier ne peut pas être exploité — message destiné à l'utilisateur."""


def _nombre(texte: str) -> Optional[float]:
    """`"12,5"` et `"12.5"` valent 12.5 ; `""`, `"-"`, `"abs"` ne valent rien.

    La virgule décimale est la norme dans un tableur francophone. La refuser
    rendrait l'import inutilisable sur les fichiers réellement reçus.
    """
    brut = (texte or "").strip().replace(" ", "").replace(" ", "")
    if not brut or brut in {"-", "--", "/", "x", "X"}:
        return None
    brut = brut.replace(",", ".")
    try:
        return float(brut)
    except ValueError:
        return None


def _cle_nom(nom: str, prenom: str) -> str:
    return normaliser_entete(f"{nom} {prenom}")


def _index_eleves(db: Session, classe_id: int) -> Tuple[Dict[str, int], Dict[str, int], Dict[int, dict]]:
    """Trois index des inscriptions ACTIVES : par matricule, par nom, et le détail.

    Le nom est indexé dans les deux ordres (« Bah Alpha » et « Alpha Bah ») :
    les tableaux d'école écrivent l'un ou l'autre sans règle fixe.
    """
    lignes = db.query(Inscription, Eleve).join(
        Eleve, Eleve.eleve_id == Inscription.eleve_id
    ).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE",
    ).all()

    par_matricule: Dict[str, int] = {}
    par_nom: Dict[str, int] = {}
    detail: Dict[int, dict] = {}
    noms_ambigus: set = set()

    for insc, el in lignes:
        detail[insc.inscription_id] = {
            "inscription_id": insc.inscription_id,
            "eleve_id": el.eleve_id,
            "nom": el.nom,
            "prenom": el.prenom,
            "matricule": el.matricule,
            "nom_complet": f"{el.prenom or ''} {el.nom or ''}".strip(),
        }
        if el.matricule:
            par_matricule[normaliser_entete(el.matricule)] = insc.inscription_id
        for cle in {_cle_nom(el.nom or "", el.prenom or ""), _cle_nom(el.prenom or "", el.nom or "")}:
            if not cle:
                continue
            # Deux élèves homonymes dans la même classe : on refuse de choisir.
            # Attribuer la moyenne à l'un des deux au hasard serait une erreur
            # que personne ne détecterait jamais.
            if cle in par_nom and par_nom[cle] != insc.inscription_id:
                noms_ambigus.add(cle)
            par_nom[cle] = insc.inscription_id

    for cle in noms_ambigus:
        par_nom.pop(cle, None)

    return par_matricule, par_nom, detail


def matieres_de_la_classe(db: Session, classe_id: int) -> Dict[str, dict]:
    """Matières actives de la classe, indexées par libellé ET par code normalisés."""
    cms = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.est_active == "O",
    ).all()
    if not cms:
        return {}
    matieres = {
        m.matiere_id: m for m in db.query(Matiere).filter(
            Matiere.matiere_id.in_([cm.matiere_id for cm in cms])
        ).all()
    }
    index: Dict[str, dict] = {}
    for cm in cms:
        mat = matieres.get(cm.matiere_id)
        if not mat:
            continue
        info = {
            "matiere_id": mat.matiere_id,
            "libelle": mat.libelle,
            "coefficient": float(cm.coefficient) if cm.coefficient else float(mat.coefficient_defaut or 1),
        }
        for cle in (normaliser_entete(mat.libelle), normaliser_entete(mat.code)):
            if cle:
                index.setdefault(cle, info)
    return index


def analyser(
    db: Session,
    classe: Classe,
    colonnes: List[str],
    lignes: List[Dict[str, str]],
    *,
    format_impose: Optional[str] = None,
    note_sur: Optional[float] = None,
    etablissement_id: Optional[int] = None,
) -> dict:
    """Lit le fichier et dit ce qui se passerait, sans rien écrire.

    Un import de résultats touche le classement et les bulletins de toute une
    classe. Le faire sans avoir montré ce qui va être rapproché, ce qui ne
    l'est pas, et quelles colonnes ont été comprises, reviendrait à demander à
    l'école de vérifier après coup — c'est-à-dire jamais.
    """
    etablissement_id = etablissement_id or classe.etablissement_id
    cycle_key = get_cycle_key(classe.classe_id, db)

    par_matricule, par_nom, detail = _index_eleves(db, classe.classe_id)
    if not detail:
        raise ImportImpossible(
            "Aucun élève actif dans cette classe pour cette année : il n'y a rien à rapprocher."
        )

    matieres = matieres_de_la_classe(db, classe.classe_id)

    # ── Rôle de chaque colonne ──
    cols_identite = {normaliser_entete(c) for c in (_COLS_MATRICULE + _COLS_NOM + _COLS_PRENOM)}
    cols_moyenne = {normaliser_entete(c) for c in _COLS_MOYENNE}
    cols_ignorees = {normaliser_entete(c) for c in _COLS_IGNOREES}

    colonnes_matieres: List[dict] = []
    colonnes_inconnues: List[str] = []
    colonne_moyenne: Optional[str] = None

    for col in colonnes:
        if not col:
            continue
        if col in cols_moyenne and colonne_moyenne is None:
            colonne_moyenne = col
            continue
        if col in cols_identite or col in cols_ignorees:
            continue
        mat = matieres.get(col)
        if mat:
            colonnes_matieres.append({"colonne": col, **mat})
        else:
            colonnes_inconnues.append(col)

    format_detecte = FORMAT_DETAILLE if colonnes_matieres else FORMAT_SIMPLE
    format_retenu = (format_impose or format_detecte).upper()
    if format_retenu not in (FORMAT_DETAILLE, FORMAT_SIMPLE):
        raise ImportImpossible("Format demandé inconnu : attendu DETAILLE ou SIMPLE.")
    if format_retenu == FORMAT_DETAILLE and not colonnes_matieres:
        raise ImportImpossible(
            "Aucune colonne du fichier ne correspond à une matière de cette classe. "
            + (f"Colonnes non reconnues : {', '.join(colonnes_inconnues[:6])}. " if colonnes_inconnues else "")
            + "Vérifiez que les intitulés reprennent les libellés ou les codes des matières, "
              "ou choisissez le format « moyenne générale seule »."
        )
    if format_retenu == FORMAT_SIMPLE and not colonne_moyenne:
        raise ImportImpossible(
            "Aucune colonne de moyenne générale trouvée. Nommez-la « Moyenne » "
            "ou « Moyenne générale »."
        )

    rapproches: List[dict] = []
    non_rapproches: List[dict] = []
    erreurs: List[dict] = []
    vus: set = set()

    for i, ligne in enumerate(lignes, start=2):  # 2 = première ligne sous l'en-tête
        matricule = next((ligne[normaliser_entete(c)] for c in _COLS_MATRICULE
                          if ligne.get(normaliser_entete(c))), "")
        nom = next((ligne[normaliser_entete(c)] for c in _COLS_NOM
                    if ligne.get(normaliser_entete(c))), "")
        prenom = next((ligne[normaliser_entete(c)] for c in _COLS_PRENOM
                       if ligne.get(normaliser_entete(c))), "")
        identite = (f"{matricule} " if matricule else "") + f"{nom} {prenom}".strip()
        identite = identite.strip() or "(ligne sans identité)"

        inscription_id = None
        if matricule:
            inscription_id = par_matricule.get(normaliser_entete(matricule))
        if inscription_id is None and (nom or prenom):
            # « nom » peut déjà contenir le nom complet : les deux clés sont tentées.
            for cle in (_cle_nom(nom, prenom), _cle_nom(prenom, nom), normaliser_entete(nom)):
                if cle and cle in par_nom:
                    inscription_id = par_nom[cle]
                    break

        if inscription_id is None:
            non_rapproches.append({
                "ligne": i,
                "identite": identite,
                "raison": (
                    "Aucun élève actif de cette classe ne porte ce matricule."
                    if matricule else
                    "Aucun élève actif de cette classe ne porte ce nom, ou deux homonymes "
                    "l'empêchent — ajoutez une colonne Matricule pour lever le doute."
                ),
            })
            continue
        if inscription_id in vus:
            erreurs.append({
                "ligne": i,
                "message": f"{identite} apparaît plusieurs fois dans le fichier — seule la première ligne est retenue.",
            })
            continue
        vus.add(inscription_id)

        notes: Dict[int, float] = {}
        if format_retenu == FORMAT_DETAILLE:
            for col in colonnes_matieres:
                brut = ligne.get(col["colonne"], "")
                val = _nombre(brut)
                if val is None:
                    if brut.strip():
                        erreurs.append({
                            "ligne": i,
                            "message": f"{identite} — « {col['libelle']} » : « {brut} » n'est pas un nombre, colonne ignorée.",
                        })
                    continue
                echelle = note_sur or get_bareme_effectif(
                    db, classe.classe_id, col["matiere_id"],
                    cycle_key=cycle_key, etablissement_id=etablissement_id,
                )
                if val < 0 or val > echelle:
                    erreurs.append({
                        "ligne": i,
                        "message": f"{identite} — « {col['libelle']} » : {val} sort du barème /{echelle:g}, ligne ignorée pour cette matière.",
                    })
                    continue
                notes[col["matiere_id"]] = round(normaliser_note(val, echelle), 2)

        moyenne_fichier = _nombre(ligne.get(colonne_moyenne, "")) if colonne_moyenne else None
        if moyenne_fichier is not None:
            echelle_g = note_sur or 20.0
            if moyenne_fichier < 0 or moyenne_fichier > echelle_g:
                erreurs.append({
                    "ligne": i,
                    "message": f"{identite} — moyenne {moyenne_fichier} hors du barème /{echelle_g:g}, ignorée.",
                })
                moyenne_fichier = None
            else:
                moyenne_fichier = round(normaliser_note(moyenne_fichier, echelle_g), 2)

        # La moyenne du fichier fait foi quand elle est fournie : c'est le
        # chiffre que l'école a déjà communiqué aux familles. La recalculer à
        # partir des matières donnerait un résultat différent du bulletin déjà
        # remis — même principe que `resultats_annuels_bulk`.
        moyenne = moyenne_fichier
        moyenne_calculee = None
        if notes:
            coefs = {c["matiere_id"]: c["coefficient"] for c in colonnes_matieres}
            total_points = sum(v * coefs.get(mid, 1) for mid, v in notes.items())
            total_coef = sum(coefs.get(mid, 1) for mid in notes)
            if total_coef > 0:
                moyenne_calculee = round(total_points / total_coef, 2)
        if moyenne is None:
            moyenne = moyenne_calculee

        if moyenne is None:
            non_rapproches.append({
                "ligne": i,
                "identite": identite,
                "raison": "Aucune moyenne exploitable sur cette ligne (ni moyenne générale, ni note de matière).",
            })
            vus.discard(inscription_id)
            continue

        rapproches.append({
            "ligne": i,
            "inscription_id": inscription_id,
            "eleve": detail[inscription_id],
            "moyenne_generale": moyenne,
            "moyenne_calculee": moyenne_calculee,
            "moyenne_fournie": moyenne_fichier is not None,
            "notes": notes,
        })

    absents = [
        d for iid, d in detail.items() if iid not in {r["inscription_id"] for r in rapproches}
    ]

    return {
        "classe": classe.libelle,
        "classe_id": classe.classe_id,
        "format_detecte": format_detecte,
        "format_retenu": format_retenu,
        "colonne_moyenne": colonne_moyenne,
        "colonnes_matieres": [
            {"colonne": c["colonne"], "matiere_id": c["matiere_id"],
             "libelle": c["libelle"], "coefficient": c["coefficient"]}
            for c in colonnes_matieres
        ],
        "colonnes_inconnues": colonnes_inconnues,
        "lignes_lues": len(lignes),
        "rapproches": rapproches,
        "nb_rapproches": len(rapproches),
        "non_rapproches": non_rapproches,
        "eleves_sans_resultat": sorted(absents, key=lambda d: (d["nom"] or "", d["prenom"] or "")),
        "erreurs": erreurs,
    }


def appliquer(
    db: Session,
    classe: Classe,
    analyse: dict,
    *,
    trimestre_id: Optional[int],
    etablissement_id: Optional[int] = None,
) -> dict:
    """Écrit les bulletins décrits par `analyse`, puis classe et mentionne.

    `trimestre_id` fourni : bulletins de période (`TRIMESTRIEL`). L'école qui
    importe chaque semestre obtient ensuite ses résultats annuels par
    l'agrégation existante, sans rien faire de plus.

    `trimestre_id` à None : bulletin annuel direct (`ANNUEL`), pour l'école qui
    ne veut importer qu'une fois, en fin d'année.

    **Un élève absent du fichier n'est jamais touché.** Son bulletin
    précédent, s'il en a un, reste tel quel : un import partiel ne doit pas
    effacer un travail déjà fait. C'est précisément ce que l'école attend
    quand elle importe classe par classe, ou qu'elle corrige un seul fichier.
    """
    etablissement_id = etablissement_id or classe.etablissement_id
    cycle_key = get_cycle_key(classe.classe_id, db)
    type_bulletin = "TRIMESTRIEL" if trimestre_id else "ANNUEL"

    rapproches: List[dict] = analyse["rapproches"]
    if not rapproches:
        raise ImportImpossible(
            "Aucun élève du fichier n'a pu être rapproché de cette classe — rien n'a été enregistré."
        )

    # Statistiques par matière, comme le calcul à partir des notes : le
    # bulletin affiche « ta moyenne / la moyenne de la classe », et sans ces
    # chiffres la colonne resterait vide alors que l'information est là.
    valeurs_par_matiere: Dict[int, List[float]] = {}
    for r in rapproches:
        for matiere_id, val in r["notes"].items():
            valeurs_par_matiere.setdefault(matiere_id, []).append(val)
    stats_matieres = {
        mid: {
            "moyenne": round(sum(v) / len(v), 2) if v else None,
            "min": min(v) if v else None,
            "max": max(v) if v else None,
        }
        for mid, v in valeurs_par_matiere.items()
    }

    donnees = [
        {"inscription_id": r["inscription_id"], "moyenne_generale": r["moyenne_generale"]}
        for r in rapproches
    ]
    portee = appliquer_rangs(
        db, classe, donnees,
        trimestre_id=trimestre_id, type_bulletin=type_bulletin,
        etablissement_id=etablissement_id,
    )
    rangs = {d["inscription_id"]: d["rang"] for d in donnees}
    effectif_rang = portee["effectif_reference"]

    par_inscription = {r["inscription_id"]: r for r in rapproches}
    crees = 0
    mis_a_jour = 0

    for inscription_id, r in par_inscription.items():
        moyenne = r["moyenne_generale"]
        mention = get_mention(moyenne, db, cycle_key, etablissement_id) if moyenne is not None else None

        requete = db.query(Bulletin).filter(Bulletin.inscription_id == inscription_id)
        if trimestre_id:
            requete = requete.filter(Bulletin.trimestre_id == trimestre_id)
        else:
            requete = requete.filter(
                Bulletin.trimestre_id.is_(None), Bulletin.type_bulletin == "ANNUEL"
            )
        existant = requete.first()

        if existant:
            existant.moyenne_generale = moyenne
            existant.rang = rangs.get(inscription_id)
            existant.effectif_classe = effectif_rang
            existant.mention = mention
            existant.statut = "CALCULE"
            existant.type_bulletin = type_bulletin
            bulletin = existant
            db.query(BulletinLigne).filter(
                BulletinLigne.bulletin_id == existant.bulletin_id
            ).delete()
            mis_a_jour += 1
        else:
            bulletin = Bulletin(
                inscription_id=inscription_id,
                trimestre_id=trimestre_id,
                type_bulletin=type_bulletin,
                moyenne_generale=moyenne,
                rang=rangs.get(inscription_id),
                effectif_classe=effectif_rang,
                mention=mention,
                statut="CALCULE",
            )
            db.add(bulletin)
            db.flush()
            crees += 1

        coefs = {c["matiere_id"]: c["coefficient"] for c in analyse["colonnes_matieres"]}
        for matiere_id, val in r["notes"].items():
            stats = stats_matieres.get(matiere_id, {})
            db.add(BulletinLigne(
                bulletin_id=bulletin.bulletin_id,
                matiere_id=matiere_id,
                moyenne_matiere=val,
                moyenne_classe=stats.get("moyenne"),
                note_min=stats.get("min"),
                note_max=stats.get("max"),
                coefficient=coefs.get(matiere_id, 1),
                appreciation=get_appreciation(val),
            ))

    db.commit()

    # En classement « niveau », les classes déjà calculées portent encore leur
    # ancien rang : on réécrit le classement de tout le niveau d'un coup.
    if portee["rang_mode"] == RANG_NIVEAU:
        effectif_niveau = repercuter_rangs_niveau(
            db, classe, trimestre_id=trimestre_id, type_bulletin=type_bulletin,
        )
        if effectif_niveau:
            effectif_rang = effectif_niveau

    return {
        "classe": classe.libelle,
        "classe_id": classe.classe_id,
        "type_bulletin": type_bulletin,
        "trimestre_id": trimestre_id,
        "format_retenu": analyse["format_retenu"],
        "bulletins_crees": crees,
        "bulletins_mis_a_jour": mis_a_jour,
        "effectif_classement": effectif_rang,
        "rang_mode": portee["rang_mode"],
        "non_rapproches": analyse["non_rapproches"],
        "eleves_sans_resultat": analyse["eleves_sans_resultat"],
        "erreurs": analyse["erreurs"],
        "classement": sorted(
            [
                {
                    "rang": rangs.get(r["inscription_id"]),
                    "matricule": r["eleve"]["matricule"],
                    "nom_complet": r["eleve"]["nom_complet"],
                    "moyenne_generale": r["moyenne_generale"],
                    "mention": get_mention(r["moyenne_generale"], db, cycle_key, etablissement_id)
                    if r["moyenne_generale"] is not None else None,
                }
                for r in rapproches
            ],
            key=lambda x: x["rang"] or 9999,
        ),
    }
