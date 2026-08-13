'use client';

/**
 * Connexion enseignant / parent — avec le code de l'établissement.
 *
 * Un enseignant peut exercer dans plusieurs écoles, un parent avoir des
 * enfants dans plusieurs écoles : une fiche par école, donc le même numéro de
 * téléphone plusieurs fois sur la plateforme. Le code lève l'ambiguïté.
 *
 * Le code est FACULTATIF côté serveur : si l'identifiant ne désigne qu'une
 * seule personne, la connexion passe sans lui. Il ne devient nécessaire que
 * lorsque plusieurs écoles utilisent le même identifiant — auquel cas le
 * serveur répond 409 et cet écran met le champ en évidence, au lieu de laisser
 * l'utilisateur deviner ce qui cloche.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    AlertTriangle, ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Loader2,
    Lock, ShieldCheck, User, Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export default function ConnexionEcolePage() {
    const { login } = useAuth();
    const [identifiant, setIdentifiant] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [code, setCode] = useState('');
    const [voirMdp, setVoirMdp] = useState(false);
    const [chargement, setChargement] = useState(false);
    const [erreur, setErreur] = useState('');
    // Passe à vrai quand le serveur signale que l'identifiant sert dans
    // plusieurs écoles : le champ code devient alors obligatoire à l'écran.
    const [codeRequis, setCodeRequis] = useState(false);

    const soumettre = async (e: React.FormEvent) => {
        e.preventDefault();
        if (chargement) return;
        setErreur('');
        setChargement(true);
        try {
            const res = await api.post('/api/auth/login', {
                identifiant: identifiant.trim(),
                mot_de_passe: motDePasse,
                // Chaîne vide = pas de code : le serveur ne doit pas la traiter
                // comme un code inconnu.
                code_etablissement: code.trim() || null,
            });
            login(res.data.token, res.data.user);
        } catch (err: unknown) {
            const reponse = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
                : undefined;
            if (reponse?.status === 409) {
                setCodeRequis(true);
                setErreur(
                    reponse.data?.detail
                    || "Cet identifiant est utilisé dans plusieurs établissements. Saisissez le code de votre école."
                );
            } else if (reponse?.status === 404) {
                setErreur(reponse.data?.detail || "Code d'établissement inconnu.");
            } else {
                setErreur(reponse?.data?.detail || 'Identifiant ou mot de passe incorrect');
            }
            setChargement(false);
        }
    };

    const pretAEnvoyer = identifiant.trim().length > 0 && motDePasse.length > 0
        && (!codeRequis || code.trim().length > 0) && !chargement;

    return (
        <div className="login-ecole-page" style={{
            background: 'linear-gradient(135deg,#0f172a 0%,#111827 52%,#1e3a8a 100%)',
            display: 'grid', placeItems: 'center',
            padding: 'max(16px, env(safe-area-inset-top)) clamp(16px, 4vw, 48px) max(16px, env(safe-area-inset-bottom))',
        }}>
            <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    width: '100%', maxWidth: '460px', background: '#fff', borderRadius: '20px',
                    padding: 'clamp(22px, 4vw, 34px)', display: 'flex', flexDirection: 'column',
                    gap: '18px', boxShadow: '0 24px 60px rgba(2,6,23,0.32)',
                }}
            >
                <Link href="/login" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px',
                    color: '#64748b', textDecoration: 'none', fontWeight: 600,
                }}>
                    <ArrowLeft size={15} /> Retour
                </Link>

                <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
                    <div style={{ width: 46, height: 46, borderRadius: '14px', background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Users size={22} color="#fff" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>
                            Enseignants et parents
                        </h1>
                        <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                            Connectez-vous à l&apos;espace de votre établissement.
                        </p>
                    </div>
                </div>

                {erreur && (
                    <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '11px' }}>
                        <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>{erreur}</span>
                    </div>
                )}

                <form onSubmit={soumettre} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <Champ label="Téléphone, e-mail ou matricule" icone={<User size={15} />}>
                        <input
                            style={champStyle} value={identifiant} autoFocus
                            onChange={e => { setIdentifiant(e.target.value); setErreur(''); }}
                            placeholder="622 00 00 00"
                        />
                    </Champ>

                    <Champ label="Mot de passe" icone={<Lock size={15} />}>
                        <div style={{ position: 'relative' }}>
                            <input
                                style={{ ...champStyle, paddingRight: '42px' }}
                                type={voirMdp ? 'text' : 'password'}
                                value={motDePasse}
                                onChange={e => { setMotDePasse(e.target.value); setErreur(''); }}
                            />
                            <button type="button" onClick={() => setVoirMdp(v => !v)}
                                aria-label={voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 10, minWidth: '40px', minHeight: '40px', display: 'grid', placeItems: 'center' }}>
                                {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </Champ>

                    <Champ
                        label={codeRequis ? "Code de l'établissement" : "Code de l'établissement (si vous en avez un)"}
                        icone={<Building2 size={15} />}
                        requis={codeRequis}
                    >
                        <input
                            style={{
                                ...champStyle,
                                textTransform: 'uppercase',
                                borderColor: codeRequis ? '#f59e0b' : '#cbd5e1',
                                background: codeRequis ? '#fffbeb' : '#fff',
                            }}
                            value={code}
                            onChange={e => { setCode(e.target.value); setErreur(''); }}
                            placeholder="EXCEL"
                        />
                        <span style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                            {codeRequis
                                ? "Votre identifiant est utilisé dans plusieurs établissements : indiquez lequel."
                                : "À remplir uniquement si vous exercez — ou avez des enfants — dans plusieurs écoles. Votre établissement vous l'a communiqué."}
                        </span>
                    </Champ>

                    <button type="submit" disabled={!pretAEnvoyer} style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '13px 20px', minHeight: '48px', borderRadius: '11px', border: 'none',
                        background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff',
                        fontSize: '14px', fontWeight: 700,
                        cursor: pretAEnvoyer ? 'pointer' : 'not-allowed',
                        opacity: pretAEnvoyer ? 1 : 0.5,
                    }}>
                        {chargement
                            ? <><Loader2 size={17} className="animate-spin" /> Connexion en cours…</>
                            : <>Se connecter <ArrowRight size={16} /></>}
                    </button>
                </form>

                <div style={{ display: 'flex', gap: '9px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '11px' }}>
                    <ShieldCheck size={15} style={{ color: '#64748b', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.55 }}>
                        Vous n&apos;accédez qu&apos;aux données de l&apos;établissement auquel vous vous
                        connectez. Pour en changer, reconnectez-vous avec son code.
                    </span>
                </div>

                <p style={{ margin: 0, textAlign: 'center', fontSize: '12.5px', color: '#94a3b8' }}>
                    Personnel de direction ou administratif ?{' '}
                    <Link href="/login" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
                        Connexion administration
                    </Link>
                </p>
            </motion.div>

            <style dangerouslySetInnerHTML={{ __html: '.login-ecole-page { min-height: 100vh; min-height: 100dvh; } @keyframes spin { to { transform: rotate(360deg); } } .animate-spin { animation: spin 1s linear infinite; }' }} />
        </div>
    );
}

function Champ({ label, icone, requis, children }: {
    label: string; icone?: React.ReactNode; requis?: boolean; children: React.ReactNode;
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

const champStyle: React.CSSProperties = {
    width: '100%', padding: '13px', minHeight: '44px', borderRadius: '10px', border: '1px solid #cbd5e1',
    fontSize: '14px', color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box',
};
