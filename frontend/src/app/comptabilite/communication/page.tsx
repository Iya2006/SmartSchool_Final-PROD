'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Bell, ChevronRight, Inbox, Loader2, MessageCircle, Phone,
    RefreshCw, Search, Send, Users, X,
} from 'lucide-react';
import api from '@/lib/api';
import { texteErreur } from '@/lib/texteErreur';
import { useApp } from '@/context/AppContext';
import { useIsMobile } from '@/hooks/useIsMobile';

/*
 * MESSAGES AUX FAMILLES — le comptable écrit aux parents.
 *
 * Décision du fondateur (22/11/2026) : le comptable écrit aux familles pour
 * relancer un paiement ou répondre sur la scolarité. Il ne lit et n'écrit que
 * des messages « Paiement » : le serveur l'impose (app/api/communication.py).
 * Les autres échanges de la direction avec les familles restent dans l'écran
 * Communication de la direction.
 *
 * Avant, cette page était une copie de cet écran de la direction : toutes ses
 * données étaient refusées au comptable, et elle restait vide.
 */

interface Enfant {
    eleve_id: number; nom: string; prenom: string;
    classe: string; classe_id: number | null; lien_parente: string;
}
interface Famille {
    parent_id: number; nom: string; prenom: string;
    telephone: string | null; email: string | null;
    nb_enfants: number; enfants: Enfant[];
}
interface Echange {
    message_id: number;
    expediteur_type: string; expediteur_id: number | null; expediteur_nom: string;
    destinataire_type: string; destinataire_id: number | null; destinataire_nom: string;
    sujet: string; contenu: string | null; statut: string; date_envoi: string | null;
}
interface Classe { classe_id: number; libelle: string; }
type Cible = 'PARENT' | 'CLASSE_PARENTS' | 'TOUS_PARENTS';

const FAMILLES_PAR_PAGE = 60;
const LIMITE_ECHANGES = 200;  // celle du serveur, par défaut

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initiales = (f: { prenom: string; nom: string }) => `${f.prenom?.[0] || ''}${f.nom?.[0] || ''}`.toUpperCase();
const dateCourte = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
const estDuParent = (m: Echange) => m.expediteur_type === 'PARENT';
const estALire = (m: Echange) => estDuParent(m) && m.statut === 'ENVOYE';

/* ───── Styles (comme le reste de l'espace Comptabilité : inline) ───── */
const carte: React.CSSProperties = {
    background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', minWidth: 0,
};
const enteteCarte: React.CSSProperties = {
    padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
};
const btnPrimaire: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8,
    background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
};
const btnSecondaire: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8,
    background: '#f1f5f9', color: '#475569', fontSize: 13, fontWeight: 600, border: 'none',
    cursor: 'pointer', textDecoration: 'none',
};
const champ: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
    fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
};
const etiquette: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 };
const pastilleALire: React.CSSProperties = {
    padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
    background: '#fef3c7', color: '#b45309', whiteSpace: 'nowrap',
};

