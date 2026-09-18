'use client';

import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import BrandSplash from './BrandSplash';

const DUREE_MS = 3000;

/**
 * Écran affiché juste après une connexion réussie (piloté par
 * AuthContext.showPostLoginSplash, mis à true dans login() uniquement —
 * pas sur un simple rechargement de page déjà connecté). La navigation
 * vers la destination a déjà eu lieu au moment où cet overlay apparaît ;
 * il masque simplement le montage de cette page pendant qu'elle se charge.
 */
export default function PostLoginSplash() {
    const { showPostLoginSplash, setShowPostLoginSplash, user } = useAuth();

    useEffect(() => {
        if (!showPostLoginSplash) return;
        const t = setTimeout(() => setShowPostLoginSplash(false), DUREE_MS);
        return () => clearTimeout(t);
    }, [showPostLoginSplash, setShowPostLoginSplash]);

    return (
        <AnimatePresence>
            {showPostLoginSplash && (
                <BrandSplash variant="postLogin" message={user?.prenom ? `Bienvenue, ${user.prenom}` : 'Bienvenue'} />
            )}
        </AnimatePresence>
    );
}
