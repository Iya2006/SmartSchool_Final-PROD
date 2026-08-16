'use client';

/**
 * Comptabilité › Dépenses — ce que l'école sort.
 *
 * Le serveur gérait déjà les dépenses (création, approbation, statistiques) :
 * il manquait uniquement l'écran. Une école pouvait donc encaisser sans jamais
 * pouvoir enregistrer ce qu'elle payait — la moitié du métier d'un comptable.
 *
 * L'écran suit le geste réel : on saisit une dépense, elle attend une
 * approbation, puis elle est payée. Le statut n'est pas décoratif, c'est le
 * cycle de vie de la pièce.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Check, Loader2, Plus, RefreshCw, Search, TrendingDown, Wallet, X,
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';

interface Depense {
    depense_id: number;
    categorie: string;
    description: string;
    montant: number;
    date_depense: string | null;
    fournisseur: string | null;
    reference: string | null;
    statut: string;
    mode_paiement: string | null;
}

interface Stats {
    total_depenses: number;
    total_valide: number;
    total_en_attente: number;
    par_categorie: { categorie: string; total: number; nb: number }[];
}

// Catégories courantes d'une école guinéenne. La liste reste ouverte : le
// champ accepte une saisie libre, parce qu'aucune liste figée ne couvrira les
// dépenses réelles de toutes les écoles.
const CATEGORIES = [
    'SALAIRES', 'FOURNITURES', 'ENTRETIEN', 'ELECTRICITE', 'EAU',
    'LOYER', 'TRANSPORT', 'CANTINE', 'EQUIPEMENT', 'AUTRE',
];

const MODES = ['ESPECES', 'VIREMENT', 'CHEQUE', 'MOBILE_MONEY'];

const LIBELLE_MODE: Record<string, string> = {
    ESPECES: 'Espèces', VIREMENT: 'Virement', CHEQUE: 'Chèque',
    MOBILE_MONEY: 'Mobile money (Orange, MTN…)',
};

/** Bornes de date pour l'historique. Renvoie null pour « tout l'historique ». */
function bornesPeriode(p: 'tout' | 'jour' | 'semaine' | 'mois'): { debut: string; fin: string } | null {
    if (p === 'tout') return null;
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const fin = new Date();
    const debut = new Date();
    if (p === 'jour') {
        // aujourd'hui
    } else if (p === 'semaine') {
        // depuis lundi de la semaine en cours
        const jour = (debut.getDay() + 6) % 7; // lundi = 0
        debut.setDate(debut.getDate() - jour);
    } else if (p === 'mois') {
        debut.setDate(1);
    }
    return { debut: iso(debut), fin: iso(fin) };
}

const STATUTS: Record<string, { libelle: string; fond: string; texte: string }> = {
    EN_ATTENTE: { libelle: 'En attente', fond: '#fffbeb', texte: '#b45309' },
    VALIDE:     { libelle: 'Validée',    fond: '#f0fdf4', texte: '#15803d' },
    PAYE:       { libelle: 'Payée',      fond: '#eff6ff', texte: '#1d4ed8' },
    REJETE:     { libelle: 'Rejetée',    fond: '#fef2f2', texte: '#b91c1c' },
};

function montant(v: number): string {
    return new Intl.NumberFormat('fr-FR').format(Math.round(v || 0)) + ' GNF';
}

