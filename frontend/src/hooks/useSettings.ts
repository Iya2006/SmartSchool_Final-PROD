import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';

export interface Parametre {
    parametre_id?: number;
    etablissement_id: number;
    categorie: string;
    cle: string;
    valeur: string;
    type_valeur?: string;
}

export function useSettings(categorie?: string) {
    const { etablissementId } = useApp();
    const [settings, setSettings] = useState<Parametre[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSettings = async () => {
        if (!etablissementId) return;
        setLoading(true);
        try {
            const url = categorie 
                ? `/api/parametrage/settings?etablissement_id=${etablissementId}&categorie=${categorie}`
                : `/api/parametrage/settings?etablissement_id=${etablissementId}`;
            const res = await api.get(url);
            setSettings(res.data);
            setError(null);
        } catch (err: any) {
            setError('Erreur lors du chargement des paramètres');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, [etablissementId, categorie]);

    const getSetting = (cle: string, defaultValeur: string = '') => {
        const setting = settings.find(s => s.cle === cle);
        return setting ? setting.valeur : defaultValeur;
    };

    const updateSettings = async (newSettings: Omit<Parametre, 'parametre_id'>[]) => {
        try {
            const payload = newSettings.map(s => ({
                ...s,
                etablissement_id: etablissementId
            }));
            await api.put(`/api/parametrage/settings?etablissement_id=${etablissementId}`, payload);
            await fetchSettings(); // Refresh
            return true;
        } catch (err: any) {
            console.error('Erreur lors de la sauvegarde:', err);
            return false;
        }
    };

    return { settings, loading, error, getSetting, updateSettings, fetchSettings };
}
