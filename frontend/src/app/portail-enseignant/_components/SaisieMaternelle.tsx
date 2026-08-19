'use client';
/**
 * Portail enseignant › Maternelle — saisie de fin d'année.
 *
 * Pas de notes en maternelle : pour chaque enfant de sa classe, l'enseignant met
 * Admis ou Non admis + une appréciation libre. Un admis passe à la section (ou à
 * la 1ère année) suivante ; un non-admis redouble. L'attestation de fin de cycle
 * (Grande Section) est éditée côté direction (« faite par l'école »).
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Loader2, Save, CheckCircle2, GraduationCap, RefreshCw } from 'lucide-react';

interface MaternelleClasse {
    classe_id: number; classe: string; niveau?: string; effectif?: number;
}
interface EnfantLigne {
    inscription_id: number; eleve_id: number; nom: string; prenom: string;
    matricule: string | null; resultat: string | null; observation: string | null;
}

export default function SaisieMaternelle({ enseignantId, classes }: { enseignantId: number; classes: MaternelleClasse[] }) {
    const [classeId, setClasseId] = useState<number | null>(classes[0]?.classe_id ?? null);
    const [section, setSection] = useState('');
    const [enfants, setEnfants] = useState<EnfantLigne[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);

    const flash = (texte: string, ok = true) => {
        setMessage({ texte, ok });
        setTimeout(() => setMessage(null), 4000);
    };

    const charger = useCallback(async () => {
        if (!classeId) return;
        setLoading(true);
        try {
            const res = await api.get(`/api/portail-enseignant/${enseignantId}/classe/${classeId}/maternelle`);
            setSection(res.data?.section || '');
            setEnfants(res.data?.eleves || []);
        } catch {
            flash("Chargement impossible.", false);
            setEnfants([]);
        } finally {
            setLoading(false);
        }
    }, [enseignantId, classeId]);

    useEffect(() => { charger(); }, [charger]);

    const setResultat = (id: number, resultat: string) =>
        setEnfants(prev => prev.map(e => e.inscription_id === id ? { ...e, resultat } : e));
    const setObservation = (id: number, observation: string) =>
        setEnfants(prev => prev.map(e => e.inscription_id === id ? { ...e, observation } : e));

    const enregistrer = async () => {
        const resultats = enfants.filter(e => e.resultat)
            .map(e => ({ inscription_id: e.inscription_id, resultat: e.resultat, observation: e.observation }));
        if (!resultats.length) { flash("Aucun résultat saisi.", false); return; }
        setSaving(true);
        try {
            const res = await api.post(`/api/portail-enseignant/${enseignantId}/classe/${classeId}/maternelle`, { resultats });
            flash(res.data?.message || "Enregistré.");
            charger();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } } };
            flash(err?.response?.data?.detail || "Enregistrement impossible.", false);
        } finally {
            setSaving(false);
        }
    };

    const admis = enfants.filter(e => e.resultat === 'ADMIS').length;
    const nonAdmis = enfants.filter(e => e.resultat === 'NON_ADMIS').length;
    const nonSaisis = enfants.filter(e => !e.resultat).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GraduationCap size={20} style={{ color: '#7c3aed' }} /> Maternelle — fin d&apos;année
                </h2>
                {classes.length > 1 && (
                    <select value={classeId ?? ''} onChange={e => setClasseId(Number(e.target.value))}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13.5, background: '#fff' }}>
                        {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.classe}</option>)}
                    </select>
                )}
                <button onClick={charger} disabled={loading}
                    style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <RefreshCw size={14} /> Actualiser
                </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                {section ? <><strong>{section}</strong> — </> : null}
                Pas de notes : mettez <strong>Admis</strong> ou <strong>Non admis</strong> et une appréciation.
                Un admis passe à la section (ou l&apos;année) suivante à la clôture.
            </p>

            {message && (
                <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', background: message.ok ? '#10b981' : '#ef4444' }}>
                    {message.texte}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                    <Loader2 size={26} style={{ color: '#7c3aed', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : enfants.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    Aucun enfant inscrit dans cette classe.
                </div>
            ) : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: 18, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                        <span style={{ color: '#059669' }}>Admis : {admis}</span>
                        <span style={{ color: '#b91c1c' }}>Non admis : {nonAdmis}</span>
                        <span style={{ color: '#94a3b8' }}>Non saisis : {nonSaisis}</span>
                        <span style={{ color: '#64748b', marginLeft: 'auto' }}>Effectif : {enfants.length}</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={th}>ENFANT</th>
                                    <th style={{ ...th, textAlign: 'center' }}>RÉSULTAT</th>
                                    <th style={th}>APPRÉCIATION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enfants.map(e => (
                                    <tr key={e.inscription_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '9px 14px', fontWeight: 600, color: '#0f172a' }}>
                                            {e.prenom} {e.nom}
                                            <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}> · {e.matricule || '—'}</span>
                                        </td>
                                        <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                            <select value={e.resultat || ''} onChange={ev => setResultat(e.inscription_id, ev.target.value)}
                                                style={{
                                                    padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: '#fff',
                                                    border: `1.5px solid ${e.resultat === 'ADMIS' ? '#059669' : e.resultat === 'NON_ADMIS' ? '#b91c1c' : '#cbd5e1'}`,
                                                    color: e.resultat === 'ADMIS' ? '#059669' : e.resultat === 'NON_ADMIS' ? '#b91c1c' : '#64748b',
                                                }}>
                                                <option value="">— non saisi —</option>
                                                <option value="ADMIS">Admis</option>
                                                <option value="NON_ADMIS">Non admis</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '9px 14px' }}>
                                            <input value={e.observation || ''} onChange={ev => setObservation(e.inscription_id, ev.target.value)}
                                                placeholder="Appréciation de l'enfant…"
                                                style={{ width: '100%', minWidth: 200, padding: '6px 10px', borderRadius: 8, fontSize: 12.5, border: '1px solid #e2e8f0', background: '#fff' }} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={enregistrer} disabled={saving}
                            style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Enregistrer
                        </button>
                    </div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </div>
    );
}

const th: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569',
    fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3,
};
