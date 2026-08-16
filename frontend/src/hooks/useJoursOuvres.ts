'use client';

/**
 * Jours de classe de l'établissement.
 *
 * Quatre grilles d'emploi du temps portaient chacune leur propre liste
 * `['LUNDI'…'VENDREDI']` figée dans le fichier. Conséquence : une école qui a
 * cours le samedi ne pouvait pas poser le créneau — et, si un samedi finissait
 * malgré tout en base, aucune des quatre grilles ne l'affichait. Le réglage
 * existait pourtant depuis toujours dans Paramètres › Emploi du temps ; il
 * n'était simplement lu nulle part.
 *
 * Ce hook est la seule lecture de ce réglage pour les grilles en consultation.
 * Il ne bloque jamais l'affichage : tant que les horaires ne sont pas revenus,
 * la semaine standard est rendue.
 */
import { useEffect, useState } from 'react';
import { chargerHoraires, HORAIRES_DEFAUT } from '@/lib/horaires';

export function useJoursOuvres(): string[] {
    const [jours, setJours] = useState<string[]>(HORAIRES_DEFAUT.joursOuvres);

    useEffect(() => {
        let annule = false;
        chargerHoraires()
            .then(h => { if (!annule) setJours(h.joursOuvres); })
            .catch(() => { /* la semaine standard reste affichée */ });
        return () => { annule = true; };
    }, []);

    return jours;
}
