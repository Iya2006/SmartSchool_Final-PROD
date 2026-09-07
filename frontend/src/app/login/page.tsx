'use client';

/**
 * Écran de connexion.
 *
 * L'habillage a changé (fond vivant, carte en verre), la LOGIQUE est
 * inchangée : même appel `/api/auth/login`, mêmes messages d'erreur, et c'est
 * toujours `AuthContext` qui, après la connexion, envoie chaque compte vers
 * l'espace de son rôle.
 *
 * Le lien « enseignant ou parent » reste indispensable : eux seuls peuvent
 * relever de plusieurs écoles et passent donc par `/login/ecole`, qui demande
 * le code de l'établissement.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, ArrowRight, BarChart3, Download, Eye, EyeOff, Info,
    LayoutGrid, Loader2, Lock, Mail, Sparkles, Users, X,
} from 'lucide-react';
// `API_BASE_URL` sert au message d'erreur : distinguer « serveur injoignable »
// de « identifiants incorrects » suppose de pouvoir nommer l'adresse appelée.
import api, { API_BASE_URL } from '@/lib/api';
import SmartSchoolMark from '@/components/SmartSchoolMark';
import styles from './login.module.css';

const ATOUTS = [
    {
        Icone: LayoutGrid,
        titre: 'Une gestion plus simple',
        texte: 'Toutes vos opérations quotidiennes dans un seul environnement.',
    },
    {
        Icone: BarChart3,
        titre: 'Une vision claire',
        texte: 'Performances, finances et activité en temps réel.',
    },
    {
        Icone: Users,
        titre: 'Une école mieux organisée',
        texte: 'Un accès adapté au rôle de chaque utilisateur.',
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
    const { canInstall, promptInstall } = useInstallPrompt();

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
            // « Identifiants incorrects » s'affichait AUSSI quand le serveur ne
            // répondait pas : origine CORS refusée, backend arrêté, mauvais
            // port. On cherche alors son mot de passe pendant que la panne est
            // ailleurs. Un problème de réseau doit se dire comme tel.
            const e = err as {
                response?: { status?: number; data?: { detail?: string } };
                code?: string;
            };
            const statut = e?.response?.status;
            const detail = e?.response?.data?.detail;

            if (!e?.response) {
                setError(
                    e?.code === 'ECONNABORTED'
                        ? "Le serveur met trop de temps à répondre. Réessayez dans un instant."
                        : `Serveur injoignable (${API_BASE_URL}). Vérifiez qu'il est démarré.`
                );
            } else if (statut === 401) {
                setError(detail || 'Identifiant ou mot de passe incorrect.');
            } else if (statut === 403) {
                setError(detail || "Ce compte n'a pas accès à l'application.");
            } else if (statut === 429) {
                setError('Trop de tentatives. Patientez une minute avant de réessayer.');
            } else {
                setError(detail || `Le serveur a refusé la connexion (erreur ${statut}).`);
            }
            setLoading(false);
        }
    };

    const canSubmit = identifiant.trim().length > 0 && password.length > 0 && !loading;

    return (
        <>
            <div className={styles.fond} aria-hidden="true" />

            <div className={styles.scene}>

                {/* ── Argumentaire ── */}
                <section className={styles.presentation}>
                    <div className={styles.marque}>
                        <div className={styles.marqueSigle}>
                            <SmartSchoolMark size={27} color="#ffffff" />
                        </div>
                        <div>
                            <p className={styles.marqueNom}>SMARTSCHOOL</p>
                            <p className={styles.marqueSignature}>
                                par <b>TrillionX</b> — Pilotez votre école. Simplement.
                            </p>
                        </div>
                    </div>

                    <span className={styles.surtitre}>
                        <Sparkles size={13} /> Gestion scolaire tout-en-un
                    </span>

                    <h2 className={styles.titre}>
                        Votre école.<br />Toute sa gestion.<br />
                        <span className={styles.degrade}>Un seul espace.</span>
                    </h2>

                    <p className={styles.accroche}>
                        SmartSchool réunit élèves, enseignants, finances, évaluations, vie scolaire
                        et administration — pour piloter votre établissement avec clarté.
                    </p>

                    <div className={styles.atouts}>
                        {ATOUTS.map(({ Icone, titre, texte }) => (
                            <div key={titre} className={styles.atout}>
                                <div className={styles.atoutIcone}><Icone size={17} /></div>
                                <div>
                                    <h3 className={styles.atoutTitre}>{titre}</h3>
                                    <p className={styles.atoutTexte}>{texte}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.garanties}>
                        <span className={styles.pointVert} /><span>Sécurité renforcée</span>
                        <span className={styles.separateurPoint}>•</span><span>Contrôle d’accès par rôle</span>
                        <span className={styles.separateurPoint}>•</span><span>Fiable au quotidien</span>
                    </div>
                </section>

                {/* ── Formulaire ── */}
                <section className={styles.colonneFormulaire}>
                    <form onSubmit={handleSubmit} className={styles.carte}>
                        <h1 className={styles.salutation}>Ravis de vous revoir.</h1>
                        <p className={styles.salutationTexte}>Connectez-vous à votre espace de gestion.</p>

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0, y: -10, height: 0 }}
                                    className={styles.erreur}
                                >
                                    <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className={styles.champ}>
                            <div className={styles.ligneLibelle}>
                                <label className={styles.libelle} htmlFor="login-identifiant">
                                    Identifiant, email ou téléphone
                                </label>
                            </div>
                            <div className={styles.cadreChamp}>
                                <Mail size={17} className={styles.iconeChamp} />
                                <input
                                    id="login-identifiant"
                                    type="text"
                                    value={identifiant}
                                    onChange={(e) => setIdentifiant(e.target.value)}
                                    placeholder="Ex: admin.ecole"
                                    required
                                    className={styles.saisie}
                                />
                            </div>
                        </div>

                        <div className={styles.champ}>
                            <div className={styles.ligneLibelle}>
                                <label className={styles.libelle} htmlFor="login-password">Mot de passe</label>
                                <span className={styles.mention}>Accès réservé</span>
                            </div>
                            <div className={styles.cadreChamp}>
                                <Lock size={17} className={styles.iconeChamp} />
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Votre mot de passe"
                                    required
                                    className={styles.saisie}
                                    style={{ paddingRight: '46px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className={styles.oeil}
                                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            className={styles.oubli}
                            onClick={() => setShowForgotInfo((prev) => !prev)}
                            aria-expanded={showForgotInfo}
                        >
                            Mot de passe oublié ?
                        </button>

                        <AnimatePresence>
                            {showForgotInfo && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className={styles.panneauOubli}
                                >
                                    <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span style={{ flex: 1 }}>
                                        La réinitialisation en ligne n&apos;est pas encore disponible.
                                        Contactez l&apos;administration de votre établissement pour
                                        réinitialiser votre mot de passe.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotInfo(false)}
                                        aria-label="Fermer"
                                        className={styles.fermerPanneau}
                                    >
                                        <X size={15} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`${styles.valider} ${canSubmit ? styles.validerActif : styles.validerInactif}`}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className={styles.rotation} /> Connexion en cours...
                                </>
                            ) : (
                                <>
                                    Se connecter <ArrowRight size={18} />
                                </>
                            )}
                        </button>

                        <div className={styles.separateur}>accès sécurisé</div>
                    </form>

                    <div className={styles.liens}>
                        <Link href="/inscription" className={styles.lien}>
                            <span>
                                <span className={styles.lienTitre}>Inscrire mon établissement</span>
                                <span className={styles.lienSousTitre}>
                                    Votre école n’est pas encore sur SmartSchool ?
                                </span>
                            </span>
                            <span className={styles.lienFleche}><ArrowRight size={17} /></span>
                        </Link>

                        {/* Enseignants et parents : espace distinct, parce qu'eux seuls
                            peuvent relever de plusieurs ecoles et ont donc besoin du
                            code de l'etablissement. */}
                        <Link href="/login/ecole" className={styles.lien}>
                            <span>
                                <span className={styles.lienTitre}>Vous êtes enseignant ou parent d’élève ?</span>
                                <span className={styles.lienSousTitre}>Espace de votre établissement</span>
                            </span>
                            <span className={styles.lienFleche}><ArrowRight size={17} /></span>
                        </Link>
                    </div>

                    {canInstall && (
                        <button type="button" className={styles.installer} onClick={promptInstall}>
                            <Download size={14} /> Installer SmartSchool
                        </button>
                    )}

                    <p className={styles.signature}>
                        <Link href="/">← Retour à l’accueil</Link><br />
                        TrillionX — Services numériques · SmartSchool
                    </p>
                </section>
            </div>
        </>
    );
}
