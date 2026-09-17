'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface BrandSplashProps {
    /** 'boot' : ouverture de l'app, lockup complet (logo + texte).
     *  'postLogin' : juste après connexion, blason seul + message court. */
    variant: 'boot' | 'postLogin';
    message?: string;
}

/**
 * Présentation partagée des deux écrans de démarrage premium (BootSplash,
 * PostLoginSplash) — évite de dupliquer l'animation. Fond clair, cohérent
 * avec la page de connexion (pas de fond sombre : le logo a un fond blanc
 * intégré à l'image, un fond sombre ferait ressortir un carré blanc autour).
 */
export default function BrandSplash({ variant, message }: BrandSplashProps) {
    const src = variant === 'boot' ? '/brand/logo-full.png' : '/brand/logo-mark.png';
    const size = variant === 'boot' ? 220 : 140;

    return (
        <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '20px',
                // Blanc pur : le logo a un fond blanc integre a l'image (pas de
                // transparence) — un degrade ici ferait ressortir le contour
                // carre du logo au lieu de se fondre dedans.
                background: '#ffffff',
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    width: size,
                    height: size,
                    position: 'relative',
                    filter: 'drop-shadow(0 8px 24px rgba(37, 99, 235, 0.18))',
                }}
            >
                <Image src={src} alt="SmartSchool" fill sizes={`${size}px`} priority style={{ objectFit: 'contain' }} />
            </motion.div>

            {message && (
                <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.35 }}
                    style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#334155' }}
                >
                    {message}
                </motion.p>
            )}

            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 2.1, delay: 0.5, ease: 'easeInOut' }}
                style={{
                    width: '120px',
                    height: '3px',
                    borderRadius: '999px',
                    background: 'linear-gradient(90deg, #2563eb, #10b981)',
                    transformOrigin: 'left',
                }}
            />
        </motion.div>
    );
}
