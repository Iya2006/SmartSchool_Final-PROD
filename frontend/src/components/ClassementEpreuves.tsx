'use client';

/**
 * Classement sur une épreuve — portails élève et parent.
 *
 * Le backend expose depuis longtemps `/epreuves` (les compositions et devoirs
 * consultables d'une période) et `/classement` (le résultat de l'élève sur une
 * sélection d'épreuves, avec son rang). Aucun écran ne les appelait : la
 * famille ne pouvait voir que la liste brute des notes et le bulletin publié.
 *
 * Un composant unique pour les deux portails, appelé avec des URL différentes —
 * dupliquer cet écran garantirait qu'une correction ne soit faite que d'un côté.
 *
 * Ce que la famille voit ici n'apparaît que si l'épreuve est ENTIÈREMENT
 * centralisée : c'est le backend qui filtre. Un classement calculé sur une
 * composition dont la moitié des matières manque donnerait un rang faux, que le
 * parent prendrait pour définitif.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Award, BarChart3, Loader2, TrendingUp } from 'lucide-react';
import api from '@/lib/api';

interface Epreuve {
    cle: string;
    libelle: string;
    type: string;
    date: string | null;
    evaluation_ids: number[];
    nb_matieres: number;
}

interface LigneMatiere {
    matiere: string;
    moyenne: number | null;
    coefficient: number;
    appreciation?: string | null;
}

interface Resultat {
    /** Le backend renvoie `moyenne_generale` (services/notation.py::resultat_eleve_sur_epreuves). */
    moyenne_generale: number | null;
    rang: number | null;
    effectif: number | null;
    mention?: string | null;
    moyenne_classe?: number | null;
    echelle?: number | null;
    matieres?: LigneMatiere[];
}

interface Props {
    /** Base des deux appels, ex. `/api/portail-eleve/12` ou
     *  `/api/portail-parent/3/enfant/12`. L'identifiant vient toujours du
     *  contexte d'authentification, jamais d'une saisie. */
    baseUrl: string;
    // Peut être null tant que les périodes de l'école ne sont pas chargées :
    // le serveur choisit alors celle en cours plutôt qu'un identifiant deviné.
    trimestreId: number | null;
    couleur: string;
    /** Libellé de la période, pour que l'écran dise « 2ème Trimestre » et non « 2 ». */
    periodeLibelle?: string;
}

