"""
SMARTSCHOOL — Modèles SQLAlchemy complets
Couvre TOUTES les tables du système : Structure, Académique, Évaluations, Finance, Vie Scolaire
Vérifiés contre le DDL Oracle original.
"""
from sqlalchemy import (
    Column, Integer, String, Date, Float, ForeignKey, DateTime, Text, Numeric, CheckConstraint, Time, JSON, Index,
    UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


# ============================================================================
# UTILISATEURS ADMIN DU SYSTÈME ET PERSONNEL
# ============================================================================

class Utilisateur(Base):
    """Compte administrateur du système et personnel non-enseignant."""
    __tablename__ = "ss_utilisateurs"
    utilisateur_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=True)
    # Facultatifs : un gardien, un agent d'entretien ou un chauffeur n'a aucun
    # écran à consulter, mais il doit exister en base — il faut le payer.
    # L'absence de mot de passe signifie exactement ce qu'elle dit : pas
    # d'accès. Voir app/core/security.py::verify_password, qui n'accepte plus
    # de passe-partout, et la migration 2026_08_personnel_01_compte_facultatif.
    nom_utilisateur = Column(String(100), unique=True, nullable=True, index=True)
    mot_de_passe = Column(String(255), nullable=True)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(150), nullable=False)
    email = Column(String(150))
    telephone = Column(String(20))
    role = Column(String(30), default="ADMIN", nullable=False)  # SUPER_ADMIN, ADMIN, OPERATEUR, etc.
    statut = Column(String(20), default="ACTIF", nullable=False)
    
    # Nouveaux champs Personnel RH
    sexe = Column(String(10), default="M")
    roles_secondaires = Column(JSON, nullable=True)
    photo_url = Column(String(500), nullable=True)
    type_contrat = Column(String(50), default="PERMANENT")
    date_embauche = Column(Date, nullable=True)
    salaire_base = Column(Numeric(10, 2), default=0)
    taux_horaire = Column(Numeric(10, 2), default=0)
    prime_mensuelle = Column(Numeric(10, 2), default=0)
    heures_hebdo = Column(Integer, default=0)
    rib = Column(String(100), nullable=True)
    mode_paiement_salaire = Column(String(50), default="ESPECES")
    date_naissance = Column(Date, nullable=True)
    lieu_naissance = Column(String(100), nullable=True)
    adresse = Column(String(255), nullable=True)
    numero_cni = Column(String(50), nullable=True)
    # Le directeur général voit-il la comptabilité ? Le fondateur tranche à la
    # création. « O » par défaut : les comptes existants gardent leur accès, et
    # ce réglage ne concerne que le DG (les autres rôles finance ne le lisent
    # jamais). Voir main.py::exige_acces_finance.
    acces_comptabilite = Column(String(1), default="O")
    created_date = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_utilisateurs_etablissement", 'etablissement_id'),
    )


# ============================================================================
# MODULE 1 : STRUCTURE INSTITUTIONNELLE
# ============================================================================

class Etablissement(Base):
    __tablename__ = "ss_etablissements"
    etablissement_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    nom = Column(String(200), nullable=False)
    type_etablissement = Column(String(30), nullable=False)
    statut = Column(String(20), default="ACTIF", nullable=False)
    adresse = Column(String(500))
    ville = Column(String(100))
    region = Column(String(100))
    prefecture = Column(String(100))
    telephone = Column(String(20))
    email = Column(String(150))
    directeur = Column(String(200))
    logo_url = Column(String(500))
    favicon_url = Column(String(500), nullable=True)
    cachet_url = Column(String(500), nullable=True)
    signature_url = Column(String(500), nullable=True)
    slogan = Column(String(255), nullable=True)
    capacite_max = Column(Integer, default=0)
    created_by = Column(String(100))
    created_date = Column(DateTime, server_default=func.now())

    eleves = relationship("Eleve", back_populates="etablissement")
    enseignants = relationship("Enseignant", back_populates="etablissement")
    classes = relationship("Classe", back_populates="etablissement")
    annees = relationship("AnneeScolaire", back_populates="etablissement")
    cycles = relationship("Cycle", back_populates="etablissement")


class AnneeScolaire(Base):
    """Entité racine du cycle de vie d'une année scolaire — unifie ce qui était
    avant séparé entre AnneeScolaire (pédagogique) et ExerciceComptable
    (comptable, retiré : jamais réellement relié à Facture/Paiement). Cycle de
    `statut` : PLANIFIEE (future, pas encore commencée) -> EN_COURS (active) ->
    CLOTURE_COMPTABLE (comptabilité verrouillée en lecture seule, voir
    app/api/annee_scolaire.py) -> ARCHIVEE (Phase 2 : archivage complet).
    """
    __tablename__ = "ss_annees_scolaires"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_annees_etab_courante", 'etablissement_id', 'est_courante'),
    )
    annee_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(100), nullable=False)
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=False)
    statut = Column(String(20), default="PLANIFIEE", nullable=False)
    date_cloture_comptable = Column(Date, nullable=True)
    est_courante = Column(String(1), default="N", nullable=False)
    created_by = Column(String(100))
    created_date = Column(DateTime, server_default=func.now())

    etablissement = relationship("Etablissement", back_populates="annees")
    trimestres = relationship("Trimestre", back_populates="annee")


class ParametreEtablissement(Base):
    """Table clé/valeur pour tous les paramètres de l'établissement."""
    __tablename__ = "ss_parametres"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_parametres_etab_categorie_cle", 'etablissement_id', 'categorie', 'cle'),
    )
    parametre_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    categorie = Column(String(50), nullable=False)  # IDENTITE, THEME, NOTATION, FINANCE
    cle = Column(String(100), nullable=False)
    valeur = Column(Text, nullable=False)
    type_valeur = Column(String(20), default="TEXT") # TEXT, JSON, BOOLEAN, NUMBER, COLOR, URL
    
    etablissement = relationship("Etablissement")


class Trimestre(Base):
    __tablename__ = "ss_trimestres"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_trimestres_annee_numero", 'annee_id', 'numero'),
    )
    trimestre_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    code = Column(String(10), nullable=False)
    libelle = Column(String(100), nullable=False)
    numero = Column(Integer, nullable=False)
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=False)
    statut = Column(String(20), default="PLANIFIE", nullable=False)

    annee = relationship("AnneeScolaire", back_populates="trimestres")


class Cycle(Base):
    __tablename__ = "ss_cycles"
    cycle_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(100), nullable=False)
    ordre = Column(Integer, nullable=False)
    duree_annees = Column(Integer)

    etablissement = relationship("Etablissement", back_populates="cycles")
    niveaux = relationship("Niveau", back_populates="cycle")


class Niveau(Base):
    __tablename__ = "ss_niveaux"
    niveau_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cycle_id = Column(Integer, ForeignKey("ss_cycles.cycle_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(100), nullable=False)
    ordre = Column(Integer, nullable=False)
    est_examen = Column(String(1), default="N")
    examen_national = Column(String(30))

    cycle = relationship("Cycle", back_populates="niveaux")


class Salle(Base):
    __tablename__ = "ss_salles"
    salle_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(20), nullable=False)
    nom = Column(String(100), nullable=False)
    capacite = Column(Integer, default=0)
    type_salle = Column(String(30), default="CLASSE")
    disponible = Column(String(1), default="O")


class EquipementInformatique(Base):
    """Inventaire du matériel informatique suivi par le responsable IT."""
    __tablename__ = "ss_equipements_informatiques"
    equipement_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    salle_id = Column(Integer, ForeignKey("ss_salles.salle_id"), nullable=True)
    code = Column(String(50), nullable=False, index=True)
    nom = Column(String(150), nullable=False)
    type_equipement = Column(String(50), default="ORDINATEUR")
    marque = Column(String(100), nullable=True)
    modele = Column(String(100), nullable=True)
    numero_serie = Column(String(120), nullable=True)
    etat = Column(String(30), default="BON")
    statut = Column(String(30), default="ACTIF")
    derniere_maintenance = Column(Date, nullable=True)
    observation = Column(Text, nullable=True)
    created_by = Column(String(100), nullable=True)
    created_date = Column(DateTime, server_default=func.now())


class TicketInformatique(Base):
    """Signalement et suivi des pannes informatiques."""
    __tablename__ = "ss_tickets_informatiques"
    ticket_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    equipement_id = Column(Integer, ForeignKey("ss_equipements_informatiques.equipement_id"), nullable=True)
    titre = Column(String(180), nullable=False)
    description = Column(Text, nullable=False)
    priorite = Column(String(20), default="NORMALE")
    statut = Column(String(30), default="OUVERT")
    signale_par = Column(String(120), nullable=True)
    assigne_a = Column(String(120), nullable=True)
    resolution = Column(Text, nullable=True)
    date_signalement = Column(DateTime, server_default=func.now())
    date_resolution = Column(DateTime, nullable=True)


class Classe(Base):
    __tablename__ = "ss_classes"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_classes_etab_annee_statut", 'etablissement_id', 'annee_id', 'statut'),
    )
    classe_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    niveau_id = Column(Integer, ForeignKey("ss_niveaux.niveau_id"), nullable=False)
    salle_id = Column(Integer, ForeignKey("ss_salles.salle_id"))
    code = Column(String(30), nullable=False)
    libelle = Column(String(150), nullable=False)
    capacite_max = Column(Integer, default=50)
    effectif_actuel = Column(Integer, default=0)
    professeur_principal = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"))
    statut = Column(String(20), default="ACTIVE", nullable=False)

    etablissement = relationship("Etablissement", back_populates="classes")
    # foreign_keys explicite : Inscription a DEUX FK vers Classe depuis la Phase 2
    # (classe_id = inscription réelle, classe_cible_id = proposition de promotion
    # non encore matérialisée) — sans ça, SQLAlchemy ne peut plus déterminer quelle
    # colonne utiliser pour cette relation (AmbiguousForeignKeysError).
    inscriptions = relationship("Inscription", back_populates="classe", foreign_keys="Inscription.classe_id")
    prof_principal = relationship("Enseignant", foreign_keys=[professeur_principal])


