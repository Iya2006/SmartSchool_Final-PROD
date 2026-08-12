'use client';

/**
 * Parents d'un élève — ajout, rattachement, détachement.
 *
 * Le lien parent-enfant ne se créait qu'à l'inscription de l'élève, et pour UN
 * seul contact. La mère ne pouvait donc pas être ajoutée après le père, et un
 * élève inscrit sans parent le restait définitivement.
 *
 * Placé sur la FICHE DE L'ÉLÈVE : c'est là qu'on se pose la question « qui sont
 * ses parents ? ». L'écran Familles part du parent pour aller vers ses enfants,
 * c'est le geste inverse.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, Check, Loader2, Phone, Plus, Search, Star, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import api from '@/lib/api';

interface ParentLie {
    lien_id: number;
    parent_id: number;
    nom: string;
    prenom: string;
    telephone_1: string | null;
    email: string | null;
    lien_parente: string;
    est_contact_principal: boolean;
    est_responsable_financier: boolean;
}

const LIENS = ['PERE', 'MERE', 'TUTEUR', 'AUTRE'];
const ETIQUETTE: Record<string, string> = {
    PERE: 'Père', MERE: 'Mère', TUTEUR: 'Tuteur', AUTRE: 'Autre',
};

export default function ParentsEleve({ eleveId }: { eleveId: number }) {
    const [parents, setParents] = useState<ParentLie[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [formulaire, setFormulaire] = useState(false);

    const charger = useCallback(async () => {
        setChargement(true);
        setErreur(null);
        try {
            const res = await api.get(`/api/eleves/${eleveId}/parents`);
            setParents(Array.isArray(res.data) ? res.data : []);
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || 'Impossible de charger les parents.');
            setParents([]);
        } finally {
            setChargement(false);
        }
    }, [eleveId]);

    useEffect(() => { charger(); }, [charger]);
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(() => setMessage(null), 4000);
        return () => clearTimeout(t);
    }, [message]);

    const detacher = async (p: ParentLie) => {
        if (!confirm(
            `Détacher ${p.prenom} ${p.nom} de cet élève ?\n\n`
            + `Sa fiche et ses éventuels autres enfants sont conservés — seul le lien est retiré.`
        )) return;
        try {
            const res = await api.delete(`/api/eleves/${eleveId}/parents/${p.lien_id}`);
            setMessage(res.data?.message || 'Parent détaché.');
            charger();
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || "Le détachement a échoué.");
        }
    };

    const designerPrincipal = async (p: ParentLie) => {
        try {
            await api.put(`/api/eleves/${eleveId}/parents/${p.lien_id}`, {
                est_contact_principal: true,
            });
            setMessage(`${p.prenom} ${p.nom} est désormais le contact principal.`);
            charger();
        } catch {
            setErreur("La modification a échoué.");
        }
    };

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={17} style={{ color: '#2563eb' }} /> Parents et tuteurs
                    {parents.length > 0 && (
                        <span style={{ padding: '1px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontSize: '12px', fontWeight: 800 }}>
                            {parents.length}
                        </span>
                    )}
                </h3>
                <button onClick={() => setFormulaire(true)} style={boutonPrincipal}>
                    <Plus size={15} /> Ajouter un parent
                </button>
            </div>

            {message && (
                <div style={{ margin: '12px 20px 0', padding: '11px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                    <Check size={15} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '13px', color: '#15803d', lineHeight: 1.5 }}>{message}</span>
                </div>
            )}
            {erreur && (
                <div style={{ margin: '12px 20px 0', padding: '11px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>{erreur}</span>
                </div>
            )}

            <div style={{ padding: '14px 20px 20px' }}>
                {chargement ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '28px' }}>
                        <Loader2 size={22} style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : parents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px' }}>
                        <Users size={32} style={{ color: '#cbd5e1' }} />
                        <p style={{ fontWeight: 700, color: '#475569', margin: '10px 0 4px', fontSize: '14px' }}>
                            Aucun parent rattaché
                        </p>
                        <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: 0 }}>
                            Sans parent rattaché, cet élève n&apos;apparaît dans aucun portail famille.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {parents.map(p => (
                            <div key={p.lien_id} style={{
                                display: 'flex', gap: '12px', alignItems: 'flex-start',
                                padding: '13px 14px', borderRadius: '12px',
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                flexWrap: 'wrap',
                            }}>
                                <div style={{ width: 36, height: 36, borderRadius: '11px', background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: '14px', flexShrink: 0 }}>
                                    {p.prenom.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                                            {p.prenom} {p.nom}
                                        </span>
                                        <span style={{ padding: '1px 7px', borderRadius: 6, background: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: 800 }}>
                                            {ETIQUETTE[p.lien_parente] || p.lien_parente}
                                        </span>
                                        {p.est_contact_principal && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: 800 }}>
                                                <Star size={10} /> Contact principal
                                            </span>
                                        )}
                                    </div>
                                    {p.telephone_1 && (
                                        <span style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12.5px', color: '#64748b', marginTop: 3 }}>
                                            <Phone size={12} /> {p.telephone_1}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                    {!p.est_contact_principal && (
                                        <button onClick={() => designerPrincipal(p)} title="Désigner comme contact principal" style={boutonIcone}>
                                            <Star size={14} />
                                        </button>
                                    )}
                                    <button onClick={() => detacher(p)} title="Détacher de cet élève"
                                        style={{ ...boutonIcone, color: '#dc2626', borderColor: '#fecaca' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {formulaire && (
                <FormulaireAjout
                    eleveId={eleveId}
                    onFerme={() => setFormulaire(false)}
                    onAjoute={(texte) => { setFormulaire(false); setMessage(texte); charger(); }}
                />
            )}
            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </div>
    );
}

/* ─────────────────────────── formulaire d'ajout ─────────────────────────── */

