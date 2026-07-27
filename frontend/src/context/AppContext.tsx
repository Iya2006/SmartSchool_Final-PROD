'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import api from '@/lib/api';

/* ─── TypeScript Interfaces ─── */
interface AnneeScolaire {
    annee_id: number;
    libelle: string;
}

interface ThemeConfig {
    primary: string;
    secondary: string;
    accent: string;
    darkMode: boolean;
    preset: string;
    font: string;
    // Specific portals
    couleurEleve: string;
    couleurParent: string;
    couleurEnseignant: string;
    msgEleve: string;
    msgParent: string;
    msgEnseignant: string;
    // Seasonal
    seasonalEnabled: boolean;
    seasonalAutoApply: boolean;
    seasonalThemesJson: string;
}

interface CarteConfig {
    format: 'vertical' | 'horizontal' | 'compact';
    colorStart: string;
    colorEnd: string;
    gradientAngle: number;
    logoPosition: 'left' | 'center' | 'right';
    footerText: string;
    template: string;
    showQrCode: boolean;
    showDateNaissance: boolean;
    showClasse: boolean;
    showMatricule: boolean;
    showAdresse: boolean;
    showGroupeSanguin: boolean;
    bgImageUrl: string;
    showMatieres?: boolean;
}

interface AppContextType {
    etablissementId: number;
    etablissementNom: string;
    etablissementLogo: string | null;
    etablissementCachet: string | null;
    etablissementSignature: string | null;
    etablissementDirecteur: string | null;
    setEtablissementNom: (nom: string) => void;
    setEtablissementLogo: (url: string | null) => void;
    setEtablissementCachet: (url: string | null) => void;
    setEtablissementSignature: (url: string | null) => void;
    setEtablissementDirecteur: (name: string | null) => void;
    anneeId: number;
    anneeLibelle: string;
    setEtablissementId: (id: number) => void;
    setAnneeId: (id: number) => void;
    annees: AnneeScolaire[];
    loading: boolean;
    refreshEtablissement: () => void;
    
    theme: ThemeConfig;
    setTheme: React.Dispatch<React.SetStateAction<ThemeConfig>>;
    refreshTheme: () => void;
    applyTheme: (themeConfig: ThemeConfig) => void;

    // Card Context
    carteConfig: CarteConfig;
    setCarteConfig: React.Dispatch<React.SetStateAction<CarteConfig>>;
    carteConfigEleve: CarteConfig;
    setCarteConfigEleve: React.Dispatch<React.SetStateAction<CarteConfig>>;
    carteConfigEnseignant: CarteConfig;
    setCarteConfigEnseignant: React.Dispatch<React.SetStateAction<CarteConfig>>;
}

const DEFAULT_THEME: ThemeConfig = {
    primary: '#4f46e5',
    secondary: '#6366f1',
    accent: '#0ea5e9',
    darkMode: false,
    preset: 'smartschool',
    font: 'inter',
    couleurEleve: '#0284c7',
    couleurParent: '#16a34a',
    couleurEnseignant: '#7e22ce',
    msgEleve: "Bonjour et bienvenue sur ton espace Élève SmartSchool ! Prêt pour une nouvelle journée d'apprentissage ?",
    msgParent: "Bienvenue sur l'espace Parents. Suivez en temps réel la scolarité, les notes et les présences de vos enfants.",
    msgEnseignant: "Bienvenue sur l'espace Enseignant. Gérez vos classes, saisissez les devoirs et suivez vos élèves.",
    seasonalEnabled: false,
    seasonalAutoApply: false,
    seasonalThemesJson: JSON.stringify([
        { id: "noel", label: "Noël & Fêtes", iconName: "TreePine", primary: "#b91c1c", secondary: "#15803d", accent: "#fbbf24", start: "12-15", end: "01-05", description: "Thème festif rouge et vert pour les fêtes de fin d'année" },
        { id: "independance", label: "Fête Nationale", iconName: "Flag", primary: "#be123c", secondary: "#15803d", accent: "#f59e0b", start: "09-25", end: "10-05", description: "Thème tricolore aux couleurs de la Guinée" },
        { id: "vacances", label: "Vacances d'Été", iconName: "Sun", primary: "#ea580c", secondary: "#ca8a04", accent: "#06b6d4", start: "07-01", end: "08-31", description: "Thème ensoleillé et rafraîchissant pour l'été" }
    ])
};