# ============================================================================
# MODULE 2 : GESTION ACADÉMIQUE
# ============================================================================

class Eleve(Base):
    __tablename__ = "ss_eleves"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_eleves_etablissement", 'etablissement_id'),
    )
    eleve_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    matricule = Column(String(30), unique=True, nullable=False, index=True)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(150), nullable=False)
    date_naissance = Column(Date, nullable=False)
    lieu_naissance = Column(String(150))
    sexe = Column(String(1), nullable=False)
    nationalite = Column(String(50), default="Guinéenne")
    adresse = Column(String(500))
    quartier = Column(String(100))
    ville = Column(String(100))
    telephone = Column(String(20))
    email = Column(String(150))
    groupe_sanguin = Column(String(5))
    allergies = Column(String(500))
    contact_urgence_nom = Column(String(200))
    contact_urgence_tel = Column(String(20))
    photo_url = Column(String(500))
    mot_de_passe = Column(String(255))  # MDP portail élève (défaut: smartschool si NULL)
    statut = Column(String(20), default="ACTIF", nullable=False)
    created_by = Column(String(100))
    created_date = Column(DateTime, server_default=func.now())
    modified_by = Column(String(100))
    # onupdate=func.now() : ajouté pour la synchro delta (Étape C,
    # backend/app/api/eleves.py GET /delta) — même pattern que Note/Presence
    # (updated_at, ajouté pour sync.py Phase 1). Les lignes déjà en base ont
    # modified_date=NULL, backfillées par backend/migrations/add_sync_tracking.py.
    modified_date = Column(DateTime, onupdate=func.now())

    etablissement = relationship("Etablissement", back_populates="eleves")
    inscriptions = relationship("Inscription", back_populates="eleve")
    parents = relationship("EleveParent", back_populates="eleve")


class Parent(Base):
    """Parent d'élève, rattaché à UNE école.

    Un parent dont les enfants sont scolarisés dans plusieurs établissements a
    une fiche PAR école : c'est le code de l'établissement, saisi au login, qui
    dit laquelle. Un compte unique supposerait un endroit central où les écoles
    se croisent — exactement ce que le chantier multi-écoles a supprimé.

    Son téléphone et son e-mail sont donc uniques PAR ÉCOLE et non globalement
    (index uq_parents_etab_*, migration 2026_08_multi_01).
    """
    __tablename__ = "ss_parents"
    parent_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(150), nullable=False)
    sexe = Column(String(1))
    telephone_1 = Column(String(20), nullable=False)
    telephone_2 = Column(String(20))
    email = Column(String(150))
    profession = Column(String(150))
    adresse = Column(String(500))
    quartier = Column(String(100))
    statut = Column(String(20), default="ACTIF")
    mot_de_passe = Column(String(255))
    photo_url = Column(String(500), nullable=True)

    enfants = relationship("EleveParent", back_populates="parent")


class EleveParent(Base):
    __tablename__ = "ss_eleve_parent"
    eleve_parent_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("ss_parents.parent_id"), nullable=False)
    lien_parente = Column(String(30), nullable=False)
    est_contact_principal = Column(String(1), default="N")
    est_responsable_financier = Column(String(1), default="N")

    eleve = relationship("Eleve", back_populates="parents")
    parent = relationship("Parent", back_populates="enfants")


class Enseignant(Base):
    """Un enseignant peut exercer dans PLUSIEURS établissements : il a alors une
    fiche par école, avec le même téléphone et le même e-mail. Leur unicité est
    donc PAR ÉTABLISSEMENT — voir `app/core/identifiants.py` (`par_ecole=True`)
    et la migration `2026_08_multi_01_parents_enseignants_multi_ecoles.py`.

    Le `matricule`, lui, reste unique GLOBALEMENT : il est généré au format
    `ENS-{etablissement_id}-{n}` (`app/core/matricules.py`), donc déjà distinct
    d'une école à l'autre par construction. Le contraindre par école
    n'ajouterait rien.
    """
    __tablename__ = "ss_enseignants"
    enseignant_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    matricule = Column(String(30), unique=True, nullable=False, index=True)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(150), nullable=False)
    date_naissance = Column(Date)
    sexe = Column(String(1), nullable=False)
    telephone = Column(String(20), nullable=False)
    email = Column(String(150))
    specialite = Column(String(200))
    diplome_plus_eleve = Column(String(100))
    type_contrat = Column(String(30), default="PERMANENT")
    date_embauche = Column(Date)
    statut = Column(String(20), default="ACTIF", nullable=False)
    mot_de_passe = Column(String(255))
    photo_url = Column(String(500), nullable=True)
    
    # Nouveaux champs RH et Contrat
    salaire_base = Column(Numeric(10, 2), default=0)
    taux_horaire = Column(Numeric(10, 2), default=0)
    # MENSUEL (primaire : salaire fixe) ou HORAIRE (college et lycee :
    # paye a l'heure). Porte par l'enseignant et non deduit de ses classes :
    # un instituteur peut assurer une heure au college sans changer de contrat.
    mode_remuneration = Column(String(20), default="HORAIRE", nullable=False)
    prime_mensuelle = Column(Numeric(10, 2), default=0)
    heures_hebdo = Column(Integer, default=0)
    rib = Column(String(100), nullable=True)
    mode_paiement_salaire = Column(String(50), default="ESPECES")
    lieu_naissance = Column(String(100), nullable=True)
    adresse = Column(String(255), nullable=True)
    numero_cni = Column(String(50), nullable=True)
    
    est_admin = Column(String(1), default="N", nullable=False)  # O = admin, N = enseignant simple
    created_by = Column(String(100))
    created_date = Column(DateTime, server_default=func.now())
    modified_by = Column(String(100))
    modified_date = Column(DateTime)

    etablissement = relationship("Etablissement", back_populates="enseignants")
    affectations = relationship("Affectation", back_populates="enseignant")

    __table_args__ = (
        Index("ix_enseignants_etab_statut", 'etablissement_id', 'statut'),
    )


class Matiere(Base):
    __tablename__ = "ss_matieres"
    matiere_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cycle_id = Column(Integer, ForeignKey("ss_cycles.cycle_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(150), nullable=False)
    coefficient_defaut = Column(Numeric(3, 1), default=1, nullable=False)
    categorie = Column(String(50))
    est_obligatoire = Column(String(1), default="O")
    note_sur = Column(Numeric(5, 2), default=20)
    nb_heures_semaine = Column(Integer, default=2)


class ClasseMatiere(Base):
    """Association entre une Classe et ses Matières enseignées (programme guinéen)"""
    __tablename__ = "ss_classe_matieres"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_classe_matieres_classe_active", 'classe_id', 'est_active'),
        Index("ix_classe_matieres_matiere", 'matiere_id'),
    )
    classe_matiere_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    coefficient = Column(Numeric(3, 1), default=1, nullable=False)
    nb_heures_semaine = Column(Integer, default=2)
    est_active = Column(String(1), default="O")
    # NULL = pas de surcharge ; cascade complète dans services/notation.py
    note_sur = Column(Numeric(5, 2), nullable=True)


class CreneauEmploi(Base):
    """Créneau horaire dans l'emploi du temps d'une classe"""
    __tablename__ = "ss_creneaux_emploi"
    creneau_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=True)
    # Un des sept jours. Les jours REELLEMENT ouverts sont propres a chaque
    # ecole (Parametres > Emploi du temps) : cf. `_jours_ouvres` dans
    # app/api/emploi_du_temps.py.
    jour = Column(String(10), nullable=False)
    heure_debut = Column(String(5), nullable=False)  # "08:00"
    heure_fin = Column(String(5), nullable=False)    # "09:00"
    salle = Column(String(50))
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), default=1)
    statut = Column(String(20), default="ACTIVE")


class Affectation(Base):
    __tablename__ = "ss_affectations"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_affectations_enseignant_statut", 'enseignant_id', 'statut'),
        Index("ix_affectations_classe_matiere_statut", 'classe_id', 'matiere_id', 'statut'),
        Index("ix_affectations_annee_statut", 'annee_id', 'statut'),
    )
    affectation_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    nb_heures_semaine = Column(Numeric(3, 1), default=0)
    # EXCEPTION de tarif pour cette affectation precise. Nullable : le taux
    # de l'enseignant s'applique partout, on ne renseigne ici que la ou il
    # differe (une heure de Terminale ne se paie pas comme une heure de 7e).
    # Meme schema que coefficient_override sur les evaluations.
    taux_horaire = Column(Numeric(10, 2), nullable=True)
    est_principal = Column(String(1), default="O")
    statut = Column(String(20), default="ACTIVE")

    enseignant = relationship("Enseignant", back_populates="affectations")


