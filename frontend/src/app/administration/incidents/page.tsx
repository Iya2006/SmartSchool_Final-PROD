'use client';

/**
 * Plateforme › Incidents — les bugs de l'application, vus par l'éditeur.
 *
 * Le Monitoring surveille la MACHINE (PostgreSQL, Redis, workers). Cet écran
 * surveille le LOGICIEL. Sans lui, une école tombant sur une erreur en
 * imprimant un bulletin le découvrait seule, et l'éditeur ne l'apprenait qu'en
 * étant appelé.
 *
 * Les erreurs sont REGROUPÉES par (route, type). Quarante-sept occurrences du
 * même bug forment une ligne : « 47 fois · 3 écoles · dernière il y a 12 min ».
 * Une liste brute de plusieurs centaines d'entrées ne se lit pas, donc ne se
 * traite pas.
 *
 * Réservé au SUPER_ADMIN — le contrôle réel est backend, sur chaque route.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
    AlertTriangle, Bug, Check, CheckCircle2, ChevronRight, Clock, Loader2,
    RefreshCw, ShieldAlert, X,
} from 'lucide-react';
import api from '@/lib/api';

interface Groupe {
    route: string;
    methode: string;
    type_erreur: string;
    message: string;
    occurrences: number;
    ecoles_touchees: number;
    premiere: string | null;
    derniere: string | null;
    dernier_id: number;
}

interface Detail {
    incident_id: number;
    route: string;
    methode: string;
    type_erreur: string;
    message: string;
    trace: string | null;
    etablissement: string | null;
    role: string | null;
    date_incident: string | null;
}

const PERIODES = [
    { jours: 1, libelle: "24 heures" },
    { jours: 7, libelle: "7 jours" },
    { jours: 30, libelle: "30 jours" },
];

function ilYA(iso: string | null): string {
    if (!iso) return '—';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const heures = Math.round(minutes / 60);
    if (heures < 24) return `il y a ${heures} h`;
    return `il y a ${Math.round(heures / 24)} j`;
}

export default function IncidentsPage() {
    const { user } = useAuth();
    const [jours, setJours] = useState(7);
    const [masquerResolus, setMasquerResolus] = useState(true);
    const [groupes, setGroupes] = useState<Groupe[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [enCours, setEnCours] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const estEditeur = user?.role === 'SUPER_ADMIN';

    const charger = useCallback(async (silencieux = false) => {
        if (!silencieux) setChargement(true);
        setErreur(null);
        try {
            const params = new URLSearchParams({ jours: String(jours) });
            if (masquerResolus) params.set('resolu', 'false');
            const res = await api.get(`/api/incidents?${params}`);
            setGroupes(Array.isArray(res.data) ? res.data : []);
        } catch (err: unknown) {
            const reponse = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
                : undefined;
            setGroupes([]);
            setErreur(reponse?.status === 403
                ? "Cet écran est réservé à l'équipe SmartSchool."
                : reponse?.data?.detail || "Impossible de charger les incidents.");
        } finally {
            setChargement(false);
        }
    }, [jours, masquerResolus]);

    useEffect(() => { if (estEditeur) charger(); else setChargement(false); }, [charger, estEditeur]);
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(() => setMessage(null), 4000);
        return () => clearTimeout(t);
    }, [message]);

    const ouvrirDetail = async (g: Groupe) => {
        try {
            const res = await api.get(`/api/incidents/${g.dernier_id}`);
            setDetail(res.data);
        } catch {
            setErreur("Impossible d'ouvrir le détail de cet incident.");
        }
    };

    const marquerRegle = async (g: Groupe) => {
        const cle = `${g.route}|${g.type_erreur}`;
        setEnCours(cle);
        // L'incident réglé quitte la liste TOUT DE SUITE : on le retire de
        // l'affichage sans attendre l'aller-retour serveur, puis on rafraîchit
        // en silence. Le fondateur ne veut pas voir la page se recharger en
        // entier ni un incident déjà traité s'attarder à l'écran.
        const avant = groupes;
        setGroupes(prev => prev.filter(x => `${x.route}|${x.type_erreur}` !== cle));
        setDetail(null);
        try {
            const params = new URLSearchParams({ route: g.route, type_erreur: g.type_erreur });
            const res = await api.put(`/api/incidents/marquer-resolu?${params}`);
            setMessage(res.data?.message || 'Marqué comme réglé.');
            await charger(true);
        } catch {
            setGroupes(avant); // l'appel a échoué : on remet la ligne
            setErreur("L'opération a échoué.");
        } finally {
            setEnCours(null);
        }
    };

    if (!estEditeur) {
        return (
            <Cadre>
                <Vide icone={<ShieldAlert size={38} style={{ color: '#cbd5e1' }} />}
                    titre="Espace réservé"
                    texte="Le suivi des incidents est réservé à l'équipe SmartSchool." />
            </Cadre>
        );
    }

    return (
        <Cadre>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Bug size={22} style={{ color: '#dc2626' }} /> Incidents
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Les erreurs rencontrées par les écoles, regroupées par bug. Corrigez avant qu&apos;on vous appelle.
                    </p>
                </div>
                <button onClick={() => charger()} disabled={chargement} style={boutonDiscret}>
                    <RefreshCw size={15} style={chargement ? { animation: 'spin 1s linear infinite' } : undefined} /> Actualiser
                </button>
            </div>

            {message && (
                <Bandeau ton="ok" icone={<CheckCircle2 size={16} />}>{message}</Bandeau>
            )}
            {erreur && (
                <Bandeau ton="ko" icone={<AlertTriangle size={16} />}>{erreur}</Bandeau>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                    {PERIODES.map(p => (
                        <button key={p.jours} onClick={() => setJours(p.jours)} style={{
                            flex: '0 0 auto', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: jours === p.jours ? 800 : 600,
                            border: `1px solid ${jours === p.jours ? '#2563eb' : '#e2e8f0'}`,
                            background: jours === p.jours ? '#eff6ff' : '#fff',
                            color: jours === p.jours ? '#1d4ed8' : '#64748b',
                        }}>{p.libelle}</button>
                    ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={masquerResolus} onChange={e => setMasquerResolus(e.target.checked)} />
                    Masquer ce qui est réglé
                </label>
            </div>

            {chargement ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '56px' }}>
                    <Loader2 size={26} style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : groupes.length === 0 ? (
                <Vide icone={<CheckCircle2 size={38} style={{ color: '#16a34a' }} />}
                    titre="Aucun incident"
                    texte={`Aucune erreur applicative sur les ${PERIODES.find(p => p.jours === jours)?.libelle}. C'est la bonne nouvelle.`} />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                    {groupes.map(g => {
                        const cle = `${g.route}|${g.type_erreur}`;
                        const grave = g.occurrences >= 10 || g.ecoles_touchees > 1;
                        return (
                            <div key={cle} style={{
                                background: '#fff', border: `1px solid ${grave ? '#fecaca' : '#e2e8f0'}`,
                                borderRadius: '14px', padding: '15px 17px',
                                display: 'flex', flexDirection: 'column', gap: '10px',
                            }}>
                                <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <AlertTriangle size={17} style={{ color: grave ? '#dc2626' : '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                                                {g.type_erreur}
                                            </span>
                                            <code style={{ fontSize: '11.5px', background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 6, wordBreak: 'break-all' }}>
                                                {g.methode} {g.route}
                                            </code>
                                        </div>
                                        <p style={{ margin: '5px 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                            {g.message}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Etiquette ton={grave ? 'rouge' : 'orange'}>{g.occurrences} fois</Etiquette>
                                    <Etiquette ton={g.ecoles_touchees > 1 ? 'rouge' : 'gris'}>
                                        {g.ecoles_touchees} école{g.ecoles_touchees > 1 ? 's' : ''}
                                    </Etiquette>
                                    <Etiquette ton="gris"><Clock size={11} /> {ilYA(g.derniere)}</Etiquette>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                                        <button onClick={() => ouvrirDetail(g)} style={boutonDiscret}>
                                            Détail <ChevronRight size={14} />
                                        </button>
                                        <button onClick={() => marquerRegle(g)} disabled={enCours === cle} style={{ ...boutonDiscret, color: '#15803d', borderColor: '#bbf7d0' }}>
                                            {enCours === cle
                                                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                : <Check size={14} />} Réglé
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {detail && <FenetreDetail detail={detail} onFerme={() => setDetail(null)} />}
            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </Cadre>
    );
}

/* ────────────────────────────── composants ────────────────────────────── */

