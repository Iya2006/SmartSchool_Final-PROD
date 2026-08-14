"""
SMARTSCHOOL — Schémas Pydantic pour validation API
Couvre tous les modules : Structure, Académique, Évaluations, Finance, Vie Scolaire
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal


# ─── Base commune pour tous les schémas de sortie ORM ───────────────────────
class OrmBase(BaseModel):
    """Classe mère Pydantic V2 pour tous les schémas de lecture (Out).
    Remplace l'ancienne syntaxe `class Config: orm_mode = True`."""
    model_config = ConfigDict(from_attributes=True)



# ============================================================================
# ÉTABLISSEMENTS
# ============================================================================
class EtablissementBase(BaseModel):
    code: str = Field(..., max_length=20)
    nom: str = Field(..., max_length=200)
    type_etablissement: str = Field(..., max_length=30)
    statut: str = "ACTIF"
    adresse: Optional[str] = None
    ville: Optional[str] = None
    region: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    directeur: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    cachet_url: Optional[str] = None
    signature_url: Optional[str] = None
    slogan: Optional[str] = None

class EtablissementCreate(EtablissementBase): pass
class EtablissementUpdate(BaseModel):
    nom: Optional[str] = None
    code: Optional[str] = None
    type_etablissement: Optional[str] = None
    statut: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    region: Optional[str] = None
    prefecture: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    directeur: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    cachet_url: Optional[str] = None
    signature_url: Optional[str] = None
    slogan: Optional[str] = None
    capacite_max: Optional[int] = None

class EtablissementOut(OrmBase, EtablissementBase):
    etablissement_id: int


# ============================================================================
# PARAMÈTRES (SETTINGS)
# ============================================================================
class ParametreBase(BaseModel):
    etablissement_id: int
    categorie: str
    cle: str
    valeur: str
    type_valeur: str = "TEXT"

class ParametreCreate(ParametreBase):
    # `etablissement_id` est IGNORÉ en entrée : la route l'impose depuis le
    # compte authentifié (chantier multi-écoles). Il reste accepté — et
    # facultatif — pour ne pas rejeter les clients qui l'envoient encore, mais
    # sa valeur n'a aucun effet. `ParametreBase` le garde obligatoire pour
    # `ParametreOut`, où il décrit bien le rattachement réel.
    etablissement_id: Optional[int] = None

class ParametreUpdate(BaseModel):
    valeur: str
    type_valeur: Optional[str] = None

class ParametreOut(OrmBase, ParametreBase):
    parametre_id: int


# ============================================================================
# PERSONNEL (tous rôles : FONDATEUR, DG, DIRECTEUR_NIVEAU, ADMIN, COMPTABLE,
#            BIBLIOTHECAIRE, INFORMATICIEN, SURVEILLANT, AGENT_ENTRETIEN, GARDIEN...)
# ============================================================================
class PersonnelBase(BaseModel):
    etablissement_id: int
    nom: str
    prenom: str
    sexe: Optional[str] = "M"
    telephone: Optional[str] = None
    email: Optional[str] = None
    role: str = "ADMIN"
    roles_secondaires: Optional[List[str]] = None
    statut: Optional[str] = "ACTIF"
    # Contrat & RH
    type_contrat: Optional[str] = "PERMANENT"
    date_embauche: Optional[date] = None
    salaire_base: Optional[float] = 0
    taux_horaire: Optional[float] = 0
    prime_mensuelle: Optional[float] = 0
    heures_hebdo: Optional[int] = 0
    rib: Optional[str] = None
    mode_paiement_salaire: Optional[str] = "ESPECES"
    # Identité
    date_naissance: Optional[date] = None
    lieu_naissance: Optional[str] = None
    adresse: Optional[str] = None
    numero_cni: Optional[str] = None

class PersonnelCreate(PersonnelBase):
    # Si accès système : login + mot de passe ; sinon None (staff technique sans accès)
    nom_utilisateur: Optional[str] = None
    mot_de_passe: Optional[str] = None

class PersonnelUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    sexe: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    roles_secondaires: Optional[List[str]] = None
    statut: Optional[str] = None
    type_contrat: Optional[str] = None
    date_embauche: Optional[date] = None
    salaire_base: Optional[float] = None
    taux_horaire: Optional[float] = None
    prime_mensuelle: Optional[float] = None
    heures_hebdo: Optional[int] = None
    rib: Optional[str] = None
    mode_paiement_salaire: Optional[str] = None
    date_naissance: Optional[date] = None
    lieu_naissance: Optional[str] = None
    adresse: Optional[str] = None
    numero_cni: Optional[str] = None
    mot_de_passe: Optional[str] = None
    nom_utilisateur: Optional[str] = None

class PersonnelOut(OrmBase, PersonnelBase):
    utilisateur_id: int
    nom_utilisateur: Optional[str] = None
    created_date: Optional[datetime] = None


# ============================================================================
# BIBLIOTHÈQUE SCOLAIRE
# ============================================================================
class OuvrageBase(BaseModel):
    # Plus de champ `etablissement_id` : il valait 1 par défaut et était accepté
    # depuis le corps de la requête. Il provient désormais du compte
    # authentifié (Lot 11).
    isbn: Optional[str] = None
    code_interne: str
    titre: str
    auteur: Optional[str] = None
    editeur: Optional[str] = None
    annee_publication: Optional[int] = None
    categorie: Optional[str] = None
    sous_categorie: Optional[str] = None
    langue: Optional[str] = "FRANCAIS"
    niveau_cible: Optional[str] = None
    matiere_associee: Optional[str] = None
    resume: Optional[str] = None
    couverture_url: Optional[str] = None
    emplacement: Optional[str] = None
    statut: Optional[str] = "DISPONIBLE"

class OuvrageCreate(OuvrageBase):
    nb_exemplaires_initial: int = 1

class OuvrageUpdate(BaseModel):
    isbn: Optional[str] = None
    code_interne: Optional[str] = None
    titre: Optional[str] = None
    auteur: Optional[str] = None
    editeur: Optional[str] = None
    annee_publication: Optional[int] = None
    categorie: Optional[str] = None
    sous_categorie: Optional[str] = None
    langue: Optional[str] = None
    niveau_cible: Optional[str] = None
    matiere_associee: Optional[str] = None
    resume: Optional[str] = None
    couverture_url: Optional[str] = None
    emplacement: Optional[str] = None
    statut: Optional[str] = None

class OuvrageOut(OrmBase, OuvrageBase):
    ouvrage_id: int
    nb_exemplaires: int = 0
    nb_disponibles: int = 0
    created_date: Optional[datetime] = None

class ExemplaireCreate(BaseModel):
    ouvrage_id: int
    code_exemplaire: Optional[str] = None
    etat: str = "BON"
    statut: str = "DISPONIBLE"
    date_acquisition: Optional[date] = None
    observation: Optional[str] = None

class ExemplaireOut(OrmBase):
    exemplaire_id: int
    ouvrage_id: int
    code_exemplaire: str
    etat: str = "BON"
    statut: str = "DISPONIBLE"
    date_acquisition: Optional[date] = None
    observation: Optional[str] = None
    created_date: Optional[datetime] = None

class EmpruntCreate(BaseModel):
    exemplaire_id: int
    eleve_id: Optional[int] = None
    enseignant_id: Optional[int] = None
    date_retour_prevue: date
    observation: Optional[str] = None

class EmpruntOut(OrmBase, EmpruntCreate):
    emprunt_id: int
    date_emprunt: Optional[date] = None
    date_retour_effective: Optional[date] = None
    nb_jours_retard: int = 0
    nb_renouvellements: int = 0
    etat_retour: Optional[str] = None
    statut: str = "EN_COURS"
    rappel_envoye: str = "N"
    date_rappel: Optional[date] = None


# ============================================================================
# ANNÉES SCOLAIRES
# ============================================================================
class AnneeScolaireBase(BaseModel):
    etablissement_id: int
    code: str
    libelle: str
    date_debut: date
    date_fin: date
    statut: str = "PLANIFIEE"
    est_courante: str = "N"

class AnneeScolaireCreate(AnneeScolaireBase): pass

class AnneeScolaireUpdate(BaseModel):
    code: Optional[str] = None
    libelle: Optional[str] = None
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    statut: Optional[str] = None
    est_courante: Optional[str] = None