class Seance(Base):
    """Séance de cours : classe + matière + enseignant + date + créneau,
    ancre de l'appel pédagogique. Distincte de PresenceAgent (badge
    physique) — un enseignant peut être PRESENT au badge et en retard sur
    SA séance : deux faits jamais fusionnés. OWNERSHIP via Classe, même
    convention que CreneauEmploi/Affectation/Evaluation (voir
    docs/MULTI_ECOLES_REGLES_DEV.md §5) — pas de colonne etablissement_id
    propre."""
    __tablename__ = "ss_seances"
    seance_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    creneau_id = Column(Integer, ForeignKey("ss_creneaux_emploi.creneau_id"), nullable=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    # Enseignant PRÉVU (snapshot à la génération depuis le créneau, jamais
    # réécrit après coup) vs RÉEL (posé à "Commencer" ; diffère du prévu
    # seulement si un remplaçant a été affecté via PUT /remplacer).
    enseignant_prevu_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    enseignant_reel_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=True)
    date_seance = Column(Date, nullable=False)
    heure_debut_prevue = Column(String(5), nullable=False)  # "08:00"
    heure_fin_prevue = Column(String(5), nullable=False)
    heure_debut_reelle = Column(DateTime, nullable=True)
    heure_fin_reelle = Column(DateTime, nullable=True)
    salle = Column(String(50), nullable=True)
    statut = Column(String(20), default="PREVUE", nullable=False)
    # PREVUE, EN_COURS, EFFECTUEE, ANNULEE, REPORTEE, REMPLACEE, NON_EFFECTUEE
    motif_statut = Column(String(300), nullable=True)
    # Dénormalisé à "Terminer" (recalculé depuis Presence.seance_id) pour que
    # l'historique et le dashboard admin n'aient pas à recompter à l'affichage.
    appel_fait = Column(String(1), default="N", nullable=False)
    appel_fait_le = Column(DateTime, nullable=True)
    nb_presents = Column(Integer, nullable=True)
    nb_absents = Column(Integer, nullable=True)
    nb_retards = Column(Integer, nullable=True)
    created_date = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by = Column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint("creneau_id", "date_seance", name="uq_seance_creneau_date"),
    )


class Inscription(Base):
    __tablename__ = "ss_inscriptions"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_inscriptions_classe_statut", 'classe_id', 'statut'),
        Index("ix_inscriptions_eleve_statut", 'eleve_id', 'statut'),
        Index("ix_inscriptions_annee", 'annee_id'),
    )
    inscription_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    date_inscription = Column(Date, server_default=func.current_date())
    type_inscription = Column(String(30), default="NOUVELLE")
    statut = Column(String(20), default="ACTIVE", nullable=False)
    role_classe = Column(String(20))  # CHEF_1, CHEF_2, CHEF_3 ou NULL
    decision_fin_annee = Column(String(30))  # ADMIS | REDOUBLANT | EXCLU | DIPLOME
    rang_final = Column(Integer)
    moyenne_annuelle = Column(Numeric(5, 2))
    total_points = Column(Numeric(7, 2))

    # Promotion V2 (Phase 2) : la proposition pour l'année suivante vit sur
    # CETTE inscription (celle qui se termine) tant qu'elle n'est pas
    # matérialisée par la réinscription — voir statut_reinscription.
    niveau_cible_id = Column(Integer, ForeignKey("ss_niveaux.niveau_id"), nullable=True)
    classe_cible_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=True)
    statut_promotion = Column(String(20), nullable=True)  # PROPOSE | VALIDE

    # Réinscription V2 (Phase 2) : indépendante de la promotion — ne devient
    # non-NULL qu'après validation de la promotion (A_REINSCRIRE), puis
    # évolue vers REINSCRIT (crée la nouvelle Inscription + les frais, voir
    # app/api/reinscription.py) ou un statut terminal sans suite
    # (NON_REINSCRIT | TRANSFERE | ABANDON).
    statut_reinscription = Column(String(20), nullable=True)

    eleve = relationship("Eleve", back_populates="inscriptions")
    classe = relationship("Classe", back_populates="inscriptions", foreign_keys=[classe_id])


class ResultatOfficielExamen(Base):
    """Résultat officiel du Ministère pour les classes d'examen (Niveau.est_examen='O').

    Pour ces classes (6e/CEE, 10e/BEPC, Terminale/BAC), le passage ne dépend pas
    de la moyenne annuelle interne mais de ce résultat, saisi manuellement une
    fois publié : c'est la seule source de vérité pour leur passage. Table
    distincte de Inscription pour que le recalcul de la proposition interne
    n'écrase jamais la saisie ministérielle.
    """
    __tablename__ = "ss_resultats_officiels_examen"
    resultat_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False, unique=True)
    examen_national = Column(String(30), nullable=True)  # CEE | BEPC | BAC (copié de Niveau)
    resultat = Column(String(20), nullable=False)  # ADMIS | NON_ADMIS
    date_saisie = Column(Date, server_default=func.current_date())
    saisi_par = Column(String(100), nullable=True)
    observation = Column(String(500), nullable=True)


# ============================================================================
# MODULE 3 : ÉVALUATIONS & BULLETINS
# ============================================================================

class TypeEvaluation(Base):
    """Nature d'une épreuve (Composition, Interrogation, Oral…), PAR ÉCOLE.

    Cette table était partagée par toute la plateforme : renommer un type dans
    une école changeait l'intitulé des colonnes de bulletin de toutes les
    autres. Chaque école a désormais sa propre liste, qu'elle nomme et étend
    comme elle l'entend — cf. migration
    2026_08_notation_09_type_evaluation_etablissement.py.

    `code` n'est donc plus unique globalement mais PAR ÉTABLISSEMENT (index
    uq_types_evaluation_etablissement_code) : deux écoles ont chacune leur
    « COMPO ».
    """
    __tablename__ = "ss_types_evaluation"
    type_eval_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(100), nullable=False)
    # Legacy : jamais lu par le moteur de notation, conservé pour compat (cf. MIGRATION_NOTES.md)
    poids_pourcentage = Column(Numeric(5, 2), nullable=True)
    # Coefficient de référence du type. Surchargeable par cycle via
    # ParametreEtablissement (notation.coef_type.{cycle}.{code}) — cf. services/notation.py
    coefficient = Column(Numeric(4, 2), default=1, nullable=False)
    statut = Column(String(20), default="ACTIF")


class EvaluationSession(Base):
    """Regroupe les Evaluation créées en une seule action ("création groupée").

    Une composition couvre normalement toutes les matières d'une classe le même
    jour : la session porte le choix unique "coefficientée ou non" pour tout le
    groupe, au lieu de le répéter matière par matière.
    """
    __tablename__ = "ss_evaluation_sessions"
    session_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    trimestre_id = Column(Integer, ForeignKey("ss_trimestres.trimestre_id"), nullable=False)
    type_eval_id = Column(Integer, ForeignKey("ss_types_evaluation.type_eval_id"), nullable=False)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    libelle = Column(String(200), nullable=False)
    date_evaluation = Column(Date, nullable=False)
    note_sur = Column(Numeric(5, 2), default=20)
    est_coefficientee = Column(String(1), default="O", nullable=False)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=True)
    statut = Column(String(20), default="PLANIFIEE", nullable=False)


class Evaluation(Base):
    __tablename__ = "ss_evaluations"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_evaluations_classe_trimestre_statut", 'classe_id', 'trimestre_id', 'statut'),
        Index("ix_evaluations_enseignant", 'enseignant_id'),
        Index("ix_evaluations_matiere", 'matiere_id'),
        Index("ix_evaluations_type_eval", 'type_eval_id'),
    )
    evaluation_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    trimestre_id = Column(Integer, ForeignKey("ss_trimestres.trimestre_id"), nullable=False)
    type_eval_id = Column(Integer, ForeignKey("ss_types_evaluation.type_eval_id"), nullable=False)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    libelle = Column(String(200), nullable=False)
    date_evaluation = Column(Date, nullable=False)
    note_sur = Column(Numeric(5, 2), default=20)
    coefficient = Column(Numeric(3, 1), default=1)
    statut = Column(String(20), default="PLANIFIEE")
    # NULL pour les évaluations mono-matière (création directe / portail enseignant)
    session_id = Column(Integer, ForeignKey("ss_evaluation_sessions.session_id"), nullable=True)
    # Copié depuis la session : évite de joindre EvaluationSession dans le moteur de calcul
    est_coefficientee = Column(String(1), default="O", nullable=False)
    # NULL = utiliser le coefficient du type ; sinon surcharge ponctuelle
    coefficient_override = Column(Numeric(4, 2), nullable=True)


