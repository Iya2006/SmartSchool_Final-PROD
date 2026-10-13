'use client';

/**
 * Vérification publique d'un reçu — page ouverte par le QR code imprimé sur
 * chaque reçu (voir backend/app/core/recu_paiement.py). Accessible SANS
 * compte : un parent, une banque ou une autre école doit pouvoir s'assurer
 * qu'un reçu est authentique. Les informations affichées viennent du
 * serveur, pas du QR : un faux reçu ne peut pas « fabriquer » sa preuve.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, Search } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { formaterMontant } from '@/components/RecuPaiement';

type Verification = {
    authentique: boolean;
    statut?: string;
    numero_recu?: string;
    date_paiement?: string | null;
    heure?: string | null;
    montant?: number;
    montant_en_lettres?: string;
    devise?: string;
    mode_paiement?: string;
    tranche?: { numero: number; total: number } | null;
    motif?: string;
    numero_facture?: string;
    facture?: { montant_total: number; paye_a_date: number; reste_a_date: number; reste_actuel: number; statut_actuel: string };
    eleve?: { prenom: string; nom: string; matricule: string; classe: string };
    annee_libelle?: string | null;
    etablissement?: { nom: string; logo_url: string | null; couleur: string; adresse: string; telephone: string };
};

const dateFr = (iso?: string | null) => {
    if (!iso) return '—';
    const [a, m, j] = iso.slice(0, 10).split('-');
    return j && m && a ? `${j}/${m}/${a}` : iso;
};

function Ligne({ libelle, valeur, fort }: { libelle: string; valeur: React.ReactNode; fort?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid #eef2f7' }}>
            <span style={{ color: '#64748b', fontSize: 13.5 }}>{libelle}</span>
            <span style={{ color: '#0f172a', fontSize: 14, fontWeight: fort ? 800 : 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{valeur}</span>
        </div>
    );
}

function Verifier() {
    const params = useSearchParams();
    const router = useRouter();
    const n = params.get('n') || '';
    const c = params.get('c') || '';
    const [etat, setEtat] = useState<'saisie' | 'chargement' | 'resultat' | 'erreur'>(n && c ? 'chargement' : 'saisie');
    const [resultat, setResultat] = useState<Verification | null>(null);
    const [numero, setNumero] = useState(n);
    const [code, setCode] = useState(c);

    const verifier = useCallback(async (num: string, cod: string) => {
        setEtat('chargement');
        try {
            const url = `${API_BASE_URL}/api/public/recus/verifier?${new URLSearchParams({ n: num.trim(), c: cod.trim() })}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(String(res.status));
            setResultat(await res.json());
            setEtat('resultat');
        } catch {
            setEtat('erreur');
        }
    }, []);

    useEffect(() => {
        if (n && c) verifier(n, c);
    }, [n, c, verifier]);

    const P = resultat?.etablissement?.couleur || '#1e3a8a';
    const annule = resultat?.statut === 'ANNULE';
    const devise = resultat?.devise || 'GNF';

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)', padding: '28px 16px', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
            <div style={{ maxWidth: 520, margin: '0 auto' }}>
                <p style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 12, fontWeight: 800, letterSpacing: '0.25em', color: '#475569' }}>VÉRIFICATION DE REÇU</p>

                {etat === 'chargement' && (
                    <div style={{ background: '#fff', borderRadius: 18, padding: 40, textAlign: 'center', boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
                        <Loader2 size={34} color="#64748b" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ color: '#64748b', margin: '12px 0 0' }}>Vérification en cours…</p>
                    </div>
                )}

                {etat === 'erreur' && (
                    <div style={{ background: '#fff', borderRadius: 18, padding: 28, textAlign: 'center', boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
                        <ShieldAlert size={44} color="#d97706" />
                        <h1 style={{ fontSize: 19, margin: '10px 0 6px' }}>Vérification impossible pour le moment</h1>
                        <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Le serveur ne répond pas. Vérifiez votre connexion et réessayez.</p>
                        <button onClick={() => verifier(numero, code)} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, border: 'none', background: '#1e3a8a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Réessayer</button>
                    </div>
                )}

                {etat === 'resultat' && resultat && !resultat.authentique && (
                    <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
                        <div style={{ background: '#dc2626', color: '#fff', padding: '22px 20px', textAlign: 'center' }}>
                            <ShieldX size={46} />
                            <h1 style={{ fontSize: 21, margin: '8px 0 0' }}>Reçu non reconnu</h1>
                        </div>
                        <div style={{ padding: 20, fontSize: 14, color: '#334155', lineHeight: 1.55 }}>
                            Aucun reçu ne correspond à ce numéro et à ce code de vérification. Le reçu a peut-être été
                            modifié ou n&apos;a pas été émis par SmartSchool. <strong>Ne l&apos;acceptez pas comme preuve de paiement</strong> et
                            renseignez-vous auprès de l&apos;établissement.
                        </div>
                    </div>
                )}

                {etat === 'resultat' && resultat?.authentique && (
                    <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
                        <div style={{ background: annule ? '#dc2626' : '#059669', color: '#fff', padding: '20px', textAlign: 'center' }}>
                            {annule ? <ShieldAlert size={44} /> : <ShieldCheck size={44} />}
                            <h1 style={{ fontSize: 21, margin: '8px 0 2px' }}>{annule ? 'Reçu authentique — paiement ANNULÉ' : 'Reçu authentique'}</h1>
                            <p style={{ margin: 0, fontSize: 13, opacity: 0.92 }}>
                                {annule ? "Ce paiement a été annulé par l'établissement : ce reçu n'a plus de valeur." : "Émis par l'établissement ci-dessous et enregistré dans SmartSchool."}
                            </p>
                        </div>
                        <div style={{ background: P, color: '#fff', padding: '12px 20px', textAlign: 'center' }}>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: 16, textTransform: 'uppercase' }}>{resultat.etablissement?.nom}</p>
                            {(resultat.etablissement?.adresse || resultat.etablissement?.telephone) && (
                                <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>
                                    {[resultat.etablissement?.adresse, resultat.etablissement?.telephone ? `Tél : ${resultat.etablissement.telephone}` : ''].filter(Boolean).join('  •  ')}
                                </p>
                            )}
                        </div>
                        <div style={{ padding: '16px 20px 20px' }}>
                            <div style={{ textAlign: 'center', marginBottom: 10 }}>
                                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Montant reçu</p>
                                <p style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 900, color: annule ? '#dc2626' : '#059669', textDecoration: annule ? 'line-through' : 'none' }}>
                                    {formaterMontant(resultat.montant)} {devise}
                                </p>
                                {resultat.montant_en_lettres && (
                                    <p style={{ margin: '2px 0 0', fontSize: 12.5, fontStyle: 'italic', color: '#334155' }}>
                                        {resultat.montant_en_lettres.charAt(0).toUpperCase() + resultat.montant_en_lettres.slice(1)} {devise === 'GNF' ? 'francs guinéens' : devise}
                                    </p>
                                )}
                            </div>
                            <Ligne libelle="Reçu N°" valeur={resultat.numero_recu} fort />
                            <Ligne libelle="Payé le" valeur={`${dateFr(resultat.date_paiement)}${resultat.heure ? ` à ${resultat.heure}` : ''}`} />
                            <Ligne libelle="Élève" valeur={`${resultat.eleve?.prenom || ''} ${resultat.eleve?.nom || ''}`} fort />
                            <Ligne libelle="Matricule" valeur={resultat.eleve?.matricule || '—'} />
                            <Ligne libelle="Classe" valeur={`${resultat.eleve?.classe || '—'}${resultat.annee_libelle ? ` (${resultat.annee_libelle})` : ''}`} />
                            <Ligne libelle="Motif" valeur={resultat.motif || '—'} />
                            {resultat.tranche && <Ligne libelle="Tranche" valeur={`${resultat.tranche.numero} sur ${resultat.tranche.total}`} />}
                            <Ligne libelle="Mode de paiement" valeur={resultat.mode_paiement || '—'} />
                            <Ligne libelle="Total de la facture" valeur={`${formaterMontant(resultat.facture?.montant_total)} ${devise}`} />
                            <Ligne libelle="Payé à la date du reçu" valeur={`${formaterMontant(resultat.facture?.paye_a_date)} ${devise}`} />
                            <Ligne libelle="Reste à la date du reçu" valeur={`${formaterMontant(resultat.facture?.reste_a_date)} ${devise}`} fort />
                            {resultat.facture && resultat.facture.reste_actuel !== resultat.facture.reste_a_date && (
                                <Ligne libelle="Reste à payer aujourd'hui" valeur={`${formaterMontant(resultat.facture.reste_actuel)} ${devise}`} fort />
                            )}
                        </div>
                    </div>
                )}

                {(etat === 'saisie' || etat === 'resultat' || etat === 'erreur') && (
                    <form
                        onSubmit={e => { e.preventDefault(); router.replace(`/verifier-recu?${new URLSearchParams({ n: numero.trim(), c: code.trim() })}`); verifier(numero, code); }}
                        style={{ marginTop: 18, background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 6px 20px rgba(15,23,42,0.06)' }}
                    >
                        <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                            {etat === 'saisie' ? 'Saisissez les informations du reçu' : 'Vérifier un autre reçu'}
                        </p>
                        <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="N° du reçu (ex. REC-9-2025-00007)" required
                            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, marginBottom: 8 }} />
                        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code de vérification (ex. Q7KD-M2PX-4HZT)" required
                            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase' }} />
                        <button type="submit" style={{ marginTop: 10, width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <Search size={16} /> Vérifier
                        </button>
                    </form>
                )}
                <p style={{ textAlign: 'center', fontSize: 11.5, color: '#94a3b8', marginTop: 18 }}>Service de vérification SmartSchool</p>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function VerifierRecuPage() {
    return (
        <Suspense fallback={null}>
            <Verifier />
        </Suspense>
    );
}
