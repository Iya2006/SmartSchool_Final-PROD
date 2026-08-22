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

export interface Pause {
    debut: string;
    fin: string;
}

export interface Horaires {
    debut: string;
    fin: string;
    /** Durée d'un créneau, en minutes. */
    dureeCours: number;
    /**
     * Les pauses de la journée. Une école peut en avoir plusieurs (récréation
     * du matin, déjeuner, pause de l'après-midi…). `pauseDebut`/`pauseFin`
     * restent exposés — ils pointent sur la PREMIÈRE pause — pour les écrans
     * qui n'en lisaient qu'une, mais la source de vérité est `pauses`.
     */
    pauses: Pause[];
    pauseDebut: string;
    pauseFin: string;
    /** Minutes de retard à partir desquelles l'élève est noté « en retard ». */
    seuilRetard: number;
    /** Au-delà, il est compté absent plutôt qu'en retard. */
    seuilAbsence: number;
    joursOuvres: string[];
}

/**
 * Les pauses sont stockées dans un seul réglage `horaires.pauses`, sous la
 * forme `"12:00-13:00,15:30-15:45"`. On garde aussi `horaires.pause_debut`/
 * `horaires.pause_fin` (première pause) pour ne rien casser des écrans qui les
 * lisaient encore.
 */
export function parsePauses(valeur: string | undefined | null): Pause[] {
    if (!valeur) return [];
    return valeur
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => {
            const [debut, fin] = p.split('-').map(s => s.trim());
            return debut && fin ? { debut, fin } : null;
        })
        .filter((p): p is Pause => p !== null);
}

export function formatPauses(pauses: Pause[]): string {
    return pauses
        .filter(p => p.debut && p.fin)
        .map(p => `${p.debut}-${p.fin}`)
        .join(',');
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

/**
 * Colonnes (codes de jour) à afficher dans une grille d'emploi du temps.
 *
 * On part des jours ouvrés configurés par l'école (samedi inclus si elle
 * travaille le samedi) et on y ajoute, par sécurité, tout jour où un cours
 * existe réellement — ainsi un créneau du samedi reste visible même si le
 * réglage « jours ouvrés » a changé depuis. Le tout remis dans l'ordre de la
 * semaine. Remplace les listes figées lundi→vendredi des portails, qui
 * masquaient purement et simplement le samedi.
 */
export function joursAffichesEmploi(joursOuvres: string[], joursAvecCours: string[] = []): string[] {
    const jours = ordonnerJours([...joursOuvres, ...joursAvecCours]);
    return jours.length > 0 ? jours : ordonnerJours(HORAIRES_DEFAUT.joursOuvres);
}

export const HORAIRES_DEFAUT: Horaires = {
    debut: '08:00',
    fin: '17:00',
    dureeCours: 60,
    pauses: [{ debut: '12:00', fin: '13:00' }],
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
        // Pauses : on lit d'abord la liste `horaires.pauses` ; à défaut, on
        // reconstitue depuis l'ancienne pause unique ; à défaut encore, défaut.
        let pauses = parsePauses(lus['horaires.pauses']);
        if (pauses.length === 0) {
            const d = lus['horaires.pause_debut'];
            const f = lus['horaires.pause_fin'];
            pauses = d && f ? [{ debut: d, fin: f }] : HORAIRES_DEFAUT.pauses;
        }
        cache = {
            debut: lus['horaires.debut'] || HORAIRES_DEFAUT.debut,
            fin: lus['horaires.fin'] || HORAIRES_DEFAUT.fin,
            dureeCours: Number(lus['horaires.duree_cours']) || HORAIRES_DEFAUT.dureeCours,
            pauses,
            pauseDebut: pauses[0]?.debut || HORAIRES_DEFAUT.pauseDebut,
            pauseFin: pauses[0]?.fin || HORAIRES_DEFAUT.pauseFin,
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
    // Toutes les pauses de la journée, triées, en minutes.
    const pauses = (h.pauses?.length ? h.pauses : [{ debut: h.pauseDebut, fin: h.pauseFin }])
        .map(p => ({ debut: enMinutes(p.debut), fin: enMinutes(p.fin) }))
        .filter(p => p.fin > p.debut)
        .sort((a, b) => a.debut - b.debut);

    let courant = enMinutes(h.debut);
    // Garde-fou : une durée nulle ou négative boucle à l'infini.
    const duree = Math.max(5, h.dureeCours);

    while (courant + duree <= finJournee) {
        // Un créneau qui chevauche une pause est repoussé après CETTE pause.
        const chevauchee = pauses.find(p => courant < p.fin && courant + duree > p.debut);
        if (chevauchee) {
            courant = chevauchee.fin;
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