class PeriodeEpreuve(Base):
    """Quelles épreuves comptent pour le résultat officiel d'une période.

    Le résultat d'une période n'est pas forcément « tout ce qui a été noté » :
    une école peut retenir deux évaluations sans composition, une composition
    seule, ou toute autre combinaison. Cette table trace ce choix pour que le
    calcul reste reproductible et vérifiable après coup.

    Compatibilité ascendante : aucune ligne pour (classe, trimestre) = toutes
    les évaluations centralisées comptent, comme avant l'introduction de cette
    table. Voir `epreuves_retenues_periode()` dans services/notation.py.
    """
    __tablename__ = "ss_periode_epreuves"
    periode_epreuve_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    trimestre_id = Column(Integer, ForeignKey("ss_trimestres.trimestre_id"), nullable=False)
    evaluation_id = Column(Integer, ForeignKey("ss_evaluations.evaluation_id"), nullable=False)
    created_date = Column(DateTime, server_default=func.now())
    created_by = Column(String(100), nullable=True)


class Note(Base):
    __tablename__ = "ss_notes"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_notes_evaluation_inscription", 'evaluation_id', 'inscription_id'),
        Index("ix_notes_inscription", 'inscription_id'),
    )
    note_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    evaluation_id = Column(Integer, ForeignKey("ss_evaluations.evaluation_id"), nullable=False)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    valeur = Column(Numeric(5, 2))
    est_absent = Column(String(1), default="N")
    observation = Column(String(300))
    # Module offline-first (sync.py) : détection de conflit à la resynchronisation
    # (Last-Write-Wins comparé à `base_updated_at` envoyé par le client).
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by = Column(String(100), nullable=True)


class Bulletin(Base):
    __tablename__ = "ss_bulletins"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_bulletins_inscription_type", 'inscription_id', 'type_bulletin'),
    )
    bulletin_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    trimestre_id = Column(Integer, ForeignKey("ss_trimestres.trimestre_id"))
    type_bulletin = Column(String(20), default="TRIMESTRIEL")
    moyenne_generale = Column(Numeric(5, 2))
    rang = Column(Integer)
    effectif_classe = Column(Integer)
    mention = Column(String(30))
    decision = Column(String(200))
    appreciation_generale = Column(String(500))
    statut = Column(String(20), default="BROUILLON")

    lignes = relationship("BulletinLigne", back_populates="bulletin", cascade="all, delete-orphan")


class BulletinLigne(Base):
    __tablename__ = "ss_bulletin_lignes"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_bulletin_lignes_bulletin", 'bulletin_id'),
        Index("ix_bulletin_lignes_matiere", 'matiere_id'),
    )
    ligne_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    bulletin_id = Column(Integer, ForeignKey("ss_bulletins.bulletin_id", ondelete="CASCADE"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    moyenne_matiere = Column(Numeric(5, 2))
    moyenne_classe = Column(Numeric(5, 2))
    note_min = Column(Numeric(5, 2))
    note_max = Column(Numeric(5, 2))
    coefficient = Column(Numeric(3, 1))
    appreciation = Column(String(30))
    observation_prof = Column(String(300))

    bulletin = relationship("Bulletin", back_populates="lignes")


# ============================================================================
# MODULE 4 : FINANCE & PAIEMENTS
# ============================================================================

class TypeFrais(Base):
    """Nature d'un frais (Scolarité, Inscription, Cantine…), PAR ÉCOLE.

    Cette table était partagée par toute la plateforme : une école renommant
    « Scolarité » changeait l'intitulé sur les factures et les reçus de toutes
    les autres — et pouvait supprimer un type qu'une voisine utilisait. Voir
    migration 2026_08_compta_01_types_frais_etablissement.py.

    `code` n'est donc plus unique globalement mais PAR ÉTABLISSEMENT
    (uq_types_frais_etab_code) : deux écoles ont chacune leur « SCOL ».
    """
    __tablename__ = "ss_types_frais"
    type_frais_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(150), nullable=False)
    categorie = Column(String(50), nullable=False)
    montant_defaut = Column(Numeric(12, 2), default=0) # Nouveau champ
    est_obligatoire = Column(String(1), default="O")
    frequence = Column(String(20), default="ANNUEL")
    statut = Column(String(20), default="ACTIF")
    # Tarif LIBRE (optionnel, à prix non fixe) : un livre, un équipement, une
    # sortie… « O » = jamais facturé d'office ni rattaché à une classe ; il se
    # vend au coup par coup à un élève, au prix saisi sur le moment, et entre
    # directement en caisse (voir POST /api/finance/vente-libre). Séparé des
    # frais de scolarité dans les rapports (total « autres entrées »).
    prix_libre = Column(String(1), nullable=False, default="N")


class TarifClasse(Base):
    """
    Montant d'un type de frais pour une classe précise (une école n'a pas la même
    scolarité en maternelle qu'en terminale). Table pivot éditable indifféremment
    depuis la page Comptabilité (par type de frais, toutes les classes) ou depuis la
    fiche de configuration d'une classe (par classe, tous les types de frais) — les
    deux écrans lisent/écrivent la même table, donc restent automatiquement synchronisés.
    """
    __tablename__ = "ss_tarifs_classe"
    tarif_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type_frais_id = Column(Integer, ForeignKey("ss_types_frais.type_frais_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    montant = Column(Numeric(12, 2), nullable=False)


class Facture(Base):
    __tablename__ = "ss_factures"
    facture_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    type_frais_id = Column(Integer, ForeignKey("ss_types_frais.type_frais_id"), nullable=True)
    # Dénormalisé depuis Inscription.annee_id — avant, la seule façon de savoir
    # à quelle année une facture appartient était de remonter par la jointure
    # Inscription, ce qui rendait le verrouillage par année (clôture comptable)
    # coûteux à vérifier. Nullable : backfillé pour les lignes existantes par
    # script de migration, jamais recalculé après coup.
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=True)
    numero_facture = Column(String(30), unique=True, nullable=False)
    date_facture = Column(Date, server_default=func.current_date())
    montant_total = Column(Numeric(12, 2), default=0, nullable=False)
    montant_remise = Column(Numeric(12, 2), default=0)
    montant_net = Column(Numeric(12, 2), default=0, nullable=False)
    montant_paye = Column(Numeric(12, 2), default=0, nullable=False)
    montant_restant = Column(Numeric(12, 2), default=0, nullable=False)
    statut = Column(String(20), default="EN_ATTENTE", nullable=False)
    # Désignation libre — sert aux ventes de tarifs libres (« 3 cahiers + 1 règle »)
    # pour savoir ce qui a réellement été acheté. NULL pour les factures normales.
    description = Column(String(255), nullable=True)

    echeances = relationship("EcheanceFacture", backref="facture", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_factures_inscription", 'inscription_id'),
        Index("ix_factures_annee_statut", 'annee_id', 'statut'),
    )


class EcheanceFacture(Base):
    __tablename__ = "ss_echeances_factures"
    echeance_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    facture_id = Column(Integer, ForeignKey("ss_factures.facture_id"), nullable=False)
    libelle = Column(String(100), nullable=False)
    date_limite = Column(Date, nullable=False)
    montant_attendu = Column(Numeric(12, 2), nullable=False)
    montant_paye = Column(Numeric(12, 2), default=0)
    statut = Column(String(20), default="EN_ATTENTE") # EN_ATTENTE, PARTIELLEMENT_PAYEE, PAYEE, EN_RETARD

    __table_args__ = (
        Index("ix_echeances_facture_statut", 'facture_id', 'statut'),
        Index("ix_echeances_statut_date_limite", 'statut', 'date_limite'),
    )


class Paiement(Base):
    __tablename__ = "ss_paiements"
    paiement_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    facture_id = Column(Integer, ForeignKey("ss_factures.facture_id"), nullable=False)
    # Dénormalisé depuis Facture.annee_id — même raison que Facture.annee_id.
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=True)
    echeance_id = Column(Integer, ForeignKey("ss_echeances_factures.echeance_id"), nullable=True)
    numero_recu = Column(String(30), unique=True, nullable=False)
    date_paiement = Column(Date, server_default=func.current_date())
    montant = Column(Numeric(12, 2), nullable=False)
    devise = Column(String(5), default="GNF")
    mode_paiement = Column(String(30), nullable=False)
    reference_externe = Column(String(100))
    statut = Column(String(20), default="VALIDE")
    motif_annulation = Column(String(500), nullable=True)
    created_by = Column(String(100))
    created_date = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_paiements_facture", 'facture_id'),
        Index("ix_paiements_annee_date", 'annee_id', 'date_paiement'),
    )


class Depense(Base):
    __tablename__ = "ss_depenses"
    depense_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    categorie = Column(String(50), nullable=False)
    libelle = Column(String(300), nullable=False)
    montant = Column(Numeric(12, 2), nullable=False)
    date_depense = Column(Date, server_default=func.current_date())
    fournisseur = Column(String(200))
    reference = Column(String(150), nullable=True)
    statut = Column(String(20), default="EN_ATTENTE")
    mode_paiement = Column(String(30), nullable=True)
    facture_url = Column(String(500), nullable=True)
    source_fonds = Column(String(30), nullable=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=True)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=True)
    departement = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_depenses_etab_annee", 'etablissement_id', 'annee_id'),
    )