class AnneeScolaireOut(OrmBase, AnneeScolaireBase):
    annee_id: int


class TrimestreBase(BaseModel):
    annee_id: int
    code: str
    libelle: str
    numero: int
    date_debut: date
    date_fin: date
    statut: str = "PLANIFIE"

class TrimestreCreate(TrimestreBase):
    pass

class TrimestreUpdate(BaseModel):
    code: Optional[str] = None
    libelle: Optional[str] = None
    numero: Optional[int] = None
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    statut: Optional[str] = None

class TrimestreOut(OrmBase, TrimestreBase):
    trimestre_id: int


# ============================================================================
# ÉLÈVES
# ============================================================================
class EleveBase(BaseModel):
    etablissement_id: int
    nom: str = Field(..., max_length=100)
    prenom: str = Field(..., max_length=150)
    date_naissance: date
    sexe: str = Field(..., max_length=1)
    lieu_naissance: Optional[str] = None
    nationalite: Optional[str] = "Guinéenne"
    adresse: Optional[str] = None
    quartier: Optional[str] = None
    ville: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    groupe_sanguin: Optional[str] = None
    statut: str = "ACTIF"

class EleveCreate(EleveBase): pass
class EleveUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    date_naissance: Optional[date] = None
    sexe: Optional[str] = None
    lieu_naissance: Optional[str] = None
    quartier: Optional[str] = None
    ville: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    adresse: Optional[str] = None
    groupe_sanguin: Optional[str] = None
    statut: Optional[str] = None
    classe_id: Optional[int] = None

class EleveOut(OrmBase, EleveBase):
    eleve_id: int
    matricule: str
    photo_url: Optional[str] = None
    created_date: Optional[datetime] = None
    classe_id: Optional[int] = None

class EleveListOut(OrmBase):
    eleve_id: int
    matricule: str
    nom: str
    prenom: str
    sexe: str
    date_naissance: date
    statut: str
    classe_code: Optional[str] = None
    niveau: Optional[str] = None
    photo_url: Optional[str] = None
    adresse: Optional[str] = None
    groupe_sanguin: Optional[str] = None


# ============================================================================
# PARENTS
# ============================================================================
class ParentBase(BaseModel):
    nom: str
    prenom: str
    telephone_1: str
    telephone_2: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    adresse: Optional[str] = None

class ParentCreate(ParentBase): pass
class ParentOut(OrmBase, ParentBase):
    parent_id: int


# ============================================================================
# ENSEIGNANTS
# ============================================================================
class EnseignantBase(BaseModel):
    etablissement_id: int
    nom: str
    prenom: str
    sexe: str
    telephone: str
    email: Optional[str] = None
    specialite: Optional[str] = None
    diplome_plus_eleve: Optional[str] = None
    type_contrat: str = "PERMANENT"
    date_embauche: Optional[date] = None
    statut: str = "ACTIF"
    # Contrat et RH
    salaire_base: Optional[float] = 0
    taux_horaire: Optional[float] = 0
    prime_mensuelle: Optional[float] = 0
    heures_hebdo: Optional[int] = 0
    rib: Optional[str] = None
    mode_paiement_salaire: Optional[str] = "ESPECES"
    date_naissance: Optional[date] = None
    lieu_naissance: Optional[str] = None
    adresse: Optional[str] = None
    numero_cni: Optional[str] = None

class EnseignantCreate(EnseignantBase):
    mot_de_passe: Optional[str] = None
class EnseignantUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    sexe: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    specialite: Optional[str] = None
    diplome_plus_eleve: Optional[str] = None
    type_contrat: Optional[str] = None
    date_embauche: Optional[date] = None
    statut: Optional[str] = None
    mot_de_passe: Optional[str] = None
    # Contrat et RH
    salaire_base: Optional[float] = None
    taux_horaire: Optional[float] = None
    prime_mensuelle: Optional[float] = None
    heures_hebdo: Optional[int] = None
    rib: Optional[str] = None
    mode_paiement_salaire: Optional[str] = None
    date_naissance: Optional[date] = None
    lieu_naissance: Optional[str] = None
    adresse: Optional[str] = None
    numero_cni: Optional[str] = None

