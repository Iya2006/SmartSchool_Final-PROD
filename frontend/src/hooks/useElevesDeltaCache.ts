/**
 * useElevesDeltaCache — miroir local des élèves tenu à jour par
 * synchronisation delta (Étape C, module pilote — voir le plan approuvé).
 *
 * PAS branché dans /eleves ni dans useEleves.ts par ce chantier : c'est une
 * brique testée et prête à l'emploi (ex: recherche élève hors-ligne côté
 * secrétariat), le brancher dans une vraie page est une extension future
 * volontairement séparée — zéro risque sur la page /eleves déjà en
 * production.
 *
 * Contrairement à useEleves.ts (paginé, filtré, toujours un fetch complet
 * de la page demandée), ce hook maintient une copie locale COMPLÈTE de
 * l'établissement (bornée par établissement+année, pas par page) — c'est le
 * scénario où le delta apporte un vrai gain : la première synchro coûte le
 * prix d'une liste complète, chaque synchro suivante ne coûte que ce qui a
 * changé.
 *
 * Étape D (sécurité locale) : chaque fiche élève (contient adresse, groupe
 * sanguin, date de naissance — des données personnelles) est chiffrée en
 * IndexedDB via lib/localEncryption.ts (clé dérivée du JWT courant, jamais
 * stockée). L'INDEX (juste une liste d'ids numériques, aucune PII) n'est
 * volontairement pas chiffré — rien d'utile à protéger là, chiffrer quand
 * même n'ajouterait que du coût. Un déchiffrement qui échoue (token
 * différent, ex: autre utilisateur) est traité comme une entrée absente,
 * jamais comme une erreur bloquante.
 */
import { useCallback, useEffect, useState } from 'react';
import { runDeltaSync, getCached, setCached, deleteCached } from '@/lib/deltaSync';
import { encryptValue, decryptValue, type EncryptedPayload } from '@/lib/localEncryption';

export interface EleveDeltaItem {
    eleve_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    date_naissance: string;
    statut: string;
    classe_code?: string | null;
    niveau?: string | null;
    photo_url?: string | null;
    adresse?: string | null;
    groupe_sanguin?: string | null;
}

const ENTITY_KEY = 'eleves';
const ENDPOINT = '/api/eleves/delta';

function mirrorKey(etablissementId: number | string, eleveId: number): string {
    return `eleves:${etablissementId}:${eleveId}`;
}

function indexKey(etablissementId: number | string, anneeId: number | string): string {
    return `eleves-index:${etablissementId}:${anneeId}`;
}

async function readMirror(etablissementId: number | string, anneeId: number | string): Promise<EleveDeltaItem[]> {
    const ids = (await getCached<number[]>(indexKey(etablissementId, anneeId))) ?? [];
    const items = await Promise.all(
        ids.map(async (id) => {
            const encrypted = await getCached<EncryptedPayload>(mirrorKey(etablissementId, id));
            return decryptValue<EleveDeltaItem>(encrypted);
        })
    );
    return items.filter((i): i is EleveDeltaItem => !!i);
}

/**
 * Exécute une synchro delta et met à jour le miroir local (upsert des
 * items modifiés, suppression des deletedIds) — exporté séparément de
 * `useElevesDeltaCache` pour pouvoir être appelé hors composant React (ex:
 * un futur worker de synchro périodique) sans dépendre du cycle de vie
 * d'un hook.
 */
export async function syncElevesDeltaCache(
    etablissementId: number | string,
    anneeId: number | string
): Promise<{ items: EleveDeltaItem[]; syncAt: string }> {
    const result = await runDeltaSync<EleveDeltaItem>({
        entityKey: ENTITY_KEY,
        endpoint: ENDPOINT,
        etablissementId,
        anneeId,
    });

    const existingIds = new Set((await getCached<number[]>(indexKey(etablissementId, anneeId))) ?? []);

    for (const item of result.items) {
        const encrypted = await encryptValue(item);
        if (encrypted) {
            await setCached(mirrorKey(etablissementId, item.eleve_id), encrypted);
            existingIds.add(item.eleve_id);
        }
        // encrypted === null (pas de session active / Web Crypto indisponible) :
        // on ne met PAS cet élève en cache en clair par défaut — il sera
        // simplement re-fetché au prochain sync réussi, jamais une panne
        // bloquante (voir lib/localEncryption.ts).
    }
    for (const deletedId of result.deletedIds) {
        await deleteCached(mirrorKey(etablissementId, deletedId));
        existingIds.delete(deletedId);
    }
    await setCached(indexKey(etablissementId, anneeId), Array.from(existingIds));

    return { items: await readMirror(etablissementId, anneeId), syncAt: result.syncAt };
}

interface UseElevesDeltaCacheReturn {
    eleves: EleveDeltaItem[];
    loading: boolean;
    syncing: boolean;
    error: string | null;
    lastSyncAt: string | null;
    sync: () => Promise<void>;
}

export function useElevesDeltaCache(
    etablissementId: number | string,
    anneeId: number | string
): UseElevesDeltaCacheReturn {
    const [eleves, setEleves] = useState<EleveDeltaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

    // Chargement instantané depuis le miroir local (fonctionne hors-ligne,
    // même avant toute tentative de synchro réseau). §16 : une panne
    // IndexedDB (quota dépassé, base bloquée/corrompue...) ne doit jamais
    // faire planter l'app — traitée comme un miroir vide, pas une erreur.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        readMirror(etablissementId, anneeId)
            .then((items) => { if (!cancelled) setEleves(items); })
            .catch(() => { if (!cancelled) setEleves([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [etablissementId, anneeId]);

    const sync = useCallback(async () => {
        setSyncing(true);
        setError(null);
        try {
            const { items, syncAt } = await syncElevesDeltaCache(etablissementId, anneeId);
            setEleves(items);
            setLastSyncAt(syncAt);
        } catch {
            // Hors-ligne ou erreur serveur : le miroir local déjà chargé
            // reste affiché tel quel, pas d'état d'erreur bloquant — cohérent
            // avec le reste du module offline-first (dégradation silencieuse
            // en lecture, jamais en écriture).
            setError('Synchronisation impossible — dernières données connues affichées.');
        } finally {
            setSyncing(false);
        }
    }, [etablissementId, anneeId]);

    return { eleves, loading, syncing, error, lastSyncAt, sync };
}