# ============================================================================
# MODULE 5 : VIE SCOLAIRE
# ============================================================================

class Presence(Base):
    __tablename__ = "ss_presences"
    presence_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    date_presence = Column(Date, nullable=False)
    demi_journee = Column(String(10), nullable=False)
    statut_presence = Column(String(20), nullable=False)
    est_justifie = Column(String(1), default="N")
    motif = Column(String(300))
    # Séance pédagogique (matière + enseignant) dont cette présence relève —
    # NULL = ligne historique/legacy (appel de classe, saisie admin en
    # masse, sync offline) : jamais backfillée, jamais de matière inventée.
    seance_id = Column(Integer, ForeignKey("ss_seances.seance_id"), nullable=True)
    # Module offline-first (sync.py) : détection de conflit à la resynchronisation
    # (Last-Write-Wins comparé à `base_updated_at` envoyé par le client).
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_presences_inscription_date", 'inscription_id', 'date_presence'),
    )


class Incident(Base):
    __tablename__ = "ss_incidents"
    incident_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=False)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    date_incident = Column(Date, server_default=func.current_date())
    type_incident = Column(String(50), nullable=False)
    gravite = Column(String(20), nullable=False)
    description = Column(Text, nullable=False)
    signale_par = Column(String(100), nullable=False)
    statut = Column(String(20), default="SIGNALE")

    __table_args__ = (
        Index("ix_incidents_etablissement", 'etablissement_id'),
        Index("ix_incidents_eleve", 'eleve_id'),
    )


# ============================================================================
# MODULE : COMMUNICATION & EMPLOI DU TEMPS INTELLIGENT
# ============================================================================

class DemandeEmploi(Base):
    """Demande de l'admin aux enseignants pour collecter les disponibilités.

    `etablissement_id` ajouté au Lot 5 du chantier multi-écoles — avant,
    cette table n'avait aucune colonne établissement (classée "À DÉCIDER").
    NOT NULL car ajoutée sur une table vide (vérifié réellement sur
    Supabase avant migration, voir migrations/lot5_communication_etablissement.py)."""
    __tablename__ = "ss_demandes_emploi"
    demande_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    titre = Column(String(200), nullable=False)
    description = Column(Text)
    objet_type = Column(String(30), default="EMPLOI")  # EMPLOI, REUNION, GENERAL...
    classes_concernees = Column(Text)  # JSON array of classe_ids, or "TOUTES"
    statut = Column(String(30), default="EN_COURS")  # EN_COURS, CLOTUREE, EMPLOIS_GENERES, PUBLIEE
    trimestre = Column(Integer, nullable=True)  # 1, 2, 3 pour le système guinéen
    # DE QUELLE ÉPREUVE PARLE-T-ON
    # Une année ne contient pas que des compositions : à TrillionX, quatre
    # évaluations et trois compositions. « Déposez vos sujets pour le 1er
    # Semestre » reçu deux fois en deux mois ne dit pas s'il s'agit de la même
    # épreuve. Nullable : une campagne peut viser toute la période.
    # Voir migrations/2026_08_examens_01_type_epreuve.py
    type_eval_id = Column(Integer, ForeignKey("ss_types_evaluation.type_eval_id"), nullable=True)
    # « avant le 7 novembre » : sans échéance, une relance ne s'appuie sur rien.
    date_limite = Column(Date, nullable=True)
    date_creation = Column(DateTime, server_default=func.now())
    date_cloture = Column(DateTime, nullable=True)


class Message(Base):
    """Messages de communication entre Admin, Enseignants et Parents.

    `etablissement_id` ajouté au Lot 5 du chantier multi-écoles — avant,
    cette table n'avait aucune colonne établissement (classée "À DÉCIDER") :
    un message "TOUS_ENSEIGNANTS"/"TOUS_PARENTS" partait vers TOUTE la
    plateforme, pas seulement l'école concernée. NOT NULL car ajoutée sur
    une table vide (vérifié réellement sur Supabase avant migration)."""
    __tablename__ = "ss_messages"
    message_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    demande_id = Column(Integer, ForeignKey("ss_demandes_emploi.demande_id"), nullable=True)
    expediteur_type = Column(String(20), nullable=False)  # ADMIN, ENSEIGNANT, PARENT
    expediteur_id = Column(Integer, nullable=True)  # enseignant_id or parent_id
    destinataire_type = Column(String(30), nullable=False)  # ADMIN, ENSEIGNANT, TOUS_ENSEIGNANTS, PARENT, TOUS_PARENTS, CLASSE_PARENTS
    destinataire_id = Column(Integer, nullable=True)  # enseignant_id or parent_id or classe_id
    objet_type = Column(String(30), default="GENERAL")  # EMPLOI, DISCIPLINE, GENERAL, REUNION, EXAMENS, PAIEMENT, BULLETIN
    sujet = Column(String(300), nullable=False)
    contenu = Column(Text)
    parent_message_id = Column(Integer, ForeignKey("ss_messages.message_id"), nullable=True)
    statut = Column(String(20), default="ENVOYE")  # ENVOYE, LU, REPONDU, ARCHIVE
    date_envoi = Column(DateTime, server_default=func.now())
    date_lecture = Column(DateTime, nullable=True)


class Disponibilite(Base):
    """Disponibilité soumise par un enseignant en réponse à une demande."""
    __tablename__ = "ss_disponibilites"
    disponibilite_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    demande_id = Column(Integer, ForeignKey("ss_demandes_emploi.demande_id"), nullable=False)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    jour = Column(String(10), nullable=False)       # LUNDI..VENDREDI
    heure_debut = Column(String(5), nullable=False)  # "08:00"
    heure_fin = Column(String(5), nullable=False)    # "09:00"
    statut = Column(String(20), default="SOUMISE")  # SOUMISE, VALIDEE, REJETEE
    commentaire_admin = Column(Text, nullable=True)
    date_soumission = Column(DateTime, server_default=func.now())


# ============================================================================
# MODULE : EXAMENS & ÉVALUATIONS
# ============================================================================

class SujetExamen(Base):
    """Sujet d'examen téléversé par un enseignant."""
    __tablename__ = "ss_sujets_examen"
    # Index de performance — memes noms que la migration
    # 2026_08_perf_01_index_notation.py, pour qu'une base creee par
    # create_all() et une base migree aient le meme schema.
    __table_args__ = (
        Index("ix_sujets_examen_enseignant", 'enseignant_id'),
        Index("ix_sujets_examen_trimestre", 'trimestre_id'),
        Index("ix_sujets_examen_demande", 'demande_id'),
    )
    sujet_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    demande_id = Column(Integer, ForeignKey("ss_demandes_emploi.demande_id"), nullable=True)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=True)
    # Période réelle de l'établissement. `trimestre` (numéro) est conservée en
    # miroir pour les clients existants, mais c'est `trimestre_id` qui fait foi :
    # une école peut avoir 2 semestres ou 3 trimestres, nommés librement.
    trimestre_id = Column(Integer, ForeignKey("ss_trimestres.trimestre_id"), nullable=True)
    trimestre = Column(Integer, nullable=True)
    titre = Column(String(300), nullable=False)
    fichier_nom = Column(String(255), nullable=False)
    fichier_path = Column(String(500), nullable=False)
    fichier_type = Column(String(50))  # pdf, docx, etc.
    fichier_taille = Column(Integer)  # taille en octets
    duree_minutes = Column(Integer, nullable=False)  # durée de l'évaluation
    statut = Column(String(30), default="BROUILLON")  # BROUILLON, ENVOYE, RECU, VALIDE, REJETE
    commentaire = Column(Text, nullable=True)
    date_depot = Column(DateTime, server_default=func.now())
    date_envoi = Column(DateTime, nullable=True)


class EmploiExamen(Base):
    """Emploi du temps d'une session d'examens.

    `etablissement_id` ajouté au Lot 4 du chantier multi-écoles — avant,
    cette table n'avait aucune colonne ni relation fiable permettant de
    déterminer son établissement (`demande_id` nullable et lui-même sans
    étab ; `annee_id` avec un défaut codé en dur, jamais fiable). NOT NULL
    car ajoutée sur une table vide (vérifié réellement sur Supabase avant
    migration, voir migrations/lot4_examens_etablissement.py)."""
    __tablename__ = "ss_emplois_examen"
    emploi_examen_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    demande_id = Column(Integer, ForeignKey("ss_demandes_emploi.demande_id"), nullable=True)
    trimestre = Column(Integer, nullable=False)
    # Le calendrier porte les dates d'UNE épreuve : la 2ᵉ évaluation, la
    # composition du 1er semestre. Deux calendriers du même semestre étaient
    # indiscernables sans lire leurs créneaux.
    type_eval_id = Column(Integer, ForeignKey("ss_types_evaluation.type_eval_id"), nullable=True)
    titre = Column(String(255), nullable=False)
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=False)
    statut = Column(String(30), default="BROUILLON")  # BROUILLON, PUBLIE
    annee_id = Column(Integer, default=1)
    date_creation = Column(DateTime, server_default=func.now())


