'use client';

/**
 * Comptabilité › Autres entrées — vente de tarifs LIBRES à un élève.
 *
 * Un livre, un équipement, une sortie… : ces frais ne sont ni obligatoires ni à
 * prix fixe. Ici, on prend la liste de tous les élèves, on clique sur l'un
 * d'eux, on choisit le tarif libre, on saisit le prix du moment et on valide :
 * l'argent entre directement en caisse (même chemin qu'un encaissement normal),
 * et le total remonte dans « Autres entrées » du tableau de bord et de l'espace
 * fondateur. Ces ventes restent séparées de la scolarité.
 *
 * Le type de tarif libre se crée dans Frais & Tarifs (case « Tarif libre »).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import {
    PlusCircle, Search, Loader2, X, CheckCircle2, AlertTriangle, Banknote, ShoppingBag,
} from 'lucide-react';
import api from '@/lib/api';
import AnneeFilter from '@/components/AnneeFilter';
import { fetchModesPaiement, modePaiementLabel, DEFAULT_MODES_PAIEMENT } from '@/lib/modesPaiement';

type EleveRow = {
    eleve_id: number; eleve_nom: string; eleve_prenom: string;
    eleve_matricule: string; classe_id: number; classe_nom: string;
};
type TypeFrais = { type_frais_id: number; libelle: string; categorie: string; prix_libre?: string };

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('fr-GN') + ' GNF';

export default function AutresEntreesPage() {
    const { etablissementId, anneeId } = useApp();
    const [filterAnnee, setFilterAnnee] = useState<number>(anneeId);
    useEffect(() => { setFilterAnnee(anneeId); }, [anneeId]);

    const [eleves, setEleves] = useState<EleveRow[]>([]);
    const [typesLibre, setTypesLibre] = useState<TypeFrais[]>([]);
    const [totalAutres, setTotalAutres] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modes, setModes] = useState<string[]>(DEFAULT_MODES_PAIEMENT);

    // Modale de vente
    const [selected, setSelected] = useState<EleveRow | null>(null);
    const [venteType, setVenteType] = useState('');
    const [venteDesignation, setVenteDesignation] = useState('');
    const [venteMontant, setVenteMontant] = useState('');
    const [venteMode, setVenteMode] = useState('ESPECES');
    const [venteRef, setVenteRef] = useState('');
    const [enCours, setEnCours] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4500);
    };

    const charger = useCallback(async () => {
        setLoading(true);
        try {
            const [elvRes, tfRes, dashRes] = await Promise.all([
                api.get(`/api/finance/solvabilite?etablissement_id=${etablissementId}&annee_id=${filterAnnee}`),
                api.get('/api/finance/types-frais'),
                api.get(`/api/finance/dashboard?annee_id=${filterAnnee}`).catch(() => ({ data: null })),
            ]);
            setEleves((elvRes.data || []) as EleveRow[]);
            setTypesLibre(((tfRes.data || []) as TypeFrais[]).filter(t => (t.prix_libre || 'N') === 'O'));
            setTotalAutres(Number(dashRes.data?.kpis?.autres_entrees || 0));
        } catch {
            showMsg("Impossible de charger la liste des élèves.", 'error');
        } finally {
            setLoading(false);
        }
    }, [etablissementId, filterAnnee]);

    useEffect(() => { charger(); }, [charger]);
    useEffect(() => { fetchModesPaiement().then(m => { if (m?.length) { setModes(m); setVenteMode(m[0]); } }); }, []);

    // Insensible aux accents : « traore » trouve « Traoré ».
    const sansAccent = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtered = useMemo(() => {
        const q = sansAccent(search.trim());
        if (!q) return eleves;
        return eleves.filter(e =>
            sansAccent(`${e.eleve_prenom} ${e.eleve_nom}`).includes(q) ||
            sansAccent(e.eleve_matricule).includes(q) ||
            sansAccent(e.classe_nom).includes(q)
        );
    }, [eleves, search]);

    const ouvrirVente = (e: EleveRow) => {
        setSelected(e);
        setVenteType(typesLibre.length === 1 ? String(typesLibre[0].type_frais_id) : '');
        setVenteDesignation(''); setVenteMontant(''); setVenteRef('');
        setVenteMode(modes[0] || 'ESPECES');
    };

    const valider = async () => {
        if (!selected) return;
        if (!venteType) { showMsg('Choisissez le tarif à vendre.', 'error'); return; }
        const montant = parseFloat(venteMontant);
        if (!montant || montant <= 0) { showMsg('Saisissez un montant supérieur à 0.', 'error'); return; }
        setEnCours(true);
        try {
            const res = await api.post('/api/finance/vente-libre', {
                eleve_id: selected.eleve_id,
                type_frais_id: Number(venteType),
                montant,
                designation: venteDesignation.trim() || undefined,
                mode_paiement: venteMode,
                reference_externe: venteRef || undefined,
                annee_id: filterAnnee,
            });
            showMsg(res.data?.message || `Vente enregistrée. Reçu N° ${res.data?.numero_recu}`, 'success');
            setSelected(null);
            charger();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: unknown } } };
            const d = err?.response?.data?.detail;
            showMsg(typeof d === 'string' ? d : "La vente a échoué.", 'error');
        } finally {
            setEnCours(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 'clamp(14px, 2.5vw, 24px)' }}>
            {message && (
                <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: message.type === 'success' ? '#10b981' : '#ef4444' }}>
                    {message.text}
                </div>
            )}

            {/* En-tête */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PlusCircle size={22} style={{ color: '#10b981' }} /> Autres entrées
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', maxWidth: 620, lineHeight: 1.5 }}>
                        Vente d&apos;un tarif libre (livre, équipement…) à un élève, au prix du moment. L&apos;argent entre
                        directement en caisse, à part de la scolarité.
                    </p>
                </div>
                <AnneeFilter value={filterAnnee} onChange={setFilterAnnee} />
            </div>

            {/* Total + garde-fou si aucun tarif libre */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontWeight: 600 }}>Total autres entrées ({filterAnnee === anneeId ? 'année en cours' : 'année sélectionnée'})</p>
                        <p style={{ fontSize: 24, fontWeight: 800, color: '#10b981', margin: '4px 0 0' }}>{fmt(totalAutres)}</p>
                    </div>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#10b98115', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Banknote size={22} />
                    </div>
                </div>
            </div>

            {typesLibre.length === 0 && !loading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '13px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                        Aucun <strong>tarif libre</strong> n&apos;est encore créé. Allez dans <strong>Frais &amp; Tarifs</strong>,
                        créez un type de frais et cochez <strong>« Tarif libre (prix non fixe) »</strong>. Il apparaîtra ici.
                    </span>
                </div>
            )}

            {/* Recherche */}
            <div style={{ position: 'relative', maxWidth: 420 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher un élève : nom, prénom, matricule, classe…"
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Liste des élèves */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 56 }}>
                        <Loader2 size={26} style={{ color: '#10b981', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                {['Élève', 'Matricule', 'Classe', ''].map(h => (
                                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun élève trouvé</td></tr>
                            ) : filtered.slice(0, 300).map(e => (
                                <tr key={e.eleve_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>{e.eleve_prenom} {e.eleve_nom}</td>
                                    <td style={{ padding: '11px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{e.eleve_matricule}</td>
                                    <td style={{ padding: '11px 14px', color: '#475569' }}>{e.classe_nom}</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                                        <button onClick={() => ouvrirVente(e)} disabled={typesLibre.length === 0}
                                            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #a7f3d0', background: typesLibre.length === 0 ? '#f1f5f9' : '#ecfdf5', color: typesLibre.length === 0 ? '#94a3b8' : '#059669', fontSize: 12.5, fontWeight: 700, cursor: typesLibre.length === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                            <ShoppingBag size={13} /> Vendre / encaisser
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modale de vente */}
            {selected && (
                <div onClick={() => !enCours && setSelected(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 70 }}>
                    <div onClick={ev => ev.stopPropagation()}
                        style={{ background: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Encaisser une vente</h3>
                                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
                                    {selected.eleve_prenom} {selected.eleve_nom} — {selected.classe_nom}
                                </p>
                            </div>
                            <button onClick={() => setSelected(null)} disabled={enCours} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
                        </div>

                        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                            Tarif
                            <select value={venteType} onChange={e => setVenteType(e.target.value)}
                                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, background: '#fff' }}>
                                <option value="">— Choisir —</option>
                                {typesLibre.map(t => <option key={t.type_frais_id} value={t.type_frais_id}>{t.libelle}</option>)}
                            </select>
                        </label>

                        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                            Ce qui est acheté
                            <input value={venteDesignation} onChange={e => setVenteDesignation(e.target.value)}
                                placeholder="Ex. 3 cahiers + 1 règle, uniforme, sortie…"
                                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                        </label>

                        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                            Montant (GNF)
                            <input type="number" min={0} value={venteMontant} onChange={e => setVenteMontant(e.target.value)}
                                placeholder="Ex. 75000" autoFocus
                                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                        </label>

                        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                            Mode de paiement
                            <select value={venteMode} onChange={e => setVenteMode(e.target.value)}
                                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, background: '#fff' }}>
                                {modes.map(m => <option key={m} value={m}>{modePaiementLabel(m)}</option>)}
                            </select>
                        </label>

                        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                            Référence (facultatif)
                            <input value={venteRef} onChange={e => setVenteRef(e.target.value)}
                                placeholder="N° de transaction, chèque…"
                                style={{ width: '100%', marginTop: 5, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                        </label>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button onClick={() => setSelected(null)} disabled={enCours}
                                style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                            <button onClick={valider} disabled={enCours}
                                style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {enCours ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={15} />} Valider l&apos;encaissement
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </div>
    );
}
