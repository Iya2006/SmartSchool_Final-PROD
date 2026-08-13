'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight, BarChart3, Download, Eye, EyeOff, Info, LayoutGrid, Loader2,
    Lock, Mail, ShieldCheck, Sparkles, AlertTriangle, Users, X,
} from 'lucide-react';
import api from '@/lib/api';
import styles from './login.module.css';

const BENEFITS = [
    {
        icon: LayoutGrid,
        title: 'Une gestion plus simple',
        text: 'Centralisez vos opérations quotidiennes dans un seul environnement.',
    },
    {
        icon: BarChart3,
        title: 'Une vision claire',
        text: 'Suivez les performances, les finances et l’activité de votre établissement en temps réel.',
    },
    {
        icon: Users,
        title: 'Une école mieux organisée',
        text: 'Donnez à chaque utilisateur un accès adapté à son rôle.',
    },
];

export default function LoginPage() {
    const [identifiant, setIdentifiant] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showForgotInfo, setShowForgotInfo] = useState(false);

    const { login } = useAuth();
    const { etablissementNom, etablissementLogo } = useApp();
    const { canInstall, promptInstall } = useInstallPrompt();

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const logoSrc = useMemo(
        () => etablissementLogo ? (etablissementLogo.startsWith('http') ? etablissementLogo : `${API_BASE}${etablissementLogo}`) : null,
        [API_BASE, etablissementLogo]
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setError('');
        setLoading(true);

        try {
            const res = await api.post('/api/auth/login', {
                identifiant: identifiant.trim(),
                mot_de_passe: password,
            });
            login(res.data.token, res.data.user);
        } catch (err: unknown) {
            const message = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setError(message || 'Impossible de vous connecter avec ces identifiants.');
            setLoading(false);
        }
    };

    const canSubmit = identifiant.trim().length > 0 && password.length > 0 && !loading;

    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <div className={styles.heroBackdrop} />
                <img src="/brand/trillionx-watermark.png" alt="" aria-hidden="true" className={styles.heroWatermark} />
                <div className={styles.heroBrand}>
                    <div className={styles.heroBadge}>
                        {logoSrc ? (
                            <img src={logoSrc} alt={etablissementNom ? `Logo ${etablissementNom}` : 'Logo établissement'} />
                        ) : (
                            <ShieldCheck size={24} />
                        )}
                    </div>
                    <div>
                        <h1 className={styles.heroWordmark}>SMARTSCHOOL</h1>
                        <p className={styles.heroTagline}>Pilotez votre école. Simplement.</p>
                    </div>
                </div>

                <div className={styles.heroBody}>
                    <div>
                        <span className={styles.heroEyebrow}>
                            <Sparkles size={13} /> Gestion scolaire tout-en-un
                        </span>
                        <h2 className={styles.heroTitle}>
                            Votre école. Toute sa gestion. Un seul espace.
                        </h2>
                        <p className={styles.heroSubtitle}>
                            SmartSchool centralise les élèves, les enseignants, les finances, les évaluations,
                            la vie scolaire et l&apos;administration pour vous permettre de piloter votre
                            établissement avec clarté.
                        </p>
                    </div>

                    <div className={styles.heroBenefits}>
                        {BENEFITS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.title} className={styles.benefitCard}>
                                    <div className={styles.benefitIcon}>
                                        <Icon size={17} />
                                    </div>
                                    <h3 className={styles.benefitTitle}>{item.title}</h3>
                                    <p className={styles.benefitText}>{item.text}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.heroTrustStrip}>
                    <span>Sécurité renforcée</span>
                    <span>•</span>
                    <span>Contrôle d’accès par rôle</span>
                    <span>•</span>
                    <span>Fiable au quotidien</span>
                </div>
            </section>

            <section className={styles.formSection}>
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className={styles.formInner}>
                    <div className={styles.formHeading}>
                        <p className={styles.formEyebrow}>Portail sécurisé</p>
                        <h2 className={styles.formTitle}>Bienvenue sur SmartSchool</h2>
                        <p className={styles.formSubtitle}>Connectez-vous à votre espace de gestion.</p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.card}>
                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -10, height: 0 }} className={styles.errorBanner}>
                                    <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div>
                            <label className={styles.fieldLabel} htmlFor="login-identifiant">Identifiant, email ou téléphone</label>
                            <div className={styles.fieldWrap}>
                                <Mail size={17} className={styles.fieldIcon} />
                                <input
                                    id="login-identifiant"
                                    type="text"
                                    value={identifiant}
                                    onChange={(e) => setIdentifiant(e.target.value)}
                                    placeholder="Ex: admin.ecole"
                                    required
                                    className={styles.input}
                                />
                            </div>
                        </div>

                        <div>
                            <div className={styles.fieldLabelRow}>
                                <label className={styles.fieldLabel} htmlFor="login-password" style={{ marginBottom: 0 }}>Mot de passe</label>
                                <span className={styles.fieldHint}>Accès réservé</span>
                            </div>
                            <div className={styles.fieldWrap}>
                                <Lock size={17} className={styles.fieldIcon} />
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className={styles.input}
                                    style={{ paddingRight: '46px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className={styles.togglePwdBtn}
                                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            className={styles.forgotLink}
                            onClick={() => setShowForgotInfo((prev) => !prev)}
                            aria-expanded={showForgotInfo}
                        >
                            Mot de passe oublié ?
                        </button>

                        <AnimatePresence>
                            {showForgotInfo && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                    className={styles.forgotPanel}
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}
                                >
                                    <Info size={16} style={{ flexShrink: 0, marginTop: 1, color: '#64748b' }} />
                                    <span style={{ flex: 1 }}>
                                        La réinitialisation en ligne n&apos;est pas encore disponible.
                                        Contactez l&apos;administration de votre établissement pour réinitialiser votre mot de passe.
                                    </span>
                                    <button type="button" onClick={() => setShowForgotInfo(false)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                                        <X size={15} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`${styles.submitBtn} ${canSubmit ? styles.submitBtnActive : styles.submitBtnDisabled}`}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className={styles.spin} /> Connexion en cours...
                                </>
                            ) : (
                                <>
                                    Se connecter <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className={styles.asideLinks}>
                        <div className={styles.inscriptionCard}>
                            <p className={styles.inscriptionEyebrow}>Votre école n’est pas encore sur SmartSchool ?</p>
                            <p className={styles.inscriptionText}>
                                Inscrivez votre établissement en trois étapes. Vous en devenez l’administrateur et créez ensuite vos enseignants, élèves, parents et personnels.
                            </p>
                            <Link href="/inscription" className={styles.inscriptionCta}>
                                Inscrire mon établissement <ArrowRight size={15} />
                            </Link>
                        </div>

                        {/* Enseignants et parents : espace distinct, parce qu'eux
                            seuls peuvent relever de plusieurs ecoles et ont donc
                            besoin du code de l'etablissement. */}
                        <Link href="/login/ecole" className={styles.ecoleLink}>
                            <span style={{ minWidth: 0 }}>
                                <span className={styles.ecoleLinkTitle}>Vous êtes enseignant ou parent d’élève ?</span>
                                <span className={styles.ecoleLinkSubtitle}>Connectez-vous à l’espace de votre établissement</span>
                            </span>
                            <span style={{ flexShrink: 0, color: '#2563eb' }}><ArrowRight size={18} /></span>
                        </Link>

                        {canInstall && (
                            <button type="button" className={styles.installBtn} onClick={promptInstall}>
                                <Download size={14} /> Installer SmartSchool
                            </button>
                        )}

                        <p className={styles.footerNote}>
                            SmartSchool • Système d’information scolaire sécurisé
                        </p>
                    </div>
                </motion.div>
            </section>
        </div>
    );
}
