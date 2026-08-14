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
    ("ponctuel", 0.43),
    ("retard", 0.26),
    ("difficile", 0.10),
    ("impaye", 0.06),
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
    if profil == "difficile":
        # Le retard s'accumule, mais la famille finit par solder.
        jour = limite + timedelta(days=random.randint(60, 140))
        plafond = date(2026, 6, 25) if derniere else ANNEE_FIN
        return min(jour, plafond)
    # « impaye » : la famille règle le début d'année puis décroche. Ce profil
    # a longtemps manqué, et son absence rendait le scénario faux : 2 000
    # factures soldées au dernier franc, donc aucune relance à envoyer, aucun
    # impayé au tableau du comptable, et toute la partie recouvrement du
    # logiciel jamais éprouvée. Une école ne recouvre pas 100 %.
    jour = limite + timedelta(days=random.randint(20, 60))
    return None if derniere else min(jour, ANNEE_FIN)


def _laisser_des_impayes(db: Session, eid: int, annee) -> None:
    """Rétablit les impayés sur une base où l'étape 7 avait tout encaissé.

    Le profil « impaye » n'existait pas quand cette base a été montée : les
    2 000 factures étaient soldées au dernier franc. Aucune relance à envoyer,
    aucun impayé au tableau du comptable, et toute la partie recouvrement du
    logiciel jamais éprouvée — alors qu'aucune école ne recouvre 100 %.

    On ne bricole pas le solde : on défait le versement de la dernière tranche
    pour ces familles, avec ce qu'il a produit — l'écriture comptable et ses
    deux lignes. Après quoi la base ressemble à ce qu'aurait donné l'étape 7
    jouée depuis le début : cet argent n'est jamais entré.
    """
    restant = db.execute(text("""
        SELECT count(*) FROM ss_factures f
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid
          AND f.montant_total - COALESCE(f.montant_paye, 0) > 0
    """), {"eid": eid}).scalar()
    if restant:
        print(f"  {restant} facture(s) portent deja un reste a payer — rien a rejouer.")
        return

    part = dict(PROFILS_PAIEMENT).get("impaye", 0.0)
    inscriptions = [r.inscription_id for r in db.execute(text("""
        SELECT i.inscription_id FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid AND i.statut = 'ACTIVE'
        ORDER BY i.inscription_id
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()]
    tirage = random.Random(20260814)
    decrocheurs = tirage.sample(inscriptions, int(len(inscriptions) * part))
    if not decrocheurs:
        return

    # La dernière tranche de chaque facture : celle qui tombe le plus tard.
    lignes = db.execute(text("""
        SELECT DISTINCT ON (f.facture_id)
               f.facture_id, e.echeance_id
        FROM ss_factures f
        JOIN ss_echeances_factures e ON e.facture_id = f.facture_id
        WHERE f.inscription_id = ANY(:ids)
        ORDER BY f.facture_id, e.date_limite DESC
    """), {"ids": decrocheurs}).fetchall()

    annules = 0
    montant = 0.0
    for facture_id, echeance_id in lignes:
        recus = db.execute(text("""
            SELECT paiement_id, numero_recu, montant FROM ss_paiements
            WHERE echeance_id = :e AND statut = 'VALIDE'
        """), {"e": echeance_id}).fetchall()
        for paiement_id, numero_recu, mnt in recus:
            db.execute(text("""
                DELETE FROM ss_lignes_ecritures WHERE ecriture_id IN (
                    SELECT ecriture_id FROM ss_ecritures_comptables
                    WHERE etablissement_id = :eid AND reference = :ref)
            """), {"eid": eid, "ref": numero_recu})
            db.execute(text("""
                DELETE FROM ss_ecritures_comptables
                WHERE etablissement_id = :eid AND reference = :ref
            """), {"eid": eid, "ref": numero_recu})
            db.execute(text("DELETE FROM ss_paiements WHERE paiement_id = :p"),
                       {"p": paiement_id})
            annules += 1
            montant += float(mnt)

        db.execute(text("""
            UPDATE ss_echeances_factures
               SET montant_paye = 0, statut = 'EN_ATTENTE'
             WHERE echeance_id = :e
        """), {"e": echeance_id})

    # Les totaux de la facture se recalculent depuis les paiements qui restent,
    # jamais par soustraction : une soustraction sur un solde déjà faux le
    # garde faux.
    db.execute(text("""
        WITH regle AS (
            SELECT f.facture_id,
                   COALESCE(f.montant_net, f.montant_total) AS du,
                   COALESCE((SELECT sum(p.montant) FROM ss_paiements p
                             WHERE p.facture_id = f.facture_id
                               AND p.statut = 'VALIDE'), 0) AS total
            FROM ss_factures f
            WHERE f.facture_id = ANY(:fids)
        )
        UPDATE ss_factures f SET
            montant_paye = r.total,
            montant_restant = r.du - r.total,
            statut = CASE WHEN r.total >= r.du THEN 'PAYEE'
                          WHEN r.total > 0 THEN 'PARTIELLEMENT_PAYEE'
                          ELSE 'EN_ATTENTE' END
        FROM regle r
        WHERE f.facture_id = r.facture_id
    """), {"fids": [f for f, _ in lignes]})
    db.commit()

    print(f"  {len(lignes)} famille(s) laissees avec un impaye : "
          f"{annules} versement(s) annule(s), {montant:,.0f} GNF jamais entres."
          .replace(",", " "))


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
        _laisser_des_impayes(db, eid, annee)
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
    # La dernière tranche est celle qui tombe le plus tard, quel que soit le
    # nombre de tranches de l'école : deux, trois ou dix. La reconnaître au
    # libellé « 3ème tranche » ne marchait que pour une école à trois tranches.
    derniere_par_facture: dict = {}
    for e in echeances:
        courante = derniere_par_facture.get(e.facture_id)
        if courante is None or e.date_limite > courante[1]:
            derniere_par_facture[e.facture_id] = (e.echeance_id, e.date_limite)

    a_payer = []
    for e in echeances:
        profil = profils.get(e.inscription_id, "ponctuel")
        derniere = derniere_par_facture[e.facture_id][0] == e.echeance_id
        jour = _jour_de_paiement(profil, e.date_limite, derniere)
        if jour is None:
            continue  # cette tranche ne sera jamais réglée : c'est un impayé
        a_payer.append((
            jour, e.echeance_id, e.facture_id, float(e.montant_attendu), profil,
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
    """Les 7 épreuves de chaque classe, avec leur sujet validé matière par matière.

    UNE COMPOSITION EST UN ÉVÉNEMENT, PAS ONZE
    Une composition couvre toutes les matières de la classe le même jour.
    L'école en parle comme d'UNE épreuve — « la composition du 1er semestre » —
    et c'est comme ça qu'elle doit apparaître : une ligne, onze matières
    dedans. Créer onze évaluations indépendantes donnait onze lignes
    identiques à la date près, impossibles à distinguer et impossibles à
    saisir d'un seul geste.

    Chaque épreuve est donc une SESSION (`ss_evaluation_sessions`), qui porte
    ses évaluations — exactement ce que fait `POST /api/evaluations/sessions`
    quand l'école la crée à la main.
    """
    from datetime import timedelta

    from app.models.academique import Evaluation, EvaluationSession, SujetExamen

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
        _regrouper_en_sessions(db, eid, annee)
        _deposer_les_fichiers_de_sujets(db, eid)
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

    # Les postes regroupés par classe : une session par classe et par épreuve.
    postes_par_classe = {}
    for p in postes:
        postes_par_classe.setdefault(p.classe_id, []).append(p)

    nb_epreuves = nb_sujets = nb_retards = nb_sessions = 0
    for numero_sem, code_type, libelle, jour in EPREUVES:
        semestre = semestres.get(numero_sem)
        type_eval = types.get(code_type)
        if not semestre or not type_eval:
            continue
        for classe_id, postes_classe in postes_par_classe.items():
            session = EvaluationSession(
                classe_id=classe_id, trimestre_id=semestre.trimestre_id,
                type_eval_id=type_eval.type_eval_id, etablissement_id=eid,
                libelle=libelle, date_evaluation=jour, note_sur=20,
                est_coefficientee="O", statut="PUBLIEE",
            )
            db.add(session)
            db.flush()
            nb_sessions += 1
            for p in postes_classe:
                evaluation = Evaluation(
                    matiere_id=p.matiere_id, classe_id=p.classe_id,
                    trimestre_id=semestre.trimestre_id, type_eval_id=type_eval.type_eval_id,
                    enseignant_id=p.enseignant_id,
                    # Le libellé ne répète PAS la matière : elle est déjà une
                    # colonne, et la répéter empêche l'école de reconnaître
                    # l'épreuve dont tout le monde parle.
                    libelle=libelle,
                    date_evaluation=jour, note_sur=float(p.note_sur or 20),
                    statut="PUBLIEE", est_coefficientee="O",
                    session_id=session.session_id,
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
    print(f"  epreuves : {nb_sessions} (composition ou evaluation, toutes matieres)")
    print(f"  dont     : {nb_epreuves} lignes matiere a noter")
    print(f"  sujets   : {nb_sujets} deposes et valides, dont {nb_retards} "
          f"deposes en retard (relance necessaire)")
    _deposer_les_fichiers_de_sujets(db, eid)
    _recap_epreuves(db, eid, annee)


def _pdf_minimal(titre: str) -> bytes:
    """Un vrai PDF, lisible par un navigateur, en quelques centaines d'octets.

    Le scénario écrivait un `fichier_path` sans jamais déposer de fichier :
    cliquer « Télécharger » sur un sujet répondait « Fichier non trouvé sur le
    serveur ». Une donnée de recette qui n'existe qu'en base ne permet pas de
    tester l'écran qui la consomme.
    """
    texte = titre.replace("(", "[").replace(")", "]")[:90]
    contenu = f"BT /F1 14 Tf 60 760 Td ({texte}) Tj ET".encode("latin-1", "replace")
    objets = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(contenu)).encode() + b" >>\nstream\n" + contenu + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    sortie = bytearray(b"%PDF-1.4\n")
    positions = []
    for numero, corps in enumerate(objets, start=1):
        positions.append(len(sortie))
        sortie += f"{numero} 0 obj\n".encode() + corps + b"\nendobj\n"
    debut_xref = len(sortie)
    sortie += f"xref\n0 {len(objets) + 1}\n".encode()
    sortie += b"0000000000 65535 f \n"
    for pos in positions:
        sortie += f"{pos:010d} 00000 n \n".encode()
    sortie += (f"trailer\n<< /Size {len(objets) + 1} /Root 1 0 R >>\n"
               f"startxref\n{debut_xref}\n%%EOF\n").encode()
    return bytes(sortie)


def _deposer_les_fichiers_de_sujets(db: Session, eid: int) -> None:
    """Écrit sur le disque le PDF de chaque sujet, et corrige les chemins.

    DEUX ERREURS DANS LA PREMIERE VERSION
    1. `fichier_path` portait un chemin imbriqué (« uploads/sujets/S1/... »)
       alors que l'application y attend un simple NOM de fichier, relatif à
       son dossier de dépôt. Le chemin se résolvait donc en
       `uploads/sujets/uploads/sujets/...` — introuvable.
    2. Aucun fichier n'était réellement écrit. Le bouton « Télécharger »
       répondait « Fichier non trouvé sur le serveur ».

    On aligne les deux sur ce que fait le vrai dépôt d'un enseignant
    (`examens.py::deposer_sujet_portail`) : un nom plat, et un fichier
    derrière.
    """
    import os as _os

    from app.api.examens import UPLOAD_DIR

    _os.makedirs(UPLOAD_DIR, exist_ok=True)
    sujets = db.execute(text("""
        SELECT s.sujet_id, s.enseignant_id, s.matiere_id, s.trimestre,
               s.titre, s.fichier_path, s.fichier_nom
        FROM ss_sujets_examen s
        JOIN ss_classes cl ON cl.classe_id = s.classe_id
        WHERE cl.etablissement_id = :eid
        ORDER BY s.sujet_id
    """), {"eid": eid}).fetchall()
    if not sujets:
        return

    ecrits = corriges = 0
    for s in sujets:
        nom_plat = (
            f"sujet_{s.enseignant_id}_{s.matiere_id}_P{s.trimestre}_{s.sujet_id}.pdf"
        )
        chemin = _os.path.join(UPLOAD_DIR, nom_plat)
        if not _os.path.exists(chemin):
            with open(chemin, "wb") as f:
                f.write(_pdf_minimal(s.titre or "Sujet d'examen"))
            ecrits += 1
        if s.fichier_path != nom_plat:
            # Le nom affiché ne doit pas contenir de « / » : « Éducation
            # artistique / Arts » donnait « sujet_education_artistique_/_arts.pdf »,
            # que le navigateur refuse comme nom de téléchargement.
            propre = _sans_accent(s.titre or "sujet").lower()
            propre = "".join(c if c.isalnum() else "_" for c in propre)[:60]
            db.execute(text("""
                UPDATE ss_sujets_examen
                   SET fichier_path = :p, fichier_nom = :n,
                       fichier_taille = :t, fichier_type = 'pdf'
                 WHERE sujet_id = :id
            """), {"p": nom_plat, "n": f"{propre}.pdf",
                   "t": _os.path.getsize(chemin), "id": s.sujet_id})
            corriges += 1
    db.commit()
    if ecrits or corriges:
        print(f"  [FICHIERS] {ecrits} PDF deposes, {corriges} chemin(s) corrige(s) "
              f"dans {UPLOAD_DIR}")


def _regrouper_en_sessions(db: Session, eid: int, annee) -> None:
    """Rattache à une session les évaluations créées isolément.

    Les premières exécutions du scénario créaient une évaluation par matière
    sans session : l'écran affichait alors 2 674 lignes « Composition de fin
    d'année — Histoire », « — Géographie », « — Anglais »... une par matière,
    au lieu des 238 épreuves réelles.

    On ne recrée rien : les notes sont accrochées aux évaluations existantes.
    On les regroupe, et on retire de leur libellé le nom de matière qui n'avait
    rien à y faire.
    """
    from app.models.academique import Evaluation, EvaluationSession

    orphelines = db.execute(text("""
        SELECT e.classe_id, e.trimestre_id, e.type_eval_id, e.date_evaluation,
               count(*) AS nb, min(e.libelle) AS libelle,
               bool_and(e.statut = 'CENTRALISEE') AS toutes_centralisees
        FROM ss_evaluations e
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        JOIN ss_trimestres t ON t.trimestre_id = e.trimestre_id
        WHERE cl.etablissement_id = :eid AND t.annee_id = :aid AND e.session_id IS NULL
        GROUP BY e.classe_id, e.trimestre_id, e.type_eval_id, e.date_evaluation
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    if not orphelines:
        return

    nb_sessions = nb_rattachees = 0
    for o in orphelines:
        # Le libellé de l'épreuve, sans le « — Matière » ajouté à tort.
        libelle = (o.libelle or "Épreuve").split(" — ")[0].strip()
        session = EvaluationSession(
            classe_id=o.classe_id, trimestre_id=o.trimestre_id,
            type_eval_id=o.type_eval_id, etablissement_id=eid,
            libelle=libelle, date_evaluation=o.date_evaluation, note_sur=20,
            est_coefficientee="O",
            statut="CENTRALISEE" if o.toutes_centralisees else "PUBLIEE",
        )
        db.add(session)
        db.flush()
        nb_sessions += 1
        nb_rattachees += db.query(Evaluation).filter(
            Evaluation.classe_id == o.classe_id,
            Evaluation.trimestre_id == o.trimestre_id,
            Evaluation.type_eval_id == o.type_eval_id,
            Evaluation.date_evaluation == o.date_evaluation,
            Evaluation.session_id.is_(None),
        ).update({"session_id": session.session_id, "libelle": libelle},
                 synchronize_session=False)
    db.commit()
    print(f"  [REGROUPE] {nb_rattachees} lignes matiere rassemblees en "
          f"{nb_sessions} epreuves")


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


# ── étape 10 : les notes ────────────────────────────────────────────────
#
# UN ÉLÈVE N'EST PAS UN TIRAGE AU SORT
# Des notes tirées au hasard donneraient une école où le premier du premier
# semestre finit dernier au second, où personne ne progresse et où aucun
# classement ne veut rien dire. Les moyennes seraient plausibles, les
# trajectoires absurdes — et c'est justement les trajectoires que l'école
# regarde.
#
# Chaque élève porte donc trois choses stables toute l'année :
#   son NIVEAU        — ce qu'il vaut en général ;
#   ses AFFINITÉS     — fort en maths, faible en français, et ça ne s'inverse
#                       pas d'une épreuve à l'autre ;
#   sa PROGRESSION    — il monte, stagne ou décroche, et la pente tient.
# Le hasard ne joue que sur le jour de l'épreuve : la forme du moment.
NIVEAU_MOYEN = 11.5          # sur 20, moyenne de l'école
NIVEAU_ECART = 3.2           # écart entre un bon et un faible élève
AFFINITE_ECART = 1.6         # écart d'une matière à l'autre chez un même élève
FORME_DU_JOUR = 1.5          # ce que le hasard d'une épreuve peut ajouter/ôter
PENTE_ANNUELLE = (-1.5, 2.5) # du décrochage à la vraie progression, sur l'année
MALUS_COMPOSITION = 0.7      # une composition est plus dure qu'une évaluation
PART_ABSENTS_EPREUVE = 0.02  # un élève sur cinquante manque une épreuve donnée


def _note_reelle(niveau, affinite, avancement, pente, est_compo, note_sur):
    """La note d'un élève à une épreuve, sur le barème de cette épreuve."""
    sur_20 = (
        niveau + affinite + pente * avancement
        + random.gauss(0, FORME_DU_JOUR)
        - (MALUS_COMPOSITION if est_compo else 0)
    )
    # Une note reste dans son barème. Un 21/20 n'existe pas, un -2 non plus :
    # ce sont les deux bornes que la saisie manuelle refuse déjà.
    return round(min(max(sur_20, 0.0), 20.0) * float(note_sur) / 20.0, 2)


def etape_10_notes(db: Session) -> None:
    """Les notes de toutes les épreuves, puis leur centralisation."""
    _titre(10, "Notes de l'annee et centralisation des epreuves")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    deja = db.execute(text("""
        SELECT count(*) FROM ss_notes n
        JOIN ss_evaluations e ON e.evaluation_id = n.evaluation_id
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        WHERE cl.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    if deja:
        print(f"  {deja} note(s) deja saisie(s) — etape deja jouee.")
        _recap_notes(db, eid, annee)
        return

    # Toutes les épreuves de l'année, dans l'ordre où elles se sont tenues :
    # l'ordre EST la progression, on ne peut pas le tirer au sort après coup.
    epreuves = db.execute(text("""
        SELECT e.evaluation_id, e.classe_id, e.matiere_id, e.note_sur,
               te.code AS type_code, e.date_evaluation
        FROM ss_evaluations e
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        JOIN ss_trimestres t ON t.trimestre_id = e.trimestre_id
        JOIN ss_types_evaluation te ON te.type_eval_id = e.type_eval_id
        WHERE cl.etablissement_id = :eid AND t.annee_id = :aid
        ORDER BY e.classe_id, e.date_evaluation, e.matiere_id
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    if not epreuves:
        print("  aucune epreuve — jouer l'etape 8 d'abord.")
        return

    # Les élèves de chaque classe. Une note se rattache à l'INSCRIPTION, pas à
    # l'élève : c'est ce qui fait qu'un redoublant garde ses notes de l'an
    # dernier au lieu de les voir réécrites par celles de cette année.
    inscrits = {}
    for classe_id, inscription_id in db.execute(text("""
        SELECT i.classe_id, i.inscription_id
        FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid AND i.statut = 'ACTIVE'
        ORDER BY i.inscription_id
    """), {"eid": eid, "aid": annee.annee_id}).fetchall():
        inscrits.setdefault(classe_id, []).append(inscription_id)

    # Le portrait scolaire de chaque élève, fixé une fois pour toutes.
    profils = {}
    for liste in inscrits.values():
        for insc_id in liste:
            profils[insc_id] = {
                "niveau": random.gauss(NIVEAU_MOYEN, NIVEAU_ECART),
                "pente": random.uniform(*PENTE_ANNUELLE),
                "affinites": {},
            }

    # Combien d'épreuves par classe : sert à situer chaque épreuve sur l'année
    # (0 = rentrée, 1 = fin juin) et donc à faire porter la progression.
    rang_epreuve = {}
    compteur = {}
    for ep in epreuves:
        cle = (ep.classe_id, ep.matiere_id)
        rang_epreuve[ep.evaluation_id] = compteur.get(cle, 0)
        compteur[cle] = compteur.get(cle, 0) + 1
    total_par_cle = dict(compteur)

    lignes = []
    nb_absents = 0
    for ep in epreuves:
        eleves = inscrits.get(ep.classe_id) or []
        total = max(total_par_cle.get((ep.classe_id, ep.matiere_id), 1) - 1, 1)
        avancement = rang_epreuve[ep.evaluation_id] / total
        est_compo = ep.type_code == "COMPO"
        for insc_id in eleves:
            profil = profils[insc_id]
            affinite = profil["affinites"].get(ep.matiere_id)
            if affinite is None:
                affinite = random.gauss(0, AFFINITE_ECART)
                profil["affinites"][ep.matiere_id] = affinite

            if random.random() < PART_ABSENTS_EPREUVE:
                # Absent : pas de note. Surtout pas un zéro — un zéro dit
                # « il a composé et n'a rien su », ce qui est faux et fait
                # chuter une moyenne annuelle sans raison.
                lignes.append({"e": ep.evaluation_id, "i": insc_id,
                               "v": None, "a": "O"})
                nb_absents += 1
                continue
            lignes.append({
                "e": ep.evaluation_id, "i": insc_id,
                "v": _note_reelle(profil["niveau"], affinite, avancement,
                                  profil["pente"], est_compo, ep.note_sur or 20),
                "a": "N",
            })

        if len(lignes) >= 5000:
            db.execute(text(
                "INSERT INTO ss_notes (evaluation_id, inscription_id, valeur, est_absent) "
                "VALUES (:e, :i, :v, :a)"), lignes)
            lignes = []
    if lignes:
        db.execute(text(
            "INSERT INTO ss_notes (evaluation_id, inscription_id, valeur, est_absent) "
            "VALUES (:e, :i, :v, :a)"), lignes)
    db.commit()

    # CENTRALISER : c'est le geste qui fait entrer une épreuve dans le bulletin.
    # L'application interdit de centraliser une épreuve sans note — le scénario
    # applique la même règle plutôt que de passer par-dessus.
    centralisees = db.execute(text("""
        UPDATE ss_evaluations e SET statut = 'CENTRALISEE'
        FROM ss_classes cl, ss_trimestres t
        WHERE cl.classe_id = e.classe_id AND t.trimestre_id = e.trimestre_id
          AND cl.etablissement_id = :eid AND t.annee_id = :aid
          AND EXISTS (SELECT 1 FROM ss_notes n
                      WHERE n.evaluation_id = e.evaluation_id AND n.valeur IS NOT NULL)
    """), {"eid": eid, "aid": annee.annee_id}).rowcount
    db.commit()

    total_notes = db.execute(text("""
        SELECT count(*) FROM ss_notes n
        JOIN ss_evaluations e ON e.evaluation_id = n.evaluation_id
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        WHERE cl.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    print(f"  {total_notes} notes saisies sur {len(epreuves)} epreuves")
    print(f"  {nb_absents} absence(s) a une epreuve — sans note, et non zero")
    print(f"  {centralisees} epreuve(s) centralisees : elles comptent au bulletin")
    _recap_notes(db, eid, annee)


def _recap_notes(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT c.libelle AS cycle, count(*) AS notes,
               round(avg(n.valeur * 20 / NULLIF(e.note_sur, 0))::numeric, 2) AS moyenne,
               min(n.valeur * 20 / NULLIF(e.note_sur, 0)) AS mini,
               max(n.valeur * 20 / NULLIF(e.note_sur, 0)) AS maxi
        FROM ss_notes n
        JOIN ss_evaluations e ON e.evaluation_id = n.evaluation_id
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        JOIN ss_niveaux niv ON niv.niveau_id = cl.niveau_id
        JOIN ss_cycles c ON c.cycle_id = niv.cycle_id
        WHERE cl.etablissement_id = :eid AND n.valeur IS NOT NULL
        GROUP BY c.libelle, c.ordre ORDER BY c.ordre
    """), {"eid": eid}).fetchall()
    print(f"\n  {'CYCLE':<16}{'NOTES':>9}{'MOYENNE':>10}{'MIN':>8}{'MAX':>8}   (ramene sur 20)")
    for cycle, nb, moyenne, mini, maxi in lignes:
        print(f"  {cycle:<16}{nb:>9}{moyenne:>10}{float(mini):>8.1f}{float(maxi):>8.1f}")

    # LA VRAIE VERIFICATION : est-ce que les eleves se distinguent ?
    # Une ecole ou tout le monde a 11,5 de moyenne n'a pas de classement, pas
    # de redoublant, pas de major. Ces notes-la seraient inutilisables pour
    # tester la cloture de l'annee.
    ecart = db.execute(text("""
        WITH par_eleve AS (
            SELECT n.inscription_id,
                   avg(n.valeur * 20 / NULLIF(e.note_sur, 0)) AS moy
            FROM ss_notes n
            JOIN ss_evaluations e ON e.evaluation_id = n.evaluation_id
            JOIN ss_classes cl ON cl.classe_id = e.classe_id
            WHERE cl.etablissement_id = :eid AND n.valeur IS NOT NULL
            GROUP BY n.inscription_id)
        SELECT count(*), round(avg(moy)::numeric, 2), round(min(moy)::numeric, 2),
               round(max(moy)::numeric, 2),
               count(*) FILTER (WHERE moy < 10) AS sous_la_moyenne
        FROM par_eleve
    """), {"eid": eid}).first()
    nb, moy, mini, maxi, faibles = ecart
    print(f"\n  {nb} eleves notes — moyenne generale {moy}/20, du plus faible "
          f"({mini}) au meilleur ({maxi})")
    print(f"  {faibles} eleve(s) sous 10 de moyenne annuelle : ce sont eux que la "
          f"cloture devra trancher")

    # La progression, semestre par semestre : elle doit se voir, sinon la pente
    # posee plus haut ne sert a rien et l'annee n'a aucune histoire.
    par_semestre = db.execute(text("""
        SELECT t.libelle, te.libelle AS type,
               round(avg(n.valeur * 20 / NULLIF(e.note_sur, 0))::numeric, 2) AS moyenne,
               count(*) AS notes
        FROM ss_notes n
        JOIN ss_evaluations e ON e.evaluation_id = n.evaluation_id
        JOIN ss_classes cl ON cl.classe_id = e.classe_id
        JOIN ss_trimestres t ON t.trimestre_id = e.trimestre_id
        JOIN ss_types_evaluation te ON te.type_eval_id = e.type_eval_id
        WHERE cl.etablissement_id = :eid AND n.valeur IS NOT NULL AND t.annee_id = :aid
        GROUP BY t.libelle, t.numero, te.libelle ORDER BY t.numero, te.libelle
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print()
    for libelle, type_eval, moyenne, nb in par_semestre:
        print(f"  {libelle:<15}{type_eval:<16}{moyenne:>7}/20  sur {nb} notes")
    print("  (les compositions sont plus basses : elles sont plus dures, "
          "c'est voulu)")


# ── étape 11 : les bulletins ────────────────────────────────────────────
#
# Un bulletin ne se saisit pas : il se CALCULE. Le scénario ne fabrique donc
# aucune moyenne — il appelle le moteur de l'application, celui-là même que
# l'école déclenche depuis « Centralisation Notes ». Un scénario qui
# calculerait ses propres moyennes ne testerait que lui-même, et laisserait
# passer une erreur de coefficient sans jamais s'en apercevoir.
def etape_11_bulletins(db: Session) -> None:
    """Bulletins de chaque semestre, puis bulletin annuel, classe par classe."""
    from app.services import notation as _notation

    _titre(11, "Bulletins de periode et bulletins annuels")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    classes = db.query(Classe).filter(
        Classe.etablissement_id == eid, Classe.annee_id == annee.annee_id,
        Classe.statut == "ACTIVE",
    ).order_by(Classe.code).all()
    semestres = db.query(Trimestre).filter(
        Trimestre.annee_id == annee.annee_id
    ).order_by(Trimestre.numero).all()
    if not classes or not semestres:
        print("  ni classes ni semestres — jouer les etapes 1 et 2 d'abord.")
        return

    print(f"  {len(classes)} classes x {len(semestres)} semestres, "
          f"puis le bulletin annuel de chacune.\n")
    nb_periode = nb_annuel = 0
    for classe in classes:
        for semestre in semestres:
            r = _notation.calculer_resultats_periode(
                db, classe.classe_id, semestre.trimestre_id, persist=True
            )
            nb_periode += r.get("bulletins_total", 0)
        a = _notation.calculer_resultats_annuels(
            db, classe.classe_id, persist=True
        )
        nb_annuel += a.get("bulletins_total", len(a.get("resultats") or []))
    db.commit()

    print(f"  {nb_periode} bulletins de semestre")
    print(f"  {nb_annuel} bulletins annuels")
    _recap_bulletins(db, eid, annee)


def _recap_bulletins(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT COALESCE(t.libelle, 'Annuel') AS periode, b.type_bulletin,
               count(*) AS bulletins,
               round(avg(b.moyenne_generale)::numeric, 2) AS moyenne,
               count(*) FILTER (WHERE b.moyenne_generale >= 10) AS au_dessus,
               count(*) FILTER (WHERE b.moyenne_generale < 10) AS en_dessous
        FROM ss_bulletins b
        JOIN ss_inscriptions i ON i.inscription_id = b.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        LEFT JOIN ss_trimestres t ON t.trimestre_id = b.trimestre_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid
        GROUP BY t.libelle, t.numero, b.type_bulletin
        ORDER BY b.type_bulletin DESC, t.numero
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print(f"\n  {'PERIODE':<16}{'BULLETINS':>10}{'MOYENNE':>10}{'>= 10':>8}{'< 10':>8}")
    for periode, _type, nb, moyenne, au_dessus, en_dessous in lignes:
        # Une moyenne vide veut dire quelque chose (aucune note exploitable) :
        # on l'affiche comme telle, on ne la remplace pas par un zéro.
        print(f"  {periode:<16}{nb:>10}{(str(moyenne) if moyenne is not None else '—'):>10}"
              f"{au_dessus:>8}{en_dessous:>8}")

    # LA VERIFICATION QUI COMPTE : un bulletin sans rang n'est pas un bulletin.
    # Une famille lit d'abord « 3e sur 32 », la moyenne vient apres.
    sans_rang = db.execute(text("""
        SELECT count(*) FROM ss_bulletins b
        JOIN ss_inscriptions i ON i.inscription_id = b.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid
          AND b.moyenne_generale IS NOT NULL AND b.rang IS NULL
    """), {"eid": eid, "aid": annee.annee_id}).scalar()
    print(f"\n  {'[OK]' if sans_rang == 0 else '[!!]'} bulletins notes sans rang : {sans_rang}")

    # Le major et le dernier de chaque cycle : si les deux se ressemblent,
    # c'est que les notes ne distinguent personne et que le classement ment.
    extremes = db.execute(text("""
        SELECT c.libelle AS cycle,
               round(max(b.moyenne_generale)::numeric, 2) AS meilleure,
               round(min(b.moyenne_generale)::numeric, 2) AS derniere,
               count(*) AS eleves
        FROM ss_bulletins b
        JOIN ss_inscriptions i ON i.inscription_id = b.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_niveaux niv ON niv.niveau_id = cl.niveau_id
        JOIN ss_cycles c ON c.cycle_id = niv.cycle_id
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid
          AND b.type_bulletin = 'ANNUEL' AND b.moyenne_generale IS NOT NULL
        GROUP BY c.libelle, c.ordre ORDER BY c.ordre
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    print(f"\n  Resultat annuel par cycle :")
    for cycle, meilleure, derniere, nb in extremes:
        print(f"     {cycle:<12} {nb:>4} eleves — du dernier ({derniere}) "
              f"au major ({meilleure})")


# ── étape 12 : le personnel non enseignant ──────────────────────────────
#
# UNE ÉCOLE N'EST PAS FAITE QUE D'ENSEIGNANTS
# Mille élèves, ça veut dire quelqu'un pour encaisser, quelqu'un pour tenir
# le portail, quelqu'un pour inscrire au guichet, quelqu'un pour surveiller la
# cour. Ces gens-là ont chacun leur espace dans l'application — et pour la
# plupart, un salaire mensuel fixe que la direction inscrit AU MOMENT où elle
# crée leur compte. C'est le geste réel : on embauche, on ouvre l'accès et on
# fixe la paie d'un seul mouvement.
#
# Trois d'entre eux n'ont pas de compte : l'agent d'entretien, le gardien et
# le chauffeur ne se connectent à rien. Ils existent quand même en base — il
# faut bien les payer.
#
# Salaires mensuels en GNF, ordre de grandeur d'une école privée de Conakry.
EFFECTIF_PERSONNEL = [
    # (rôle, nombre, salaire mensuel, prime, intitulé du poste)
    ("DG",              1, 4_500_000, 500_000, "Directeur General"),
    ("DIRECTEUR_NIVEAU", 1, 3_000_000, 300_000, "Directeur des Etudes"),
    ("COMPTABLE",       1, 2_500_000, 250_000, "Comptable"),
    ("INFORMATICIEN",   1, 2_000_000, 150_000, "Informaticien"),
    ("OPERATEUR",       2, 1_500_000, 100_000, "Secretaire"),
    ("SURVEILLANT",     3, 1_400_000, 100_000, "Surveillant"),
    ("BIBLIOTHECAIRE",  1, 1_300_000,  80_000, "Bibliothecaire"),
    ("CHAUFFEUR",       1, 1_200_000,  50_000, "Chauffeur"),
    ("GARDIEN",         2, 1_000_000,  50_000, "Gardien"),
    ("AGENT_ENTRETIEN", 4,   900_000,  40_000, "Agent d'entretien"),
]
NOMS_PERSONNEL = [
    ("Sylla", "Mariama"), ("Bah", "Alseny"), ("Camara", "Fatoumata"),
    ("Diallo", "Ousmane"), ("Conde", "Kadiatou"), ("Toure", "Sekou"),
    ("Barry", "Aissatou"), ("Keita", "Mamadou"), ("Soumah", "Hawa"),
    ("Kourouma", "Lansana"), ("Bangoura", "Mabinty"), ("Sow", "Ibrahima"),
    ("Traore", "Djenabou"), ("Doumbouya", "Alpha"), ("Fofana", "Nene"),
    ("Cisse", "Abdoulaye"), ("Sangare", "Salematou"),
]
MOT_DE_PASSE_PERSONNEL = "TrillionX2026!"
# Le compte de direction de l'ecole, celui qui pose les gestes de cloture.
MOT_DE_PASSE_ADMIN = "Klay1982"


def etape_12_personnel(db: Session) -> None:
    """Le personnel non enseignant : comptes, espaces et salaires."""
    from app.api.personnel import ROLES_AVEC_ACCES, generer_nom_utilisateur
    from app.core.security import hash_password
    from app.models.academique import Utilisateur

    _titre(12, "Personnel non enseignant : comptes, espaces et salaires")
    etab = _ecole(db)
    eid = etab.etablissement_id

    deja = db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == eid,
        Utilisateur.role != "ADMIN",
    ).count()
    if deja:
        print(f"  {deja} membre(s) du personnel deja en poste — etape deja jouee.")
        _recap_personnel(db, eid)
        return

    noms = list(NOMS_PERSONNEL)
    random.shuffle(noms)
    index = 0
    nb_avec_compte = nb_sans_compte = 0
    for role, nombre, salaire, prime, poste in EFFECTIF_PERSONNEL:
        for _ in range(nombre):
            nom, prenom = noms[index % len(noms)]
            index += 1
            # Le compte n'existe que si le rôle a un espace. Créer un login
            # pour un gardien qui n'a rien à consulter, c'est une porte de plus
            # à surveiller pour aucun usage.
            a_un_espace = role in ROLES_AVEC_ACCES
            login = generer_nom_utilisateur(db, prenom, nom) if a_un_espace else None
            db.add(Utilisateur(
                etablissement_id=eid, nom=nom, prenom=prenom, role=role,
                nom_utilisateur=login,
                mot_de_passe=hash_password(MOT_DE_PASSE_PERSONNEL) if a_un_espace else None,
                email=f"{(login or f'{prenom}.{nom}').lower()}@trillionx.gn",
                telephone=f"62{random.randint(1000000, 9999999)}",
                sexe=random.choice(["M", "F"]),
                statut="ACTIF", type_contrat="PERMANENT",
                date_embauche=ANNEE_DEBUT,
                # LE SALAIRE EST INSCRIT ICI, A LA CREATION DU COMPTE.
                # C'est le geste de la direction : on embauche, on ouvre
                # l'acces et on fixe la paie d'un seul mouvement.
                salaire_base=salaire, prime_mensuelle=prime,
                mode_paiement_salaire="ESPECES",
            ))
            db.flush()
            nb_avec_compte += 1 if a_un_espace else 0
            nb_sans_compte += 0 if a_un_espace else 1
    db.commit()

    print(f"  {nb_avec_compte} membre(s) avec un compte et un espace")
    print(f"  {nb_sans_compte} membre(s) sans compte (aucun espace a consulter), "
          f"payes comme les autres")
    print(f"  mot de passe commun a la recette : {MOT_DE_PASSE_PERSONNEL}")
    _recap_personnel(db, eid)


def _recap_personnel(db: Session, eid: int) -> None:
    # Où chaque rôle atterrit en se connectant. La table vit dans le frontend
    # (`roleAccess.ts`) ; elle est reprise ici pour que le récapitulatif dise
    # à quoi sert chaque compte créé.
    espaces = {
        "ADMIN": "/dashboard",
        "DG": "/dashboard",
        "DIRECTEUR_NIVEAU": "/dashboard (sans la comptabilite)",
        "COMPTABLE": "/comptabilite/dashboard",
        "BIBLIOTHECAIRE": "/personnel/portail/bibliothecaire",
        "INFORMATICIEN": "/personnel/portail/informaticien",
        "SURVEILLANT": "/personnel/portail/surveillant",
        "OPERATEUR": "/personnel/portail/operateur",
    }
    lignes = db.execute(text("""
        SELECT role, count(*) AS nb,
               count(nom_utilisateur) AS avec_compte,
               sum(COALESCE(salaire_base, 0) + COALESCE(prime_mensuelle, 0)) AS cout_mensuel
        FROM ss_utilisateurs WHERE etablissement_id = :eid
        GROUP BY role ORDER BY sum(COALESCE(salaire_base, 0)) DESC
    """), {"eid": eid}).fetchall()

    print(f"\n  {'ROLE':<18}{'NB':>4}{'COMPTE':>8}{'COUT MENSUEL':>16}   ESPACE")
    total = 0
    for role, nb, avec_compte, cout in lignes:
        total += float(cout or 0)
        print(f"  {role:<18}{nb:>4}{avec_compte:>8}{float(cout or 0):>16,.0f}   "
              f"{espaces.get(role, 'aucun espace')}")
    print(f"  {'TOTAL':<18}{'':>4}{'':>8}{total:>16,.0f} GNF / mois")

    # Ce que ça pèse sur l'année scolaire, octobre à juin : neuf mois.
    print(f"\n  Sur les 9 mois de l'annee scolaire : {total * 9:,.0f} GNF")

    # VERIFICATION : un compte sans mot de passe ne peut pas se connecter, et
    # un compte avec mot de passe doit avoir un login. L'un sans l'autre donne
    # un compte inutilisable que personne ne remarque avant la rentree.
    incoherents = db.execute(text("""
        SELECT count(*) FROM ss_utilisateurs
        WHERE etablissement_id = :eid
          AND ((nom_utilisateur IS NULL) <> (mot_de_passe IS NULL))
    """), {"eid": eid}).scalar()
    print(f"  {'[OK]' if incoherents == 0 else '[!!]'} comptes a moitie ouverts "
          f"(login sans mot de passe, ou l'inverse) : {incoherents}")

    # Un salaire manquant se nomme : « 1 membre sans salaire » n'est pas
    # actionnable, « Sekou TOURE, ADMIN » l'est.
    sans_salaire = db.execute(text("""
        SELECT prenom || ' ' || nom AS qui, role FROM ss_utilisateurs
        WHERE etablissement_id = :eid AND COALESCE(salaire_base, 0) = 0
        ORDER BY role
    """), {"eid": eid}).fetchall()
    if not sans_salaire:
        print("  [OK] tout le monde a un salaire renseigne")
    else:
        print(f"  [A COMPLETER] {len(sans_salaire)} membre(s) sans salaire — "
              f"ils ne sortiront pas a la paie :")
        for qui, role in sans_salaire:
            print(f"     {qui} ({role})")


# ── étape 13 : la paie, mois par mois ───────────────────────────────────
#
# NEUF MOIS, PAS UN VERSEMENT UNIQUE
# L'école paie fin octobre, fin novembre, et ainsi de suite jusqu'en juin.
# Chaque mois porte sa propre dépense, sa propre écriture comptable et son
# propre bulletin de paie. Regrouper les neuf mois en un seul versement
# donnerait une trésorerie fausse : neuf mois de charges sur un jour.
#
# Le scénario ne calcule aucun salaire lui-même : il appelle la fonction de
# l'application, celle que le comptable déclenche depuis « Centre de
# décaissement ». C'est la seule façon de vérifier que la retenue d'absence
# horaire du collège et du lycée arrive bien jusqu'au bulletin.
MOIS_DE_PAIE = [
    "2025-10", "2025-11", "2025-12",
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
]


def etape_13_paie(db: Session) -> None:
    """Les neuf mois de paie, enseignants et personnel."""
    from app.api.finance import (
        _calculer_salaire, _executer_paiement_salaire, _lister_employes_actifs,
    )
    from app.core.annee_courante import resoudre_annee

    _titre(13, "Paie mensuelle d'octobre a juin")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee_id = resoudre_annee(db, eid, None)

    deja = db.execute(text("""
        SELECT count(*) FROM ss_bulletins_paie b
        JOIN ss_employes e ON e.employe_id = b.employe_id
        WHERE e.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    if deja:
        print(f"  {deja} bulletin(s) de paie deja emis — etape deja jouee.")
        _recap_paie(db, eid)
        return

    refs = _lister_employes_actifs(db, eid)
    print(f"  {len(refs)} agents a payer, sur {len(MOIS_DE_PAIE)} mois.\n")

    total_general = 0.0
    for mois in MOIS_DE_PAIE:
        payes = ignores = echecs = 0
        verse = 0.0
        for ref in refs:
            try:
                calc = _calculer_salaire(db, ref, mois, eid)
                if calc["statut"] == "PAYE" or calc["net_a_payer"] <= 0:
                    ignores += 1
                    continue
                _executer_paiement_salaire(
                    db=db, employe_id_str=ref, mois_concerne=mois,
                    mode_paiement="ESPECES", etablissement_id=eid,
                    annee_id=annee_id,
                    # Pas de date forcée : l'application prend la fin du mois
                    # concerné, ce qui est la pratique — on paie fin de mois.
                )
                payes += 1
                verse += calc["net_a_payer"]
            except Exception as exc:
                db.rollback()
                echecs += 1
                if echecs <= 2:
                    print(f"     [!!] {ref} {mois} : {str(getattr(exc, 'detail', exc))[:90]}")
        total_general += verse
        marque = "[OK]" if echecs == 0 else "[!!]"
        print(f"  {marque} {mois}  {payes:>3} payes, {ignores:>3} sans montant, "
              f"{echecs:>2} echecs — {verse:>14,.0f} GNF")

    print(f"\n  Masse salariale de l'annee : {total_general:,.0f} GNF")
    _recap_paie(db, eid)


def _recap_paie(db: Session, eid: int) -> None:
    # LA VERIFICATION QUI COMPTE : chaque mois porte sa propre depense, datee
    # DANS ce mois. Neuf mois verses le meme jour signeraient le retour du
    # `date.today()` code en dur.
    lignes = db.execute(text("""
        SELECT b.mois_concerne, count(*) AS bulletins,
               sum(b.net_a_payer) AS net,
               sum(b.total_absences) AS retenues,
               min(b.date_paiement) AS premier, max(b.date_paiement) AS dernier
        FROM ss_bulletins_paie b
        JOIN ss_employes e ON e.employe_id = b.employe_id
        WHERE e.etablissement_id = :eid
        GROUP BY b.mois_concerne ORDER BY b.mois_concerne
    """), {"eid": eid}).fetchall()
    print(f"\n  {'MOIS':<10}{'AGENTS':>8}{'NET VERSE':>16}{'RETENUES':>12}   VERSE LE")
    total = 0.0
    for mois, nb, net, retenues, premier, dernier in lignes:
        total += float(net or 0)
        quand = f"{premier}" if premier == dernier else f"{premier} au {dernier}"
        print(f"  {mois:<10}{nb:>8}{float(net or 0):>16,.0f}"
              f"{float(retenues or 0):>12,.0f}   {quand}")
    print(f"  {'TOTAL':<10}{'':>8}{total:>16,.0f}")

    # Les retenues d'absence doivent se voir, et sur les bons agents : ce sont
    # les professeurs du secondaire payes a l'heure.
    retenus = db.execute(text("""
        SELECT e.prenom || ' ' || e.nom AS qui, e.mode_remuneration,
               count(*) AS mois_touches, sum(b.total_absences) AS retenu
        FROM ss_bulletins_paie b
        JOIN ss_employes emp ON emp.employe_id = b.employe_id
        JOIN ss_enseignants e ON 'ENS_' || e.enseignant_id = emp.source_ref
        WHERE emp.etablissement_id = :eid AND b.total_absences > 0
        GROUP BY e.prenom, e.nom, e.mode_remuneration
        ORDER BY sum(b.total_absences) DESC LIMIT 6
    """), {"eid": eid}).fetchall()
    if retenus:
        print(f"\n  Retenues d'absence — les heures de cours non assurees :")
        print(f"     {'ENSEIGNANT':<26}{'PAIE':<10}{'MOIS':>6}{'RETENU':>14}")
        for qui, mode, mois_touches, retenu in retenus:
            print(f"     {qui[:25]:<26}{mode:<10}{mois_touches:>6}{float(retenu):>14,.0f}")

    # La comptabilite doit refleter exactement la paie : une depense par
    # bulletin, ni plus ni moins.
    controle = db.execute(text("""
        SELECT
          (SELECT count(*) FROM ss_bulletins_paie b
             JOIN ss_employes e ON e.employe_id = b.employe_id
             WHERE e.etablissement_id = :eid) AS bulletins,
          (SELECT count(*) FROM ss_depenses d
             WHERE d.etablissement_id = :eid AND d.categorie = 'SALAIRES') AS depenses,
          (SELECT sum(d.montant) FROM ss_depenses d
             WHERE d.etablissement_id = :eid AND d.categorie = 'SALAIRES') AS total_depenses
    """), {"eid": eid}).first()
    bulletins, depenses, total_dep = controle
    accord = "[OK]" if bulletins == depenses else "[!!]"
    print(f"\n  {accord} {bulletins} bulletins de paie / {depenses} depenses SALAIRES "
          f"— {float(total_dep or 0):,.0f} GNF en charges")


# ── étape 14 : les examens nationaux et le passage ──────────────────────
#
# DEUX FAÇONS DE PASSER EN CLASSE SUPÉRIEURE, PAS UNE
# Dans une classe ordinaire, c'est la moyenne annuelle qui décide : au-dessus
# du seuil on passe, en dessous on redouble. L'école tranche seule.
#
# Dans une classe d'examen — 6ᵉ année (CEE), 10ᵉ année (BEPC), Terminale
# (BAC) — l'école ne décide rien. C'est le Ministère. Un élève à 14 de
# moyenne qui échoue au BAC redouble ; un élève à 9 qui l'obtient passe.
# Confondre les deux reviendrait à faire dire à l'école ce qu'elle n'a pas le
# droit de dire.
#
# Le scénario reproduit donc les deux chemins, et laisse le résultat officiel
# contredire la moyenne interne dans les deux sens : c'est exactement ce qui
# doit pouvoir arriver.
TAUX_REUSSITE_EXAMEN = {
    "CEE": 0.78,    # l'examen de fin de primaire, le plus accessible
    "BEPC": 0.62,
    "BAC": 0.51,    # le plus sélectif des trois
}
# Une moyenne élevée aide, mais ne garantit rien : c'est tout le sujet.
BONUS_BONNE_MOYENNE = 0.20


def etape_14_examens_nationaux(db: Session) -> None:
    """Résultats du Ministère pour les classes d'examen, puis le passage."""
    from app.models.academique import Niveau, ResultatOfficielExamen

    _titre(14, "Examens nationaux, admis et redoublants")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    # Les candidats SANS resultat : on complete, on ne recommence pas. Un
    # resultat deja saisi — par le scenario ou a la main dans l'ecran — est la
    # saisie du Ministere : la reecrire serait la falsifier.
    candidats = db.execute(text("""
        SELECT i.inscription_id, n.examen_national, cl.libelle AS classe,
               b.moyenne_generale
        FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        LEFT JOIN ss_bulletins b ON b.inscription_id = i.inscription_id
                                AND b.type_bulletin = 'ANNUEL'
        WHERE cl.etablissement_id = :eid AND i.annee_id = :aid
          AND i.statut = 'ACTIVE' AND n.est_examen = 'O'
          AND NOT EXISTS (SELECT 1 FROM ss_resultats_officiels_examen r
                          WHERE r.inscription_id = i.inscription_id)
        ORDER BY cl.code, i.inscription_id
    """), {"eid": eid, "aid": annee.annee_id}).fetchall()
    if not candidats:
        print("  tous les candidats ont deja leur resultat.")
        _recap_examens(db, eid, annee)
        return

    nb = 0
    for c in candidats:
        moyenne = float(c.moyenne_generale or 0)
        chance = TAUX_REUSSITE_EXAMEN.get(c.examen_national, 0.6)
        # Une bonne moyenne augmente les chances sans jamais les garantir.
        if moyenne >= 12:
            chance = min(chance + BONUS_BONNE_MOYENNE, 0.95)
        elif moyenne < 8:
            chance = max(chance - BONUS_BONNE_MOYENNE, 0.10)
        db.add(ResultatOfficielExamen(
            inscription_id=c.inscription_id,
            examen_national=c.examen_national,
            resultat="ADMIS" if random.random() < chance else "NON_ADMIS",
            date_saisie=date(2026, 7, 20),
            saisi_par="Direction",
        ))
        nb += 1
    db.commit()
    print(f"  {nb} resultats du Ministere saisis pour les classes d'examen")
    _recap_examens(db, eid, annee)


def _recap_examens(db: Session, eid: int, annee) -> None:
    lignes = db.execute(text("""
        SELECT r.examen_national AS examen, count(*) AS candidats,
               count(*) FILTER (WHERE r.resultat = 'ADMIS') AS admis,
               round(avg(b.moyenne_generale)::numeric, 2) AS moyenne
        FROM ss_resultats_officiels_examen r
        JOIN ss_inscriptions i ON i.inscription_id = r.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        LEFT JOIN ss_bulletins b ON b.inscription_id = i.inscription_id
                                AND b.type_bulletin = 'ANNUEL'
        WHERE cl.etablissement_id = :eid
        GROUP BY r.examen_national ORDER BY r.examen_national
    """), {"eid": eid}).fetchall()
    print(f"\n  {'EXAMEN':<8}{'CANDIDATS':>11}{'ADMIS':>8}{'TAUX':>8}{'MOY. INTERNE':>14}")
    for examen, candidats, admis, moyenne in lignes:
        taux = 100.0 * admis / candidats if candidats else 0
        print(f"  {examen:<8}{candidats:>11}{admis:>8}{taux:>7.1f}%{str(moyenne):>14}")

    # LE CAS QUI JUSTIFIE TOUT CE CHANTIER
    # Un elève à 14 de moyenne qui échoue au BAC redouble. Un elève à 9 qui
    # l'obtient passe. Si ces deux cas n'existent pas dans les données, le
    # scénario ne prouve rien : il n'aurait testé que des accords entre l'école
    # et le Ministère.
    desaccords = db.execute(text("""
        SELECT r.resultat, b.moyenne_generale, e.prenom || ' ' || e.nom AS qui,
               cl.libelle AS classe, r.examen_national
        FROM ss_resultats_officiels_examen r
        JOIN ss_inscriptions i ON i.inscription_id = r.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_eleves e ON e.eleve_id = i.eleve_id
        JOIN ss_bulletins b ON b.inscription_id = i.inscription_id
                           AND b.type_bulletin = 'ANNUEL'
        WHERE cl.etablissement_id = :eid
          AND ((r.resultat = 'NON_ADMIS' AND b.moyenne_generale >= 12)
            OR (r.resultat = 'ADMIS' AND b.moyenne_generale < 10))
        ORDER BY b.moyenne_generale DESC LIMIT 6
    """), {"eid": eid}).fetchall()
    print(f"\n  Quand le Ministere ne dit pas la meme chose que l'ecole :")
    if not desaccords:
        print("     aucun cas — le scenario n'aurait alors rien prouve.")
    for resultat, moyenne, qui, classe, examen in desaccords:
        sens = "recale malgre" if resultat == "NON_ADMIS" else "admis avec"
        print(f"     {qui[:24]:<25} {classe:<18} {examen:<5} {sens} {float(moyenne):.2f}/20")

    total = db.execute(text("""
        SELECT count(*) FILTER (WHERE r.resultat = 'ADMIS') AS admis,
               count(*) AS total
        FROM ss_resultats_officiels_examen r
        JOIN ss_inscriptions i ON i.inscription_id = r.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid
    """), {"eid": eid}).first()
    print(f"\n  Au total : {total[0]} admis sur {total[1]} candidats aux examens nationaux.")


# ── étape 15 : les communications de l'année ────────────────────────────
#
# UNE ÉCOLE, C'EST AUSSI DES GENS QUI SE PARLENT
# Trois conversations différentes, qui n'ont ni le même ton ni le même rythme.
#
#   L'ADMINISTRATION RELANCE LES ENSEIGNANTS pour les sujets. Une relance
#   n'existe que parce qu'une échéance est passée : sans dépôt en retard, il
#   n'y a rien à relancer. Le scénario s'appuie donc sur les vrais retards de
#   l'étape 8.
#
#   L'ADMINISTRATION RELANCE LES PARENTS pour la scolarité. Là aussi, sur les
#   vrais impayés du moment — pas sur une liste inventée.
#
#   LES PARENTS PARLENT AUX INSTITUTEURS, et c'est au primaire que ça se passe.
#   Au lycée, un parent écrit rarement au professeur de physique ; au primaire,
#   l'instituteur est LA personne qui connaît l'enfant. Ces échanges ont donc
#   une réponse, ce qui n'est pas le cas d'une relance.
MOTIFS_PARENTS = [
    ("Absence de mon enfant",
     "Bonjour Maître, {prenom} sera absent(e) demain pour un rendez-vous "
     "médical. Merci de m'indiquer ce qu'il/elle doit rattraper."),
    ("Difficultés en lecture",
     "Bonjour, j'ai remarqué que {prenom} peine à lire à la maison. "
     "Que puis-je faire pour l'aider le soir ?"),
    ("Demande de rendez-vous",
     "Bonjour Maître, je souhaiterais vous rencontrer pour parler des "
     "résultats de {prenom}. Quel jour vous conviendrait ?"),
    ("Comportement en classe",
     "Bonjour, {prenom} me dit qu'il/elle s'ennuie en classe. "
     "Est-ce que vous constatez la même chose ?"),
    ("Fournitures manquantes",
     "Bonjour Maître, quelles fournitures manquent encore à {prenom} ? "
     "Je passe au marché ce week-end."),
]
REPONSES_INSTITUTEUR = [
    "Bonjour, merci de m'avoir prévenu. Je note l'absence de {prenom} et je "
    "lui donnerai les leçons à rattraper dès son retour.",
    "Bonjour, {prenom} progresse mais a besoin de lire dix minutes chaque "
    "soir à voix haute. Commencez par des textes courts.",
    "Bonjour, je suis disponible mardi et jeudi après la classe, à partir de "
    "16h. Passez au bureau, nous parlerons de {prenom} tranquillement.",
    "Bonjour, {prenom} travaille bien mais se disperse en fin de journée. "
    "Je vais le/la placer devant, cela aide souvent.",
    "Bonjour, il manque un cahier de 100 pages et une ardoise. Le reste est "
    "au complet.",
]
PART_PARENTS_QUI_ECRIVENT = 0.28
PART_MESSAGES_AVEC_REPONSE = 0.72


def etape_15_communications(db: Session) -> None:
    """Relances de sujets, relances de paiement, et échanges au primaire."""
    from datetime import datetime, timedelta

    from app.models.academique import Message

    _titre(15, "Communications de l'annee")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    # Chaque flux se rejoue seul. Un garde-fou global sur « y a-t-il des
    # messages ? » se déclencherait sur les alertes de paie automatiques, qui
    # n'ont rien à voir avec cette étape.
    nb_sujets = nb_paiements = nb_familles = nb_reponses = 0

    # ── 1. Relances aux enseignants qui ont déposé en retard ──────────────
    # On relance CEUX QUI ÉTAIENT EN RETARD, pas tout le monde : une relance
    # envoyée à quelqu'un qui a déposé à l'heure décrédibilise les suivantes.
    # En retard = déposé à moins d'une semaine de l'épreuve, ou après elle.
    retardataires = db.execute(text("""
        WITH epreuve AS (
            SELECT classe_id, matiere_id, trimestre_id,
                   min(date_evaluation) AS jour
            FROM ss_evaluations
            GROUP BY classe_id, matiere_id, trimestre_id
        )
        SELECT s.enseignant_id, e.prenom || ' ' || e.nom AS nom,
               t.libelle AS periode, t.trimestre_id,
               count(*) AS sujets_en_retard, min(s.date_depot) AS premier_depot
        FROM ss_sujets_examen s
        JOIN ss_enseignants e ON e.enseignant_id = s.enseignant_id
        JOIN ss_trimestres t ON t.trimestre_id = s.trimestre_id
        JOIN epreuve ep ON ep.classe_id = s.classe_id
                       AND ep.matiere_id = s.matiere_id
                       AND ep.trimestre_id = s.trimestre_id
        WHERE e.etablissement_id = :eid
          AND s.date_depot > ep.jour - INTERVAL '7 days'
          AND NOT EXISTS (
              SELECT 1 FROM ss_messages m
              WHERE m.etablissement_id = :eid AND m.objet_type = 'EXAMENS'
                AND m.destinataire_type = 'ENSEIGNANT'
                AND m.destinataire_id = s.enseignant_id
                AND m.sujet LIKE '%' || t.libelle
          )
        GROUP BY s.enseignant_id, e.prenom, e.nom, t.libelle, t.trimestre_id
        ORDER BY s.enseignant_id
    """), {"eid": eid}).fetchall()

    # Qui est relancé ne se retire pas au sort à chaque exécution : sinon
    # rejouer l'étape désigne 24 AUTRES retardataires et la boîte se remplit
    # sans fin. Le tirage est attaché à la personne et à la période.
    # Pas de plafond « les 24 premiers » non plus : comme la requête écarte
    # déjà les couples relancés, un plafond fait simplement remonter les 24
    # suivants au passage d'après.
    retenus = [r for r in retardataires
               if random.Random(f"sujets-{r.enseignant_id}-{r.trimestre_id}").random() < 0.55]
    for r in retenus:
        db.add(Message(
            etablissement_id=eid, expediteur_type="ADMIN",
            destinataire_type="ENSEIGNANT", destinataire_id=r.enseignant_id,
            objet_type="EXAMENS",
            sujet=f"Dépôt des sujets — {r.periode}",
            contenu=(
                f"Bonjour {r.nom}, vos sujets de {r.periode} ne nous sont pas "
                f"encore parvenus au complet. Merci de les déposer depuis votre "
                f"portail, onglet Examens, avant la fin de la semaine."
            ),
            statut=random.choice(["ENVOYE", "LU", "LU"]),
            date_envoi=datetime.combine(
                r.premier_depot - timedelta(days=random.randint(1, 4)),
                datetime.min.time(),
            ) if r.premier_depot else None,
        ))
        nb_sujets += 1

    # ── 2. Relances de scolarité aux familles qui doivent encore ──────────
    impayes = db.execute(text("""
        SELECT p.parent_id, p.prenom || ' ' || p.nom AS parent,
               el.prenom AS enfant, cl.libelle AS classe,
               f.montant_total - COALESCE(f.montant_paye, 0) AS reste
        FROM ss_factures f
        JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        JOIN ss_eleves el ON el.eleve_id = i.eleve_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_eleve_parent ep ON ep.eleve_id = el.eleve_id
                               AND ep.est_responsable_financier = 'O'
        JOIN ss_parents p ON p.parent_id = ep.parent_id
        WHERE cl.etablissement_id = :eid
          AND f.montant_total - COALESCE(f.montant_paye, 0) > 0
          AND NOT EXISTS (
              SELECT 1 FROM ss_messages m
              WHERE m.etablissement_id = :eid AND m.objet_type = 'PAIEMENT'
                AND m.destinataire_type = 'PARENT'
                AND m.destinataire_id = p.parent_id
          )
        ORDER BY reste DESC LIMIT 120
    """), {"eid": eid}).fetchall()

    for r in impayes:
        db.add(Message(
            etablissement_id=eid, expediteur_type="ADMIN",
            destinataire_type="PARENT", destinataire_id=r.parent_id,
            objet_type="PAIEMENT",
            sujet=f"Scolarité de {r.enfant} — {r.classe}",
            contenu=(
                f"Bonjour {r.parent}, il reste {float(r.reste):,.0f} GNF sur la "
                f"scolarité de {r.enfant}. Merci de passer au secrétariat pour "
                f"régulariser, ou de nous dire quel échéancier vous arrange."
            ).replace(",", " "),
            statut=random.choice(["ENVOYE", "LU"]),
            date_envoi=datetime(2026, random.choice([2, 3, 4, 5]),
                                random.randint(1, 28), 9, 0),
        ))
        nb_paiements += 1

    # ── 3. Les parents du primaire écrivent à l'instituteur ───────────────
    familles = db.execute(text("""
        SELECT DISTINCT ON (el.eleve_id)
               p.parent_id, p.prenom || ' ' || p.nom AS parent,
               el.prenom AS enfant, a.enseignant_id,
               ens.prenom || ' ' || ens.nom AS maitre, cl.libelle AS classe
        FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles c ON c.cycle_id = n.cycle_id
        JOIN ss_eleves el ON el.eleve_id = i.eleve_id
        JOIN ss_eleve_parent ep ON ep.eleve_id = el.eleve_id
                               AND ep.est_contact_principal = 'O'
        JOIN ss_parents p ON p.parent_id = ep.parent_id
        JOIN ss_affectations a ON a.classe_id = cl.classe_id AND a.statut = 'ACTIVE'
        JOIN ss_enseignants ens ON ens.enseignant_id = a.enseignant_id
        WHERE cl.etablissement_id = :eid AND c.code = 'PRM' AND i.statut = 'ACTIVE'
          AND NOT EXISTS (
              SELECT 1 FROM ss_messages m
              WHERE m.etablissement_id = :eid AND m.expediteur_type = 'PARENT'
                AND m.expediteur_id = p.parent_id
          )
        ORDER BY el.eleve_id, a.affectation_id
    """), {"eid": eid}).fetchall()

    for f in familles:
        # Même raison qu'au-dessus : le parent qui écrit est décidé par son
        # identifiant, pas par un tirage neuf à chaque exécution.
        de = random.Random(f"parent-{f.parent_id}")
        if de.random() > PART_PARENTS_QUI_ECRIVENT:
            continue
        indice = random.randrange(len(MOTIFS_PARENTS))
        sujet, corps = MOTIFS_PARENTS[indice]
        jour = datetime(2026, random.choice([1, 2, 3, 4, 5]),
                        random.randint(1, 28), random.randint(7, 19), 0)
        message = Message(
            etablissement_id=eid, expediteur_type="PARENT",
            expediteur_id=f.parent_id, destinataire_type="ENSEIGNANT",
            destinataire_id=f.enseignant_id, objet_type="GENERAL",
            sujet=f"{sujet} — {f.enfant}",
            contenu=corps.format(prenom=f.enfant),
            statut="REPONDU", date_envoi=jour,
        )
        db.add(message)
        db.flush()
        nb_familles += 1

        # Une conversation sans réponse n'est pas une conversation. L'instituteur
        # répond dans la journée ou le lendemain — c'est ce qui fait la valeur
        # du lien au primaire.
        if random.random() < PART_MESSAGES_AVEC_REPONSE:
            db.add(Message(
                etablissement_id=eid, expediteur_type="ENSEIGNANT",
                expediteur_id=f.enseignant_id, destinataire_type="PARENT",
                destinataire_id=f.parent_id, objet_type="GENERAL",
                sujet=f"Re : {sujet} — {f.enfant}",
                contenu=REPONSES_INSTITUTEUR[indice].format(prenom=f.enfant),
                parent_message_id=message.message_id,
                statut=random.choice(["ENVOYE", "LU"]),
                date_envoi=jour + timedelta(hours=random.randint(2, 30)),
            ))
            nb_reponses += 1
        else:
            message.statut = random.choice(["ENVOYE", "LU"])

    db.commit()
    print(f"  {nb_sujets} relance(s) de sujets aux enseignants")
    print(f"  {nb_paiements} relance(s) de scolarite aux familles")
    print(f"  {nb_familles} message(s) de parents aux instituteurs, "
          f"dont {nb_reponses} avec reponse")
    _recap_communications(db, eid)


# ═══════════════════════════════════════════════════════════════════════════
# ÉTAPE 16 — CE QUE CHAQUE ESPACE A À MONTRER
#
# Le surveillant, le bibliothécaire et l'informaticien ont un compte, un
# salaire, un espace de travail... et zéro ligne à l'écran. Leurs tables sont
# vides : ni ouvrage, ni emprunt, ni équipement, ni incident, ni présence.
# Un espace vide ne prouve rien — ni que l'écran fonctionne, ni qu'il est
# utilisable, ni que les chiffres qu'il additionne sont les bons.
# ═══════════════════════════════════════════════════════════════════════════

CATALOGUE_BIBLIOTHEQUE = [
    # (titre, auteur, categorie, niveau_cible, exemplaires)
    ("L'Enfant noir", "Camara Laye", "ROMAN", "College", 12),
    ("Le Regard du roi", "Camara Laye", "ROMAN", "Lycee", 8),
    ("Dramouss", "Camara Laye", "ROMAN", "Lycee", 6),
    ("Les Soleils des independances", "Ahmadou Kourouma", "ROMAN", "Lycee", 8),
    ("Allah n'est pas oblige", "Ahmadou Kourouma", "ROMAN", "Lycee", 6),
    ("Une si longue lettre", "Mariama Ba", "ROMAN", "Lycee", 10),
    ("Sous l'orage", "Seydou Badian", "ROMAN", "College", 10),
    ("L'Aventure ambigue", "Cheikh Hamidou Kane", "ROMAN", "Lycee", 8),
    ("Ville cruelle", "Eza Boto", "ROMAN", "College", 8),
    ("Le Vieux Negre et la Medaille", "Ferdinand Oyono", "ROMAN", "College", 8),
    ("Contes et legendes de Guinee", "Collectif", "CONTE", "Primaire", 15),
    ("Le Petit Prince", "Antoine de Saint-Exupery", "CONTE", "Primaire", 20),
    ("Fables de La Fontaine", "Jean de La Fontaine", "POESIE", "Primaire", 12),
    ("Grammaire francaise 6e", "Collectif", "MANUEL", "College", 25),
    ("Mathematiques 6e", "Collectif", "MANUEL", "College", 25),
    ("Mathematiques 10e", "Collectif", "MANUEL", "College", 20),
    ("Physique-Chimie Terminale", "Collectif", "MANUEL", "Lycee", 18),
    ("Sciences de la Vie et de la Terre 1re", "Collectif", "MANUEL", "Lycee", 18),
    ("Histoire de la Guinee", "Djibril Tamsir Niane", "HISTOIRE", "Lycee", 10),
    ("Soundjata ou l'epopee mandingue", "Djibril Tamsir Niane", "HISTOIRE", "College", 14),
    ("Geographie de l'Afrique de l'Ouest", "Collectif", "GEOGRAPHIE", "College", 12),
    ("Atlas scolaire", "Collectif", "GEOGRAPHIE", "Primaire", 10),
    ("Dictionnaire Larousse", "Collectif", "DICTIONNAIRE", "Tous", 15),
    ("Anglais 4e — My English Book", "Collectif", "MANUEL", "College", 20),
    ("Initiation a l'informatique", "Collectif", "INFORMATIQUE", "Lycee", 12),
]

MOTIFS_INCIDENTS = [
    ("RETARD", "MINEUR", "Arrive {n} minutes apres la sonnerie, sans justification."),
    ("BAVARDAGE", "MINEUR", "Perturbe le cours par des bavardages repetes malgre deux rappels."),
    ("DEVOIR_NON_FAIT", "MINEUR", "Se presente sans le devoir demande pour la troisieme fois."),
    ("TENUE", "MINEUR", "Tenue non conforme au reglement interieur."),
    ("ABSENCE_NON_JUSTIFIEE", "MOYEN", "Absent une demi-journee sans justificatif de la famille."),
    ("INSOLENCE", "MOYEN", "Repond de maniere irrespectueuse au professeur devant la classe."),
    ("TELEPHONE", "MOYEN", "Telephone utilise en classe, confisque et remis a la famille."),
    ("DEGRADATION", "GRAVE", "Table de la salle deterioree ; reparation a la charge de la famille."),
    ("BAGARRE", "GRAVE", "Altercation physique dans la cour pendant la recreation."),
    ("TRICHE", "GRAVE", "Surpris avec des notes dissimulees pendant une composition."),
]

MATERIEL_INFORMATIQUE = [
    ("ORDINATEUR", "Ordinateur de bureau", "HP", "ProDesk 400"),
    ("ORDINATEUR", "Ordinateur portable", "Dell", "Latitude 3520"),
    ("IMPRIMANTE", "Imprimante laser", "Canon", "LBP6030"),
    ("VIDEOPROJECTEUR", "Videoprojecteur", "Epson", "EB-X06"),
    ("ONDULEUR", "Onduleur 650 VA", "APC", "BX650"),
    ("RESEAU", "Point d'acces Wi-Fi", "TP-Link", "EAP225"),
    ("TABLETTE", "Tablette pedagogique", "Samsung", "Tab A8"),
]

# Ce que le surveillant constate vraiment : l'absentéisme n'est pas uniforme.
PART_ELEVES_ASSIDUS = 0.62      # jamais ou presque absents
PART_ELEVES_IRREGULIERS = 0.30  # quelques absences dans l'année
# le reste décroche : absences répétées, c'est eux que l'école doit voir


def _jours_de_classe(debut: date, fin: date) -> list:
    """Les jours ouvrés de l'année scolaire. Une école ne travaille pas le
    dimanche, et le samedi seulement le matin — on le garde, allégé."""
    from datetime import timedelta

    jours, jour = [], debut
    while jour <= fin:
        if jour.weekday() < 5:
            jours.append(jour)
        jour += timedelta(days=1)
    return jours


def etape_16_espaces(db: Session) -> None:
    """Remplit les espaces qui n'avaient rien à montrer."""
    _titre(16, "Les espaces : bibliotheque, informatique, surveillance")
    etab = _ecole(db)
    eid = etab.etablissement_id
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == eid, AnneeScolaire.est_courante == "O"
    ).first()

    _salles(db, eid)
    _bibliotheque(db, eid, annee)
    _parc_informatique(db, eid)
    _discipline(db, eid, annee)
    _presences_eleves(db, eid, annee)
    _pointage_des_agents(db, eid, annee)
    _recap_espaces(db, eid)


def _salles(db: Session, eid: int) -> None:
    """Une classe se tient quelque part, un ordinateur est posé quelque part."""
    from app.models.academique import Salle

    if db.query(Salle).filter(Salle.etablissement_id == eid).count():
        print("  salles : deja creees.")
        return

    classes = db.execute(text("""
        SELECT cl.classe_id, cl.libelle, cl.capacite_max
        FROM ss_classes cl WHERE cl.etablissement_id = :eid ORDER BY cl.classe_id
    """), {"eid": eid}).fetchall()

    creees = 0
    for i, c in enumerate(classes, start=1):
        salle = Salle(
            etablissement_id=eid, code=f"S{i:02d}", nom=f"Salle {c.libelle}",
            capacite=int(c.capacite_max or 40), type_salle="CLASSE", disponible="O",
        )
        db.add(salle)
        db.flush()
        # Une classe se tient dans SA salle : le lien existe déjà dans le
        # modèle, il n'était simplement jamais posé.
        db.execute(text("UPDATE ss_classes SET salle_id = :s WHERE classe_id = :c"),
                   {"s": salle.salle_id, "c": c.classe_id})
        creees += 1
    for code, nom, capacite, genre in [
        ("INF1", "Salle informatique", 30, "INFORMATIQUE"),
        ("BIB1", "Bibliotheque", 60, "BIBLIOTHEQUE"),
        ("LAB1", "Laboratoire de sciences", 30, "LABORATOIRE"),
        ("ADM1", "Administration", 10, "BUREAU"),
    ]:
        db.add(Salle(etablissement_id=eid, code=code, nom=nom,
                     capacite=capacite, type_salle=genre, disponible="O"))
        creees += 1
    db.commit()
    print(f"  salles : {creees} creees.")


def _bibliotheque(db: Session, eid: int, annee) -> None:
    """Le catalogue, les exemplaires, et une année de prêts."""
    from datetime import timedelta

    from app.models.academique import Emprunt, Exemplaire, Ouvrage

    if db.query(Ouvrage).filter(Ouvrage.etablissement_id == eid).count():
        print("  bibliotheque : catalogue deja constitue.")
        return

    de = random.Random(f"biblio-{eid}")
    exemplaires = []
    for rang, (titre, auteur, categorie, niveau, nb) in enumerate(CATALOGUE_BIBLIOTHEQUE, start=1):
        ouvrage = Ouvrage(
            etablissement_id=eid, code_interne=f"OUV-{eid}-{rang:03d}",
            titre=titre, auteur=auteur, categorie=categorie, niveau_cible=niveau,
            langue="FRANCAIS", nb_exemplaires=nb, nb_disponibles=nb,
            emplacement=f"Rayon {categorie[:3]}", statut="DISPONIBLE",
        )
        db.add(ouvrage)
        db.flush()
        for n in range(1, nb + 1):
            ex = Exemplaire(
                ouvrage_id=ouvrage.ouvrage_id,
                code_exemplaire=f"EX-{eid}-{rang:03d}-{n:02d}",
                # Un fonds vit : quelques exemplaires sont abîmés, un ou deux
                # ont disparu. Un catalogue où tout est « BON » ne ressemble à
                # aucune bibliothèque réelle.
                etat=de.choices(["BON", "BON", "BON", "USE", "ABIME"], k=1)[0],
                statut="DISPONIBLE", date_acquisition=ANNEE_DEBUT,
            )
            db.add(ex)
            exemplaires.append(ex)
    db.flush()

    eleves = [r.eleve_id for r in db.execute(text("""
        SELECT DISTINCT el.eleve_id FROM ss_eleves el
        JOIN ss_inscriptions i ON i.eleve_id = el.eleve_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND i.statut = 'ACTIVE'
        ORDER BY el.eleve_id
    """), {"eid": eid}).fetchall()]
    enseignants = [r.enseignant_id for r in db.execute(text(
        "SELECT enseignant_id FROM ss_enseignants WHERE etablissement_id = :eid"
    ), {"eid": eid}).fetchall()]

    jours = _jours_de_classe(ANNEE_DEBUT, ANNEE_FIN)
    aujourdhui = date.today()
    en_cours, rendus, en_retard = 0, 0, 0
    occupes = set()

    for _ in range(520):
        ex = de.choice(exemplaires)
        if ex.exemplaire_id in occupes:
            continue
        emprunt_le = de.choice(jours[: max(1, len(jours) - 20)])
        retour_prevu = emprunt_le + timedelta(days=14)
        pour_un_prof = de.random() < 0.18

        emprunt = Emprunt(
            exemplaire_id=ex.exemplaire_id,
            eleve_id=None if pour_un_prof else de.choice(eleves),
            enseignant_id=de.choice(enseignants) if pour_un_prof else None,
            date_emprunt=emprunt_le, date_retour_prevue=retour_prevu,
        )

        # L'année est finie : tout prêt encore sorti est, par construction, en
        # retard. La proportion doit donc rester celle des livres qu'une école
        # récupère réellement à la rentrée — pas 20 % du fonds dehors.
        tirage = de.random()
        if tirage < 0.94:
            # Rendu, à l'heure ou avec quelques jours de retard.
            retard = max(0, de.choice([-3, -1, 0, 0, 1, 4, 9, 21]))
            rendu_le = retour_prevu + timedelta(days=retard)
            emprunt.date_retour_effective = min(rendu_le, ANNEE_FIN)
            emprunt.nb_jours_retard = max(0, (emprunt.date_retour_effective - retour_prevu).days)
            emprunt.etat_retour = de.choices(["BON", "BON", "USE", "ABIME"], k=1)[0]
            emprunt.statut = "RENDU"
            rendus += 1
        else:
            # Toujours dehors. C'est cette liste que le bibliothécaire relance.
            emprunt.statut = "EN_COURS"
            ex.statut = "EMPRUNTE"
            occupes.add(ex.exemplaire_id)
            en_cours += 1
            if retour_prevu < aujourdhui:
                emprunt.nb_jours_retard = (aujourdhui - retour_prevu).days
                emprunt.rappel_envoye = "O" if de.random() < 0.7 else "N"
                if emprunt.rappel_envoye == "O":
                    emprunt.date_rappel = retour_prevu + timedelta(days=de.randint(2, 10))
                en_retard += 1
        db.add(emprunt)

    # `nb_disponibles` n'est pas une décoration : c'est ce que le
    # bibliothécaire lit avant de prêter. Il se recalcule depuis les
    # exemplaires réellement sortis, jamais à la main.
    db.flush()
    db.execute(text("""
        UPDATE ss_ouvrages o SET nb_disponibles = (
            SELECT count(*) FROM ss_exemplaires e
            WHERE e.ouvrage_id = o.ouvrage_id AND e.statut = 'DISPONIBLE')
        WHERE o.etablissement_id = :eid
    """), {"eid": eid})
    db.commit()
    print(f"  bibliotheque : {len(CATALOGUE_BIBLIOTHEQUE)} ouvrages, "
          f"{len(exemplaires)} exemplaires, {rendus + en_cours} emprunts "
          f"({en_cours} dehors dont {en_retard} en retard).")


def _parc_informatique(db: Session, eid: int) -> None:
    """Le parc que l'informaticien entretient."""
    from datetime import timedelta

    from app.models.academique import EquipementInformatique, Salle

    if db.query(EquipementInformatique).filter(
        EquipementInformatique.etablissement_id == eid
    ).count():
        print("  informatique : parc deja inventorie.")
        return

    de = random.Random(f"parc-{eid}")
    salles = db.query(Salle).filter(Salle.etablissement_id == eid).all()
    salle_info = next((s for s in salles if s.type_salle == "INFORMATIQUE"), None)

    cree = 0
    # La salle informatique : 24 postes, un onduleur, un point d'accès.
    for n in range(1, 25):
        # BON / PANNE / A_REMPLACER : c'est le vocabulaire du formulaire de
        # l'informaticien. En inventer un autre rendrait ces machines
        # invisibles au compteur « en panne » de son tableau de bord.
        etat = de.choices(["BON", "PANNE", "A_REMPLACER"], weights=[82, 13, 5], k=1)[0]
        db.add(EquipementInformatique(
            etablissement_id=eid, salle_id=salle_info.salle_id if salle_info else None,
            code=f"PC-{n:03d}", nom=f"Poste eleve {n:02d}",
            type_equipement="ORDINATEUR", marque="HP", modele="ProDesk 400",
            numero_serie=f"SN{eid}{n:05d}", etat=etat,
            statut="HORS_SERVICE" if etat == "A_REMPLACER" else "ACTIF",
            derniere_maintenance=ANNEE_DEBUT + timedelta(days=de.randint(0, 240)),
            observation="Ecran a remplacer" if etat == "A_REMPLACER" else None,
        ))
        cree += 1

    # Le reste du parc, réparti dans l'école.
    autres = [s for s in salles if s.type_salle != "INFORMATIQUE"]
    for n in range(1, 31):
        genre, nom, marque, modele = de.choice(MATERIEL_INFORMATIQUE)
        etat = de.choices(["BON", "PANNE", "A_REMPLACER"], weights=[84, 12, 4], k=1)[0]
        db.add(EquipementInformatique(
            etablissement_id=eid,
            salle_id=de.choice(autres).salle_id if autres else None,
            code=f"EQ-{n:03d}", nom=nom, type_equipement=genre,
            marque=marque, modele=modele, numero_serie=f"SN{eid}9{n:04d}",
            etat=etat, statut="HORS_SERVICE" if etat == "A_REMPLACER" else "ACTIF",
            derniere_maintenance=ANNEE_DEBUT + timedelta(days=de.randint(0, 240)),
        ))
        cree += 1
    db.commit()
    print(f"  informatique : {cree} equipements inventories.")


def _discipline(db: Session, eid: int, annee) -> None:
    """Ce que les surveillants remontent au fil de l'année."""
    from app.models.academique import Incident

    if db.query(Incident).filter(Incident.etablissement_id == eid).count():
        print("  discipline : incidents deja saisis.")
        return

    de = random.Random(f"discipline-{eid}")
    surveillants = [f"{r.prenom} {r.nom}" for r in db.execute(text("""
        SELECT prenom, nom FROM ss_utilisateurs
        WHERE etablissement_id = :eid AND role IN ('SURVEILLANT', 'DIRECTEUR_NIVEAU')
          AND statut = 'ACTIF'
    """), {"eid": eid}).fetchall()] or ["Surveillance generale"]

    # Au primaire on ne tient pas un registre de discipline comme au lycée :
    # les incidents remontent surtout du collège et du lycée.
    eleves = db.execute(text("""
        SELECT el.eleve_id, c.code AS cycle
        FROM ss_eleves el
        JOIN ss_inscriptions i ON i.eleve_id = el.eleve_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        JOIN ss_niveaux n ON n.niveau_id = cl.niveau_id
        JOIN ss_cycles c ON c.cycle_id = n.cycle_id
        WHERE cl.etablissement_id = :eid AND i.statut = 'ACTIVE' AND c.code <> 'PRM'
    """), {"eid": eid}).fetchall()
    if not eleves:
        print("  discipline : aucun eleve concerne.")
        return

    jours = _jours_de_classe(ANNEE_DEBUT, min(ANNEE_FIN, date.today()))
    par_gravite = {"MINEUR": 0, "MOYEN": 0, "GRAVE": 0}
    for _ in range(240):
        eleve = de.choice(eleves)
        genre, gravite, texte = de.choices(
            MOTIFS_INCIDENTS, weights=[22, 20, 14, 8, 12, 9, 7, 3, 3, 2], k=1)[0]
        db.add(Incident(
            eleve_id=eleve.eleve_id, etablissement_id=eid,
            date_incident=de.choice(jours), type_incident=genre, gravite=gravite,
            description=texte.format(n=de.choice([5, 10, 15, 20, 25])),
            signale_par=de.choice(surveillants),
            # Un incident grave ne reste pas « signalé » : il est traité.
            statut=("TRAITE" if gravite == "GRAVE" and de.random() < 0.85
                    else de.choices(["SIGNALE", "TRAITE", "CLASSE"],
                                    weights=[35, 45, 20], k=1)[0]),
        ))
        par_gravite[gravite] += 1
    db.commit()
    print(f"  discipline : {sum(par_gravite.values())} incidents "
          f"({par_gravite['MINEUR']} mineurs, {par_gravite['MOYEN']} moyens, "
          f"{par_gravite['GRAVE']} graves).")


def _presences_eleves(db: Session, eid: int, annee) -> None:
    """L'absentéisme, tel qu'il se répartit vraiment.

    On n'enregistre que ce qui SORT de l'ordinaire — absences et retards. Poser
    une ligne « présent » pour 1 000 élèves × 180 jours × 2 demi-journées ferait
    360 000 lignes qui ne disent rien : la présence est la règle, elle se déduit
    de l'absence de ligne.
    """
    from app.models.academique import Presence

    deja = db.execute(text("""
        SELECT count(*) FROM ss_presences p
        JOIN ss_inscriptions i ON i.inscription_id = p.inscription_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid
    """), {"eid": eid}).scalar()
    if deja:
        print(f"  presences eleves : {deja} lignes deja saisies.")
        return

    de = random.Random(f"presences-{eid}")
    inscriptions = [r.inscription_id for r in db.execute(text("""
        SELECT i.inscription_id FROM ss_inscriptions i
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND i.statut = 'ACTIVE'
        ORDER BY i.inscription_id
    """), {"eid": eid}).fetchall()]
    jours = _jours_de_classe(ANNEE_DEBUT, min(ANNEE_FIN, date.today()))

    MOTIFS = ["Maladie", "Rendez-vous medical", "Deces dans la famille",
              "Voyage familial", "Travaux champetres", None]
    lignes, decrocheurs = [], 0
    for inscription_id in inscriptions:
        tirage = de.random()
        # Calibre sur ce qu'une ecole guineenne constate reellement : un premier
        # jet donnait 98,9 % d'assiduite sur l'annee, un chiffre qu'aucun
        # directeur ne reconnaitrait comme le sien.
        if tirage < PART_ELEVES_ASSIDUS:
            nb = de.randint(3, 12)
        elif tirage < PART_ELEVES_ASSIDUS + PART_ELEVES_IRREGULIERS:
            nb = de.randint(15, 40)
        else:
            nb = de.randint(60, 140)
            decrocheurs += 1
        for _ in range(nb):
            statut = de.choices(["ABSENT", "ABSENT", "RETARD"], k=1)[0]
            justifie = de.random() < (0.62 if statut == "ABSENT" else 0.25)
            lignes.append({
                "inscription_id": inscription_id,
                "date_presence": de.choice(jours),
                "demi_journee": de.choice(["MATIN", "MATIN", "SOIR"]),
                "statut_presence": statut,
                "est_justifie": "O" if justifie else "N",
                "motif": de.choice(MOTIFS) if justifie else None,
            })

    db.bulk_insert_mappings(Presence, lignes)
    db.commit()
    print(f"  presences eleves : {len(lignes)} absences/retards enregistres, "
          f"{decrocheurs} eleve(s) en decrochage.")


def _pointage_des_agents(db: Session, eid: int, annee) -> None:
    """Le pointage du personnel — ce que l'écran de présence des agents lit."""
    from datetime import time as time_type

    from app.models.academique import PresenceAgent

    if db.query(PresenceAgent).filter(PresenceAgent.etablissement_id == eid).count():
        print("  pointage des agents : deja enregistre.")
        return

    de = random.Random(f"pointage-{eid}")
    agents = [(r.utilisateur_id, f"{r.prenom} {r.nom}") for r in db.execute(text("""
        SELECT utilisateur_id, prenom, nom FROM ss_utilisateurs
        WHERE etablissement_id = :eid AND statut = 'ACTIF'
    """), {"eid": eid}).fetchall()]
    # Deux mois de pointage suffisent à faire vivre l'écran ; l'année entière
    # pour vingt agents n'apprendrait rien de plus et alourdirait la base.
    jours = [j for j in _jours_de_classe(ANNEE_DEBUT, ANNEE_FIN)
             if j.month in (5, 6) and j <= date.today()]

    lignes = []
    for agent_id, _nom in agents:
        for jour in jours:
            tirage = de.random()
            if tirage < 0.04:
                continue  # absent : pas de pointage du tout
            en_retard = tirage < 0.16
            heure = time_type(de.randint(8, 9) if en_retard else 7,
                              de.randint(0, 59))
            lignes.append({
                "etablissement_id": eid, "type_agent": "PERSONNEL",
                "agent_id": agent_id, "date_presence": jour,
                "heure_arrivee": heure,
                "heure_depart": time_type(de.choice([16, 17, 17, 18]), de.randint(0, 59)),
                "statut": "RETARD" if en_retard else "PRESENT",
                "observations": "Arrivee tardive signalee" if en_retard else None,
            })

    db.bulk_insert_mappings(PresenceAgent, lignes)
    db.commit()
    print(f"  pointage des agents : {len(lignes)} pointages sur {len(jours)} jours.")


def _recap_espaces(db: Session, eid: int) -> None:
    print(f"\n  {'ESPACE':<22}{'CE QUE L ECRAN AFFICHE':<52}")
    mesures = [
        ("Bibliotheque", """
            SELECT count(DISTINCT o.ouvrage_id) || ' ouvrages, ' ||
                   count(DISTINCT e.exemplaire_id) || ' exemplaires, ' ||
                   (SELECT count(*) FROM ss_emprunts em
                    JOIN ss_exemplaires ex ON ex.exemplaire_id = em.exemplaire_id
                    JOIN ss_ouvrages ou2 ON ou2.ouvrage_id = ex.ouvrage_id
                    WHERE ou2.etablissement_id = :eid AND em.statut = 'EN_COURS')
                   || ' prets en cours'
            FROM ss_ouvrages o LEFT JOIN ss_exemplaires e ON e.ouvrage_id = o.ouvrage_id
            WHERE o.etablissement_id = :eid"""),
        ("Informatique", """
            SELECT count(*) || ' equipements, ' ||
                   count(*) FILTER (WHERE etat IN ('PANNE', 'A_REMPLACER')) || ' en panne'
            FROM ss_equipements_informatiques WHERE etablissement_id = :eid"""),
        ("Surveillance", """
            SELECT count(*) || ' incidents, ' ||
                   count(*) FILTER (WHERE statut = 'SIGNALE') || ' a traiter'
            FROM ss_incidents WHERE etablissement_id = :eid"""),
        ("Vie scolaire", """
            SELECT count(*) || ' absences/retards, ' ||
                   count(*) FILTER (WHERE est_justifie = 'N') || ' non justifies'
            FROM ss_presences p
            JOIN ss_inscriptions i ON i.inscription_id = p.inscription_id
            JOIN ss_classes cl ON cl.classe_id = i.classe_id
            WHERE cl.etablissement_id = :eid"""),
        ("Personnel", """
            SELECT count(*) || ' pointages, ' ||
                   count(*) FILTER (WHERE statut = 'RETARD') || ' en retard'
            FROM ss_presences_agents WHERE etablissement_id = :eid"""),
    ]
    for nom, requete in mesures:
        print(f"  {nom:<22}{db.execute(text(requete), {'eid': eid}).scalar()}")

    # L'ÉLÈVE QUE L'ÉCOLE DOIT VOIR
    pire = db.execute(text("""
        SELECT el.prenom || ' ' || el.nom AS eleve, cl.libelle AS classe,
               count(*) AS absences,
               count(*) FILTER (WHERE p.est_justifie = 'N') AS non_justifiees
        FROM ss_presences p
        JOIN ss_inscriptions i ON i.inscription_id = p.inscription_id
        JOIN ss_eleves el ON el.eleve_id = i.eleve_id
        JOIN ss_classes cl ON cl.classe_id = i.classe_id
        WHERE cl.etablissement_id = :eid AND p.statut_presence = 'ABSENT'
        GROUP BY el.prenom, el.nom, cl.libelle
        ORDER BY count(*) DESC LIMIT 1
    """), {"eid": eid}).first()
    if pire:
        print(f"\n  Le dossier le plus lourd : {pire.eleve} ({pire.classe}) — "
              f"{pire.absences} absences dont {pire.non_justifiees} non justifiees.")


def _recap_communications(db: Session, eid: int) -> None:
    lignes = db.execute(text("""
        SELECT expediteur_type AS de, destinataire_type AS vers, objet_type AS objet,
               count(*) AS nb,
               count(*) FILTER (WHERE statut IN ('LU', 'REPONDU')) AS lus
        FROM ss_messages WHERE etablissement_id = :eid
        GROUP BY expediteur_type, destinataire_type, objet_type
        ORDER BY count(*) DESC
    """), {"eid": eid}).fetchall()
    print(f"\n  {'DE':<12}{'VERS':<12}{'OBJET':<12}{'NB':>6}{'LUS':>6}")
    for de, vers, objet, nb, lus in lignes:
        print(f"  {de:<12}{vers:<12}{objet:<12}{nb:>6}{lus:>6}")

    # CE QUI FAIT LA DIFFERENCE ENTRE UN ENVOI ET UNE CONVERSATION
    echanges = db.execute(text("""
        SELECT count(*) FROM ss_messages
        WHERE etablissement_id = :eid AND parent_message_id IS NOT NULL
    """), {"eid": eid}).scalar()
    sans_reponse = db.execute(text("""
        SELECT count(*) FROM ss_messages m
        WHERE m.etablissement_id = :eid AND m.expediteur_type = 'PARENT'
          AND NOT EXISTS (SELECT 1 FROM ss_messages r
                          WHERE r.parent_message_id = m.message_id)
    """), {"eid": eid}).scalar()
    print(f"\n  {echanges} reponse(s) d'instituteur — un envoi sans reponse n'est")
    print(f"  pas une conversation. {sans_reponse} message(s) de parent restent")
    print(f"  sans reponse : c'est ce que l'ecole doit voir sur son ecran.")

    exemple = db.execute(text("""
        SELECT m.sujet, m.contenu, r.contenu AS reponse
        FROM ss_messages m
        JOIN ss_messages r ON r.parent_message_id = m.message_id
        WHERE m.etablissement_id = :eid AND m.expediteur_type = 'PARENT'
        LIMIT 1
    """), {"eid": eid}).first()
    if exemple:
        print(f"\n  Un echange, tel qu'il apparait a l'ecran :")
        print(f"     « {exemple.sujet} »")
        print(f"     parent     : {exemple.contenu[:88]}...")
        print(f"     instituteur: {exemple.reponse[:88]}...")


# ═══════════════════════════════════════════════════════════════════════════
# ÉTAPE 17 — LA CLÔTURE
#
# « Quand on clôture l'année, l'admin de l'école va désactiver le compte
#   comptable — seul lui aura accès à ça — sauf à la réouverture, ensuite il
#   réactive pour la nouvelle année. »
#
# Cette étape ne se contente pas de poser un statut en base : elle rejoue la
# séquence par l'API, avec de vrais jetons, et vérifie à chaque geste que la
# porte est bien fermée puis bien rouverte. Un statut qui n'empêche pas de se
# connecter n'est pas une clôture, c'est un libellé.
# ═══════════════════════════════════════════════════════════════════════════


def etape_17_cloture(db: Session) -> None:
    """Arrêter les comptes, fermer l'accès, puis rouvrir."""
    from fastapi.testclient import TestClient

    from main import app

    _titre(17, "Cloture de l'annee : fermer puis rouvrir")
    etab = _ecole(db)
    eid = etab.etablissement_id
    client = TestClient(app)

    def _jeton(identifiant: str, mot_de_passe: str):
        r = client.post("/api/auth/login",
                        json={"identifiant": identifiant, "mot_de_passe": mot_de_passe})
        return r

    admin = db.execute(text("""
        SELECT utilisateur_id, nom_utilisateur, email, prenom, nom FROM ss_utilisateurs
        WHERE etablissement_id = :eid AND role = 'ADMIN' AND statut = 'ACTIF' LIMIT 1
    """), {"eid": eid}).first()
    comptables = db.execute(text("""
        SELECT utilisateur_id, nom_utilisateur, prenom, nom, statut FROM ss_utilisateurs
        WHERE etablissement_id = :eid AND role = 'COMPTABLE' ORDER BY utilisateur_id
    """), {"eid": eid}).fetchall()
    if not admin or not comptables:
        print("  il faut un admin et au moins un comptable — etape 12 d'abord.")
        return

    # ── 1. L'ÉTAT DES COMPTES AVANT DE FERMER ────────────────────────────
    # On ne clôture pas une année dont les comptes ne sont pas arrêtés.
    bilan = db.execute(text("""
        SELECT
          (SELECT count(*) FROM ss_factures f
             JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
             JOIN ss_classes cl ON cl.classe_id = i.classe_id
            WHERE cl.etablissement_id = :eid
              AND f.montant_total - COALESCE(f.montant_paye, 0) > 0) AS factures_dues,
          (SELECT COALESCE(sum(f.montant_total - COALESCE(f.montant_paye, 0)), 0)
             FROM ss_factures f
             JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
             JOIN ss_classes cl ON cl.classe_id = i.classe_id
            WHERE cl.etablissement_id = :eid
              AND f.montant_total - COALESCE(f.montant_paye, 0) > 0) AS reste_du,
          (SELECT count(*) FROM ss_bulletins_paie bp
             JOIN ss_employes e ON e.employe_id = bp.employe_id
            WHERE e.etablissement_id = :eid) AS bulletins_de_paie,
          (SELECT count(*) FROM ss_emprunts em
             JOIN ss_exemplaires ex ON ex.exemplaire_id = em.exemplaire_id
             JOIN ss_ouvrages o ON o.ouvrage_id = ex.ouvrage_id
            WHERE o.etablissement_id = :eid AND em.date_retour_effective IS NULL) AS livres_dehors
    """), {"eid": eid}).first()

    print("  Ce que la direction a sous les yeux avant de fermer :")
    print(f"     scolarite non recouvree : {bilan.factures_dues} facture(s), "
          f"{float(bilan.reste_du):,.0f} GNF".replace(",", " "))
    print(f"     bulletins de paie emis  : {bilan.bulletins_de_paie}")
    print(f"     livres non rendus       : {bilan.livres_dehors}")

    # ── 2. QUI PEUT FERMER LE COMPTE COMPTABLE ───────────────────────────
    identifiant_admin = admin.email or admin.nom_utilisateur
    r = _jeton(identifiant_admin, MOT_DE_PASSE_ADMIN)
    if r.status_code != 200:
        print(f"  [!] connexion admin refusee ({r.status_code}) — verifiez le mot de passe.")
        return
    entete_admin = {"Authorization": f"Bearer {r.json()['token']}"}

    cible = comptables[0]
    r = _jeton(cible.nom_utilisateur, MOT_DE_PASSE_PERSONNEL)
    comptable_entrait = r.status_code == 200
    entete_comptable = ({"Authorization": f"Bearer {r.json()['token']}"}
                        if comptable_entrait else None)
    print(f"\n  Avant cloture, {cible.prenom} {cible.nom} se connecte : "
          f"{'oui' if comptable_entrait else 'NON'}")

    # Le comptable ne doit pas pouvoir se fermer ni se rouvrir lui-même :
    # c'est le geste de la direction, et de personne d'autre.
    if entete_comptable:
        r = client.patch(f"/api/personnel/{cible.utilisateur_id}/statut?statut=INACTIF",
                         headers=entete_comptable)
        print(f"  Le comptable ferme lui-meme son compte  : {r.status_code} "
              f"({'refuse' if r.status_code in (401, 403) else 'ACCEPTE — anomalie'})")

    # ── 3. LA DIRECTION FERME ────────────────────────────────────────────
    r = client.patch(f"/api/personnel/{cible.utilisateur_id}/statut?statut=INACTIF",
                     headers=entete_admin)
    print(f"  La direction ferme le compte             : {r.status_code} "
          f"— {r.json().get('message', r.json().get('detail'))}")

    r = _jeton(cible.nom_utilisateur, MOT_DE_PASSE_PERSONNEL)
    print(f"  Apres cloture, il se connecte            : "
          f"{'OUI — LA PORTE EST RESTEE OUVERTE' if r.status_code == 200 else 'non'}")

    # ── 4. LA RÉOUVERTURE ────────────────────────────────────────────────
    r = client.patch(f"/api/personnel/{cible.utilisateur_id}/statut?statut=ACTIF",
                     headers=entete_admin)
    print(f"\n  A la reouverture, la direction rouvre    : {r.status_code}")
    r = _jeton(cible.nom_utilisateur, MOT_DE_PASSE_PERSONNEL)
    print(f"  Il se reconnecte                         : "
          f"{'oui' if r.status_code == 200 else 'NON — le compte est reste ferme'}")

    # ── 5. CE QU'ON NE DOIT JAMAIS POUVOIR FERMER ────────────────────────
    r = client.patch(f"/api/personnel/{admin.utilisateur_id}/statut?statut=INACTIF",
                     headers=entete_admin)
    print(f"\n  L'admin ferme son propre compte          : {r.status_code} "
          f"— {r.json().get('detail', r.json().get('message'))}")

    db.expire_all()
    etat = db.execute(text("""
        SELECT prenom, nom, role, statut FROM ss_utilisateurs
        WHERE etablissement_id = :eid AND role IN ('ADMIN', 'COMPTABLE')
        ORDER BY role, utilisateur_id
    """), {"eid": eid}).fetchall()
    print(f"\n  {'PERSONNE':<28}{'ROLE':<14}{'STATUT'}")
    for p in etat:
        print(f"  {p.prenom + ' ' + p.nom:<28}{p.role:<14}{p.statut}")


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
    10: ("Notes de l'annee et centralisation des epreuves", etape_10_notes),
    11: ("Bulletins de periode et bulletins annuels", etape_11_bulletins),
    12: ("Personnel non enseignant : comptes, espaces et salaires", etape_12_personnel),
    13: ("Paie mensuelle d'octobre a juin", etape_13_paie),
    14: ("Examens nationaux, admis et redoublants", etape_14_examens_nationaux),
    15: ("Communications : relances et echanges parents/instituteurs", etape_15_communications),
    16: ("Les espaces : bibliotheque, informatique, surveillance, presences", etape_16_espaces),
    17: ("Cloture de l'annee : fermer le compte comptable, puis rouvrir", etape_17_cloture),
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
