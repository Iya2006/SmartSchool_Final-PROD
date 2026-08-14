'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { 
    DashboardData, NotesData, CreneauEDT, AbsencesData, 
    BulletinData, MessagesData, FournitureItem, DevoirItem, 
    RessourceItem, PendingPhoto, Tab
} from '../types';

export function useEleveData(eleveId: number | null) {
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);

    // Tab specific states
    const [notesData, setNotesData] = useState<NotesData | null>(null);
    const [notesLoading, setNotesLoading] = useState(false);

    const [edtData, setEdtData] = useState<CreneauEDT[]>([]);
    const [edtLoading, setEdtLoading] = useState(false);

    const [absencesData, setAbsencesData] = useState<AbsencesData | null>(null);
    const [absencesLoading, setAbsencesLoading] = useState(false);

    const [bulletinData, setBulletinData] = useState<BulletinData | null>(null);
    const [bulletinLoading, setBulletinLoading] = useState(false);
    // Aucune période supposée : la liste vient de l'école de l'élève, et tant
    // qu'elle n'est pas chargée le serveur choisit la période en cours.
    const [bulletinTrimestre, setBulletinTrimestre] = useState<number | null>(null);
    const [periodes, setPeriodes] = useState<{ trimestre_id: number; libelle: string; statut: string }[]>([]);

    const [messagesData, setMessagesData] = useState<MessagesData | null>(null);
    const [messagesLoading, setMessagesLoading] = useState(false);

    const [fournituresData, setFournituresData] = useState<FournitureItem[]>([]);
    const [fournituresLoading, setFournituresLoading] = useState(false);

    const [devoirsData, setDevoirsData] = useState<DevoirItem[]>([]);
    const [devoirsLoading, setDevoirsLoading] = useState(false);

    const [ressourcesData, setRessourcesData] = useState<RessourceItem[]>([]);
    const [ressourcesLoading, setRessourcesLoading] = useState(false);

    const [error, setError] = useState<string | null>(null);

    // Fetch Dashboard
    const fetchDashboard = useCallback(async (id: number) => {
        setDashboardLoading(true);
        setError(null);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/dashboard`);
            setDashboardData(res.data);
            
            // Try fetching pending photo
            try {
                const pendRes = await api.get(`/api/photos/pending/eleve/${id}`);
                setPendingPhoto(pendRes.data);
            } catch {
                setPendingPhoto(null);
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Erreur de chargement du tableau de bord");
        } finally {
            setDashboardLoading(false);
        }
    }, []);

    // Fetch Notes
    const fetchNotes = useCallback(async (id: number) => {
        setNotesLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/notes`);
            setNotesData(res.data);
        } catch {
            setNotesData({ notes_par_matiere: [], moyenne_generale: null });
        } finally {
            setNotesLoading(false);
        }
    }, []);

    // Fetch Emploi du Temps
    const fetchEdt = useCallback(async (id: number) => {
        setEdtLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/emploi-du-temps`);
            setEdtData(res.data || []);
        } catch {
            setEdtData([]);
        } finally {
            setEdtLoading(false);
        }
    }, []);

    // Fetch Absences
    const fetchAbsences = useCallback(async (id: number) => {
        setAbsencesLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/absences`);
            setAbsencesData(res.data);
        } catch {
            setAbsencesData({ presences: [], total_present: 0, total_absent: 0 });
        } finally {
            setAbsencesLoading(false);
        }
    }, []);

    // Fetch Bulletin
    const fetchBulletin = useCallback(async (id: number, trimId: number | null) => {
        setBulletinLoading(true);
        try {
            const res = await api.get(
                `/api/portail-eleve/${id}/bulletin${trimId ? `?trimestre_id=${trimId}` : ''}`);
            setBulletinData(res.data);
        } catch {
            setBulletinData(null);
        } finally {
            setBulletinLoading(false);
        }
    }, []);

    // Fetch Messages
    const fetchMessages = useCallback(async (id: number) => {
        setMessagesLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/messages`);
            setMessagesData(res.data);
        } catch {
            setMessagesData({ received: [], sent: [] });
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    // Fetch Fournitures
    const fetchFournitures = useCallback(async (id: number) => {
        setFournituresLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/fournitures`);
            setFournituresData(res.data || []);
        } catch {
            setFournituresData([]);
        } finally {
            setFournituresLoading(false);
        }
    }, []);

    // Fetch Devoirs
    const fetchDevoirs = useCallback(async (id: number) => {
        setDevoirsLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/devoirs`);
            setDevoirsData(res.data || []);
        } catch {
            setDevoirsData([]);
        } finally {
            setDevoirsLoading(false);
        }
    }, []);

    // Fetch Ressources (liens)
    const fetchRessources = useCallback(async (id: number) => {
        setRessourcesLoading(true);
        try {
            const res = await api.get(`/api/portail-eleve/${id}/ressources`);
            setRessourcesData(res.data || []);
        } catch {
            setRessourcesData([]);
        } finally {
            setRessourcesLoading(false);
        }
    }, []);

    // Trigger loads based on active tab
    const loadTabCached = useCallback((tab: Tab) => {
        if (!eleveId) return;

        switch (tab) {
            case 'dashboard':
                refreshDashboard();
                break;
            case 'notes':
                if (!notesData) fetchNotes(eleveId);
                break;
            case 'emploi':
                if (edtData.length === 0) fetchEdt(eleveId);
                break;
            case 'absences':
                if (!absencesData) fetchAbsences(eleveId);
                break;
            case 'bulletin':
                fetchBulletin(eleveId, bulletinTrimestre);
                break;
            case 'messages':
                if (!messagesData) fetchMessages(eleveId);
                break;
            case 'fournitures':
                if (fournituresData.length === 0) fetchFournitures(eleveId);
                break;
            case 'devoirs':
                if (devoirsData.length === 0) fetchDevoirs(eleveId);
                break;
            case 'liens':
                if (ressourcesData.length === 0) fetchRessources(eleveId);
                break;
            default:
                break;
        }
    }, [
        eleveId, notesData, edtData.length, absencesData, 
        bulletinTrimestre, messagesData, fournituresData.length, 
        devoirsData.length, ressourcesData.length,
        fetchNotes, fetchEdt, fetchAbsences, fetchBulletin, 
        fetchMessages, fetchFournitures, fetchDevoirs, fetchRessources
    ]);

    const refreshDashboard = useCallback(() => {
        if (eleveId) {
            fetchDashboard(eleveId);
        }
    }, [eleveId, fetchDashboard]);

    // Initial load
    useEffect(() => {
        if (eleveId) {
            fetchDashboard(eleveId);
        }
    }, [eleveId, fetchDashboard]);

    // Load bulletin when trimestre changes
    useEffect(() => {
        if (eleveId) {
            fetchBulletin(eleveId, bulletinTrimestre);
        }
    }, [eleveId, bulletinTrimestre, fetchBulletin]);

    // Périodes réelles de l'école de l'élève, chargées une fois.
    useEffect(() => {
        if (!eleveId) return;
        api.get(`/api/portail-eleve/${eleveId}/periodes`)
            .then(res => {
                setPeriodes(res.data || []);
                const enCours = (res.data || []).find((p: any) => p.statut === 'EN_COURS');
                setBulletinTrimestre((enCours || res.data?.[0])?.trimestre_id ?? null);
            })
            .catch(() => setPeriodes([]));
    }, [eleveId]);

    return {
        dashboardData,
        dashboardLoading,
        pendingPhoto,
        setPendingPhoto,
        notesData,
        notesLoading,
        edtData,
        edtLoading,
        absencesData,
        absencesLoading,
        bulletinData,
        bulletinLoading,
        bulletinTrimestre,
        setBulletinTrimestre,
        periodes,
        messagesData,
        messagesLoading,
        fournituresData,
        fournituresLoading,
        devoirsData,
        devoirsLoading,
        ressourcesData,
        ressourcesLoading,
        error,
        refreshDashboard,
        loadTabCached,
        refetchMessages: () => eleveId && fetchMessages(eleveId)
    };
}
