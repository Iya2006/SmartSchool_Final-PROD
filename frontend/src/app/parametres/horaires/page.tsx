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
    AlertTriangle, ArrowLeft, Check, Clock, Coffee, Loader2, Save, Timer,
} from 'lucide-react';
import api from '@/lib/api';
import { HORAIRES_DEFAUT, type Horaires } from '@/lib/horaires';

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
            setValeurs({
                debut: lus['horaires.debut'] || HORAIRES_DEFAUT.debut,
                fin: lus['horaires.fin'] || HORAIRES_DEFAUT.fin,
                dureeCours: Number(lus['horaires.duree_cours']) || HORAIRES_DEFAUT.dureeCours,
                pauseDebut: lus['horaires.pause_debut'] || HORAIRES_DEFAUT.pauseDebut,
                pauseFin: lus['horaires.pause_fin'] || HORAIRES_DEFAUT.pauseFin,
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
        if (valeurs.pauseFin <= valeurs.pauseDebut) return "La fin de pause doit être après son début.";
        if (valeurs.pauseDebut < valeurs.debut || valeurs.pauseFin > valeurs.fin)
            return "La pause doit se situer à l'intérieur de la journée de cours.";
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
                { categorie: CATEGORIE, cle: 'horaires.pause_debut', valeur: valeurs.pauseDebut, type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.pause_fin', valeur: valeurs.pauseFin, type_valeur: 'STRING' },
                { categorie: CATEGORIE, cle: 'horaires.seuil_retard', valeur: String(valeurs.seuilRetard), type_valeur: 'NUMBER' },
                { categorie: CATEGORIE, cle: 'horaires.seuil_absence', valeur: String(valeurs.seuilAbsence), type_valeur: 'NUMBER' },
                { categorie: CATEGORIE, cle: 'horaires.jours_ouvres', valeur: valeurs.joursOuvres.join(','), type_valeur: 'STRING' },
            ]);
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
        const total = min(valeurs.fin) - min(valeurs.debut) - (min(valeurs.pauseFin) - min(valeurs.pauseDebut));
        return total > 0 ? Math.floor(total / valeurs.dureeCours) : 0;
    })();

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

            <Section titre="Pause" icone={<Coffee size={16} />}>
                <Grille>
                    <Heure label="Début de la pause" valeur={valeurs.pauseDebut} onChange={v => setValeurs(s => ({ ...s, pauseDebut: v }))} />
                    <Heure label="Fin de la pause" valeur={valeurs.pauseFin} onChange={v => setValeurs(s => ({ ...s, pauseFin: v }))} />
                </Grille>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    Aucun cours n’est placé sur ce créneau.
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
