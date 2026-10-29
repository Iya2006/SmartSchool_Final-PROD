'use client';

/**
 * Synchronisation — les postes installés de l'école et ce qui est « à vérifier ».
 *
 * Les postes hors-ligne se synchronisent seuls avec le cloud. Quand deux
 * personnes ont modifié le même champ d'une donnée sensible (argent, notes,
 * inscriptions, comptes), ou qu'une valeur unique est en double (même
 * identifiant de connexion créé sur deux postes), rien n'est tranché en
 * silence : la version du serveur est gardée, la version du poste est
 * conservée ici, et la direction choisit. Le choix repart vers tous les
 * postes à leur prochaine synchronisation.
 *
 * Même écran sur le web et sur un poste : sur un poste, les décisions passent
 * par le cloud (elles demandent internet). Contrôle réel côté serveur.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, CloudOff, Laptop, Loader2, RefreshCw, Server,
} from 'lucide-react';
import api from '@/lib/api';
import { EST_POSTE } from '@/lib/poste';
import { champsEnDesaccord, libelleChamp, valeurLisible } from '@/lib/synchronisation';
import IndicateurPoste from '@/components/IndicateurPoste';

interface Conflit {
    conflit_id: number;
    table: string;
    cle: number;
    operation: string;
    raison: string;
    poste: string | null;
    cree_le: string | null;
    version_poste: Record<string, unknown> | null;
    version_serveur: Record<string, unknown> | null;
    resolution: string | null;
    resolu_par: string | null;
    resolu_le: string | null;
}

interface Poste {
    rang: number;
    nom: string | null;
    enregistre_par: string | null;
    enregistre_le: string | null;
    dernier_contact: string | null;
    retire: boolean;
}

const NOMS_DE_TABLES: Record<string, string> = {
    ss_eleves: 'Élève', ss_parents: 'Parent', ss_enseignants: 'Enseignant', ss_utilisateurs: 'Compte',
    ss_inscriptions: 'Inscription', ss_factures: 'Facture', ss_echeances_factures: 'Échéance',
    ss_paiements: 'Paiement', ss_depenses: 'Dépense', ss_notes: 'Note', ss_presences: 'Présence',
    ss_ecritures_comptables: 'Écriture comptable', ss_lignes_ecritures: 'Ligne comptable',
    ss_bulletins_paie: 'Bulletin de paie', ss_classes: 'Classe', ss_evenements: 'Événement',
};

const RESOLUTIONS: Record<string, string> = {
    SERVEUR: 'Version du serveur gardée',
    POSTE: 'Version du poste gardée',
    AUTO_SERVEUR: 'Automatique : version du serveur, plus récente',
    AUTO_POSTE: 'Automatique : version du poste, plus récente',
};

const valeur = valeurLisible;

function quand(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function messageErreur(err: unknown, defaut: string): string {
    const reponse = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
        : undefined;
    return reponse?.data?.detail || defaut;
}

export default function SynchronisationPage() {
    const [conflits, setConflits] = useState<Conflit[]>([]);
    const [postes, setPostes] = useState<Poste[]>([]);
    const [historique, setHistorique] = useState(false);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [enCours, setEnCours] = useState<number | null>(null);

    const charger = useCallback(async () => {
        setChargement(true);
        setErreur(null);
        try {
            const res = await api.get(`/api/sync/conflits${historique ? '?tous=true' : ''}`);
            setConflits(res.data?.conflits ?? []);
        } catch (err) {
            setConflits([]);
            setErreur(messageErreur(err, 'Impossible de charger les points à vérifier.'));
        }
        if (!EST_POSTE) {
            try {
                setPostes((await api.get('/api/sync/postes')).data?.postes ?? []);
            } catch { setPostes([]); }
        }
        setChargement(false);
    }, [historique]);

    useEffect(() => { void charger(); }, [charger]);

    const trancher = async (c: Conflit, choix: 'SERVEUR' | 'POSTE') => {
        setEnCours(c.conflit_id);
        setErreur(null);
        try {
            await api.post(`/api/sync/conflits/${c.conflit_id}/resoudre`, { choix });
            setMessage(choix === 'POSTE' ? 'La version du poste est enregistrée.' : 'La version du serveur est gardée.');
            await charger();
        } catch (err) {
            setErreur(messageErreur(err, 'Le choix n’a pas pu être enregistré.'));
        } finally {
            setEnCours(null);
        }
    };

    return (
        <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 17, maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <RefreshCw size={22} style={{ color: '#2563eb' }} /> Synchronisation
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', maxWidth: 680, lineHeight: 1.5 }}>
                        Les ordinateurs de l’école travaillent avec ou sans internet et se synchronisent seuls.
                        Ce qui n’a pas pu être fusionné automatiquement attend ici votre choix.
                    </p>
                </div>
                {EST_POSTE && <IndicateurPoste />}
            </div>

            {message && <Bandeau ton="ok"><CheckCircle2 size={16} /> {message}</Bandeau>}
            {erreur && (
                <Bandeau ton="ko">
                    {erreur.includes('internet') ? <CloudOff size={16} /> : <AlertTriangle size={16} />} {erreur}
                </Bandeau>
            )}

            {!EST_POSTE && (
                <section style={carte}>
                    <h2 style={titreSection}><Laptop size={16} /> Postes installés</h2>
                    {postes.length === 0 ? (
                        <p style={texteDiscret}>Aucun ordinateur de l’école n’a encore installé SmartSchool hors-ligne.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                        <th style={cellule}>Poste</th><th style={cellule}>Installé le</th>
                                        <th style={cellule}>Dernière synchronisation</th><th style={cellule}>État</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {postes.map(p => {
                                        const ancien = !p.dernier_contact
                                            || Date.now() - new Date(p.dernier_contact).getTime() > 7 * 24 * 3600 * 1000;
                                        return (
                                            <tr key={p.rang} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                <td style={cellule}><strong>P{p.rang}</strong>{p.nom ? ` — ${p.nom}` : ''}</td>
                                                <td style={cellule}>{quand(p.enregistre_le)}</td>
                                                <td style={cellule}>{quand(p.dernier_contact)}</td>
                                                <td style={cellule}>
                                                    {p.retire ? <Pastille ton="gris">Retiré</Pastille>
                                                        : ancien ? <Pastille ton="rouge">Pas sauvegardé depuis 7 jours</Pastille>
                                                            : <Pastille ton="vert">À jour</Pastille>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <section style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ ...titreSection, margin: 0 }}><AlertTriangle size={16} /> À vérifier</h2>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                        <input type="checkbox" checked={historique} onChange={e => setHistorique(e.target.checked)} />
                        Afficher aussi ce qui est réglé
                    </label>
                </div>

                {chargement ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                        <Loader2 size={26} style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : conflits.length === 0 ? (
                    !erreur && (
                        <div style={{ ...carte, textAlign: 'center', padding: '44px 24px' }}>
                            <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
                            <p style={{ fontWeight: 800, color: '#334155', margin: '10px 0 4px' }}>Rien à vérifier</p>
                            <p style={texteDiscret}>Toutes les modifications des postes ont été fusionnées.</p>
                        </div>
                    )
                ) : conflits.map(c => {
                    const champs = champsEnDesaccord(c);
                    return (
                        <article key={c.conflit_id} style={{ ...carte, borderColor: c.resolution ? '#e2e8f0' : '#fde68a' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: 14, color: '#0f172a' }}>
                                    {NOMS_DE_TABLES[c.table] ?? libelleChamp(c.table.replace(/^ss_/, ''))} n° {c.cle}
                                </strong>
                                {c.poste && <Pastille ton="gris">Poste {c.poste}</Pastille>}
                                <Pastille ton="gris">{quand(c.cree_le)}</Pastille>
                                {c.resolution && <Pastille ton="vert">{RESOLUTIONS[c.resolution] ?? c.resolution}</Pastille>}
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{c.raison}</p>

                            {champs.length > 0 && (
                                <div style={{ overflowX: 'auto', marginTop: 10 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', color: '#64748b' }}>
                                                <th style={cellule}>Champ</th>
                                                <th style={cellule}><Server size={12} /> Serveur</th>
                                                <th style={cellule}><Laptop size={12} /> Poste</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {champs.map(n => (
                                                <tr key={n} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ ...cellule, fontWeight: 700, color: '#334155' }}>{libelleChamp(n)}</td>
                                                    <td style={cellule}>{c.version_serveur ? valeur(c.version_serveur[n]) : '(absente)'}</td>
                                                    <td style={cellule}>{c.version_poste ? valeur(c.version_poste[n]) : '(supprimée)'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!c.resolution && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                                    <button disabled={enCours === c.conflit_id} onClick={() => void trancher(c, 'SERVEUR')} style={bouton}>
                                        <Server size={14} /> Garder la version du serveur
                                    </button>
                                    <button disabled={enCours === c.conflit_id} onClick={() => void trancher(c, 'POSTE')}
                                        style={{ ...bouton, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }}>
                                        {enCours === c.conflit_id
                                            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                            : <Laptop size={14} />} Garder la version du poste
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })}
            </section>
            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </div>
    );
}

function Bandeau({ ton, children }: { ton: 'ok' | 'ko'; children: React.ReactNode }) {
    const ok = ton === 'ok';
    return (
        <div role={ok ? 'status' : 'alert'} style={{
            display: 'flex', gap: 10, alignItems: 'center', padding: '12px 15px', borderRadius: 12, fontSize: 13,
            background: ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
            color: ok ? '#15803d' : '#b91c1c',
        }}>{children}</div>
    );
}

function Pastille({ ton, children }: { ton: 'vert' | 'rouge' | 'gris'; children: React.ReactNode }) {
    const c = { vert: ['#f0fdf4', '#15803d'], rouge: ['#fef2f2', '#b91c1c'], gris: ['#f1f5f9', '#64748b'] }[ton];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99,
            background: c[0], color: c[1], fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
        }}>{children}</span>
    );
}

const carte: React.CSSProperties = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '15px 17px',
};
const titreSection: React.CSSProperties = {
    margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8,
};
const texteDiscret: React.CSSProperties = { margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.55 };
const cellule: React.CSSProperties = { padding: '7px 9px', verticalAlign: 'top', wordBreak: 'break-word' };
const bouton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9,
    border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
};
