'use client';

/**
 * Paramètres › Emploi du temps — horaires, pauses, seuil de retard.
 *
 * Ces valeurs ne sont pas décoratives : elles sont lues par
 * `lib/horaires.ts`, qui alimente la grille de l'emploi du temps et la
 * qualification des retards au pointage. Un écran de réglages dont personne ne
 * lit les valeurs est un interrupteur sans fil — le défaut déjà corrigé sur la
 * notation, à ne pas reproduire ici.
 *
 * Catégorie `EMPLOI_DU_TEMPS`, clés préfixées `horaires.` : le préfixe évite
 * qu'un futur réglage d'un autre écran ne vienne écraser celui-ci, la table des
 * paramètres étant partagée et indexée sur la seule clé.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, Check, Clock, Coffee, Loader2, Plus, Save, Timer, Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { HORAIRES_DEFAUT, formatPauses, invaliderCacheHoraires, parsePauses, type Horaires, type Pause } from '@/lib/horaires';

const CATEGORIE = 'EMPLOI_DU_TEMPS';

export default function HorairesPage() {
    const [valeurs, setValeurs] = useState<Horaires>(HORAIRES_DEFAUT);
    const [chargement, setChargement] = useState(true);
    const [envoi, setEnvoi] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const charger = useCallback(async () => {
        setChargement(true);
        try {
            const res = await api.get(`/api/parametrage/settings?categorie=${CATEGORIE}`);
            const lus: Record<string, string> = {};
            for (const p of res.data || []) lus[p.cle] = p.valeur;
            let pauses = parsePauses(lus['horaires.pauses']);
            if (pauses.length === 0) {
                const d = lus['horaires.pause_debut'];
                const f = lus['horaires.pause_fin'];
                pauses = d && f ? [{ debut: d, fin: f }] : HORAIRES_DEFAUT.pauses;
            }
            setValeurs({
                debut: lus['horaires.debut'] || HORAIRES_DEFAUT.debut,
                fin: lus['horaires.fin'] || HORAIRES_DEFAUT.fin,
                dureeCours: Number(lus['horaires.duree_cours']) || HORAIRES_DEFAUT.dureeCours,
                pauses,
                pauseDebut: pauses[0]?.debut || HORAIRES_DEFAUT.pauseDebut,
                pauseFin: pauses[0]?.fin || HORAIRES_DEFAUT.pauseFin,
                seuilRetard: Number(lus['horaires.seuil_retard']) || HORAIRES_DEFAUT.seuilRetard,
                seuilAbsence: Number(lus['horaires.seuil_absence']) || HORAIRES_DEFAUT.seuilAbsence,
                joursOuvres: lus['horaires.jours_ouvres']
                    ? lus['horaires.jours_ouvres'].split(',').filter(Boolean)
                    : HORAIRES_DEFAUT.joursOuvres,
            });
        } catch {
            setErreur("Impossible de charger les horaires. Les valeurs par défaut sont affichées.");
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(() => setMessage(null), 4000);
        return () => clearTimeout(t);
    }, [message]);

    const coherent = (() => {
        if (valeurs.fin <= valeurs.debut) return "L'heure de fin doit être après l'heure de début.";
        for (const p of valeurs.pauses) {
            if (!p.debut || !p.fin) return "Chaque pause doit avoir une heure de début et de fin.";
            if (p.fin <= p.debut) return "La fin d'une pause doit être après son début.";
            if (p.debut < valeurs.debut || p.fin > valeurs.fin)
                return "Chaque pause doit se situer à l'intérieur de la journée de cours.";
        }
        // Deux pauses ne peuvent pas se chevaucher.
        const triees = [...valeurs.pauses].sort((a, b) => a.debut.localeCompare(b.debut));
        for (let i = 1; i < triees.length; i++) {
            if (triees[i].debut < triees[i - 1].fin) return "Deux pauses se chevauchent.";
        }
        if (valeurs.dureeCours < 15 || valeurs.dureeCours > 240)
            return "La durée d'un cours doit être comprise entre 15 et 240 minutes.";
        if (valeurs.seuilAbsence <= valeurs.seuilRetard)
            return "Le seuil d'absence doit être supérieur au seuil de retard.";
        return null;
    })();

    const enregistrer = async () => {
        if (coherent) { setErreur(coherent); return; }
        setEnvoi(true);
        setErreur(null);
        try {
            await api.put('/api/parametrage/settings', [
                { categorie: CATEGORIE, cle: 'horaires.debut', valeur: valeurs.debut, type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.fin', valeur: valeurs.fin, type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.duree_cours', valeur: String(valeurs.dureeCours), type_valeur: 'NUMBER' },
                // Liste des pauses (source de vérité) + première pause en miroir
                // pour les écrans qui ne lisaient encore qu'une seule pause.
                { categorie: CATEGORIE, cle: 'horaires.pauses', valeur: formatPauses(valeurs.pauses), type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.pause_debut', valeur: valeurs.pauses[0]?.debut || '', type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.pause_fin', valeur: valeurs.pauses[0]?.fin || '', type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.seuil_retard', valeur: String(valeurs.seuilRetard), type_valeur: 'NUMBER' },
                { categorie: CATEGORIE, cle: 'horaires.seuil_absence', valeur: String(valeurs.seuilAbsence), type_valeur: 'NUMBER' },
                { categorie: CATEGORIE, cle: 'horaires.jours_ouvres', valeur: valeurs.joursOuvres.join(','), type_valeur: 'STRING' },
            ]);
            // Le cache des horaires doit être vidé, sinon l'emploi du temps
            // continue d'afficher les anciennes pauses tant que l'onglet reste
            // ouvert — exactement ce qui donnait « une seule pause 12h-13h »
            // alors que deux pauses venaient d'être enregistrées.
            invaliderCacheHoraires();
            setMessage('Horaires enregistrés. Ils s’appliquent immédiatement à l’emploi du temps et au pointage.');
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || "L'enregistrement a échoué. Rien n'a été modifié.");
        } finally {
            setEnvoi(false);
        }
    };

    const basculerJour = (jour: string) => {
        setValeurs(v => ({
            ...v,
            joursOuvres: v.joursOuvres.includes(jour)
                ? v.joursOuvres.filter(j => j !== jour)
                : [...JOURS.filter(j => v.joursOuvres.includes(j.cle) || j.cle === jour).map(j => j.cle)],
        }));
    };

    // Nombre de créneaux tenant dans la journée : rend le réglage concret.
    const creneaux = (() => {
        const min = (h: string) => Number(h.split(':')[0]) * 60 + Number(h.split(':')[1] || 0);
        const pauseTotale = valeurs.pauses.reduce((s, p) => s + Math.max(0, min(p.fin) - min(p.debut)), 0);
        const total = min(valeurs.fin) - min(valeurs.debut) - pauseTotale;
        return total > 0 ? Math.floor(total / valeurs.dureeCours) : 0;
    })();

    const ajouterPause = () => setValeurs(s => ({ ...s, pauses: [...s.pauses, { debut: '', fin: '' }] }));
    const retirerPause = (i: number) => setValeurs(s => ({ ...s, pauses: s.pauses.filter((_, idx) => idx !== i) }));
    const modifierPause = (i: number, champ: keyof Pause, v: string) =>
        setValeurs(s => ({ ...s, pauses: s.pauses.map((p, idx) => idx === i ? { ...p, [champ]: v } : p) }));

    if (chargement) {
        return (
            <Cadre>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={26} style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                </div>
            </Cadre>
        );
    }

    return (
        <Cadre>
            <Link href="/parametres" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', textDecoration: 'none', fontWeight: 600 }}>
                <ArrowLeft size={15} /> Paramètres
            </Link>

            <div>
                <h1 style={{ margin: 0, fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={22} style={{ color: '#0891b2' }} /> Emploi du temps
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Horaires de la journée, pause, et à partir de quand un élève est en retard.
                </p>
            </div>

            {message && <Bandeau ton="ok" icone={<Check size={16} />}>{message}</Bandeau>}
            {erreur && <Bandeau ton="ko" icone={<AlertTriangle size={16} />}>{erreur}</Bandeau>}

            <Section titre="Journée de cours" icone={<Clock size={16} />}>
                <Grille>
                    <Heure label="Début des cours" valeur={valeurs.debut} onChange={v => setValeurs(s => ({ ...s, debut: v }))} />
                    <Heure label="Fin des cours" valeur={valeurs.fin} onChange={v => setValeurs(s => ({ ...s, fin: v }))} />
                    <Nombre label="Durée d'un cours" unite="minutes" valeur={valeurs.dureeCours} min={15} max={240} pas={5}
                        onChange={v => setValeurs(s => ({ ...s, dureeCours: v }))} />
                </Grille>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Soit <strong>{creneaux} créneau{creneaux > 1 ? 'x' : ''}</strong> par jour, pause déduite.
                </p>
            </Section>

            <Section titre="Pauses" icone={<Coffee size={16} />}>
                {valeurs.pauses.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8' }}>
                        Aucune pause. La journée est continue.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {valeurs.pauses.map((p, i) => (
                            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 130px' }}>
                                    <Heure label={i === 0 ? 'Début' : `Début (pause ${i + 1})`} valeur={p.debut} onChange={v => modifierPause(i, 'debut', v)} />
                                </div>
                                <div style={{ flex: '1 1 130px' }}>
                                    <Heure label={i === 0 ? 'Fin' : `Fin (pause ${i + 1})`} valeur={p.fin} onChange={v => modifierPause(i, 'fin', v)} />
                                </div>
                                <button onClick={() => retirerPause(i)} title="Retirer cette pause" style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '40px', height: '40px', borderRadius: '10px', cursor: 'pointer',
                                    border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                                }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <button onClick={ajouterPause} style={{
                    alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '7px',
                    padding: '9px 15px', borderRadius: '10px', cursor: 'pointer',
                    border: '1px solid #a5f3fc', background: '#ecfeff', color: '#0e7490', fontSize: '13px', fontWeight: 700,
                }}>
                    <Plus size={15} /> Ajouter une pause
                </button>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Aucun cours n’est placé sur les créneaux de pause. Une école peut en avoir
                    plusieurs (récréation, déjeuner, pause de l’après-midi).
                </p>
            </Section>

            <Section titre="Retards et absences" icone={<Timer size={16} />}>
                <Grille>
                    <Nombre label="Retard à partir de" unite="minutes" valeur={valeurs.seuilRetard} min={1} max={120} pas={1}
                        onChange={v => setValeurs(s => ({ ...s, seuilRetard: v }))} />
                    <Nombre label="Compté absent à partir de" unite="minutes" valeur={valeurs.seuilAbsence} min={2} max={240} pas={5}
                        onChange={v => setValeurs(s => ({ ...s, seuilAbsence: v }))} />
                </Grille>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Un élève arrivé après <strong>{valeurs.seuilRetard} min</strong> est noté en retard ;
                    au-delà de <strong>{valeurs.seuilAbsence} min</strong>, il est compté absent.
                </p>
            </Section>

            <Section titre="Jours ouvrés" icone={<Clock size={16} />}>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                    {JOURS.map(j => {
                        const actif = valeurs.joursOuvres.includes(j.cle);
                        return (
                            <button key={j.cle} onClick={() => basculerJour(j.cle)} style={{
                                padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
                                fontSize: '13px', fontWeight: actif ? 800 : 600,
                                border: `1px solid ${actif ? '#0891b2' : '#e2e8f0'}`,
                                background: actif ? '#ecfeff' : '#fff',
                                color: actif ? '#0e7490' : '#64748b',
                            }}>{j.libelle}</button>
                        );
                    })}
                </div>
            </Section>

            {coherent && (
                <Bandeau ton="ko" icone={<AlertTriangle size={16} />}>{coherent}</Bandeau>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={enregistrer} disabled={envoi || !!coherent} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '12px 22px', borderRadius: '11px', border: 'none',
                    background: 'linear-gradient(135deg,#0e7490,#0891b2)', color: '#fff',
                    fontSize: '14px', fontWeight: 700,
                    cursor: envoi || coherent ? 'not-allowed' : 'pointer',
                    opacity: envoi || coherent ? 0.5 : 1,
                }}>
                    {envoi ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                    Enregistrer
                </button>
            </div>

            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </Cadre>
    );
}

const JOURS = [
    { cle: 'LUNDI', libelle: 'Lundi' },
    { cle: 'MARDI', libelle: 'Mardi' },
    { cle: 'MERCREDI', libelle: 'Mercredi' },
    { cle: 'JEUDI', libelle: 'Jeudi' },
    { cle: 'VENDREDI', libelle: 'Vendredi' },
    { cle: 'SAMEDI', libelle: 'Samedi' },
    { cle: 'DIMANCHE', libelle: 'Dimanche' },
];

/* ────────────────────────────── présentation ────────────────────────────── */

function Cadre({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: '17px', maxWidth: '900px', margin: '0 auto' }}>
            {children}
        </div>
    );
}

function Section({ titre, icone, children }: { titre: string; icone: React.ReactNode; children: React.ReactNode }) {
    return (
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#0891b2' }}>{icone}</span> {titre}
            </h2>
            {children}
        </section>
    );
}

function Grille({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'grid', gap: '13px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {children}
        </div>
    );
}

function Heure({ label, valeur, onChange }: { label: string; valeur: string; onChange: (v: string) => void }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={etiquette}>{label}</span>
            <input type="time" value={valeur} onChange={e => onChange(e.target.value)} style={champ} />
        </label>
    );
}

function Nombre({ label, unite, valeur, min, max, pas, onChange }: {
    label: string; unite: string; valeur: number; min: number; max: number; pas: number;
    onChange: (v: number) => void;
}) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={etiquette}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" value={valeur} min={min} max={max} step={pas}
                    onChange={e => onChange(Number(e.target.value))} style={{ ...champ, flex: 1 }} />
                <span style={{ fontSize: '12.5px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{unite}</span>
            </div>
        </label>
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

const etiquette: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: '#334155' };
const champ: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none', color: '#0f172a',
};