class EnseignantOut(OrmBase, EnseignantBase):
    enseignant_id: int
    matricule: str
    photo_url: Optional[str] = None
    created_date: Optional[datetime] = None


# ============================================================================
# CLASSES
# ============================================================================
class ClasseBase(BaseModel):
    etablissement_id: int
    annee_id: int
    niveau_id: int
    code: str
    libelle: str
    capacite_max: int = 50
    statut: str = "ACTIVE"

class ClasseCreate(ClasseBase): pass
class ClasseOut(OrmBase, ClasseBase):
    classe_id: int
    effectif_actuel: int = 0
    nb_matieres: Optional[int] = 0
    niveau_libelle: Optional[str] = None
    # Cycle réel, lu via Niveau -> Cycle. Sans lui, le frontend déduisait le
    # cycle du libellé de la classe (« contient "Année" » = primaire), ce qui
    # rangeait 7ème à 12ème Année dans le primaire.
    cycle_code: Optional[str] = None
    cycle_libelle: Optional[str] = None
    niveau_ordre: Optional[int] = None
    est_examen: Optional[str] = None


# ============================================================================
# INSCRIPTIONS
# ============================================================================
class InscriptionBase(BaseModel):
    eleve_id: int
    classe_id: int
    annee_id: int
    type_inscription: str = "NOUVELLE"
    statut: str = "ACTIVE"

class InscriptionCreate(InscriptionBase): pass
class InscriptionOut(OrmBase, InscriptionBase):
    inscription_id: int
    date_inscription: Optional[date] = None


# ============================================================================
# MATIÈRES
# ============================================================================
class MatiereBase(BaseModel):
    cycle_id: int
    code: str
    libelle: str
    coefficient_defaut: float = 1.0
    categorie: Optional[str] = None
    est_obligatoire: str = "O"
    nb_heures_semaine: int = 2

class MatiereCreate(MatiereBase): pass
class MatiereOut(OrmBase, MatiereBase):
    matiere_id: int


# ============================================================================
# ÉVALUATIONS & NOTES
class TypeEvaluationBase(BaseModel):
    code: str
    libelle: str
    # Coefficient du type dans la moyenne de matière (Composition 2, Évaluation 1...).
    # Surchargeable par cycle — voir app/services/notation.py.
    coefficient: float = 1
    # Legacy : plus lu par le moteur de notation, conservé pour compatibilité
    poids_pourcentage: Optional[float] = None
    statut: str = "ACTIF"

class TypeEvaluationCreate(TypeEvaluationBase): pass
class TypeEvaluationUpdate(BaseModel):
    code: Optional[str] = None
    libelle: Optional[str] = None
    coefficient: Optional[float] = None
    poids_pourcentage: Optional[float] = None
    statut: Optional[str] = None

class TypeEvaluationOut(OrmBase, TypeEvaluationBase):
    type_eval_id: int

# ============================================================================
class EvaluationBase(BaseModel):
    matiere_id: int
    classe_id: int
    trimestre_id: int
    type_eval_id: int
    enseignant_id: int
    libelle: str
    date_evaluation: date
    # None => barème résolu depuis la configuration de la classe/matière/cycle
    note_sur: Optional[float] = None
    coefficient: float = 1
    # "O"/"N" : les coefficients de matière s'appliquent-ils à cette évaluation ?
    est_coefficientee: str = "O"

class EvaluationCreate(EvaluationBase): pass
class EvaluationOut(OrmBase, EvaluationBase):
    evaluation_id: int
    statut: str = "PLANIFIEE"
    session_id: Optional[int] = None
    coefficient_override: Optional[float] = None


# ============================================================================
# SESSIONS D'ÉVALUATION (création groupée multi-matières : composition, examen blanc...)
class EvaluationSessionCreate(BaseModel):
    classe_id: int
    trimestre_id: int
    type_eval_id: int
    libelle: str  # texte libre, ex. "Composition du 1er Trimestre"
    date_evaluation: date
    note_sur: Optional[float] = None  # None => barème configuré par matière
    est_coefficientee: str = "O"
    enseignant_id: Optional[int] = None
    # None => toutes les matières actives de la classe
    matiere_ids: Optional[List[int]] = None