function FormulaireAjout({ eleveId, onFerme, onAjoute }: {
    eleveId: number; onFerme: () => void; onAjoute: (message: string) => void;
}) {
    // Deux chemins, parce que ce sont deux situations réelles distinctes :
    // rattacher un parent que l'école connaît déjà (frère ou sœur inscrit),
    // ou saisir quelqu'un de nouveau.
    const [mode, setMode] = useState<'existant' | 'nouveau'>('existant');
    const [recherche, setRecherche] = useState('');
    const [resultats, setResultats] = useState<{ parent_id: number; nom: string; prenom: string; telephone_1: string | null }[]>([]);
    const [choisi, setChoisi] = useState<number | null>(null);
    const [chercheEnCours, setChercheEnCours] = useState(false);
    const [lien, setLien] = useState('PERE');
    const [principal, setPrincipal] = useState(false);
    const [nouveau, setNouveau] = useState({ nom: '', prenom: '', telephone_1: '', email: '', profession: '' });
    const [envoi, setEnvoi] = useState(false);
    const [erreur, setErreur] = useState('');

    const chercher = async () => {
        if (recherche.trim().length < 2) return;
        setChercheEnCours(true);
        setErreur('');
        try {
            const res = await api.get(
                `/api/communication/parents/annuaire?limit=20&search=${encodeURIComponent(recherche.trim())}`
            );
            const liste = res.data?.parents || res.data?.items || res.data || [];
            setResultats(Array.isArray(liste) ? liste : []);
        } catch {
            setResultats([]);
            setErreur("La recherche a échoué.");
        } finally {
            setChercheEnCours(false);
        }
    };

    const envoyer = async () => {
        setEnvoi(true);
        setErreur('');
        try {
            const corps: Record<string, unknown> = {
                lien_parente: lien,
                est_contact_principal: principal,
            };
            if (mode === 'existant') {
                if (!choisi) { setErreur('Choisissez un parent dans la liste.'); setEnvoi(false); return; }
                corps.parent_id = choisi;
            } else {
                Object.assign(corps, nouveau);
            }
            const res = await api.post(`/api/eleves/${eleveId}/parents`, corps);
            onAjoute(res.data?.message || 'Parent rattaché.');
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || "L'ajout a échoué.");
            setEnvoi(false);
        }
    };

    const pret = mode === 'existant'
        ? choisi !== null
        : nouveau.nom.trim() && nouveau.prenom.trim() && nouveau.telephone_1.trim();

    return (
        <div onClick={onFerme} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '16px', zIndex: 70 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '18px', padding: '22px', width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserPlus size={18} style={{ color: '#2563eb' }} /> Ajouter un parent
                    </h3>
                    <button onClick={onFerme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    {([['existant', 'Parent déjà connu'], ['nouveau', 'Nouveau parent']] as const).map(([cle, libelle]) => (
                        <button key={cle} onClick={() => { setMode(cle); setErreur(''); }} style={{
                            flex: 1, padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: mode === cle ? 800 : 600,
                            border: `1px solid ${mode === cle ? '#2563eb' : '#e2e8f0'}`,
                            background: mode === cle ? '#eff6ff' : '#fff',
                            color: mode === cle ? '#1d4ed8' : '#64748b',
                        }}>{libelle}</button>
                    ))}
                </div>

                {erreur && (
                    <div style={{ padding: '11px 13px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>
                        {erreur}
                    </div>
                )}

                {mode === 'existant' ? (
                    <>
                        <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: 1.55 }}>
                            Pour un frère ou une sœur déjà inscrit : cherchez le parent, il sera
                            rattaché sans être recréé.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    value={recherche}
                                    onChange={e => setRecherche(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); chercher(); } }}
                                    placeholder="Nom ou téléphone…"
                                    style={{ ...champ, paddingLeft: '33px' }}
                                />
                            </div>
                            <button onClick={chercher} disabled={chercheEnCours} style={{ ...boutonPrincipal, flexShrink: 0 }}>
                                {chercheEnCours ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Chercher'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '190px', overflowY: 'auto' }}>
                            {resultats.map(r => (
                                <button key={r.parent_id} onClick={() => setChoisi(r.parent_id)} style={{
                                    textAlign: 'left', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                                    border: `1px solid ${choisi === r.parent_id ? '#2563eb' : '#e2e8f0'}`,
                                    background: choisi === r.parent_id ? '#eff6ff' : '#fff',
                                }}>
                                    <span style={{ display: 'block', fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
                                        {r.prenom} {r.nom}
                                    </span>
                                    <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>{r.telephone_1 || '—'}</span>
                                </button>
                            ))}
                            {!chercheEnCours && recherche.trim().length >= 2 && resultats.length === 0 && (
                                <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '4px 0' }}>
                                    Aucun parent trouvé. Utilisez « Nouveau parent ».
                                </p>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'grid', gap: '11px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                        <Saisie label="Prénom" requis valeur={nouveau.prenom} onChange={v => setNouveau(n => ({ ...n, prenom: v }))} />
                        <Saisie label="Nom" requis valeur={nouveau.nom} onChange={v => setNouveau(n => ({ ...n, nom: v }))} />
                        <Saisie label="Téléphone" requis valeur={nouveau.telephone_1} onChange={v => setNouveau(n => ({ ...n, telephone_1: v }))} />
                        <Saisie label="E-mail" valeur={nouveau.email} onChange={v => setNouveau(n => ({ ...n, email: v }))} />
                        <Saisie label="Profession" valeur={nouveau.profession} onChange={v => setNouveau(n => ({ ...n, profession: v }))} />
                    </div>
                )}

                <div style={{ display: 'grid', gap: '11px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Lien de parenté</span>
                        <select value={lien} onChange={e => setLien(e.target.value)} style={champ}>
                            {LIENS.map(l => <option key={l} value={l}>{ETIQUETTE[l]}</option>)}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', fontWeight: 600, paddingTop: '18px' }}>
                        <input type="checkbox" checked={principal} onChange={e => setPrincipal(e.target.checked)} />
                        Contact principal
                    </label>
                </div>

                <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
                    <button onClick={onFerme} disabled={envoi} style={{ ...boutonSecondaire, flex: 1, minWidth: '110px' }}>Annuler</button>
                    <button onClick={envoyer} disabled={!pret || envoi} style={{
                        ...boutonPrincipal, flex: 1, minWidth: '110px',
                        opacity: pret && !envoi ? 1 : 0.5, cursor: pret && !envoi ? 'pointer' : 'not-allowed',
                    }}>
                        {envoi ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Rattacher'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Saisie({ label, requis, valeur, onChange }: {
    label: string; requis?: boolean; valeur: string; onChange: (v: string) => void;
}) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                {label}{requis && <span style={{ color: '#dc2626' }}> *</span>}
            </span>
            <input value={valeur} onChange={e => onChange(e.target.value)} style={champ} />
        </label>
    );
}

const champ: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none', color: '#0f172a',
};

const boutonPrincipal: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '9px 15px', borderRadius: '10px', border: 'none',
    background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};

const boutonSecondaire: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '9px 15px', borderRadius: '10px', border: '1px solid #cbd5e1',
    background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};

const boutonIcone: React.CSSProperties = {
    display: 'grid', placeItems: 'center', width: 30, height: 30,
    borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff',
    color: '#64748b', cursor: 'pointer',
};
