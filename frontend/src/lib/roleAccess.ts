'use client';

export type AccessTier = 'full-admin' | 'finance' | 'operations' | 'specialized' | 'external' | 'no-system-access';

export const ADMIN_SYSTEM_ROLES = ['SUPER_ADMIN', 'FONDATEUR', 'DG', 'DIRECTEUR_NIVEAU', 'ADMIN'] as const;

export interface RoleAccessConfig {
    role: string;
    label: string;
    redirectPath: string;
    allowedPrefixes: string[];
    tier: AccessTier;
    hasSystemAccess: boolean;
    description: string;
    interfaceLabel: string;
}

export const ROLE_ACCESS_CONFIG: Record<string, RoleAccessConfig> = {
    SUPER_ADMIN: {
        role: 'SUPER_ADMIN',
        label: 'Super Administrateur',
        redirectPath: '/dashboard',
        // `/selection-etablissement` : réservé au SUPER_ADMIN, seul compte non
        // rattaché à une école et donc seul à devoir en désigner une.
        allowedPrefixes: ['/dashboard', '/personnel', '/parametres', '/classes', '/eleves', '/enseignants', '/familles', '/communication', '/examens', '/emploi-du-temps', '/matieres', '/notes', '/bulletins', '/resultats-annuels', '/evenements', '/activites', '/archive', '/fournitures', '/galerie', '/centre-evaluation', '/salle-des-profs', '/comptabilite', '/monitoring', '/selection-etablissement', '/administration'],
        tier: 'full-admin',
        hasSystemAccess: true,
        description: 'Pilotage global de la plateforme : crée les écoles, les supervise, et entre dans l\'une d\'elles au besoin.',
        interfaceLabel: 'Dashboard de contrôle total',
    },
    FONDATEUR: {
        role: 'FONDATEUR',
        label: 'Fondateur',
        redirectPath: '/dashboard',
        allowedPrefixes: ['/dashboard', '/personnel', '/parametres', '/classes', '/eleves', '/enseignants', '/familles', '/communication', '/examens', '/emploi-du-temps', '/matieres', '/notes', '/bulletins', '/resultats-annuels', '/evenements', '/activites', '/archive', '/fournitures', '/galerie', '/centre-evaluation', '/salle-des-profs', '/comptabilite', '/monitoring'],
        tier: 'full-admin',
        hasSystemAccess: true,
        description: 'Vision exécutive, arbitrage et supervision de toute la plateforme.',
        interfaceLabel: 'Dashboard de direction',
    },
    DG: {
        role: 'DG',
        label: 'Directeur Général',
        redirectPath: '/dashboard',
        allowedPrefixes: ['/dashboard', '/personnel', '/parametres', '/classes', '/eleves', '/enseignants', '/familles', '/communication', '/examens', '/emploi-du-temps', '/matieres', '/notes', '/bulletins', '/resultats-annuels', '/evenements', '/activites', '/archive', '/fournitures', '/galerie', '/centre-evaluation', '/salle-des-profs', '/comptabilite', '/monitoring'],
        tier: 'full-admin',
        hasSystemAccess: true,
        description: 'Conduite opérationnelle et pilotage de la performance de l\'école.',
        interfaceLabel: 'Centre de pilotage exécutif',
    },
    // LE DÉLÉGUÉ PÉDAGOGIQUE DE LA DIRECTION
    // L'administrateur ne peut pas tout tenir seul : il confie à un membre du
    // personnel déjà en poste les évaluations, la centralisation des notes, les
    // bulletins, les résultats de fin d'année, le centre des examens et
    // l'archive scolaire. Ce rôle a donc les mêmes droits que l'administrateur,
    // À UNE EXCEPTION PRÈS : la comptabilité, qui reste à l'administrateur, à
    // la direction générale et au comptable. Cette exception est appliquée
    // côté serveur (`main.py::FINANCE_ROLES`), pas seulement ici — un blocage
    // qui n'existe que dans le navigateur n'est pas un blocage.
    DIRECTEUR_NIVEAU: {
        role: 'DIRECTEUR_NIVEAU',
        label: 'Directeur des Études',
        redirectPath: '/dashboard',
        allowedPrefixes: ['/dashboard', '/personnel', '/classes', '/eleves', '/enseignants', '/familles', '/communication', '/examens', '/emploi-du-temps', '/matieres', '/notes', '/bulletins', '/resultats-annuels', '/evenements', '/activites', '/archive', '/fournitures', '/galerie', '/centre-evaluation', '/salle-des-profs', '/monitoring'],
        tier: 'full-admin',
        hasSystemAccess: true,
        description: 'Délégué pédagogique de la direction : évaluations, notes, bulletins, résultats de fin d\'année, examens et archive. Pas d\'accès à la comptabilité.',
        interfaceLabel: 'Dashboard de coordination académique',
    },
    ADMIN: {
        role: 'ADMIN',
        label: 'Administrateur',
        redirectPath: '/dashboard',
        allowedPrefixes: ['/dashboard', '/personnel', '/parametres', '/classes', '/eleves', '/enseignants', '/familles', '/communication', '/examens', '/emploi-du-temps', '/matieres', '/notes', '/bulletins', '/resultats-annuels', '/evenements', '/activites', '/archive', '/fournitures', '/galerie', '/centre-evaluation', '/salle-des-profs', '/comptabilite', '/monitoring'],
        tier: 'full-admin',
        hasSystemAccess: true,
        description: 'Administration complète du système et orchestration des services.',
        interfaceLabel: 'Back-office administratif',
    },
    COMPTABLE: {
        role: 'COMPTABLE',
        label: 'Comptable',
        redirectPath: '/comptabilite/dashboard',
        allowedPrefixes: ['/comptabilite'],
        tier: 'finance',
        hasSystemAccess: true,
        description: 'Suivi financier, encaissements, rapports et clôtures.',
        interfaceLabel: 'Portail comptabilité',
    },
    BIBLIOTHECAIRE: {
        role: 'BIBLIOTHECAIRE',
        label: 'Bibliothécaire',
        redirectPath: '/personnel/portail/bibliothecaire',
        allowedPrefixes: ['/personnel/portail/bibliothecaire'],
        tier: 'specialized',
        hasSystemAccess: true,
        description: 'Gestion du fonds documentaire, prêts, retours et espace lecture.',
        interfaceLabel: 'Portail bibliothèque',
    },
    INFORMATICIEN: {
        role: 'INFORMATICIEN',
        label: 'Informaticien',
        redirectPath: '/personnel/portail/informaticien',
        allowedPrefixes: ['/personnel/portail/informaticien'],
        tier: 'specialized',
        hasSystemAccess: true,
        description: 'Support technique, équipements, incidents et infrastructure numérique.',
        interfaceLabel: 'Portail informatique',
    },
    SURVEILLANT: {
        role: 'SURVEILLANT',
        label: 'Surveillant',
        redirectPath: '/personnel/portail/surveillant',
        allowedPrefixes: ['/personnel/portail/surveillant'],
        tier: 'operations',
        hasSystemAccess: true,
        description: 'Surveillance, discipline, présences sensibles et remontées terrain.',
        interfaceLabel: 'Poste de supervision scolaire',
    },
    OPERATEUR: {
        role: 'OPERATEUR',
        label: 'Opérateur / Secrétaire',
        redirectPath: '/personnel/portail/operateur',
        allowedPrefixes: ['/personnel/portail/operateur'],
        tier: 'operations',
        hasSystemAccess: true,
        description: 'Saisie, accueil, inscriptions et traitement des opérations courantes.',
        interfaceLabel: 'Portail opérations',
    },
    ENSEIGNANT: {
        role: 'ENSEIGNANT',
        label: 'Enseignant',
        redirectPath: '/portail-enseignant',
        allowedPrefixes: ['/portail-enseignant', '/teacher-dashboard', '/salle-des-profs'],
        tier: 'external',
        hasSystemAccess: true,
        description: 'Accès au portail pédagogique enseignant.',
        interfaceLabel: 'Portail enseignant',
    },
    PARENT: {
        role: 'PARENT',
        label: 'Parent',
        redirectPath: '/portail-parent',
        allowedPrefixes: ['/portail-parent'],
        tier: 'external',
        hasSystemAccess: true,
        description: 'Suivi de la scolarité et de la communication familiale.',
        interfaceLabel: 'Portail parent',
    },
    ELEVE: {
        role: 'ELEVE',
        label: 'Élève',
        redirectPath: '/portail-eleve',
        allowedPrefixes: ['/portail-eleve', '/student-dashboard'],
        tier: 'external',
        hasSystemAccess: true,
        description: 'Accès à l\'espace scolaire individuel de l\'élève.',
        interfaceLabel: 'Portail élève',
    },
    AGENT_ENTRETIEN: {
        role: 'AGENT_ENTRETIEN',
        label: 'Agent d\'entretien',
        redirectPath: '/login',
        allowedPrefixes: [],
        tier: 'no-system-access',
        hasSystemAccess: false,
        description: 'Rôle visible en RH uniquement, sans interface de connexion dédiée.',
        interfaceLabel: 'Aucune interface système',
    },
    GARDIEN: {
        role: 'GARDIEN',
        label: 'Gardien',
        redirectPath: '/login',
        allowedPrefixes: [],
        tier: 'no-system-access',
        hasSystemAccess: false,
        description: 'Rôle terrain sans accès logiciel par défaut.',
        interfaceLabel: 'Aucune interface système',
    },
    CHAUFFEUR: {
        role: 'CHAUFFEUR',
        label: 'Chauffeur',
        redirectPath: '/login',
        allowedPrefixes: [],
        tier: 'no-system-access',
        hasSystemAccess: false,
        description: 'Rôle support logistique sans accès logiciel par défaut.',
        interfaceLabel: 'Aucune interface système',
    },
    AUTRE: {
        role: 'AUTRE',
        label: 'Autre personnel',
        redirectPath: '/login',
        allowedPrefixes: [],
        tier: 'no-system-access',
        hasSystemAccess: false,
        description: 'Rôle RH sans interface tant qu\'un portail n\'est pas explicitement défini.',
        interfaceLabel: 'Aucune interface système',
    },
};

