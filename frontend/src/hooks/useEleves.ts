/**
 * useEleves — Hook custom pour la gestion des élèves.
 *
 * Centralise TOUS les appels API liés aux élèves.
 * Les pages ne font plus de fetch directement — elles utilisent ce hook.
 *
 * refactor(eleves): extraire les appels API dans un hook custom useEleves
 *
 * Usage :
 *   const { eleves, loading, totalCount, fetchEleves, deleteEleve } = useEleves({ etablissementId, anneeId })
 */

import { useState, useCallback, useEffect } from 'react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Eleve {
    eleve_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    date_naissance: string;
    statut: string;
    classe_code?: string;
    niveau?: string;
    photo_url?: string | null;
    adresse?: string | null;
    groupe_sanguin?: string | null;
}

export interface ClasseInfo {
    classe_id: number;
    libelle: string;
    code: string;
    effectif_actuel: number;
}

export interface ElevesCount {
    total: number;
    actifs: number;
    inactifs: number;
}

interface UseElevesParams {
    etablissementId: number | string;
    anneeId: number | string;
    page?: number;
    pageSize?: number;
    search?: string;
    classeCode?: string | null;
}

interface UseElevesReturn {
    eleves: Eleve[];
    classes: ClasseInfo[];
    loading: boolean;
    error: string | null;
    totalCount: number;
    activeCount: number;
    inactiveCount: number;
    totalPages: number;
    fetchEleves: () => Promise<void>;
    deleteEleve: (id: number) => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useEleves({
    etablissementId,
    anneeId,
    page = 1,
    pageSize = 10,
    search = '',
    classeCode = null,
}: UseElevesParams): UseElevesReturn {
    const [eleves, setEleves]           = useState<Eleve[]>([]);
    const [classes, setClasses]         = useState<ClasseInfo[]>([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [totalCount, setTotalCount]   = useState(0);
    const [activeCount, setActiveCount] = useState(0);
    const [inactiveCount, setInactiveCount] = useState(0);

    // Charger les classes (se relance si etablissement ou année change)
    useEffect(() => {
        api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
            .then((res: { data: ClasseInfo[] }) => setClasses(res.data))
            .catch(() => {});
    }, [etablissementId, anneeId]);  

    // Charger les élèves selon les filtres
    const fetchEleves = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const skip = (page - 1) * pageSize;
            let url = `/api/eleves?skip=${skip}&limit=${pageSize}&etablissement_id=${etablissementId}&annee_id=${anneeId}`;
            if (search)     url += `&search=${encodeURIComponent(search)}`;
            if (classeCode) url += `&classe_code=${encodeURIComponent(classeCode)}`;

            const [elevesRes, countRes] = await Promise.all([
                api.get(url),
                api.get(`/api/eleves/count?etablissement_id=${etablissementId}`),
            ]);

            setEleves(elevesRes.data as Eleve[]);
            setActiveCount((countRes.data as { actifs: number }).actifs);
            setInactiveCount((countRes.data as { inactifs: number }).inactifs);

            // Si filtré par classe, utiliser l'effectif de la classe
            if (classeCode) {
                const cls = classes.find(c => c.code === classeCode);
                setTotalCount(cls ? cls.effectif_actuel : (elevesRes.data as Eleve[]).length);
            } else {
                setTotalCount((countRes.data as { total: number }).total);
            }
        } catch (err) {
            setError('Impossible de charger les élèves. Vérifiez la connexion au serveur.');
            console.error('[useEleves] fetchEleves error:', err);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [etablissementId, anneeId, page, pageSize, search, classeCode]);

    // Déclencher le fetch automatiquement quand les paramètres changent
    useEffect(() => {
        fetchEleves();
    }, [fetchEleves]);

    // Supprimer un élève
    const deleteEleve = useCallback(async (id: number) => {
        await api.delete(`/api/eleves/${id}`);
        await fetchEleves(); // Rafraîchir la liste après suppression
    }, [fetchEleves]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
        eleves,
        classes,
        loading,
        error,
        totalCount,
        activeCount,
        inactiveCount,
        totalPages,
        fetchEleves,
        deleteEleve,
    };
}
