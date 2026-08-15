'use client';

/**
 * Horaires de l'établissement — source unique.
 *
 * Les réglages saisis dans Paramètres › Emploi du temps sont lus ICI, et
 * uniquement ici. Sans ce module, l'écran de réglages enregistrerait des
 * valeurs que personne ne consulte : c'est le défaut des « interrupteurs sans
 * fil » déjà corrigé sur la notation, à ne pas reproduire.
 *
 * Les valeurs par défaut correspondent à une journée scolaire guinéenne
 * courante (8h-17h, pause de midi). Une école qui n'a rien réglé fonctionne
 * donc normalement.
 */
import api from '@/lib/api';

export interface Horaires {
    debut: string;
    fin: string;
    /** Durée d'un créneau, en minutes. */
    dureeCours: number;
    pauseDebut: string;
    pauseFin: string;
    /** Minutes de retard à partir desquelles l'élève est noté « en retard ». */
    seuilRetard: number;
    /** Au-delà, il est compté absent plutôt qu'en retard. */
    seuilAbsence: number;
    joursOuvres: string[];
}

/**
 * Les sept jours, dans l'ordre de la semaine.
 *
 * Sert de référence d'ordre : les jours ouvrés d'une école sont un
 * sous-ensemble de cette liste, jamais une liste réordonnée à la main.
 * Doit rester identique à `JOURS_SEMAINE` du backend
 * (`app/api/emploi_du_temps.py`) — deux listes divergentes, c'est un jour
 * qu'un écran propose et que le serveur refuse.
 */
export const JOURS_SEMAINE = [
    'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE',
] as const;

export const LIBELLE_JOUR: Record<string, string> = {
    LUNDI: 'Lundi', MARDI: 'Mardi', MERCREDI: 'Mercredi', JEUDI: 'Jeudi',
    VENDREDI: 'Vendredi', SAMEDI: 'Samedi', DIMANCHE: 'Dimanche',
};

/** Remet des jours ouvrés dans l'ordre de la semaine et écarte l'inconnu. */
export function ordonnerJours(jours: string[]): string[] {
    const choisis = new Set(jours.map(j => j.toUpperCase()));
    return JOURS_SEMAINE.filter(j => choisis.has(j));
}

export const HORAIRES_DEFAUT: Horaires = {
    debut: '08:00',
    fin: '17:00',
    dureeCours: 60,
    pauseDebut: '12:00',
    pauseFin: '13:00',
    seuilRetard: 10,
    seuilAbsence: 30,
    joursOuvres: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'],
};

const CATEGORIE = 'EMPLOI_DU_TEMPS';

/** Évite de redemander les horaires à chaque écran d'une même session. */
let cache: Horaires | null = null;

export function invaliderCacheHoraires(): void {
    cache = null;
}

export async function chargerHoraires(): Promise<Horaires> {
    if (cache) return cache;
    try {
        const res = await api.get(`/api/parametrage/settings?categorie=${CATEGORIE}`);
        const lus: Record<string, string> = {};
        for (const p of res.data || []) lus[p.cle] = p.valeur;
        cache = {
            debut: lus['horaires.debut'] || HORAIRES_DEFAUT.debut,
            fin: lus['horaires.fin'] || HORAIRES_DEFAUT.fin,
            dureeCours: Number(lus['horaires.duree_cours']) || HORAIRES_DEFAUT.dureeCours,
            pauseDebut: lus['horaires.pause_debut'] || HORAIRES_DEFAUT.pauseDebut,
            pauseFin: lus['horaires.pause_fin'] || HORAIRES_DEFAUT.pauseFin,
            seuilRetard: Number(lus['horaires.seuil_retard']) || HORAIRES_DEFAUT.seuilRetard,
            seuilAbsence: Number(lus['horaires.seuil_absence']) || HORAIRES_DEFAUT.seuilAbsence,
            // Une école qui n'aurait plus aucun jour ouvré ne pourrait plus
            // rien programmer : on retombe alors sur la semaine standard,
            // exactement comme le fait le serveur.
            joursOuvres: (() => {
                const bruts = lus['horaires.jours_ouvres']?.split(',').filter(Boolean) ?? [];
                const propres = ordonnerJours(bruts);
                return propres.length > 0 ? propres : HORAIRES_DEFAUT.joursOuvres;
            })(),
        };
        return cache;
    } catch {
        // Une école sans réglage — ou une lecture qui échoue — ne doit pas
        // bloquer l'emploi du temps : on retombe sur une journée standard.
        return HORAIRES_DEFAUT;
    }
}

function enMinutes(heure: string): number {
    const [h, m] = heure.split(':');
    return Number(h) * 60 + Number(m || 0);
}

function enHeure(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Créneaux de la journée, pause exclue.
 *
 * C'est cette fonction qui traduit les réglages en grille affichable : elle
 * est la raison d'être de l'écran de paramètres.
 */
export function creneauxDeLaJournee(h: Horaires): { debut: string; fin: string }[] {
    const creneaux: { debut: string; fin: string }[] = [];
    const finJournee = enMinutes(h.fin);
    const pauseDebut = enMinutes(h.pauseDebut);
    const pauseFin = enMinutes(h.pauseFin);

    let courant = enMinutes(h.debut);
    // Garde-fou : une durée nulle ou négative boucle à l'infini.
    const duree = Math.max(5, h.dureeCours);

    while (courant + duree <= finJournee) {
        // Un créneau qui chevauche la pause est repoussé après elle.
        if (courant < pauseFin && courant + duree > pauseDebut) {
            courant = pauseFin;
            continue;
        }
        creneaux.push({ debut: enHeure(courant), fin: enHeure(courant + duree) });
        courant += duree;
    }
    return creneaux;
}

/**
 * Qualifie une arrivée : à l'heure, en retard, ou absent.
 *
 * Le pointage tranchait sur des seuils codés en dur ; ils viennent désormais
 * des réglages de l'école, qui n'ont pas toutes la même tolérance.
 */
export function qualifierArrivee(
    heureArrivee: string,
    heureDebutCours: string,
    h: Horaires,
): 'PRESENT' | 'RETARD' | 'ABSENT' {
    const ecart = enMinutes(heureArrivee) - enMinutes(heureDebutCours);
    if (ecart <= h.seuilRetard) return 'PRESENT';
    if (ecart < h.seuilAbsence) return 'RETARD';
    return 'ABSENT';
}
