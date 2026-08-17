/**
 * useNotifications — Hook custom pour la gestion des notifications/messages.
 *
 * Centralise les appels API liés aux messages de communication.
 * Utilisé par TopbarNotifications et potentiellement la page /communication.
 *
 * Offline-first (§Étape B — module Notifications, READ_ONLY_OFFLINE +
 * WRITE_OFFLINE_SAFE) : la lecture passe par React Query (déjà monté à la
 * racine, cache persisté dans localStorage — voir components/QueryProvider.tsx
 * /lib/queryClient.ts, même mécanisme déjà utilisé pour Classes/Élèves/
 * Dashboard), donc les derniers messages connus restent affichés hors-ligne.
 * `markAllAsRead` continue de passer par un simple `api.put(...)` — c'est
 * l'intercepteur global (lib/api.ts) qui le met en file offline en cas de
 * coupure réseau, réutilisant la même file/moteur de synchro que
 * notes/présences (pas de nouvelle Offline Queue créée). Opération choisie
 * car naturellement idempotente côté serveur (UPDATE ... WHERE statut =
 * 'ENVOYE', un rejeu ne fait rien de plus la 2e fois) : aucun
 * idempotency-key ni changement backend nécessaire.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient, useIsRestoring } from '@tanstack/react-query';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Message {
    message_id: number;
    sujet: string;
    objet_type: string;
    statut: string;
    expediteur_type: string;
    expediteur_nom?: string;
    destinataire_type: string;
    destinataire_nom?: string;
    date_envoi: string;
}

interface UseNotificationsReturn {
    messages: Message[];
    unreadCount: number;
    loading: boolean;
    markAllAsRead: () => Promise<void>;
    refresh: () => Promise<void>;
}

const NOTIFICATIONS_QUERY_KEY = ['notifications-messages'];

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useNotifications(pollIntervalMs = 30000): UseNotificationsReturn {
    const queryClient = useQueryClient();
    const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('smartschool_token');

    const messagesQuery = useQuery({
        queryKey: NOTIFICATIONS_QUERY_KEY,
        queryFn: async () => {
            const res = await api.get('/api/communication/messages?role=ADMIN');
            return (res.data || []) as Message[];
        },
        enabled: hasToken,
        // Poll régulier comme avant (visibilitychange remplacé par
        // refetchOnWindowFocus, équivalent React Query) — override du
        // défaut global refetchOnWindowFocus:false (lib/queryClient.ts) :
        // les notifications sont plus sensibles au temps qu'une liste de
        // classes, ça justifie le refresh immédiat au retour sur l'onglet.
        refetchInterval: hasToken ? pollIntervalMs : false,
        refetchOnWindowFocus: true,
    });

    // Cache React Query persiste en localStorage (offline-first) : au tout
    // premier rendu client, avant restauration du cache, isLoading tombe a
    // false sans donnees — mismatch d'hydratation avec le serveur. Meme
    // correctif que classes/page.tsx et useEleves.ts.
    const isRestoring = useIsRestoring();
    const loading = messagesQuery.isLoading || isRestoring;

    const allMessages = messagesQuery.data ?? [];
    const messages = allMessages.slice(0, 8);
    const unreadCount = allMessages.filter((m) => m.statut === 'ENVOYE' && m.expediteur_type !== 'ADMIN').length;

    const markAllAsRead = useCallback(async () => {
        try {
            await api.put('/api/communication/messages/marquer-tous-lus');
            // Succès réel OU mise en file hors-ligne réussie (l'intercepteur
            // résout alors optimistiquement l'appel, voir lib/api.ts) : dans
            // les deux cas le serveur appliquera la même opération —
            // immédiatement, ou à la prochaine synchronisation. L'UI n'a pas
            // besoin d'attendre ce round-trip pour refléter "tout est lu".
            queryClient.setQueryData<Message[]>(NOTIFICATIONS_QUERY_KEY, (old) =>
                (old ?? []).map((m) => (m.statut === 'ENVOYE' ? { ...m, statut: 'LU' } : m))
            );
        } catch {
            // Échec réel (pas une simple coupure réseau — l'intercepteur
            // l'aurait déjà résolu en succès optimiste) — silencieux comme
            // avant, l'UI reste inchangée plutôt que d'afficher "lu" à tort.
        }
    }, [queryClient]);

    const refresh = useCallback(async () => {
        await messagesQuery.refetch();
    }, [messagesQuery]);

    return {
        messages,
        unreadCount,
        loading,
        markAllAsRead,
        refresh,
    };
}
