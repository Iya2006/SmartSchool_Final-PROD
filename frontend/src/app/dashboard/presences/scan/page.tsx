'use client';

import PointageEnseignants from '@/components/PointageEnseignants';

// Écran admin « Pointage enseignants » : scanner, saisie manuelle et historique
// (avec suppression) au même endroit — exactement ce que voit le surveillant.
// L'ancien menu séparé « Historique Présence » est devenu inutile : l'historique
// vit ici, dans l'onglet dédié.
export default function ScanPage() {
    return <PointageEnseignants />;
}
