'use client';

import type React from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    ClipboardList,
    Database,
    FileText,
    FolderKanban,
    Layers3,
    Library,
    LifeBuoy,
    Loader2,
    Monitor,
    Plus,
    Radio,
    RefreshCw,
    Search,
    Settings,
    Shield,
    Sparkles,
    UserCheck,
    Users,
    Wrench,
    X,
    Zap,
    CalendarClock,
    QrCode,
    Send,
    Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { getRoleAccessConfig } from '@/lib/roleAccess';
import { useIsMobile } from '@/hooks/useIsMobile';
import PointageEnseignants from '@/components/PointageEnseignants';

type PortalModule = {
    icon: React.ComponentType<{ size?: number }>;
    title: string;
    desc: string;
    cta: string;
    status: string;
};

type PortalAction = {
    label: string;
    value: string;
    tone: string;
};

type PortalKpi = {
    label: string;
    value: string;
    note: string;
};

type PortalFeed = {
    title: string;
    detail: string;
    tone: 'info' | 'success' | 'warning';
};

type PortalContent = {
    accent: string;
    surface: string;
    title: string;
    intro: string;
    identity: string;
    workspaceLabel: string;
    modules: PortalModule[];
    kpis: PortalKpi[];
    quickActions: PortalAction[];
    feed: PortalFeed[];
};

type LibraryStats = {
    total_ouvrages: number;
    total_exemplaires: number;
    total_disponibles: number;
    emprunts_en_cours: number;
    retards: number;
    categories: { categorie: string; total: number }[];
};

type Ouvrage = {
    ouvrage_id: number;
    etablissement_id: number;
    isbn?: string | null;
    code_interne: string;
    titre: string;
    auteur?: string | null;
    editeur?: string | null;
    annee_publication?: number | null;
    categorie?: string | null;
    sous_categorie?: string | null;
    langue?: string | null;
    niveau_cible?: string | null;
    matiere_associee?: string | null;
    nb_exemplaires: number;
    nb_disponibles: number;
    resume?: string | null;
    couverture_url?: string | null;
    emplacement?: string | null;
    statut?: string | null;
    created_date?: string | null;
};

type OuvrageForm = {
    code_interne: string;
    titre: string;
    auteur: string;
    categorie: string;
    niveau_cible: string;
    matiere_associee: string;
    langue: string;
    emplacement: string;
    nb_exemplaires_initial: number;
    resume: string;
};

type PresenceStats = {
    total: number;
    presents: number;
    absents: number;
    retards: number;
    taux_presence: number;
    absences_non_justifiees?: number;
};

type IncidentStats = {
    total_incidents: number;
    par_gravite: { gravite: string; count: number }[];
    top_types: { type: string; count: number }[];
};

type IncidentItem = {
    incident_id: number;
    eleve_id: number;
    etablissement_id: number;
    type_incident: string;
    gravite: string;
    description: string;
    signale_par: string;
    date_incident?: string | null;
    statut: string;
};

type Pret = {
    emprunt_id: number;
    titre: string;
    auteur?: string | null;
    code_exemplaire: string;
    emprunteur: string;
    type_emprunteur: 'ELEVE' | 'ENSEIGNANT';
    matricule?: string | null;
    date_emprunt: string;
    date_retour_prevue: string;
    date_retour_effective?: string | null;
    jours_de_retard: number;
    en_retard: boolean;
    statut: 'EN_COURS' | 'EN_RETARD' | 'RENDU';
    rappel_envoye: boolean;
    etat_retour?: string | null;
};

type LigneAppel = {
    inscription_id: number;
    eleve_id: number;
    matricule?: string | null;
    nom: string;
    prenom: string;
    statut: 'PRESENT' | 'ABSENT' | 'RETARD';
    est_justifie: boolean;
    motif?: string | null;
    /** Ce que dit la carte scannée au portail — l'élève est-il dans l'école ? */
    pointe_a_l_ecole?: boolean;
    heure_arrivee?: string | null;
    heure_depart?: string | null;
    /** Entré ce matin, absent à ce cours : il n'a pas manqué l'école, il a
     *  manqué le cours. C'est la contradiction qui mérite un regard. */
    entre_mais_absent?: boolean;
    jamais_entre?: boolean;
};

type CreneauAppel = {
    creneau_id: number;
    heure_debut: string;
    heure_fin: string;
    matiere: string;
    enseignant_id?: number | null;
    enseignant?: string | null;
    demi_journee: 'MATIN' | 'SOIR';
};

type FeuilleAppel = {
    classe_id: number;
    classe: string;
    cycle: string;
    est_primaire: boolean;
    date_presence: string;
    demi_journee: string;
    effectif: number;
    deja_pointee: boolean;
    /** Au primaire : le maître qui tient la classe, désigné d'office. */
    responsable?: { enseignant_id: number; nom: string; nb_matieres: number } | null;
    /** Au collège et au lycée : les heures du jour, chacune avec son prof. */
    creneaux: CreneauAppel[];
    creneau_id?: number | null;
    seance_id?: number | null;
    /** Le portail d'entrée en un coup d'œil, avant de descendre dans la liste. */
    portail?: { pointes: number; jamais_entres: number; entres_mais_absents: number };
    eleves: LigneAppel[];
};

type CoursDuJour = {
    seance_id: number;
    classe: string;
    matiere: string;
    enseignant_prevu_id: number | null;
    enseignant_prevu: string;
    enseignant_reel: string | null;
    heure_debut_prevue: string;
    heure_fin_prevue: string;
    statut: string;
    appel_fait: boolean;
};

/** Une séance dans l'historique des appels : ce qui était prévu, et la réalité
 *  de l'appel (présents / absents / retards). */
type SeanceHist = {
    seance_id: number;
    classe: string;
    matiere: string;
    enseignant_prevu: string;
    enseignant_reel: string | null;
    date_seance: string;
    heure_debut_prevue: string;
    heure_fin_prevue: string;
    statut: string;
    appel_fait: boolean;
    nb_presents: number | null;
    nb_absents: number | null;
    nb_retards: number | null;
};

type SeanceHistDetail = SeanceHist & {
    eleves: { eleve: string; matricule: string | null; statut: string }[];
};

type ClasseAppel = { classe_id: number; libelle: string };

type ProfOption = { enseignant_id: number; nom: string; prenom: string; matiere?: string | null };

/** Les enseignants rangés par cycle : quarante-six noms à plat, c'est une
 *  liste dans laquelle on ne retrouve personne. */
type GroupeCycle = {
    code: string;
    libelle: string;
    enseignants: {
        enseignant_id: number; nom: string; prenom: string;
        matricule?: string | null; autres_cycles: string[];
    }[];
};

type EleveOption = {
    eleve_id: number;
    matricule?: string | null;
    nom: string;
    prenom: string;
    classe_code?: string | null;
    niveau?: string | null;
};

type IncidentForm = {
    eleve_id: string;
    type_incident: string;
    gravite: string;
    description: string;
};

type CountStats = {
    total?: number;
    actifs?: number;
    inactifs?: number;
    vacataires?: number;
};

type ClasseItem = {
    classe_id: number;
    code: string;
    libelle?: string;
    effectif_actuel?: number;
    capacite_max?: number;
    statut?: string;
};

type DashboardLite = {
    kpi?: {
        nb_eleves?: number;
        nb_enseignants?: number;
        nb_classes?: number;
        taux_presence?: number;
        incidents_mois?: number;
    };
};

type InformatiqueStats = {
    total_equipements: number;
    equipements_en_panne: number;
    tickets_ouverts: number;
    tickets_critiques: number;
    salles_informatiques: number;
    par_etat: { etat: string; total: number }[];
};

type EquipementInfo = {
    equipement_id: number;
    code: string;
    nom: string;
    type_equipement: string;
    etat: string;
    statut: string;
    marque?: string | null;
    modele?: string | null;
    observation?: string | null;
};

type TicketInfo = {
    ticket_id: number;
    equipement_id?: number | null;
    titre: string;
    description: string;
    priorite: string;
    statut: string;
    signale_par?: string | null;
    date_signalement?: string | null;
};

type ItForm = {
    mode: 'equipement' | 'ticket';
    code: string;
    nom: string;
    type_equipement: string;
    marque: string;
    etat: string;
    titre: string;
    description: string;
    priorite: string;
    equipement_id: string;
};

const EMPTY_STATS: LibraryStats = {
    total_ouvrages: 0,
    total_exemplaires: 0,
    total_disponibles: 0,
    emprunts_en_cours: 0,
    retards: 0,
    categories: [],
};

const EMPTY_FORM: OuvrageForm = {
    code_interne: '',
    titre: '',
    auteur: '',
    categorie: 'Littérature',
    niveau_cible: 'Tous niveaux',
    matiere_associee: '',
    langue: 'FRANCAIS',
    emplacement: '',
    nb_exemplaires_initial: 1,
    resume: '',
};

const FEED_TONES: Record<PortalFeed['tone'], { bg: string; color: string }> = {
    info: { bg: '#eff6ff', color: '#1d4ed8' },
    success: { bg: '#f0fdf4', color: '#166534' },
    warning: { bg: '#fff7ed', color: '#9a3412' },
};

const PORTAL_CONTENT: Record<string, PortalContent> = {
    informaticien: {
        accent: '#0284c7',
        surface: '#f0f9ff',
        title: 'Portail informatique',
        intro: 'Un cockpit technique pour la supervision des équipements, le support, l’infrastructure numérique et les points sensibles de sécurité. L’objectif est une vue lisible, réactive et strictement métier.',
        identity: 'Support & infrastructure numérique',
        workspaceLabel: 'Centre informatique',
        modules: [
            { icon: Monitor, title: 'Parc matériel', desc: 'Postes, imprimantes, points réseau, équipements critiques et cycle de vie du matériel.', cta: 'Auditer le parc', status: 'Structure prête' },
            { icon: Wrench, title: 'Incidents & support', desc: 'Tickets, maintenances, interventions et suivi des résolutions terrain.', cta: 'Suivre les incidents', status: 'Vue métier' },
            { icon: Shield, title: 'Sécurité opérationnelle', desc: 'Vigilance sur les accès, configurations sensibles et continuité numérique.', cta: 'Contrôler la sécurité', status: 'Poste critique' },
            { icon: Database, title: 'Intégrité des données', desc: 'Surveillance des flux, sauvegardes, cohérence fonctionnelle et dépendances critiques.', cta: 'Vérifier la stabilité', status: 'À approfondir' },
        ],
        kpis: [
            { label: 'Incidents ouverts', value: '—', note: 'à connecter au futur module tickets' },
            { label: 'Disponibilité SI', value: '—', note: 'mesure attendue depuis supervision' },
            { label: 'Équipements suivis', value: '—', note: 'inventaire métier à brancher' },
        ],
        quickActions: [
            { label: 'Support centralisé', value: 'Tickets & maintenance', tone: '#0284c7' },
            { label: 'Sécurité locale', value: 'Vigilance continue', tone: '#0ea5e9' },
            { label: 'Portail dédié', value: 'Sans shell admin', tone: '#0369a1' },
        ],
        feed: [
            { title: 'Module à connecter', detail: 'Les incidents IT doivent venir d’une API métier dédiée, pas de chiffres décoratifs.', tone: 'info' },
            { title: 'Poste autonome', detail: 'L’informaticien reste hors interface admin système.', tone: 'success' },
            { title: 'Prochaine étape', detail: 'Créer le stockage tickets, parc matériel et interventions.', tone: 'warning' },
        ],
    },
    surveillant: {
        accent: '#16a34a',
        surface: '#f0fdf4',
        title: 'Poste de supervision scolaire',
        intro: 'Un centre opérationnel de terrain pour la discipline, les présences sensibles, les signaux d’incident et les remontées rapides vers l’encadrement.',
        identity: 'Surveillance & discipline',
        workspaceLabel: 'Cockpit surveillant',
        modules: [
            { icon: UserCheck, title: 'Présences sensibles', desc: 'Suivi des absences répétées, mouvements à risque et points de vigilance journaliers.', cta: 'Contrôler les présences', status: 'Structure prête' },
            { icon: AlertTriangle, title: 'Incidents disciplinaires', desc: 'Déclaration, priorisation et transmission des incidents de vie scolaire.', cta: 'Gérer les incidents', status: 'Vue métier' },
            { icon: Radio, title: 'Main courante', desc: 'Journal de transmission et coordination entre surveillance, direction et secrétariat.', cta: 'Ouvrir la main courante', status: 'Canal clé' },
            { icon: CalendarClock, title: 'Rondes & points chauds', desc: 'Organisation du suivi de terrain, couloirs, cours et zones sensibles.', cta: 'Planifier la ronde', status: 'Enrichissable' },
        ],
        kpis: [
            { label: 'Incidents du jour', value: '—', note: 'à lire depuis vie scolaire' },
            { label: 'Présences sensibles', value: '—', note: 'à brancher sur présences/stats' },
            { label: 'Élèves à suivi', value: '—', note: 'liste prioritaire à consolider' },
        ],
        quickActions: [
            { label: 'Discipline pilotée', value: 'Suivi terrain', tone: '#16a34a' },
            { label: 'Remontées rapides', value: 'Main courante', tone: '#22c55e' },
            { label: 'Poste autonome', value: 'Sans interface admin', tone: '#166534' },
        ],
        feed: [
            { title: 'Données métier attendues', detail: 'La prochaine itération utilisera les incidents et statistiques de vie scolaire.', tone: 'info' },
            { title: 'Isolation validée', detail: 'Le surveillant reste dans son portail dédié.', tone: 'success' },
            { title: 'Action prioritaire', detail: 'Brancher déclaration incident et tableau de présence.', tone: 'warning' },
        ],
    },
    operateur: {
        accent: '#475569',
        surface: '#f8fafc',
        title: 'Portail opérations',
        intro: 'Un espace pensé pour l’accueil, la saisie, les inscriptions, la qualité des dossiers et le traitement fluide des opérations administratives courantes.',
        identity: 'Opérations & secrétariat',
        workspaceLabel: 'Poste opérateur',
        modules: [
            { icon: FolderKanban, title: 'Dossiers & accueil', desc: 'Centralisation des demandes, orientation des usagers et qualité des dossiers traités.', cta: 'Piloter l’accueil', status: 'Structure prête' },
            { icon: FileText, title: 'Saisie administrative', desc: 'Création, mise à jour et fiabilisation des informations opérationnelles.', cta: 'Ouvrir la saisie', status: 'Vue métier' },
            { icon: Layers3, title: 'File d’attente', desc: 'Traitement des opérations en attente selon la priorité et l’état du dossier.', cta: 'Voir les priorités', status: 'Canal actif' },
            { icon: Search, title: 'Contrôle qualité', desc: 'Détection des dossiers incomplets, duplications et anomalies administratives.', cta: 'Vérifier les dossiers', status: 'À enrichir' },
        ],
        kpis: [
            { label: 'Demandes en attente', value: '—', note: 'à connecter aux dossiers réels' },
            { label: 'Dossiers complets', value: '—', note: 'qualité calculée depuis données' },
            { label: 'Temps moyen', value: '—', note: 'à mesurer côté opérations' },
        ],
        quickActions: [
            { label: 'Flux optimisé', value: 'Accueil & saisie', tone: '#475569' },
            { label: 'Qualité suivie', value: 'Dossiers contrôlés', tone: '#64748b' },
            { label: 'Portail dédié', value: 'Hors shell système', tone: '#334155' },
        ],
        feed: [
            { title: 'Connecteurs à prévoir', detail: 'Les métriques opérateur doivent venir des inscriptions, familles et dossiers.', tone: 'info' },
            { title: 'Poste isolé', detail: 'L’opérateur ne repasse pas par le shell admin.', tone: 'success' },
            { title: 'Prochaine étape', detail: 'Créer une file d’opérations réelle et des contrôles de dossiers.', tone: 'warning' },
        ],
    },
};

function getInitials(title: string) {
    return title
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'SS';
}

function getErrorMessage(error: unknown) {
    if (typeof error === 'object' && error && 'response' in error) {
        const response = (error as { response?: { data?: { detail?: string } } }).response;
        return response?.data?.detail || 'Une erreur est survenue pendant la requête.';
    }
    return 'Une erreur est survenue pendant la requête.';
}

