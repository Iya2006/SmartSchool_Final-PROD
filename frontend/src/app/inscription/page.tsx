'use client';

/**
 * Inscription d'une école à SmartSchool.
 *
 * Le SUPER_ADMIN est le compte de l'éditeur de la plateforme : il ne crée pas
 * les écoles une par une. Chaque école s'inscrit elle-même, et c'est son
 * fondateur qui en devient l'administrateur.
 *
 * La demande n'ouvre PAS l'accès : l'école est créée en attente et SmartSchool
 * la valide. L'écran le dit clairement dès le départ — laisser croire à une
 * activation immédiate ferait revenir le fondateur se connecter en vain.
 *
 * Trois étapes plutôt qu'un formulaire unique : quinze champs d'un coup font
 * abandonner, et l'erreur de saisie n'apparaît qu'à la fin.
 *
 * L'habillage suit désormais celui de la connexion (fond vivant, carte en
 * verre) ; la logique de validation et d'envoi est inchangée.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Clock,
    Eye, EyeOff, Loader2, Lock, Mail, MapPin, Phone, Sparkles, User,
} from 'lucide-react';
import SmartSchoolMark from '@/components/SmartSchoolMark';
import api from '@/lib/api';
import styles from './inscription.module.css';

const TYPES = [
    { code: 'PRIMAIRE', libelle: 'École primaire' },
    { code: 'COLLEGE', libelle: 'Collège' },
    { code: 'LYCEE', libelle: 'Lycée' },
    { code: 'COMPLEXE', libelle: 'Complexe scolaire' },
    { code: 'AUTRE', libelle: 'Autre' },
];

interface Formulaire {
    nom_etablissement: string;
    type_etablissement: string;
    cycles: string[];
    ville: string;
    adresse: string;
    telephone_etablissement: string;
    email_etablissement: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    mot_de_passe: string;
    confirmation: string;
}

const VIDE: Formulaire = {
    nom_etablissement: '', type_etablissement: '', cycles: [], ville: '', adresse: '',
    telephone_etablissement: '', email_etablissement: '',
    nom: '', prenom: '', email: '', telephone: '', mot_de_passe: '', confirmation: '',
};

// Cycles proposés pour un « complexe scolaire » — le fondateur coche ce que son
// école couvre réellement (toutes les combinaisons sont possibles).
const CYCLES = [
    { code: 'MAT', libelle: 'Maternelle' },
    { code: 'PRM', libelle: 'Primaire' },
    { code: 'CLG', libelle: 'Collège' },
    { code: 'LYC', libelle: 'Lycée' },
];

const ATOUTS = [
    {
        Icone: CheckCircle2,
        titre: 'Inscription gratuite',
        texte: 'Créez la demande de votre école en quelques minutes.',
    },
    {
        Icone: Lock,
        titre: 'Vos données vous appartiennent',
        texte: 'Séparées des autres établissements et protégées.',
    },
    {
        Icone: User,
        titre: 'Accompagnement au démarrage',
        texte: 'Nous formons vos équipes et restons à vos côtés.',
    },
];

export default function InscriptionPage() {
    const [etape, setEtape] = useState(1);
    const [f, setF] = useState<Formulaire>(VIDE);
    const [voirMdp, setVoirMdp] = useState(false);
    const [envoi, setEnvoi] = useState(false);
    const [erreur, setErreur] = useState('');
    const [succes, setSucces] = useState<string | null>(null);

    const set = (champ: keyof Formulaire) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setF(prev => ({ ...prev, [champ]: e.target.value }));
        setErreur('');
    };

    const toggleCycle = (code: string) => {
        setF(prev => ({
            ...prev,
            cycles: prev.cycles.includes(code)
                ? prev.cycles.filter(c => c !== code)
                : [...prev.cycles, code],
        }));
        setErreur('');
    };

    // Validation par étape : l'utilisateur est averti au moment où il saisit,
    // pas après avoir rempli quinze champs.
    const etape1Ok = f.nom_etablissement.trim().length >= 2 && f.type_etablissement !== ''
        && (f.type_etablissement !== 'COMPLEXE' || f.cycles.length > 0);
    const etape2Ok = f.nom.trim().length >= 2 && f.prenom.trim().length >= 2
        && /\S+@\S+\.\S+/.test(f.email) && f.telephone.trim().length >= 6;
    const etape3Ok = f.mot_de_passe.length >= 8 && f.mot_de_passe === f.confirmation;

    const envoyer = async () => {
        if (envoi || !etape3Ok) return;
        setEnvoi(true);
        setErreur('');
        try {
            const { confirmation, ...charge } = f;
            void confirmation;
            const res = await api.post('/api/inscription-etablissement', {
                ...charge,
                // Les cycles ne servent qu'au complexe scolaire ; sinon le type
                // seul décide (le backend ignore la liste pour les mono-cycles).
                cycles: charge.type_etablissement === 'COMPLEXE' ? charge.cycles : null,
                ville: charge.ville || null,
                adresse: charge.adresse || null,
                telephone_etablissement: charge.telephone_etablissement || null,
                email_etablissement: charge.email_etablissement || null,
            });
            setSucces(res.data?.message || 'Votre demande a bien été enregistrée.');
        } catch (err: unknown) {
            const reponse = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { status?: number; data?: { detail?: unknown } } }).response
                : undefined;
            const detail = reponse?.data?.detail;
            // 422 : FastAPI renvoie une liste d'erreurs de champ, pas une phrase.
            const message = Array.isArray(detail)
                ? (detail[0] as { msg?: string })?.msg || 'Certaines informations sont invalides.'
                : typeof detail === 'string' ? detail : null;
            setErreur(
                message
                || (reponse?.status === 409
                    ? 'Cette adresse e-mail ou ce numéro est déjà utilisé sur SmartSchool.'
                    : "L'inscription n'a pas pu être enregistrée. Réessayez dans un instant.")
            );
            setEnvoi(false);
        }
    };

    // ── Confirmation ──────────────────────────────────────────────────────
    if (succes) {
        return (
            <>
                <div className={styles.fond} aria-hidden="true" />
                <div className={`${styles.scene} ${styles.sceneCentree}`}>
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.carte}
                    >
                        <div className={styles.confirmation}>
                            <div className={styles.confirmationIcone}>
                                <CheckCircle2 size={32} />
                            </div>
                            <h1 className={styles.confirmationTitre}>Demande enregistrée</h1>
                            <p className={styles.confirmationTexte}>{succes}</p>
                            <div className={styles.attente}>
                                <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                                <span>
                                    Votre compte existe déjà, mais la connexion reste fermée tant que
                                    SmartSchool n&apos;a pas validé votre établissement.
                                </span>
                            </div>
                            <Link
                                href="/login"
                                className={`${styles.boutonPrincipal} ${styles.boutonPrincipalActif}`}
                                style={{ textDecoration: 'none', flex: 'initial', padding: '13px 28px' }}
                            >
                                Retour à la connexion
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </>
        );
    }

    // ── Formulaire ────────────────────────────────────────────────────────
    const etapeCouranteOk = etape === 1 ? etape1Ok : etape2Ok;

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
                        <Sparkles size={13} /> Nouvel établissement
                    </span>

                    <h2 className={styles.titre}>
                        Faites entrer<br />votre école<br />
                        <span className={styles.degrade}>dans SmartSchool.</span>
                    </h2>

                    <p className={styles.accroche}>
                        Trois étapes suffisent. Vous devenez l&apos;administrateur de votre
                        établissement et créez ensuite vos enseignants, élèves, parents et personnels.
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
                        <span className={styles.pointVert} /><span>Sans engagement</span>
                        <span className={styles.separateurPoint}>•</span><span>Mise en place rapide</span>
                        <span className={styles.separateurPoint}>•</span><span>Support inclus</span>
                    </div>
                </section>

                {/* ── Formulaire ── */}
                <section className={styles.colonneFormulaire}>
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.carte}
                    >
                        <div className={styles.enTete}>
                            <div className={styles.enTeteSigle}>
                                <SmartSchoolMark size={21} color="#fff" />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h1 className={styles.enTeteTitre}>Inscrire mon établissement.</h1>
                                <p className={styles.enTeteTexte}>
                                    Votre demande est vérifiée par SmartSchool avant activation.
                                </p>
                            </div>
                        </div>

                        <Progression etape={etape} />

                        {erreur && (
                            <div className={styles.erreur}>
                                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>{erreur}</span>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={etape}
                                initial={{ opacity: 0, x: 14 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -14 }}
                                transition={{ duration: 0.18 }}
                                className={styles.groupe}
                            >
                                {etape === 1 && (
                                    <>
                                        <Champ label="Nom de l'établissement" requis icone={<Building2 size={15} />}>
                                            <input className={styles.saisie} value={f.nom_etablissement}
                                                onChange={set('nom_etablissement')}
                                                placeholder="Groupe Scolaire La Renaissance" autoFocus />
                                        </Champ>

                                        <Champ label="Type d'établissement" requis>
                                            <select className={styles.saisie} value={f.type_etablissement}
                                                onChange={set('type_etablissement')}>
                                                <option value="">Choisir…</option>
                                                {TYPES.map(t => <option key={t.code} value={t.code}>{t.libelle}</option>)}
                                            </select>
                                        </Champ>

                                        {f.type_etablissement === 'COMPLEXE' && (
                                            <Champ label="Cycles de votre complexe" requis>
                                                <div className={styles.cycles}>
                                                    {CYCLES.map(c => {
                                                        const coche = f.cycles.includes(c.code);
                                                        return (
                                                            <label
                                                                key={c.code}
                                                                className={`${styles.cycle} ${coche ? styles.cycleCoche : ''}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={coche}
                                                                    onChange={() => toggleCycle(c.code)}
                                                                    className={styles.caseCycle}
                                                                />
                                                                {c.libelle}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <p className={styles.indication} style={{ marginTop: '2px' }}>
                                                    Cochez uniquement les cycles que votre école couvre (au moins un).
                                                </p>
                                            </Champ>
                                        )}

                                        <div className={styles.deux}>
                                            <Champ label="Ville" icone={<MapPin size={15} />}>
                                                <input className={styles.saisie} value={f.ville}
                                                    onChange={set('ville')} placeholder="Conakry" />
                                            </Champ>
                                            <Champ label="Téléphone de l'école" icone={<Phone size={15} />}>
                                                <input className={styles.saisie} value={f.telephone_etablissement}
                                                    onChange={set('telephone_etablissement')} placeholder="622 00 00 00" />
                                            </Champ>
                                        </div>

                                        <Champ label="Adresse">
                                            <input className={styles.saisie} value={f.adresse}
                                                onChange={set('adresse')} placeholder="Quartier, commune" />
                                        </Champ>
                                    </>
                                )}

                                {etape === 2 && (
                                    <>
                                        <p className={styles.aide}>
                                            Vous serez l&apos;<strong>administrateur</strong> de cet établissement.
                                            Ces informations serviront à vous connecter.
                                        </p>
                                        <div className={styles.deux}>
                                            <Champ label="Prénom" requis icone={<User size={15} />}>
                                                <input className={styles.saisie} value={f.prenom}
                                                    onChange={set('prenom')} autoFocus />
                                            </Champ>
                                            <Champ label="Nom" requis>
                                                <input className={styles.saisie} value={f.nom} onChange={set('nom')} />
                                            </Champ>
                                        </div>
                                        <Champ label="Adresse e-mail" requis icone={<Mail size={15} />}>
                                            <input className={styles.saisie} type="email" value={f.email}
                                                onChange={set('email')} placeholder="vous@votre-ecole.gn" />
                                        </Champ>
                                        <Champ label="Téléphone" requis icone={<Phone size={15} />}>
                                            <input className={styles.saisie} value={f.telephone}
                                                onChange={set('telephone')} placeholder="623 00 00 00" />
                                        </Champ>
                                    </>
                                )}

                                {etape === 3 && (
                                    <>
                                        <p className={styles.aide}>
                                            Choisissez le mot de passe avec lequel vous vous connecterez une fois
                                            votre établissement validé.
                                        </p>
                                        <Champ label="Mot de passe" requis icone={<Lock size={15} />}>
                                            <div className={styles.cadreMotDePasse}>
                                                <input
                                                    className={styles.saisie}
                                                    style={{ paddingRight: '42px' }}
                                                    type={voirMdp ? 'text' : 'password'}
                                                    value={f.mot_de_passe}
                                                    onChange={set('mot_de_passe')}
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setVoirMdp(v => !v)}
                                                    aria-label={voirMdp ? 'Masquer' : 'Afficher'}
                                                    className={styles.oeil}
                                                >
                                                    {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                            <span className={`${styles.indication} ${f.mot_de_passe.length >= 8 ? styles.indicationOk : ''}`}>
                                                8 caractères minimum
                                            </span>
                                        </Champ>
                                        <Champ label="Confirmer le mot de passe" requis icone={<Lock size={15} />}>
                                            <input className={styles.saisie} type="password"
                                                value={f.confirmation} onChange={set('confirmation')} />
                                            {f.confirmation.length > 0 && f.confirmation !== f.mot_de_passe && (
                                                <span className={styles.indicationErreur}>
                                                    Les deux mots de passe diffèrent.
                                                </span>
                                            )}
                                        </Champ>
                                        <Recapitulatif f={f} />
                                    </>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* Navigation — empilée sur mobile, jamais coupée */}
                        <div className={styles.navigation}>
                            {etape > 1 && (
                                <button
                                    onClick={() => { setEtape(e => e - 1); setErreur(''); }}
                                    className={styles.boutonSecondaire}
                                >
                                    <ArrowLeft size={16} /> Retour
                                </button>
                            )}
                            {etape < 3 ? (
                                <button
                                    onClick={() => { setEtape(e => e + 1); setErreur(''); }}
                                    disabled={!etapeCouranteOk}
                                    className={`${styles.boutonPrincipal} ${etapeCouranteOk ? styles.boutonPrincipalActif : styles.boutonPrincipalInactif}`}
                                >
                                    Continuer <ArrowRight size={16} />
                                </button>
                            ) : (
                                <button
                                    onClick={envoyer}
                                    disabled={!etape3Ok || envoi}
                                    className={`${styles.boutonPrincipal} ${etape3Ok && !envoi ? styles.boutonPrincipalActif : styles.boutonPrincipalInactif}`}
                                >
                                    {envoi
                                        ? <><Loader2 size={16} className={styles.rotation} /> Envoi en cours…</>
                                        : <>Envoyer ma demande <ArrowRight size={16} /></>}
                                </button>
                            )}
                        </div>

                        <p className={styles.pied}>
                            Vous avez déjà un compte ?{' '}
                            <Link href="/login">Se connecter</Link>
                        </p>
                    </motion.div>

                    <p className={styles.signature}>
                        <Link href="/">← Retour à l&apos;accueil</Link><br />
                        TrillionX — Services numériques · SmartSchool
                    </p>
                </section>
            </div>
        </>
    );
}

/* ────────────────────────────── présentation ────────────────────────────── */

function Progression({ etape }: { etape: number }) {
    const etapes = ['Établissement', 'Administrateur', 'Mot de passe'];
    return (
        <div className={styles.etapes}>
            {etapes.map((libelle, i) => {
                const atteint = etape >= i + 1;
                return (
                    <div key={libelle} className={styles.etape}>
                        <div className={`${styles.etapeBarre} ${atteint ? styles.etapeBarreActive : ''}`} />
                        <span className={`${styles.etapeLibelle} ${atteint ? styles.etapeLibelleActif : ''}`}>
                            {libelle}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function Champ({ label, requis, icone, children }: {
    label: string; requis?: boolean; icone?: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <label className={styles.champ}>
            <span className={styles.libelle}>
                {icone}{label}{requis && <span className={styles.requis}>*</span>}
            </span>
            {children}
        </label>
    );
}

function Recapitulatif({ f }: { f: Formulaire }) {
    const type = TYPES.find(t => t.code === f.type_etablissement)?.libelle || f.type_etablissement;
    return (
        <div className={styles.recapitulatif}>
            <span className={styles.recapitulatifTitre}>Récapitulatif</span>
            <Ligne libelle="Établissement" valeur={f.nom_etablissement} />
            <Ligne libelle="Type" valeur={type} />
            {f.ville && <Ligne libelle="Ville" valeur={f.ville} />}
            <Ligne libelle="Administrateur" valeur={`${f.prenom} ${f.nom}`} />
            <Ligne libelle="Connexion" valeur={f.email} />
        </div>
    );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
    return (
        <div className={styles.recapitulatifLigne}>
            <span className={styles.recapitulatifLibelle}>{libelle}</span>
            <span className={styles.recapitulatifValeur}>{valeur || '—'}</span>
        </div>
    );
}
