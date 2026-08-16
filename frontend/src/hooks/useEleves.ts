/**
 * useEleves — Hook custom pour la gestion des élèves.
 *
 * Centralise TOUS les appels API liés aux élèves.
 * Les pages ne font plus de fetch directement — elles utilisent ce hook.
 *
 * Bâti sur React Query (déjà monté à la racine, cache persisté + resilience
 * offline — voir components/QueryProvider.tsx/lib/queryClient.ts) plutôt que
 * sur un `useEffect` manuel : la dernière liste connue s'affiche
 * instantanément (y compris après une coupure réseau ou un rechargement),
 * revalidée en arrière-plan dès que possible.
 *
 * Usage :
 *   const { eleves, loading, totalCount, fetchEleves, deleteEleve } = useEleves({ etablissementId, anneeId })
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient, useIsRestoring } from '@tanstack/react-query';
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
    nouvelles_inscriptions: number;
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
    nouvellesInscriptions: number;
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
    const queryClient = useQueryClient();
    const hasContext = !!etablissementId && !!anneeId;

    const classesQuery = useQuery({
        queryKey: ['eleves-classes', etablissementId, anneeId],
        queryFn: async () => {
            const res = await api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`);
            return res.data as ClasseInfo[];
        },
        enabled: hasContext,
    });
    const classes = classesQuery.data ?? [];

    const elevesQuery = useQuery({
        queryKey: ['eleves', etablissementId, anneeId, page, pageSize, search, classeCode],
        queryFn: async () => {
            const skip = (page - 1) * pageSize;
            let url = `/api/eleves?skip=${skip}&limit=${pageSize}&etablissement_id=${etablissementId}&annee_id=${anneeId}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (classeCode) url += `&classe_code=${encodeURIComponent(classeCode)}`;

            const [elevesRes, countRes] = await Promise.all([
                api.get(url),
                api.get(`/api/eleves/count?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
            ]);

            return {
                eleves: elevesRes.data as Eleve[],
                count: countRes.data as ElevesCount,
            };
        },
        enabled: hasContext,
    });

    const eleves = elevesQuery.data?.eleves ?? [];
    const activeCount = elevesQuery.data?.count.actifs ?? 0;
    const inactiveCount = elevesQuery.data?.count.inactifs ?? 0;
    const nouvellesInscriptions = elevesQuery.data?.count.nouvelles_inscriptions ?? 0;

    // Si filtré par classe, l'effectif de la classe fait foi ; sinon le total global.
    const totalCount = classeCode
        ? (classes.find((c) => c.code === classeCode)?.effectif_actuel ?? eleves.length)
        : (elevesQuery.data?.count.total ?? 0);

    // Cache React Query persiste en localStorage (offline-first) : au tout
    // premier rendu client, avant restauration du cache, isLoading tombe a
    // false sans donnees alors que le serveur (pas de localStorage) affiche
    // encore le chargement — mismatch d'hydratation. Meme correctif que
    // classes/page.tsx.
    const isRestoring = useIsRestoring();
    const loading = elevesQuery.isLoading || isRestoring;
    const error = elevesQuery.isError ? 'Impossible de charger les élèves. Vérifiez la connexion au serveur.' : null;

    const fetchEleves = useCallback(async () => {
        await elevesQuery.refetch();
    }, [elevesQuery]);

    // Supprimer un élève
    const deleteEleve = useCallback(async (id: number) => {
        await api.delete(`/api/eleves/${id}`);
        // Invalide toutes les pages/filtres en cache de la liste élèves — pas
        // seulement la page courante — pour qu'un retour en arrière ne
        // réaffiche pas un élève déjà supprimé depuis le cache persisté.
        await queryClient.invalidateQueries({ queryKey: ['eleves'] });
    }, [queryClient]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
        eleves,
        classes,
        loading,
        error,
        totalCount,
        activeCount,
        inactiveCount,
        nouvellesInscriptions,
        totalPages,
        fetchEleves,
        deleteEleve,
    };
}