function Bulle({ m, conversation, onLu }: { m: Echange; conversation: boolean; onLu?: () => void }) {
    const duParent = estDuParent(m);
    const groupe = m.destinataire_type === 'TOUS_PARENTS' || m.destinataire_type === 'CLASSE_PARENTS';
    return (
        <article style={{
            alignSelf: conversation ? (duParent ? 'flex-start' : 'flex-end') : 'stretch',
            maxWidth: conversation ? '88%' : undefined,
            padding: '12px 14px', borderRadius: 10,
            background: duParent ? '#f0fdfa' : '#fff',
            border: `1px solid ${duParent ? '#99f6e4' : '#e2e8f0'}`,
            borderLeft: `4px solid ${duParent ? '#0d9488' : '#10b981'}`,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{m.sujet}</p>
                {estALire(m) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={pastilleALire}>Nouveau</span>
                        {/* Dans la liste générale : une réponse dont la famille
                            n'est plus dans l'annuaire se marque lue ici. */}
                        {onLu && (
                            <button type="button" onClick={onLu}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#047857', fontSize: 12, fontWeight: 600, textDecoration: 'underline', fontFamily: 'inherit' }}>
                                Marquer comme lu
                            </button>
                        )}
                    </span>
                )}
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#64748b' }}>
                {duParent ? `${m.expediteur_nom} → Administration` : `Administration → ${m.destinataire_nom}`}
                {groupe ? ' · message groupé' : ''}
                {m.date_envoi ? ` · ${dateCourte(m.date_envoi)}` : ''}
            </p>
            {m.contenu && (
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {m.contenu}
                </p>
            )}
        </article>
    );
}

export default function MessagesAuxFamillesPage() {
    const { etablissementId, anneeId, loading: chargementApp } = useApp();
    const isMobile = useIsMobile();

    const [familles, setFamilles] = useState<Famille[]>([]);
    const [echanges, setEchanges] = useState<Echange[]>([]);
    const [classes, setClasses] = useState<Classe[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);

    const [recherche, setRecherche] = useState('');
    const [nbAffichees, setNbAffichees] = useState(FAMILLES_PAR_PAGE);
    const [famille, setFamille] = useState<Famille | null>(null);
    const [echangesFamille, setEchangesFamille] = useState<Echange[]>([]);
    const [chargementFamille, setChargementFamille] = useState(false);
    // Famille dont on attend les échanges : un clic rapide sur une autre ne
    // doit pas voir s'afficher la réponse arrivée pour la première.
    const familleDemandee = useRef<number | null>(null);

    const [toast, setToast] = useState<{ texte: string; type: 'succes' | 'erreur' } | null>(null);
    const minuterieToast = useRef<number | undefined>(undefined);

    const [composer, setComposer] = useState(false);
    const [cible, setCible] = useState<Cible>('PARENT');
    const [destParent, setDestParent] = useState<Famille | null>(null);
    const [destRecherche, setDestRecherche] = useState('');
    const [destClasse, setDestClasse] = useState<number | ''>('');
    const [sujet, setSujet] = useState('');
    const [contenu, setContenu] = useState('');
    const [envoi, setEnvoi] = useState(false);
    const [erreurEnvoi, setErreurEnvoi] = useState('');

    const afficher = useCallback((texte: string, type: 'succes' | 'erreur') => {
        window.clearTimeout(minuterieToast.current);
        setToast({ texte, type });
        minuterieToast.current = window.setTimeout(() => setToast(null), 4500);
    }, []);
    useEffect(() => () => window.clearTimeout(minuterieToast.current), []);

    const chargerEchanges = useCallback(async () => {
        const r = await api.get(`/api/communication/messages-parents?objet_type=PAIEMENT&limit=${LIMITE_ECHANGES}`);
        setEchanges(r.data || []);
    }, []);

    const charger = useCallback(async () => {
        if (chargementApp) return;
        if (!etablissementId) { setChargement(false); return; }
        setErreur(null);
        const [f, e, c] = await Promise.allSettled([
            api.get('/api/communication/parents-list'),
            chargerEchanges(),
            anneeId
                ? api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
                : Promise.resolve({ data: [] as Classe[] }),
        ]);
        if (f.status === 'fulfilled') setFamilles(f.value.data || []);
        if (c.status === 'fulfilled') setClasses(c.value.data || []);
        const echec = [f, e, c].find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (echec) setErreur(texteErreur(echec.reason, "Une partie de l'écran n'a pas pu être chargée."));
        setChargement(false);
    }, [chargementApp, etablissementId, anneeId, chargerEchanges]);

    useEffect(() => { charger(); }, [charger]);

    const ouvrirFamille = useCallback(async (f: Famille) => {
        familleDemandee.current = f.parent_id;
        setFamille(f);
        setChargementFamille(true);
        try {
            const r = await api.get(`/api/communication/messages-parents?objet_type=PAIEMENT&parent_id=${f.parent_id}`);
            if (familleDemandee.current !== f.parent_id) return;
            const liste: Echange[] = r.data || [];
            setEchangesFamille(liste);
            // Ouvrir la conversation, c'est lire les réponses de la famille —
            // lues pour toute l'administration, comme dans une boîte partagée.
            const aLire = liste.filter(estALire);
            if (aLire.length) {
                const faits = await Promise.allSettled(aLire.map(m => api.put(`/api/communication/messages/${m.message_id}/lire`)));
                const lus = new Set(aLire.filter((_, i) => faits[i].status === 'fulfilled').map(m => m.message_id));
                const marquer = (l: Echange[]) => l.map(m => (lus.has(m.message_id) ? { ...m, statut: 'LU' } : m));
                if (familleDemandee.current === f.parent_id) setEchangesFamille(marquer);
                setEchanges(marquer);
            }
        } catch (err) {
            if (familleDemandee.current !== f.parent_id) return;
            setEchangesFamille([]);
            afficher(texteErreur(err, "Les échanges de cette famille n'ont pas pu être chargés."), 'erreur');
        } finally {
            if (familleDemandee.current === f.parent_id) setChargementFamille(false);
        }
    }, [afficher]);

    const marquerLu = useCallback(async (m: Echange) => {
        try {
            await api.put(`/api/communication/messages/${m.message_id}/lire`);
        } catch (err) {
            afficher(texteErreur(err, "Ce message n'a pas pu être marqué comme lu."), 'erreur');
            return;
        }
        const marquer = (l: Echange[]) => l.map(x => (x.message_id === m.message_id ? { ...x, statut: 'LU' } : x));
        setEchanges(marquer);
        setEchangesFamille(marquer);
    }, [afficher]);

    const fermerFamille = () => {
        familleDemandee.current = null;
        setFamille(null);
        setEchangesFamille([]);
        setChargementFamille(false);
    };

    /* ───── Données dérivées ───── */
    const index = useMemo(() => familles.map(f => ({
        f,
        cle: sansAccents(`${f.prenom} ${f.nom} ${f.telephone || ''} ${f.enfants.map(e => `${e.prenom} ${e.nom} ${e.classe}`).join(' ')}`),
    })), [familles]);

    const aLireParFamille = useMemo(() => {
        const n = new Map<number, number>();
        for (const m of echanges) {
            if (estALire(m) && m.expediteur_id != null) n.set(m.expediteur_id, (n.get(m.expediteur_id) || 0) + 1);
        }
        return n;
    }, [echanges]);

    const famillesFiltrees = useMemo(() => {
        const q = sansAccents(recherche.trim());
        const liste = q ? index.filter(x => x.cle.includes(q)).map(x => x.f) : familles;
        // Les familles qui attendent une réponse d'abord ; l'ordre alphabétique
        // du serveur ensuite (tri stable).
        return [...liste].sort((a, b) => (aLireParFamille.get(b.parent_id) || 0) - (aLireParFamille.get(a.parent_id) || 0));
    }, [index, familles, recherche, aLireParFamille]);

    useEffect(() => { setNbAffichees(FAMILLES_PAR_PAGE); }, [recherche]);

    const suggestions = useMemo(() => {
        const q = sansAccents(destRecherche.trim());
        if (!q) return [];
        return index.filter(x => x.cle.includes(q)).slice(0, 8).map(x => x.f);
    }, [index, destRecherche]);

    const nbEnvoyes = echanges.filter(m => !estDuParent(m)).length;
    const nbRecus = echanges.filter(estDuParent).length;
    const nbALire = echanges.filter(estALire).length;

    /* ───── Écrire ───── */
    const ouvrirComposer = (pour: Famille | null) => {
        setCible('PARENT');
        setDestParent(pour);
        setDestRecherche('');
        setDestClasse('');
        setSujet('');
        setContenu('');
        setErreurEnvoi('');
        setComposer(true);
    };

    useEffect(() => {
        if (!composer) return;
        const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) setComposer(false); };
        window.addEventListener('keydown', surTouche);
        return () => window.removeEventListener('keydown', surTouche);
    }, [composer, envoi]);

    const classeChoisie = classes.find(c => c.classe_id === destClasse);
    const libelleEnvoi = cible === 'TOUS_PARENTS'
        ? 'à tous les parents'
        : cible === 'CLASSE_PARENTS'
            ? (classeChoisie ? `aux parents de ${classeChoisie.libelle}` : 'aux parents de la classe')
            : (destParent ? `à ${destParent.prenom} ${destParent.nom}` : '');

    const envoyer = async () => {
        setErreurEnvoi('');
        if (cible === 'PARENT' && !destParent) { setErreurEnvoi('Choisissez la famille à qui écrire.'); return; }
        if (cible === 'CLASSE_PARENTS' && !destClasse) { setErreurEnvoi('Choisissez la classe.'); return; }
        if (!sujet.trim()) { setErreurEnvoi('Le sujet est requis.'); return; }
        if (!contenu.trim()) { setErreurEnvoi('Écrivez votre message.'); return; }
        setEnvoi(true);
        try {
            await api.post('/api/communication/messages-parents', {
                destinataire_type: cible,
                destinataire_id: cible === 'PARENT' ? destParent?.parent_id : cible === 'CLASSE_PARENTS' ? destClasse : null,
                objet_type: 'PAIEMENT',
                sujet: sujet.trim(),
                contenu: contenu.trim(),
            });
        } catch (err) {
            setErreurEnvoi(texteErreur(err, "Le message n'a pas pu être envoyé."));
            setEnvoi(false);
            return;
        }
        setEnvoi(false);
        setComposer(false);
        afficher(`Message envoyé ${libelleEnvoi}.`, 'succes');
        // Le message est parti : le rafraîchissement, lui, peut échouer sans
        // faire croire le contraire.
        chargerEchanges().catch(() => {});
        const aRouvrir = cible === 'PARENT' ? destParent : famille;
        if (aRouvrir) ouvrirFamille(aRouvrir);
    };

    if (chargement) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#059669" />
            <p style={{ color: '#64748b' }}>Chargement des messages…</p>
        </div>
    );

    const listeAffichee = famille ? echangesFamille : echanges;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <AnimatePresence>
                {toast && (
                    <motion.div role="status" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, maxWidth: 'min(420px, calc(100vw - 40px))', padding: '12px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: toast.type === 'succes' ? '#059669' : '#dc2626' }}>
                        {toast.texte}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Fil d'Ariane et actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                    <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link>
                    <ChevronRight size={14} />
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Messages aux familles</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href="/comptabilite/impayes" style={btnSecondaire}>
                        <AlertTriangle size={14} /> Relancer les impayés
                    </Link>
                    <button type="button" onClick={() => ouvrirComposer(famille)} style={btnPrimaire}>
                        <Send size={14} /> Nouveau message
                    </button>
                </div>
            </div>

            {erreur && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                    <span>{erreur}</span>
                    <button type="button" onClick={() => { setChargement(true); charger(); }} style={{ ...btnSecondaire, background: '#fff', padding: '6px 12px' }}>
                        <RefreshCw size={13} /> Réessayer
                    </button>
                </div>
            )}

            {/* Compteurs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
                {[
                    { label: 'Messages envoyés', value: nbEnvoyes, icon: Send, color: '#059669' },
                    { label: 'Réponses des parents', value: nbRecus, icon: Inbox, color: '#0d9488' },
                    { label: 'À lire', value: nbALire, icon: Bell, color: '#d97706' },
                    { label: 'Familles', value: familles.length, icon: Users, color: '#3b82f6' },
                ].map((kpi, i) => (
                    <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        style={{ ...carte, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 500 }}>{kpi.label}</p>
                            <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: kpi.color, fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</p>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <kpi.icon size={22} />
                        </div>
                    </motion.div>
                ))}
            </div>
            {echanges.length >= LIMITE_ECHANGES && (
                <p style={{ margin: '-8px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    Les compteurs portent sur les {LIMITE_ECHANGES} échanges les plus récents. L&apos;historique complet d&apos;une famille s&apos;affiche quand on l&apos;ouvre.
                </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(300px, 380px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                {/* Familles */}
                <section aria-label="Familles" style={{ ...carte, maxHeight: isMobile ? 440 : 640 }}>
                    <div style={{ ...enteteCarte, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Users size={16} color="#059669" /> Familles
                            </h2>
                            <span style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{famillesFiltrees.length}</span>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={recherche} onChange={e => setRecherche(e.target.value)} aria-label="Rechercher une famille"
                                placeholder="Parent, téléphone, élève ou classe…" style={{ ...champ, paddingLeft: 34 }} />
                        </div>
                    </div>
                    <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {familles.length === 0 ? (
                            <p style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Aucune famille dans cette école pour le moment.</p>
                        ) : famillesFiltrees.length === 0 ? (
                            <p style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Aucune famille ne correspond à « {recherche.trim()} ».</p>
                        ) : (
                            <>
                                {famillesFiltrees.slice(0, nbAffichees).map(f => {
                                    const choisie = famille?.parent_id === f.parent_id;
                                    const aLire = aLireParFamille.get(f.parent_id) || 0;
                                    return (
                                        <button key={f.parent_id} type="button" onClick={() => ouvrirFamille(f)} aria-pressed={choisie}
                                            style={{
                                                textAlign: 'left', width: '100%', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                                border: `1px solid ${choisie ? '#10b981' : '#e2e8f0'}`, background: choisie ? '#ecfdf5' : '#fff',
                                                display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'inherit',
                                            }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                                                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: '#d1fae5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                                                    {initiales(f)}
                                                </span>
                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.prenom} {f.nom}</span>
                                                    <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                                        {f.telephone || 'Sans téléphone'} · {f.nb_enfants} enfant{f.nb_enfants > 1 ? 's' : ''}
                                                    </span>
                                                </span>
                                                {aLire > 0 && <span style={pastilleALire}>{aLire} à lire</span>}
                                            </span>
                                            {f.enfants.length > 0 && (
                                                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 44 }}>
                                                    {f.enfants.slice(0, 3).map(e => (
                                                        <span key={e.eleve_id} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                                                            {e.prenom} — {e.classe}
                                                        </span>
                                                    ))}
                                                    {f.enfants.length > 3 && (
                                                        <span style={{ padding: '2px 6px', fontSize: 10.5, fontWeight: 600, color: '#64748b' }}>+{f.enfants.length - 3}</span>
                                                    )}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                                {famillesFiltrees.length > nbAffichees && (
                                    <button type="button" onClick={() => setNbAffichees(n => n + FAMILLES_PAR_PAGE)} style={{ ...btnSecondaire, justifyContent: 'center', margin: '4px 0' }}>
                                        Afficher {Math.min(FAMILLES_PAR_PAGE, famillesFiltrees.length - nbAffichees)} familles de plus
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </section>

                {/* Échanges */}
                <section aria-label="Échanges" style={{ ...carte, maxHeight: isMobile ? undefined : 640 }}>
                    <div style={enteteCarte}>
                        {famille ? (
                            <>
                                <div style={{ minWidth: 0 }}>
                                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{famille.prenom} {famille.nom}</h2>
                                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        {famille.telephone && (
                                            <a href={`tel:${famille.telephone}`} style={{ color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                                                <Phone size={12} /> {famille.telephone}
                                            </a>
                                        )}
                                        {famille.enfants.length > 0 && (
                                            <span>{famille.enfants.map(e => `${e.prenom} (${e.classe})`).join(', ')}</span>
                                        )}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" onClick={() => ouvrirComposer(famille)} style={{ ...btnPrimaire, padding: '7px 12px', fontSize: 12 }}>
                                        <Send size={13} /> Écrire
                                    </button>
                                    <button type="button" onClick={fermerFamille} style={{ ...btnSecondaire, padding: '7px 10px', fontSize: 12 }}>
                                        <X size={13} /> Toutes les familles
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <MessageCircle size={16} color="#059669" /> Échanges sur les paiements
                                </h2>
                                <span style={{ fontSize: 12, color: '#64748b' }}>Choisissez une famille pour voir toute sa conversation.</span>
                            </>
                        )}
                    </div>
                    <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {famille && chargementFamille ? (
                            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
                                <Loader2 size={26} className="animate-spin" color="#059669" />
                            </div>
                        ) : listeAffichee.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                                <MessageCircle size={32} style={{ opacity: 0.25, margin: '0 auto 10px', display: 'block' }} />
                                <p style={{ margin: 0 }}>
                                    {famille
                                        ? `Aucun échange sur les paiements avec ${famille.prenom} ${famille.nom}.`
                                        : 'Aucun échange sur les paiements pour le moment.'}
                                </p>
                                <button type="button" onClick={() => ouvrirComposer(famille)} style={{ ...btnPrimaire, marginTop: 14 }}>
                                    <Send size={14} /> {famille ? 'Écrire à cette famille' : 'Écrire à une famille'}
                                </button>
                            </div>
                        ) : (
                            listeAffichee.map(m => (
                                <Bulle key={m.message_id} m={m} conversation={!!famille}
                                    onLu={famille ? undefined : () => marquerLu(m)} />
                            ))
                        )}
                    </div>
                </section>
            </div>

            {/* Nouveau message */}
            <AnimatePresence>
                {composer && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => { if (!envoi) setComposer(false); }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                        <motion.div role="dialog" aria-modal="true" aria-labelledby="titre-nouveau-message"
                            initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: 0.97 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                            <div style={{ ...enteteCarte, padding: '16px 20px' }}>
                                <h2 id="titre-nouveau-message" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Send size={17} color="#059669" /> Message aux familles
                                </h2>
                                <button type="button" aria-label="Fermer" onClick={() => setComposer(false)} disabled={envoi}
                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <span style={etiquette}>Destinataire</span>
                                    <div role="radiogroup" aria-label="Destinataire" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {([
                                            { cle: 'PARENT', label: 'Une famille' },
                                            { cle: 'CLASSE_PARENTS', label: "Les parents d'une classe" },
                                            { cle: 'TOUS_PARENTS', label: 'Tous les parents' },
                                        ] as { cle: Cible; label: string }[]).map(o => (
                                            <button key={o.cle} type="button" role="radio" aria-checked={cible === o.cle}
                                                onClick={() => { setCible(o.cle); setErreurEnvoi(''); }}
                                                style={{
                                                    padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none',
                                                    background: cible === o.cle ? '#059669' : '#f1f5f9', color: cible === o.cle ? '#fff' : '#475569',
                                                }}>
                                                {o.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {cible === 'PARENT' && (
                                    destParent ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                                            <span style={{ fontSize: 13, color: '#065f46', minWidth: 0 }}>
                                                <strong>{destParent.prenom} {destParent.nom}</strong>
                                                {destParent.enfants.length > 0 && ` — ${destParent.enfants.map(e => e.prenom).join(', ')}`}
                                            </span>
                                            <button type="button" onClick={() => setDestParent(null)} style={{ ...btnSecondaire, background: '#fff', padding: '5px 10px', fontSize: 12 }}>
                                                Changer
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <label htmlFor="dest-recherche" style={etiquette}>Famille</label>
                                            <input id="dest-recherche" autoFocus value={destRecherche} onChange={e => setDestRecherche(e.target.value)}
                                                placeholder="Nom du parent, téléphone ou élève…" style={champ} />
                                            {suggestions.length > 0 && (
                                                <div style={{ marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                                                    {suggestions.map(f => (
                                                        <button key={f.parent_id} type="button" onClick={() => { setDestParent(f); setErreurEnvoi(''); }}
                                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#0f172a', fontFamily: 'inherit' }}>
                                                            <strong>{f.prenom} {f.nom}</strong>
                                                            <span style={{ color: '#64748b' }}>
                                                                {f.telephone ? ` · ${f.telephone}` : ''}
                                                                {f.enfants.length > 0 ? ` · ${f.enfants.map(e => `${e.prenom} (${e.classe})`).join(', ')}` : ''}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {destRecherche.trim() && suggestions.length === 0 && (
                                                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>Aucune famille ne correspond.</p>
                                            )}
                                        </div>
                                    )
                                )}

                                {cible === 'CLASSE_PARENTS' && (
                                    <div>
                                        <label htmlFor="dest-classe" style={etiquette}>Classe</label>
                                        {classes.length === 0 ? (
                                            <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>Aucune classe pour l&apos;année en cours.</p>
                                        ) : (
                                            <select id="dest-classe" value={destClasse} onChange={e => setDestClasse(e.target.value ? Number(e.target.value) : '')} style={champ}>
                                                <option value="">— Choisir une classe —</option>
                                                {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                            </select>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="message-sujet" style={etiquette}>Sujet</label>
                                    <input id="message-sujet" value={sujet} onChange={e => setSujet(e.target.value)} maxLength={300}
                                        placeholder="Ex. : Rappel — frais du 2e trimestre" style={champ} />
                                </div>
                                <div>
                                    <label htmlFor="message-contenu" style={etiquette}>Message</label>
                                    <textarea id="message-contenu" value={contenu} onChange={e => setContenu(e.target.value)} rows={5}
                                        placeholder="Votre message à la famille…" style={{ ...champ, resize: 'vertical' }} />
                                </div>

                                <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                                    Le message part au nom de l&apos;administration de l&apos;école, classé « Paiement ». Le parent le lit dans son portail et peut y répondre : sa réponse arrive ici.
                                </p>

                                {erreurEnvoi && (
                                    <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                                        {erreurEnvoi}
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setComposer(false)} disabled={envoi} style={btnSecondaire}>Annuler</button>
                                <button type="button" onClick={envoyer} disabled={envoi} style={{ ...btnPrimaire, opacity: envoi ? 0.7 : 1, cursor: envoi ? 'not-allowed' : 'pointer' }}>
                                    {envoi ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    {libelleEnvoi ? `Envoyer ${libelleEnvoi}` : 'Envoyer'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