function BibliothecairePortal() {
    const { user, logout } = useAuth();
    const isMobile = useIsMobile();
    const { etablissementId, etablissementNom } = useApp();
    const roleConfig = useMemo(() => getRoleAccessConfig(user?.role), [user?.role]);
    const [stats, setStats] = useState<LibraryStats>(EMPTY_STATS);
    const [ouvrages, setOuvrages] = useState<Ouvrage[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [query, setQuery] = useState('');
    const [form, setForm] = useState<OuvrageForm>(EMPTY_FORM);

    /* ═══ LES PRETS ═══
       L'ecran annoncait « N prets en cours » et « N retards » sans qu'aucun
       des deux ne mene nulle part : ni le titre, ni l'emprunteur, ni depuis
       quand. Un compteur sans liste derriere ne permet de recuperer aucun
       livre — et cache le fait qu'il ne compte peut-etre rien. */
    const [prets, setPrets] = useState<Pret[]>([]);
    const [filtrePrets, setFiltrePrets] = useState<'EN_RETARD' | 'EN_COURS' | 'RENDU'>('EN_RETARD');
    const [pretsLoading, setPretsLoading] = useState(false);
    const [retourEnCours, setRetourEnCours] = useState<number | null>(null);
    // Chercher dans la circulation : retrouver un livre ou un emprunteur sans
    // faire défiler toute la liste.
    const [rechercheP, setRechercheP] = useState('');
    const [rappelsEnCours, setRappelsEnCours] = useState(false);
    // Prêter depuis le catalogue : le livre choisi, l'élève cherché, la date.
    const [pretOuvrage, setPretOuvrage] = useState<Ouvrage | null>(null);
    const [pretRechercheEleve, setPretRechercheEleve] = useState('');
    const [pretResultats, setPretResultats] = useState<EleveOption[]>([]);
    const [pretEleve, setPretEleve] = useState<EleveOption | null>(null);
    const [pretDate, setPretDate] = useState('');
    const [pretEnCours, setPretEnCours] = useState(false);

    const chargerPrets = useCallback(async () => {
        setPretsLoading(true);
        try {
            const res = await api.get<{ items: Pret[] }>(
                `/api/bibliotheque/emprunts?statut=${filtrePrets}&limit=100`);
            setPrets(res.data?.items || []);
        } catch (err) {
            setError(getErrorMessage(err));
            setPrets([]);
        } finally {
            setPretsLoading(false);
        }
    }, [filtrePrets]);

    useEffect(() => { chargerPrets(); }, [chargerPrets]);

    const enregistrerRetour = async (pret: Pret, etat: string) => {
        setRetourEnCours(pret.emprunt_id);
        setError(null);
        setSuccess(null);
        try {
            const res = await api.post(`/api/bibliotheque/emprunts/${pret.emprunt_id}/retour`, {
                etat_retour: etat,
            });
            setSuccess(`« ${pret.titre} » rendu par ${pret.emprunteur}. ${res.data?.message || ''}`.trim());
            await Promise.all([chargerPrets(), loadLibrary()]);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setRetourEnCours(null);
        }
    };

    // La circulation, filtrée sur ce qu'on cherche : titre, code ou emprunteur.
    const pretsAffiches = useMemo(() => {
        const q = rechercheP.trim().toLowerCase();
        if (!q) return prets;
        return prets.filter((p) => [p.titre, p.emprunteur, p.code_exemplaire, p.matricule]
            .some((v) => (v || '').toLowerCase().includes(q)));
    }, [prets, rechercheP]);

    // Un rappel à tous les élèves en retard, d'un seul geste : ils le lisent
    // dans leur espace au lieu qu'on les cherche un à un.
    const envoyerRappels = async () => {
        setRappelsEnCours(true); setError(null); setSuccess(null);
        try {
            const res = await api.post('/api/bibliotheque/emprunts/rappels', {});
            setSuccess(res.data?.message || 'Rappels envoyés.');
            await chargerPrets();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setRappelsEnCours(false);
        }
    };

    // Chercher l'élève à qui prêter — sur toute l'école, pas une liste tronquée.
    useEffect(() => {
        const terme = pretRechercheEleve.trim();
        if (terme.length < 2) { setPretResultats([]); return; }
        let annule = false;
        const minuteur = setTimeout(() => {
            api.get<EleveOption[]>(`/api/eleves?statut=ACTIF&limit=20&search=${encodeURIComponent(terme)}`)
                .then((r) => { if (!annule) setPretResultats(r.data || []); })
                .catch(() => { if (!annule) setPretResultats([]); });
        }, 280);
        return () => { annule = true; clearTimeout(minuteur); };
    }, [pretRechercheEleve]);

    const ouvrirPret = (ouvrage: Ouvrage) => {
        setPretOuvrage(ouvrage);
        setPretEleve(null); setPretRechercheEleve(''); setPretResultats([]);
        // Par défaut, à rendre dans deux semaines.
        const d = new Date(); d.setDate(d.getDate() + 14);
        setPretDate(d.toISOString().slice(0, 10));
    };

    const confirmerPret = async () => {
        if (!pretOuvrage || !pretEleve || !pretDate) return;
        setPretEnCours(true); setError(null); setSuccess(null);
        try {
            await api.post('/api/bibliotheque/emprunts', {
                ouvrage_id: pretOuvrage.ouvrage_id,
                eleve_id: pretEleve.eleve_id,
                date_retour_prevue: pretDate,
            });
            setSuccess(`« ${pretOuvrage.titre} » prêté à ${pretEleve.prenom} ${pretEleve.nom}, à rendre le ${new Date(pretDate).toLocaleDateString('fr-FR')}.`);
            setPretOuvrage(null); setPretEleve(null);
            await Promise.all([chargerPrets(), loadLibrary()]);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setPretEnCours(false);
        }
    };

    const loadLibrary = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statsRes, ouvragesRes] = await Promise.all([
                api.get<LibraryStats>(`/api/bibliotheque/stats?etablissement_id=${etablissementId}`),
                api.get<Ouvrage[]>(`/api/bibliotheque/ouvrages?etablissement_id=${etablissementId}&limit=120`),
            ]);
            setStats(statsRes.data || EMPTY_STATS);
            setOuvrages(ouvragesRes.data || []);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [etablissementId]);

    useEffect(() => {
        loadLibrary();
    }, [loadLibrary]);

    const filteredOuvrages = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return ouvrages;
        return ouvrages.filter((ouvrage) => [ouvrage.titre, ouvrage.auteur, ouvrage.code_interne, ouvrage.categorie, ouvrage.niveau_cible]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalized)));
    }, [ouvrages, query]);

    const categories = stats.categories.length ? stats.categories : [];

    const submitOuvrage = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await api.post('/api/bibliotheque/ouvrages', {
                etablissement_id: etablissementId,
                code_interne: form.code_interne.trim(),
                titre: form.titre.trim(),
                auteur: form.auteur.trim() || null,
                categorie: form.categorie.trim() || null,
                niveau_cible: form.niveau_cible.trim() || null,
                matiere_associee: form.matiere_associee.trim() || null,
                langue: form.langue || 'FRANCAIS',
                emplacement: form.emplacement.trim() || null,
                resume: form.resume.trim() || null,
                nb_exemplaires_initial: Math.max(0, Number(form.nb_exemplaires_initial) || 0),
                statut: 'DISPONIBLE',
            });
            setSuccess('Livre ajouté au catalogue partagé. Les autres portails pourront le consulter via la même API bibliothèque.');
            setForm(EMPTY_FORM);
            setShowForm(false);
            await loadLibrary();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const libraryKpis = [
        { label: 'Ouvrages catalogués', value: stats.total_ouvrages, note: 'titres disponibles dans le fonds', icon: BookOpen, color: '#7c3aed' },
        { label: 'Exemplaires physiques', value: stats.total_exemplaires, note: 'copies suivies par la bibliothèque', icon: Library, color: '#059669' },
        { label: 'Disponibles maintenant', value: stats.total_disponibles, note: 'prêts à emprunter', icon: CheckCircle2, color: '#f59e0b' },
        { label: 'Prêts en cours', value: stats.emprunts_en_cours, note: `${stats.retards} retard(s) à surveiller`, icon: ClipboardList, color: '#dc2626' },
    ];

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fff7ed 0%, #f0fdf4 42%, #ffffff 100%)', padding: '24px' }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '34px', padding: '28px', background: 'linear-gradient(135deg, #fff7ed 0%, #ecfccb 48%, #ede9fe 100%)', border: '1px solid rgba(124,58,237,0.12)', boxShadow: '0 30px 80px rgba(120,53,15,0.12)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(124,58,237,0.18), transparent 25%), radial-gradient(circle at bottom left, rgba(245,158,11,0.20), transparent 28%)' }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.25fr) minmax(310px, 0.75fr)', gap: '22px', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(124,58,237,0.14)', color: '#6d28d9', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    <Sparkles size={14} /> Portail métier bibliothèque
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '12px', fontWeight: 800 }}>
                                    Catalogue partagé SmartSchool
                                </span>
                            </div>

                            <div>
                                <h1 style={{ margin: 0, fontSize: 'clamp(2.15rem, 3.6vw, 3.7rem)', fontWeight: 950, letterSpacing: '-0.055em', color: '#2e1065' }}>Bibliothèque vivante</h1>
                                <p style={{ margin: '12px 0 0', fontSize: '16px', lineHeight: 1.85, color: '#57534e', maxWidth: '790px' }}>
                                    Gérez les livres, les exemplaires et la circulation documentaire depuis un espace chaleureux, scolaire et connecté. Chaque ouvrage ajouté ici alimente le catalogue partagé qui pourra être lu par les autres portails.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setShowForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: 'none', background: '#7c3aed', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 34px rgba(124,58,237,0.26)' }}>
                                    <Plus size={18} /> Ajouter un livre
                                </button>
                                <button type="button" onClick={loadLibrary} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: '1px solid rgba(124,58,237,0.18)', background: 'rgba(255,255,255,0.72)', color: '#4c1d95', fontWeight: 900, cursor: loading ? 'wait' : 'pointer' }}>
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Rafraîchir
                                </button>
                            </div>
                        </div>

                        <aside style={{ background: 'rgba(255,255,255,0.78)', borderRadius: '28px', border: '1px solid rgba(124,58,237,0.12)', padding: '22px', boxShadow: '0 20px 50px rgba(124,58,237,0.10)', backdropFilter: 'blur(18px)' }}>
                            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: '#7c3aed', fontWeight: 900, letterSpacing: '0.08em' }}>Session connectée</p>
                            <h3 style={{ margin: '7px 0 14px', fontSize: '22px', fontWeight: 950, color: '#1e1b4b' }}>{user?.prenom} {user?.nom}</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[
                                    { label: 'Rôle', value: roleConfig?.label || user?.role || 'Bibliothécaire' },
                                    { label: 'Espace', value: 'Gestion documentaire' },
                                    { label: 'Établissement', value: etablissementNom || `#${etablissementId}` },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: '#faf5ff', border: '1px solid #ede9fe' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#8b5cf6', fontWeight: 900 }}>{item.label}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#312e81', fontWeight: 900 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                                <Link href="/login" onClick={(e) => { e.preventDefault(); logout(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '14px', background: '#1e1b4b', color: 'white', fontWeight: 900, textDecoration: 'none' }}>
                                    Déconnexion
                                </Link>
                            </div>
                        </aside>
                    </div>
                </section>

                {(error || success) && (
                    <div style={{ padding: '14px 18px', borderRadius: '18px', background: error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`, color: error ? '#991b1b' : '#166534', fontWeight: 800 }}>
                        {error || success}
                    </div>
                )}

                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    {libraryKpis.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <motion.div key={item.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} whileHover={{ y: -5 }} style={{ padding: '20px', borderRadius: '26px', background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 20px 50px rgba(15,23,42,0.06)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '18px', background: `${item.color}14`, color: item.color, display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
                                    <Icon size={21} />
                                </div>
                                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
                                <p style={{ margin: '8px 0 4px', fontSize: '32px', color: '#0f172a', fontWeight: 950 }}>{loading ? '…' : item.value.toLocaleString('fr-FR')}</p>
                                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{item.note}</p>
                            </motion.div>
                        );
                    })}
                </section>

                {/* ═══ LES PRETS ═══
                    « 27 prets en cours » ne menait a rien : ni le titre, ni
                    l'emprunteur, ni depuis quand. Le compteur mene desormais
                    a la liste, et la liste au retour. */}
                <section style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #faf5ff)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Circulation</p>
                            <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Qui a quoi</h2>
                            <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#64748b', maxWidth: '600px' }}>
                                Un retard se lit sur le calendrier et grandit chaque jour.
                                Enregistrer un retour remet l&apos;exemplaire au rayon.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {([
                                { v: 'EN_RETARD' as const, l: 'En retard', c: '#dc2626' },
                                { v: 'EN_COURS' as const, l: 'Dehors', c: '#7c3aed' },
                                { v: 'RENDU' as const, l: 'Rendus', c: '#16a34a' },
                            ]).map((o) => (
                                <button key={o.v} type="button" onClick={() => setFiltrePrets(o.v)}
                                    style={{ padding: '10px 16px', borderRadius: '13px', border: filtrePrets === o.v ? `1px solid ${o.c}` : '1px solid #e2e8f0', background: filtrePrets === o.v ? o.c : '#f8fafc', color: filtrePrets === o.v ? 'white' : '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
                                    {o.l}
                                </button>
                            ))}
                            {/* Prévenir tous les retardataires d'un geste. */}
                            {filtrePrets === 'EN_RETARD' && (
                                <button type="button" onClick={envoyerRappels} disabled={rappelsEnCours}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '13px', border: 'none', background: '#dc2626', color: 'white', fontWeight: 800, fontSize: '13px', cursor: rappelsEnCours ? 'wait' : 'pointer' }}>
                                    {rappelsEnCours ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    Envoyer les rappels
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Chercher dans la circulation. */}
                    <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', maxWidth: '420px' }}>
                            <Search size={17} style={{ color: '#94a3b8', flexShrink: 0 }} />
                            <input value={rechercheP} onChange={(e) => setRechercheP(e.target.value)}
                                placeholder="Rechercher un livre, un code ou un emprunteur…"
                                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '14px', color: '#0f172a' }} />
                        </div>
                    </div>

                    <div>
                        {pretsLoading ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                <Loader2 size={20} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
                                Chargement…
                            </p>
                        ) : pretsAffiches.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                {rechercheP.trim() ? `Aucun résultat pour « ${rechercheP.trim()} ».`
                                    : filtrePrets === 'EN_RETARD' ? 'Aucun livre en retard — le fonds est à jour.'
                                    : filtrePrets === 'EN_COURS' ? 'Aucun livre sorti actuellement.'
                                    : 'Aucun retour enregistré.'}
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {pretsAffiches.map((pret, idx) => (
                                    <div key={pret.emprunt_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 24px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', background: pret.en_retard ? '#fef2f2' : 'transparent', flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: '230px', flex: '1 1 260px' }}>
                                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{pret.titre}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                                                {pret.code_exemplaire}{pret.auteur ? ` · ${pret.auteur}` : ''}
                                            </p>
                                        </div>
                                        <div style={{ minWidth: '180px', flex: '1 1 180px' }}>
                                            <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>{pret.emprunteur}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                                                {pret.type_emprunteur === 'ELEVE' ? 'Élève' : 'Enseignant'}
                                                {pret.matricule ? ` · ${pret.matricule}` : ''}
                                            </p>
                                        </div>
                                        <div style={{ minWidth: '150px' }}>
                                            {pret.statut === 'RENDU' ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px', background: '#f0fdf4', color: '#166534', fontSize: '12.5px', fontWeight: 800 }}>
                                                    Rendu le {pret.date_retour_effective}
                                                </span>
                                            ) : pret.en_retard ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px', background: '#fee2e2', color: '#991b1b', fontSize: '12.5px', fontWeight: 800 }}>
                                                    {pret.jours_de_retard} jour(s) de retard
                                                </span>
                                            ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px', background: '#f5f3ff', color: '#5b21b6', fontSize: '12.5px', fontWeight: 800 }}>
                                                    À rendre le {pret.date_retour_prevue}
                                                </span>
                                            )}
                                            {pret.statut !== 'RENDU' && pret.rappel_envoye && (
                                                <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                                                    rappel déjà envoyé
                                                </span>
                                            )}
                                        </div>
                                        {pret.statut !== 'RENDU' && (
                                            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                                                {([
                                                    { e: 'BON', l: 'Rendu' },
                                                    { e: 'ABIME', l: 'Abîmé' },
                                                    { e: 'PERDU', l: 'Perdu' },
                                                ]).map((o) => (
                                                    <button key={o.e} type="button" disabled={retourEnCours === pret.emprunt_id}
                                                        onClick={() => enregistrerRetour(pret, o.e)}
                                                        style={{ padding: '8px 14px', borderRadius: '12px', border: o.e === 'BON' ? 'none' : '1px solid #e2e8f0', background: o.e === 'BON' ? '#7c3aed' : 'white', color: o.e === 'BON' ? 'white' : '#64748b', fontWeight: 800, fontSize: '12.5px', cursor: retourEnCours === pret.emprunt_id ? 'wait' : 'pointer' }}>
                                                        {retourEnCours === pret.emprunt_id && o.e === 'BON'
                                                            ? <Loader2 size={14} className="animate-spin" /> : o.l}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
                <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 330px', gap: '20px', alignItems: 'start' }}>
                    <main style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', background: 'linear-gradient(135deg, #ffffff, #fffbeb)' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '12px', color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Catalogue réel</p>
                                <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Livres et exemplaires</h2>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '280px', padding: '10px 13px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <Search size={18} color="#64748b" />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher titre, auteur, code…" style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '14px', color: '#0f172a' }} />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ minHeight: '280px', display: 'grid', placeItems: 'center', color: '#7c3aed', fontWeight: 900 }}>
                                <Loader2 size={28} className="animate-spin" /> Chargement du fonds documentaire…
                            </div>
                        ) : filteredOuvrages.length === 0 ? (
                            <div style={{ padding: '52px 24px', textAlign: 'center' }}>
                                <div style={{ width: 86, height: 86, borderRadius: '28px', margin: '0 auto 18px', background: '#faf5ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                                    <Library size={36} />
                                </div>
                                <h3 style={{ margin: 0, color: '#1e1b4b', fontSize: '22px', fontWeight: 950 }}>{query ? 'Aucun livre trouvé' : 'La bibliothèque attend ses premiers livres'}</h3>
                                <p style={{ margin: '10px auto 0', maxWidth: '520px', color: '#64748b', lineHeight: 1.7 }}>
                                    {query ? 'Essayez un autre mot-clé ou ajoutez un ouvrage manquant.' : 'Ajoutez un livre pour créer le catalogue partagé. Ce fonds sera ensuite réutilisable dans les portails admin, élèves, parents et enseignants.'}
                                </p>
                                <button type="button" onClick={() => setShowForm(true)} style={{ marginTop: '18px', display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '12px 16px', borderRadius: '15px', border: 'none', background: '#7c3aed', color: 'white', fontWeight: 900, cursor: 'pointer' }}>
                                    <Plus size={17} /> Ajouter le premier livre
                                </button>
                            </div>
                        ) : (
                            <div style={{ padding: '22px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(245px, 1fr))', gap: '16px' }}>
                                {filteredOuvrages.map((ouvrage, index) => (
                                    <motion.article key={ouvrage.ouvrage_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025 }} whileHover={{ y: -5 }} style={{ borderRadius: '24px', border: '1px solid #edf2f7', background: 'linear-gradient(180deg, #ffffff, #fffdf7)', overflow: 'hidden', boxShadow: '0 16px 36px rgba(15,23,42,0.05)' }}>
                                        <div style={{ height: 122, padding: '16px', background: 'linear-gradient(135deg, #ede9fe, #fef3c7)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                            <div style={{ width: 74, height: 90, borderRadius: '14px 18px 18px 14px', background: 'linear-gradient(135deg, #7c3aed, #f59e0b)', color: 'white', display: 'grid', placeItems: 'center', fontSize: '22px', fontWeight: 950, boxShadow: '8px 10px 20px rgba(124,58,237,0.18)' }}>
                                                {getInitials(ouvrage.titre)}
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.76)', color: '#6d28d9', fontSize: '11px', fontWeight: 900 }}>{ouvrage.categorie || 'Non classé'}</span>
                                                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#92400e', fontWeight: 900 }}>{ouvrage.code_interne}</p>
                                            </div>
                                        </div>
                                        <div style={{ padding: '16px' }}>
                                            <h3 style={{ margin: 0, color: '#111827', fontSize: '17px', fontWeight: 950, lineHeight: 1.25 }}>{ouvrage.titre}</h3>
                                            <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>{ouvrage.auteur || 'Auteur non renseigné'}</p>
                                            <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                <div style={{ padding: '10px', borderRadius: '14px', background: '#f8fafc' }}>
                                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Exemplaires</p>
                                                    <p style={{ margin: '4px 0 0', color: '#0f172a', fontSize: '16px', fontWeight: 950 }}>{ouvrage.nb_exemplaires}</p>
                                                </div>
                                                <div style={{ padding: '10px', borderRadius: '14px', background: '#f0fdf4' }}>
                                                    <p style={{ margin: 0, color: '#16a34a', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Disponibles</p>
                                                    <p style={{ margin: '4px 0 0', color: '#14532d', fontSize: '16px', fontWeight: 950 }}>{ouvrage.nb_disponibles}</p>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {ouvrage.niveau_cible && <span style={{ padding: '6px 9px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', fontSize: '11px', fontWeight: 800 }}>{ouvrage.niveau_cible}</span>}
                                                {ouvrage.emplacement && <span style={{ padding: '6px 9px', borderRadius: 999, background: '#fff7ed', color: '#9a3412', fontSize: '11px', fontWeight: 800 }}>{ouvrage.emplacement}</span>}
                                            </div>
                                            {/* Prêter ce livre à un élève, directement depuis le catalogue. */}
                                            <button type="button" disabled={(ouvrage.nb_disponibles || 0) <= 0} onClick={() => ouvrirPret(ouvrage)}
                                                style={{ marginTop: '14px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '14px', border: 'none', background: (ouvrage.nb_disponibles || 0) > 0 ? '#7c3aed' : '#e2e8f0', color: (ouvrage.nb_disponibles || 0) > 0 ? 'white' : '#94a3b8', fontWeight: 900, fontSize: '13.5px', cursor: (ouvrage.nb_disponibles || 0) > 0 ? 'pointer' : 'not-allowed' }}>
                                                <BookOpen size={16} /> {(ouvrage.nb_disponibles || 0) > 0 ? 'Prêter à un élève' : 'Aucun exemplaire libre'}
                                            </button>
                                        </div>
                                    </motion.article>
                                ))}
                            </div>
                        )}
                    </main>

                    <aside style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'sticky', top: '24px' }}>
                        <div style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 22px 54px rgba(15,23,42,0.06)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rayons vivants</p>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                {categories.length === 0 ? (
                                    <p style={{ margin: 0, color: '#64748b', lineHeight: 1.7, fontSize: '13px' }}>Les catégories apparaîtront automatiquement après l’ajout des premiers livres.</p>
                                ) : categories.map((item) => (
                                    <div key={item.categorie} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', borderRadius: '16px', background: '#fafafa', border: '1px solid #f1f5f9' }}>
                                        <span style={{ color: '#334155', fontWeight: 850, fontSize: '13px' }}>{item.categorie}</span>
                                        <strong style={{ color: '#7c3aed' }}>{item.total}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ background: '#1e1b4b', color: 'white', borderRadius: '28px', boxShadow: '0 22px 54px rgba(30,27,75,0.18)', padding: '22px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(245,158,11,0.28), transparent 28%)' }} />
                            <div style={{ position: 'relative' }}>
                                <p style={{ margin: 0, fontSize: '12px', color: '#fde68a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Principe transversal</p>
                                <h3 style={{ margin: '8px 0 0', fontSize: '20px', fontWeight: 950 }}>Une seule source bibliothèque</h3>
                                <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: '13px' }}>
                                    Les actions de catalogage partent de ce portail, puis servent les futures vues bibliothèque côté admin, enseignant, parent et élève.
                                </p>
                            </div>
                        </div>
                    </aside>
                </section>

                {/* ═══ PRÊTER UN LIVRE ═══
                    Depuis le catalogue : on cherche l'élève, on fixe la date de
                    retour, le serveur retient un exemplaire disponible. */}
                {pretOuvrage && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)', zIndex: 90, display: 'grid', placeItems: 'center', padding: '20px' }} onClick={() => setPretOuvrage(null)}>
                        <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', background: 'white', borderRadius: '26px', boxShadow: '0 40px 90px rgba(15,23,42,0.28)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ padding: '20px 22px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #faf5ff, #eef2ff)', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nouveau prêt</p>
                                    <h2 style={{ margin: '5px 0 0', fontSize: '20px', color: '#111827', fontWeight: 950 }}>{pretOuvrage.titre}</h2>
                                    <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>{pretOuvrage.nb_disponibles} exemplaire(s) disponible(s)</p>
                                </div>
                                <button type="button" onClick={() => setPretOuvrage(null)} style={{ width: 40, height: 40, borderRadius: '13px', border: '1px solid #e2e8f0', background: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={18} /></button>
                            </div>
                            <div style={{ padding: '22px', display: 'grid', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Élève emprunteur</label>
                                    {pretEleve ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '14px', border: '1px solid #16a34a', background: '#f0fdf4' }}>
                                            <UserCheck size={17} style={{ color: '#16a34a' }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>{pretEleve.prenom} {pretEleve.nom}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#15803d', fontWeight: 700 }}>{pretEleve.matricule || 'sans matricule'}{pretEleve.classe_code ? ` • ${pretEleve.classe_code}` : ''}</p>
                                            </div>
                                            <button type="button" onClick={() => { setPretEleve(null); setPretRechercheEleve(''); }} style={{ padding: '7px 12px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>Changer</button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                                <Search size={17} style={{ color: '#94a3b8' }} />
                                                <input value={pretRechercheEleve} onChange={(e) => setPretRechercheEleve(e.target.value)} placeholder="Nom, prénom ou matricule…" autoComplete="off"
                                                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '14px', fontWeight: 700, color: '#0f172a' }} />
                                            </div>
                                            {pretResultats.length > 0 && (
                                                <div style={{ marginTop: '6px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
                                                    {pretResultats.map((el, i) => (
                                                        <button key={el.eleve_id} type="button" onClick={() => setPretEleve(el)}
                                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: 'white', cursor: 'pointer' }}>
                                                            <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>{el.prenom} {el.nom}</span>
                                                            <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginTop: '2px', fontWeight: 700 }}>{el.matricule || 'sans matricule'}{el.classe_code ? ` • ${el.classe_code}` : ''}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>À rendre le</label>
                                    <input type="date" value={pretDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setPretDate(e.target.value)}
                                        style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }} />
                                </div>
                            </div>
                            <div style={{ padding: '16px 22px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setPretOuvrage(null)} style={{ padding: '11px 16px', borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 900, cursor: 'pointer' }}>Annuler</button>
                                <button type="button" disabled={!pretEleve || !pretDate || pretEnCours} onClick={confirmerPret}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 18px', borderRadius: '14px', border: 'none', background: (pretEleve && pretDate) ? '#7c3aed' : '#e2e8f0', color: (pretEleve && pretDate) ? 'white' : '#94a3b8', fontWeight: 900, cursor: (pretEleve && pretDate && !pretEnCours) ? 'pointer' : 'not-allowed' }}>
                                    {pretEnCours ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />} Confirmer le prêt
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showForm && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(10px)', zIndex: 80, display: 'grid', placeItems: 'center', padding: '20px' }}>
                        <motion.form initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} onSubmit={submitOuvrage} style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflow: 'auto', background: 'white', borderRadius: '30px', boxShadow: '0 40px 90px rgba(15,23,42,0.26)', border: '1px solid #e2e8f0' }}>
                            <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: 'linear-gradient(135deg, #faf5ff, #fffbeb)' }}>
                                <div>
                                    <p style={{ margin: 0, color: '#7c3aed', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nouveau livre</p>
                                    <h2 style={{ margin: '6px 0 0', color: '#111827', fontSize: '24px', fontWeight: 950 }}>Ajouter au catalogue partagé</h2>
                                </div>
                                <button type="button" onClick={() => setShowForm(false)} style={{ width: 42, height: 42, borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                                {[
                                    { key: 'code_interne', label: 'Code interne', placeholder: 'BIB-001', required: true },
                                    { key: 'titre', label: 'Titre du livre', placeholder: 'Le monde des sciences', required: true },
                                    { key: 'auteur', label: 'Auteur', placeholder: 'Nom de l’auteur' },
                                    { key: 'categorie', label: 'Catégorie', placeholder: 'Roman, Sciences, Histoire…' },
                                    { key: 'niveau_cible', label: 'Niveau cible', placeholder: 'Collège, Lycée, Tous niveaux…' },
                                    { key: 'matiere_associee', label: 'Matière associée', placeholder: 'Français, Maths…' },
                                    { key: 'langue', label: 'Langue', placeholder: 'FRANCAIS' },
                                    { key: 'emplacement', label: 'Rayon / emplacement', placeholder: 'Rayon A3' },
                                ].map((field) => (
                                    <label key={field.key} style={{ display: 'grid', gap: '7px' }}>
                                        <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field.label}</span>
                                        <input required={field.required} value={String(form[field.key as keyof OuvrageForm])} onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700 }} />
                                    </label>
                                ))}

                                <label style={{ display: 'grid', gap: '7px' }}>
                                    <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exemplaires initiaux</span>
                                    <input type="number" min={0} value={form.nb_exemplaires_initial} onChange={(e) => setForm((prev) => ({ ...prev, nb_exemplaires_initial: Number(e.target.value) }))} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700 }} />
                                </label>

                                <label style={{ display: 'grid', gap: '7px', gridColumn: '1 / -1' }}>
                                    <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Résumé / note bibliothécaire</span>
                                    <textarea value={form.resume} onChange={(e) => setForm((prev) => ({ ...prev, resume: e.target.value }))} rows={4} placeholder="Petite description utile pour les lecteurs…" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700, resize: 'vertical' }} />
                                </label>
                            </div>

                            <div style={{ padding: '18px 24px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '12px 16px', borderRadius: '15px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 900, cursor: 'pointer' }}>Annuler</button>
                                <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '12px 16px', borderRadius: '15px', border: 'none', background: '#7c3aed', color: 'white', fontWeight: 900, cursor: saving ? 'wait' : 'pointer' }}>
                                    {saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Enregistrer le livre
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </div>
        </div>
    );
}

function SurveillantPortal() {
    const { user, logout } = useAuth();
    const isMobile = useIsMobile();
    const { etablissementId, etablissementNom, anneeId } = useApp();
    const roleConfig = useMemo(() => getRoleAccessConfig(user?.role), [user?.role]);
    const [presenceStats, setPresenceStats] = useState<PresenceStats>({ total: 0, presents: 0, absents: 0, retards: 0, taux_presence: 0 });
    const [incidentStats, setIncidentStats] = useState<IncidentStats>({ total_incidents: 0, par_gravite: [], top_types: [] });
    const [incidents, setIncidents] = useState<IncidentItem[]>([]);
    const [incidentEnCours, setIncidentEnCours] = useState<number | null>(null);

    /** Marque un incident comme traité, puis le retire de la liste.
     *  L'API existait (`PUT /incidents/{id}/traiter`) mais AUCUN écran ne
     *  l'appelait : les incidents restaient donc ouverts indéfiniment. */
    const reglerIncident = async (incidentId: number) => {
        setIncidentEnCours(incidentId);
        try {
            await api.put(
                `/api/vie-scolaire/incidents/${incidentId}/traiter`
                + `?decision=${encodeURIComponent('Réglé')}&traite_par=${encodeURIComponent('Surveillance')}`,
            );
            // Retrait immédiat : attendre un rechargement donnerait l'impression
            // que l'incident traité s'attarde.
            setIncidents((liste) => liste.filter((i) => i.incident_id !== incidentId));
        } catch {
            setIncidentEnCours(null);
        }
    };
    const [eleves, setEleves] = useState<EleveOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<IncidentForm>({ eleve_id: '', type_incident: 'DISCIPLINE', gravite: 'MOYENNE', description: '' });

    /* ═══ FAIRE L'APPEL ═══
       Le surveillant voyait ses statistiques d'absences sans pouvoir en
       saisir une seule : le geste central de son metier — l'appel du matin
       et de l'apres-midi — n'existait nulle part dans son espace. */
    const [classes, setClasses] = useState<ClasseAppel[]>([]);
    const [appelClasse, setAppelClasse] = useState('');
    const [appelDate, setAppelDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [appelDemi, setAppelDemi] = useState<'MATIN' | 'SOIR'>('MATIN');
    // Au college et au lycee, la classe change de professeur a chaque heure :
    // l'appel se fait par matiere, et choisir la matiere designe le prof.
    const [appelCreneau, setAppelCreneau] = useState<number | null>(null);
    const [feuille, setFeuille] = useState<FeuilleAppel | null>(null);
    const [appelLoading, setAppelLoading] = useState(false);
    const [appelSaving, setAppelSaving] = useState(false);

    const chargerFeuille = useCallback(async () => {
        if (!appelClasse) { setFeuille(null); return; }
        setAppelLoading(true);
        setError(null);
        try {
            const res = await api.get<FeuilleAppel>(
                `/api/vie-scolaire/feuille-appel?classe_id=${appelClasse}&date_presence=${appelDate}`
                + `&demi_journee=${appelDemi}${appelCreneau ? `&creneau_id=${appelCreneau}` : ''}`);
            setFeuille(res.data);
        } catch (err) {
            setError(getErrorMessage(err));
            setFeuille(null);
        } finally {
            setAppelLoading(false);
        }
    }, [appelClasse, appelDate, appelDemi, appelCreneau]);

    useEffect(() => { chargerFeuille(); }, [chargerFeuille]);

    // Changer de classe ou de jour remet l'heure a zero : le creneau d'hier
    // n'existe pas forcement aujourd'hui, et pointer sur une heure qui n'est
    // pas celle qu'on croit est pire que de ne pas pointer.
    useEffect(() => { setAppelCreneau(null); }, [appelClasse, appelDate]);

    const marquer = (inscriptionId: number, statut: LigneAppel['statut']) => {
        setFeuille((f) => f && ({
            ...f,
            eleves: f.eleves.map((e) => e.inscription_id === inscriptionId
                // Repasser un eleve present efface la justification et le
                // motif : ils ne veulent plus rien dire.
                ? { ...e, statut, ...(statut === 'PRESENT' ? { est_justifie: false, motif: null } : {}) }
                : e),
        }));
    };

    const basculerJustifie = (inscriptionId: number) => {
        setFeuille((f) => f && ({
            ...f,
            eleves: f.eleves.map((e) => e.inscription_id === inscriptionId
                ? { ...e, est_justifie: !e.est_justifie } : e),
        }));
    };

    const changerMotif = (inscriptionId: number, motif: string) => {
        setFeuille((f) => f && ({
            ...f,
            eleves: f.eleves.map((e) => e.inscription_id === inscriptionId ? { ...e, motif } : e),
        }));
    };

    const enregistrerAppel = async () => {
        if (!feuille) return;
        setAppelSaving(true);
        setError(null);
        setSuccess(null);
        try {
            // On envoie TOUTE la classe : un eleve repasse present doit voir
            // sa ligne corrigee, pas rester absent parce qu'on ne l'a pas
            // renvoye. Le serveur met a jour ou cree, jamais en double.
            await api.post('/api/vie-scolaire/presences/batch', feuille.eleves.map((e) => ({
                inscription_id: e.inscription_id,
                date_presence: feuille.date_presence,
                demi_journee: feuille.demi_journee,
                statut_presence: e.statut,
                est_justifie: e.est_justifie ? 'O' : 'N',
                motif: e.motif || null,
                // Au college, chaque heure a son propre appel : sans la
                // seance, les six heures de la journee ecraseraient la meme
                // ligne et il ne resterait que le dernier appel.
                seance_id: feuille.seance_id || null,
            })));
            const absents = feuille.eleves.filter((e) => e.statut === 'ABSENT').length;
            const retards = feuille.eleves.filter((e) => e.statut === 'RETARD').length;
            setSuccess(`Appel enregistré : ${absents} absent(s), ${retards} retard(s) sur ${feuille.effectif} élèves.`);
            await Promise.all([chargerFeuille(), loadSurveillance()]);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setAppelSaving(false);
        }
    };

    /* ═══ SIGNALER L'ABSENCE D'UN ENSEIGNANT ═══
       Le surveillant constate qu'un professeur n'a pas assure son cours. Il ne
       pouvait rien en faire : la seule route qui enregistre une absence
       d'enseignant vit dans le module financier, ou il n'a pas acces (403).
       C'etait donc le comptable qui decidait qu'un professeur etait absent —
       et cette decision retire de l'argent sur sa paie, alors qu'il n'etait pas
       dans la cour a 8 h. Ici on CONSTATE ; la direction TRANCHE. */
    const [profs, setProfs] = useState<ProfOption[]>([]);
    const [signalement, setSignalement] = useState({
        enseignant_id: '',
        date_absence: new Date().toISOString().slice(0, 10),
        motif: '',
        est_justifie: false,
    });
    // Les heures que ce professeur n'a pas assurees. Vide au primaire : le
    // maitre tient sa classe toute la journee, il n'y a rien a cocher.
    const [coursCoches, setCoursCoches] = useState<number[]>([]);
    // Ranges par cycle : le surveillant sait dans quel cycle il vient de
    // constater l'absence, la liste doit suivre sa tete.
    const [cycles, setCycles] = useState<GroupeCycle[]>([]);
    const [signalEnCours, setSignalEnCours] = useState(false);

    /* LES COURS DU JOUR
       Le surveillant signalait ce qu'il remarquait lui-meme dans la cour :
       une absence vue, c'est une absence signalee, et tout le reste passait.
       L'emploi du temps sait pourtant exactement quels cours sont prevus.
       Ici il les voit, et un cours reste « a venir » en fin de journee est
       precisement un cours qui n'a pas eu lieu. */
    const [coursDuJour, setCoursDuJour] = useState<CoursDuJour[]>([]);
    // L'HISTORIQUE DES APPELS : le surveillant retrouve, pour un jour et une
    // classe, ce que chaque cours a réellement donné à l'appel — sans se
    // déplacer. Le fondateur et la direction ont la même vue dans « Séances ».
    const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10));
    const [histClasse, setHistClasse] = useState('');
    const [histSeances, setHistSeances] = useState<SeanceHist[]>([]);
    const [histLoading, setHistLoading] = useState(false);
    const [histDetail, setHistDetail] = useState<SeanceHistDetail | null>(null);
    const [coursLoading, setCoursLoading] = useState(false);

    const chargerCoursDuJour = useCallback(async () => {
        setCoursLoading(true);
        try {
            const res = await api.get<CoursDuJour[]>(
                `/api/seances?date=${signalement.date_absence}`);
            setCoursDuJour(res.data || []);
        } catch {
            setCoursDuJour([]);
        } finally {
            setCoursLoading(false);
        }
    }, [signalement.date_absence]);

    useEffect(() => { chargerCoursDuJour(); }, [chargerCoursDuJour]);

    // L'historique des appels pour le jour (et la classe) choisis.
    const chargerHistorique = useCallback(async () => {
        setHistLoading(true);
        try {
            const res = await api.get<SeanceHist[]>(
                `/api/seances?date=${histDate}${histClasse ? `&classe_id=${histClasse}` : ''}`);
            setHistSeances(res.data || []);
        } catch {
            setHistSeances([]);
        } finally {
            setHistLoading(false);
        }
    }, [histDate, histClasse]);

    useEffect(() => { chargerHistorique(); }, [chargerHistorique]);

    const ouvrirDetailSeance = async (seanceId: number) => {
        try {
            const res = await api.get<SeanceHistDetail>(`/api/seances/${seanceId}`);
            setHistDetail(res.data);
        } catch (err) {
            setError(getErrorMessage(err));
        }
    };

    // Supprimer l'appel d'une séance (comme l'admin) : efface les présences et
    // permet de le refaire. Le cours/la séance restent.
    const supprimerAppelSeance = async (seanceId: number) => {
        if (!confirm("Supprimer l'appel de cette séance ?\n\nToutes les présences saisies seront effacées et l'appel pourra être refait. Cette action est irréversible.")) return;
        try {
            await api.delete(`/api/seances/${seanceId}/appel`);
            setHistDetail(null);
            chargerHistorique();
        } catch (err) {
            alert(getErrorMessage(err));
        }
    };

    /** Depuis un cours precis : le professeur, la date et le motif sont deja
     *  connus, il n'y a plus rien a ressaisir de memoire. */
    const signalerDepuisLeCours = (c: CoursDuJour) => {
        if (!c.enseignant_prevu_id) return;
        setSignalement((v) => ({ ...v, enseignant_id: String(c.enseignant_prevu_id) }));
        setCoursCoches([c.seance_id]);
        document.getElementById('signalement-cours')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    /** Les cours de CE professeur ce jour-la. Au primaire la liste est vide :
     *  il n'a pas d'emploi du temps par heure, il tient sa classe. */
    const coursDuProf = useMemo(
        () => (signalement.enseignant_id
            ? coursDuJour.filter((c) => String(c.enseignant_prevu_id) === signalement.enseignant_id)
            : []),
        [coursDuJour, signalement.enseignant_id],
    );

    // Changer de professeur ou de jour vide les cases : cocher l'heure d'un
    // autre serait pire que ne rien cocher.
    useEffect(() => { setCoursCoches([]); }, [signalement.enseignant_id, signalement.date_absence]);

    const envoyerSignalement = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!signalement.enseignant_id) return;
        setSignalEnCours(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await api.post('/api/vie-scolaire/absences-enseignant', {
                employe_id: `ENS_${signalement.enseignant_id}`,
                date_absence: signalement.date_absence,
                motif: signalement.motif.trim() || null,
                est_justifie: signalement.est_justifie,
                // Au collège et au lycée, on désigne les heures manquées ; au
                // primaire il n'y en a pas à choisir, c'est la journée.
                seance_ids: coursCoches,
            });
            setSuccess(`${res.data?.employe || 'Enseignant'} — ${res.data?.message || 'Signalement transmis.'}`);
            setSignalement((v) => ({ ...v, enseignant_id: '', motif: '', est_justifie: false }));
            setCoursCoches([]);
            chargerCoursDuJour();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSignalEnCours(false);
        }
    };

    const bilanAppel = useMemo(() => {
        const l = feuille?.eleves || [];
        return {
            absents: l.filter((e) => e.statut === 'ABSENT').length,
            retards: l.filter((e) => e.statut === 'RETARD').length,
            nonJustifies: l.filter((e) => e.statut !== 'PRESENT' && !e.est_justifie).length,
        };
    }, [feuille]);

    const loadSurveillance = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [presenceRes, incidentStatsRes, incidentsRes, elevesRes, classesRes, profsRes] = await Promise.all([
                api.get<PresenceStats>(`/api/vie-scolaire/presences/stats?etablissement_id=${etablissementId}`),
                api.get<IncidentStats>(`/api/vie-scolaire/incidents/stats?etablissement_id=${etablissementId}`),
                // Seuls les incidents OUVERTS : une fois reglé, l'incident quitte la
                // liste. Elle sert à savoir ce qu'il reste à traiter, pas à
                // conserver un historique — celui-ci reste dans les statistiques.
                api.get<IncidentItem[]>(`/api/vie-scolaire/incidents?etablissement_id=${etablissementId}&statut=OUVERT&limit=30`),
                api.get<EleveOption[]>(`/api/eleves?etablissement_id=${etablissementId}&annee_id=${anneeId}&statut=ACTIF&limit=120`),
                api.get<ClasseAppel[]>(`/api/classes?annee_id=${anneeId}&limit=200`),
                api.get<ProfOption[]>(`/api/enseignants?limit=200`),
            ]);
            setClasses(classesRes.data || []);
            setProfs(Array.isArray(profsRes.data) ? profsRes.data : []);
            // Le rangement par cycle ne doit pas empêcher l'écran de s'ouvrir :
            // s'il échoue, on retombe sur la liste à plat.
            api.get<{ groupes: GroupeCycle[] }>('/api/vie-scolaire/enseignants-par-cycle')
                .then((r) => setCycles(r.data?.groupes || []))
                .catch(() => setCycles([]));
            setPresenceStats(presenceRes.data || { total: 0, presents: 0, absents: 0, retards: 0, taux_presence: 0 });
            setIncidentStats(incidentStatsRes.data || { total_incidents: 0, par_gravite: [], top_types: [] });
            setIncidents(incidentsRes.data || []);
            setEleves(elevesRes.data || []);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [anneeId, etablissementId]);

    useEffect(() => {
        loadSurveillance();
    }, [loadSurveillance]);

    /* TROUVER UN ELEVE PARMI MILLE
       La liste deroulante chargeait les 120 premiers eleves de l'ecole. Dans
       une ecole de mille, huit eleves sur dix etaient introuvables — et rien
       ne le disait : la liste s'ouvrait normalement, simplement incomplete.
       On interroge donc le serveur, qui cherche sur nom, prenom et matricule
       dans TOUTE l'ecole. */
    const [rechercheEleve, setRechercheEleve] = useState('');
    const [resultatsEleves, setResultatsEleves] = useState<EleveOption[]>([]);
    const [rechercheLoading, setRechercheLoading] = useState(false);
    const [eleveChoisi, setEleveChoisi] = useState<EleveOption | null>(null);

    useEffect(() => {
        const terme = rechercheEleve.trim();
        if (terme.length < 2) { setResultatsEleves([]); return; }

        // On attend que la frappe se pose : sans cela, « Fatoumata » lance
        // neuf recherches et la reponse la plus lente ecrase la bonne.
        let annule = false;
        setRechercheLoading(true);
        const minuteur = setTimeout(() => {
            api.get<EleveOption[]>(
                `/api/eleves?statut=ACTIF&limit=25&search=${encodeURIComponent(terme)}`)
                .then((res) => { if (!annule) setResultatsEleves(res.data || []); })
                .catch(() => { if (!annule) setResultatsEleves([]); })
                .finally(() => { if (!annule) setRechercheLoading(false); });
        }, 280);

        return () => { annule = true; clearTimeout(minuteur); };
    }, [rechercheEleve]);

    const submitIncident = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Un incident concerne toujours un élève : sans sélection, on le dit
        // clairement au lieu d'envoyer une requête qui échouerait côté serveur.
        if (!form.eleve_id) {
            setError("Sélectionnez d'abord l'élève concerné par l'incident.");
            return;
        }
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await api.post('/api/vie-scolaire/incidents', {
                eleve_id: Number(form.eleve_id),
                etablissement_id: etablissementId,
                type_incident: form.type_incident,
                gravite: form.gravite,
                description: form.description.trim(),
                signale_par: `${user?.prenom || ''} ${user?.nom || ''}`.trim() || user?.role || 'SURVEILLANT',
            });
            setSuccess('Incident déclaré et visible dans la vie scolaire. La direction pourra suivre son traitement.');
            setForm({ eleve_id: '', type_incident: 'DISCIPLINE', gravite: 'MOYENNE', description: '' });
            setShowForm(false);
            await loadSurveillance();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const [montrerPointage, setMontrerPointage] = useState(false);

    const kpis = [
        // Les libelles annoncaient « 30 jours » alors que la fenetre est
        // l'annee scolaire, et le taux se disait « sur N pointages » alors
        // qu'il se calcule sur l'effectif attendu. Un indicateur qui se
        // trompe sur sa propre periode ne se verifie pas.
        { label: 'Taux de présence', value: `${presenceStats.taux_presence || 0}%`, note: 'sur l’année scolaire en cours', icon: UserCheck, color: '#16a34a' },
        { label: 'Absences de l’année', value: String(presenceStats.absents || 0), note: `dont ${presenceStats.absences_non_justifiees ?? 0} non justifiée(s)`, icon: AlertTriangle, color: '#dc2626' },
        { label: 'Retards de l’année', value: String(presenceStats.retards || 0), note: 'signaux faibles de discipline', icon: CalendarClock, color: '#f59e0b' },
        { label: 'Incidents 90 jours', value: String(incidentStats.total_incidents || 0), note: 'déclarés dans la vie scolaire', icon: ClipboardList, color: '#7c3aed' },
    ];

    // C'est le surveillant qui pointe les enseignants, depuis son espace :
    // scanner le badge, saisir à la main (sans courant/caméra), ou consulter
    // et nettoyer l'historique. Le scan marche sur téléphone/tablette/ordinateur.
    if (montrerPointage) {
        return <PointageEnseignants onRetour={() => setMontrerPointage(false)} />;
    }

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f0fdf4 0%, #eff6ff 48%, #ffffff 100%)', padding: '24px' }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '34px', padding: '28px', background: 'linear-gradient(135deg, #dcfce7 0%, #dbeafe 50%, #fef9c3 100%)', border: '1px solid rgba(22,163,74,0.14)', boxShadow: '0 30px 80px rgba(20,83,45,0.12)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(34,197,94,0.22), transparent 25%), radial-gradient(circle at bottom left, rgba(59,130,246,0.18), transparent 30%)' }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(310px, 0.7fr)', gap: '22px', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(22,163,74,0.16)', color: '#15803d', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    <Radio size={14} /> Poste SG / surveillance
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '12px', fontWeight: 800 }}>
                                    Absences globales & discipline
                                </span>
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 'clamp(2.1rem, 3.4vw, 3.5rem)', fontWeight: 950, letterSpacing: '-0.055em', color: '#14532d' }}>Surveillance scolaire</h1>
                                <p style={{ margin: '12px 0 0', fontSize: '16px', lineHeight: 1.85, color: '#475569', maxWidth: '780px' }}>
                                    Espace terrain aligné avec le PDF SmartSchool : tableau global des présences, retards, absences répétées et déclaration d’incidents disciplinaires, sans passer par l’interface admin.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {/* C'est le surveillant qui pointe les enseignants (badge QR). */}
                                <button type="button" onClick={() => setMontrerPointage(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 34px rgba(37,99,235,0.24)' }}>
                                    <QrCode size={18} /> Pointage enseignants
                                </button>
                                <button type="button" onClick={() => setShowForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: 'none', background: '#16a34a', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 34px rgba(22,163,74,0.24)' }}>
                                    <Plus size={18} /> Déclarer un incident
                                </button>
                                <button type="button" onClick={loadSurveillance} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: '1px solid rgba(22,163,74,0.18)', background: 'rgba(255,255,255,0.76)', color: '#166534', fontWeight: 900, cursor: loading ? 'wait' : 'pointer' }}>
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Rafraîchir
                                </button>
                            </div>
                        </div>

                        <aside style={{ background: 'rgba(255,255,255,0.78)', borderRadius: '28px', border: '1px solid rgba(22,163,74,0.12)', padding: '22px', boxShadow: '0 20px 50px rgba(22,163,74,0.10)', backdropFilter: 'blur(18px)' }}>
                            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: '#16a34a', fontWeight: 900, letterSpacing: '0.08em' }}>Session connectée</p>
                            <h3 style={{ margin: '7px 0 14px', fontSize: '22px', fontWeight: 950, color: '#052e16' }}>{user?.prenom} {user?.nom}</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[
                                    { label: 'Rôle', value: roleConfig?.label || user?.role || 'Surveillant' },
                                    { label: 'Mission PDF', value: 'Absences globales / discipline' },
                                    { label: 'Établissement', value: etablissementNom || `#${etablissementId}` },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: '#f0fdf4', border: '1px solid #dcfce7' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#16a34a', fontWeight: 900 }}>{item.label}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#14532d', fontWeight: 900 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            <Link href="/login" onClick={(e) => { e.preventDefault(); logout(); }} style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '14px', background: '#14532d', color: 'white', fontWeight: 900, textDecoration: 'none' }}>
                                Déconnexion
                            </Link>
                        </aside>
                    </div>
                </section>

                {/* ═══ LES COURS DU JOUR ═══
                    Le surveillant ne signalait que ce qu'il remarquait de
                    lui-meme. L'emploi du temps sait quels cours sont prevus :
                    un cours reste « a venir » en fin de journee est un cours
                    qui n'a pas eu lieu. */}
                <section style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #eff6ff)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#2563eb', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Emploi du temps</p>
                            <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Les cours du jour</h2>
                            <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#64748b', maxWidth: '660px', lineHeight: 1.65 }}>
                                Ce qui reste <strong>à venir</strong> en fin de journée n&apos;a pas été assuré.
                                Signalez directement depuis le cours : le professeur et l&apos;heure sont déjà connus.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {[
                                { l: 'Prévus', v: coursDuJour.length, c: '#2563eb' },
                                { l: 'Non assurés', v: coursDuJour.filter((c) => c.statut === 'PREVUE').length, c: '#b45309' },
                                { l: 'Appel fait', v: coursDuJour.filter((c) => c.appel_fait).length, c: '#16a34a' },
                            ].map((x) => (
                                <div key={x.l} style={{ padding: '10px 14px', borderRadius: '14px', background: `${x.c}10`, border: `1px solid ${x.c}25`, minWidth: '92px' }}>
                                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: x.c }}>{x.l}</p>
                                    <p style={{ margin: '3px 0 0', fontSize: '22px', fontWeight: 950, color: '#0f172a' }}>{x.v}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        {coursLoading ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                <Loader2 size={20} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
                                Lecture de l&apos;emploi du temps…
                            </p>
                        ) : coursDuJour.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                Aucun cours prévu ce jour-là — week-end ou emploi du temps vide.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '420px', overflowY: 'auto' }}>
                                {coursDuJour.map((c, idx) => {
                                    const nonAssure = c.statut === 'PREVUE';
                                    return (
                                        <div key={c.seance_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 24px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', background: nonAssure ? '#fffbeb' : 'transparent', flexWrap: 'wrap' }}>
                                            <div style={{ minWidth: '110px' }}>
                                                <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>
                                                    {c.heure_debut_prevue?.slice(0, 5)}–{c.heure_fin_prevue?.slice(0, 5)}
                                                </p>
                                            </div>
                                            <div style={{ minWidth: '200px', flex: '1 1 220px' }}>
                                                <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>{c.matiere}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>{c.classe}</p>
                                            </div>
                                            <div style={{ minWidth: '170px', flex: '1 1 170px' }}>
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                                                    {c.enseignant_reel || c.enseignant_prevu}
                                                </p>
                                                {c.enseignant_reel && c.enseignant_reel !== c.enseignant_prevu && (
                                                    <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#0284c7', fontWeight: 700 }}>
                                                        remplace {c.enseignant_prevu}
                                                    </p>
                                                )}
                                            </div>
                                            <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 800, background: nonAssure ? '#fef3c7' : '#f0fdf4', color: nonAssure ? '#92400e' : '#166534' }}>
                                                {nonAssure ? 'À venir' : c.statut === 'EFFECTUEE' ? 'Effectué' : c.statut}
                                            </span>
                                            {nonAssure && c.enseignant_prevu_id && (
                                                <button type="button" onClick={() => signalerDepuisLeCours(c)}
                                                    style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: '12px', border: '1px solid #f59e0b', background: 'white', color: '#b45309', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>
                                                    Signaler ce cours
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* ═══ HISTORIQUE DES APPELS ═══
                    Le surveillant retrouve, pour un jour et une classe, ce que
                    chaque cours a donné à l'appel — présents, absents, retards —
                    sans se déplacer de classe en classe. La direction et le
                    fondateur ont la même vue dans « Séances pédagogiques ». */}
                <section style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #eef2ff)' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#4f46e5', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Traçabilité</p>
                        <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Historique des appels</h2>
                        <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#64748b', maxWidth: '640px' }}>
                            Quel jour, quelle classe, quelle matière : l&apos;appel qui a été fait, et son résultat. Cliquez une ligne pour la liste nominative.
                        </p>
                    </div>

                    <div style={{ padding: '16px 24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', borderBottom: '1px solid #f1f5f9' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                            Jour
                            <input type="date" value={histDate} max={new Date().toISOString().slice(0, 10)}
                                onChange={(e) => setHistDate(e.target.value)}
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569', minWidth: '210px', flex: '1 1 210px' }}>
                            Classe
                            <select value={histClasse} onChange={(e) => setHistClasse(e.target.value)}
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }}>
                                <option value="">Toutes les classes</option>
                                {classes.map((cl) => <option key={cl.classe_id} value={cl.classe_id}>{cl.libelle}</option>)}
                            </select>
                        </label>
                    </div>

                    <div>
                        {histLoading ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                <Loader2 size={20} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} /> Chargement…
                            </p>
                        ) : histSeances.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                Aucun cours ce jour-là — week-end, ou emploi du temps vide.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '460px', overflowY: 'auto' }}>
                                {histSeances.map((s, idx) => {
                                    const fait = s.appel_fait;
                                    return (
                                        <button key={s.seance_id} type="button" onClick={() => ouvrirDetailSeance(s.seance_id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 24px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', background: 'transparent', flexWrap: 'wrap', textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }}>
                                            <div style={{ minWidth: '104px' }}>
                                                <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>{s.heure_debut_prevue?.slice(0, 5)}–{s.heure_fin_prevue?.slice(0, 5)}</p>
                                            </div>
                                            <div style={{ minWidth: '200px', flex: '1 1 220px' }}>
                                                <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>{s.matiere}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>{s.classe} · {s.enseignant_reel || s.enseignant_prevu}</p>
                                            </div>
                                            {fait ? (
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ padding: '5px 11px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: '#f0fdf4', color: '#166534' }}>{s.nb_presents ?? 0} présents</span>
                                                    <span style={{ padding: '5px 11px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: '#fef2f2', color: '#991b1b' }}>{s.nb_absents ?? 0} absents</span>
                                                    <span style={{ padding: '5px 11px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: '#fffbeb', color: '#92400e' }}>{s.nb_retards ?? 0} retards</span>
                                                </div>
                                            ) : (
                                                <span style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: '#f1f5f9', color: '#64748b' }}>
                                                    {s.statut === 'NON_EFFECTUEE' ? 'Cours non assuré' : 'Appel non fait'}
                                                </span>
                                            )}
                                            <Search size={15} style={{ color: '#cbd5e1', marginLeft: fait ? 'auto' : '0' }} />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* Détail nominatif d'une séance de l'historique. */}
                {histDetail && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)', zIndex: 90, display: 'grid', placeItems: 'center', padding: '20px' }} onClick={() => setHistDetail(null)}>
                        <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 40px 90px rgba(15,23,42,0.28)' }}>
                            <div style={{ padding: '20px 22px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => setHistDetail(null)} style={{ width: 34, height: 34, borderRadius: '11px', border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={17} /></button>
                                </div>
                                <p style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{histDetail.matiere}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', opacity: 0.9 }}>{histDetail.classe} · {histDetail.date_seance} · {histDetail.heure_debut_prevue?.slice(0, 5)}–{histDetail.heure_fin_prevue?.slice(0, 5)}</p>
                                <p style={{ margin: '6px 0 0', fontSize: '12.5px', opacity: 0.9 }}>{histDetail.enseignant_reel || histDetail.enseignant_prevu}</p>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 4px' }}>
                                {histDetail.eleves.length === 0 ? (
                                    <p style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontWeight: 700, fontSize: '13.5px' }}>Aucun appel enregistré pour cette séance.</p>
                                ) : histDetail.eleves.map((e, i) => {
                                    const c = e.statut === 'PRESENT' ? '#16a34a' : e.statut === 'RETARD' ? '#f59e0b' : e.statut === 'ABSENT_JUSTIFIE' ? '#8b5cf6' : '#dc2626';
                                    const l = e.statut === 'PRESENT' ? 'Présent' : e.statut === 'RETARD' ? 'Retard' : e.statut === 'ABSENT_JUSTIFIE' ? 'Excusé' : 'Absent';
                                    return (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid #f1f5f9' }}>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>{e.eleve}</p>
                                                {e.matricule && <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{e.matricule}</p>}
                                            </div>
                                            <span style={{ fontSize: '12px', fontWeight: 800, padding: '3px 11px', borderRadius: '999px', background: `${c}18`, color: c }}>{l}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {histDetail.eleves.length > 0 && (
                                <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => supprimerAppelSeance(histDetail.seance_id)}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 16px', borderRadius: '12px', border: '1px solid #fecaca', background: 'white', color: '#b91c1c', fontWeight: 800, cursor: 'pointer' }}>
                                        <Trash2 size={15} /> Supprimer l&apos;appel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ SIGNALER L'ABSENCE D'UN ENSEIGNANT ═══
                    Constater n'est pas decider : ce formulaire cree un
                    signalement, jamais une retenue. */}
                <section id="signalement-cours" style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #fff7ed)' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#b45309', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Corps enseignant</p>
                        <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Signaler un cours non assuré</h2>
                        <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#64748b', maxWidth: '660px', lineHeight: 1.65 }}>
                            Vous constatez, la direction tranche. <strong>Aucune retenue n&apos;est appliquée
                            tant que votre signalement n&apos;a pas été validé</strong> — vous ne décidez
                            jamais seul de ce qui sera retiré d&apos;un salaire.
                        </p>
                    </div>

                    <form onSubmit={envoyerSignalement} style={{ padding: '20px 24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569', flex: '1 1 240px' }}>
                            Enseignant
                            <select required value={signalement.enseignant_id}
                                onChange={(e) => setSignalement((v) => ({ ...v, enseignant_id: e.target.value }))}
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }}>
                                <option value="">Choisir…</option>
                                {/* Rangés par cycle : le surveillant sait dans quel
                                    cycle il vient de constater l'absence. Un
                                    professeur qui enseigne dans deux cycles apparaît
                                    dans celui où il a le plus de classes, et sa
                                    ligne le dit — le classer ailleurs en silence
                                    serait plus déroutant que de ne pas le classer. */}
                                {cycles.length > 0 ? cycles.map((g) => (
                                    <optgroup key={g.code} label={`${g.libelle} — ${g.enseignants.length}`}>
                                        {g.enseignants.map((pr) => (
                                            <option key={pr.enseignant_id} value={pr.enseignant_id}>
                                                {pr.nom} {pr.prenom}
                                                {pr.autres_cycles.length ? ` (aussi ${pr.autres_cycles.join(', ')})` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )) : profs.map((pr) => (
                                    <option key={pr.enseignant_id} value={pr.enseignant_id}>
                                        {pr.nom} {pr.prenom}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                            Jour
                            <input type="date" required value={signalement.date_absence}
                                max={new Date().toISOString().slice(0, 10)}
                                onChange={(e) => setSignalement((v) => ({ ...v, date_absence: e.target.value }))}
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569', flex: '2 1 280px' }}>
                            Ce que vous avez constaté
                            <input value={signalement.motif}
                                onChange={(e) => setSignalement((v) => ({ ...v, motif: e.target.value }))}
                                placeholder="Cours de 8h non assuré, classe restée sans professeur…"
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '14px' }} />
                        </label>
                        {/* QUELLES HEURES, EXACTEMENT
                            Un professeur du collège peut manquer son cours de
                            8 h et revenir assurer celui de 11 h, dans la même
                            classe ou dans une autre. Signaler « absent le 14 »
                            serait faux. Au primaire il n'y a rien à cocher :
                            le maître tient sa classe toute la journée. */}
                        {signalement.enseignant_id && (
                            <div style={{ flex: '1 1 100%', padding: '14px 16px', borderRadius: '16px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                                {coursDuProf.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: '13px', color: '#92400e', fontWeight: 700 }}>
                                        Aucune heure à l&apos;emploi du temps ce jour-là — le signalement
                                        porte sur la <strong>journée entière</strong>. C&apos;est le cas
                                        normal au primaire : le maître tient sa classe toute la journée.
                                    </p>
                                ) : (
                                    <>
                                        <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e' }}>
                                            Quelles heures n&apos;a-t-il pas assurées ?
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                            {coursDuProf.map((c) => {
                                                const coche = coursCoches.includes(c.seance_id);
                                                const fait = c.statut === 'EFFECTUEE';
                                                return (
                                                    <label key={c.seance_id}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '12px', background: fait ? '#f1f5f9' : coche ? '#fee2e2' : 'white', border: `1px solid ${coche ? '#dc2626' : '#e2e8f0'}`, cursor: fait ? 'not-allowed' : 'pointer', opacity: fait ? 0.6 : 1 }}>
                                                        <input type="checkbox" checked={coche} disabled={fait}
                                                            onChange={() => setCoursCoches((v) => v.includes(c.seance_id)
                                                                ? v.filter((x) => x !== c.seance_id)
                                                                : [...v, c.seance_id])}
                                                            style={{ width: 17, height: 17, cursor: fait ? 'not-allowed' : 'pointer' }} />
                                                        <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', minWidth: '104px' }}>
                                                            {c.heure_debut_prevue?.slice(0, 5)}–{c.heure_fin_prevue?.slice(0, 5)}
                                                        </span>
                                                        <span style={{ fontSize: '13px', color: '#334155', flex: 1 }}>
                                                            {c.matiere} · {c.classe}
                                                        </span>
                                                        {fait && (
                                                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534' }}>
                                                                appel fait — cours assuré
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {coursCoches.length === 0 && (
                                            <p style={{ margin: '9px 0 0', fontSize: '12.5px', color: '#a16207', fontWeight: 700 }}>
                                                Sans heure cochée, le signalement portera sur la journée entière.
                                            </p>
                                        )}
                                    </>
                                )}

                                <label style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '12px', fontSize: '13px', fontWeight: 800, color: '#92400e', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={signalement.est_justifie}
                                        onChange={(e) => setSignalement((v) => ({ ...v, est_justifie: e.target.checked }))}
                                        style={{ width: 17, height: 17, cursor: 'pointer' }} />
                                    Absence justifiée (aucune retenue ne sera proposée)
                                </label>
                            </div>
                        )}

                        <button type="submit" disabled={signalEnCours || !signalement.enseignant_id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '14px', border: 'none', background: '#b45309', color: 'white', fontWeight: 900, fontSize: '14px', cursor: signalEnCours ? 'wait' : 'pointer', opacity: signalement.enseignant_id ? 1 : 0.55 }}>
                            {signalEnCours ? <Loader2 size={17} className="animate-spin" /> : <AlertTriangle size={17} />}
                            Transmettre à la direction
                        </button>
                    </form>
                </section>

                {(error || success) && (
                    <div style={{ padding: '14px 18px', borderRadius: '18px', background: error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`, color: error ? '#991b1b' : '#166534', fontWeight: 800 }}>
                        {error || success}
                    </div>
                )}

                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    {kpis.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <motion.div key={item.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} whileHover={{ y: -5 }} style={{ padding: '20px', borderRadius: '26px', background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 20px 50px rgba(15,23,42,0.06)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '18px', background: `${item.color}14`, color: item.color, display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
                                    <Icon size={21} />
                                </div>
                                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
                                <p style={{ margin: '8px 0 4px', fontSize: '32px', color: '#0f172a', fontWeight: 950 }}>{loading ? '…' : item.value}</p>
                                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{item.note}</p>
                            </motion.div>
                        );
                    })}
                </section>

                {/* ═══ FAIRE L'APPEL ═══
                    Le geste central du metier de surveillant. Il ne figurait
                    nulle part : son espace affichait un taux d'absence qu'il
                    n'avait aucun moyen d'alimenter. */}
                <section style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #f0fdf4)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#16a34a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Appel</p>
                            <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Faire l&apos;appel</h2>
                            <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#64748b', maxWidth: '620px' }}>
                                Tout le monde est présent par défaut : ne marquez que ceux qui manquent.
                                Rouvrir une feuille déjà pointée affiche ce qui a été saisi, sans l&apos;effacer.
                            </p>
                        </div>
                        {feuille && (
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {[
                                    { l: 'Absents', v: bilanAppel.absents, c: '#dc2626' },
                                    { l: 'Retards', v: bilanAppel.retards, c: '#f59e0b' },
                                    { l: 'Non justifiés', v: bilanAppel.nonJustifies, c: '#7c3aed' },
                                    // Le portail d'entrée, à côté de l'appel : « entré,
                                    // mais absent de ce cours » est le chiffre qu'aucun
                                    // des deux contrôles ne pouvait donner seul.
                                    { l: 'Entrés à l’école', v: feuille.portail?.pointes ?? 0, c: '#0284c7' },
                                    { l: 'Entrés, absents ici', v: feuille.portail?.entres_mais_absents ?? 0, c: '#b45309' },
                                ].map((x) => (
                                    <div key={x.l} style={{ padding: '10px 14px', borderRadius: '14px', background: `${x.c}10`, border: `1px solid ${x.c}25`, minWidth: '92px' }}>
                                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: x.c }}>{x.l}</p>
                                        <p style={{ margin: '3px 0 0', fontSize: '22px', fontWeight: 950, color: '#0f172a' }}>{x.v}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '18px 24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', borderBottom: '1px solid #f1f5f9' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569', minWidth: '210px', flex: '1 1 210px' }}>
                            Classe
                            <select value={appelClasse} onChange={(e) => setAppelClasse(e.target.value)}
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }}>
                                <option value="">Choisir une classe…</option>
                                {classes.map((cl) => <option key={cl.classe_id} value={cl.classe_id}>{cl.libelle}</option>)}
                            </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                            Jour
                            <input type="date" value={appelDate} onChange={(e) => setAppelDate(e.target.value)}
                                style={{ padding: '11px 12px', borderRadius: '13px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, fontSize: '14px' }} />
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                            Demi-journée
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {(['MATIN', 'SOIR'] as const).map((d) => (
                                    <button key={d} type="button" onClick={() => setAppelDemi(d)}
                                        style={{ padding: '11px 18px', borderRadius: '13px', border: appelDemi === d ? '1px solid #16a34a' : '1px solid #e2e8f0', background: appelDemi === d ? '#16a34a' : '#f8fafc', color: appelDemi === d ? 'white' : '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
                                        {d === 'MATIN' ? 'Matin' : 'Après-midi'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {feuille && (
                            <button type="button" onClick={enregistrerAppel} disabled={appelSaving}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '14px', border: 'none', background: '#16a34a', color: 'white', fontWeight: 900, fontSize: '14px', cursor: appelSaving ? 'wait' : 'pointer', boxShadow: '0 14px 28px rgba(22,163,74,0.22)', marginLeft: 'auto' }}>
                                {appelSaving ? <Loader2 size={17} className="animate-spin" /> : <UserCheck size={17} />}
                                Enregistrer l&apos;appel
                            </button>
                        )}
                    </div>

                    {/* QUI FAIT CET APPEL
                        Au primaire un seul maitre tient la classe : le
                        designer d'office evite de demander au surveillant une
                        information que le logiciel connait deja. Au college et
                        au lycee la classe change de professeur a chaque heure,
                        et l'appel se fait par matiere. */}
                    {feuille && feuille.est_primaire && (
                        <div style={{ padding: '14px 24px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <UserCheck size={17} style={{ color: '#16a34a' }} />
                            <span style={{ fontSize: '13.5px', color: '#166534', fontWeight: 800 }}>
                                {feuille.responsable
                                    ? `Instituteur : ${feuille.responsable.nom}`
                                    : 'Aucun instituteur affecte a cette classe'}
                            </span>
                            <span style={{ fontSize: '12.5px', color: '#15803d' }}>
                                {feuille.responsable
                                    ? `— il tient la classe toute la journee (${feuille.responsable.nb_matieres} matieres)`
                                    : '— affectez-le depuis la fiche de la classe.'}
                            </span>
                        </div>
                    )}

                    {feuille && !feuille.est_primaire && (
                        <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafcff' }}>
                            <p style={{ margin: '0 0 9px', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                                L&apos;heure de cours — choisir la matiere designe le professeur
                            </p>
                            {feuille.creneaux.length === 0 ? (
                                <p style={{ margin: 0, fontSize: '13px', color: '#b45309', fontWeight: 700 }}>
                                    Aucun cours prevu ce jour-la dans l&apos;emploi du temps de la classe.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {feuille.creneaux.map((cr) => {
                                        const actif = appelCreneau === cr.creneau_id;
                                        return (
                                            <button key={cr.creneau_id} type="button"
                                                onClick={() => setAppelCreneau(actif ? null : cr.creneau_id)}
                                                style={{ textAlign: 'left', padding: '9px 13px', borderRadius: '13px', cursor: 'pointer', border: actif ? '1px solid #16a34a' : '1px solid #e2e8f0', background: actif ? '#16a34a' : 'white', color: actif ? 'white' : '#334155' }}>
                                                <span style={{ display: 'block', fontSize: '13px', fontWeight: 800 }}>
                                                    {cr.heure_debut}–{cr.heure_fin} · {cr.matiere}
                                                </span>
                                                <span style={{ display: 'block', fontSize: '11.5px', marginTop: '2px', color: actif ? 'rgba(255,255,255,0.86)' : '#94a3b8', fontWeight: 700 }}>
                                                    {cr.enseignant || 'Aucun professeur affecte'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {!appelCreneau && feuille.creneaux.length > 0 && (
                                <p style={{ margin: '9px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                                    Sans heure choisie, l&apos;appel porte sur la demi-journee entiere.
                                </p>
                            )}
                        </div>
                    )}

                    <div style={{ padding: '8px 0 18px' }}>
                        {appelLoading ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                <Loader2 size={20} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
                                Chargement de la feuille…
                            </p>
                        ) : !feuille ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                Choisissez une classe pour commencer l&apos;appel.
                            </p>
                        ) : feuille.eleves.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '34px', color: '#94a3b8', fontWeight: 700 }}>
                                Aucun élève inscrit dans cette classe.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {feuille.eleves.map((el, idx) => {
                                    const absent = el.statut === 'ABSENT';
                                    const retard = el.statut === 'RETARD';
                                    return (
                                        <div key={el.inscription_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 24px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', background: absent ? '#fef2f2' : retard ? '#fffbeb' : 'transparent', flexWrap: 'wrap' }}>
                                            <div style={{ minWidth: '230px', flex: '1 1 230px' }}>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{el.nom} {el.prenom}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                                                    <span>{el.matricule}</span>
                                                    {/* CE QUE DIT LE PORTAIL
                                                        La carte prouve qu'il est dans l'école ; l'appel
                                                        prouve qu'il est en cours. Les deux ne disent pas
                                                        la même chose, et l'écart se voit ici. */}
                                                    {el.pointe_a_l_ecole ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: el.entre_mais_absent ? '#fef2f2' : '#f0fdf4', color: el.entre_mais_absent ? '#991b1b' : '#166534', fontWeight: 800, fontSize: '10.5px' }}>
                                                            <QrCode size={10} />
                                                            {el.entre_mais_absent
                                                                ? `entré à ${el.heure_arrivee} — absent de ce cours`
                                                                : `entré à ${el.heure_arrivee}`}
                                                        </span>
                                                    ) : (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: '#f8fafc', color: '#94a3b8', fontWeight: 800, fontSize: '10.5px' }}>
                                                            carte non scannée
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {([
                                                    { s: 'PRESENT' as const, l: 'Présent', c: '#16a34a' },
                                                    { s: 'ABSENT' as const, l: 'Absent', c: '#dc2626' },
                                                    { s: 'RETARD' as const, l: 'Retard', c: '#f59e0b' },
                                                ]).map((o) => (
                                                    <button key={o.s} type="button" onClick={() => marquer(el.inscription_id, o.s)}
                                                        style={{ padding: '7px 14px', borderRadius: '11px', border: el.statut === o.s ? `1px solid ${o.c}` : '1px solid #e2e8f0', background: el.statut === o.s ? o.c : 'white', color: el.statut === o.s ? 'white' : '#64748b', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>
                                                        {o.l}
                                                    </button>
                                                ))}
                                            </div>
                                            {el.statut !== 'PRESENT' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px' }}>
                                                    <button type="button" onClick={() => basculerJustifie(el.inscription_id)}
                                                        style={{ padding: '7px 13px', borderRadius: '11px', border: el.est_justifie ? '1px solid #0284c7' : '1px solid #e2e8f0', background: el.est_justifie ? '#e0f2fe' : 'white', color: el.est_justifie ? '#075985' : '#94a3b8', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                        {el.est_justifie ? 'Justifié' : 'Non justifié'}
                                                    </button>
                                                    <input value={el.motif || ''} onChange={(e) => changerMotif(el.inscription_id, e.target.value)}
                                                        placeholder="Motif (maladie, rendez-vous…)"
                                                        style={{ flex: 1, minWidth: '150px', padding: '8px 11px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', fontSize: '13px' }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
                <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 330px', gap: '20px', alignItems: 'start' }}>
                    <main style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #f0fdf4)' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#16a34a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Main courante réelle</p>
                            <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Derniers incidents déclarés</h2>
                        </div>
                        {loading ? (
                            <div style={{ minHeight: '260px', display: 'grid', placeItems: 'center', color: '#16a34a', fontWeight: 900 }}>
                                <Loader2 size={28} className="animate-spin" /> Chargement de la vie scolaire…
                            </div>
                        ) : incidents.length === 0 ? (
                            <div style={{ padding: '52px 24px', textAlign: 'center' }}>
                                <div style={{ width: 84, height: 84, borderRadius: '28px', margin: '0 auto 18px', background: '#f0fdf4', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
                                    <Shield size={34} />
                                </div>
                                <h3 style={{ margin: 0, color: '#14532d', fontSize: '22px', fontWeight: 950 }}>Aucun incident récent</h3>
                                <p style={{ margin: '10px auto 0', maxWidth: '520px', color: '#64748b', lineHeight: 1.7 }}>La main courante reste vide tant qu’aucun fait disciplinaire n’est enregistré.</p>
                            </div>
                        ) : (
                            <div style={{ padding: '20px 24px', display: 'grid', gap: '12px' }}>
                                {incidents.map((incident) => {
                                    const eleve = eleves.find((item) => item.eleve_id === incident.eleve_id);
                                    const tone = incident.gravite === 'GRAVE' ? '#dc2626' : incident.gravite === 'MOYENNE' ? '#f59e0b' : '#16a34a';
                                    return (
                                        <article key={incident.incident_id} style={{ padding: '16px', borderRadius: '20px', background: '#fcfdff', border: '1px solid #edf2f7', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px' }}>
                                            <div>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span style={{ padding: '5px 9px', borderRadius: 999, background: `${tone}14`, color: tone, fontSize: '11px', fontWeight: 900 }}>{incident.gravite}</span>
                                                    <span style={{ padding: '5px 9px', borderRadius: 999, background: '#f8fafc', color: '#475569', fontSize: '11px', fontWeight: 900 }}>{incident.type_incident}</span>
                                                    <span style={{ padding: '5px 9px', borderRadius: 999, background: incident.statut === 'TRAITE' ? '#f0fdf4' : '#fff7ed', color: incident.statut === 'TRAITE' ? '#166534' : '#9a3412', fontSize: '11px', fontWeight: 900 }}>{incident.statut}</span>
                                                </div>
                                                <h3 style={{ margin: '10px 0 0', color: '#0f172a', fontSize: '16px', fontWeight: 950 }}>{eleve ? `${eleve.prenom} ${eleve.nom}` : `Élève #${incident.eleve_id}`}</h3>
                                                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px', lineHeight: 1.65 }}>{incident.description}</p>
                                            </div>
                                            <div style={{ textAlign: 'right', display: 'grid', gap: '10px', justifyItems: 'end' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 800 }}>
                                                    {incident.date_incident || 'Aujourd’hui'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => reglerIncident(incident.incident_id)}
                                                    disabled={incidentEnCours === incident.incident_id}
                                                    style={{ padding: '7px 12px', borderRadius: 999, border: '1px solid #bbf7d0',
                                                             background: '#f0fdf4', color: '#166534', fontSize: '12px',
                                                             fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    {incidentEnCours === incident.incident_id ? 'Enregistrement…' : 'Marquer réglé'}
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </main>

                    <aside style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'sticky', top: '24px' }}>
                        <div style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 22px 54px rgba(15,23,42,0.06)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#16a34a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Types fréquents</p>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                {incidentStats.top_types.length === 0 ? <p style={{ margin: 0, color: '#64748b', lineHeight: 1.7, fontSize: '13px' }}>Les types apparaîtront après les premières déclarations.</p> : incidentStats.top_types.map((item) => (
                                    <div key={item.type} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                        <span style={{ color: '#334155', fontWeight: 850, fontSize: '13px' }}>{item.type}</span>
                                        <strong style={{ color: '#16a34a' }}>{item.count}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: '#052e16', color: 'white', borderRadius: '28px', boxShadow: '0 22px 54px rgba(5,46,22,0.18)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#bbf7d0', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Référence PDF</p>
                            <h3 style={{ margin: '8px 0 0', fontSize: '20px', fontWeight: 950 }}>Vie scolaire terrain</h3>
                            <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: '13px' }}>Le surveillant suit le tableau global des absences, les retards, les incidents et les remontées disciplinaires.</p>
                        </div>
                    </aside>
                </section>

                {showForm && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(10px)', zIndex: 80, display: 'grid', placeItems: 'center', padding: '20px' }}>
                        <motion.form initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} onSubmit={submitIncident} style={{ width: 'min(680px, 100%)', background: 'white', borderRadius: '30px', boxShadow: '0 40px 90px rgba(15,23,42,0.26)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', gap: '14px', background: 'linear-gradient(135deg, #f0fdf4, #eff6ff)' }}>
                                <div>
                                    <p style={{ margin: 0, color: '#16a34a', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nouvel incident</p>
                                    <h2 style={{ margin: '6px 0 0', color: '#111827', fontSize: '24px', fontWeight: 950 }}>Déclarer dans la main courante</h2>
                                </div>
                                <button type="button" onClick={() => setShowForm(false)} style={{ width: 42, height: 42, borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} /></button>
                            </div>
                            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
                                {/* CHERCHER L'ÉLÈVE, PAS LE FAIRE DÉFILER
                                    La liste déroulante était plafonnée aux 120
                                    premiers élèves. Dans une école de mille, le
                                    surveillant ne trouvait pas huit élèves sur
                                    dix — et rien ne le lui disait : la liste
                                    s'ouvrait normalement, simplement incomplète.
                                    On cherche donc côté serveur, par nom,
                                    prénom ou matricule, sur TOUTE l'école. */}
                                <label style={{ display: 'grid', gap: '7px' }}>
                                    <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Élève concerné</span>
                                    {eleveChoisi ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', borderRadius: '15px', border: '1px solid #16a34a', background: '#f0fdf4' }}>
                                            <UserCheck size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                                                    {eleveChoisi.prenom} {eleveChoisi.nom}
                                                </p>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#15803d', fontWeight: 700 }}>
                                                    {eleveChoisi.matricule || 'matricule non renseigné'}
                                                    {eleveChoisi.classe_code ? ` • ${eleveChoisi.classe_code}` : ''}
                                                    {eleveChoisi.niveau ? ` • ${eleveChoisi.niveau}` : ''}
                                                </p>
                                            </div>
                                            <button type="button" onClick={() => { setEleveChoisi(null); setForm((prev) => ({ ...prev, eleve_id: '' })); setRechercheEleve(''); }}
                                                style={{ padding: '7px 13px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                Changer
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                                <Search size={17} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                <input value={rechercheEleve} onChange={(e) => setRechercheEleve(e.target.value)}
                                                    placeholder="Nom, prénom ou matricule…" autoComplete="off"
                                                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '14px', fontWeight: 700, color: '#0f172a' }} />
                                                {rechercheLoading && <Loader2 size={15} className="animate-spin" style={{ color: '#94a3b8' }} />}
                                            </div>
                                            {rechercheEleve.trim().length > 0 && rechercheEleve.trim().length < 2 && (
                                                <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8', fontWeight: 700 }}>
                                                    Tapez au moins deux lettres.
                                                </p>
                                            )}
                                            {rechercheEleve.trim().length >= 2 && !rechercheLoading && resultatsEleves.length === 0 && (
                                                <p style={{ margin: 0, fontSize: '12.5px', color: '#b45309', fontWeight: 700 }}>
                                                    Aucun élève ne correspond à « {rechercheEleve.trim()} ».
                                                </p>
                                            )}
                                            {/* 25 est un plafond, pas un total : sans le dire,
                                                le surveillant croirait avoir vu tous les Soumah
                                                de l'école. */}
                                            {resultatsEleves.length >= 25 && (
                                                <p style={{ margin: 0, fontSize: '12.5px', color: '#b45309', fontWeight: 700 }}>
                                                    Plus de 25 élèves correspondent — ajoutez le prénom
                                                    ou le matricule pour affiner.
                                                </p>
                                            )}
                                            {resultatsEleves.length > 0 && (
                                                <div style={{ maxHeight: '230px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '15px' }}>
                                                    {resultatsEleves.map((eleve, i) => (
                                                        <button key={eleve.eleve_id} type="button"
                                                            onClick={() => { setEleveChoisi(eleve); setForm((prev) => ({ ...prev, eleve_id: String(eleve.eleve_id) })); }}
                                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: 'white', cursor: 'pointer' }}>
                                                            <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                                                                {eleve.prenom} {eleve.nom}
                                                            </span>
                                                            <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginTop: '2px', fontWeight: 700 }}>
                                                                {eleve.matricule || 'sans matricule'}
                                                                {eleve.classe_code ? ` • ${eleve.classe_code}` : ' • sans classe'}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <label style={{ display: 'grid', gap: '7px' }}>
                                        <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>
                                        <select value={form.type_incident} onChange={(e) => setForm((prev) => ({ ...prev, type_incident: e.target.value }))} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}>
                                            <option value="DISCIPLINE">Discipline</option>
                                            <option value="RETARD_REPETE">Retards répétés</option>
                                            <option value="ABSENCE_REPETEE">Absences répétées</option>
                                            <option value="COMPORTEMENT">Comportement</option>
                                            <option value="AUTRE">Autre</option>
                                        </select>
                                    </label>
                                    <label style={{ display: 'grid', gap: '7px' }}>
                                        <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gravité</span>
                                        <select value={form.gravite} onChange={(e) => setForm((prev) => ({ ...prev, gravite: e.target.value }))} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}>
                                            <option value="FAIBLE">Faible</option>
                                            <option value="MOYENNE">Moyenne</option>
                                            <option value="GRAVE">Grave</option>
                                        </select>
                                    </label>
                                </div>
                                <label style={{ display: 'grid', gap: '7px' }}>
                                    <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
                                    <textarea required value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={5} placeholder="Décrire les faits clairement : lieu, moment, contexte, témoins éventuels…" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', color: '#0f172a', fontWeight: 700, resize: 'vertical' }} />
                                </label>
                            </div>
                            <div style={{ padding: '18px 24px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '12px 16px', borderRadius: '15px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 900, cursor: 'pointer' }}>Annuler</button>
                                <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '12px 16px', borderRadius: '15px', border: 'none', background: '#16a34a', color: 'white', fontWeight: 900, cursor: saving ? 'wait' : 'pointer' }}>
                                    {saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Enregistrer l’incident
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </div>
        </div>
    );
}

function OperateurPortal() {
    const { user, logout } = useAuth();
    const isMobile = useIsMobile();
    const { etablissementId, anneeId } = useApp();
    const roleConfig = useMemo(() => getRoleAccessConfig(user?.role), [user?.role]);
    const [dashboard, setDashboard] = useState<DashboardLite>({});
    const [eleveStats, setEleveStats] = useState<CountStats>({});
    const [enseignantStats, setEnseignantStats] = useState<CountStats>({});
    const [classes, setClasses] = useState<ClasseItem[]>([]);
    const [eleves, setEleves] = useState<EleveOption[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadOperations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [dashboardRes, eleveCountRes, enseignantCountRes, classesRes, elevesRes] = await Promise.all([
                api.get<DashboardLite>(`/api/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                api.get<CountStats>(`/api/eleves/count?etablissement_id=${etablissementId}`),
                api.get<CountStats>(`/api/enseignants/count?etablissement_id=${etablissementId}`),
                api.get<ClasseItem[]>(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}&limit=120`),
                api.get<EleveOption[]>(`/api/eleves?etablissement_id=${etablissementId}&annee_id=${anneeId}&statut=ACTIF&limit=12`),
            ]);
            setDashboard(dashboardRes.data || {});
            setEleveStats(eleveCountRes.data || {});
            setEnseignantStats(enseignantCountRes.data || {});
            setClasses(classesRes.data || []);
            setEleves(elevesRes.data || []);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [anneeId, etablissementId]);

    useEffect(() => {
        loadOperations();
    }, [loadOperations]);

    const searchEleves = useCallback(async (value: string) => {
        setQuery(value);
        setSearching(true);
        setError(null);
        try {
            const searchParam = value.trim() ? `&search=${encodeURIComponent(value.trim())}` : '';
            const res = await api.get<EleveOption[]>(`/api/eleves?etablissement_id=${etablissementId}&annee_id=${anneeId}&statut=ACTIF&limit=18${searchParam}`);
            setEleves(res.data || []);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSearching(false);
        }
    }, [anneeId, etablissementId]);

    const kpis = [
        { label: 'Dossiers élèves', value: eleveStats.actifs ?? dashboard.kpi?.nb_eleves ?? 0, note: `${eleveStats.inactifs ?? 0} dossier(s) inactif(s)`, icon: FolderKanban, color: '#475569' },
        { label: 'Classes actives', value: classes.length || dashboard.kpi?.nb_classes || 0, note: 'structures à orienter et suivre', icon: Layers3, color: '#2563eb' },
        { label: 'Enseignants actifs', value: enseignantStats.actifs ?? dashboard.kpi?.nb_enseignants ?? 0, note: 'annuaire pédagogique', icon: Users, color: '#7c3aed' },
        { label: 'Présence globale', value: `${dashboard.kpi?.taux_presence ?? 0}%`, note: `${dashboard.kpi?.incidents_mois ?? 0} incident(s) ce mois`, icon: Activity, color: '#16a34a' },
    ];

    const topClasses = classes.slice(0, 6);

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 48%, #ffffff 100%)', padding: '24px' }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '34px', padding: '28px', background: 'linear-gradient(135deg, #f8fafc 0%, #dbeafe 48%, #ede9fe 100%)', border: '1px solid rgba(71,85,105,0.12)', boxShadow: '0 30px 80px rgba(30,41,59,0.11)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(37,99,235,0.18), transparent 25%), radial-gradient(circle at bottom left, rgba(124,58,237,0.16), transparent 28%)' }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(310px, 0.7fr)', gap: '22px', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(71,85,105,0.16)', color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    <FolderKanban size={14} /> Administration / scolarité
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '12px', fontWeight: 800 }}>
                                    Dossiers, accueil, annuaire
                                </span>
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 'clamp(2.1rem, 3.4vw, 3.5rem)', fontWeight: 950, letterSpacing: '-0.055em', color: '#1e293b' }}>Bureau scolarité</h1>
                                <p style={{ margin: '12px 0 0', fontSize: '16px', lineHeight: 1.85, color: '#475569', maxWidth: '800px' }}>
                                    Espace opérateur aligné avec le PDF : suivi des dossiers élèves, annuaire, classes, orientation des demandes et qualité administrative, sans shell admin.
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '620px', padding: '12px 15px', borderRadius: '18px', background: 'rgba(255,255,255,0.82)', border: '1px solid #e2e8f0', boxShadow: '0 14px 34px rgba(15,23,42,0.06)' }}>
                                {searching ? <Loader2 size={19} className="animate-spin" color="#64748b" /> : <Search size={19} color="#64748b" />}
                                <input value={query} onChange={(e) => searchEleves(e.target.value)} placeholder="Rechercher un dossier élève : nom, prénom, matricule…" style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '14px', color: '#0f172a', fontWeight: 700 }} />
                            </div>
                        </div>

                        <aside style={{ background: 'rgba(255,255,255,0.78)', borderRadius: '28px', border: '1px solid rgba(71,85,105,0.12)', padding: '22px', boxShadow: '0 20px 50px rgba(71,85,105,0.10)', backdropFilter: 'blur(18px)' }}>
                            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: '#475569', fontWeight: 900, letterSpacing: '0.08em' }}>Session connectée</p>
                            <h3 style={{ margin: '7px 0 14px', fontSize: '22px', fontWeight: 950, color: '#0f172a' }}>{user?.prenom} {user?.nom}</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[
                                    { label: 'Rôle', value: roleConfig?.label || user?.role || 'Opérateur' },
                                    { label: 'Mission PDF', value: 'Inscriptions / dossiers' },
                                    { label: 'Année', value: `#${anneeId}` },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 900 }}>{item.label}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#0f172a', fontWeight: 900 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            <Link href="/login" onClick={(e) => { e.preventDefault(); logout(); }} style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '14px', background: '#0f172a', color: 'white', fontWeight: 900, textDecoration: 'none' }}>
                                Déconnexion
                            </Link>
                        </aside>
                    </div>
                </section>

                {error && <div style={{ padding: '14px 18px', borderRadius: '18px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 800 }}>{error}</div>}

                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    {kpis.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <motion.div key={item.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} whileHover={{ y: -5 }} style={{ padding: '20px', borderRadius: '26px', background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 20px 50px rgba(15,23,42,0.06)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '18px', background: `${item.color}14`, color: item.color, display: 'grid', placeItems: 'center', marginBottom: '14px' }}><Icon size={21} /></div>
                                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
                                <p style={{ margin: '8px 0 4px', fontSize: '32px', color: '#0f172a', fontWeight: 950 }}>{loading ? '…' : item.value}</p>
                                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{item.note}</p>
                            </motion.div>
                        );
                    })}
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 330px', gap: '20px', alignItems: 'start' }}>
                    <main style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #eff6ff)' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dossiers élèves</p>
                            <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>{query ? 'Résultats de recherche' : 'Dossiers récents'}</h2>
                        </div>
                        {loading ? (
                            <div style={{ minHeight: '260px', display: 'grid', placeItems: 'center', color: '#475569', fontWeight: 900 }}><Loader2 size={28} className="animate-spin" /> Chargement des dossiers…</div>
                        ) : eleves.length === 0 ? (
                            <div style={{ padding: '52px 24px', textAlign: 'center' }}>
                                <div style={{ width: 84, height: 84, borderRadius: '28px', margin: '0 auto 18px', background: '#f8fafc', color: '#475569', display: 'grid', placeItems: 'center' }}><FolderKanban size={34} /></div>
                                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: 950 }}>Aucun dossier trouvé</h3>
                                <p style={{ margin: '10px auto 0', maxWidth: '520px', color: '#64748b', lineHeight: 1.7 }}>Essayez une autre recherche ou vérifiez que les élèves actifs existent pour cette année.</p>
                            </div>
                        ) : (
                            <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                                {eleves.map((eleve) => (
                                    <article key={eleve.eleve_id} style={{ padding: '16px', borderRadius: '20px', background: '#fcfdff', border: '1px solid #edf2f7' }}>
                                        <div style={{ width: 48, height: 48, borderRadius: '16px', background: 'linear-gradient(135deg, #475569, #2563eb)', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 950, marginBottom: '12px' }}>{getInitials(`${eleve.prenom} ${eleve.nom}`)}</div>
                                        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '16px', fontWeight: 950 }}>{eleve.prenom} {eleve.nom}</h3>
                                        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px', fontWeight: 750 }}>{eleve.matricule || 'Matricule non renseigné'}</p>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                                            {eleve.classe_code && <span style={{ padding: '6px 9px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 900 }}>{eleve.classe_code}</span>}
                                            {eleve.niveau && <span style={{ padding: '6px 9px', borderRadius: 999, background: '#f8fafc', color: '#475569', fontSize: '11px', fontWeight: 900 }}>{eleve.niveau}</span>}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </main>

                    <aside style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'sticky', top: '24px' }}>
                        <div style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 22px 54px rgba(15,23,42,0.06)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Classes à orienter</p>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                {topClasses.length === 0 ? <p style={{ margin: 0, color: '#64748b', lineHeight: 1.7, fontSize: '13px' }}>Les classes apparaîtront après configuration.</p> : topClasses.map((classe) => (
                                    <div key={classe.classe_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                        <span style={{ color: '#334155', fontWeight: 850, fontSize: '13px' }}>{classe.code || classe.libelle}</span>
                                        <strong style={{ color: '#2563eb' }}>{classe.effectif_actuel ?? 0}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: '#0f172a', color: 'white', borderRadius: '28px', boxShadow: '0 22px 54px rgba(15,23,42,0.20)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#bfdbfe', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Référence PDF</p>
                            <h3 style={{ margin: '8px 0 0', fontSize: '20px', fontWeight: 950 }}>Back-office scolarité</h3>
                            <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: '13px' }}>L’opérateur prépare l’accueil, consulte l’annuaire et fiabilise les dossiers élèves sans accéder au cockpit admin.</p>
                        </div>
                    </aside>
                </section>
            </div>
        </div>
    );
}

function InformaticienPortal() {
    const { user, logout } = useAuth();
    const isMobile = useIsMobile();
    const { etablissementId } = useApp();
    const roleConfig = useMemo(() => getRoleAccessConfig(user?.role), [user?.role]);
    const [stats, setStats] = useState<InformatiqueStats>({ total_equipements: 0, equipements_en_panne: 0, tickets_ouverts: 0, tickets_critiques: 0, salles_informatiques: 0, par_etat: [] });
    const [equipements, setEquipements] = useState<EquipementInfo[]>([]);
    const [tickets, setTickets] = useState<TicketInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<ItForm>({ mode: 'ticket', code: '', nom: '', type_equipement: 'ORDINATEUR', marque: '', etat: 'BON', titre: '', description: '', priorite: 'NORMALE', equipement_id: '' });

    // `silencieux` : rafraîchir les données SANS repasser tout l'écran en état
    // de chargement. Sans cela, chaque changement d'état d'une machine faisait
    // clignoter toute la liste (spinner plein écran puis retour) — instable à
    // l'œil. Le premier chargement, lui, montre bien le spinner.
    const loadIt = useCallback(async (silencieux = false) => {
        if (!silencieux) setLoading(true);
        setError(null);
        try {
            const [statsRes, equipementsRes, ticketsRes] = await Promise.all([
                api.get<InformatiqueStats>(`/api/informatique/stats?etablissement_id=${etablissementId}`),
                api.get<EquipementInfo[]>(`/api/informatique/equipements?etablissement_id=${etablissementId}&limit=80`),
                api.get<TicketInfo[]>(`/api/informatique/tickets?etablissement_id=${etablissementId}&limit=80`),
            ]);
            setStats(statsRes.data || { total_equipements: 0, equipements_en_panne: 0, tickets_ouverts: 0, tickets_critiques: 0, salles_informatiques: 0, par_etat: [] });
            setEquipements(equipementsRes.data || []);
            setTickets(ticketsRes.data || []);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            if (!silencieux) setLoading(false);
        }
    }, [etablissementId]);

    useEffect(() => { loadIt(); }, [loadIt]);

    /* ═══ CLORE UN TICKET ═══
       L'ecran creait des tickets sans jamais pouvoir en fermer un : la route
       existait, elle n'etait appelee nulle part. « Tickets ouverts » ne
       pouvait donc que grandir, et l'indicateur devenait faux des le premier
       depannage reussi. */
    const [ticketEnCours, setTicketEnCours] = useState<number | null>(null);

    const resoudreTicket = async (ticket: TicketInfo) => {
        const resolution = window.prompt(
            `Qu'avez-vous fait pour « ${ticket.titre} » ?`,
            'Reparation effectuee');
        if (!resolution || !resolution.trim()) return;
        setTicketEnCours(ticket.ticket_id);
        setError(null);
        setSuccess(null);
        try {
            await api.put(
                `/api/informatique/tickets/${ticket.ticket_id}/resoudre?resolution=${encodeURIComponent(resolution.trim())}`);
            setSuccess(`Ticket « ${ticket.titre} » resolu.`);
            await loadIt();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setTicketEnCours(null);
        }
    };

    /* ═══ CHANGER L'ETAT D'UNE MACHINE ═══
       Une machine qui tombait en panne restait « BON » a vie, sauf a la
       recreer sous un autre code : le compteur de pannes refletait l'etat du
       jour de l'inventaire, jamais l'etat reel du parc. */
    const [equipEnCours, setEquipEnCours] = useState<number | null>(null);

    const changerEtat = async (equipement: EquipementInfo, etat: string) => {
        // L'état bascule tout de suite à l'écran : l'informaticien n'attend pas
        // l'aller-retour serveur pour voir le changement. La synchronisation se
        // fait en fond, et on revient à l'ancien état seulement si elle échoue.
        const ancienEtat = equipement.etat;
        setEquipements((prev) => prev.map((e) =>
            e.equipement_id === equipement.equipement_id ? { ...e, etat } : e));
        setError(null);
        setSuccess(null);
        try {
            await api.put(`/api/informatique/equipements/${equipement.equipement_id}`, { etat });
            setSuccess(`${equipement.code} — ${equipement.nom} : ${etat === 'BON' ? 'remis en service' : etat === 'PANNE' ? 'signale en panne' : etat === 'REPARE' ? 'panne resolue, remis en service' : 'a remplacer'}.`);
            // Rafraîchir les compteurs SANS faire clignoter la liste.
            loadIt(true);
        } catch (err) {
            // Le serveur a refusé : on remet l'état d'avant, l'écran reste vrai.
            setEquipements((prev) => prev.map((e) =>
                e.equipement_id === equipement.equipement_id ? { ...e, etat: ancienEtat } : e));
            setError(getErrorMessage(err));
        } finally {
            setEquipEnCours(null);
        }
    };

    const submitIt = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            if (form.mode === 'equipement') {
                await api.post('/api/informatique/equipements', {
                    etablissement_id: etablissementId,
                    code: form.code.trim(),
                    nom: form.nom.trim(),
                    type_equipement: form.type_equipement,
                    marque: form.marque.trim() || null,
                    etat: form.etat,
                    statut: 'ACTIF',
                });
                setSuccess('Équipement ajouté à l’inventaire informatique.');
            } else {
                await api.post('/api/informatique/tickets', {
                    etablissement_id: etablissementId,
                    equipement_id: form.equipement_id ? Number(form.equipement_id) : null,
                    titre: form.titre.trim(),
                    description: form.description.trim(),
                    priorite: form.priorite,
                    signale_par: `${user?.prenom || ''} ${user?.nom || ''}`.trim() || 'INFORMATICIEN',
                });
                setSuccess('Ticket de panne créé et ajouté au suivi informatique.');
            }
            setForm({ mode: form.mode, code: '', nom: '', type_equipement: 'ORDINATEUR', marque: '', etat: 'BON', titre: '', description: '', priorite: 'NORMALE', equipement_id: '' });
            setShowForm(false);
            await loadIt();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const kpis = [
        { label: 'Équipements suivis', value: stats.total_equipements, note: 'inventaire réel du parc', icon: Monitor, color: '#0284c7' },
        { label: 'En panne', value: stats.equipements_en_panne, note: 'à diagnostiquer ou remplacer', icon: AlertTriangle, color: '#dc2626' },
        { label: 'Tickets ouverts', value: stats.tickets_ouverts, note: `${stats.tickets_critiques} critique(s)`, icon: Wrench, color: '#f59e0b' },
        { label: 'Salles info', value: stats.salles_informatiques, note: 'salles de type informatique', icon: Database, color: '#7c3aed' },
    ];

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f0f9ff 0%, #eef2ff 50%, #ffffff 100%)', padding: '24px' }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '34px', padding: '28px', background: 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 48%, #f5f3ff 100%)', border: '1px solid rgba(2,132,199,0.14)', boxShadow: '0 30px 80px rgba(12,74,110,0.12)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(2,132,199,0.20), transparent 25%), radial-gradient(circle at bottom left, rgba(124,58,237,0.18), transparent 30%)' }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(310px, 0.7fr)', gap: '22px', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(2,132,199,0.16)', color: '#0369a1', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}><Monitor size={14} /> Responsable informatique</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', fontSize: '12px', fontWeight: 800 }}>Parc, tickets, salle info</span>
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 'clamp(2.1rem, 3.4vw, 3.5rem)', fontWeight: 950, letterSpacing: '-0.055em', color: '#0c4a6e' }}>Centre informatique</h1>
                                <p style={{ margin: '12px 0 0', fontSize: '16px', lineHeight: 1.85, color: '#475569', maxWidth: '790px' }}>Espace métier aligné PDF : inventaire matériel, tickets de panne, suivi des salles informatiques et support interne SmartSchool.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => { setForm((prev) => ({ ...prev, mode: 'ticket' })); setShowForm(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: 'none', background: '#0284c7', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 18px 34px rgba(2,132,199,0.24)' }}><Plus size={18} /> Créer un ticket</button>
                                <button type="button" onClick={() => { setForm((prev) => ({ ...prev, mode: 'equipement' })); setShowForm(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '13px 18px', borderRadius: '16px', border: '1px solid rgba(2,132,199,0.18)', background: 'rgba(255,255,255,0.76)', color: '#0369a1', fontWeight: 900, cursor: 'pointer' }}><Monitor size={18} /> Ajouter équipement</button>
                            </div>
                        </div>
                        <aside style={{ background: 'rgba(255,255,255,0.78)', borderRadius: '28px', border: '1px solid rgba(2,132,199,0.12)', padding: '22px', boxShadow: '0 20px 50px rgba(2,132,199,0.10)', backdropFilter: 'blur(18px)' }}>
                            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: '#0284c7', fontWeight: 900, letterSpacing: '0.08em' }}>Session connectée</p>
                            <h3 style={{ margin: '7px 0 14px', fontSize: '22px', fontWeight: 950, color: '#0f172a' }}>{user?.prenom} {user?.nom}</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[{ label: 'Rôle', value: roleConfig?.label || user?.role || 'Informaticien' }, { label: 'Mission PDF', value: 'Salle info / support' }, { label: 'Établissement', value: `#${etablissementId}` }].map((item) => <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: '#f0f9ff', border: '1px solid #bae6fd' }}><p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#0284c7', fontWeight: 900 }}>{item.label}</p><p style={{ margin: '4px 0 0', fontSize: '14px', color: '#0c4a6e', fontWeight: 900 }}>{item.value}</p></div>)}
                            </div>
                            <Link href="/login" onClick={(e) => { e.preventDefault(); logout(); }} style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '14px', background: '#0c4a6e', color: 'white', fontWeight: 900, textDecoration: 'none' }}>Déconnexion</Link>
                        </aside>
                    </div>
                </section>

                {(error || success) && <div style={{ padding: '14px 18px', borderRadius: '18px', background: error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`, color: error ? '#991b1b' : '#166534', fontWeight: 800 }}>{error || success}</div>}

                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    {kpis.map((item, index) => { const Icon = item.icon; return <motion.div key={item.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} whileHover={{ y: -5 }} style={{ padding: '20px', borderRadius: '26px', background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 20px 50px rgba(15,23,42,0.06)' }}><div style={{ width: 48, height: 48, borderRadius: '18px', background: `${item.color}14`, color: item.color, display: 'grid', placeItems: 'center', marginBottom: '14px' }}><Icon size={21} /></div><p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p><p style={{ margin: '8px 0 4px', fontSize: '32px', color: '#0f172a', fontWeight: 950 }}>{loading ? '…' : item.value}</p><p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{item.note}</p></motion.div>; })}
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 360px', gap: '20px', alignItems: 'start' }}>
                    <main style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', boxShadow: '0 24px 58px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: 'linear-gradient(135deg, #ffffff, #f0f9ff)' }}><p style={{ margin: 0, fontSize: '12px', color: '#0284c7', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Inventaire réel</p><h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827', fontWeight: 950 }}>Parc matériel</h2></div>
                        {loading ? <div style={{ minHeight: '260px', display: 'grid', placeItems: 'center', color: '#0284c7', fontWeight: 900 }}><Loader2 size={28} className="animate-spin" /> Chargement informatique…</div> : equipements.length === 0 ? <div style={{ padding: '52px 24px', textAlign: 'center' }}><div style={{ width: 84, height: 84, borderRadius: '28px', margin: '0 auto 18px', background: '#f0f9ff', color: '#0284c7', display: 'grid', placeItems: 'center' }}><Monitor size={34} /></div><h3 style={{ margin: 0, color: '#0c4a6e', fontSize: '22px', fontWeight: 950 }}>Aucun équipement inventorié</h3><p style={{ margin: '10px auto 0', maxWidth: '520px', color: '#64748b', lineHeight: 1.7 }}>Ajoutez les ordinateurs, imprimantes et projecteurs pour construire le parc réel.</p></div> : <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: '14px' }}>{equipements.map((eq) => <article key={eq.equipement_id} style={{ padding: '16px', borderRadius: '20px', background: '#fcfdff', border: '1px solid #edf2f7' }}><div style={{ width: 48, height: 48, borderRadius: '16px', background: 'linear-gradient(135deg, #0284c7, #7c3aed)', color: 'white', display: 'grid', placeItems: 'center', marginBottom: '12px' }}><Monitor size={22} /></div><h3 style={{ margin: 0, color: '#0f172a', fontSize: '16px', fontWeight: 950 }}>{eq.nom}</h3><p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px', fontWeight: 750 }}>{eq.code} • {eq.type_equipement}</p><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}><span style={{ padding: '6px 9px', borderRadius: 999, background: (eq.etat === 'BON' || eq.etat === 'REPARE') ? '#f0fdf4' : '#fff7ed', color: (eq.etat === 'BON' || eq.etat === 'REPARE') ? '#166534' : '#9a3412', fontSize: '11px', fontWeight: 900 }}>{eq.etat === 'REPARE' ? 'PANNE RÉSOLUE' : eq.etat === 'A_REMPLACER' ? 'À REMPLACER' : eq.etat}</span>{eq.marque && <span style={{ padding: '6px 9px', borderRadius: 999, background: '#f8fafc', color: '#475569', fontSize: '11px', fontWeight: 900 }}>{eq.marque}</span>}</div><div style={{ display: 'flex', gap: '5px', marginTop: '12px', flexWrap: 'wrap' }}>{([{ e: 'BON', l: 'En service', c: '#16a34a' }, { e: 'PANNE', l: 'En panne', c: '#f59e0b' }, { e: 'REPARE', l: 'Panne résolue', c: '#0284c7' }, { e: 'A_REMPLACER', l: 'A remplacer', c: '#dc2626' }]).map((o) => (<button key={o.e} type="button" disabled={equipEnCours === eq.equipement_id || eq.etat === o.e} onClick={() => changerEtat(eq, o.e)} style={{ padding: '6px 10px', borderRadius: '10px', border: eq.etat === o.e ? `1px solid ${o.c}` : '1px solid #e2e8f0', background: eq.etat === o.e ? o.c : 'white', color: eq.etat === o.e ? 'white' : '#64748b', fontSize: '11px', fontWeight: 800, cursor: eq.etat === o.e ? 'default' : 'pointer' }}>{o.l}</button>))}</div>{eq.observation && <p style={{ margin: '9px 0 0', fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>{eq.observation}</p>}</article>)}</div>}
                    </main>
                    <aside style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'sticky', top: '24px' }}>
                        <div style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 22px 54px rgba(15,23,42,0.06)', padding: '22px' }}><p style={{ margin: 0, fontSize: '12px', color: '#0284c7', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tickets de panne</p><div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>{tickets.length === 0 ? <p style={{ margin: 0, color: '#64748b', lineHeight: 1.7, fontSize: '13px' }}>Aucun ticket ouvert pour le moment.</p> : tickets.slice(0, 8).map((ticket) => <div key={ticket.ticket_id} style={{ padding: '12px 14px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #f1f5f9' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><strong style={{ color: '#0f172a', fontSize: '13px' }}>{ticket.titre}</strong><span style={{ color: ticket.priorite === 'URGENTE' ? '#dc2626' : '#f59e0b', fontSize: '11px', fontWeight: 900 }}>{ticket.priorite}</span></div><p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.55 }}>{ticket.description}</p>{ticket.statut === 'RESOLU' ? <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: '#166534', fontWeight: 800 }}>Resolu</p> : <button type="button" disabled={ticketEnCours === ticket.ticket_id} onClick={() => resoudreTicket(ticket)} style={{ marginTop: '9px', padding: '7px 13px', borderRadius: '11px', border: 'none', background: '#0284c7', color: 'white', fontSize: '12px', fontWeight: 800, cursor: ticketEnCours === ticket.ticket_id ? 'wait' : 'pointer' }}>{ticketEnCours === ticket.ticket_id ? 'Enregistrement…' : 'Marquer resolu'}</button>}</div>)}</div></div>
                        <div style={{ background: '#0c4a6e', color: 'white', borderRadius: '28px', boxShadow: '0 22px 54px rgba(12,74,110,0.20)', padding: '22px' }}><p style={{ margin: 0, fontSize: '12px', color: '#bae6fd', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Référence PDF</p><h3 style={{ margin: '8px 0 0', fontSize: '20px', fontWeight: 950 }}>Salle informatique</h3><p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: '13px' }}>Planning, inventaire matériel, pannes et support interne sont les axes du portail IT.</p></div>
                    </aside>
                </section>

                {showForm && <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(10px)', zIndex: 80, display: 'grid', placeItems: 'center', padding: '20px' }}><motion.form initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} onSubmit={submitIt} style={{ width: 'min(680px, 100%)', background: 'white', borderRadius: '30px', boxShadow: '0 40px 90px rgba(15,23,42,0.26)', border: '1px solid #e2e8f0', overflow: 'hidden' }}><div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', gap: '14px', background: 'linear-gradient(135deg, #f0f9ff, #eef2ff)' }}><div><p style={{ margin: 0, color: '#0284c7', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{form.mode === 'equipement' ? 'Inventaire' : 'Support'}</p><h2 style={{ margin: '6px 0 0', color: '#111827', fontSize: '24px', fontWeight: 950 }}>{form.mode === 'equipement' ? 'Ajouter un équipement' : 'Créer un ticket'}</h2></div><button type="button" onClick={() => setShowForm(false)} style={{ width: 42, height: 42, borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} /></button></div><div style={{ padding: '24px', display: 'grid', gap: '14px' }}>{form.mode === 'equipement' ? <><input required value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="Code équipement ex: PC-001" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }} /><input required value={form.nom} onChange={(e) => setForm((prev) => ({ ...prev, nom: e.target.value }))} placeholder="Nom équipement" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }} /><input value={form.marque} onChange={(e) => setForm((prev) => ({ ...prev, marque: e.target.value }))} placeholder="Marque" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }} /><select value={form.etat} onChange={(e) => setForm((prev) => ({ ...prev, etat: e.target.value }))} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }}><option value="BON">Bon</option><option value="PANNE">En panne</option><option value="REPARE">Panne résolue</option><option value="A_REMPLACER">À remplacer</option></select></> : <><select value={form.equipement_id} onChange={(e) => setForm((prev) => ({ ...prev, equipement_id: e.target.value }))} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }}><option value="">Équipement concerné optionnel</option>{equipements.map((eq) => <option key={eq.equipement_id} value={eq.equipement_id}>{eq.code} — {eq.nom}</option>)}</select><input required value={form.titre} onChange={(e) => setForm((prev) => ({ ...prev, titre: e.target.value }))} placeholder="Titre du ticket" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }} /><select value={form.priorite} onChange={(e) => setForm((prev) => ({ ...prev, priorite: e.target.value }))} style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }}><option value="BASSE">Basse</option><option value="NORMALE">Normale</option><option value="URGENTE">Urgente</option></select><textarea required value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={5} placeholder="Décrire la panne ou la demande…" style={{ padding: '13px 14px', borderRadius: '15px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700, resize: 'vertical' }} /></>}</div><div style={{ padding: '18px 24px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}><button type="button" onClick={() => setShowForm(false)} style={{ padding: '12px 16px', borderRadius: '15px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontWeight: 900, cursor: 'pointer' }}>Annuler</button><button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '12px 16px', borderRadius: '15px', border: 'none', background: '#0284c7', color: 'white', fontWeight: 900, cursor: saving ? 'wait' : 'pointer' }}>{saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Enregistrer</button></div></motion.form></div>}
            </div>
        </div>
    );
}

export default function PersonnelRolePortalPage() {
    const params = useParams<{ role: string }>();
    const { user, logout } = useAuth();
    const isMobile = useIsMobile();
    const [activeSection, setActiveSection] = useState<'overview' | 'modules' | 'feed'>('overview');
    const slug = params?.role || '';
    const roleConfig = useMemo(() => getRoleAccessConfig(user?.role), [user?.role]);

    if (slug === 'bibliothecaire') {
        return <BibliothecairePortal />;
    }

    if (slug === 'surveillant') {
        return <SurveillantPortal />;
    }

    if (slug === 'informaticien') {
        return <InformaticienPortal />;
    }

    if (slug === 'operateur') {
        return <OperateurPortal />;
    }

    const content = PORTAL_CONTENT[slug] || PORTAL_CONTENT.operateur;

    return (
        <div style={{ minHeight: '100vh', background: `linear-gradient(180deg, ${content.surface} 0%, #ffffff 55%)`, padding: '24px' }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '30px', padding: '28px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #0f172a 100%)', color: 'white', boxShadow: '0 28px 70px rgba(15,23,42,0.16)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at top right, ${content.accent}30, transparent 22%), radial-gradient(circle at bottom left, rgba(255,255,255,0.08), transparent 28%)` }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.35fr) minmax(320px, 0.85fr)', gap: '22px', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    <Zap size={14} /> Interface dédiée non-admin
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: `${content.accent}22`, color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)', fontSize: '12px', fontWeight: 700 }}>
                                    {content.identity}
                                </span>
                            </div>

                            <div>
                                <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 3vw, 3rem)', fontWeight: 900, letterSpacing: '-0.04em' }}>{content.title}</h1>
                                <p style={{ margin: '12px 0 0', fontSize: '15px', lineHeight: 1.8, color: 'rgba(255,255,255,0.82)', maxWidth: '760px' }}>{content.intro}</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                                {content.quickActions.map((item) => (
                                    <div key={item.label} style={{ padding: '18px', borderRadius: '22px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)' }}>
                                        <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>{item.label}</p>
                                        <p style={{ margin: '8px 0 0', fontSize: '18px', fontWeight: 900 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setActiveSection('overview')} style={{ padding: '11px 16px', borderRadius: '14px', border: activeSection === 'overview' ? '1px solid transparent' : '1px solid rgba(255,255,255,0.14)', background: activeSection === 'overview' ? '#ffffff' : 'rgba(255,255,255,0.08)', color: activeSection === 'overview' ? '#0f172a' : 'white', fontWeight: 800, cursor: 'pointer' }}>Vue d’ensemble</button>
                                <button type="button" onClick={() => setActiveSection('modules')} style={{ padding: '11px 16px', borderRadius: '14px', border: activeSection === 'modules' ? '1px solid transparent' : '1px solid rgba(255,255,255,0.14)', background: activeSection === 'modules' ? '#ffffff' : 'rgba(255,255,255,0.08)', color: activeSection === 'modules' ? '#0f172a' : 'white', fontWeight: 800, cursor: 'pointer' }}>Modules métier</button>
                                <button type="button" onClick={() => setActiveSection('feed')} style={{ padding: '11px 16px', borderRadius: '14px', border: activeSection === 'feed' ? '1px solid transparent' : '1px solid rgba(255,255,255,0.14)', background: activeSection === 'feed' ? '#ffffff' : 'rgba(255,255,255,0.08)', color: activeSection === 'feed' ? '#0f172a' : 'white', fontWeight: 800, cursor: 'pointer' }}>Brief opérationnel</button>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '26px', border: '1px solid rgba(255,255,255,0.1)', padding: '22px', backdropFilter: 'blur(18px)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.66)', fontWeight: 800, letterSpacing: '0.08em' }}>Session connectée</p>
                                    <h3 style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 900 }}>{user?.prenom} {user?.nom}</h3>
                                </div>
                                <div style={{ width: 48, height: 48, borderRadius: '16px', background: `${content.accent}26`, display: 'grid', placeItems: 'center' }}>
                                    <CheckCircle2 size={24} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {[
                                    { label: 'Rôle système', value: roleConfig?.label || user?.role || 'Utilisateur' },
                                    { label: 'Espace actif', value: content.workspaceLabel },
                                    { label: 'Route métier', value: roleConfig?.redirectPath || '/login' },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: 'rgba(15,23,42,0.18)' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.58)', fontWeight: 800 }}>{item.label}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                                <Link href="/login" onClick={(e) => { e.preventDefault(); logout(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '14px', background: 'white', color: '#0f172a', fontWeight: 800, textDecoration: 'none' }}>
                                    Déconnexion
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '20px', alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        {activeSection === 'overview' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                {content.kpis.map((item) => (
                                    <motion.div key={item.label} whileHover={{ y: -4 }} style={{ padding: '20px', borderRadius: '24px', background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 20px 44px rgba(15,23,42,0.06)' }}>
                                        <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: 800 }}>{item.label}</p>
                                        <p style={{ margin: '10px 0 4px', fontSize: '28px', fontWeight: 900, color: '#0f172a' }}>{item.value}</p>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{item.note}</p>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        <section style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                            <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', background: `linear-gradient(135deg, ${content.surface}, #ffffff)` }}>
                                <p style={{ margin: 0, fontSize: '12px', color: content.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rôle métier dédié</p>
                                <h2 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{content.workspaceLabel}</h2>
                                <p style={{ margin: '8px 0 0', fontSize: '14px', lineHeight: 1.7, color: '#64748b' }}>Cette interface ne dépend plus du shell admin. Les compteurs décoratifs ont été retirés : les blocs restants indiquent clairement les connecteurs métier à implémenter.</p>
                            </div>
                            <div style={{ padding: '22px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                                {(activeSection === 'feed' ? [] : content.modules).map((module, index) => {
                                    const Icon = module.icon;
                                    return (
                                        <motion.article key={module.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} style={{ background: '#fcfdff', borderRadius: '22px', padding: '20px', border: '1px solid #edf2f7' }}>
                                            <div style={{ width: 46, height: 46, borderRadius: '16px', background: `${content.accent}12`, color: content.accent, display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
                                                <Icon size={20} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>{module.title}</h3>
                                                <span style={{ padding: '4px 8px', borderRadius: '999px', background: '#f8fafc', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>{module.status}</span>
                                            </div>
                                            <p style={{ margin: '10px 0 14px', fontSize: '13px', lineHeight: 1.7, color: '#64748b' }}>{module.desc}</p>
                                            <button style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: 'none', background: 'transparent', color: content.accent, fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                                                {module.cta} <ArrowRight size={14} />
                                            </button>
                                        </motion.article>
                                    );
                                })}

                                {activeSection === 'feed' && content.feed.map((item) => (
                                    <div key={item.title} style={{ padding: '18px', borderRadius: '22px', background: FEED_TONES[item.tone].bg, border: '1px solid rgba(226,232,240,0.8)' }}>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: FEED_TONES[item.tone].color }}>{item.title}</h3>
                                        <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>{item.detail}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <aside style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'sticky', top: '24px' }}>
                        <div style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: content.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Capacités du poste</p>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                {[
                                    { icon: Settings, title: 'Poste autonome', text: 'Le rôle opère dans un espace dédié, sans dépendance au shell admin.' },
                                    { icon: LifeBuoy, title: 'Priorités métier', text: 'Chaque bloc sert une mission concrète propre au rôle connecté.' },
                                    { icon: Activity, title: 'Données réelles', text: 'Les prochains chiffres devront venir d’API métier, pas de valeurs en dur.' },
                                ].map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px', borderRadius: '18px', background: '#f8fafc' }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '14px', background: 'white', color: content.accent, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                                <Icon size={18} />
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>{item.title}</h3>
                                                <p style={{ margin: '6px 0 0', fontSize: '13px', lineHeight: 1.7, color: '#64748b' }}>{item.text}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', padding: '22px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: content.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Feuille de route immédiate</p>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                {content.modules.slice(0, 3).map((module) => (
                                    <div key={module.title} style={{ padding: '14px', borderRadius: '18px', background: '#fcfdff', border: '1px solid #edf2f7' }}>
                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>{module.title}</p>
                                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', lineHeight: 1.7 }}>{module.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </section>
            </div>
        </div>
    );
}