class EvaluationSessionUpdate(BaseModel):
    libelle: Optional[str] = None
    date_evaluation: Optional[date] = None
    est_coefficientee: Optional[str] = None
    statut: Optional[str] = None
    # Corriger le barème après coup est le cas le plus fréquent : une épreuve
    # créée « notée sur 1 » (le coefficient saisi dans la mauvaise case) était
    # jusqu'ici impossible à rattraper depuis l'interface.
    note_sur: Optional[float] = None
    type_eval_id: Optional[int] = None
    # Surcharge du coefficient, propagée à toutes les matières de la session :
    # une composition pèse le même poids dans chaque matière.
    coefficient_override: Optional[float] = None


class EvaluationUpdate(BaseModel):
    """Correction d'une épreuve isolée (hors session)."""
    libelle: Optional[str] = None
    date_evaluation: Optional[date] = None
    note_sur: Optional[float] = None
    type_eval_id: Optional[int] = None
    enseignant_id: Optional[int] = None
    est_coefficientee: Optional[str] = None
    coefficient_override: Optional[float] = None

class EvaluationSessionOut(OrmBase):
    session_id: int
    classe_id: int
    trimestre_id: int
    type_eval_id: int
    etablissement_id: int
    libelle: str
    date_evaluation: date
    note_sur: Optional[float] = None
    est_coefficientee: str
    enseignant_id: Optional[int] = None
    statut: str

class NoteBase(BaseModel):
    evaluation_id: int
    inscription_id: int
    valeur: Optional[float] = None
    est_absent: str = "N"
    observation: Optional[str] = None

class NoteCreate(NoteBase): pass
class NoteUpdate(BaseModel):
    valeur: Optional[float] = None
    est_absent: Optional[str] = None
    observation: Optional[str] = None

class NoteOut(OrmBase, NoteBase):
    note_id: int


# ============================================================================
# FINANCE
# ============================================================================
class TypeFraisBase(BaseModel):
    code: str
    libelle: str
    categorie: str
    montant_defaut: float = 0
    est_obligatoire: str = "O"
    frequence: str = "ANNUEL"

class TypeFraisCreate(TypeFraisBase): pass
class TypeFraisOut(OrmBase, TypeFraisBase):
    type_frais_id: int
    statut: str

class TarifClasseEntry(BaseModel):
    type_frais_id: int
    classe_id: int
    montant: float  # <= 0 supprime le tarif existant pour ce couple type/classe

class EcheanceFactureBase(BaseModel):
    libelle: str
    date_limite: date
    montant_attendu: float

class EcheanceFactureCreate(EcheanceFactureBase): pass
class EcheanceFactureOut(OrmBase, EcheanceFactureBase):
    echeance_id: int
    facture_id: int
    montant_paye: float
    statut: str

class GenererFacturesClasseRequest(BaseModel):
    classe_id: int
    annee_id: int
    type_frais_id: int
    montant: float
    echeances: List[EcheanceFactureCreate] = []
    appliquer_reductions: bool = False  # Applique la réduction fratrie configurée (paramètres FINANCE)
    forcer_optionnel: bool = False  # Confirme la facturation d'un frais FACULTATIF à toute la classe

class FactureCreate(BaseModel):
    inscription_id: int
    type_frais_id: int
    montant_total: float
    echeances: List[EcheanceFactureCreate] = []

class FactureOut(OrmBase):
    facture_id: int
    inscription_id: int
    type_frais_id: Optional[int] = None
    numero_facture: str
    date_facture: Optional[date] = None
    montant_total: float
    montant_paye: float
    montant_restant: float
    statut: str
    echeances: List[EcheanceFactureOut] = []

class PaiementBase(BaseModel):
    facture_id: int
    echeance_id: Optional[int] = None
    montant: float
    mode_paiement: str
    reference_externe: Optional[str] = None
    # Le jour où l'argent est REELLEMENT entré en caisse. Absent = aujourd'hui.
    # Sans ce champ, le comptable qui saisit mardi les recettes de lundi les
    # datait de mardi : la recette du jour, le rapport mensuel et le journal
    # comptable portaient tous une date fausse, et le rapprochement de caisse
    # ne tombait jamais juste.
    date_paiement: Optional[date] = None