const DEFAULT_CARTE_CONFIG: CarteConfig = {
    format: 'vertical',
    colorStart: '#1e293b',
    colorEnd: '#0f172a',
    gradientAngle: 135,
    logoPosition: 'center',
    footerText: 'SmartSchool — Excellence Éducative',
    template: 'classique',
    showQrCode: true,
    showDateNaissance: false,
    showClasse: true,
    showMatricule: true,
    showAdresse: false,
    showGroupeSanguin: false,
    bgImageUrl: '',
};

const DEFAULT_CARTE_CONFIG_ENSEIGNANT: CarteConfig = {
    format: 'vertical',
    colorStart: '#581c87',
    colorEnd: '#3b0764',
    gradientAngle: 135,
    logoPosition: 'center',
    footerText: 'SmartSchool — Personnel Enseignant',
    template: 'royal',
    showQrCode: true,
    showDateNaissance: false,
    showClasse: true,
    showMatricule: true,
    showAdresse: true,
    showGroupeSanguin: false,
    bgImageUrl: '',
    showMatieres: true,
};

export function applyThemeStyles(theme: ThemeConfig) {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    root.style.setProperty('--brand-primary', theme.primary);
    root.style.setProperty('--brand-primary-light', theme.primary + '15');
    root.style.setProperty('--brand-secondary', theme.secondary);
    root.style.setProperty('--brand-secondary-light', theme.secondary + '15');
    root.style.setProperty('--brand-accent', theme.accent);
    root.style.setProperty('--brand-accent-light', theme.accent + '15');

    if (theme.darkMode) {
        root.style.setProperty('--bg-body', '#0f172a');
        root.style.setProperty('--bg-surface', '#1e293b');
        root.style.setProperty('--bg-surface-hover', '#334155');
        root.style.setProperty('--text-primary', '#f8fafc');
        root.style.setProperty('--text-secondary', '#94a3b8');
        root.style.setProperty('--border-light', '#334155');
    } else {
        root.style.setProperty('--bg-body', '#f1f5f9');
        root.style.setProperty('--bg-surface', '#ffffff');
        root.style.setProperty('--bg-surface-hover', '#f8fafc');
        root.style.setProperty('--text-primary', '#1e293b');
        root.style.setProperty('--text-secondary', '#64748b');
        root.style.setProperty('--border-light', '#e2e8f0');
    }

    const fontsMap: Record<string, string> = {
        inter: "'Inter', sans-serif",
        plusjakarta: "'Plus Jakarta Sans', sans-serif",
        nunito: "'Nunito', sans-serif",
        poppins: "'Poppins', sans-serif",
    };
    const fontStyle = fontsMap[theme.font] || fontsMap.inter;
    root.style.setProperty('--font-family', fontStyle);
    document.body.style.fontFamily = fontStyle;
}