function FenetreDetail({ detail, onFerme }: { detail: Detail; onFerme: () => void }) {
    return (
        <div onClick={onFerme} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '16px', zIndex: 70 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '18px', padding: '22px', width: '100%', maxWidth: '660px', maxHeight: '86vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>{detail.type_erreur}</h3>
                        <code style={{ display: 'inline-block', marginTop: 5, fontSize: '12px', background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6, wordBreak: 'break-all' }}>
                            {detail.methode} {detail.route}
                        </code>
                    </div>
                    <button onClick={onFerme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'grid', gap: '9px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Info libelle="École" valeur={detail.etablissement || 'Non connecté'} />
                    <Info libelle="Rôle" valeur={detail.role || '—'} />
                    <Info libelle="Survenu" valeur={ilYA(detail.date_incident)} />
                </div>

                <div>
                    <span style={etiquetteTitre}>Message</span>
                    <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#0f172a', lineHeight: 1.55, wordBreak: 'break-word' }}>
                        {detail.message}
                    </p>
                </div>

                {detail.trace && (
                    <div>
                        <span style={etiquetteTitre}>Trace technique</span>
                        <pre style={{
                            margin: '5px 0 0', padding: '13px', background: '#0f172a', color: '#e2e8f0',
                            borderRadius: '11px', fontSize: '11.5px', lineHeight: 1.55,
                            overflowX: 'auto', whiteSpace: 'pre', maxHeight: '280px',
                        }}>{detail.trace}</pre>
                    </div>
                )}
            </div>
        </div>
    );
}

function Cadre({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: '17px', maxWidth: '1180px', margin: '0 auto' }}>
            {children}
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

function Etiquette({ ton, children }: { ton: 'rouge' | 'orange' | 'gris'; children: React.ReactNode }) {
    const couleurs = {
        rouge: { bg: '#fef2f2', fg: '#b91c1c' },
        orange: { bg: '#fffbeb', fg: '#b45309' },
        gris: { bg: '#f1f5f9', fg: '#64748b' },
    }[ton];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px',
            borderRadius: 99, background: couleurs.bg, color: couleurs.fg,
            fontSize: '11.5px', fontWeight: 800, whiteSpace: 'nowrap',
        }}>{children}</span>
    );
}

function Info({ libelle, valeur }: { libelle: string; valeur: string }) {
    return (
        <div style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            <span style={etiquetteTitre}>{libelle}</span>
            <p style={{ margin: '3px 0 0', fontSize: '13px', fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{valeur}</p>
        </div>
    );
}

function Vide({ icone, titre, texte }: { icone: React.ReactNode; titre: string; texte: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '54px 24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
            {icone}
            <p style={{ fontWeight: 800, color: '#334155', margin: '12px 0 4px', fontSize: '15px' }}>{titre}</p>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, maxWidth: '440px', marginInline: 'auto', lineHeight: 1.55 }}>{texte}</p>
        </div>
    );
}

const etiquetteTitre: React.CSSProperties = {
    fontSize: '10px', fontWeight: 800, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.5px',
};

const boutonDiscret: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 13px',
    borderRadius: '9px', border: '1px solid #cbd5e1', background: '#fff',
    color: '#475569', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
};
