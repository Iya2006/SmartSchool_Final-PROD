"""
SMARTSCHOOL — Modèles SQLAlchemy complets
Couvre TOUTES les tables du système : Structure, Académique, Évaluations, Finance, Vie Scolaire
Vérifiés contre le DDL Oracle original.
"""
from sqlalchemy import (
    Column, Integer, String, Date, Float, ForeignKey, DateTime, Text, Numeric, CheckConstraint, Time, JSON
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
    nom_utilisateur = Column(String(100), unique=True, nullable=False, index=True)
    mot_de_passe = Column(String(255), nullable=False)
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
    created_date = Column(DateTime, server_default=func.now())


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
    __tablename__ = "ss_annees_scolaires"
    annee_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    code = Column(String(20), nullable=False)
    libelle = Column(String(100), nullable=False)
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=False)
    statut = Column(String(20), default="PLANIFIEE", nullable=False)
    est_courante = Column(String(1), default="N", nullable=False)
    created_by = Column(String(100))
    created_date = Column(DateTime, server_default=func.now())

    etablissement = relationship("Etablissement", back_populates="annees")
    trimestres = relationship("Trimestre", back_populates="annee")


class ParametreEtablissement(Base):
    """Table clé/valeur pour tous les paramètres de l'établissement."""
    __tablename__ = "ss_parametres"
    parametre_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False)
    categorie = Column(String(50), nullable=False)  # IDENTITE, THEME, NOTATION, FINANCE
    cle = Column(String(100), nullable=False)
    valeur = Column(Text, nullable=False)
    type_valeur = Column(String(20), default="TEXT") # TEXT, JSON, BOOLEAN, NUMBER, COLOR, URL
    
    etablissement = relationship("Etablissement")


class Trimestre(Base):
    __tablename__ = "ss_trimestres"
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
    inscriptions = relationship("Inscription", back_populates="classe")
    prof_principal = relationship("Enseignant", foreign_keys=[professeur_principal])


# ============================================================================
# MODULE 2 : GESTION ACADÉMIQUE
# ============================================================================

class Eleve(Base):
    __tablename__ = "ss_eleves"
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
    modified_date = Column(DateTime)

    etablissement = relationship("Etablissement", back_populates="eleves")
    inscriptions = relationship("Inscription", back_populates="eleve")
    parents = relationship("EleveParent", back_populates="eleve")


class Parent(Base):
    __tablename__ = "ss_parents"
    parent_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
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
    classe_matiere_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    coefficient = Column(Numeric(3, 1), default=1, nullable=False)
    nb_heures_semaine = Column(Integer, default=2)
    est_active = Column(String(1), default="O")


class CreneauEmploi(Base):
    """Créneau horaire dans l'emploi du temps d'une classe"""
    __tablename__ = "ss_creneaux_emploi"
    creneau_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=True)
    jour = Column(String(10), nullable=False)       # LUNDI, MARDI, MERCREDI, JEUDI, VENDREDI
    heure_debut = Column(String(5), nullable=False)  # "08:00"
    heure_fin = Column(String(5), nullable=False)    # "09:00"
    salle = Column(String(50))
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), default=1)
    statut = Column(String(20), default="ACTIVE")


class Affectation(Base):
    __tablename__ = "ss_affectations"
    affectation_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    nb_heures_semaine = Column(Numeric(3, 1), default=0)
    est_principal = Column(String(1), default="O")
    statut = Column(String(20), default="ACTIVE")

    enseignant = relationship("Enseignant", back_populates="affectations")


