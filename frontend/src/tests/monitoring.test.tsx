/**
 * Tests — Page Monitoring (Étape G)
 * Vérifie l'affichage du statut global (OK/WARNING/CRITICAL) et des
 * blocs infrastructure à partir d'une réponse GET /api/monitoring
 * simulée. Pas de test d'intégration réseau réel côté frontend — déjà
 * couvert côté backend (backend/tests/test_monitoring.py).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MonitoringPage from '@/app/monitoring/page';

vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
    },
}));

import api from '@/lib/api';
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

const REPONSE_OK = {
    status: 'OK',
    reasons: [],
    database: { status: 'up', latency_ms: 4.2 },
    redis: { status: 'up' },
    queue: { name: 'default', pending: 0, started: 0, finished: 12, failed: 0, deferred: 0, scheduled: 0 },
    workers: { total: 2, idle: 2, busy: 0, names: ['worker-a', 'worker-b'] },
};

const REPONSE_CRITICAL = {
    status: 'CRITICAL',
    reasons: ['Redis indisponible'],
    database: { status: 'up', latency_ms: 3.1 },
    redis: { status: 'down' },
    queue: null,
    workers: null,
};

describe('MonitoringPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('affiche le badge OK et les compteurs quand tout est sain', async () => {
        mockApi.get.mockResolvedValueOnce({ data: REPONSE_OK });
        render(<MonitoringPage />);

        await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument());
        expect(screen.getByText('Aucune anomalie détectée.')).toBeInTheDocument();
        expect(screen.getAllByText('Disponible')).toHaveLength(2); // PostgreSQL + Redis
        expect(screen.getByText('worker-a, worker-b')).toBeInTheDocument();
    });

    it('affiche le badge Critique et les raisons quand Redis est indisponible', async () => {
        mockApi.get.mockResolvedValueOnce({ data: REPONSE_CRITICAL });
        render(<MonitoringPage />);

        await waitFor(() => expect(screen.getByText('Critique')).toBeInTheDocument());
        expect(screen.getByText('Redis indisponible')).toBeInTheDocument();
        // queue/workers non disponibles plutôt que des compteurs fabriqués
        expect(screen.getAllByText('Non disponible (Redis injoignable)')).toHaveLength(2);
    });

    it("affiche un message d'erreur si l'API est injoignable", async () => {
        mockApi.get.mockRejectedValueOnce(new Error('network error'));
        render(<MonitoringPage />);

        await waitFor(() =>
            expect(screen.getByText("Impossible de récupérer l'état de l'infrastructure.")).toBeInTheDocument()
        );
    });
});