export default function ClassementEpreuves({ baseUrl, trimestreId, couleur, periodeLibelle }: Props) {
    const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
    const [selection, setSelection] = useState<string | null>(null);
    const [resultat, setResultat] = useState<Resultat | null>(null);
    const [chargementListe, setChargementListe] = useState(true);
    const [chargementResultat, setChargementResultat] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    // ── Épreuves consultables de la période ───────────────────────────────
    useEffect(() => {
        let annule = false;
        setChargementListe(true);
        setErreur(null);
        api.get(`${baseUrl}/epreuves${trimestreId ? `?trimestre_id=${trimestreId}` : ''}`)
            .then(res => {
                if (annule) return;
                const liste: Epreuve[] = res.data?.epreuves || [];
                setEpreuves(liste);
                setSelection(liste.length ? liste[liste.length - 1].cle : null);
            })
            .catch(err => {
                if (annule) return;
                setEpreuves([]);
                setErreur(err?.response?.data?.detail || "Impossible de charger les épreuves.");
            })
            .finally(() => { if (!annule) setChargementListe(false); });
        return () => { annule = true; };
    }, [baseUrl, trimestreId]);

    // ── Résultat sur l'épreuve choisie ────────────────────────────────────
    const charger = useCallback((epreuve: Epreuve | undefined) => {
        if (!epreuve) { setResultat(null); return; }
        setChargementResultat(true);
        setErreur(null);
        const ids = epreuve.evaluation_ids.join(',');
        api.get(`${baseUrl}/classement?evaluation_ids=${ids}${trimestreId ? `&trimestre_id=${trimestreId}` : ''}`)
            .then(res => setResultat(res.data))
            .catch(err => {
                setResultat(null);
                setErreur(err?.response?.data?.detail || "Impossible de calculer le classement.");
            })
            .finally(() => setChargementResultat(false));
    }, [baseUrl, trimestreId]);

    useEffect(() => {
        if (!selection) { setResultat(null); return; }
        charger(epreuves.find(e => e.cle === selection));
    }, [selection, epreuves, charger]);

    // ── Rendu ─────────────────────────────────────────────────────────────
    if (chargementListe) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                <Loader2 size={28} color={couleur} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (!epreuves.length) {
        return (
            <div style={{
                textAlign: 'center', padding: '40px 24px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: '16px',
            }}>
                <Award size={36} style={{ color: '#cbd5e1' }} />
                <p style={{ fontWeight: 700, color: '#475569', margin: '12px 0 4px' }}>
                    Aucun classement disponible pour le moment
                </p>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, maxWidth: '460px', marginInline: 'auto' }}>
                    Un classement n&apos;apparaît que lorsque <strong>toutes les matières</strong> de
                    l&apos;épreuve ont été remontées par les enseignants. Un rang calculé sur une
                    composition incomplète serait faux.
                </p>
                {erreur && <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '12px' }}>{erreur}</p>}
            </div>
        );
    }

    const epreuveActive = epreuves.find(e => e.cle === selection);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={18} style={{ color: couleur }} /> Classement par épreuve
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Choisissez une composition ou un devoir{periodeLibelle ? ` — ${periodeLibelle}` : ''}.
                </p>
            </div>

            {/* Sélecteur : défilement horizontal contrôlé, jamais de débordement */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', WebkitOverflowScrolling: 'touch' }}>
                {epreuves.map(e => {
                    const actif = e.cle === selection;
                    return (
                        <button
                            key={e.cle}
                            onClick={() => setSelection(e.cle)}
                            style={{
                                flex: '0 0 auto', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer',
                                border: `1px solid ${actif ? couleur : '#e2e8f0'}`,
                                background: actif ? `${couleur}12` : '#fff',
                                color: actif ? couleur : '#475569',
                                fontWeight: actif ? 800 : 600, fontSize: '13px', textAlign: 'left',
                            }}
                        >
                            <span style={{ display: 'block' }}>{e.libelle}</span>
                            <span style={{ display: 'block', fontSize: '11px', opacity: 0.75, fontWeight: 600 }}>
                                {e.type}{e.date ? ` · ${new Date(e.date).toLocaleDateString('fr-FR')}` : ''}
                            </span>
                        </button>
                    );
                })}
            </div>

            {chargementResultat ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '36px' }}>
                    <Loader2 size={24} color={couleur} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
            ) : erreur ? (
                <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#b91c1c', fontSize: '13px' }}>
                    {erreur}
                </div>
            ) : !resultat ? (
                <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#64748b', fontSize: '13px' }}>
                    Aucun résultat sur cette épreuve.
                </div>
            ) : (
                <>
                    {/* Cartes de synthèse — grille fluide, lisible dès 320 px */}
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <Carte titre="Moyenne" valeur={resultat.moyenne_generale !== null && resultat.moyenne_generale !== undefined ? `${resultat.moyenne_generale}` : '—'} accent={couleur} appoint={resultat.echelle ? `/${resultat.echelle}` : undefined} />
                        <Carte
                            titre="Rang"
                            valeur={resultat.rang ? `${resultat.rang}` : '—'}
                            accent={couleur}
                            appoint={resultat.effectif ? `sur ${resultat.effectif}` : undefined}
                        />
                        {resultat.moyenne_classe !== null && resultat.moyenne_classe !== undefined && (
                            <Carte titre="Moyenne de la classe" valeur={`${resultat.moyenne_classe}`} accent="#64748b" />
                        )}
                        {resultat.mention && <Carte titre="Mention" valeur={resultat.mention} accent={couleur} />}
                    </div>

                    {/* Détail par matière */}
                    {resultat.matieres && resultat.matieres.length > 0 && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BarChart3 size={15} style={{ color: couleur }} />
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Détail par matière {epreuveActive ? `— ${epreuveActive.libelle}` : ''}
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '340px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <Th>Matière</Th>
                                            <Th align="center">Coef.</Th>
                                            <Th align="right">Moyenne</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resultat.matieres.map((m, i) => (
                                            <tr key={`${m.matiere}-${i}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '11px 18px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{m.matiere}</td>
                                                <td style={{ padding: '11px 18px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>{m.coefficient}</td>
                                                <td style={{ padding: '11px 18px', fontSize: '13px', fontWeight: 800, color: couleur, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {m.moyenne !== null && m.moyenne !== undefined ? m.moyenne : '—'}
                                                    
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function Carte({ titre, valeur, accent, appoint }: { titre: string; valeur: string; accent: string; appoint?: string }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titre}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '22px', fontWeight: 800, color: accent, lineHeight: 1 }}>{valeur}</span>
                {appoint && <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>{appoint}</span>}
            </div>
        </div>
    );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
    return (
        <th style={{
            padding: '10px 18px', fontSize: '10px', fontWeight: 800, color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: align, whiteSpace: 'nowrap',
        }}>{children}</th>
    );
}
