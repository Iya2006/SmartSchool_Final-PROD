/**
 * SMARTSCHOOL — Suivi des tâches asynchrones (file RQ côté backend)
 *
 * Le backend met les opérations longues en file (app/core/task_queue.py) et
 * renvoie un `task_id` ; leur avancement se lit sur GET /api/tasks/{id}.
 * Aucun code client ne consommait cet endpoint : les routes `*-async` du
 * backend étaient injoignables depuis l'interface. Ce module est ce chaînon.
 *
 * Vocabulaire aligné sur app/api/tasks.py : PENDING / RUNNING / SUCCESS / FAILED.
 */
import api from './api';

export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface TaskState<T = any> {
    task_id: string;
    status: TaskStatus;
    attempts?: number | null;
    result?: T;
    error?: string;
}

/** Erreur portant le message métier renvoyé par la tâche en échec. */
export class TaskFailedError extends Error {
    constructor(message: string, public readonly task: TaskState) {
        super(message);
        this.name = 'TaskFailedError';
    }
}

export interface SuivreTacheOptions<T> {
    /** Intervalle entre deux interrogations, en ms. */
    intervalleMs?: number;
    /** Abandon au-delà de ce délai, en ms. La tâche continue côté serveur. */
    timeoutMs?: number;
    /** Appelé à chaque changement d'état — pour afficher « en cours… ». */
    onProgress?: (etat: TaskState<T>) => void;
    /** Permet d'arrêter l'attente (démontage du composant, annulation). */
    signal?: AbortSignal;
}

/**
 * Attend la fin d'une tâche et renvoie son résultat.
 *
 * L'attente est volontairement bornée : sans `timeoutMs`, un worker arrêté
 * laisserait l'interface tourner indéfiniment sur une tâche qui n'avancera
 * jamais. Dépasser le délai n'annule pas la tâche côté serveur — on cesse
 * seulement de l'attendre, et le message le dit à l'utilisateur.
 *
 * Un 404 est un état terminal, pas une erreur réseau : l'identifiant est
 * invalide ou le résultat a expiré (result_ttl côté RQ).
 */
export async function suivreTache<T = any>(
    taskId: string,
    options: SuivreTacheOptions<T> = {},
): Promise<T> {
    const { intervalleMs = 1500, timeoutMs = 10 * 60 * 1000, onProgress, signal } = options;
    const echeance = Date.now() + timeoutMs;
    let dernierStatut: TaskStatus | null = null;

    for (;;) {
        if (signal?.aborted) throw new Error('Suivi de la tâche interrompu.');
        if (Date.now() > echeance) {
            throw new Error(
                'La tâche prend plus de temps que prévu. Elle continue côté serveur : '
                + 'rechargez la page dans quelques minutes pour voir le résultat.',
            );
        }

        let etat: TaskState<T>;
        try {
            const res = await api.get(`/api/tasks/${taskId}`);
            etat = res.data;
        } catch (e: any) {
            if (e?.response?.status === 404) {
                throw new TaskFailedError(
                    'Tâche introuvable : identifiant invalide, ou résultat expiré.',
                    { task_id: taskId, status: 'FAILED' },
                );
            }
            throw e;
        }

        if (etat.status !== dernierStatut) {
            dernierStatut = etat.status;
            onProgress?.(etat);
        }

        if (etat.status === 'SUCCESS') return etat.result as T;
        if (etat.status === 'FAILED') {
            throw new TaskFailedError(etat.error || 'La tâche a échoué.', etat);
        }

        await new Promise(r => setTimeout(r, intervalleMs));
    }
}

/**
 * Lance une opération asynchrone et attend son résultat.
 *
 * Retombe sur l'endpoint synchrone quand la file est indisponible (503) : une
 * école dont le Redis est éteint doit pouvoir continuer à calculer ses
 * moyennes, quitte à attendre. Toute autre erreur est propagée telle quelle —
 * on ne masque pas un refus métier (période clôturée, droits) derrière un
 * second appel.
 */
export async function lancerTache<T = any>(
    urlAsync: string,
    options: SuivreTacheOptions<T> & { urlSynchrone?: string } = {},
): Promise<T> {
    const { urlSynchrone, ...suivi } = options;
    try {
        const res = await api.post(urlAsync);
        if (!res.data?.task_id) return res.data as T;   // backend sans file : réponse directe
        suivi.onProgress?.({ task_id: res.data.task_id, status: 'PENDING' });
        return await suivreTache<T>(res.data.task_id, suivi);
    } catch (e: any) {
        if (e?.response?.status === 503 && urlSynchrone) {
            const res = await api.post(urlSynchrone);
            return res.data as T;
        }
        throw e;
    }
}
