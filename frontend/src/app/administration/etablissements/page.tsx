'use client';

/**
 * Administration › Établissements — écran de l'éditeur de la plateforme.
 *
 * Les écoles s'inscrivent seules depuis /inscription et arrivent EN ATTENTE.
 * C'est ici que SmartSchool décide qui entre : valider, refuser, ou suspendre
 * une école déjà active.
 *
 * Réservé au SUPER_ADMIN. Le contrôle réel est backend (`_require_super_admin`
 * sur chaque route) : cet écran ne fait qu'éviter d'afficher une page vide et
 * incompréhensible à quelqu'un qui n'y a pas droit. Le frontend n'est jamais la
 * couche de sécurité.
 *
 * L'identité affichée est le NOM de l'école, jamais son identifiant technique.
 * Deux écoles peuvent légitimement s'appeler « Groupe Scolaire La Renaissance »
 * — c'est le code, généré et unique, qui les distingue à l'œil.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
    AlertTriangle, Building2, Check, CheckCircle2, Clock, Loader2, MapPin,
    Phone, RefreshCw, Search, ShieldAlert, ShieldCheck, User, X,
} from 'lucide-react';
import api from '@/lib/api';

interface Demandeur {
    nom: string;
    email: string | null;
    telephone: string | null;
}

interface Ecole {
    etablissement_id: number;
    code: string;
    nom: string;
    type_etablissement: string;
    ville: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    statut: string;
    date_demande: string | null;
    demandeur: Demandeur | null;
}

const ONGLETS = [
    { statut: 'EN_ATTENTE', libelle: 'En attente', icone: Clock, couleur: '#b45309', fond: '#fffbeb' },
    { statut: 'ACTIF', libelle: 'Actives', icone: CheckCircle2, couleur: '#15803d', fond: '#f0fdf4' },
    { statut: 'SUSPENDU', libelle: 'Suspendues', icone: ShieldAlert, couleur: '#b91c1c', fond: '#fef2f2' },
    { statut: 'REFUSE', libelle: 'Refusées', icone: X, couleur: '#64748b', fond: '#f8fafc' },
];

export default function EtablissementsPage() {
    const { user } = useAuth();
    const [statut, setStatut] = useState('EN_ATTENTE');
    const [ecoles, setEcoles] = useState<Ecole[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [recherche, setRecherche] = useState('');
    const [enCours, setEnCours] = useState<number | null>(null);
    const [notification, setNotification] = useState<{ type: 'ok' | 'ko'; texte: string } | null>(null);
    const [confirmation, setConfirmation] = useState<{ ecole: Ecole; action: 'refuser' | 'suspendre' } | null>(null);
    const [motif, setMotif] = useState('');

    const estEditeur = user?.role === 'SUPER_ADMIN';

    const charger = useCallback(async (cible: string) => {
        setChargement(true);
        setErreur(null);
        try {
            const res = await api.get(`/api/inscription-etablissement/demandes?statut=${cible}`);
            setEcoles(Array.isArray(res.data) ? res.data : []);
        } catch (err: unknown) {
            const reponse = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
                : undefined;
            setEcoles([]);
            setErreur(
                reponse?.status === 403
                    ? "Cet écran est réservé à l'équipe SmartSchool."
                    : reponse?.data?.detail || "Impossible de charger les établissements."
            );
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { if (estEditeur) charger(statut); else setChargement(false); }, [statut, charger, estEditeur]);

    useEffect(() => {
        if (!notification) return;
        const t = setTimeout(() => setNotification(null), 5000);
        return () => clearTimeout(t);
    }, [notification]);

    const agir = async (ecole: Ecole, action: 'valider' | 'refuser' | 'suspendre', raison?: string) => {
        setEnCours(ecole.etablissement_id);
        try {
            const url = `/api/inscription-etablissement/${ecole.etablissement_id}/${action}`;
            const res = action === 'valider' ? await api.put(url) : await api.put(url, { motif: raison || null });
            setNotification({ type: 'ok', texte: res.data?.message || 'Opération effectuée.' });
            // On recharge depuis le serveur : l'école a changé d'onglet, la
            // retirer localement suffirait à l'écran mais mentirait sur l'état réel.
            await charger(statut);
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setNotification({ type: 'ko', texte: detail || "L'opération a échoué. Rien n'a été modifié." });
        } finally {
            setEnCours(null);
            setConfirmation(null);
            setMotif('');
        }
    };

    const visibles = useMemo(() => {
        const q = recherche.trim().toLowerCase();
        if (!q) return ecoles;
        return ecoles.filter(e =>
            e.nom.toLowerCase().includes(q)
            || e.code.toLowerCase().includes(q)
            || (e.ville || '').toLowerCase().includes(q)
            || (e.demandeur?.nom || '').toLowerCase().includes(q)
        );
    }, [ecoles, recherche]);

    if (!estEditeur) {
        return (
            <Cadre>
                <EtatVide
                    icone={<ShieldAlert size={40} style={{ color: '#cbd5e1' }} />}
                    titre="Espace réservé"
                    texte="La gestion des établissements est réservée à l'équipe SmartSchool."
                />
            </Cadre>
        );
    }

    const ongletActif = ONGLETS.find(o => o.statut === statut)!;

    return (
        <Cadre>
            {/* En-tête */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Building2 size={22} style={{ color: '#2563eb' }} /> Établissements
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Les écoles s&apos;inscrivent depuis le site public. Validez, refusez ou suspendez ici.
                    </p>
                </div>
                <button onClick={() => charger(statut)} disabled={chargement} style={boutonDiscret}>
                    <RefreshCw size={15} style={chargement ? { animation: 'spin 1s linear infinite' } : undefined} /> Actualiser
                </button>
            </div>

            {notification && (
                <div style={{
                    display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '13px 15px', borderRadius: '12px',
                    background: notification.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${notification.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                }}>
                    {notification.type === 'ok'
                        ? <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                        : <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />}
                    <span style={{ fontSize: '13px', color: notification.type === 'ok' ? '#15803d' : '#b91c1c', lineHeight: 1.5 }}>
                        {notification.texte}
                    </span>
                </div>
            )}

            {/* Onglets — défilement horizontal contrôlé sur mobile */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {ONGLETS.map(o => {
                    const actif = o.statut === statut;
                    const Icone = o.icone;
                    return (
                        <button key={o.statut} onClick={() => { setStatut(o.statut); setRecherche(''); }} style={{
                            flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: '7px',
                            padding: '9px 15px', borderRadius: '11px', cursor: 'pointer', fontSize: '13px',
                            fontWeight: actif ? 800 : 600,
                            border: `1px solid ${actif ? o.couleur : '#e2e8f0'}`,
                            background: actif ? o.fond : '#fff',
                            color: actif ? o.couleur : '#64748b',
                        }}>
                            <Icone size={15} /> {o.libelle}
                            {actif && ecoles.length > 0 && (
                                <span style={{ padding: '1px 7px', borderRadius: 99, background: o.couleur, color: '#fff', fontSize: '11px', fontWeight: 800 }}>
                                    {ecoles.length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Recherche */}
            <div style={{ position: 'relative', maxWidth: '380px' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                    value={recherche}
                    onChange={e => setRecherche(e.target.value)}
                    placeholder="Rechercher un nom, un code, une ville…"
                    style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none' }}
                />
            </div>

            {/* Contenu */}
            {chargement ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={28} style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : erreur ? (
                <EtatVide icone={<AlertTriangle size={38} style={{ color: '#f87171' }} />} titre="Chargement impossible" texte={erreur} />
            ) : visibles.length === 0 ? (
                <EtatVide
                    icone={<ongletActif.icone size={38} style={{ color: '#cbd5e1' }} />}
                    titre={recherche ? 'Aucun résultat' : `Aucun établissement ${ongletActif.libelle.toLowerCase()}`}
                    texte={recherche
                        ? 'Aucun établissement ne correspond à cette recherche.'
                        : statut === 'EN_ATTENTE'
                            ? 'Les nouvelles demandes d’inscription apparaîtront ici.'
                            : 'Rien à afficher pour le moment.'}
                />
            ) : (
                // Cartes plutôt qu'un tableau : chaque école porte deux blocs
                // d'information (l'école et son demandeur) qu'un tableau
                // écraserait, et qui déborderaient sur mobile.
                <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                    {visibles.map(e => (
                        <CarteEcole
                            key={e.etablissement_id}
                            ecole={e}
                            occupe={enCours === e.etablissement_id}
                            onValider={() => agir(e, 'valider')}
                            onRefuser={() => setConfirmation({ ecole: e, action: 'refuser' })}
                            onSuspendre={() => setConfirmation({ ecole: e, action: 'suspendre' })}
                        />
                    ))}
                </div>
            )}

            {confirmation && (
                <Confirmation
                    ecole={confirmation.ecole}
                    action={confirmation.action}
                    motif={motif}
                    setMotif={setMotif}
                    occupe={enCours === confirmation.ecole.etablissement_id}
                    onAnnuler={() => { setConfirmation(null); setMotif(''); }}
                    onConfirmer={() => agir(confirmation.ecole, confirmation.action, motif)}
                />
            )}

            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </Cadre>
    );
}

/* ────────────────────────────── composants ────────────────────────────── */

function Cadre({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '1280px', margin: '0 auto' }}>
            {children}
        </div>
    );
}

function CarteEcole({ ecole, occupe, onValider, onRefuser, onSuspendre }: {
    ecole: Ecole; occupe: boolean;
    onValider: () => void; onRefuser: () => void; onSuspendre: () => void;
}) {
    const enAttente = ecole.statut === 'EN_ATTENTE';
    const active = ecole.statut === 'ACTIF';
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
            <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)', display: 'grid', placeItems: 'center', flexShrink: 0, color: '#fff', fontWeight: 800 }}>
                    {ecole.nom.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Le NOM d'abord. Le code n'est là que pour distinguer deux
                        écoles homonymes — l'identifiant technique n'est jamais montré. */}
                    <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a', wordBreak: 'break-word' }}>{ecole.nom}</h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 6 }}>{ecole.code}</span>
                        <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>{ecole.type_etablissement}</span>
                    </div>
                </div>
                <Pastille statut={ecole.statut} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12.5px', color: '#475569' }}>
                {ecole.ville && <Info icone={<MapPin size={13} />} texte={[ecole.ville, ecole.adresse].filter(Boolean).join(' · ')} />}
                {ecole.telephone && <Info icone={<Phone size={13} />} texte={ecole.telephone} />}
                {ecole.demandeur && (
                    <Info
                        icone={<User size={13} />}
                        texte={`${ecole.demandeur.nom}${ecole.demandeur.email ? ` — ${ecole.demandeur.email}` : ''}`}
                    />
                )}
                {ecole.date_demande && (
                    <Info icone={<Clock size={13} />} texte={`Demande du ${new Date(ecole.date_demande).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`} />
                )}
            </div>

            {(enAttente || active) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '3px', borderTop: '1px solid #f1f5f9' }}>
                    {enAttente && (
                        <>
                            <button onClick={onValider} disabled={occupe} style={{ ...boutonAction, background: '#16a34a', flex: 1, minWidth: '120px' }}>
                                {occupe ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Valider
                            </button>
                            <button onClick={onRefuser} disabled={occupe} style={{ ...boutonAction, background: '#fff', color: '#dc2626', border: '1px solid #fecaca' }}>
                                <X size={14} /> Refuser
                            </button>
                        </>
                    )}
                    {active && (
                        <button onClick={onSuspendre} disabled={occupe} style={{ ...boutonAction, background: '#fff', color: '#b45309', border: '1px solid #fde68a' }}>
                            <ShieldAlert size={14} /> Suspendre
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function Confirmation({ ecole, action, motif, setMotif, occupe, onAnnuler, onConfirmer }: {
    ecole: Ecole; action: 'refuser' | 'suspendre'; motif: string;
    setMotif: (v: string) => void; occupe: boolean; onAnnuler: () => void; onConfirmer: () => void;
}) {
    const refus = action === 'refuser';
    return (
        <div
            onClick={onAnnuler}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', padding: '16px', zIndex: 60 }}
        >
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '18px', padding: '24px', width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '12px', background: refus ? '#fef2f2' : '#fffbeb', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {refus ? <X size={19} style={{ color: '#dc2626' }} /> : <ShieldAlert size={19} style={{ color: '#b45309' }} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>
                            {refus ? 'Refuser cette demande ?' : 'Suspendre cet établissement ?'}
                        </h3>
                        <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.55 }}>
                            <strong>{ecole.nom}</strong>{ecole.ville ? ` — ${ecole.ville}` : ''}.{' '}
                            {refus
                                ? "Le compte reste enregistré mais la connexion sera refusée. Rien n'est supprimé."
                                : "Les comptes de cette école ne pourront plus se connecter. Les données restent intactes."}
                        </p>
                    </div>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Motif (facultatif)</span>
                    <input value={motif} onChange={e => setMotif(e.target.value)}
                        placeholder={refus ? 'Établissement non identifié…' : 'Impayé, demande de l’école…'}
                        style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none' }} />
                </label>

                <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
                    <button onClick={onAnnuler} disabled={occupe} style={{ ...boutonAction, background: '#f1f5f9', color: '#475569', flex: 1, minWidth: '110px' }}>
                        Annuler
                    </button>
                    <button onClick={onConfirmer} disabled={occupe} style={{ ...boutonAction, background: refus ? '#dc2626' : '#b45309', flex: 1, minWidth: '110px' }}>
                        {occupe ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                        {refus ? 'Refuser' : 'Suspendre'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Pastille({ statut }: { statut: string }) {
    const o = ONGLETS.find(x => x.statut === statut);
    if (!o) return null;
    return (
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: 99, background: o.fond, color: o.couleur, fontSize: '11px', fontWeight: 800, border: `1px solid ${o.couleur}30` }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: o.couleur }} /> {o.libelle}
        </span>
    );
}

function Info({ icone, texte }: { icone: React.ReactNode; texte: string }) {
    return (
        <span style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
            <span style={{ color: '#94a3b8', flexShrink: 0, marginTop: 1 }}>{icone}</span>
            <span style={{ wordBreak: 'break-word', lineHeight: 1.45 }}>{texte}</span>
        </span>
    );
}

function EtatVide({ icone, titre, texte }: { icone: React.ReactNode; titre: string; texte: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '54px 24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
            {icone}
            <p style={{ fontWeight: 800, color: '#334155', margin: '12px 0 4px', fontSize: '15px' }}>{titre}</p>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, maxWidth: '420px', marginInline: 'auto', lineHeight: 1.55 }}>{texte}</p>
        </div>
    );
}

const boutonAction: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '9px 15px', borderRadius: '10px', border: 'none', color: '#fff',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};

const boutonDiscret: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 15px',
    borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff',
    color: '#475569', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
};
