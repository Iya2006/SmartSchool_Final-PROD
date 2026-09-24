'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useWhatsNew } from '@/hooks/useWhatsNew';

/**
 * Notification de mise à jour — s'affiche à un utilisateur connecté,
 * qu'il vienne de se (re)connecter ou qu'il soit déjà en train d'utiliser
 * l'app quand une nouvelle version prend le contrôle en arrière-plan
 * (voir useWhatsNew.ts). Case à cocher obligatoire avant de continuer —
 * volontaire, pas un oubli de bouton "fermer".
 */
export default function WhatsNewModal() {
    const { isAuthenticated, showPostLoginSplash } = useAuth();
    const { show, contenu, confirmerLecture } = useWhatsNew();
    const [lu, setLu] = useState(false);

    const visible = isAuthenticated && !showPostLoginSplash && show && !!contenu;

    return (
        <AnimatePresence>
            {visible && contenu && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'grid', placeItems: 'center', padding: '16px', zIndex: 9998 }}>
                    <motion.div initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '440px', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>

                        <div style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', padding: '26px 26px 22px', color: 'white' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '13px', background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
                                <Sparkles size={22} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>{contenu.titre}</h3>
                            <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.9 }}>
                                Votre application vient d&apos;être mise à jour.
                            </p>
                        </div>

                        <div style={{ padding: '22px 26px', overflowY: 'auto', flex: 1 }}>
                            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {contenu.points.map((point, i) => (
                                    <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
                                        <CheckCircle2 size={17} style={{ color: '#2563eb', flexShrink: 0, marginTop: '1px' }} />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div style={{ padding: '18px 26px 24px', borderTop: '1px solid #f1f5f9' }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: '13px', color: '#334155', fontWeight: 600, cursor: 'pointer', marginBottom: '16px' }}>
                                <input type="checkbox" checked={lu} onChange={e => setLu(e.target.checked)} style={{ marginTop: '2px' }} />
                                J&apos;ai lu et je comprends les changements ci-dessus.
                            </label>
                            <button onClick={confirmerLecture} disabled={!lu}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '12px', border: 'none', fontSize: '14px', fontWeight: 700,
                                    cursor: lu ? 'pointer' : 'not-allowed',
                                    background: lu ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#e2e8f0',
                                    color: lu ? 'white' : '#94a3b8',
                                }}>
                                Continuer
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