const AppContext = createContext<AppContextType>({
    etablissementId: 1,
    etablissementNom: 'SmartSchool',
    etablissementLogo: null,
    etablissementCachet: null,
    etablissementSignature: null,
    etablissementDirecteur: null,
    setEtablissementNom: () => {},
    setEtablissementLogo: () => {},
    setEtablissementCachet: () => {},
    setEtablissementSignature: () => {},
    setEtablissementDirecteur: () => {},
    anneeId: 1,
    anneeLibelle: '',
    setEtablissementId: () => {},
    setAnneeId: () => {},
    annees: [],
    loading: true,
    refreshEtablissement: () => {},
    
    theme: DEFAULT_THEME,
    setTheme: () => {},
    refreshTheme: () => {},
    applyTheme: () => {},

    carteConfig: DEFAULT_CARTE_CONFIG,
    setCarteConfig: () => {},
    carteConfigEleve: DEFAULT_CARTE_CONFIG,
    setCarteConfigEleve: () => {},
    carteConfigEnseignant: DEFAULT_CARTE_CONFIG_ENSEIGNANT,
    setCarteConfigEnseignant: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
    const [etablissementId, setEtablissementId] = useState<number>(1);
    const [etablissementNom, setEtablissementNom] = useState<string>('SmartSchool');
    const [etablissementLogo, setEtablissementLogo] = useState<string | null>(null);
    const [etablissementCachet, setEtablissementCachet] = useState<string | null>(null);
    const [etablissementSignature, setEtablissementSignature] = useState<string | null>(null);
    const [etablissementDirecteur, setEtablissementDirecteur] = useState<string | null>(null);
    const [anneeId, setAnneeId] = useState<number>(1);
    const [anneeLibelle, setAnneeLibelle] = useState<string>('');
    const [annees, setAnnees] = useState<AnneeScolaire[]>([]);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);

    // Initialize from localStorage cache for instant availability before API responds
    const [carteConfigEleve, setCarteConfigEleve] = useState<CarteConfig>(() => {
        if (typeof window === 'undefined') return DEFAULT_CARTE_CONFIG;
        try {
            const cached = localStorage.getItem('carte_config_eleve');
            return cached ? { ...DEFAULT_CARTE_CONFIG, ...JSON.parse(cached) } : DEFAULT_CARTE_CONFIG;
        } catch { return DEFAULT_CARTE_CONFIG; }
    });
    const [carteConfigEnseignant, setCarteConfigEnseignant] = useState<CarteConfig>(() => {
        if (typeof window === 'undefined') return DEFAULT_CARTE_CONFIG_ENSEIGNANT;
        try {
            const cached = localStorage.getItem('carte_config_enseignant');
            return cached ? { ...DEFAULT_CARTE_CONFIG_ENSEIGNANT, ...JSON.parse(cached) } : DEFAULT_CARTE_CONFIG_ENSEIGNANT;
        } catch { return DEFAULT_CARTE_CONFIG_ENSEIGNANT; }
    });
    const [carteConfig, setCarteConfig] = useState<CarteConfig>(() => {
        if (typeof window === 'undefined') return DEFAULT_CARTE_CONFIG;
        try {
            const cached = localStorage.getItem('carte_config_eleve');
            return cached ? { ...DEFAULT_CARTE_CONFIG, ...JSON.parse(cached) } : DEFAULT_CARTE_CONFIG;
        } catch { return DEFAULT_CARTE_CONFIG; }
    });

    const fetchEtablissement = () => {
        // Route publique — pas besoin de token
        api.get(`/api/parametrage/etablissements/${etablissementId}?_t=${Date.now()}`)
            .then(res => {
                const nom = res.data.nom || 'SmartSchool';
                const logo = res.data.logo_url || null;
                setEtablissementNom(nom);
                setEtablissementLogo(logo);
                setEtablissementCachet(res.data.cachet_url || null);
                setEtablissementSignature(res.data.signature_url || null);
                setEtablissementDirecteur(res.data.directeur || null);
                
                if (typeof window !== 'undefined') {
                    localStorage.setItem('etablissement_nom', nom);
                    if (logo) {
                        localStorage.setItem('etablissement_logo', logo);
                    } else {
                        localStorage.removeItem('etablissement_logo');
                    }
                }
            })
            .catch(() => {});
    };

    const fetchTheme = useCallback(() => {
        // Route publique — pas besoin de token
        api.get(`/api/parametrage/settings?etablissement_id=1&_t=${Date.now()}`)
            .then(res => {
                const settings = res.data;
                const get = (cle: string, fb: string) =>
                    settings.find((s: any) => s.cle === cle)?.valeur ?? fb;

                const loadedTheme: ThemeConfig = {
                    primary:   get('theme.primary',   DEFAULT_THEME.primary),
                    secondary: get('theme.secondary', DEFAULT_THEME.secondary),
                    accent:    get('theme.accent',    DEFAULT_THEME.accent),
                    darkMode:  get('theme.dark_mode', 'false') === 'true',
                    preset:    get('theme.preset',    DEFAULT_THEME.preset),
                    font:      get('theme.font',      DEFAULT_THEME.font),
                    
                    couleurEleve:      get('theme.couleur_eleve',      DEFAULT_THEME.couleurEleve),
                    couleurParent:     get('theme.couleur_parent',     DEFAULT_THEME.couleurParent),
                    couleurEnseignant: get('theme.couleur_enseignant', DEFAULT_THEME.couleurEnseignant),
                    
                    msgEleve:          get('theme.msg_eleve',          DEFAULT_THEME.msgEleve),
                    msgParent:         get('theme.msg_parent',         DEFAULT_THEME.msgParent),
                    msgEnseignant:     get('theme.msg_enseignant',     DEFAULT_THEME.msgEnseignant),
                    
                    seasonalEnabled:   get('theme.seasonal_enabled',   'false') === 'true',
                    seasonalAutoApply: get('theme.seasonal_auto_apply', 'false') === 'true',
                    seasonalThemesJson:get('theme.seasonal_themes',     DEFAULT_THEME.seasonalThemesJson),
                };
                setTheme(loadedTheme);
                applyThemeStyles(loadedTheme);

                // 1. CARTE ELEVE (avec fallback historique)
                const loadedCarteConfigEleve: CarteConfig = {
                    format: get('carte.eleve.format', get('carte.format', DEFAULT_CARTE_CONFIG.format)) as any,
                    colorStart: get('carte.eleve.color_start', get('carte.color_start', DEFAULT_CARTE_CONFIG.colorStart)),
                    colorEnd: get('carte.eleve.color_end', get('carte.color_end', DEFAULT_CARTE_CONFIG.colorEnd)),
                    gradientAngle: parseInt(get('carte.eleve.gradient_angle', get('carte.gradient_angle', String(DEFAULT_CARTE_CONFIG.gradientAngle))), 10),
                    logoPosition: get('carte.eleve.logo_position', get('carte.logo_position', DEFAULT_CARTE_CONFIG.logoPosition)) as any,
                    footerText: get('carte.eleve.footer_text', get('carte.footer_text', DEFAULT_CARTE_CONFIG.footerText)),
                    template: get('carte.eleve.template', get('carte.template', DEFAULT_CARTE_CONFIG.template)),
                    showQrCode: get('carte.eleve.show_qrcode', get('carte.show_qrcode', 'true')) === 'true',
                    showDateNaissance: get('carte.eleve.show_date_naissance', get('carte.show_date_naissance', 'false')) === 'true',
                    showClasse: get('carte.eleve.show_classe', get('carte.show_classe', 'true')) === 'true',
                    showMatricule: get('carte.eleve.show_matricule', get('carte.show_matricule', 'true')) === 'true',
                    showAdresse: get('carte.eleve.show_adresse', get('carte.show_adresse', 'false')) === 'true',
                    showGroupeSanguin: get('carte.eleve.show_groupe_sanguin', get('carte.show_groupe_sanguin', 'false')) === 'true',
                    bgImageUrl: get('carte.eleve.bg_image_url', get('carte.bg_image_url', DEFAULT_CARTE_CONFIG.bgImageUrl)),
                };
                setCarteConfigEleve(loadedCarteConfigEleve);
                setCarteConfig(loadedCarteConfigEleve);
                // Cache to localStorage for instant availability on next visit
                if (typeof window !== 'undefined') {
                    localStorage.setItem('carte_config_eleve', JSON.stringify(loadedCarteConfigEleve));
                }

                // 2. CARTE ENSEIGNANT (avec fallback DEFAULT_CARTE_CONFIG_ENSEIGNANT)
                const loadedCarteConfigEnseignant: CarteConfig = {
                    format: get('carte.prof.format', DEFAULT_CARTE_CONFIG_ENSEIGNANT.format) as any,
                    colorStart: get('carte.prof.color_start', DEFAULT_CARTE_CONFIG_ENSEIGNANT.colorStart),
                    colorEnd: get('carte.prof.color_end', DEFAULT_CARTE_CONFIG_ENSEIGNANT.colorEnd),
                    gradientAngle: parseInt(get('carte.prof.gradient_angle', String(DEFAULT_CARTE_CONFIG_ENSEIGNANT.gradientAngle)), 10),
                    logoPosition: get('carte.prof.logo_position', DEFAULT_CARTE_CONFIG_ENSEIGNANT.logoPosition) as any,
                    footerText: get('carte.prof.footer_text', DEFAULT_CARTE_CONFIG_ENSEIGNANT.footerText),
                    template: get('carte.prof.template', DEFAULT_CARTE_CONFIG_ENSEIGNANT.template),
                    showQrCode: get('carte.prof.show_qrcode', 'true') === 'true',
                    showDateNaissance: get('carte.prof.show_date_naissance', 'false') === 'true',
                    showClasse: get('carte.prof.show_classe', 'true') === 'true', // Classes enseignées
                    showMatricule: get('carte.prof.show_matricule', 'true') === 'true',
                    showAdresse: get('carte.prof.show_adresse', 'true') === 'true',
                    showGroupeSanguin: get('carte.prof.show_groupe_sanguin', 'false') === 'true',
                    bgImageUrl: get('carte.prof.bg_image_url', DEFAULT_CARTE_CONFIG_ENSEIGNANT.bgImageUrl),
                    showMatieres: get('carte.prof.show_matieres', 'true') === 'true', // Matières enseignées
                };
                setCarteConfigEnseignant(loadedCarteConfigEnseignant);
                // Cache to localStorage
                if (typeof window !== 'undefined') {
                    localStorage.setItem('carte_config_enseignant', JSON.stringify(loadedCarteConfigEnseignant));
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const cachedNom = localStorage.getItem('etablissement_nom');
            const cachedLogo = localStorage.getItem('etablissement_logo');
            if (cachedNom) setEtablissementNom(cachedNom);
            if (cachedLogo) setEtablissementLogo(cachedLogo);
        }

        const token = typeof window !== 'undefined'
            ? localStorage.getItem('smartschool_token')
            : null;

        // Toujours charger l'établissement et le thème (routes publiques)
        fetchEtablissement();
        fetchTheme();

        if (!token) {
            setLoading(false);
            setAnneeLibelle('2024-2025');
            return;
        }

        api.get('/api/parametrage/annees')
            .then(res => {
                const data = res.data;
                if (Array.isArray(data) && data.length > 0) {
                    setAnnees(data);
                    const active = data.find((a: any) => a.est_courante === 'O') || data[0];
                    if (active) {
                        setAnneeId(active.annee_id);
                        setAnneeLibelle(active.libelle);
                    }
                }
            })
            .catch(() => {
                setAnneeLibelle('2024-2025');
            })
            .finally(() => setLoading(false));
    }, [fetchTheme]);

    // Mettre à jour le titre et le favicon
    useEffect(() => {
        if (typeof window !== 'undefined') {
            document.title = `${etablissementNom} | SmartSchool ERP`;
            
            if (etablissementLogo) {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
                const iconUrl = etablissementLogo.startsWith('http') ? etablissementLogo : `${API_BASE}${etablissementLogo}`;
                
                let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.head.appendChild(link);
                }
                link.href = iconUrl;
            }
        }
    }, [etablissementNom, etablissementLogo]);

    return (
        <AppContext.Provider value={{
            etablissementId, etablissementNom, etablissementLogo, 
            etablissementCachet, etablissementSignature, etablissementDirecteur,
            setEtablissementNom, setEtablissementLogo,
            setEtablissementCachet, setEtablissementSignature, setEtablissementDirecteur,
            anneeId, anneeLibelle,
            setEtablissementId, setAnneeId,
            annees, loading,
            refreshEtablissement: fetchEtablissement,
            
            theme,
            setTheme,
            refreshTheme: fetchTheme,
            applyTheme: applyThemeStyles,

            carteConfig,
            setCarteConfig,
            carteConfigEleve,
            setCarteConfigEleve,
            carteConfigEnseignant,
            setCarteConfigEnseignant,
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    return useContext(AppContext);
}
