'use client';

/**
 * Récupération des cartes — impression groupée par classe.
 *
 * L'admin choisit une classe, toutes les cartes de la classe sont
 * composées dans UN SEUL document imprimable (une seule confirmation
 * d'impression, pas une par carte — aucun navigateur ne permet de
 * déclencher plusieurs impressions sans confirmation à chaque fois).
 * Plusieurs cartes par feuille A4 (planche à découper).
 *
 * Réutilise : useEleves (roster + liste des classes), BadgeCarte (rendu
 * de la carte, avec qrTexteOverride pour éviter un appel réseau par
 * élève), le motif #print-area/@media print déjà utilisé dans
 * comptabilite/exports et comptabilite/rapports.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, IdCard, Printer, Loader2, Sparkles, Users, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useEleves } from '@/hooks/useEleves';
import api from '@/lib/api';
import BadgeCarte from '@/components/BadgeCarte';

// Largement au-dessus de l'effectif d'une classe réelle — récupère la
// classe entière en un seul appel plutôt que la pagination par défaut.
const ROSTER_PAGE_SIZE = 500;

// Aperçu à l'écran paginé (une classe peut avoir 200+ élèves) — afficher
// les 200+ BadgeCarte d'un coup (animations, QR, photos) surchargerait la
// page sur un poste modeste. L'impression, elle, contient TOUJOURS la
// classe entière (voir #print-area plus bas) : seul l'aperçu est limité.
const PREVIEW_PAGE_SIZE = 9;

// Largeur cible d'une carte à l'impression (cm) — la hauteur suit le
// ratio réellement mesuré du badge rendu (voir useEffect plus bas), pas
// une valeur codée en dur : fonctionne quel que soit le format choisi
// dans Paramètres > Cartes (portrait, paysage, compact).
const LARGEUR_IMPRESSION_CM = 5.6;

function urlPhoto(url: string | null | undefined): string | null {
    if (!url) return null;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function CartesClassePage() {
    const { etablissementId, anneeId } = useApp();
    const [selectedClasse, setSelectedClasse] = useState<string | null>(null);

    const { eleves, classes, loading: elevesLoading } = useEleves({
        etablissementId, anneeId, classeCode: selectedClasse, pageSize: ROSTER_PAGE_SIZE,
    });

    // Pagination de l'APERÇU uniquement — l'impression (#print-area plus
    // bas) porte toujours sur `eleves` en entier, jamais sur cette page.
    const [previewPage, setPreviewPage] = useState(1);
    useEffect(() => { setPreviewPage(1); }, [selectedClasse]);
    const previewTotalPages = Math.max(1, Math.ceil(eleves.length / PREVIEW_PAGE_SIZE));
    const previewEleves = eleves.slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE);

    // Contenu QR de toute la classe en UN appel (pas un par élève).
    const [qrMap, setQrMap] = useState<Record<string, string>>({});
    const [qrLoading, setQrLoading] = useState(false);

    useEffect(() => {
        if (!selectedClasse || eleves.length === 0) { setQrMap({}); return; }
        let annule = false;
        setQrLoading(true);
        const matricules = eleves.map(e => e.matricule).join(',');
        api.get('/api/cartes/contenu-qr-lot', { params: { matricules } })
            .then(res => { if (!annule) setQrMap(res.data?.resultats || {}); })
            .catch(() => { if (!annule) setQrMap({}); })
            .finally(() => { if (!annule) setQrLoading(false); });
        return () => { annule = true; };
    }, [selectedClasse, eleves]);

    // Toutes les photos doivent être chargées avant d'imprimer — sinon des
    // cadres vides sortiraient sur le papier (le setTimeout fixe utilisé
    // pour UNE carte n'est pas fiable pour 30-50 cartes).
    const [photosReady, setPhotosReady] = useState(false);

    useEffect(() => {
        setPhotosReady(false);
        if (!selectedClasse || eleves.length === 0) return;
        const urls = eleves.map(e => urlPhoto(e.photo_url)).filter((u): u is string => !!u);
        if (urls.length === 0) { setPhotosReady(true); return; }
        let annule = false;
        Promise.all(urls.map(src => new Promise<void>(resolve => {
            const img = new window.Image();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // une photo cassée ne bloque pas tout le lot
            img.src = src;
        }))).then(() => { if (!annule) setPhotosReady(true); });
        return () => { annule = true; };
    }, [selectedClasse, eleves]);

    // Échelle d'impression calculée sur la taille RÉELLE du premier badge
    // rendu (mesure DOM, pas une dimension supposée) — même technique que
    // pour l'aperçu de bulletin mobile (transform:scale sur un cadre
    // dimensionné à la taille réduite, pas la taille d'origine).
    const premiereCarteRef = useRef<HTMLDivElement>(null);
    const [echelle, setEchelle] = useState<number | null>(null);
    // Hauteur réduite de la cellule d'impression (cm) — DOIT être posée
    // explicitement sur `.carte-print-cell` : `transform:scale` ne change
    // jamais l'espace réservé en mise en page du nœud qu'il transforme
    // (même piège que l'aperçu de bulletin), donc sans hauteur explicite
    // la cellule garde la hauteur NON réduite du badge -> grands vides
    // entre les rangées.
    const [hauteurImpressionCm, setHauteurImpressionCm] = useState<number | null>(null);

    useEffect(() => {
        setEchelle(null);
        setHauteurImpressionCm(null);
        if (!photosReady || eleves.length === 0) return;
        const id = requestAnimationFrame(() => {
            const el = premiereCarteRef.current;
            if (!el) return;
            const largeurPx = el.offsetWidth;
            const hauteurPx = el.offsetHeight;
            if (!largeurPx || !hauteurPx) return;
            const echelleCalculee = LARGEUR_IMPRESSION_CM / (largeurPx / 96 * 2.54);
            setEchelle(echelleCalculee);
            setHauteurImpressionCm((hauteurPx / 96 * 2.54) * echelleCalculee);
        });
        return () => cancelAnimationFrame(id);
    }, [photosReady, eleves.length]);

    const pret = !!selectedClasse && !elevesLoading && !qrLoading && photosReady && !!echelle && !!hauteurImpressionCm && eleves.length > 0;

    const classeInfo = classes.find(c => c.code === selectedClasse);

    // `#print-area` DOIT rester en dehors du conteneur `.no-print` : il est
    // masqué à l'impression (display:none !important), et un enfant ne peut
    // jamais redevenir visible si son parent est display:none.
    return (
        <>
        <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' }} className="no-print">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Link href="/eleves" className="btn btn-outline btn-sm">
                    <ArrowLeft size={16} /> Retour aux élèves
                </Link>
            </div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '20px',
                    padding: '32px', color: 'white', marginBottom: '28px',
                    display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
                }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <IdCard size={28} />
                </div>
                <div style={{ flex: 1, minWidth: '240px' }}>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Récupération des cartes <Sparkles size={20} />
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '14.5px', opacity: 0.9 }}>
                        Choisissez une classe, tout est prêt à imprimer — une seule confirmation pour toute la classe.
                    </p>
                </div>
            </motion.div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header"><h5>Quelle classe ?</h5></div>
                <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {classes.map(cls => (
                        <button key={cls.classe_id} onClick={() => setSelectedClasse(cls.code)} style={{
                            padding: '10px 18px', borderRadius: '12px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                            border: selectedClasse === cls.code ? '2px solid #4f46e5' : '1px solid var(--border-light)',
                            background: selectedClasse === cls.code ? '#eef2ff' : 'white',
                            color: selectedClasse === cls.code ? '#4f46e5' : 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                            <Users size={14} /> {cls.libelle} ({cls.effectif_actuel})
                        </button>
                    ))}
                    {classes.length === 0 && <p style={{ color: 'var(--text-muted)', margin: 0 }}>Aucune classe trouvée.</p>}
                </div>
            </div>

            {selectedClasse && (
                <div style={{
                    display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '14px 18px',
                    borderRadius: '12px', background: '#fffbeb', border: '1px solid #fde68a', marginBottom: '20px',
                }}>
                    <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '13px', color: '#92400e', lineHeight: 1.5 }}>
                        <strong>Chargez du papier Bristol</strong> (carton fin/cartouche rigide) dans l&apos;imprimante avant de lancer l&apos;impression — ces cartes ne sont pas conçues pour du papier ordinaire, qui ne donnerait pas une carte assez rigide pour un usage quotidien.
                    </p>
                </div>
            )}

            {selectedClasse && (
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <h5 style={{ margin: 0 }}>
                            {classeInfo?.libelle || selectedClasse} — {eleves.length} carte(s)
                        </h5>
                        <button onClick={() => window.print()} disabled={!pret}
                            style={{
                                padding: '10px 22px', borderRadius: '12px', border: 'none', fontSize: '14px', fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: pret ? 'pointer' : 'not-allowed',
                                background: pret ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : '#e2e8f0',
                                color: pret ? 'white' : '#94a3b8',
                            }}>
                            {pret ? <Printer size={17} /> : <Loader2 size={17} className="animate-spin" />}
                            {pret ? `Imprimer les ${eleves.length} cartes` : 'Préparation des cartes…'}
                        </button>
                    </div>

                    <div style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center' }}>
                        {previewEleves.map((eleve, i) => (
                            <div key={eleve.eleve_id} ref={i === 0 ? premiereCarteRef : undefined}>
                                <BadgeCarte
                                    agent={{
                                        nom: eleve.nom,
                                        prenom: eleve.prenom,
                                        matricule: eleve.matricule,
                                        photo_url: eleve.photo_url,
                                        role: 'ÉLÈVE',
                                        classe: eleve.classe_code || undefined,
                                        date_naissance: eleve.date_naissance,
                                        adresse: eleve.adresse,
                                        groupe_sanguin: eleve.groupe_sanguin,
                                    }}
                                    id={`badge-classe-${eleve.eleve_id}`}
                                    qrTexteOverride={qrMap[eleve.matricule]}
                                />
                            </div>
                        ))}
                    </div>

                    {previewTotalPages > 1 && (
                        <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '4px 20px 20px' }}>
                            <button onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage === 1}>
                                <ChevronLeft size={16} />
                            </button>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '0 10px' }}>
                                Page {previewPage} / {previewTotalPages} — aperçu seulement, l&apos;impression porte sur les {eleves.length} cartes
                            </span>
                            <button onClick={() => setPreviewPage(p => Math.min(previewTotalPages, p + 1))} disabled={previewPage === previewTotalPages}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* ═══ ZONE D'IMPRESSION — plusieurs cartes par feuille A4 ═══
            Cachée à l'écran (le rendu ci-dessus sert d'aperçu), visible
            uniquement au moment d'imprimer. En dehors du conteneur
            `.no-print` ci-dessus : un enfant ne peut pas redevenir visible
            si son parent est display:none. Échelle appliquée via variable
            CSS calculée sur la taille réelle mesurée du badge (voir
            useEffect plus haut) — fonctionne quel que soit le format de
            carte configuré (portrait/paysage/compact). */}
        {selectedClasse && echelle && hauteurImpressionCm && (
                <div id="print-area" style={{ display: 'none' }}>
                    <div className="cartes-print-grid" style={{ '--echelle-carte': echelle, '--hauteur-carte-cm': hauteurImpressionCm } as React.CSSProperties}>
                        {eleves.map(eleve => (
                            <div className="carte-print-cell" key={`print-${eleve.eleve_id}`}>
                                <BadgeCarte
                                    agent={{
                                        nom: eleve.nom,
                                        prenom: eleve.prenom,
                                        matricule: eleve.matricule,
                                        photo_url: eleve.photo_url,
                                        role: 'ÉLÈVE',
                                        classe: eleve.classe_code || undefined,
                                        date_naissance: eleve.date_naissance,
                                        adresse: eleve.adresse,
                                        groupe_sanguin: eleve.groupe_sanguin,
                                    }}
                                    id={`badge-print-${eleve.eleve_id}`}
                                    qrTexteOverride={qrMap[eleve.matricule]}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 1cm; }
                    body * { visibility: hidden; }
                    #print-area, #print-area * { visibility: visible; }
                    #print-area {
                        display: block !important;
                        position: absolute; left: 0; top: 0; width: 100%;
                    }
                    /* Sans ça, les navigateurs n'impriment par défaut aucune
                       couleur/dégradé de fond (économie d'encre) — les cartes
                       sortiraient sans leur bandeau de couleur. */
                    #print-area, #print-area * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    /* globals.css a une règle globale d'impression (économie
                       d'encre) qui aplatit tout [style*="linear-gradient"] en
                       gris clair — volontaire et correcte pour les rapports,
                       mais pas pour une carte d'identité, dont la couleur fait
                       partie de l'identité visuelle. Restaurée ICI seulement
                       (sélecteur plus spécifique), pas dans la règle globale,
                       qui reste inchangée pour le reste de l'application. */
                    #print-area [style*="linear-gradient"] {
                        background: var(--bg-gradient-carte) !important;
                        color: white !important;
                    }
                    .no-print { display: none !important; }
                    .cartes-print-grid {
                        display: grid;
                        grid-template-columns: repeat(3, ${LARGEUR_IMPRESSION_CM}cm);
                        gap: 0.6cm;
                        justify-content: center;
                    }
                    .carte-print-cell {
                        width: ${LARGEUR_IMPRESSION_CM}cm;
                        height: calc(var(--hauteur-carte-cm) * 1cm);
                        overflow: hidden;
                        page-break-inside: avoid;
                    }
                    .carte-print-cell > div {
                        transform: scale(var(--echelle-carte));
                        transform-origin: top left;
                    }
                }
            `}</style>
        </>
    );
}
