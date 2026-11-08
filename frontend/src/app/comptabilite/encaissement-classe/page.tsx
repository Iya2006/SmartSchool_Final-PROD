'use client';

/**
 * Encaisser une classe en une seule fois.
 *
 * Le caissier choisit une classe, voit pour CHAQUE élève ce qui a déjà été
 * réglé et ce qui reste dû, tarif par tarif, puis saisit ce qu'il encaisse
 * aujourd'hui. Il peut sauter un tarif, en régler un partiellement, ignorer
 * un élève entier.
 *
 * POURQUOI LA SITUATION S'AFFICHE AVANT LA SAISIE
 * Sans elle, rien n'empêchait d'encaisser une seconde fois un frais déjà
 * payé — l'erreur se découvrait le jour où un parent présentait son reçu.
 * Les frais déjà soldés sont donc montrés comme tels et ne proposent aucune
 * saisie.
 *
 * Chaque versement produit SON reçu, comme à l'unité : un reçu appartient à
 * une famille. Pour remettre un seul feuillet à une famille qui a payé
 * plusieurs frais, l'historique propose un récapitulatif.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, Banknote, CheckCircle2, Loader2, Users,
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import { fetchModesPaiement, modePaiementLabel, DEFAULT_MODES_PAIEMENT } from '@/lib/modesPaiement';

type Frais = {
    facture_id: number; numero_facture: string; tarif: string;
    montant_du: number; deja_paye: number; reste: number; statut: string;
};
type EleveSituation = {
    eleve_id: number; matricule: string | null; nom_complet: string;
    total_du: number; total_paye: number; reste: number;
    solde: 'SOLDE' | 'EN_COURS'; frais: Frais[];
};
type Classe = { classe_id: number; libelle: string };

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

const champ: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 10, border: '1.5px solid #d5e1f6',
    fontSize: 14, color: '#12213f', background: '#fff', outline: 'none',
};

export default function EncaissementClassePage() {
    const { etablissementId, anneeId } = useApp();

    const [classes, setClasses] = useState<Classe[]>([]);
    const [classeId, setClasseId] = useState<string>('');
    const [eleves, setEleves] = useState<EleveSituation[]>([]);
    const [chargement, setChargement] = useState(false);

    const [modes, setModes] = useState<string[]>(DEFAULT_MODES_PAIEMENT);
    const [mode, setMode] = useState<string>(DEFAULT_MODES_PAIEMENT[0] || 'ESPECES');
    const [reference, setReference] = useState('');

    // Montant saisi par facture. Vide ou 0 = on n'encaisse pas cette ligne.
    const [saisies, setSaisies] = useState<Record<number, string>>({});
    const [envoi, setEnvoi] = useState(false);
    const [resultat, setResultat] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);

    useEffect(() => {
        api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
            .then(r => setClasses(r.data)).catch(() => setClasses([]));
        fetchModesPaiement().then(m => {
            setModes(m);
            if (m.length) setMode(m[0]);
        }).catch(() => undefined);
    }, [etablissementId, anneeId]);

    const chargerSituation = useCallback(async (id: string) => {
        if (!id) { setEleves([]); return; }
        setChargement(true);
        setSaisies({});
        setResultat(null);
        try {
            const r = await api.get(`/api/finance/classe/${id}/situation-encaissement?annee_id=${anneeId}`);
            setEleves(r.data.eleves || []);
        } catch (e: any) {
            setResultat({ type: 'erreur', texte: e?.response?.data?.detail || "Chargement impossible." });
            setEleves([]);
        } finally {
            setChargement(false);
        }
    }, [anneeId]);

    useEffect(() => { chargerSituation(classeId); }, [classeId, chargerSituation]);

    const lignes = useMemo(() => Object.entries(saisies)
        .map(([facture_id, v]) => ({ facture_id: Number(facture_id), montant: parseFloat(v) }))
        .filter(l => Number.isFinite(l.montant) && l.montant > 0), [saisies]);

    const total = lignes.reduce((s, l) => s + l.montant, 0);

    const remplirLeReste = () => {
        // Pré-remplit ce qui reste dû sur chaque frais non soldé. Le caissier
        // corrige ensuite les familles qui paient autre chose — c'est plus
        // rapide que tout saisir, et chaque montant reste modifiable.
        const suivant: Record<number, string> = {};
        eleves.forEach(e => e.frais.forEach(f => {
            if (f.reste > 0) suivant[f.facture_id] = String(Math.round(f.reste));
        }));
        setSaisies(suivant);
    };

    const encaisser = async () => {
        if (!lignes.length || envoi) return;
        if (!confirm(`Encaisser ${lignes.length} versement(s) pour un total de ${fmt(total)} GNF ?`)) return;
        setEnvoi(true);
        setResultat(null);
        try {
            const r = await api.post('/api/finance/encaissements-groupes', {
                lignes, mode_paiement: mode, reference_externe: reference || null,
            });
            setResultat({ type: 'ok', texte: r.data.message });
            setSaisies({});
            await chargerSituation(classeId);
        } catch (e: any) {
            // Le serveur dit précisément ce qu'il refuse. Et comme le lot est
            // tout ou rien, un échec signifie qu'AUCUN versement n'est passé :
            // le caissier peut corriger et relancer sans risque de doublon.
            setResultat({
                type: 'erreur',
                texte: e?.response?.data?.detail || "L'encaissement a échoué. Aucun versement n'a été enregistré.",
            });
        } finally {
            setEnvoi(false);
        }
    };

    const totalResteClasse = eleves.reduce((s, e) => s + e.reste, 0);

    return (
        <div style={{ padding: 'clamp(16px,3vw,28px)', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Link href="/comptabilite/encaissement" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', textDecoration: 'none', fontWeight: 600 }}>
                <ArrowLeft size={15} /> Encaissement
            </Link>

            <div>
                <h1 style={{ margin: 0, fontSize: 'clamp(19px,3vw,24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Users size={22} style={{ color: '#2563eb' }} /> Encaisser une classe
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                    Ce que chaque élève a déjà réglé s&apos;affiche avant la saisie, pour ne jamais encaisser deux fois le même frais.
                </p>
            </div>

            {/* Réglages du lot */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Classe</label>
                    <select value={classeId} onChange={e => setClasseId(e.target.value)} style={champ}>
                        <option value="">Choisir une classe…</option>
                        {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 170 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Mode de paiement</label>
                    <select value={mode} onChange={e => setMode(e.target.value)} style={champ}>
                        {modes.map(m => <option key={m} value={m}>{modePaiementLabel(m)}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Référence (facultatif)</label>
                    <input value={reference} onChange={e => setReference(e.target.value)}
                        placeholder="N° de bordereau, transaction…" style={champ} />
                </div>
                {eleves.length > 0 && (
                    <button onClick={remplirLeReste}
                        style={{ ...champ, cursor: 'pointer', fontWeight: 700, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}>
                        Pré-remplir le reste dû
                    </button>
                )}
            </div>

            {resultat && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 16px', borderRadius: 12, fontSize: 13.5,
                    background: resultat.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${resultat.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                    color: resultat.type === 'ok' ? '#166534' : '#b42318',
                }}>
                    {resultat.type === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                    <span>{resultat.texte}</span>
                </div>
            )}

            {chargement && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
                    <Loader2 size={32} className="animate-spin" color="#2563eb" />
                </div>
            )}

            {!chargement && classeId && eleves.length === 0 && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                    Aucun élève actif dans cette classe pour cette année.
                </div>
            )}

            {!chargement && eleves.length > 0 && (
                <>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                        <strong style={{ color: '#0f172a' }}>{eleves.length}</strong> élève(s) •
                        reste dû pour la classe : <strong style={{ color: '#b45309' }}>{fmt(totalResteClasse)} GNF</strong>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {eleves.map(el => (
                            <div key={el.eleve_id} style={{
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
                                padding: 14, opacity: el.solde === 'SOLDE' ? 0.72 : 1,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{el.nom_complet}</div>
                                        <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{el.matricule || '—'}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12 }}>
                                        <span style={{ color: '#64748b' }}>Déjà payé <strong style={{ color: '#059669' }}>{fmt(el.total_paye)}</strong></span>
                                        {el.solde === 'SOLDE'
                                            ? <span style={{ padding: '3px 10px', borderRadius: 99, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 11 }}>À jour</span>
                                            : <span style={{ color: '#64748b' }}>Reste <strong style={{ color: '#b45309' }}>{fmt(el.reste)}</strong></span>}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {el.frais.map(f => (
                                        <div key={f.facture_id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                                            <span style={{ flex: '1 1 150px', color: '#334155', fontWeight: 600 }}>{f.tarif}</span>
                                            <span style={{ flex: '0 0 150px', color: '#64748b', fontSize: 12 }}>
                                                {fmt(f.deja_paye)} / {fmt(f.montant_du)}
                                            </span>
                                            {f.reste <= 0 ? (
                                                <span style={{ flex: '0 0 150px', fontSize: 12, color: '#166534', fontWeight: 600 }}>
                                                    Soldé — rien à encaisser
                                                </span>
                                            ) : (
                                                <input type="number" min="0" inputMode="numeric"
                                                    value={saisies[f.facture_id] ?? ''}
                                                    onChange={e => setSaisies(s => ({ ...s, [f.facture_id]: e.target.value }))}
                                                    placeholder={`reste ${fmt(f.reste)}`}
                                                    style={{ ...champ, flex: '0 0 150px', padding: '7px 10px', textAlign: 'right' }} />
                                            )}
                                        </div>
                                    ))}
                                    {el.frais.length === 0 && (
                                        <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucun frais facturé à cet élève.</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Barre de validation, collée en bas : la liste peut être longue. */}
                    <div style={{
                        position: 'sticky', bottom: 0, background: '#fff', border: '1px solid #e2e8f0',
                        borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        boxShadow: '0 -4px 18px rgba(15,23,42,0.07)',
                    }}>
                        <div style={{ fontSize: 13.5, color: '#334155' }}>
                            <strong>{lignes.length}</strong> versement(s) — total{' '}
                            <strong style={{ color: '#059669', fontSize: 17 }}>{fmt(total)} GNF</strong>
                        </div>
                        <button onClick={encaisser} disabled={!lignes.length || envoi}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px',
                                borderRadius: 12, border: 'none', fontSize: 14.5, fontWeight: 700, color: '#fff',
                                background: !lignes.length || envoi ? '#94a3b8' : 'linear-gradient(100deg,#2563eb,#10b981)',
                                cursor: !lignes.length || envoi ? 'not-allowed' : 'pointer',
                            }}>
                            {envoi ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
                            Encaisser
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