class Inscription(Base):
    __tablename__ = "ss_inscriptions"
    inscription_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    eleve_id = Column(Integer, ForeignKey("ss_eleves.eleve_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=False)
    annee_id = Column(Integer, ForeignKey("ss_annees_scolaires.annee_id"), nullable=False)
    date_inscription = Column(Date, server_default=func.current_date())
    type_inscription = Column(String(30), default="NOUVELLE")
    statut = Column(String(20), default="ACTIVE", nullable=False)
    role_classe = Column(String(20))  # CHEF_1, CHEF_2, CHEF_3 ou NULL
    decision_fin_annee = Column(String(30))
    rang_final = Column(Integer)
    moyenne_annuelle = Column(Numeric(5, 2))

    eleve = relationship("Eleve", back_populates="inscriptions")
    classe = relationship("Classe", back_populates="inscriptions")


# ============================================================================
# MODULE 3 : ÉVALUATIONS & BULLETINS
# ============================================================================

class TypeEvaluation(Base):
    __tablename__ = "ss_types_evaluation"
    type_eval_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(20), unique=True, nullable=False)
    libelle = Column(String(100), nullable=False)
    poids_pourcentage = Column(Numeric(5, 2), nullable=False)
    statut = Column(String(20), default="ACTIF")


class Evaluation(Base):
    __tablename__ = "ss_evaluations"
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


class Note(Base):
    __tablename__ = "ss_notes"
    note_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    evaluation_id = Column(Integer, ForeignKey("ss_evaluations.evaluation_id"), nullable=False)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    valeur = Column(Numeric(5, 2))
    est_absent = Column(String(1), default="N")
    observation = Column(String(300))


class Bulletin(Base):
    __tablename__ = "ss_bulletins"
    bulletin_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    trimestre_id = Column(Integer, ForeignKey("ss_trimestres.trimestre_id"))
    type_bulletin = Column(String(20), default="TRIMESTRIEL")
    moyenne_generale = Column(Numeric(5, 2))
    rang = Column(Integer)
    effectif_classe = Column(Integer)
    mention = Column(String(30))
    decision = Column(String(200))
    statut = Column(String(20), default="BROUILLON")

    lignes = relationship("BulletinLigne", back_populates="bulletin", cascade="all, delete-orphan")


class BulletinLigne(Base):
    __tablename__ = "ss_bulletin_lignes"
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
    __tablename__ = "ss_types_frais"
    type_frais_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(20), unique=True, nullable=False)
    libelle = Column(String(150), nullable=False)
    categorie = Column(String(50), nullable=False)
    montant_defaut = Column(Numeric(12, 2), default=0) # Nouveau champ
    est_obligatoire = Column(String(1), default="O")
    frequence = Column(String(20), default="ANNUEL")
    statut = Column(String(20), default="ACTIF")


class Facture(Base):
    __tablename__ = "ss_factures"
    facture_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inscription_id = Column(Integer, ForeignKey("ss_inscriptions.inscription_id"), nullable=False)
    type_frais_id = Column(Integer, ForeignKey("ss_types_frais.type_frais_id"), nullable=True)
    numero_facture = Column(String(30), unique=True, nullable=False)
    date_facture = Column(Date, server_default=func.current_date())
    montant_total = Column(Numeric(12, 2), default=0, nullable=False)
    montant_remise = Column(Numeric(12, 2), default=0)
    montant_net = Column(Numeric(12, 2), default=0, nullable=False)
    montant_paye = Column(Numeric(12, 2), default=0, nullable=False)
    montant_restant = Column(Numeric(12, 2), default=0, nullable=False)
    statut = Column(String(20), default="EN_ATTENTE", nullable=False)

    echeances = relationship("EcheanceFacture", backref="facture", cascade="all, delete-orphan")


class EcheanceFacture(Base):
    __tablename__ = "ss_echeances_factures"
    echeance_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    facture_id = Column(Integer, ForeignKey("ss_factures.facture_id"), nullable=False)
    libelle = Column(String(100), nullable=False)
    date_limite = Column(Date, nullable=False)
    montant_attendu = Column(Numeric(12, 2), nullable=False)
    montant_paye = Column(Numeric(12, 2), default=0)
    statut = Column(String(20), default="EN_ATTENTE") # EN_ATTENTE, PARTIELLEMENT_PAYEE, PAYEE, EN_RETARD


