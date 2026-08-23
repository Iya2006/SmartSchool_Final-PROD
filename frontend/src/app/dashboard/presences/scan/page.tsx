'use client';

import PointagePersonnelScanner from '@/components/PointagePersonnelScanner';

// Écran admin de pointage du personnel. La logique de scan vit dans le
// composant partagé PointagePersonnelScanner, réutilisé tel quel dans l'espace
// du surveillant (c'est lui qui pointe réellement les enseignants).
export default function ScanPage() {
    return <PointagePersonnelScanner titre="Scan QR Code" retourHref="/dashboard/presences/historique" />;
}
