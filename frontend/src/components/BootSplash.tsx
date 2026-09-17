'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import BrandSplash from './BrandSplash';

const DUREE_MS = 3000;

/**
 * Écran de démarrage à l'ouverture de l'app — purement visuel (overlay),
 * le reste de l'arbre (Providers/AppShell) monte normalement en dessous
 * pendant ce temps : aucun retard introduit sur l'auth ou les requêtes.
 * S'affiche une fois par vrai chargement de page (le layout racine ne
 * remonte pas entre deux navigations internes Next.js).
 */
export default function BootSplash() {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const t = setTimeout(() => setVisible(false), DUREE_MS);
        return () => clearTimeout(t);
    }, []);

    return (
        <AnimatePresence>
            {visible && <BrandSplash variant="boot" />}
        </AnimatePresence>
    );
}