class Paiement(Base):
    __tablename__ = "ss_paiements"
    paiement_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    facture_id = Column(Integer, ForeignKey("ss_factures.facture_id"), nullable=False)
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


# ============================================================================
# MODULE : COMMUNICATION & EMPLOI DU TEMPS INTELLIGENT
# ============================================================================

class DemandeEmploi(Base):
    """Demande de l'admin aux enseignants pour collecter les disponibilités."""
    __tablename__ = "ss_demandes_emploi"
    demande_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    titre = Column(String(200), nullable=False)
    description = Column(Text)
    objet_type = Column(String(30), default="EMPLOI")  # EMPLOI, REUNION, GENERAL...
    classes_concernees = Column(Text)  # JSON array of classe_ids, or "TOUTES"
    statut = Column(String(30), default="EN_COURS")  # EN_COURS, CLOTUREE, EMPLOIS_GENERES, PUBLIEE
    trimestre = Column(Integer, nullable=True)  # 1, 2, 3 pour le système guinéen
    date_creation = Column(DateTime, server_default=func.now())
    date_cloture = Column(DateTime, nullable=True)


class Message(Base):
    """Messages de communication entre Admin, Enseignants et Parents."""
    __tablename__ = "ss_messages"
    message_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
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
    sujet_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    demande_id = Column(Integer, ForeignKey("ss_demandes_emploi.demande_id"), nullable=True)
    enseignant_id = Column(Integer, ForeignKey("ss_enseignants.enseignant_id"), nullable=False)
    matiere_id = Column(Integer, ForeignKey("ss_matieres.matiere_id"), nullable=False)
    classe_id = Column(Integer, ForeignKey("ss_classes.classe_id"), nullable=True)
    trimestre = Column(Integer, nullable=False)  # 1, 2, 3
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
    """Emploi du temps d'une session d'examens."""
    __tablename__ = "ss_emplois_examen"
    emploi_examen_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    demande_id = Column(Integer, ForeignKey("ss_demandes_emploi.demande_id"), nullable=True)
    trimestre = Column(Integer, nullable=False)
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
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), default=1)
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
    etablissement_id = Column(Integer, ForeignKey("ss_etablissements.etablissement_id"), nullable=False, default=1)
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

class ParametreComptabilite(Base):
    __tablename__ = "ss_parametres_comptabilite"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cle = Column(String(50), unique=True, nullable=False) # ex: 'PIN_ACCESS'
    valeur = Column(String(255), nullable=False)

class ExerciceComptable(Base):
    __tablename__ = "ss_exercices_comptables"
    exercice_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    annee = Column(String(10), nullable=False, unique=True) # ex: '2026'
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
    __tablename__ = "ss_ecritures_comptables"
    ecriture_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date_ecriture = Column(Date, nullable=False)
    journal_id = Column(Integer, ForeignKey("ss_journaux_comptables.journal_id"), nullable=False)
    reference = Column(String(50))
    libelle = Column(String(255), nullable=False)
    exercice_id = Column(Integer, ForeignKey("ss_exercices_comptables.exercice_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    lignes = relationship("LigneEcriture", back_populates="ecriture", cascade="all, delete-orphan")

class LigneEcriture(Base):
    __tablename__ = "ss_lignes_ecritures"
    ligne_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ecriture_id = Column(Integer, ForeignKey("ss_ecritures_comptables.ecriture_id"), nullable=False)
    compte_id = Column(Integer, ForeignKey("ss_comptes_comptables.compte_id"), nullable=False)
    debit = Column(Numeric(15, 2), default=0.00)
    credit = Column(Numeric(15, 2), default=0.00)
    description = Column(String(255))
    
    ecriture = relationship("EcritureComptable", back_populates="lignes")
    compte = relationship("CompteComptable")


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