class CreneauExamen(Base):
    """Créneau individuel dans un emploi d'examen."""
    __tablename__ = "ss_creneaux_examen"
    creneau_examen_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    emploi_examen_id = Column(Integer, ForeignKey("ss_emplois_examen.emploi_examen_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    date_examen = Column(Date, nullable=False)
    heure_debut = Column(String(5), nullable=False)
    heure_fin = Column(String(5), nullable=False)
    salle = Column(String(100), nullable=True)
    surveillant_type = Column(String(20), default="ENSEIGNANT")  # ENSEIGNANT, EXTERNE
    surveillant_id = Column(Integer, nullable=True)  # enseignant_id si ENSEIGNANT
    surveillant_nom = Column(String(200), nullable=True)  # nom complet si EXTERNE
    statut = Column(String(20), default="ACTIVE")


# ============================================================================
# MODULE : DEVOIRS (Homework)
# ============================================================================

class Devoir(Base):
    """Devoir assigné par un enseignant à une classe."""
    __tablename__ = "ss_devoirs"
    devoir_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    titre = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)  # Contenu texte du devoir
    type_devoir = Column(String(30), default="EXERCICE")  # EXERCICE, RECHERCHE, LECTURE, PROJET
    fichier_nom = Column(String(255), nullable=True)
    fichier_path = Column(String(500), nullable=True)
    fichier_type = Column(String(50), nullable=True)
    date_limite = Column(Date, nullable=True)
    statut = Column(String(20), default="PUBLIE")  # BROUILLON, PUBLIE, CLOTURE
    date_creation = Column(DateTime, server_default=func.now())


# ============================================================================
# MODULE 12 : FOURNITURES SCOLAIRES
# ============================================================================

class FournitureScolaire(Base):
    """Liste des fournitures scolaires requises par classe/niveau."""
    __tablename__ = "ss_fournitures_scolaires"
    fourniture_id  = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # `default=1` retiré (chantier multi-écoles) : une création sans valeur
    # explicite rattachait la fourniture à l'établissement 1. La valeur provient
    # désormais toujours du compte authentifié, et la colonne est obligatoire.
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    nom            = Column(String(200), nullable=False)
    description    = Column(Text, nullable=True)
    categorie      = Column(String(50), default="MATERIEL")   # CAHIER, LIVRE, STYLO, UNIFORME, MATERIEL, AUTRE
    quantite       = Column(Integer, default=1)
    prix_unitaire  = Column(Numeric(10, 2), nullable=True)
    unite          = Column(String(30), default="unité")       # unité, paire, set, kg …
    niveau_id      = Column(Integer, ForeignKey("ss_niveaux.niveau_id"), nullable=True)
    classe_id      = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=True)
    obligatoire    = Column(String(1), default="O")            # O / N
    statut         = Column(String(20), default="ACTIF")       # ACTIF / INACTIF
    annee_scolaire = Column(String(20), default="2025-2026")
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())

class RessourcePedagogique(Base):
    __tablename__ = "ss_ressources_pedagogiques"
    
    ressource_id   = Column(Integer, primary_key=True, index=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    enseignant_id  = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    titre          = Column(String(200), nullable=False)
    description    = Column(String(1000), nullable=True)
    url            = Column(String(500), nullable=False)
    type_ressource = Column(String(50), default="LIEN")        # LIEN, PDF, VIDEO, FORM
    categorie      = Column(String(50), default="AUTRE")       # PEDAGOGIE, RESSOURCE, OUTIL, AUTRE
    date_creation  = Column(DateTime, server_default=func.now())

    # Pour l'instant pas de ForeignKey vers Classe/Matiere pour simplifier le MVP de base (car le prof a toutes ses classes), 
    # mais on garde l'établissement pour l'isolation multi-écoles (multi-tenant).


class PhotoEnAttente(Base):
    __tablename__ = "ss_photos_en_attente"

    photo_id       = Column(Integer, primary_key=True, index=True)
    entity_type    = Column(String(50), nullable=False) # 'eleve', 'parent'
    entity_id      = Column(Integer, nullable=False)
    uploader_type  = Column(String(50), nullable=False) # 'eleve', 'parent'
    uploader_id    = Column(Integer, nullable=False)
    file_path      = Column(String(500), nullable=False)
    statut         = Column(String(50), default="EN_ATTENTE") # EN_ATTENTE, REJETEE
    date_upload    = Column(DateTime, server_default=func.now())


# ============================================================================
# MODULE BIBLIOTHEQUE SCOLAIRE
# ============================================================================

class Ouvrage(Base):
    """Catalogue central des ouvrages de la bibliothèque scolaire."""
    __tablename__ = "ss_ouvrages"

    ouvrage_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # `default=1` retiré (chantier multi-écoles) : une création sans valeur
    # explicite rattachait l'ouvrage au catalogue de l'établissement 1. La
    # valeur provient désormais toujours du compte authentifié.
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    isbn = Column(String(20), nullable=True)
    code_interne = Column(String(30), nullable=False, index=True)
    titre = Column(String(300), nullable=False, index=True)
    auteur = Column(String(200), nullable=True)
    editeur = Column(String(200), nullable=True)
    annee_publication = Column(Integer, nullable=True)
    categorie = Column(String(50), nullable=True)
    sous_categorie = Column(String(50), nullable=True)
    langue = Column(String(20), default="FRANCAIS")
    niveau_cible = Column(String(50), nullable=True)
    matiere_associee = Column(String(100), nullable=True)
    nb_exemplaires = Column(Integer, default=0)
    nb_disponibles = Column(Integer, default=0)
    resume = Column(Text, nullable=True)
    couverture_url = Column(String(500), nullable=True)
    emplacement = Column(String(100), nullable=True)
    statut = Column(String(20), default="DISPONIBLE", nullable=False)
    created_by = Column(String(100), nullable=True)
    created_date = Column(DateTime, server_default=func.now())
    modified_by = Column(String(100), nullable=True)
    modified_date = Column(DateTime, onupdate=func.now())

    exemplaires = relationship("Exemplaire", back_populates="ouvrage", cascade="all, delete-orphan")


class Exemplaire(Base):
    """Exemplaire physique d'un ouvrage."""
    __tablename__ = "ss_exemplaires"

    exemplaire_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ouvrage_id = Column(Integer, ForeignKey("ss_ouvrages.ouvrage_id"), nullable=False)
    code_exemplaire = Column(String(30), nullable=False, unique=True, index=True)
    etat = Column(String(20), default="BON", nullable=False)
    statut = Column(String(20), default="DISPONIBLE", nullable=False)
    date_acquisition = Column(Date, nullable=True)
    observation = Column(String(300), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_date = Column(DateTime, server_default=func.now())

    ouvrage = relationship("Ouvrage", back_populates="exemplaires")
    emprunts = relationship("Emprunt", back_populates="exemplaire")


class Emprunt(Base):
    """Prêt d'un exemplaire à un élève ou à un enseignant."""
    __tablename__ = "ss_emprunts"

    emprunt_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exemplaire_id = Column(Integer, ForeignKey("ss_exemplaires.exemplaire_id"), nullable=False)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=True)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=True)
    date_emprunt = Column(Date, server_default=func.current_date(), nullable=False)
    date_retour_prevue = Column(Date, nullable=False)
    date_retour_effective = Column(Date, nullable=True)
    nb_jours_retard = Column(Integer, default=0)
    nb_renouvellements = Column(Integer, default=0)
    etat_retour = Column(String(20), nullable=True)
    observation = Column(String(300), nullable=True)
    statut = Column(String(20), default="EN_COURS", nullable=False)
    rappel_envoye = Column(String(1), default="N")
    date_rappel = Column(Date, nullable=True)
    created_by = Column(String(100), nullable=True)
    created_date = Column(DateTime, server_default=func.now())
    modified_by = Column(String(100), nullable=True)
    modified_date = Column(DateTime, onupdate=func.now())

    exemplaire = relationship("Exemplaire", back_populates="emprunts")


# ============================================================================
# MODULE COMPTABILITE (PORTAIL COMPTABLE)
# ============================================================================

class Comptable(Base):
    __tablename__ = "ss_comptables"
    comptable_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    nom_utilisateur = Column(String(100), unique=True, nullable=False, index=True)
    mot_de_passe = Column(String(255), nullable=False)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    telephone = Column(String(20), unique=True, nullable=True)
    statut = Column(String(20), default="ACTIF", nullable=False)
    created_date = Column(DateTime, server_default=func.now())

    etablissement = relationship("Etablissement")

class ParametreComptabilite(Base):
    """Paramètres comptables (dont le PIN d'accès). TENANT — un même paramètre
    (ex: 'PIN_ACCESS') est désormais indépendant par établissement (voir Lot 1
    du chantier multi-écoles) : avant cette colonne, un seul PIN existait pour
    toute la plateforme. `etablissement_id` NOT NULL car ajouté sur une table
    vide (vérifié réellement sur Supabase avant migration, aucun backfill)."""
    __tablename__ = "ss_parametres_comptabilite"
    __table_args__ = (
        UniqueConstraint("etablissement_id", "cle", name="uq_parametre_etablissement_cle"),
    )
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    cle = Column(String(50), nullable=False) # ex: 'PIN_ACCESS'
    valeur = Column(String(255), nullable=False)