export default function DepensesPage() {
    const { etablissementId } = useApp();
    const [depenses, setDepenses] = useState<Depense[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [recherche, setRecherche] = useState('');
    const [filtreStatut, setFiltreStatut] = useState('');
    // Historique : période (jour / semaine / mois / tout) et moyen de paiement.
    const [periode, setPeriode] = useState<'tout' | 'jour' | 'semaine' | 'mois'>('tout');
    const [filtreMode, setFiltreMode] = useState('');
    const [formulaire, setFormulaire] = useState(false);
    const [enCours, setEnCours] = useState<number | null>(null);

    const charger = useCallback(async () => {
        setChargement(true);
        setErreur(null);
        try {
            const params = new URLSearchParams({ limit: '200' });
            if (filtreStatut) params.set('statut', filtreStatut);
            if (filtreMode) params.set('mode_paiement', filtreMode);
            const bornes = bornesPeriode(periode);
            if (bornes) {
                params.set('date_debut', bornes.debut);
                params.set('date_fin', bornes.fin);
            }
            const [liste, resume] = await Promise.all([
                api.get(`/api/finance/depenses?${params}`),
                api.get('/api/finance/depenses/stats').catch(() => ({ data: null })),
            ]);
            setDepenses(Array.isArray(liste.data) ? liste.data : []);
            setStats(resume.data);
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || 'Impossible de charger les dépenses.');
            setDepenses([]);
        } finally {
            setChargement(false);
        }
    }, [filtreStatut, filtreMode, periode]);

    useEffect(() => { charger(); }, [charger]);
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(() => setMessage(null), 4000);
        return () => clearTimeout(t);
    }, [message]);

    const approuver = async (d: Depense) => {
        setEnCours(d.depense_id);
        try {
            await api.put(`/api/finance/depenses/${d.depense_id}/approuver`);
            setMessage(`Dépense « ${d.description} » approuvée.`);
            await charger();
        } catch {
            setErreur("L'approbation a échoué. Rien n'a été modifié.");
        } finally {
            setEnCours(null);
        }
    };

    const visibles = useMemo(() => {
        const q = recherche.trim().toLowerCase();
        if (!q) return depenses;
        return depenses.filter(d =>
            (d.description || '').toLowerCase().includes(q)
            || (d.fournisseur || '').toLowerCase().includes(q)
            || (d.categorie || '').toLowerCase().includes(q)
        );
    }, [depenses, recherche]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 25px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Wallet size={23} style={{ color: '#b45309' }} /> Dépenses
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Ce que l&apos;école paie : fournitures, entretien, loyer, factures.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={charger} disabled={chargement} style={boutonDiscret}>
                        <RefreshCw size={15} style={chargement ? { animation: 'spin 1s linear infinite' } : undefined} /> Actualiser
                    </button>
                    <button onClick={() => setFormulaire(true)} style={boutonPrincipal}>
                        <Plus size={15} /> Nouvelle dépense
                    </button>
                </div>
            </div>

            {message && <Bandeau ton="ok" icone={<Check size={16} />}>{message}</Bandeau>}
            {erreur && <Bandeau ton="ko" icone={<AlertTriangle size={16} />}>{erreur}</Bandeau>}

            {/* Trois chiffres, pas trente. */}
            {stats && (
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    <Carte titre="Total des dépenses" valeur={montant(stats.total_depenses)} accent="#b45309" />
                    <Carte titre="Validées" valeur={montant(stats.total_valide)} accent="#15803d" />
                    <Carte titre="En attente d'approbation" valeur={montant(stats.total_en_attente)} accent="#64748b" />
                </div>
            )}

            {/* Historique : période + moyen de paiement. */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                    {([['tout', 'Tout'], ['jour', "Aujourd'hui"], ['semaine', 'Cette semaine'], ['mois', 'Ce mois']] as const).map(([cle, lib]) => (
                        <button key={cle} onClick={() => setPeriode(cle)} style={{
                            padding: '7px 13px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontSize: '12.5px', fontWeight: periode === cle ? 800 : 600,
                            background: periode === cle ? '#fff' : 'transparent',
                            color: periode === cle ? '#b45309' : '#64748b',
                            boxShadow: periode === cle ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}>{lib}</button>
                    ))}
                </div>
                <select value={filtreMode} onChange={e => setFiltreMode(e.target.value)} style={{ ...champ, width: 'auto', minWidth: '160px' }}>
                    <option value="">Tous les moyens de paiement</option>
                    {MODES.map(m => <option key={m} value={m}>{LIBELLE_MODE[m] || m}</option>)}
                </select>
            </div>

            {/* Répartition par moyen de paiement sur la période/filtre courant. */}
            {!chargement && visibles.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {MODES.map(m => {
                        const total = visibles.filter(d => (d.mode_paiement || '').toUpperCase() === m)
                            .reduce((s, d) => s + (Number(d.montant) || 0), 0);
                        if (total <= 0) return null;
                        return (
                            <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '99px', background: '#fff', border: '1px solid #e2e8f0', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                                {LIBELLE_MODE[m] || m} : <span style={{ color: '#b45309' }}>{montant(total)}</span>
                            </span>
                        );
                    })}
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={recherche} onChange={e => setRecherche(e.target.value)}
                        placeholder="Rechercher un libellé, un fournisseur, une catégorie…"
                        style={{ ...champ, paddingLeft: '34px' }} />
                </div>
                <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} style={{ ...champ, width: 'auto', minWidth: '150px' }}>
                    <option value="">Tous les statuts</option>
                    {Object.entries(STATUTS).map(([cle, v]) => <option key={cle} value={cle}>{v.libelle}</option>)}
                </select>
            </div>

            {chargement ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '56px' }}>
                    <Loader2 size={26} style={{ color: '#b45309', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : visibles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '52px 24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                    <TrendingDown size={36} style={{ color: '#cbd5e1' }} />
                    <p style={{ fontWeight: 800, color: '#334155', margin: '12px 0 4px', fontSize: '15px' }}>
                        {recherche || filtreStatut ? 'Aucun résultat' : 'Aucune dépense enregistrée'}
                    </p>
                    <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                        {recherche || filtreStatut
                            ? 'Modifiez votre recherche ou le filtre.'
                            : 'Enregistrez ici tout ce que l’école paie, pour suivre son solde réel.'}
                    </p>
                </div>
            ) : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                    {/* Le tableau a son propre défilement : la page ne part
                        jamais de travers sur un téléphone. */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <Th>Date</Th><Th>Libellé</Th><Th>Catégorie</Th><Th>Fournisseur</Th>
                                    <Th align="right">Montant</Th><Th>Statut</Th><Th align="right">Action</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.map(d => {
                                    const st = STATUTS[d.statut] || { libelle: d.statut, fond: '#f1f5f9', texte: '#64748b' };
                                    return (
                                        <tr key={d.depense_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <Td>{d.date_depense ? new Date(d.date_depense).toLocaleDateString('fr-FR') : '—'}</Td>
                                            <Td><strong style={{ color: '#0f172a' }}>{d.description}</strong></Td>
                                            <Td>{d.categorie}</Td>
                                            <Td>{d.fournisseur || '—'}</Td>
                                            <Td align="right" nowrap><strong>{montant(d.montant)}</strong></Td>
                                            <Td>
                                                <span style={{ padding: '3px 9px', borderRadius: 99, background: st.fond, color: st.texte, fontSize: '11.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                                    {st.libelle}
                                                </span>
                                            </Td>
                                            <Td align="right">
                                                {d.statut === 'EN_ATTENTE' && (
                                                    <button onClick={() => approuver(d)} disabled={enCours === d.depense_id}
                                                        style={{ ...boutonDiscret, padding: '6px 11px', fontSize: '12px', color: '#15803d', borderColor: '#bbf7d0' }}>
                                                        {enCours === d.depense_id
                                                            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                                            : <Check size={13} />} Approuver
                                                    </button>
                                                )}
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {formulaire && (
                <FormulaireDepense
                    etablissementId={etablissementId}
                    onFerme={() => setFormulaire(false)}
                    onCree={(texte) => { setFormulaire(false); setMessage(texte); charger(); }}
                />
            )}
            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </div>
    );
}

/* ─────────────────────────── saisie d'une dépense ─────────────────────────── */

function FormulaireDepense({ etablissementId, onFerme, onCree }: {
    etablissementId: number; onFerme: () => void; onCree: (message: string) => void;
}) {
    const [f, setF] = useState({
        libelle: '', categorie: 'FOURNITURES', montant: '', fournisseur: '',
        mode_paiement: 'ESPECES', reference: '',
    });
    const [envoi, setEnvoi] = useState(false);
    const [erreur, setErreur] = useState('');
    const [anneeId, setAnneeId] = useState<number | null>(null);

    // L'année scolaire est obligatoire côté serveur : on prend celle en cours
    // plutôt que de la demander à l'utilisateur, qui n'a pas à la connaître.
    useEffect(() => {
        api.get('/api/parametrage/annees')
            .then(res => {
                const liste = Array.isArray(res.data) ? res.data : [];
                const courante = liste.find((a: { est_courante?: string }) => a.est_courante === 'O') || liste[0];
                setAnneeId(courante?.annee_id ?? null);
            })
            .catch(() => setAnneeId(null));
    }, []);

    const valide = f.libelle.trim().length >= 2 && Number(f.montant) > 0;

    const envoyer = async () => {
        if (!valide || envoi) return;
        if (!anneeId) { setErreur("Aucune année scolaire en cours : impossible d'enregistrer."); return; }
        setEnvoi(true);
        setErreur('');
        try {
            await api.post('/api/finance/depenses', {
                etablissement_id: etablissementId,
                annee_id: anneeId,
                categorie: f.categorie,
                libelle: f.libelle.trim(),
                montant: Number(f.montant),
                fournisseur: f.fournisseur.trim() || null,
                mode_paiement: f.mode_paiement,
            });
            onCree(`Dépense « ${f.libelle.trim()} » enregistrée, en attente d'approbation.`);
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || "L'enregistrement a échoué. Rien n'a été créé.");
            setEnvoi(false);
        }
    };

    return (
        <div onClick={onFerme} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '16px', zIndex: 70 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '18px', padding: '22px', width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wallet size={18} style={{ color: '#b45309' }} /> Nouvelle dépense
                    </h3>
                    <button onClick={onFerme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                {erreur && (
                    <div style={{ padding: '11px 13px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>
                        {erreur}
                    </div>
                )}

                <Champ label="Libellé" requis>
                    <input value={f.libelle} onChange={e => setF(s => ({ ...s, libelle: e.target.value }))}
                        placeholder="Achat de craie et cahiers" style={champ} autoFocus />
                </Champ>

                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Champ label="Montant (GNF)" requis>
                        <input type="number" min={1} value={f.montant}
                            onChange={e => setF(s => ({ ...s, montant: e.target.value }))} style={champ} />
                    </Champ>
                    <Champ label="Catégorie">
                        <select value={f.categorie} onChange={e => setF(s => ({ ...s, categorie: e.target.value }))} style={champ}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                        </select>
                    </Champ>
                    <Champ label="Fournisseur">
                        <input value={f.fournisseur} onChange={e => setF(s => ({ ...s, fournisseur: e.target.value }))} style={champ} />
                    </Champ>
                    <Champ label="Mode de paiement">
                        <select value={f.mode_paiement} onChange={e => setF(s => ({ ...s, mode_paiement: e.target.value }))} style={champ}>
                            {MODES.map(m => <option key={m} value={m}>{m.replace('_', ' ').toLowerCase()}</option>)}
                        </select>
                    </Champ>
                </div>

                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: 1.55 }}>
                    La dépense est créée <strong>en attente d&apos;approbation</strong>. Elle n&apos;entre
                    dans les totaux validés qu&apos;une fois approuvée.
                </p>

                <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
                    <button onClick={onFerme} disabled={envoi} style={{ ...boutonSecondaire, flex: 1, minWidth: '110px' }}>Annuler</button>
                    <button onClick={envoyer} disabled={!valide || envoi} style={{
                        ...boutonPrincipal, flex: 1, minWidth: '110px',
                        opacity: valide && !envoi ? 1 : 0.5, cursor: valide && !envoi ? 'pointer' : 'not-allowed',
                    }}>
                        {envoi ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────── présentation ────────────────────────────── */

function Carte({ titre, valeur, accent }: { titre: string; valeur: string; accent: string }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '15px 17px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titre}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: accent, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{valeur}</div>
        </div>
    );
}

function Bandeau({ ton, icone, children }: { ton: 'ok' | 'ko'; icone: React.ReactNode; children: React.ReactNode }) {
    const ok = ton === 'ok';
    return (
        <div style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 15px', borderRadius: '12px',
            background: ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
            color: ok ? '#15803d' : '#b91c1c',
        }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{icone}</span>
            <span style={{ fontSize: '13px', lineHeight: 1.5 }}>{children}</span>
        </div>
    );
}

function Champ({ label, requis, children }: { label: string; requis?: boolean; children: React.ReactNode }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                {label}{requis && <span style={{ color: '#dc2626' }}> *</span>}
            </span>
            {children}
        </label>
    );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
        <th style={{ padding: '11px 16px', fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: align, whiteSpace: 'nowrap' }}>
            {children}
        </th>
    );
}

function Td({ children, align = 'left', nowrap }: { children: React.ReactNode; align?: 'left' | 'right'; nowrap?: boolean }) {
    return (
        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#475569', textAlign: align, whiteSpace: nowrap ? 'nowrap' : undefined, fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined }}>
            {children}
        </td>
    );
}

const champ: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none', color: '#0f172a',
};

const boutonPrincipal: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    padding: '9px 16px', borderRadius: '10px', border: 'none',
    background: 'linear-gradient(135deg,#92400e,#b45309)', color: '#fff',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};

const boutonSecondaire: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '9px 16px', borderRadius: '10px', border: '1px solid #cbd5e1',
    background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};

const boutonDiscret: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px',
    borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff',
    color: '#475569', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};
