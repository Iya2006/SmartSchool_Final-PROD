/**
 * Tests — Hook useNotifications
 * Vérifie le comptage des messages non lus, le polling, et (Étape B) le
 * passage sur React Query (cache offline persisté, comme Classes/Élèves/
 * Dashboard — voir hooks/useEleves.ts) + la mise à jour optimiste de
 * markAllAsRead qu'elle réussisse en ligne ou soit mise en file hors-ligne.
 *
 * feat(test): ajouter tests unitaires hook useNotifications
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNotifications } from '@/hooks/useNotifications';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock de l'API axios
vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
    },
}));

import api from '@/lib/api';
// Cast via unknown car AxiosInstance et le type Mock ne se chevauchent pas directement
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

const MESSAGES_MOCK = [
    {
        message_id: 1,
        sujet: 'Réunion parents',
        objet_type: 'REUNION',
        statut: 'ENVOYE',
        expediteur_type: 'PARENT',
        expediteur_nom: 'Camara Alpha',
        destinataire_type: 'ADMIN',
        date_envoi: new Date().toISOString(),
    },
    {
        message_id: 2,
        sujet: 'Note enfant',
        objet_type: 'GENERAL',
        statut: 'LU',
        expediteur_type: 'ADMIN',
        expediteur_nom: 'Administrateur',
        destinataire_type: 'PARENT',
        date_envoi: new Date().toISOString(),
    },
];

// `useNotifications` s'appuie désormais sur React Query (useQuery/
// useQueryClient) — nécessite un QueryClientProvider ancêtre, absent en
// production nulle part (monté une fois à la racine, voir
// components/QueryProvider.tsx) mais à fournir explicitement ici. Un
// QueryClient dédié par test, `retry: false` pour ne pas ralentir les tests
// d'erreur avec les tentatives/backoff par défaut.
function renderNotifications(pollIntervalMs?: number) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
        QueryClientProvider({ client: queryClient, children });
    return renderHook(() => useNotifications(pollIntervalMs), { wrapper });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useNotifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Simuler un token admin pour que le hook ne s'arrête pas tôt (enabled: hasToken)
        localStorage.setItem('smartschool_token', 'fake-admin-token-for-tests');
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('retourne loading=true au démarrage', () => {
        mockApi.get.mockResolvedValue({ data: [] });
        const { result } = renderNotifications();
        expect(result.current.loading).toBe(true);
    });

    it('charge les messages depuis l\'API', async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.messages).toHaveLength(2);
    });

    it('compte correctement les messages non lus', async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.loading).toBe(false));
        // Seul le message_id=1 est non lu (ENVOYE + expediteur_type !== ADMIN)
        expect(result.current.unreadCount).toBe(1);
    });

    it('retourne 0 non lu si tous les messages sont lus', async () => {
        const allRead = MESSAGES_MOCK.map(m => ({ ...m, statut: 'LU' }));
        mockApi.get.mockResolvedValue({ data: allRead });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.unreadCount).toBe(0);
    });

    it('markAllAsRead réinitialise le compteur à 0 (mise à jour optimiste du cache)', async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        mockApi.put.mockResolvedValue({ data: { marked: 1 } });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.unreadCount).toBe(1));
        await result.current.markAllAsRead();
        await waitFor(() => expect(result.current.unreadCount).toBe(0));
        expect(mockApi.put).toHaveBeenCalledWith('/api/communication/messages/marquer-tous-lus');
    });

    // Étape B : que la coupure réseau ait lieu ou non, l'appelant ne doit pas
    // avoir besoin de le savoir — voir lib/api.ts, qui résout alors la
    // requête avec un 202 optimiste au lieu de rejeter. Le hook ne fait
    // aucune distinction entre "vraiment synchronisé" et "mis en file" : les
    // deux mènent au même état local "tout est lu", cohérent avec le
    // comportement déjà établi pour notes/présences (portail enseignant).
    it("markAllAsRead reflète l'état 'lu' même quand l'appel a été résolu de façon optimiste (hors-ligne)", async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        mockApi.put.mockResolvedValue({
            data: { queued: true, message: 'Enregistré localement — sera synchronisé dès le retour de connexion.' },
        });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.unreadCount).toBe(1));
        await result.current.markAllAsRead();
        await waitFor(() => expect(result.current.unreadCount).toBe(0));
    });

    it("markAllAsRead sur un vrai échec serveur laisse le compteur inchangé (silencieux, comme avant)", async () => {
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        mockApi.put.mockRejectedValue({ response: { status: 500 } });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.unreadCount).toBe(1));
        await result.current.markAllAsRead();
        // Pas de waitFor ici : on vérifie que ça NE change PAS, donc on
        // laisse le micro-tick du catch se dérouler puis on affirme l'état.
        await new Promise((r) => setTimeout(r, 0));
        expect(result.current.unreadCount).toBe(1);
    });

    it('gère les erreurs API silencieusement (loading=false, messages vides)', async () => {
        mockApi.get.mockRejectedValue(new Error('Network error'));
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.messages).toHaveLength(0);
        expect(result.current.unreadCount).toBe(0);
    });

    it('limite les messages affichés à 8 maximum', async () => {
        const manyMessages = Array.from({ length: 15 }, (_, i) => ({
            ...MESSAGES_MOCK[0],
            message_id: i + 1,
        }));
        mockApi.get.mockResolvedValue({ data: manyMessages });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.messages.length).toBeLessThanOrEqual(8);
    });

    it("ne lance aucun appel réseau si aucun token n'est présent (déconnecté)", async () => {
        localStorage.clear();
        mockApi.get.mockResolvedValue({ data: MESSAGES_MOCK });
        const { result } = renderNotifications();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockApi.get).not.toHaveBeenCalled();
        expect(result.current.messages).toHaveLength(0);
    });
});