class ExerciceComptable(Base):
    """TENANT — `annee` était unique sur toute la plateforme avant le Lot 1 du
    chantier multi-écoles (impossible pour 2 écoles d'avoir chacune un exercice
    '2026'). Désormais unique par établissement. `etablissement_id` NOT NULL
    car ajouté sur une table vide (vérifié réellement sur Supabase, aucun
    backfill nécessaire)."""
    __tablename__ = "ss_exercices_comptables"
    __table_args__ = (
        UniqueConstraint("etablissement_id", "annee", name="uq_exercice_etablissement_annee"),
    )
    exercice_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    annee = Column(String(10), nullable=False) # ex: '2026'
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=False)
    statut = Column(String(20), default="OUVERT") # OUVERT, FERME

class JournalComptable(Base):
    __tablename__ = "ss_journaux_comptables"
    journal_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False) # ex: 'AC', 'VE', 'BQ', 'OD'
    nom = Column(String(100), nullable=False)
    type_journal = Column(String(30), nullable=False) # ACHAT, VENTE, TRESORERIE, OD

class CompteComptable(Base):
    __tablename__ = "ss_comptes_comptables"
    compte_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    numero_compte = Column(String(20), unique=True, nullable=False, index=True)
    libelle = Column(String(200), nullable=False)
    type_compte = Column(String(30), nullable=False) # ACTIF, PASSIF, CHARGE, PRODUIT

class EcritureComptable(Base):
    """TENANT — `etablissement_id` existait déjà mais n'était jamais peuplé ni
    filtré nulle part avant le Lot 1 du chantier multi-écoles (colonne morte).
    Passé en NOT NULL (table vérifiée vide sur Supabase avant migration) pour
    empêcher structurellement toute future écriture sans établissement."""
    __tablename__ = "ss_ecritures_comptables"
    ecriture_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    date_ecriture = Column(Date, nullable=False)
    journal_id = Column(Integer, ForeignKey("ss_journaux_comptables.journal_id"), nullable=False)
    reference = Column(String(50))
    libelle = Column(String(255), nullable=False)
    exercice_id = Column(Integer, ForeignKey("ss_exercices_comptables.exercice_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    etablissement = relationship("Etablissement")
    lignes = relationship("LigneEcriture", back_populates="ecriture", cascade="all, delete-orphan")

class LigneEcriture(Base):
    __tablename__ = "ss_lignes_ecritures"
    ligne_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ecriture_id = Column(Integer, ForeignKey("ss_ecritures_comptables.ecriture_id"), nullable=False)
    compte_id = Column(Integer, ForeignKey("ss_comptes_comptables.compte_id"), nullable=False)
    debit = Column(Numeric(15, 2), default=0.00)
    credit = Column(Numeric(15, 2), default=0.00)
    description = Column(String(255))
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=True)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=True)
    fournisseur_id = Column(Integer, ForeignKey("ss_fournisseurs.fournisseur_id"), nullable=True)
    departement = Column(String(100), nullable=True)
    
    ecriture = relationship("EcritureComptable", back_populates="lignes")
    compte = relationship("CompteComptable")
    classe = relationship("Classe")
    eleve = relationship("Eleve")
    fournisseur = relationship("Fournisseur")

class Fournisseur(Base):
    __tablename__ = "ss_fournisseurs"
    fournisseur_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    nom = Column(String(200), nullable=False)
    telephone = Column(String(50))
    email = Column(String(150))
    adresse = Column(String(500))
    statut = Column(String(20), default="ACTIF", nullable=False)
    created_date = Column(DateTime, server_default=func.now())

class Budget(Base):
    __tablename__ = "ss_budgets"
    budget_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    code = Column(String(50), nullable=False, index=True)
    libelle = Column(String(200), nullable=False)
    montant_alloue = Column(Numeric(15, 2), nullable=False, default=0.00)
    montant_depense = Column(Numeric(15, 2), nullable=False, default=0.00)
    created_date = Column(DateTime, server_default=func.now())

class Immobilisation(Base):
    __tablename__ = "ss_immobilisations"
    immobilisation_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(50), nullable=False, index=True)
    libelle = Column(String(200), nullable=False)
    categorie = Column(String(50), nullable=False) # ex: 'MATERIEL_INFORMATIQUE', 'VEHICULE', 'BATIMENT', 'MOBILIER'
    date_acquisition = Column(Date, nullable=False)
    valeur_acquisition = Column(Numeric(15, 2), nullable=False)
    duree_vie_ans = Column(Integer, nullable=False)
    type_amortissement = Column(String(30), default="LINEAIRE", nullable=False) # 'LINEAIRE', 'DEGRESSIF'
    amortissements_cumules = Column(Numeric(15, 2), default=0.00, nullable=False)
    valeur_nette_comptable = Column(Numeric(15, 2), nullable=False)
    statut = Column(String(20), default="ACTIF", nullable=False)

class Employe(Base):
    __tablename__ = "ss_employes"
    employe_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(150), nullable=False)
    poste = Column(String(100), nullable=False) # Enseignant / Directeur / Surveillant / Agent...
    salaire_base = Column(Numeric(15, 2), nullable=False, default=0.00)
    type_contrat = Column(String(50), default="CDI")
    date_embauche = Column(Date, server_default=func.current_date())
    mobile_money = Column(String(50), nullable=True)
    statut = Column(String(20), default="ACTIF") # ACTIF / INACTIF
    # Référence externe optionnelle vers le vrai dossier RH ("ENS_3"/"PERS_5"),
    # utilisée par le module Paie pour faire de SS_EMPLOYES un miroir synchronisé
    # de SS_ENSEIGNANTS/SS_UTILISATEURS au lieu d'une table disjointe.
    source_ref = Column(String(20), nullable=True, unique=True)

class Avance(Base):
    __tablename__ = "ss_avances"
    avance_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employe_id = Column(Integer, ForeignKey("ss_employes.employe_id", ondelete="CASCADE"), nullable=False)
    montant = Column(Numeric(15, 2), nullable=False)
    date_avance = Column(Date, server_default=func.current_date())
    mois_concerne = Column(String(7), nullable=False) # YYYY-MM
    statut = Column(String(20), default="EN_ATTENTE") # EN_ATTENTE / DEDUITE

class AbsencePersonnel(Base):
    """Absence d'un membre du personnel, et ce qu'elle coûte.

    Constater et décider sont deux gestes différents. Le surveillant voit
    qu'un professeur n'est pas venu ; c'est la direction qui décide si cela
    se retient sur la paie. Sans cette séparation, seule la comptabilité
    pouvait saisir une absence — et elle n'était pas dans la cour à 8 h.
    """
    __tablename__ = "ss_absences_personnel"
    absence_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employe_id = Column(Integer, ForeignKey("ss_employes.employe_id", ondelete="CASCADE"), nullable=False)
    date_absence = Column(Date, nullable=False)
    motif = Column(String(200), nullable=True)
    est_justifie = Column(String(1), default="N") # Y / N
    # SIGNALE : constatée, sans effet sur la paie tant que rien n'est tranché.
    # VALIDE  : confirmée, la retenue s'applique.
    # ECARTE  : écartée après vérification, aucune retenue.
    statut = Column(String(20), default="VALIDE")
    signale_par = Column(String(120), nullable=True)
    valide_par = Column(String(120), nullable=True)
    date_signalement = Column(DateTime, server_default=func.now())
    date_decision = Column(DateTime, nullable=True)

class Prime(Base):
    __tablename__ = "ss_primes"
    prime_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employe_id = Column(Integer, ForeignKey("ss_employes.employe_id", ondelete="CASCADE"), nullable=False)
    montant = Column(Numeric(15, 2), nullable=False)
    motif = Column(String(200), nullable=False)
    mois_concerne = Column(String(7), nullable=False) # YYYY-MM

class BulletinPaie(Base):
    __tablename__ = "ss_bulletins_paie"
    bulletin_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employe_id = Column(Integer, ForeignKey("ss_employes.employe_id", ondelete="CASCADE"), nullable=False)
    mois_concerne = Column(String(7), nullable=False) # YYYY-MM
    salaire_base = Column(Numeric(15, 2), nullable=False)
    total_primes = Column(Numeric(15, 2), default=0.00)
    total_absences = Column(Numeric(15, 2), default=0.00)
    total_avances = Column(Numeric(15, 2), default=0.00)
    net_a_payer = Column(Numeric(15, 2), nullable=False)
    date_paiement = Column(Date, nullable=True)
    mode_paiement = Column(String(50), nullable=True) # Cash / Mobile Money
    statut = Column(String(20), default="BROUILLON") # BROUILLON / PAYE
    # TEXT et non VARCHAR(500) : ce champ porte la justification ligne par
    # ligne d'une retenue — date, horaire, matière, classe, taux de chaque
    # heure non assurée. Un professeur absent une journée chargée dépassait la
    # limite, et le paiement de son salaire échouait en erreur serveur. Une
    # retenue se conteste : son justificatif ne se tronque pas.
    # Voir migrations/2026_08_paie_01_details_absences_texte.py
    details_absences = Column(Text, nullable=True)