export const DEFAULT_ROLE_REDIRECT = '/dashboard';

export const getRoleAccessConfig = (role?: string | null): RoleAccessConfig | null => {
    if (!role) return null;
    return ROLE_ACCESS_CONFIG[role] || null;
};

export const getRedirectPathForRole = (role?: string | null): string => {
    const config = getRoleAccessConfig(role);
    if (!config) return DEFAULT_ROLE_REDIRECT;
    return config.hasSystemAccess ? config.redirectPath : '/login';
};

export const canAccessPathForRole = (role: string | undefined | null, pathname: string): boolean => {
    const config = getRoleAccessConfig(role);
    if (!config) return pathname.startsWith(DEFAULT_ROLE_REDIRECT);
    if (!config.hasSystemAccess) return pathname === '/login';
    return config.allowedPrefixes.some((prefix) => pathname.startsWith(prefix));
};

export const isAdminSystemRole = (role?: string | null) => {
    return !!role && ADMIN_SYSTEM_ROLES.includes(role as typeof ADMIN_SYSTEM_ROLES[number]);
};

export const getRoleInterfaceSummary = (role?: string | null) => {
    const config = getRoleAccessConfig(role);
    if (!config) {
        return {
            hasSystemAccess: true,
            redirectPath: DEFAULT_ROLE_REDIRECT,
            interfaceLabel: 'Dashboard par défaut',
            description: 'Interface par défaut du système.',
        };
    }

    return {
        hasSystemAccess: config.hasSystemAccess,
        redirectPath: config.redirectPath,
        interfaceLabel: config.interfaceLabel,
        description: config.description,
    };
};
