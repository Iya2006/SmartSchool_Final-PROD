"""
SCÉNARIO — une année scolaire complète à TrillionX.

POURQUOI CE SCRIPT EXISTE
-------------------------
Une école de démonstration à 45 élèves ne prouve rien. Les défauts qui comptent
— une requête qui relit toute une table, un écran qui charge tout en mémoire,
un total faux dès qu'il y a deux classes du même niveau — ne se voient qu'à
partir d'un volume réaliste, et sur une année entière.

Ce script déroule donc une vraie année : 1 000 élèves de la 1ʳᵉ année à la
Terminale, leurs parents, les enseignants qu'il faut pour les encadrer, les
tarifs, les épreuves avec leurs sujets, la paie mois par mois, les échanges
entre familles et enseignants, puis la clôture.

REJOUABLE, PAR ÉTAPES
---------------------
Chaque étape est idempotente : relancer ne duplique rien, elle reprend ce qui
manque. On peut donc corriger une étape et la rejouer sans repartir de zéro.

    python backend/scripts/scenario_trillionx.py --etape 1
    python backend/scripts/scenario_trillionx.py --tout
    python backend/scripts/scenario_trillionx.py --etat

CE QU'IL NE FAIT PAS
--------------------
Il n'écrit rien en dur qui contredirait le code applicatif : les montants
passent par les mêmes règles, les moyennes par le même moteur de notation, la
paie par `app/services/paie.py`. Un scénario qui calculerait ses propres
chiffres ne testerait que lui-même.

L'ANNÉE SCOLAIRE
----------------
Octobre → juin, deux semestres. Chaque semestre : deux évaluations et une
composition. Puis une composition de fin d'année en juin, qui pèse sur le
résultat annuel. Les classes d'examen (6ᵉ année, 10ᵉ année, Terminale) ne se
décident pas là-dessus : c'est le résultat de l'examen national qui tranche.
"""
import os
import random
import sys
import unicodedata
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.academique import (  # noqa: E402
    Affectation, AnneeScolaire, Classe, ClasseMatiere, Cycle, Enseignant,
    Etablissement, Matiere, Niveau, Trimestre, TypeEvaluation, TypeFrais,
)

# L'école de référence : c'est SA grille de matières qu'on reproduit, pour que
# les deux écoles soient comparables. On ne réinvente pas un référentiel.
ECOLE_MODELE = 1
ECOLE_CIBLE_CODE = "TrillionX"

# L'année va d'octobre à juin — pas de septembre à juillet. C'est le calendrier
# réel des écoles guinéennes, et c'est ce que le fondateur a demandé.
ANNEE_DEBUT = date(2025, 10, 1)
ANNEE_FIN = date(2026, 6, 30)
SEMESTRES = [
    ("S1", "1er Semestre", 1, date(2025, 10, 1), date(2026, 1, 31)),
    ("S2", "2ème Semestre", 2, date(2026, 2, 1), date(2026, 6, 30)),
]

# Effectifs visés, niveau par niveau. La pyramide se resserre vers le haut :
# c'est la forme réelle d'une école guinéenne, où beaucoup d'élèves quittent
# avant le lycée. Un millier d'élèves répartis également sur 19 niveaux ne
# ressemblerait à aucune école existante.
EFFECTIFS = {
    "1A": 105, "2A": 100, "3A": 95, "4A": 90, "5A": 85, "6A": 80,
    "7A": 70, "8A": 65, "9A": 60, "10A": 55,
    "11SE": 25, "11SM": 25, "11SS": 20,
    "12SE": 22, "12SM": 22, "12SS": 18,
    "TSE": 22, "TSM": 22, "TSS": 19,
}
# Deux nombres distincts, qu'il ne faut pas confondre :
#
# TAILLE_CIBLE_CLASSE — combien d'élèves l'école MET dans une classe. C'est ce
#   qui décide du nombre de classes à ouvrir. À 45, la 4ᵉ année tombait sur
#   deux classes de 45 pile : aucune place libre, et un instituteur seul face à
#   45 enfants dont il assure toutes les matières. À 40, le primaire tient
#   entre 30 et 35 partout.
#
# CAPACITE_SALLE — combien la salle peut PHYSIQUEMENT contenir. C'est le
#   plafond que le système oppose à une inscription. Le fixer à la taille cible
#   revient à refuser tout élève qui arrive en cours d'année ; à 100, l'école
#   garde de la marge sans pour autant remplir ses classes jusque-là.
TAILLE_CIBLE_CLASSE = 40
CAPACITE_SALLE = 100

random.seed(20251001)  # rejouable à l'identique


# ── outils ──────────────────────────────────────────────────────────────
def _sans_accent(texte: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texte or "")
        if unicodedata.category(c) != "Mn"
    )


def _ecole(db: Session) -> Etablissement:
    e = db.query(Etablissement).filter(Etablissement.nom == ECOLE_CIBLE_CODE).first()
    if not e:
        raise SystemExit(f"Etablissement « {ECOLE_CIBLE_CODE} » introuvable.")
    return e


def _titre(n: int, texte: str) -> None:
    print(f"\n{'═' * 74}\nETAPE {n} — {texte}\n{'═' * 74}")


# ── étape 1 : le référentiel, copié de l'école modèle ───────────────────
def etape_1_referentiel(db: Session) -> None:
    """Cycles, niveaux, matières, année et semestres.

    Les matières sont copiées de l'école modèle plutôt que ressaisies : deux
    écoles qui n'ont pas les mêmes intitulés ne se comparent pas, et le
    fondateur a demandé exactement les mêmes.
    """
    _titre(1, "Referentiel : cycles, niveaux, matieres, annee, semestres")
    etab = _ecole(db)
    eid = etab.etablissement_id

    # -- cycles --
    cycles_modele = db.query(Cycle).filter(Cycle.etablissement_id == ECOLE_MODELE).order_by(Cycle.ordre).all()
    corr_cycle = {}
    for cm in cycles_modele:
        cible = db.query(Cycle).filter(
            Cycle.etablissement_id == eid, Cycle.code == cm.code
        ).first()
        if not cible:
            cible = Cycle(etablissement_id=eid, code=cm.code, libelle=cm.libelle, ordre=cm.ordre)
            db.add(cible)
            db.flush()
        corr_cycle[cm.cycle_id] = cible.cycle_id
    print(f"  cycles      : {len(corr_cycle)}")

    # -- niveaux --
    niveaux_modele = (
        db.query(Niveau).filter(Niveau.cycle_id.in_(list(corr_cycle.keys())))
        .order_by(Niveau.ordre).all()
    )
    corr_niveau = {}
    for nm in niveaux_modele:
        cycle_cible = corr_cycle[nm.cycle_id]
        cible = db.query(Niveau).filter(
            Niveau.cycle_id == cycle_cible, Niveau.code == nm.code
        ).first()
        if not cible:
            cible = Niveau(
                cycle_id=cycle_cible, code=nm.code, libelle=nm.libelle,
                ordre=nm.ordre, est_examen=nm.est_examen,
                examen_national=nm.examen_national,
            )
            db.add(cible)
            db.flush()
        corr_niveau[nm.niveau_id] = cible.niveau_id
    examens = [n.code for n in niveaux_modele if n.est_examen == "O"]
    print(f"  niveaux     : {len(corr_niveau)}  (classes d'examen : {', '.join(examens)})")

    # -- matières --
    matieres_modele = (
        db.query(Matiere).filter(Matiere.cycle_id.in_(list(corr_cycle.keys())))
        .order_by(Matiere.matiere_id).all()
    )
    corr_matiere = {}
    for mm in matieres_modele:
        cycle_cible = corr_cycle[mm.cycle_id]
        cible = db.query(Matiere).filter(
            Matiere.cycle_id == cycle_cible, Matiere.code == mm.code
        ).first()
        if not cible:
            cible = Matiere(
                cycle_id=cycle_cible, code=mm.code, libelle=mm.libelle,
                coefficient_defaut=mm.coefficient_defaut, categorie=mm.categorie,
                est_obligatoire=mm.est_obligatoire, note_sur=mm.note_sur,
                nb_heures_semaine=mm.nb_heures_semaine,
            )
            db.add(cible)
            db.flush()
        corr_matiere[mm.matiere_id] = cible.matiere_id
    print(f"  matieres    : {len(corr_matiere)}")

    # -- année scolaire : octobre → juin --
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()
    if not annee:
        annee = AnneeScolaire(
            etablissement_id=eid, code="2025-2026", libelle="Annee Scolaire 2025-2026",
            date_debut=ANNEE_DEBUT, date_fin=ANNEE_FIN, statut="EN_COURS", est_courante="O",
        )
        db.add(annee)
        db.flush()
    else:
        annee.date_debut, annee.date_fin = ANNEE_DEBUT, ANNEE_FIN
    print(f"  annee       : {annee.libelle} ({annee.date_debut} -> {annee.date_fin})")

    # -- semestres : deux périodes, pas trois --
    for code, libelle, numero, debut, fin in SEMESTRES:
        t = db.query(Trimestre).filter(
            Trimestre.annee_id == annee.annee_id, Trimestre.numero == numero
        ).first()
        if not t:
            t = Trimestre(
                annee_id=annee.annee_id, code=code, libelle=libelle, numero=numero,
                date_debut=debut, date_fin=fin, statut="EN_COURS",
            )
            db.add(t)
        else:
            t.code, t.libelle = code, libelle
            t.date_debut, t.date_fin = debut, fin
        db.flush()
    # Une periode surnumeraire heritee d'un parametrage a trois trimestres
    # fausserait les moyennes annuelles : elle compterait comme une periode
    # vide. On la retire plutot que de la laisser trainer.
    surnumeraires = db.query(Trimestre).filter(
        Trimestre.annee_id == annee.annee_id, Trimestre.numero > len(SEMESTRES)
    ).all()
    for t in surnumeraires:
        db.delete(t)
    print(f"  semestres   : {len(SEMESTRES)}" + (f" ({len(surnumeraires)} periode(s) en trop retiree(s))" if surnumeraires else ""))

    # -- types d'évaluation : déjà amorcés par la migration, on vérifie --
    types_eval = db.query(TypeEvaluation).filter(TypeEvaluation.etablissement_id == eid).all()
    print(f"  types eval  : {len(types_eval)} ({', '.join(t.code for t in types_eval)})")

    db.commit()
    return {"annee": annee, "corr_cycle": corr_cycle,
            "corr_niveau": corr_niveau, "corr_matiere": corr_matiere}