class PresenceAgent(Base):
    """
    Gestion des présences des agents (Personnel et Enseignants) via QR Code.
    """
    __tablename__ = "ss_presences_agents"
    presence_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=True)
    type_agent = Column(String(20), nullable=False) # 'PERSONNEL' ou 'ENSEIGNANT'
    agent_id = Column(Integer, nullable=False) # ID de l'utilisateur ou de l'enseignant
    date_presence = Column(Date, nullable=False, server_default=func.current_date())
    heure_arrivee = Column(Time, nullable=False)
    heure_depart = Column(Time, nullable=True)
    statut = Column(String(20), default="PRESENT") # PRESENT, RETARD, ABSENT
    observations = Column(String(255), nullable=True)

class Role(Base):
    __tablename__ = "ss_roles"
    role_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(50), nullable=False)
    libelle = Column(String(100), nullable=False)
    description = Column(String(255))
    est_systeme = Column(String(1), default="N")
    # Le rôle standard dont ce rôle hérite son espace et ses accès.
    # « Censeur des études » se base sur DIRECTEUR_NIVEAU, « Caissier » sur
    # COMPTABLE. Sans base, le rôle n'ouvre rien : la matrice de permissions
    # ne peut que RETIRER un accès, jamais en créer un — c'est ce qui empêche
    # qu'une case cochée en base donne la finance à un enseignant.
    # Voir migrations/2026_08_roles_01_role_base.py
    role_base = Column(String(30), nullable=True)
    # Salaire de REFERENCE du poste : « un surveillant, c'est 1 400 000 ».
    # Il pré-remplit la fiche à l'embauche et ne fait PAS foi pour la paie —
    # deux surveillants ne sont pas payés pareil (ancienneté, temps partiel).
    # Le montant réel vit sur `Utilisateur.salaire_base`, et lui seul est lu
    # au moment de payer. Sinon modifier la grille réécrirait en silence la
    # paie de gens dont le contrat dit autre chose.
    # Voir migrations/2026_08_roles_02_grille_salariale.py
    salaire_mensuel = Column(Numeric(15, 2), nullable=True)
    prime_mensuelle = Column(Numeric(15, 2), nullable=True)
    created_date = Column(DateTime, server_default=func.now())

class Permission(Base):
    __tablename__ = "ss_permissions"
    permission_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role_id = Column(Integer, ForeignKey("ss_roles.role_id", ondelete="CASCADE"))
    module = Column(String(50), nullable=False)
    action = Column(String(50), nullable=False)
    est_autorise = Column(String(1), default="O")

class AuditLog(Base):
    __tablename__ = "ss_audit_log"
    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    utilisateur_id = Column(Integer, nullable=True)
    nom_utilisateur = Column(String(100))
    module = Column(String(50))
    action = Column(String(50))
    details = Column(Text)
    ip_address = Column(String(45))
    created_date = Column(DateTime, server_default=func.now())


class SyncTombstone(Base):
    """Journal des suppressions — Étape C (synchro delta), backend/app/api/eleves.py.

    `ss_audit_log` ci-dessus a été envisagée pour ce rôle et écartée :
    c'est un journal d'actions admin en texte libre (`details`), sans
    `entity_id`/`entity_type` typés ni indexés — inefficace pour la requête
    qu'un delta doit faire ("quelles entités de tel type, tel établissement,
    supprimées depuis tel instant ?"). Table dédiée à la place, une ligne
    par suppression, écrite dans la même transaction que le DELETE réel.
    """
    __tablename__ = "ss_sync_tombstones"
    __table_args__ = (
        Index("ix_sync_tombstones_lookup", "entity_type", "etablissement_id", "deleted_at"),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    deleted_at = Column(DateTime, server_default=func.now(), nullable=False)


class SequenceMatricule(Base):
    """Compteur de matricules, un par (établissement, type d'entité).

    Chantier multi-écoles. Les matricules étaient calculés par
    `COUNT(*) + 1` sur TOUTE la table, ce qui posait trois problèmes :
      * le compteur était partagé entre les écoles (une école déduisait le
        volume de la plateforme depuis ses propres numéros) ;
      * il régressait dès qu'une fiche était supprimée, réattribuant un
        matricule déjà imprimé sur des cartes et cité dans les archives ;
      * deux créations simultanées obtenaient le même numéro (course).

    Un compteur persistant, verrouillé le temps de l'incrément, règle les
    trois. Il ne décroît JAMAIS : un matricule libéré n'est pas réattribué.
    """
    __tablename__ = "ss_sequences_matricule"
    etablissement_id = Column(
        Integer, ForeignKey("ss_etablissements.etablissement_id"), primary_key=True
    )
    type_entite = Column(String(20), primary_key=True)  # ELV, ENS
    dernier_numero = Column(Integer, nullable=False, default=0)


# ============================================================================
# MODULE : ÉVÉNEMENTS SCOLAIRES
# ============================================================================

class Evenement(Base):
    """Événements scolaires : réunions, examens, fêtes, congés, etc."""
    __tablename__ = "ss_evenements"
    evenement_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    type_evenement = Column(String(30), default="AUTRE", nullable=False)
    # REUNION, EXAMEN, FETE, INTERCLASSE, CONGE, JOURNEE_PEDAGOGIQUE, SPORT, AUTRE
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=True)
    heure_debut = Column(String(10), nullable=True)
    heure_fin = Column(String(10), nullable=True)
    lieu = Column(String(200), nullable=True)
    cible = Column(String(20), default="TOUS")
    # TOUS, PARENTS, ENSEIGNANTS, ELEVES, PERSONNEL
    couleur = Column(String(10), nullable=True)  # Couleur hex ex: #3b82f6
    statut = Column(String(20), default="PLANIFIE", nullable=False)
    # PLANIFIE, EN_COURS, TERMINE, ANNULE
    created_by = Column(String(100), nullable=True)
    created_date = Column(DateTime, server_default=func.now())


# ============================================================================
# MODULE : ACTIVITÉS DU JOUR
# ============================================================================

class ActiviteJour(Base):
    """Activités quotidiennes / Programme de la journée ajoutés par l'administration."""
    __tablename__ = "ss_activites_jour"
    activite_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    heure = Column(String(10), nullable=True)  # ex: 08:00, 10:30
    type_activite = Column(String(30), default="GENERALE")  # ACADEMIQUE, PARASCOLAIRE, REUNION, PAUSE, AUTRE
    icone = Column(String(50), default="Activity")  # UserPlus, CreditCard, Calendar, Activity, etc.
    couleur = Column(String(20), default="#3b82f6")  # #3b82f6, #10b981, #f59e0b, #ef4444
    date_activite = Column(Date, nullable=False, server_default=func.current_date())
    est_actif = Column(String(1), default="O")
    created_by = Column(String(100), nullable=True)
    created_date = Column(DateTime, server_default=func.now())


# ============================================================================
# MODULE : POINTAGE ÉLÈVES (QR Code — Entrée/Sortie établissement)
# ============================================================================

class PointageEleve(Base):
    """Pointage d'entrée/sortie de l'établissement pour les élèves via QR Code.
    Distinct de Presence (appel en classe) : l'élève peut être pointé à l'entrée
    de l'école mais absent d'un cours spécifique, et vice-versa."""
    __tablename__ = "ss_pointage_eleves"
    pointage_id      = Column(Integer, primary_key=True, index=True, autoincrement=True)
    eleve_id         = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=False)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=True)
    date_pointage    = Column(Date, nullable=False, server_default=func.current_date())
    heure_arrivee    = Column(Time, nullable=True)
    heure_depart     = Column(Time, nullable=True)
    statut           = Column(String(20), default="PRESENT")  # PRESENT, PARTI
    observations     = Column(String(255), nullable=True)
    created_at       = Column(DateTime, server_default=func.now())


class IncidentApplicatif(Base):
    """Erreur non gérée survenue dans l'application.

    `/api/monitoring` surveille la machine ; cette table surveille le LOGICIEL.
    Sans elle, une école tombant sur une erreur en imprimant un bulletin le
    découvre seule, et l'éditeur ne l'apprend qu'en étant appelé.

    On n'y met QUE ce qui sert à corriger : la route, le type d'erreur, son
    message, l'école et le rôle. Jamais le corps de la requête ni le contenu
    métier — un journal d'incidents ne doit pas devenir une porte dérobée vers
    les données des écoles.

    `etablissement_id` est nullable : une erreur peut survenir avant toute
    authentification (page de login, inscription publique).
    """
    __tablename__ = "ss_incidents_applicatifs"
    __table_args__ = (
        # La liste est toujours lue par date décroissante, filtrée sur le
        # non-résolu, et regroupée par (route, type).
        Index("ix_incidents_date", "date_incident"),
        Index("ix_incidents_resolu_date", "resolu", "date_incident"),
        Index("ix_incidents_groupe", "route", "type_erreur"),
    )
    incident_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    route = Column(String(300), nullable=False)
    methode = Column(String(10))
    type_erreur = Column(String(120), nullable=False)
    message = Column(String(800))
    trace = Column(Text, nullable=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=True)
    role = Column(String(40), nullable=True)
    date_incident = Column(DateTime, server_default=func.now(), nullable=False)
    resolu = Column(String(1), default="N", nullable=False)
