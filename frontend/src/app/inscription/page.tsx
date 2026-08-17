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
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Clock,
    Eye, EyeOff, Loader2, Lock, Mail, MapPin, Phone, User,
} from 'lucide-react';
import SmartSchoolMark from '@/components/SmartSchoolMark';
import api from '@/lib/api';

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
    nom_etablissement: '', type_etablissement: '', ville: '', adresse: '',
    telephone_etablissement: '', email_etablissement: '',
    nom: '', prenom: '', email: '', telephone: '', mot_de_passe: '', confirmation: '',
};

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

    // Validation par étape : l'utilisateur est averti au moment où il saisit,
    // pas après avoir rempli quinze champs.
    const etape1Ok = f.nom_etablissement.trim().length >= 2 && f.type_etablissement !== '';
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
            <Page>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={carte}>
                    <div style={{ display: 'grid', placeItems: 'center', gap: '18px', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '20px', background: '#dcfce7', display: 'grid', placeItems: 'center' }}>
                            <CheckCircle2 size={32} style={{ color: '#16a34a' }} />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                            Demande enregistrée
                        </h1>
                        <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.6, maxWidth: '420px' }}>
                            {succes}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', textAlign: 'left' }}>
                            <Clock size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
                            <span style={{ fontSize: '13px', color: '#92400e', lineHeight: 1.5 }}>
                                Votre compte existe déjà, mais la connexion reste fermée tant que
                                SmartSchool n&apos;a pas validé votre établissement.
                            </span>
                        </div>
                        <Link href="/login" style={{ ...boutonPrincipal, textDecoration: 'none', display: 'inline-flex', width: 'auto', padding: '12px 28px' }}>
                            Retour à la connexion
                        </Link>
                    </div>
                </motion.div>
            </Page>
        );
    }

    // ── Formulaire ────────────────────────────────────────────────────────
    return (
        <Page>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={carte}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '13px', background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <SmartSchoolMark size={21} color="#fff" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>Inscrire mon établissement</h1>
                        <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                            Votre demande est vérifiée par SmartSchool avant activation.
                        </p>
                    </div>
                </div>

                <Progression etape={etape} />

                {erreur && (
                    <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '11px' }}>
                        <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>{erreur}</span>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={etape}
                        initial={{ opacity: 0, x: 14 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -14 }}
                        transition={{ duration: 0.18 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                    >
                        {etape === 1 && (
                            <>
                                <Champ label="Nom de l'établissement" requis icone={<Building2 size={15} />}>
                                    <input style={input} value={f.nom_etablissement} onChange={set('nom_etablissement')}
                                        placeholder="Groupe Scolaire La Renaissance" autoFocus />
                                </Champ>
                                <Champ label="Type d'établissement" requis>
                                    <select style={input} value={f.type_etablissement} onChange={set('type_etablissement')}>
                                        <option value="">Choisir…</option>
                                        {TYPES.map(t => <option key={t.code} value={t.code}>{t.libelle}</option>)}
                                    </select>
                                </Champ>
                                <Deux>
                                    <Champ label="Ville" icone={<MapPin size={15} />}>
                                        <input style={input} value={f.ville} onChange={set('ville')} placeholder="Conakry" />
                                    </Champ>
                                    <Champ label="Téléphone de l'école" icone={<Phone size={15} />}>
                                        <input style={input} value={f.telephone_etablissement} onChange={set('telephone_etablissement')} placeholder="622 00 00 00" />
                                    </Champ>
                                </Deux>
                                <Champ label="Adresse">
                                    <input style={input} value={f.adresse} onChange={set('adresse')} placeholder="Quartier, commune" />
                                </Champ>
                            </>
                        )}

                        {etape === 2 && (
                            <>
                                <p style={aide}>
                                    Vous serez l&apos;<strong>administrateur</strong> de cet établissement.
                                    Ces informations serviront à vous connecter.
                                </p>
                                <Deux>
                                    <Champ label="Prénom" requis icone={<User size={15} />}>
                                        <input style={input} value={f.prenom} onChange={set('prenom')} autoFocus />
                                    </Champ>
                                    <Champ label="Nom" requis>
                                        <input style={input} value={f.nom} onChange={set('nom')} />
                                    </Champ>
                                </Deux>
                                <Champ label="Adresse e-mail" requis icone={<Mail size={15} />}>
                                    <input style={input} type="email" value={f.email} onChange={set('email')} placeholder="vous@votre-ecole.gn" />
                                </Champ>
                                <Champ label="Téléphone" requis icone={<Phone size={15} />}>
                                    <input style={input} value={f.telephone} onChange={set('telephone')} placeholder="623 00 00 00" />
                                </Champ>
                            </>
                        )}

                        {etape === 3 && (
                            <>
                                <p style={aide}>
                                    Choisissez le mot de passe avec lequel vous vous connecterez une fois
                                    votre établissement validé.
                                </p>
                                <Champ label="Mot de passe" requis icone={<Lock size={15} />}>
                                    <div style={{ position: 'relative' }}>
                                        <input style={{ ...input, paddingRight: '42px' }} type={voirMdp ? 'text' : 'password'}
                                            value={f.mot_de_passe} onChange={set('mot_de_passe')} autoFocus />
                                        <button type="button" onClick={() => setVoirMdp(v => !v)}
                                            aria-label={voirMdp ? 'Masquer' : 'Afficher'}
                                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                                            {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <span style={{ fontSize: '11.5px', color: f.mot_de_passe.length >= 8 ? '#16a34a' : '#94a3b8' }}>
                                        8 caractères minimum
                                    </span>
                                </Champ>
                                <Champ label="Confirmer le mot de passe" requis icone={<Lock size={15} />}>
                                    <input style={input} type="password" value={f.confirmation} onChange={set('confirmation')} />
                                    {f.confirmation.length > 0 && f.confirmation !== f.mot_de_passe && (
                                        <span style={{ fontSize: '11.5px', color: '#dc2626' }}>Les deux mots de passe diffèrent.</span>
                                    )}
                                </Champ>
                                <Recapitulatif f={f} />
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Navigation — empilée sur mobile, jamais coupée */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {etape > 1 && (
                        <button onClick={() => { setEtape(e => e - 1); setErreur(''); }} style={boutonSecondaire}>
                            <ArrowLeft size={16} /> Retour
                        </button>
                    )}
                    {etape < 3 ? (
                        <button
                            onClick={() => { setEtape(e => e + 1); setErreur(''); }}
                            disabled={etape === 1 ? !etape1Ok : !etape2Ok}
                            style={{ ...boutonPrincipal, opacity: (etape === 1 ? etape1Ok : etape2Ok) ? 1 : 0.5, cursor: (etape === 1 ? etape1Ok : etape2Ok) ? 'pointer' : 'not-allowed' }}
                        >
                            Continuer <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button onClick={envoyer} disabled={!etape3Ok || envoi}
                            style={{ ...boutonPrincipal, opacity: etape3Ok && !envoi ? 1 : 0.5, cursor: etape3Ok && !envoi ? 'pointer' : 'not-allowed' }}>
                            {envoi ? <><Loader2 size={16} className="animate-spin" /> Envoi en cours…</> : <>Envoyer ma demande <ArrowRight size={16} /></>}
                        </button>
                    )}
                </div>

                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', textAlign: 'center' }}>
                    Vous avez déjà un compte ?{' '}
                    <Link href="/login" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Se connecter</Link>
                </p>
            </motion.div>
        </Page>
    );
}

/* ────────────────────────────── présentation ────────────────────────────── */

function Page({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#111827 52%,#1e3a8a 100%)',
            display: 'grid', placeItems: 'center', padding: 'clamp(16px, 4vw, 48px)',
        }}>
            {children}
        </div>
    );
}

function Progression({ etape }: { etape: number }) {
    const etapes = ['Établissement', 'Administrateur', 'Mot de passe'];
    return (
        <div style={{ display: 'flex', gap: '6px', margin: '4px 0 2px' }}>
            {etapes.map((libelle, i) => {
                const n = i + 1;
                const atteint = etape >= n;
                return (
                    <div key={libelle} style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ height: 4, borderRadius: 99, background: atteint ? '#2563eb' : '#e2e8f0', transition: 'background .2s' }} />
                        <span style={{
                            display: 'block', marginTop: 6, fontSize: '11px', fontWeight: atteint ? 800 : 600,
                            color: atteint ? '#2563eb' : '#94a3b8',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{libelle}</span>
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {icone}{label}{requis && <span style={{ color: '#dc2626' }}>*</span>}
            </span>
            {children}
        </label>
    );
}

function Deux({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {children}
        </div>
    );
}

function Recapitulatif({ f }: { f: Formulaire }) {
    const type = TYPES.find(t => t.code === f.type_etablissement)?.libelle || f.type_etablissement;
    return (
        <div style={{ padding: '13px 15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Récapitulatif
            </span>
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
        <div style={{ display: 'flex', gap: '10px', fontSize: '12.5px' }}>
            <span style={{ color: '#94a3b8', flexShrink: 0 }}>{libelle}</span>
            <span style={{ color: '#0f172a', fontWeight: 700, marginLeft: 'auto', textAlign: 'right', wordBreak: 'break-word' }}>
                {valeur || '—'}
            </span>
        </div>
    );
}

const carte: React.CSSProperties = {
    width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '20px',
    padding: 'clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', gap: '16px',
    boxShadow: '0 24px 60px rgba(2,6,23,0.32)',
};

const input: React.CSSProperties = {
    width: '100%', padding: '11px 13px', borderRadius: '10px', border: '1px solid #cbd5e1',
    fontSize: '14px', color: '#0f172a', background: '#fff', outline: 'none',
};

const aide: React.CSSProperties = {
    margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.55,
    padding: '11px 13px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '11px',
};

const boutonPrincipal: React.CSSProperties = {
    flex: 1, minWidth: '160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px', padding: '12px 20px', borderRadius: '11px', border: 'none',
    background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff',
    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
};

const boutonSecondaire: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    padding: '12px 18px', borderRadius: '11px', border: '1px solid #cbd5e1',
    background: '#fff', color: '#475569', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
};
