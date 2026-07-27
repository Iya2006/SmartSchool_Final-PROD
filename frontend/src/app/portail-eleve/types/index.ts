// ═══════════════════════════════════════════════════════════════
// SMARTSCHOOL — Types du Portail Élève
// ═══════════════════════════════════════════════════════════════

export interface EleveInfo {
    eleve_id: number;
    nom: string;
    prenom: string;
    matricule: string;
    sexe: string;
    photo_url: string | null;
    date_naissance: string | null;
    lieu_naissance: string | null;
    statut: string;
    classe_code: string;
    classe: string;
    classe_id: number | null;
    adresse?: string;
    groupe_sanguin?: string;
}

export interface NoteDetail {
    matiere: string;
    evaluation: string;
    note: number | null;
    note_sur: number;
    coefficient: number;
    est_absent: boolean;
    date: string | null;
    observation?: string;
}

export interface MatiereNotes {
    matiere: string;
    notes: NoteDetail[];
    moyenne: number | null;
}

export interface NotesData {
    notes_par_matiere: MatiereNotes[];
    moyenne_generale: number | null;
}

export interface CoursDuJour {
    heure_debut: string;
    heure_fin: string;
    matiere: string;
    enseignant: string;
    salle: string | null;
}

export interface CreneauEDT {
    jour: string;
    heure_debut: string;
    heure_fin: string;
    matiere: string;
    matiere_code: string;
    enseignant: string;
    salle: string | null;
}

export interface FactureInfo {
    facture_id: number;
    numero: string;
    date: string | null;
    montant_total: number;
    montant_paye: number;
    montant_restant: number;
    statut: string;
}

export interface PaiementInfo {
    paiement_id: number;
    numero_recu: string;
    date: string | null;
    montant: number;
    mode: string;
    statut: string;
}

export interface FinanceData {
    total_factures: number;
    total_paye: number;
    total_restant: number;
    taux: number;
    factures: FactureInfo[];
    paiements: PaiementInfo[];
}

export interface DashboardData {
    eleve: EleveInfo;
    moyenne: number | null;
    nb_notes: number;
    nb_present: number;
    nb_absent: number;
    taux_presence: number;
    finance: FinanceData;
    cours_du_jour: CoursDuJour[];
    notes_recentes: NoteDetail[];
    nb_messages_non_lus: number;
}

export interface PresenceRecord {
    date: string;
    statut: string;
    justification: string | null;
}

export interface AbsencesData {
    presences: PresenceRecord[];
    total_present: number;
    total_absent: number;
}

export interface BulletinMatiere {
    matiere: string;
    coefficient: number;
    moyenne_eleve: number | null;
    moyenne_classe: number | null;
    note_min: number | null;
    note_max: number | null;
    appreciation: string | null;
}

export interface BulletinData {
    bulletin_id: number;
    classe: string;
    trimestre: string;
    trimestre_id: number;
    moyenne_generale: number | null;
    rang: number | null;
    effectif_classe: number | null;
    mention: string | null;
    decision: string | null;
    matieres: BulletinMatiere[];
}

export interface MessageInfo {
    message_id: number;
    expediteur_type: string;
    expediteur_id: number | null;
    expediteur_nom?: string;
    destinataire_type: string;
    destinataire_nom?: string;
    sujet: string;
    contenu: string;
    statut: string;
    date_envoi: string | null;
}

export interface MessagesData {
    received: MessageInfo[];
    sent: MessageInfo[];
}

export interface FournitureItem {
    fourniture_id: number;
    nom: string;
    description: string | null;
    categorie: string;
    quantite: number;
    prix_unitaire: number | null;
    unite: string;
    obligatoire: string;
}

export interface DevoirItem {
    devoir_id: number;
    titre: string;
    description: string | null;
    type_devoir: string;
    date_limite: string | null;
    fichier_path: string | null;
    matiere: string;
    enseignant: string;
}

export interface RessourceItem {
    ressource_id: number;
    titre: string;
    description: string | null;
    url: string;
    type: string;
    categorie: string;
    date: string | null;
    auteur: string;
}

export interface PendingPhoto {
    photo_url: string;
}

export type Tab =
    | 'dashboard'
    | 'notes'
    | 'emploi'
    | 'bulletin'
    | 'absences'
    | 'messages'
    | 'fournitures'
    | 'devoirs'
    | 'evenements'
    | 'activites'
    | 'profil'
    | 'liens'
    | 'scolarite';

export const SUBJECT_COLORS = [
    { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
    { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
    { bg: '#fefce8', border: '#eab308', text: '#a16207' },
    { bg: '#fdf2f8', border: '#ec4899', text: '#be185d' },
    { bg: '#f5f3ff', border: '#8b5cf6', text: '#6d28d9' },
    { bg: '#ecfdf5', border: '#14b8a6', text: '#0f766e' },
    { bg: '#fff7ed', border: '#f97316', text: '#c2410c' },
];

export const JOURS_ORDER = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'] as const;
export const JOURS_LABEL: Record<string, string> = {
    LUNDI: 'Lundi',
    MARDI: 'Mardi',
    MERCREDI: 'Mercredi',
    JEUDI: 'Jeudi',
    VENDREDI: 'Vendredi',
};