# ── étape 2 : les classes ───────────────────────────────────────────────
def _repartir(effectif: int, taille_max: int) -> list:
    """Combien de classes, et de quelle taille, pour cet effectif ?

    Réparti à parts égales plutôt qu'en remplissant les premières classes à ras
    bord : une 1ʳᵉ année A à 45 et une 1ʳᵉ année C à 15 n'existe dans aucune
    école, et fausserait toutes les moyennes de classe.
    """
    nb = max(1, -(-effectif // taille_max))  # division entière par excès
    base, reste = divmod(effectif, nb)
    return [base + (1 if i < reste else 0) for i in range(nb)]


def etape_2_classes(db: Session) -> None:
    """Une classe par groupe d'élèves, avec sa grille de matières."""
    _titre(2, "Classes et grille horaire")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    niveaux = (
        db.query(Niveau, Cycle)
        .join(Cycle, Cycle.cycle_id == Niveau.cycle_id)
        .filter(Cycle.etablissement_id == eid)
        .order_by(Cycle.ordre, Niveau.ordre)
        .all()
    )
    lettres = "ABCDEFGH"
    creees = existantes = 0
    total_places = 0

    for niveau, cycle in niveaux:
        effectif = EFFECTIFS.get(niveau.code)
        if not effectif:
            continue
        tailles = _repartir(effectif, TAILLE_CIBLE_CLASSE)

        # La grille de matières du niveau se lit sur l'école modèle : c'est le
        # même programme, on ne le réinvente pas classe par classe.
        modele_classe = (
            db.query(Classe)
            .join(Niveau, Niveau.niveau_id == Classe.niveau_id)
            .filter(Classe.etablissement_id == ECOLE_MODELE, Niveau.code == niveau.code)
            .first()
        )
        grille = []
        if modele_classe:
            grille = (
                db.query(ClasseMatiere, Matiere)
                .join(Matiere, Matiere.matiere_id == ClasseMatiere.matiere_id)
                .filter(ClasseMatiere.classe_id == modele_classe.classe_id)
                .all()
            )

        # La lettre ne sert qu'a distinguer plusieurs classes d'un meme niveau.
        # Une « Terminale SE A » unique se lit comme s'il existait une B ailleurs :
        # quand le niveau n'a qu'une classe, elle porte simplement son nom.
        for i, taille in enumerate(tailles):
            suffixe = f"-{lettres[i]}" if len(tailles) > 1 else ""
            code = f"{niveau.code}{suffixe}"
            libelle = f"{niveau.libelle} {lettres[i]}" if len(tailles) > 1 else niveau.libelle
            classe = db.query(Classe).filter(
                Classe.etablissement_id == eid, Classe.annee_id == annee.annee_id,
                Classe.code == code,
            ).first()
            if not classe:
                classe = Classe(
                    etablissement_id=eid, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=code,
                    libelle=libelle,
                    capacite_max=CAPACITE_SALLE, effectif_actuel=0, statut="ACTIVE",
                )
                db.add(classe)
                db.flush()
                creees += 1
            else:
                classe.capacite_max = CAPACITE_SALLE
                existantes += 1
            total_places += taille

            for cm_modele, mat_modele in grille:
                mat_cible = db.query(Matiere).filter(
                    Matiere.cycle_id == cycle.cycle_id, Matiere.code == mat_modele.code
                ).first()
                if not mat_cible:
                    continue
                deja = db.query(ClasseMatiere).filter(
                    ClasseMatiere.classe_id == classe.classe_id,
                    ClasseMatiere.matiere_id == mat_cible.matiere_id,
                ).first()
                if not deja:
                    db.add(ClasseMatiere(
                        classe_id=classe.classe_id, matiere_id=mat_cible.matiere_id,
                        coefficient=cm_modele.coefficient,
                        nb_heures_semaine=cm_modele.nb_heures_semaine,
                        note_sur=cm_modele.note_sur, est_active="O",
                    ))
        db.flush()

    # Le coefficient d'une matière est le même en 11ᵉ, 12ᵉ et Terminale : on
    # réaligne sur la grille de l'école modèle, qui est plate.
    ajustes = _aligner_coefficients_lycee(db, eid, annee.annee_id)
    db.commit()
    if ajustes:
        print(f"  coefficients du lycee realignes sur {ajustes} ligne(s) de grille")

    # Récapitulatif : c'est ce tableau qui dimensionne les enseignants.
    print(f"  classes creees : {creees} | deja presentes : {existantes}")
    print(f"  places prevues : {total_places}\n")
    for cycle_code, cycle_libelle in (("PRM", "Primaire"), ("CLG", "College"), ("LYC", "Lycee")):
        # `count(cl.classe_id)` comptait 33 classes de 1ère Année là où il y en
        # a 3 : la jointure sur les matières produit une ligne PAR MATIÈRE, et
        # 3 classes × 11 matières font 33. Le DISTINCT est indispensable dès
        # qu'on agrège au-dessus d'une jointure « un vers plusieurs ».
        lignes = db.execute(text("""
            SELECT n.libelle, count(DISTINCT cl.classe_id) AS nb,
                   COALESCE(sum(cl.capacite_max), 0) AS places,
                   count(DISTINCT cm.matiere_id) AS matieres,
                   COALESCE(sum(cm.nb_heures_semaine), 0) AS heures
            FROM ss_classes cl
            JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
            JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
            LEFT JOIN ss_classe_matieres cm ON cm.classe_id = cl.classe_id
            WHERE cl.etablissement_id = :eid AND cy.code = :cy
            GROUP BY n.libelle, n.ordre ORDER BY n.ordre
        """), {"eid": eid, "cy": cycle_code}).fetchall()
        if not lignes:
            continue
        total_h = sum(float(l[4] or 0) for l in lignes)
        total_c = sum(l[1] for l in lignes)
        print(f"  {cycle_libelle} — {total_c} classe(s), {total_h:.0f} h/semaine a couvrir")
        for libelle, nb, places, matieres, heures in lignes:
            print(f"     {libelle:<18} {nb} classe(s)  {matieres:>2} matieres  "
                  f"{float(heures or 0):>5.0f} h/sem")
        print()


# ── étape 3 : les enseignants, dimensionnés sur les heures réelles ──────
#
# DEUX MÉTIERS DIFFÉRENTS
# Au primaire, un instituteur tient UNE classe et y assure TOUTES les matières.
# Le dimensionnement est donc direct : autant d'instituteurs que de classes. Sa
# paie est mensuelle et fixe — c'est la règle de l'école, et le système la
# déduit tout seul dès qu'une affectation de primaire existe.
#
# Au collège et au lycée, on raisonne en HEURES DE MATIÈRE. Un professeur de
# mathématiques couvre les maths de plusieurs classes, et prend une seconde
# matière voisine s'il lui reste du service. C'est ce que font les écoles
# réelles, et c'est ce qui évite d'embaucher quelqu'un à 2 h par semaine pour
# l'informatique d'une seule classe.

SERVICE_HEBDO_MAX = 20  # heures de cours par semaine et par professeur

# Quelles matières un même professeur peut raisonnablement enseigner. Sans
# cette contrainte, l'algorithme donnerait l'EPS au professeur de philosophie
# parce qu'il lui restait deux heures de service.
AFFINITES = [
    {"Mathématiques", "Physique", "Sciences physiques", "Chimie",
     "Informatique / TIC", "Technologie", "Économie"},
    {"Sciences de la vie et de la Terre (SVT)", "Sciences de la vie et de la Terre",
     "Chimie", "Sciences d'observation / Sciences"},
    {"Histoire", "Géographie", "Éducation civique", "Droit / Éducation civique",
     "Éducation civique et morale"},
    {"Français", "Philosophie", "Lecture", "Écriture / Graphisme"},
    {"Anglais"},
    {"Éducation physique et sportive"},
    {"Éducation artistique / Arts", "Éducation artistique"},
]

PRENOMS_H = ["Mamadou", "Ibrahima", "Alpha", "Sekou", "Ousmane", "Amadou", "Moussa",
             "Lansana", "Thierno", "Abdoulaye", "Souleymane", "Kabinet", "Facinet",
             "Elhadj", "Boubacar", "Sidiki", "Mohamed", "Aboubacar", "Karamo", "Naby"]
PRENOMS_F = ["Aissatou", "Fatoumata", "Mariama", "Kadiatou", "Hawa", "Djenabou",
             "Mabinty", "Aminata", "Bountouraby", "Saran", "Nene", "Fanta", "Adama",
             "Salematou", "Oumou", "Kadija", "Binta", "Ramatoulaye", "Djelika", "Sona"]
NOMS = ["Diallo", "Barry", "Bah", "Sow", "Camara", "Toure", "Conde", "Keita", "Sylla",
        "Cisse", "Kourouma", "Traore", "Soumah", "Bangoura", "Sangare", "Doumbouya",
        "Balde", "Kante", "Fofana", "Beavogui", "Haba", "Loua", "Kolie", "Millimouno"]


def _famille(libelle: str) -> set:
    """Le groupe de matières auquel celle-ci appartient."""
    for groupe in AFFINITES:
        if libelle in groupe:
            return groupe
    return {libelle}


def _nom_unique(pris: set) -> tuple:
    """Un nom qui n'est pas déjà porté dans cette école."""
    for _ in range(500):
        sexe = random.choice("MF")
        prenom = random.choice(PRENOMS_H if sexe == "M" else PRENOMS_F)
        nom = random.choice(NOMS)
        if (prenom, nom) not in pris:
            pris.add((prenom, nom))
            return prenom, nom, sexe
    n = len(pris)
    pris.add((f"Prof{n}", "Diallo"))
    return f"Prof{n}", "Diallo", "M"


def _creer_enseignant(db: Session, eid: int, prenom, nom, sexe, specialite, pris_tel):
    from app.core.matricules import PREFIXE_ENSEIGNANT, generer_matricule
    from app.core.security import hash_password

    matricule = generer_matricule(db, Enseignant, PREFIXE_ENSEIGNANT, eid)
    # Le téléphone sert d'identifiant de connexion : il doit être unique dans
    # l'école (la même personne peut enseigner ailleurs avec le même numéro).
    while True:
        tel = f"62{random.randint(1000000, 9999999)}"
        if tel not in pris_tel:
            pris_tel.add(tel)
            break
    ens = Enseignant(
        etablissement_id=eid, matricule=matricule, nom=nom.upper(), prenom=prenom,
        sexe=sexe, telephone=tel,
        email=(f"{_sans_accent(prenom).lower()}.{_sans_accent(nom).lower()}"
               f".{matricule[-4:]}@trillionx.gn"),
        specialite=specialite, diplome_plus_eleve="Licence", type_contrat="PERMANENT",
        date_embauche=ANNEE_DEBUT, statut="ACTIF",
        mot_de_passe=hash_password("motdepasse123"),
    )
    db.add(ens)
    db.flush()
    return ens


def etape_3_enseignants(db: Session) -> None:
    """Combien d'enseignants faut-il, et qui enseigne quoi."""
    _titre(3, "Enseignants : dimensionnement et affectations")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    deja = db.query(Enseignant).filter(Enseignant.etablissement_id == eid).count()
    if deja:
        print(f"  {deja} enseignant(s) deja en place — etape deja jouee.")
        _recap_enseignants(db, eid, annee)
        return

    pris_noms = set()
    pris_tel = {e.telephone for e in db.query(Enseignant).all() if e.telephone}

    # Tous les postes à couvrir : (classe, matière, heures).
    postes = db.execute(text("""
        SELECT cy.code AS cycle, cl.classe_id, cl.libelle AS classe,
               m.matiere_id, m.libelle AS matiere,
               COALESCE(cm.nb_heures_semaine, 0) AS heures
        FROM ss_classe_matieres cm
        JOIN ss_classes cl ON cl.classe_id = cm.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        JOIN ss_matieres m ON m.matiere_id = cm.matiere_id
        WHERE cl.etablissement_id = :eid AND cl.annee_id = :aid AND cm.est_active = 'O'
        ORDER BY cy.ordre, n.ordre, cl.code, m.libelle
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()

    affectations = []  # (enseignant, classe_id, matiere_id, heures)

    # ── PRIMAIRE : un instituteur par classe, toutes les matières ──
    classes_prm = sorted({(p.classe_id, p.classe) for p in postes if p.cycle == "PRM"},
                         key=lambda x: x[1])
    for classe_id, _libelle in classes_prm:
        prenom, nom, sexe = _nom_unique(pris_noms)
        ens = _creer_enseignant(db, eid, prenom, nom, sexe, "Instituteur", pris_tel)
        # Salaire mensuel fixe : la règle de l'école au primaire. Le MODE, lui,
        # se déduit des affectations — on ne le saisit jamais à la main.
        ens.salaire_base = 2_200_000
        for p in postes:
            if p.classe_id == classe_id:
                affectations.append((ens, p.classe_id, p.matiere_id, float(p.heures)))
    print(f"  primaire   : {len(classes_prm)} instituteur(s), un par classe, "
          f"toutes matieres")

    # ── COLLÈGE ET LYCÉE : professeurs de matière ──
    postes_sec = [p for p in postes if p.cycle in ("CLG", "LYC")]
    total_h = sum(float(p.heures) for p in postes_sec)

    # Traitées de la plus grosse matière à la plus petite : les grosses fixent
    # les professeurs, les petites se glissent dans les services restants
    # plutôt que de créer un professeur à 2 h par semaine.
    par_matiere = {}
    for p in postes_sec:
        par_matiere.setdefault(p.matiere, []).append(p)
    ordre = sorted(par_matiere, key=lambda m: -sum(float(p.heures) for p in par_matiere[m]))

    profs = []
    for matiere in ordre:
        for p in par_matiere[matiere]:
            h = float(p.heures)
            candidat = next(
                (pr for pr in profs
                 if pr["heures"] + h <= SERVICE_HEBDO_MAX
                 and (matiere in pr["matieres"] or matiere in pr["famille"])),
                None,
            )
            if candidat is None:
                prenom, nom, sexe = _nom_unique(pris_noms)
                ens = _creer_enseignant(db, eid, prenom, nom, sexe, matiere, pris_tel)
                # Payé à l'heure : là encore le mode se déduit des affectations.
                ens.taux_horaire = random.choice([18_000, 20_000, 22_000, 25_000])
                candidat = {"ens": ens, "famille": _famille(matiere),
                            "heures": 0.0, "matieres": set()}
                profs.append(candidat)
            candidat["heures"] += h
            candidat["matieres"].add(matiere)
            affectations.append((candidat["ens"], p.classe_id, p.matiere_id, h))

    db.flush()

    for ens, classe_id, matiere_id, heures in affectations:
        db.add(Affectation(
            enseignant_id=ens.enseignant_id, matiere_id=matiere_id, classe_id=classe_id,
            annee_id=annee.annee_id, nb_heures_semaine=heures,
            est_principal="O", statut="ACTIVE",
        ))
    db.flush()

    # Le mode de rémunération se DÉDUIT des affectations : mensuel dès qu'une
    # classe de primaire apparaît, horaire au-delà. On appelle la fonction de
    # l'application, jamais une règle recopiée ici — sinon le scénario testerait
    # sa propre copie plutôt que le produit.
    from app.services.paie import synchroniser_mode_remuneration
    for ens in db.query(Enseignant).filter(Enseignant.etablissement_id == eid).all():
        synchroniser_mode_remuneration(db, ens.enseignant_id)

    db.commit()

    polyvalents = [p for p in profs if len(p["matieres"]) > 1]
    print(f"  secondaire : {len(profs)} professeur(s) pour {total_h:.0f} h/semaine "
          f"(service max {SERVICE_HEBDO_MAX} h)")
    print(f"               dont {len(polyvalents)} sur plusieurs matieres")
    _recap_enseignants(db, eid, annee)


def _recap_enseignants(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT e.mode_remuneration,
               count(DISTINCT e.enseignant_id) AS nb,
               COALESCE(sum(a.nb_heures_semaine), 0) AS heures,
               count(DISTINCT a.classe_id) AS classes,
               count(DISTINCT a.matiere_id) AS matieres
        FROM ss_enseignants e
        LEFT JOIN ss_affectations a
               ON a.enseignant_id = e.enseignant_id AND a.annee_id = :aid
        WHERE e.etablissement_id = :eid
        GROUP BY e.mode_remuneration ORDER BY e.mode_remuneration
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print()
    for mode, nb, heures, classes, matieres in lignes:
        libelle = ("au mois (primaire)" if mode == "MENSUEL"
                   else "a l'heure (college/lycee)")
        print(f"  {libelle:<28} {nb:>3} enseignant(s)  {float(heures):>5.0f} h/sem  "
              f"{classes:>2} classes  {matieres:>2} matieres")

    multi = db.execute(text("""
        SELECT e.prenom || ' ' || e.nom AS nom,
               count(DISTINCT a.matiere_id) AS nb_mat,
               count(DISTINCT a.classe_id) AS nb_cl,
               sum(a.nb_heures_semaine) AS h,
               string_agg(DISTINCT m.libelle, ', ') AS matieres
        FROM ss_enseignants e
        JOIN ss_affectations a ON a.enseignant_id = e.enseignant_id AND a.annee_id = :aid
        JOIN ss_matieres m ON m.matiere_id = a.matiere_id
        WHERE e.etablissement_id = :eid AND e.mode_remuneration = 'HORAIRE'
        GROUP BY e.enseignant_id, e.prenom, e.nom
        HAVING count(DISTINCT a.matiere_id) > 1
        ORDER BY count(DISTINCT a.matiere_id) DESC, sum(a.nb_heures_semaine) DESC
        LIMIT 8
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    if multi:
        print("\n  Enseignants sur plusieurs matieres — exemples :")
        for nom, nb_mat, nb_cl, h, matieres in multi:
            print(f"     {nom:<24} {nb_mat} matieres / {nb_cl} classes / "
                  f"{float(h):>4.0f} h — {matieres[:54]}")


# ── le coefficient d'une matière ne dépend PAS de l'année ───────────────
#
# J'avais fait monter les coefficients vers l'année d'examen (maths 5 → 6 → 7
# en SM). C'était une erreur : dans le système guinéen, une matière garde le
# MÊME coefficient en 11ᵉ, en 12ᵉ et en Terminale. Les maths pèsent pareil les
# trois années.
#
# Ce qui change bien d'une classe à l'autre, en revanche, c'est L'ENSEIGNANT :
# le professeur de maths de la 11ᵉ SM n'est pas forcément celui de la Terminale
# SM. C'est déjà le cas — une affectation lie un enseignant à UNE classe et UNE
# matière, donc trois classes de la même série peuvent avoir trois professeurs
# différents pour la même matière.
def _aligner_coefficients_lycee(db: Session, eid: int, annee_id: int) -> int:
    """Remet le coefficient de chaque matiere identique sur les trois annees.

    La reference est la grille de l'ecole modele, qui est plate — c'est elle
    qui a raison. Sans effet sur une base saine.
    """
    reference = {
        code: coef for code, coef in db.execute(text("""
            SELECT m.code, max(cm.coefficient)
            FROM ss_classe_matieres cm
            JOIN ss_classes cl ON cl.classe_id = cm.classe_id
            JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
            JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
            JOIN ss_matieres m ON m.matiere_id = cm.matiere_id
            WHERE cl.etablissement_id = :modele AND cy.code = 'LYC'
            GROUP BY m.code
        """), {"modele": ECOLE_MODELE}).fetchall()
    }

    lignes = db.execute(text("""
        SELECT cm.classe_matiere_id, m.code, cm.coefficient
        FROM ss_classe_matieres cm
        JOIN ss_classes cl ON cl.classe_id = cm.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        JOIN ss_matieres m ON m.matiere_id = cm.matiere_id
        WHERE cl.etablissement_id = :eid AND cl.annee_id = :aid AND cy.code = 'LYC'
    """), {"eid": eid, "aid": annee_id}).fetchall()

    corrigees = 0
    for cm_id, code, coef in lignes:
        attendu = reference.get(code)
        if attendu is None or float(coef or 0) == float(attendu):
            continue
        db.execute(text(
            "UPDATE ss_classe_matieres SET coefficient = :c WHERE classe_matiere_id = :i"
        ), {"c": attendu, "i": cm_id})
        corrigees += 1
    return corrigees


# ── étape 4 : les 1 000 élèves et leurs parents ─────────────────────────
#
# L'âge suit le niveau : on entre en 1ʳᵉ année vers 7 ans, et on gagne un an par
# niveau. Des dates de naissance tirées au hasard donneraient des Terminales de
# 8 ans, et le premier écran qui affiche un âge le montrerait.
ANNEE_NAISSANCE = {
    "1A": 2018, "2A": 2017, "3A": 2016, "4A": 2015, "5A": 2014, "6A": 2013,
    "7A": 2012, "8A": 2011, "9A": 2010, "10A": 2009,
    "11SE": 2008, "11SM": 2008, "11SS": 2008,
    "12SE": 2007, "12SM": 2007, "12SS": 2007,
    "TSE": 2006, "TSM": 2006, "TSS": 2006,
}

# Une partie des élèves a un frère ou une sœur dans l'école. Ce n'est pas un
# détail cosmétique : la réduction fratrie du module comptabilité ne se
# déclenche que là, et sans fratrie elle ne serait jamais testée.
PART_FRATRIE = 0.18
PART_DEUX_PARENTS = 0.65

PROFESSIONS = ["Commerçant", "Enseignant", "Infirmier", "Chauffeur", "Couturière",
               "Fonctionnaire", "Agriculteur", "Mécanicien", "Coiffeuse", "Maçon",
               "Comptable", "Vendeuse", "Tailleur", "Menuisier", "Restauratrice"]
QUARTIERS = ["Kaloum", "Dixinn", "Matam", "Ratoma", "Matoto", "Coyah", "Dubréka",
             "Kipé", "Nongo", "Lambanyi", "Sonfonia", "Hamdallaye", "Bambeto"]


def _telephone(pris: set) -> str:
    while True:
        tel = f"6{random.randint(10000000, 69999999)}"
        if tel not in pris:
            pris.add(tel)
            return tel


def etape_4_eleves(db: Session) -> None:
    """Les élèves, leurs inscriptions, et un à deux parents chacun."""
    _titre(4, "Eleves, inscriptions et parents")
    from app.core.matricules import PREFIXE_ELEVE, generer_matricule
    from app.core.security import hash_password
    from app.models.academique import Eleve, EleveParent, Inscription, Parent

    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    deja = db.query(Eleve).filter(Eleve.etablissement_id == eid).count()
    if deja:
        print(f"  {deja} eleve(s) deja inscrit(s) — etape deja jouee.")
        _recap_eleves(db, eid, annee)
        return

    # Les identifiants de connexion sont uniques PAR ÉCOLE : on ne se réserve
    # que ceux de cette école, un parent d'ailleurs peut porter le même numéro.
    tel_pris = {p.telephone_1 for p in db.query(Parent).filter(
        Parent.etablissement_id == eid).all() if p.telephone_1}

    # Combien d'élèves dans chaque classe — la même répartition qu'à l'étape 2.
    classes = (
        db.query(Classe, Niveau)
        .join(Niveau, Niveau.niveau_id == Classe.niveau_id)
        .filter(Classe.etablissement_id == eid, Classe.annee_id == annee.annee_id)
        .order_by(Classe.code)
        .all()
    )
    par_niveau = {}
    for classe, niveau in classes:
        par_niveau.setdefault(niveau.code, []).append(classe)

    mdp_eleve = hash_password("smartschool")
    mdp_parent = hash_password("motdepasse123")

    familles = []   # parents déjà créés, réutilisables pour une fratrie
    nb_eleves = nb_parents = nb_liens = nb_fratries = 0

    for code_niveau, classes_du_niveau in par_niveau.items():
        effectif = EFFECTIFS.get(code_niveau)
        if not effectif:
            continue
        tailles = _repartir(effectif, TAILLE_CIBLE_CLASSE)
        naissance_an = ANNEE_NAISSANCE.get(code_niveau, 2010)

        for classe, taille in zip(sorted(classes_du_niveau, key=lambda c: c.code), tailles):
            for _ in range(taille):
                sexe = random.choice("MF")
                prenom = random.choice(PRENOMS_H if sexe == "M" else PRENOMS_F)
                nom = random.choice(NOMS)

                eleve = Eleve(
                    etablissement_id=eid,
                    matricule=generer_matricule(db, Eleve, PREFIXE_ELEVE, eid),
                    nom=nom.upper(), prenom=prenom, sexe=sexe,
                    date_naissance=date(naissance_an, random.randint(1, 12),
                                        random.randint(1, 28)),
                    lieu_naissance=random.choice(QUARTIERS),
                    nationalite="Guinéenne",
                    quartier=random.choice(QUARTIERS), ville="Conakry",
                    statut="ACTIF", mot_de_passe=mdp_eleve,
                )
                db.add(eleve)
                db.flush()
                nb_eleves += 1

                db.add(Inscription(
                    eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
                    annee_id=annee.annee_id, date_inscription=ANNEE_DEBUT,
                    type_inscription="NOUVELLE", statut="ACTIVE",
                ))

                # Un frère ou une sœur déjà inscrit : on rattache aux mêmes
                # parents plutôt que d'en inventer de nouveaux.
                if familles and random.random() < PART_FRATRIE:
                    parents = random.choice(familles)
                    nb_fratries += 1
                else:
                    parents = []
                    nb_p = 2 if random.random() < PART_DEUX_PARENTS else 1
                    for rang in range(nb_p):
                        p_sexe = "M" if rang == 0 else "F"
                        p_prenom = random.choice(PRENOMS_H if p_sexe == "M" else PRENOMS_F)
                        parent = Parent(
                            etablissement_id=eid, nom=nom.upper(), prenom=p_prenom,
                            sexe=p_sexe, telephone_1=_telephone(tel_pris),
                            profession=random.choice(PROFESSIONS),
                            quartier=random.choice(QUARTIERS),
                            adresse=f"{random.choice(QUARTIERS)}, Conakry",
                            statut="ACTIF", mot_de_passe=mdp_parent,
                        )
                        db.add(parent)
                        db.flush()
                        parents.append(parent)
                        nb_parents += 1
                    familles.append(parents)

                for rang, parent in enumerate(parents):
                    db.add(EleveParent(
                        eleve_id=eleve.eleve_id, parent_id=parent.parent_id,
                        lien_parente="PERE" if parent.sexe == "M" else "MERE",
                        # Un seul contact principal et un seul responsable
                        # financier : deux « principaux » et le système ne
                        # saurait plus à qui envoyer la facture.
                        est_contact_principal="O" if rang == 0 else "N",
                        est_responsable_financier="O" if rang == 0 else "N",
                    ))
                    nb_liens += 1

            classe.effectif_actuel = taille
            db.flush()

    db.commit()
    print(f"  eleves     : {nb_eleves}")
    print(f"  parents    : {nb_parents} ({nb_fratries} eleve(s) rattache(s) a une "
          f"fratrie existante)")
    print(f"  liens      : {nb_liens}")
    _recap_eleves(db, eid, annee)


def _recap_eleves(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT cy.libelle AS cycle,
               count(DISTINCT i.eleve_id) AS eleves,
               count(DISTINCT cl.classe_id) AS classes,
               round(avg(EXTRACT(YEAR FROM age(e.date_naissance)))::numeric, 1) AS age
        FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        JOIN ss_eleves e ON e.eleve_id = i.eleve_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid AND i.statut = 'ACTIVE'
        GROUP BY cy.libelle, cy.ordre ORDER BY cy.ordre
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print()
    total = 0
    for cycle, eleves, nb_classes, age in lignes:
        total += eleves
        print(f"  {cycle:<12} {eleves:>4} eleves  {nb_classes:>2} classes  "
              f"age moyen {float(age or 0):.1f} ans")
    print(f"  {'TOTAL':<12} {total:>4} eleves")

    fratries = db.execute(text("""
        SELECT count(*) FROM (
            SELECT ep.parent_id FROM ss_eleve_parent ep
            JOIN ss_eleves e ON e.eleve_id = ep.eleve_id
            WHERE e.etablissement_id = :eid
            GROUP BY ep.parent_id HAVING count(DISTINCT ep.eleve_id) > 1
        ) f
    """), {"eid": eid}).scalar()
    sans_parent = db.execute(text("""
        SELECT count(*) FROM ss_eleves e
        WHERE e.etablissement_id = :eid
          AND NOT EXISTS (SELECT 1 FROM ss_eleve_parent ep WHERE ep.eleve_id = e.eleve_id)
    """), {"eid": eid}).scalar()
    repartition = db.execute(text("""
        SELECT nb, count(*) FROM (
            SELECT e.eleve_id, count(ep.parent_id) AS nb
            FROM ss_eleves e
            LEFT JOIN ss_eleve_parent ep ON ep.eleve_id = e.eleve_id
            WHERE e.etablissement_id = :eid GROUP BY e.eleve_id
        ) x GROUP BY nb ORDER BY nb
    """), {"eid": eid}).fetchall()
    print(f"\n  parents ayant plusieurs enfants : {fratries}")
    for nb, combien in repartition:
        print(f"  eleves avec {nb} parent(s) : {combien}")
    if sans_parent:
        print(f"  [!] {sans_parent} eleve(s) SANS parent — a corriger")


# ── étape 5 : l'emploi du temps de toutes les classes ───────────────────
#
# Les jours et les créneaux sont ceux que l'application affiche
# (`app/api/emploi_du_temps.py`). En inventer d'autres — un samedi, une 8ᵉ heure
# — produirait des cours que personne ne verrait à l'écran : un emploi du temps
# invisible est pire qu'un emploi du temps absent.
JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]
CRENEAUX = [
    ("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00"),
    ("14:00", "15:00"), ("15:00", "16:00"), ("16:00", "17:00"),
]
# Deux heures d'une même matière dans la même journée, pas plus : au-delà, on
# fabrique des journées de quatre heures de maths d'affilée.
MAX_PAR_JOUR = 2


def etape_5_emploi_du_temps(db: Session) -> None:
    """Une grille hebdomadaire par classe, valable toute l'année.

    Un emploi du temps scolaire se répète chaque semaine : on écrit donc une
    grille, pas 36 semaines de créneaux. C'est aussi ce que le modèle attend —
    `CreneauEmploi` porte un jour et une heure, pas une date.

    LA CONTRAINTE QUI COMPTE
    Un enseignant ne peut pas être dans deux classes au même moment. Au
    primaire c'est sans objet — l'instituteur n'a qu'une classe. Au collège et
    au lycée, un professeur couvre jusqu'à douze classes : c'est là que les
    conflits apparaissent, et c'est ce que cette étape vérifie réellement.
    """
    from app.models.academique import CreneauEmploi

    _titre(5, "Emploi du temps hebdomadaire, toutes classes")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    deja = db.query(CreneauEmploi).filter(
        CreneauEmploi.annee_id == annee.annee_id
    ).join(Classe, Classe.classe_id == CreneauEmploi.classe_id).filter(
        Classe.etablissement_id == eid
    ).count()
    if deja:
        print(f"  {deja} creneau(x) deja en place — etape deja jouee.")
        _recap_emploi(db, eid, annee)
        return

    # Ce qu'il y a à placer : chaque affectation apporte ses heures.
    lignes = db.execute(text("""
        SELECT a.classe_id, cl.code AS classe_code, cl.libelle AS classe,
               a.matiere_id, m.libelle AS matiere,
               a.enseignant_id, a.nb_heures_semaine AS heures, cy.code AS cycle
        FROM ss_affectations a
        JOIN ss_classes cl ON cl.classe_id = a.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        JOIN ss_matieres m ON m.matiere_id = a.matiere_id
        WHERE cl.etablissement_id = :eid AND a.annee_id = :aid AND a.statut = 'ACTIVE'
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()

    restant, infos_classe = {}, {}
    for l in lignes:
        restant.setdefault(l.classe_id, {})[(l.matiere_id, l.enseignant_id)] = int(l.heures or 0)
        infos_classe[l.classe_id] = (l.classe_code, l.classe, l.cycle)

    occupation = {}   # (jour, heure) -> enseignants déjà en cours
    par_jour = {}     # (classe, jour, matiere) -> nombre d'heures posées
    creneaux = []

    # Créneau par créneau plutôt que classe par classe : remplir une classe
    # entière d'abord accaparerait les professeurs les plus demandés et
    # laisserait les dernières classes sans personne de libre.
    for jour in JOURS:
        for debut, fin in CRENEAUX:
            occupes = occupation.setdefault((jour, debut), set())
            # Les classes les plus chargées passent en premier : ce sont elles
            # qui ont le moins de marge pour caser leurs heures.
            for classe_id in sorted(restant, key=lambda c: -sum(restant[c].values())):
                besoins = restant[classe_id]
                candidats = [
                    (mat, ens) for (mat, ens), h in besoins.items()
                    if h > 0 and ens not in occupes
                    and par_jour.get((classe_id, jour, mat), 0) < MAX_PAR_JOUR
                ]
                if not candidats:
                    continue
                # La matière à qui il reste le plus d'heures : les grosses
                # passent tant qu'il y a de la place, les petites se logent
                # dans les trous restants.
                mat, ens = max(candidats, key=lambda k: besoins[k])
                besoins[(mat, ens)] -= 1
                occupes.add(ens)
                par_jour[(classe_id, jour, mat)] = par_jour.get((classe_id, jour, mat), 0) + 1
                creneaux.append(CreneauEmploi(
                    classe_id=classe_id, matiere_id=mat, enseignant_id=ens,
                    jour=jour, heure_debut=debut, heure_fin=fin,
                    # La classe garde sa salle et les professeurs se déplacent :
                    # c'est l'organisation réelle des écoles guinéennes.
                    salle=infos_classe[classe_id][0],
                    annee_id=annee.annee_id, statut="ACTIVE",
                ))

    # PASSE DE RATTRAPAGE
    # Le remplissage créneau par créneau laisse quelques heures orphelines :
    # au moment où on passait devant un créneau, le professeur concerné était
    # occupé ailleurs, et la classe a pris une autre matière. Plus tard le
    # professeur se libère, mais la classe n'a plus de trou à cet endroit.
    # On reprend donc les heures non placées et on cherche, cette fois pour
    # elles seules, un créneau où LA CLASSE et LE PROFESSEUR sont libres tous
    # les deux.
    grille = {(c.classe_id, c.jour, c.heure_debut): c for c in creneaux}
    tous_creneaux = [(j, d, f) for j in JOURS for d, f in CRENEAUX]

    def _libre_classe(classe_id, jour, debut):
        return (classe_id, jour, debut) not in grille

    def _libre_prof(ens, jour, debut):
        return ens not in occupation.setdefault((jour, debut), set())

    def _poser(classe_id, mat, ens, jour, debut, fin):
        c = CreneauEmploi(
            classe_id=classe_id, matiere_id=mat, enseignant_id=ens,
            jour=jour, heure_debut=debut, heure_fin=fin,
            salle=infos_classe[classe_id][0],
            annee_id=annee.annee_id, statut="ACTIVE",
        )
        grille[(classe_id, jour, debut)] = c
        occupation[(jour, debut)].add(ens)
        par_jour[(classe_id, jour, mat)] = par_jour.get((classe_id, jour, mat), 0) + 1
        return c

    def _retirer(c):
        del grille[(c.classe_id, c.jour, c.heure_debut)]
        occupation[(c.jour, c.heure_debut)].discard(c.enseignant_id)
        cle = (c.classe_id, c.jour, c.matiere_id)
        par_jour[cle] = max(0, par_jour.get(cle, 0) - 1)

    rattrapees = echanges = 0
    for classe_id, besoins in restant.items():
        for (mat, ens) in list(besoins):
            while besoins[(mat, ens)] > 0:
                pose = False

                # 1) Un créneau où la classe ET le professeur sont libres.
                for jour, debut, fin in tous_creneaux:
                    if (_libre_classe(classe_id, jour, debut)
                            and _libre_prof(ens, jour, debut)
                            and par_jour.get((classe_id, jour, mat), 0) < MAX_PAR_JOUR):
                        _poser(classe_id, mat, ens, jour, debut, fin)
                        besoins[(mat, ens)] -= 1
                        rattrapees += 1
                        pose = True
                        break
                if pose:
                    continue

                # 2) Sinon un ÉCHANGE. Le professeur est occupé à chacun des
                # trous de la classe : on déplace donc un autre cours de cette
                # classe vers un trou, pour libérer sa place. C'est ce que fait
                # un directeur à la main quand une case ne tombe pas.
                for jour_a, debut_a, fin_a in tous_creneaux:
                    if not _libre_prof(ens, jour_a, debut_a):
                        continue
                    voisin = grille.get((classe_id, jour_a, debut_a))
                    if voisin is None:
                        continue
                    for jour_b, debut_b, fin_b in tous_creneaux:
                        if not _libre_classe(classe_id, jour_b, debut_b):
                            continue
                        if not _libre_prof(voisin.enseignant_id, jour_b, debut_b):
                            continue
                        _retirer(voisin)
                        if par_jour.get((classe_id, jour_a, mat), 0) >= MAX_PAR_JOUR:
                            # Le déplacement ne servirait à rien : on remet.
                            _poser(classe_id, voisin.matiere_id, voisin.enseignant_id,
                                   voisin.jour, voisin.heure_debut, voisin.heure_fin)
                            continue
                        voisin.jour, voisin.heure_debut, voisin.heure_fin = (
                            jour_b, debut_b, fin_b)
                        _poser(classe_id, voisin.matiere_id, voisin.enseignant_id,
                               jour_b, debut_b, fin_b)
                        grille[(classe_id, jour_b, debut_b)] = voisin
                        creneaux.append(_poser(classe_id, mat, ens, jour_a, debut_a, fin_a))
                        besoins[(mat, ens)] -= 1
                        echanges += 1
                        pose = True
                        break
                    if pose:
                        break
                if not pose:
                    break

    for c in grille.values():
        db.add(c)
    db.commit()
    if rattrapees or echanges:
        print(f"  rattrapage : {rattrapees} heure(s) replacee(s), "
              f"{echanges} par echange avec un autre cours")

    non_places = {
        infos_classe[c][1]: sum(h for h in besoins.values() if h > 0)
        for c, besoins in restant.items() if any(h > 0 for h in besoins.values())
    }
    print(f"  creneaux poses : {len(grille)} sur {len(JOURS) * len(CRENEAUX)} "
          f"places hebdomadaires par classe")
    if non_places:
        total = sum(non_places.values())
        print(f"\n  [!] {total} heure(s) n'ont pas trouve de place, sur "
              f"{len(non_places)} classe(s) :")
        for classe, manque in sorted(non_places.items(), key=lambda x: -x[1])[:10]:
            print(f"      {classe:<22} {manque} h non placee(s)")
        print("      La semaine compte 35 creneaux ; une classe qui demande")
        print("      35 heures ne tolere aucun conflit d'enseignant.")
    _recap_emploi(db, eid, annee)


def _recap_emploi(db: Session, eid: int, annee) -> None:
    conflits = db.execute(text("""
        SELECT count(*) FROM (
            SELECT ce.enseignant_id, ce.jour, ce.heure_debut
            FROM ss_creneaux_emploi ce
            JOIN ss_classes cl ON cl.classe_id = ce.classe_id
            WHERE cl.etablissement_id = :eid AND ce.annee_id = :aid
              AND ce.statut = 'ACTIVE' AND ce.enseignant_id IS NOT NULL
            GROUP BY ce.enseignant_id, ce.jour, ce.heure_debut
            HAVING count(*) > 1
        ) c
    """), {"eid": eid, "aid": annee.annee_id}).scalar()

    lignes = db.execute(text("""
        SELECT cy.libelle AS cycle, count(*) AS creneaux,
               count(DISTINCT ce.classe_id) AS classes,
               round(count(*)::numeric / NULLIF(count(DISTINCT ce.classe_id), 0), 1) AS moy
        FROM ss_creneaux_emploi ce
        JOIN ss_classes cl ON cl.classe_id = ce.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        WHERE cl.etablissement_id = :eid AND ce.annee_id = :aid AND ce.statut = 'ACTIVE'
        GROUP BY cy.libelle, cy.ordre ORDER BY cy.ordre
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print()
    for cycle, nb, classes, moy in lignes:
        print(f"  {cycle:<12} {nb:>4} creneaux  {classes:>2} classes  "
              f"{float(moy or 0):>4.1f} h/semaine par classe")

    marque = "[OK]" if conflits == 0 else "[!!]"
    print(f"\n  {marque} enseignants en double au meme creneau : {conflits}")

    charge = db.execute(text("""
        SELECT e.prenom || ' ' || e.nom AS nom, count(*) AS h,
               count(DISTINCT ce.classe_id) AS classes
        FROM ss_creneaux_emploi ce
        JOIN ss_enseignants e ON e.enseignant_id = ce.enseignant_id
        JOIN ss_classes cl ON cl.classe_id = ce.classe_id
        WHERE cl.etablissement_id = :eid AND ce.annee_id = :aid AND ce.statut = 'ACTIVE'
        GROUP BY e.enseignant_id, e.prenom, e.nom
        ORDER BY count(*) DESC LIMIT 5
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    if charge:
        print("\n  Les cinq emplois du temps les plus charges :")
        for nom, h, classes in charge:
            print(f"     {nom:<24} {h:>2} h/semaine sur {classes} classe(s)")


# ── étape 6 : le prix de l'année, classe par classe ────────────────────
#
# LE MODÈLE, EN UNE PHRASE
# On fixe le tarif d'une CLASSE ; tout élève inscrit dans cette classe a ce
# prix. Personne ne saisit un montant élève par élève. À la réinscription,
# l'élève change de classe et paie automatiquement le tarif de sa nouvelle
# classe — c'est le code de l'application qui le fait, pas ce script.
#
# Le prix monte avec le niveau : une Terminale coûte plus cher qu'une 1ʳᵉ année,
# parce qu'elle mobilise des professeurs spécialisés sur moins d'élèves.
SCOLARITE_PAR_NIVEAU = {
    "1A": 1_200_000, "2A": 1_200_000, "3A": 1_300_000,
    "4A": 1_400_000, "5A": 1_400_000, "6A": 1_500_000,
    "7A": 1_800_000, "8A": 1_800_000, "9A": 1_900_000, "10A": 2_100_000,
    "11SE": 2_400_000, "11SM": 2_400_000, "11SS": 2_300_000,
    "12SE": 2_600_000, "12SM": 2_600_000, "12SS": 2_500_000,
    "TSE": 3_000_000, "TSM": 3_000_000, "TSS": 2_900_000,
}
FRAIS_INSCRIPTION = {"PRM": 150_000, "CLG": 200_000, "LYC": 250_000}

# Trois tranches : à la rentrée, à la reprise de janvier, puis au printemps.
# C'est l'échéancier réel des familles guinéennes, qui règlent rarement une
# année entière d'un coup.
TRANCHES_SCOLARITE = [
    ("1ère tranche — rentrée", date(2025, 10, 31), 0.40),
    ("2ème tranche — janvier", date(2026, 1, 31), 0.30),
    ("3ème tranche — avril", date(2026, 4, 30), 0.30),
]


def etape_6_tarifs_et_factures(db: Session) -> None:
    """Types de frais, tarif de chaque classe, puis la facture de chaque élève."""
    from app.core.numerotation import generer_numero_facture
    from app.models.academique import EcheanceFacture, Facture, Inscription, TarifClasse

    _titre(6, "Tarifs par classe et facturation des 1 000 eleves")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    # ── ce que l'école fait payer ──
    definitions = [
        ("SCOL", "Frais de scolarité", "Scolarité", "ANNUEL", "O"),
        ("INSC", "Frais d'inscription", "Scolarité", "UNIQUE", "O"),
        # Facultative : elle ne doit JAMAIS se facturer d'office, sinon chaque
        # famille reçoit une facture de cantine qu'elle n'a pas demandée.
        ("CANT", "Cantine", "Restauration", "MENSUEL", "N"),
    ]
    types = {}
    for code, libelle, categorie, frequence, obligatoire in definitions:
        tf = db.query(TypeFrais).filter(
            TypeFrais.etablissement_id == eid, TypeFrais.code == code
        ).first()
        if not tf:
            tf = TypeFrais(
                etablissement_id=eid, code=code, libelle=libelle, categorie=categorie,
                frequence=frequence, montant_defaut=0, est_obligatoire=obligatoire,
                statut="ACTIF",
            )
            db.add(tf)
            db.flush()
        types[code] = tf
    print(f"  types de frais : {', '.join(t.libelle for t in types.values())}")

    # ── le tarif de chaque classe ──
    classes = db.execute(text("""
        SELECT cl.classe_id, cl.libelle, n.code AS niveau, cy.code AS cycle
        FROM ss_classes cl
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        WHERE cl.etablissement_id = :eid AND cl.annee_id = :aid
        ORDER BY cy.ordre, n.ordre, cl.code
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()

    poses = 0
    for c in classes:
        for code, montant in (
            ("SCOL", SCOLARITE_PAR_NIVEAU.get(c.niveau, 0)),
            ("INSC", FRAIS_INSCRIPTION.get(c.cycle, 0)),
        ):
            if not montant:
                continue
            tarif = db.query(TarifClasse).filter(
                TarifClasse.classe_id == c.classe_id,
                TarifClasse.type_frais_id == types[code].type_frais_id,
            ).first()
            if tarif:
                tarif.montant = montant
            else:
                db.add(TarifClasse(
                    classe_id=c.classe_id, type_frais_id=types[code].type_frais_id,
                    montant=montant,
                ))
                poses += 1
    db.commit()
    print(f"  tarifs poses   : {poses} (scolarite + inscription pour {len(classes)} classes)")

    # ── la facture de chaque élève ──
    deja = db.execute(text("""
        SELECT count(*) FROM ss_factures f
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND f.annee_id = :aid
    """), {"eid": eid, "aid": annee.annee_id}).scalar()
    if deja:
        print(f"  {deja} facture(s) deja emise(s) — facturation deja jouee.")
        _recap_facturation(db, eid, annee)
        return

    inscriptions = db.query(Inscription).join(
        Classe, Classe.classe_id == Inscription.classe_id
    ).filter(
        Classe.etablissement_id == eid, Inscription.annee_id == annee.annee_id,
        Inscription.statut == "ACTIVE",
    ).all()

    tarifs_par_classe = {}
    for t in db.query(TarifClasse).filter(
        TarifClasse.classe_id.in_([c.classe_id for c in classes])
    ).all():
        tarifs_par_classe.setdefault(t.classe_id, {})[t.type_frais_id] = float(t.montant)

    nb_factures = nb_echeances = 0
    for insc in inscriptions:
        for code in ("SCOL", "INSC"):
            tf = types[code]
            montant = tarifs_par_classe.get(insc.classe_id, {}).get(tf.type_frais_id, 0)
            if not montant:
                continue
            facture = Facture(
                inscription_id=insc.inscription_id, annee_id=annee.annee_id,
                type_frais_id=tf.type_frais_id,
                numero_facture=generer_numero_facture(db, eid, annee.annee_id),
                montant_total=montant, montant_remise=0, montant_net=montant,
                montant_paye=0, montant_restant=montant,
                date_facture=ANNEE_DEBUT, statut="EN_ATTENTE",
            )
            db.add(facture)
            db.flush()
            nb_factures += 1

            if code == "SCOL":
                # La somme des tranches doit tomber EXACTEMENT sur le montant :
                # trois fois un arrondi, et il manque un franc que personne ne
                # saura jamais réclamer. La dernière tranche prend le reste.
                pose = 0
                for rang, (libelle, limite, part) in enumerate(TRANCHES_SCOLARITE):
                    if rang == len(TRANCHES_SCOLARITE) - 1:
                        part_montant = montant - pose
                    else:
                        part_montant = round(montant * part)
                        pose += part_montant
                    db.add(EcheanceFacture(
                        facture_id=facture.facture_id, libelle=libelle,
                        date_limite=limite, montant_attendu=part_montant,
                        montant_paye=0, statut="EN_ATTENTE",
                    ))
                    nb_echeances += 1
            else:
                db.add(EcheanceFacture(
                    facture_id=facture.facture_id, libelle="À l'inscription",
                    date_limite=date(2025, 10, 15), montant_attendu=montant,
                    montant_paye=0, statut="EN_ATTENTE",
                ))
                nb_echeances += 1
        if nb_factures % 400 == 0:
            db.flush()

    db.commit()
    print(f"  factures       : {nb_factures}")
    print(f"  echeances      : {nb_echeances}")
    _recap_facturation(db, eid, annee)


def _recap_facturation(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT cy.libelle AS cycle, tf.libelle AS frais,
               count(*) AS nb, sum(f.montant_net) AS total,
               min(f.montant_net) AS mini, max(f.montant_net) AS maxi
        FROM ss_factures f
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles cy ON cy.cycle_id = n.cycle_id
        LEFT JOIN ss_types_frais tf ON tf.type_frais_id = f.type_frais_id
        WHERE cl.etablissement_id = :eid AND f.annee_id = :aid
        GROUP BY cy.libelle, cy.ordre, tf.libelle ORDER BY cy.ordre, tf.libelle
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print()
    total_general = 0
    for cycle, frais, nb, total, mini, maxi in lignes:
        total_general += float(total or 0)
        fourchette = (f"{float(mini):,.0f}" if mini == maxi
                      else f"{float(mini):,.0f} a {float(maxi):,.0f}")
        print(f"  {cycle:<10} {str(frais)[:22]:<24} {nb:>4} factures  "
              f"{float(total or 0):>15,.0f} GNF   ({fourchette})")
    print(f"  {'':<10} {'TOTAL A FACTURER':<24} {'':>4}            "
          f"{total_general:>15,.0f} GNF")

    orphelines = db.execute(text("""
        SELECT count(*) FROM ss_factures f
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND f.type_frais_id IS NULL
    """), {"eid": eid}).scalar()
    marque = "[OK]" if orphelines == 0 else "[!!]"
    print(f"\n  {marque} factures rattachees a aucun type de frais : {orphelines}")

    # Ce que la scolarité doit couvrir : neuf mois de salaires.
    masse = db.execute(text("""
        SELECT COALESCE(sum(e.salaire_base), 0) FROM ss_enseignants e
        WHERE e.etablissement_id = :eid AND e.mode_remuneration = 'MENSUEL'
    """), {"eid": eid}).scalar()
    heures = db.execute(text("""
        SELECT COALESCE(sum(a.nb_heures_semaine * COALESCE(a.taux_horaire, e.taux_horaire)), 0)
        FROM ss_affectations a
        JOIN ss_enseignants e ON e.enseignant_id = a.enseignant_id
        WHERE e.etablissement_id = :eid AND e.mode_remuneration = 'HORAIRE'
          AND a.statut = 'ACTIVE' AND a.annee_id = :aid
    """), {"eid": eid, "aid": annee.annee_id}).scalar()
    mensuel = float(masse or 0) + float(heures or 0) * 4
    print(f"\n  Masse salariale : {mensuel:>15,.0f} GNF par mois")
    print(f"  Sur 9 mois      : {mensuel * 9:>15,.0f} GNF")
    couverture = (total_general / (mensuel * 9) * 100) if mensuel else 0
    print(f"  Couverture par la scolarite : {couverture:.0f} %")


# ── étape 7 : les encaissements de l'année, et les relances ─────────────
#
# TOUTES LES FAMILLES PAIENT L'INTÉGRALITÉ. Mais pas de la même façon, et pas
# au même rythme : c'est ce qui rend le scénario utile. Une école où tout le
# monde paie à l'heure ne teste ni les relances, ni les impayés, ni le
# recouvrement.
#
#   comptant   — règle toute l'année dès la rentrée
#   ponctuel   — paie chaque tranche dans les jours qui suivent l'échéance
#   retard     — paie chaque tranche avec deux à six semaines de retard
#   difficile  — accumule le retard, reçoit plusieurs relances, solde en juin
#
# Au 30 juin, plus un franc ne reste dû. C'est la consigne, et c'est aussi ce
# qu'une école doit atteindre avant de clôturer son année.
PROFILS_PAIEMENT = [
    ("comptant", 0.15),
    ("ponctuel", 0.45),
    ("retard", 0.28),
    ("difficile", 0.12),
]
MODES_PAIEMENT = ["Espèces", "Espèces", "Espèces", "Orange Money", "Virement"]


def _profil(rang: int) -> str:
    """Le profil d'une famille, réparti selon les proportions ci-dessus."""
    seuil = 0.0
    tirage = random.random()
    for nom, part in PROFILS_PAIEMENT:
        seuil += part
        if tirage <= seuil:
            return nom
    return "ponctuel"


def _jour_de_paiement(profil: str, limite: date, derniere: bool) -> date:
    """Quand cette famille règle-t-elle cette tranche ?"""
    from datetime import timedelta

    if profil == "comptant":
        return date(2025, 10, 10)
    if profil == "ponctuel":
        return limite - timedelta(days=random.randint(0, 8))
    if profil == "retard":
        return limite + timedelta(days=random.randint(12, 45))
    # « difficile » : le retard s'accumule, mais tout est soldé avant la fin
    # de l'année — sinon l'école ne pourrait pas clôturer.
    jour = limite + timedelta(days=random.randint(60, 140))
    plafond = date(2026, 6, 25) if derniere else ANNEE_FIN
    return min(jour, plafond)


def etape_7_encaissements(db: Session) -> None:
    """Les 4 000 échéances réglées, étalées d'octobre à juin."""
    from app.api.finance import create_paiement
    from app.models.academique import EcheanceFacture, Facture, Inscription
    from app.schemas.schemas import PaiementCreate

    _titre(7, "Encaissements de l'annee et relances")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    deja = db.execute(text("""
        SELECT count(*) FROM ss_paiements p
        JOIN ss_factures f ON f.facture_id = p.facture_id
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    if deja:
        print(f"  {deja} paiement(s) deja enregistre(s) — etape deja jouee.")
        _recap_encaissements(db, eid, annee)
        return

    # Un profil PAR FAMILLE, pas par facture : une famille qui paie comptant sa
    # scolarité ne traîne pas sur les frais d'inscription.
    inscriptions = db.execute(text("""
        SELECT i.inscription_id FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid AND i.statut = 'ACTIVE'
        ORDER BY i.inscription_id
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    profils = {r.inscription_id: _profil(i) for i, r in enumerate(inscriptions)}

    echeances = db.execute(text("""
        SELECT e.echeance_id, e.facture_id, e.montant_attendu, e.date_limite,
               e.libelle, f.inscription_id
        FROM ss_echeances_factures e
        JOIN ss_factures f ON f.facture_id = e.facture_id
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND f.annee_id = :aid
        ORDER BY e.date_limite, e.echeance_id
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()

    # On paie dans l'ordre chronologique : c'est ainsi que la trésorerie de
    # l'école se remplit réellement, et c'est ce que les rapports mensuels
    # devront retrouver.
    a_payer = []
    for e in echeances:
        profil = profils.get(e.inscription_id, "ponctuel")
        derniere = "3ème tranche" in (e.libelle or "")
        a_payer.append((
            _jour_de_paiement(profil, e.date_limite, derniere),
            e.echeance_id, e.facture_id, float(e.montant_attendu), profil,
        ))
    a_payer.sort(key=lambda x: x[0])

    verses = 0
    total = 0.0
    for i, (jour, echeance_id, facture_id, montant, profil) in enumerate(a_payer, 1):
        try:
            create_paiement(
                data=PaiementCreate(
                    facture_id=facture_id, echeance_id=echeance_id, montant=montant,
                    mode_paiement=random.choice(MODES_PAIEMENT),
                    date_paiement=jour,
                ),
                db=db, etablissement_id=eid,
            )
            verses += 1
            total += montant
        except Exception as exc:
            print(f"  [!] echeance {echeance_id} : {str(getattr(exc, 'detail', exc))[:90]}")
        if i % 500 == 0:
            print(f"     … {i}/{len(a_payer)} echeances traitees")

    print(f"  paiements enregistres : {verses} pour {total:,.0f} GNF")
    _recap_encaissements(db, eid, annee)


def _recap_encaissements(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT to_char(p.date_paiement, 'YYYY-MM') AS mois,
               count(*) AS nb, sum(p.montant) AS total
        FROM ss_paiements p
        JOIN ss_factures f ON f.facture_id = p.facture_id
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND p.statut = 'VALIDE'
        GROUP BY 1 ORDER BY 1
    """), {"eid": eid}).fetchall()
    print("\n  Tresorerie mois par mois :")
    cumul = 0.0
    for mois, nb, montant in lignes:
        cumul += float(montant or 0)
        print(f"     {mois}   {nb:>5} encaissements   {float(montant or 0):>15,.0f} GNF   "
              f"cumul {cumul:>15,.0f}")

    etat = db.execute(text("""
        SELECT f.statut, count(*), sum(f.montant_net), sum(f.montant_paye),
               sum(f.montant_restant)
        FROM ss_factures f
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND f.annee_id = :aid
        GROUP BY f.statut ORDER BY f.statut
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print("\n  Etat des factures :")
    reste_total = 0.0
    for statut, nb, net, paye, reste in etat:
        reste_total += float(reste or 0)
        print(f"     {statut:<22} {nb:>5} factures   facture {float(net or 0):>15,.0f}   "
              f"regle {float(paye or 0):>15,.0f}   reste {float(reste or 0):>12,.0f}")

    marque = "[OK]" if reste_total == 0 else "[!!]"
    print(f"\n  {marque} reste du au 30 juin : {reste_total:,.0f} GNF")

    # Le contrôle qui compte : la somme des encaissements doit tomber
    # exactement sur ce que les factures disent avoir reçu. Deux chiffres
    # différents, et c'est la comptabilité entière qui devient suspecte.
    controle = db.execute(text("""
        SELECT COALESCE(sum(p.montant), 0) AS encaisse,
               (SELECT COALESCE(sum(f2.montant_paye), 0)
                FROM ss_factures f2
                JOIN ss_inscriptions i2 ON i2.inscription_id = f2.inscription_id
                JOIN ss_classes cl2 ON cl2.classe_id = i2.classe_id
                WHERE cl2.etablissement_id = :eid AND f2.annee_id = :aid) AS sur_factures
        FROM ss_paiements p
        JOIN ss_factures f ON f.facture_id = p.facture_id
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND p.statut = 'VALIDE'
    """), {"eid": eid, "aid": annee.annee_id}).fetchone()
    ecart = float(controle.encaisse) - float(controle.sur_factures)
    marque = "[OK]" if abs(ecart) < 0.01 else "[!!]"
    print(f"  {marque} encaissements {float(controle.encaisse):,.0f} = "
          f"montants payes sur factures {float(controle.sur_factures):,.0f}"
          + ("" if abs(ecart) < 0.01 else f"   ECART {ecart:,.0f}"))


# ── étape 8 : les épreuves de l'année, et leurs sujets ─────────────────
#
# LE RYTHME DEMANDÉ
#   Semestre 1 : deux évaluations, puis une composition
#   Semestre 2 : deux évaluations, puis une composition
#   Juin       : la composition de fin d'année
#
# Chaque épreuve a un SUJET, déposé par l'enseignant qui la donne et validé par
# l'administration avant l'épreuve. Un sujet déposé après l'épreuve n'aurait
# aucun sens, et une épreuve sans sujet validé ne devrait pas se tenir : les
# dates ci-dessous respectent cet ordre.
EPREUVES = [
    # (semestre, code du type, libellé, date de l'épreuve)
    (1, "EVAL",  "1ère évaluation",         date(2025, 11, 14)),
    (1, "EVAL",  "2ème évaluation",         date(2025, 12, 12)),
    (1, "COMPO", "Composition du 1er semestre", date(2026, 1, 23)),
    (2, "EVAL",  "3ème évaluation",         date(2026, 3, 13)),
    (2, "EVAL",  "4ème évaluation",         date(2026, 4, 17)),
    (2, "COMPO", "Composition du 2ème semestre", date(2026, 5, 15)),
    (2, "COMPO", "Composition de fin d'année", date(2026, 6, 12)),
]
# Le sujet se dépose deux semaines avant, se valide une semaine avant. Une
# partie des enseignants dépose en retard : c'est ce qui justifie les relances.
JOURS_AVANT_DEPOT = 14
JOURS_AVANT_VALIDATION = 7
PART_DEPOT_EN_RETARD = 0.22


def etape_8_epreuves_et_sujets(db: Session) -> None:
    """Les 7 épreuves de chaque classe et matière, avec leur sujet validé."""
    from datetime import timedelta

    from app.models.academique import Evaluation, SujetExamen

    _titre(8, "Epreuves de l'annee et depot des sujets")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    deja = db.execute(text("""
        SELECT count(*) FROM ss_evaluations e
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        WHERE cl.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    if deja:
        print(f"  {deja} epreuve(s) deja creee(s) — etape deja jouee.")
        _recap_epreuves(db, eid, annee)
        return

    semestres = {
        t.numero: t for t in db.query(Trimestre).filter(
            Trimestre.annee_id == annee.annee_id
        ).all()
    }
    types = {
        t.code: t for t in db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == eid
        ).all()
    }

    # Qui enseigne quoi, dans quelle classe : c'est l'enseignant de
    # l'affectation qui donne l'épreuve et dépose son sujet. Personne d'autre.
    postes = db.execute(text("""
        SELECT a.classe_id, a.matiere_id, a.enseignant_id, m.libelle AS matiere,
               cl.libelle AS classe, COALESCE(cm.note_sur, 20) AS note_sur
        FROM ss_affectations a
        JOIN ss_classes cl ON cl.classe_id = a.classe_id
        JOIN ss_matieres m ON m.matiere_id = a.matiere_id
        LEFT JOIN ss_classe_matieres cm
               ON cm.classe_id = a.classe_id AND cm.matiere_id = a.matiere_id
        WHERE cl.etablissement_id = :eid AND a.annee_id = :aid AND a.statut = 'ACTIVE'
        ORDER BY cl.code, m.libelle
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()

    nb_epreuves = nb_sujets = nb_retards = 0
    for numero_sem, code_type, libelle, jour in EPREUVES:
        semestre = semestres.get(numero_sem)
        type_eval = types.get(code_type)
        if not semestre or not type_eval:
            continue
        for p in postes:
            evaluation = Evaluation(
                matiere_id=p.matiere_id, classe_id=p.classe_id,
                trimestre_id=semestre.trimestre_id, type_eval_id=type_eval.type_eval_id,
                enseignant_id=p.enseignant_id,
                libelle=f"{libelle} — {p.matiere}",
                date_evaluation=jour, note_sur=float(p.note_sur or 20),
                statut="PUBLIEE", est_coefficientee="O",
            )
            db.add(evaluation)
            nb_epreuves += 1

            # Le sujet, déposé par le même enseignant, validé avant l'épreuve.
            en_retard = random.random() < PART_DEPOT_EN_RETARD
            depot = jour - timedelta(days=random.randint(2, 5) if en_retard
                                     else random.randint(JOURS_AVANT_DEPOT, 21))
            validation = max(depot + timedelta(days=1),
                             jour - timedelta(days=JOURS_AVANT_VALIDATION))
            validation = min(validation, jour - timedelta(days=1))
            db.add(SujetExamen(
                enseignant_id=p.enseignant_id, matiere_id=p.matiere_id,
                classe_id=p.classe_id, trimestre_id=semestre.trimestre_id,
                # `trimestre` est le NUMERO de la periode (entier), pas son code :
                # la colonne porte le meme nom que `trimestre_id` mais pas le meme sens.
                trimestre=semestre.numero,
                titre=f"{libelle} — {p.matiere} — {p.classe}",
                fichier_nom=f"sujet_{_sans_accent(p.matiere).replace(' ', '_').lower()}.pdf",
                # `fichier_path` est NOT NULL : un sujet sans fichier n'est pas
                # un sujet. Le scenario ne depose pas de vrai PDF, mais il
                # respecte la contrainte plutot que de la contourner.
                fichier_path=(
                    f"uploads/sujets/{semestre.code}/"
                    f"{p.classe_id}_{p.matiere_id}_{code_type.lower()}_{numero_sem}.pdf"
                ),
                fichier_type="application/pdf", fichier_taille=random.randint(80_000, 400_000),
                duree_minutes=120 if code_type == "COMPO" else 60,
                # VALIDE : l'administration a relu et accepté. Une épreuve dont
                # le sujet n'est pas validé ne devrait pas se tenir.
                statut="VALIDE", date_depot=depot, date_envoi=validation,
            ))
            nb_sujets += 1
            nb_retards += 1 if en_retard else 0

            if nb_epreuves % 500 == 0:
                db.flush()

    db.commit()
    print(f"  epreuves : {nb_epreuves}")
    print(f"  sujets   : {nb_sujets} deposes et valides, dont {nb_retards} "
          f"deposes en retard (relance necessaire)")
    _recap_epreuves(db, eid, annee)


def _recap_epreuves(db: Session, eid: int, annee) -> None:
    # Regroupe par DATE et par type, pas par libelle : le libelle porte le nom
    # de la matiere, donc grouper dessus affiche une ligne par matiere et donne
    # l'illusion de doublons.
    lignes = db.execute(text("""
        SELECT e.date_evaluation AS jour, t.libelle AS semestre,
               te.libelle AS type, count(*) AS nb,
               count(DISTINCT e.classe_id) AS classes,
               count(DISTINCT e.matiere_id) AS matieres
        FROM ss_evaluations e
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        JOIN ss_trimestres t ON t.trimestre_id = e.trimestre_id
        JOIN ss_types_evaluation te ON te.type_eval_id = e.type_eval_id
        WHERE cl.etablissement_id = :eid AND t.annee_id = :aid
        GROUP BY e.date_evaluation, t.libelle, t.numero, te.libelle
        ORDER BY e.date_evaluation
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print()
    total = 0
    for jour, semestre, type_eval, nb, classes, matieres in lignes:
        total += nb
        print(f"  {jour}  {semestre:<15} {type_eval:<14} {nb:>5} epreuves  "
              f"({classes} classes x {matieres} matieres)")
    print(f"  {'':<12}  {'TOTAL':<15} {'':<14} {total:>5} epreuves")

    sujets = db.execute(text("""
        SELECT s.statut, count(*) FROM ss_sujets_examen s
        JOIN ss_classes cl ON cl.classe_id = s.classe_id
        WHERE cl.etablissement_id = :eid GROUP BY s.statut ORDER BY s.statut
    """), {"eid": eid}).fetchall()
    print("\n  Sujets :", ", ".join(f"{n} {st}" for st, n in sujets))

    sans_sujet = db.execute(text("""
        SELECT count(*) FROM ss_evaluations e
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        WHERE cl.etablissement_id = :eid
          AND NOT EXISTS (
            SELECT 1 FROM ss_sujets_examen s
            WHERE s.classe_id = e.classe_id AND s.matiere_id = e.matiere_id
              AND s.trimestre_id = e.trimestre_id AND s.statut = 'VALIDE')
    """), {"eid": eid}).scalar()
    print(f"  {'[OK]' if sans_sujet == 0 else '[!!]'} epreuves sans aucun sujet "
          f"valide sur leur semestre : {sans_sujet}")

    # CE QU'ON NE PEUT PAS VERIFIER, ET POURQUOI
    # Un sujet n'est rattache a AUCUNE epreuve precise : la table ne porte que
    # (classe, matiere, semestre). Impossible donc de dire « ce sujet-la est
    # bien celui de la composition du 23 janvier ». Ma premiere verification
    # comparait chaque sujet a TOUTES les epreuves du semestre et annoncait
    # 3 438 depots en retard — un faux total, produit par la meme jointure en
    # etoile que le comptage de classes de l'etape 2.
    #
    # Le manque est reel et vaut d'etre note : rien n'empeche aujourd'hui de
    # deposer un seul sujet pour un semestre et de s'en servir aux trois
    # epreuves. Le corriger demande une colonne `evaluation_id` sur
    # ss_sujets_examen — un changement de modele, pas de scenario.
    par_semestre = db.execute(text("""
        SELECT t.libelle, count(*) AS sujets,
               min(s.date_depot) AS premier, max(s.date_depot) AS dernier
        FROM ss_sujets_examen s
        JOIN ss_classes cl ON cl.classe_id = s.classe_id
        JOIN ss_trimestres t ON t.trimestre_id = s.trimestre_id
        WHERE cl.etablissement_id = :eid
        GROUP BY t.libelle, t.numero ORDER BY t.numero
    """), {"eid": eid}).fetchall()
    for libelle, nb, premier, dernier in par_semestre:
        print(f"  {libelle:<15} {nb:>5} sujets deposes du {premier:%d/%m/%Y} "
              f"au {dernier:%d/%m/%Y}")


# ── étape 9 : les heures de cours non assurées ─────────────────────────
#
# UNIQUEMENT AU COLLÈGE ET AU LYCÉE, et c'est logique : là-bas un professeur
# est payé pour les heures qu'il donne. Un instituteur du primaire, lui, est
# payé au mois — son absence se retient à la journée, pas à l'heure, et le
# calcul existant est déjà le bon pour lui.
#
# Une absence est enregistrée pour un JOUR. Ce que ça coûte se lit ensuite dans
# l'emploi du temps : le professeur manque exactement les créneaux qu'il avait
# ce jour-là.
PART_PROFS_ABSENTS = 0.35        # un tiers des professeurs manque au moins un jour
MAX_JOURS_ABSENCE = 4            # sur toute l'année, par professeur concerné
MOTIFS_ABSENCE = [
    "Maladie", "Convocation administrative", "Deuil familial",
    "Empêchement personnel", "Retard de transport",
]


def etape_9_absences_enseignants(db: Session) -> None:
    """Des professeurs du secondaire ratent des heures — et la paie le voit."""
    from app.models.academique import AbsencePersonnel, Employe

    _titre(9, "Heures de cours non assurees (college et lycee)")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    # Les enseignants payés à l'heure : ce sont eux, et eux seuls, que ce
    # scénario concerne.
    profs = db.execute(text("""
        SELECT e.enseignant_id, e.prenom || ' ' || e.nom AS nom, e.taux_horaire
        FROM ss_enseignants e
        WHERE e.etablissement_id = :eid AND e.statut = 'ACTIF'
          AND e.mode_remuneration = 'HORAIRE'
        ORDER BY e.enseignant_id
    """), {"eid": eid}).fetchall()
    if not profs:
        print("  aucun enseignant paye a l'heure — rien a faire.")
        return

    deja = db.execute(text("""
        SELECT count(*) FROM ss_absences_personnel a
        JOIN ss_employes e ON e.employe_id = a.employe_id
        WHERE e.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    if deja:
        print(f"  {deja} absence(s) deja enregistree(s) — etape deja jouee.")
        _recap_absences(db, eid, annee)
        return

    # Les jours de classe de l'année : du lundi au vendredi, hors vacances
    # d'usage. Une absence un dimanche ne coûterait rien et ne prouverait rien.
    from datetime import timedelta

    jours_classe = []
    jour = ANNEE_DEBUT
    while jour <= ANNEE_FIN:
        if jour.weekday() < 5 and not (
            (jour.month == 12 and jour.day >= 20) or (jour.month == 1 and jour.day <= 4)
        ):
            jours_classe.append(jour)
        jour += timedelta(days=1)

    nb_absences = 0
    concernes = 0
    for p in profs:
        if random.random() > PART_PROFS_ABSENTS:
            continue
        concernes += 1
        # La ligne SS_EMPLOYES est le miroir auquel s'accrochent primes,
        # avances et absences : on passe par la fonction de l'application.
        from app.api.finance import _get_or_sync_employe_paie, _identifier_employe

        ref = f"ENS_{p.enseignant_id}"
        infos = _identifier_employe(ref, db, eid)
        employe = _get_or_sync_employe_paie(db, ref, infos, eid)

        for jour_absent in random.sample(jours_classe, random.randint(1, MAX_JOURS_ABSENCE)):
            db.add(AbsencePersonnel(
                employe_id=employe.employe_id, date_absence=jour_absent,
                motif=random.choice(MOTIFS_ABSENCE),
                # Non justifiée : c'est ce qui déclenche la retenue. Une absence
                # justifiée est enregistrée mais ne coûte rien à l'enseignant.
                est_justifie="N" if random.random() < 0.7 else "O",
            ))
            nb_absences += 1
    db.commit()

    print(f"  {concernes} professeur(s) sur {len(profs)} ont manque au moins un jour")
    print(f"  {nb_absences} absence(s) enregistree(s)")
    _recap_absences(db, eid, annee)


def _recap_absences(db: Session, eid: int, annee) -> None:
    from app.services import paie as _paie

    lignes = db.execute(text("""
        SELECT e.enseignant_id, e.prenom || ' ' || e.nom AS nom,
               count(*) FILTER (WHERE a.est_justifie = 'N') AS non_justifiees,
               count(*) FILTER (WHERE a.est_justifie = 'O') AS justifiees,
               array_agg(a.date_absence ORDER BY a.date_absence)
                 FILTER (WHERE a.est_justifie = 'N') AS jours
        FROM ss_absences_personnel a
        JOIN ss_employes emp ON emp.employe_id = a.employe_id
        JOIN ss_enseignants e ON 'ENS_' || e.enseignant_id = emp.source_ref
        WHERE emp.etablissement_id = :eid AND e.mode_remuneration = 'HORAIRE'
        GROUP BY e.enseignant_id, e.prenom, e.nom
        ORDER BY count(*) DESC LIMIT 8
    """), {"eid": eid}).fetchall()
    if not lignes:
        return

    print("\n  Ce que ces absences coutent reellement — heures de l'emploi du temps :")
    print(f"     {'ENSEIGNANT':<26}{'ABSENCES':>9}{'HEURES':>8}{'RETENUE':>16}")
    total = 0.0
    for _eid_ens, nom, non_just, just, jours in lignes:
        manque = _paie.heures_manquees(db, _eid_ens, list(jours or []), annee.annee_id)
        total += manque["montant"]
        print(f"     {nom[:25]:<26}{non_just:>9}{manque['heures']:>8.1f}"
              f"{manque['montant']:>16,.0f}")
    print(f"\n  Le taux journalier (salaire / 26) aurait retenu la meme somme pour")
    print(f"  un jour a deux heures de cours et un jour a six. Ici chaque heure")
    print(f"  manquee est retenue a SON tarif, celui de sa classe.")


ETAPES = {
    1: ("Referentiel (cycles, niveaux, matieres, annee, semestres)", etape_1_referentiel),
    2: ("Classes et grille horaire", etape_2_classes),
    3: ("Enseignants : dimensionnement et affectations", etape_3_enseignants),
    4: ("Eleves, inscriptions et parents", etape_4_eleves),
    5: ("Emploi du temps hebdomadaire", etape_5_emploi_du_temps),
    6: ("Tarifs par classe et facturation", etape_6_tarifs_et_factures),
    7: ("Encaissements de l'annee et relances", etape_7_encaissements),
    8: ("Epreuves de l'annee et depot des sujets", etape_8_epreuves_et_sujets),
    9: ("Heures de cours non assurees (college et lycee)", etape_9_absences_enseignants),
}


def etat(db: Session) -> None:
    etab = _ecole(db)
    eid = etab.etablissement_id
    print(f"\nEtat de « {etab.nom} » (etablissement {eid})\n" + "─" * 60)
    for libelle, requete in [
        ("cycles", "SELECT count(*) FROM ss_cycles WHERE etablissement_id=:eid"),
        ("niveaux", "SELECT count(*) FROM ss_niveaux n JOIN ss_cycles c ON c.cycle_id=n.cycle_id WHERE c.etablissement_id=:eid"),
        ("matieres", "SELECT count(*) FROM ss_matieres m JOIN ss_cycles c ON c.cycle_id=m.cycle_id WHERE c.etablissement_id=:eid"),
        ("semestres", "SELECT count(*) FROM ss_trimestres t JOIN ss_annees_scolaires a ON a.annee_id=t.annee_id WHERE a.etablissement_id=:eid"),
        ("classes", "SELECT count(*) FROM ss_classes WHERE etablissement_id=:eid"),
        ("eleves", "SELECT count(*) FROM ss_eleves WHERE etablissement_id=:eid"),
        ("parents", "SELECT count(*) FROM ss_parents WHERE etablissement_id=:eid"),
        ("enseignants", "SELECT count(*) FROM ss_enseignants WHERE etablissement_id=:eid"),
        ("types de frais", "SELECT count(*) FROM ss_types_frais WHERE etablissement_id=:eid"),
    ]:
        n = db.execute(text(requete), {"eid": eid}).scalar()
        print(f"  {libelle:<16} {n}")


def main() -> int:
    db = SessionLocal()
    try:
        if "--etat" in sys.argv:
            etat(db)
            return 0
        if "--tout" in sys.argv:
            for numero in sorted(ETAPES):
                ETAPES[numero][1](db)
            etat(db)
            return 0
        if "--etape" in sys.argv:
            numero = int(sys.argv[sys.argv.index("--etape") + 1])
            if numero not in ETAPES:
                raise SystemExit(f"Etape {numero} inconnue. Disponibles : {sorted(ETAPES)}")
            ETAPES[numero][1](db)
            return 0
        print(__doc__)
        print("Etapes disponibles :")
        for numero, (libelle, _) in sorted(ETAPES.items()):
            print(f"  {numero}. {libelle}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