class PaiementCreate(PaiementBase): pass
class PaiementOut(OrmBase):
    paiement_id: int
    facture_id: int
    numero_recu: str
    date_paiement: Optional[date] = None
    montant: float
    mode_paiement: str
    statut: str

class DepenseBase(BaseModel):
    etablissement_id: int
    annee_id: int
    categorie: str
    libelle: str
    montant: float
    fournisseur: Optional[str] = None
    mode_paiement: Optional[str] = None
    facture_url: Optional[str] = None
    source_fonds: Optional[str] = None
    classe_id: Optional[int] = None
    eleve_id: Optional[int] = None
    departement: Optional[str] = None

class DepenseCreate(DepenseBase): pass
class DepenseOut(OrmBase, DepenseBase):
    depense_id: int
    date_depense: Optional[date] = None
    statut: str
    reference: Optional[str] = None
    # Alias en lecture : le frontend (Centre de Décaissement) affiche ce champ sous
    # le nom "description" (cohérent avec le payload d'écriture de
    # /reglements-fournisseurs), alors que la colonne réelle s'appelle `libelle`.
    description: str = Field(validation_alias="libelle")


# ============================================================================
# VIE SCOLAIRE
# ============================================================================
class PresenceBase(BaseModel):
    inscription_id: int
    date_presence: date
    demi_journee: str
    statut_presence: str
    motif: Optional[str] = None
    # « Justifiée ou non » est la seule chose qui distingue une absence
    # ordinaire d'une absence dont l'école doit s'inquiéter — c'est ce que
    # compte le tableau du surveillant. Le champ existait en base et dans la
    # réponse, mais pas dans ce qu'on pouvait ENVOYER : une absence saisie
    # restait donc systématiquement « non justifiée », même avec un mot des
    # parents en main.
    est_justifie: Optional[str] = "N"
    # Au collège et au lycée l'appel se fait par matière : le pointage se
    # rattache alors à la séance de ce créneau-là. Au primaire, un seul maître
    # tient la classe toute la journée et le pointage porte sur la
    # demi-journée — d'où l'absence de séance.
    seance_id: Optional[int] = None

class PresenceCreate(PresenceBase): pass
class PresenceOut(OrmBase, PresenceBase):
    presence_id: int

class IncidentBase(BaseModel):
    eleve_id: int
    etablissement_id: int
    type_incident: str
    gravite: str
    description: str
    signale_par: str

class IncidentCreate(IncidentBase): pass
class IncidentOut(OrmBase, IncidentBase):
    incident_id: int
    date_incident: Optional[date] = None
    statut: str


# ============================================================================
# DASHBOARD
# ============================================================================
class DashboardKPI(BaseModel):
    nb_eleves: int = 0
    nb_enseignants: int = 0
    nb_classes: int = 0
    total_recettes: float = 0
    total_depenses: float = 0
    taux_presence: float = 0
    taux_absence: float = 0
    taux_retard: float = 0
    nb_classes_couvertes: int = 0
    nb_seances_comptabilisees: int = 0
    incidents_mois: int = 0
    evaluations_prevues: int = 0

class FinanceStats(BaseModel):
    taux_recouvrement: float = 0
    total_impayes: float = 0
    paiements_mobile_money: int = 0
    repartition_methodes: List[dict] = []

class PedagogieStats(BaseModel):
    conflits_edt_ia: int = 0
    bulletins_generes: int = 0
    taux_reussite_global: float = 0
    taux_reussite_par_cycle: List[dict] = []

class CommunicationStats(BaseModel):
    sms_relances_envoyes: int = 0
    parents_inscrits_portail: int = 0
    taux_ouverture_app: float = 0

class DashboardResponse(BaseModel):
    kpi: DashboardKPI
    finance_stats: FinanceStats
    pedagogie_stats: PedagogieStats
    communication_stats: CommunicationStats
    inscriptions_par_classe: List[dict] = []
    paiements_recents: List[dict] = []
    impayes_en_attente: List[dict] = []
    evenements_a_venir: List[dict] = []
    activites_du_jour: List[dict] = []

