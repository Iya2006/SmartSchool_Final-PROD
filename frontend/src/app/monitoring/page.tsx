'use client';

/**
 * Monitoring infrastructure (Étape G) — page admin minimale.
 *
 * Affiche l'état courant renvoyé par GET /api/monitoring (statut global
 * OK/WARNING/CRITICAL + raisons, PostgreSQL, Redis, file RQ, workers).
 * Réservée aux rôles admin — le garde central (AuthContext,
 * canAccessPathForRole) redirige déjà tout autre rôle avant même le rendu,
 * cohérent avec le reste du back-office.
 *
 * Rafraîchissement toutes les 25s (pas de polling agressif — un simple
 * état courant, pas d'historique/graphique, cohérent avec le besoin réel
 * identifié à l'audit).
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, Server, XCircle } from 'lucide-react';
import api from '@/lib/api';
import styles from './Monitoring.module.css';

interface DatabaseStatus {
    status: 'up' | 'down';
    latency_ms: number | null;
}

interface RedisStatus {
    status: 'up' | 'down';
}

interface QueueInfo {
    name: string;
    pending: number;
    started: number;
    finished: number;
    failed: number;
    deferred: number;
    scheduled: number;
}

interface WorkersInfo {
    total: number;
    idle: number;
    busy: number;
    names: string[];
}

interface MonitoringResponse {
    status: 'OK' | 'WARNING' | 'CRITICAL';
    reasons: string[];
    database: DatabaseStatus;
    redis: RedisStatus;
    queue: QueueInfo | null;
    workers: WorkersInfo | null;
}

const REFRESH_MS = 25000;

const STATUS_META: Record<MonitoringResponse['status'], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    OK: { label: 'OK', className: styles.badgeOk, Icon: CheckCircle2 },
    WARNING: { label: 'Avertissement', className: styles.badgeWarning, Icon: AlertTriangle },
    CRITICAL: { label: 'Critique', className: styles.badgeCritical, Icon: XCircle },
};

export default function MonitoringPage() {
    const [data, setData] = useState<MonitoringResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const response = await api.get<MonitoringResponse>('/api/monitoring');
            setData(response.data);
            setError(null);
            setLastUpdated(new Date());
        } catch {
            setError("Impossible de récupérer l'état de l'infrastructure.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, REFRESH_MS);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}><Activity size={22} /> Monitoring infrastructure</h1>
                    <p className={styles.subtitle}>
                        API, PostgreSQL, Redis, file d&apos;attente et workers — vue technique réservée à l&apos;administration.
                    </p>
                </div>
                <button type="button" className={styles.refreshButton} onClick={fetchStatus} disabled={loading}>
                    <RefreshCw size={16} className={loading ? styles.spinning : undefined} />
                    Actualiser
                </button>
            </header>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {data && (
                <>
                    <section className={styles.statusCard}>
                        {(() => {
                            const meta = STATUS_META[data.status];
                            const Icon = meta.Icon;
                            return (
                                <div className={`${styles.statusBadge} ${meta.className}`}>
                                    <Icon size={20} />
                                    <span>{meta.label}</span>
                                </div>
                            );
                        })()}
                        {data.reasons.length > 0 ? (
                            <ul className={styles.reasonsList}>
                                {data.reasons.map((raison) => (
                                    <li key={raison}>{raison}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.noReason}>Aucune anomalie détectée.</p>
                        )}
                        {lastUpdated && (
                            <p className={styles.lastUpdated}>
                                Dernière vérification : {lastUpdated.toLocaleTimeString('fr-FR')}
                            </p>
                        )}
                    </section>

                    <section className={styles.grid}>
                        <div className={styles.card}>
                            <h2><Database size={16} /> PostgreSQL</h2>
                            <p className={data.database.status === 'up' ? styles.up : styles.down}>
                                {data.database.status === 'up' ? 'Disponible' : 'Indisponible'}
                            </p>
                            {data.database.latency_ms !== null && (
                                <p className={styles.metric}>{data.database.latency_ms} ms</p>
                            )}
                        </div>

                        <div className={styles.card}>
                            <h2><Server size={16} /> Redis</h2>
                            <p className={data.redis.status === 'up' ? styles.up : styles.down}>
                                {data.redis.status === 'up' ? 'Disponible' : 'Indisponible'}
                            </p>
                        </div>

                        <div className={styles.card}>
                            <h2>File d&apos;attente ({data.queue?.name ?? '—'})</h2>
                            {data.queue ? (
                                <dl className={styles.metricsList}>
                                    <div><dt>En attente</dt><dd>{data.queue.pending}</dd></div>
                                    <div><dt>En cours</dt><dd>{data.queue.started}</dd></div>
                                    <div><dt>Terminées</dt><dd>{data.queue.finished}</dd></div>
                                    <div><dt>Échouées</dt><dd>{data.queue.failed}</dd></div>
                                    <div><dt>Différées</dt><dd>{data.queue.deferred}</dd></div>
                                    <div><dt>Programmées</dt><dd>{data.queue.scheduled}</dd></div>
                                </dl>
                            ) : (
                                <p className={styles.unknown}>Non disponible (Redis injoignable)</p>
                            )}
                        </div>

                        <div className={styles.card}>
                            <h2>Workers</h2>
                            {data.workers ? (
                                <>
                                    <dl className={styles.metricsList}>
                                        <div><dt>Total</dt><dd>{data.workers.total}</dd></div>
                                        <div><dt>Actifs</dt><dd>{data.workers.busy}</dd></div>
                                        <div><dt>Inactifs</dt><dd>{data.workers.idle}</dd></div>
                                    </dl>
                                    {data.workers.names.length > 0 && (
                                        <p className={styles.workerNames}>{data.workers.names.join(', ')}</p>
                                    )}
                                </>
                            ) : (
                                <p className={styles.unknown}>Non disponible (Redis injoignable)</p>
                            )}
                        </div>
                    </section>
                </>
            )}

            {loading && !data && <p className={styles.loading}>Chargement…</p>}
        </div>
    );
}
