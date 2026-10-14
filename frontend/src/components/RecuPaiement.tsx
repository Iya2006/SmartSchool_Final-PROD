'use client';

/**
 * Reçu de paiement à l'écran — même modèle, mêmes données et même mise en
 * page que le PDF du serveur (backend/app/core/recu_paiement.py), qui reste
 * la version imprimée. Les données viennent de GET /api/finance/recu/{id}.
 */
import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE_URL } from '@/lib/api';
import { modePaiementLabel } from '@/lib/modesPaiement';

export type RecuDonnees = {
    paiement_id: number;
    numero_recu: string;
    statut: string;
    date_paiement: string | null;
    /** null pour un paiement antidaté : l'heure de saisie n'est pas celle du versement. */
    heure: string | null;
    montant: number;
    montant_en_lettres: string;
    /** Phrase complète déjà accordée par le serveur (« Deux millions de francs
     * guinéens »), sans point final. Absente d'un serveur plus ancien. */
    somme_en_lettres?: string;
    devise: string;
    mode_paiement_libelle: string;
    reference_externe: string | null;
    tranche: { numero: number; total: number; libelle: string } | null;
    code_verification: string;
    /** Adresse complète du QR, calculée par le serveur : la MÊME que sur le PDF. */
    url_verification?: string;
    facture: {
        numero_facture: string; motif: string; montant_total: number;
        deja_paye: number; paye_a_date: number; reste_a_date: number;
    };
    anterieurs: { numero_recu: string; date_paiement: string | null; montant: number; mode_paiement: string }[];
    eleve: { nom: string; prenom: string; matricule: string; classe: string };
    annee_libelle: string | null;
    parent: { nom: string | null; telephone: string | null };
    etablissement: {
        nom: string; slogan: string; adresse: string; telephone: string; email: string;
        logo_url: string | null; cachet_url: string | null; signature_url: string | null; couleur: string;
    };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Accepte la réponse de GET /api/finance/recu/{id} telle qu'elle arrive —
 * y compris d'un serveur PAS ENCORE redéployé, qui renvoie l'ancien format
 * ({ recu, facture.type_frais, historique_paiements }, sans `anterieurs` ni
 * code de vérification). Le site et le serveur se déploient séparément :
 * sans cette passerelle, `recu.anterieurs.length` faisait planter toute la
 * page (écran « This page couldn't load ») dès que le site était en avance.
 * Renvoie null si la réponse est inexploitable.
 */
export function normaliserRecu(brut: any): RecuDonnees | null {
    if (!brut || typeof brut !== 'object') return null;
    const ancien = brut.recu && typeof brut.recu === 'object' ? brut.recu : {};
    const f = brut.facture || {};
    const e = brut.eleve || {};
    const et = brut.etablissement || {};
    const nombre = (v: any, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d));
    const numero = brut.numero_recu ?? ancien.numero_recu;
    if (!numero) return null;
    const montant = nombre(brut.montant ?? ancien.montant);
    const total = nombre(f.montant_total);
    const payeADate = nombre(f.paye_a_date ?? f.montant_paye);
    const anterieurs = Array.isArray(brut.anterieurs)
        ? brut.anterieurs
        : (Array.isArray(brut.historique_paiements) ? brut.historique_paiements : [])
            .filter((h: any) => h && h.numero_recu !== numero);
    return {
        paiement_id: nombre(brut.paiement_id),
        numero_recu: String(numero),
        statut: brut.statut || 'VALIDE',
        date_paiement: brut.date_paiement ?? ancien.date_paiement ?? null,
        heure: brut.heure ?? null,
        montant,
        montant_en_lettres: brut.montant_en_lettres || '',
        somme_en_lettres: brut.somme_en_lettres,
        devise: brut.devise || ancien.devise || 'GNF',
        mode_paiement_libelle: brut.mode_paiement_libelle
            || ((brut.mode_paiement || ancien.mode_paiement) ? modePaiementLabel(brut.mode_paiement || ancien.mode_paiement) : '—'),
        reference_externe: brut.reference_externe ?? ancien.reference_externe ?? null,
        tranche: brut.tranche && typeof brut.tranche === 'object' ? brut.tranche : null,
        code_verification: brut.code_verification || '',
        url_verification: brut.url_verification,
        facture: {
            numero_facture: f.numero_facture || '',
            motif: f.motif || f.type_frais || 'Frais scolaires',
            montant_total: total,
            deja_paye: nombre(f.deja_paye, Math.max(0, payeADate - montant)),
            paye_a_date: payeADate,
            reste_a_date: nombre(f.reste_a_date ?? f.montant_restant, Math.max(0, total - payeADate)),
        },
        anterieurs: anterieurs.map((a: any) => ({
            numero_recu: String(a.numero_recu ?? ''),
            date_paiement: a.date_paiement ?? null,
            montant: nombre(a.montant),
            mode_paiement: a.mode_paiement || '—',
        })),
        eleve: { nom: e.nom || '', prenom: e.prenom || '', matricule: e.matricule || '', classe: e.classe || '' },
        annee_libelle: brut.annee_libelle ?? null,
        parent: { nom: brut.parent?.nom ?? null, telephone: brut.parent?.telephone ?? null },
        etablissement: {
            nom: et.nom || 'Établissement', slogan: et.slogan || '', adresse: et.adresse || '',
            telephone: et.telephone || '', email: et.email || '',
            logo_url: et.logo_url ?? null, cachet_url: et.cachet_url ?? null, signature_url: et.signature_url ?? null,
            couleur: et.couleur || '',
        },
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ENCRE = '#0f172a';
const GRIS = '#64748b';
const BORD = '#e2e8f0';
const FOND = '#f8fafc';
const VERT = '#059669';
const AMBRE = '#d97706';
const ROUGE = '#dc2626';

/** « 2 000 000 », ou « 1 250,50 » quand le montant a des centimes (dollars,
 * euros) : arrondi à l'entier, un reçu de 1 250,50 USD affichait 1 251. */
export const formaterMontant = (n: number | null | undefined) => {
    const v = Math.round((n || 0) * 100) / 100;
    const [entier, decimales] = Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 2).split('.');
    return `${v < 0 ? '-' : ''}${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${decimales ? `,${decimales}` : ''}`;
};

const COULEUR_DEFAUT = '#1e3a8a';

/** Couleur de l'école, seulement si c'est un hexadécimal valide : elle est
 * injectée telle quelle dans des dégradés et `color-mix`, où une valeur
 * inattendue fait disparaître le bandeau au lieu de retomber sur le bleu. */
export const couleurEcole = (c: string | null | undefined): string =>
    c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : COULEUR_DEFAUT;

const dateFr = (iso: string | null) => {
    if (!iso) return '—';
    const [a, m, j] = iso.slice(0, 10).split('-');
    return j && m && a ? `${j}/${m}/${a}` : iso;
};

/** Assombrit une couleur hexadécimale (facteur < 1). */
function assombrir(hex: string, facteur: number): string {
    const v = hex.replace('#', '');
    const plein = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
    const n = parseInt(plein, 16);
    if (Number.isNaN(n)) return hex;
    const r = Math.round(((n >> 16) & 255) * facteur);
    const g = Math.round(((n >> 8) & 255) * facteur);
    const b = Math.round((n & 255) * facteur);
    return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Même adresse que celle du QR imprimé sur le PDF (voir url_verification). */
export function urlVerificationRecu(numero: string, code: string): string {
    const origine = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origine}/verifier-recu?${new URLSearchParams({ n: numero, c: code }).toString()}`;
}

function imageUrl(url: string | null): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

const styleTitreSection = (couleur: string): React.CSSProperties => (
    { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', color: couleur, margin: '0 0 8px' }
);

function Carte({ titre, lignes, couleur, couleurFoncee }: { titre: string; lignes: [string, string][]; couleur: string; couleurFoncee: string }) {
    return (
        <div style={{ position: 'relative', background: FOND, border: `1px solid ${BORD}`, borderRadius: 12, padding: '12px 14px 12px 18px', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: couleur }} />
            <p style={styleTitreSection(couleurFoncee)}>{titre}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {lignes.map(([e, v]) => (
                    <div key={e}>
                        <p style={{ fontSize: 10.5, color: GRIS, margin: 0 }}>{e}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: ENCRE, margin: '1px 0 0', overflowWrap: 'anywhere' }}>{v}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function RecuPaiement({ recu }: { recu: RecuDonnees }) {
    const etab = recu.etablissement;
    const fac = recu.facture;
    const P = couleurEcole(etab.couleur);
    const PF = assombrir(P, 0.72);
    const annule = (recu.statut || '').toUpperCase() === 'ANNULE';
    const reste = fac.reste_a_date || 0;
    const ratio = fac.montant_total > 0 ? Math.max(0, Math.min(1, fac.paye_a_date / fac.montant_total)) : 0;
    // Jamais « 100 % » tant qu'il reste quelque chose à payer : arrondi,
    // 99,6 % s'affichait « PAYÉ À 100 % » à côté d'un reste non nul.
    const pourcentage = reste > 0 ? Math.min(99, Math.floor(ratio * 100)) : 100;
    const devise = recu.devise || 'GNF';
    const [logoOk, setLogoOk] = useState(true);
    const [urlQrLocale, setUrlQrLocale] = useState('');
    useEffect(() => {
        setUrlQrLocale(recu.code_verification ? urlVerificationRecu(recu.numero_recu, recu.code_verification) : '');
    }, [recu.numero_recu, recu.code_verification]);
    // L'adresse du serveur prime : c'est celle du QR imprimé sur le PDF.
    // window.location.origin n'est qu'un repli pour un serveur plus ancien —
    // derrière un autre domaine (ou en local), il donnait un QR différent.
    const urlQr = recu.url_verification || urlQrLocale;
    useEffect(() => { setLogoOk(true); }, [etab.logo_url]);

    const initiales = useMemo(() => (etab.nom || '')
        .replace(/-/g, ' ').split(/\s+/).filter(m => /^[\p{L}\p{N}]/u.test(m)).slice(0, 3)
        .map(m => m[0]).join('').toUpperCase() || 'S', [etab.nom]);

    // Phrase du serveur quand il la fournit : elle est accordée (« un franc
    // guinéen », « dollars US et cinquante cents »), ce que le repli ci-dessous
    // ne sait pas faire.
    const lettres = recu.somme_en_lettres
        ? `Arrêté le présent reçu à la somme de : ${recu.somme_en_lettres.charAt(0).toLowerCase()}${recu.somme_en_lettres.slice(1)}.`
        : recu.montant_en_lettres
            ? `Arrêté le présent reçu à la somme de : ${recu.montant_en_lettres} ${devise.toUpperCase() === 'GNF' ? 'francs guinéens' : `(${devise})`}.`
            : ''; // ancien serveur : pas de montant en lettres, pas de phrase tronquée

    const contacts = [etab.adresse, etab.telephone ? `Tél : ${etab.telephone}` : '', etab.email].filter(Boolean).join('  •  ');
    const lignesEleve: [string, string][] = [
        ['Nom complet', `${recu.eleve.prenom || ''} ${recu.eleve.nom || ''}`.trim()],
        ['Matricule', recu.eleve.matricule || '—'],
        ['Classe', recu.eleve.classe || '—'],
    ];
    // Téléphone sur sa propre ligne, comme sur le PDF : accolé au nom, il
    // allongeait la ligne au point de la couper au milieu du numéro.
    if (recu.parent?.nom) lignesEleve.push(['Parent / tuteur', recu.parent.nom]);
    if (recu.parent?.telephone) lignesEleve.push(['Téléphone parent', recu.parent.telephone]);
    const lignesPaiement: [string, string][] = [['Motif', fac.motif || '—']];
    if (recu.tranche) lignesPaiement.push(['Tranche', `${recu.tranche.numero} sur ${recu.tranche.total}${recu.tranche.numero === recu.tranche.total ? ' (dernière)' : ''}`]);
    lignesPaiement.push(['Mode de paiement', recu.mode_paiement_libelle || '—']);
    lignesPaiement.push(['Référence', recu.reference_externe || '—']);
    lignesPaiement.push(['Facture', fac.numero_facture || '—']);

    const titreSection = styleTitreSection(PF);

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 40px rgba(15,23,42,0.12)', border: `1px solid ${BORD}`, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: ENCRE }}>
            {/* Bandeau */}
            <div style={{ background: `linear-gradient(115deg, ${P} 0%, ${P} 55%, ${PF} 55.2%, ${PF} 100%)`, color: '#fff', textAlign: 'center', padding: '18px 18px 16px' }}>
                <div style={{ width: 60, height: 60, margin: '0 auto 10px', background: '#fff', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }}>
                    {etab.logo_url && logoOk ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl(etab.logo_url)!} alt="" onError={() => setLogoOk(false)} style={{ width: 50, height: 50, objectFit: 'contain' }} />
                    ) : (
                        <span style={{ fontSize: 20, fontWeight: 800, color: PF }}>{initiales}</span>
                    )}
                </div>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{etab.nom}</p>
                {etab.slogan && <p style={{ margin: '3px 0 0', fontSize: 11.5, fontStyle: 'italic', opacity: 0.9 }}>{etab.slogan}</p>}
                {contacts && <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.85 }}>{contacts}</p>}
            </div>
            <div style={{ height: 5, background: `color-mix(in srgb, ${P} 10%, white)` }} />

            <div style={{ padding: '18px 18px 14px' }}>
                {/* Titre */}
                <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '0.35em' }}>REÇU DE PAIEMENT</p>
                    <span style={{ display: 'inline-block', marginTop: 8, padding: '4px 14px', borderRadius: 999, border: `1.5px solid ${P}`, background: `color-mix(in srgb, ${P} 8%, white)`, color: PF, fontWeight: 800, fontSize: 13 }}>
                        N° {recu.numero_recu}
                    </span>
                    <p style={{ margin: '7px 0 0', fontSize: 11.5, color: GRIS }}>
                        Payé le {dateFr(recu.date_paiement)}{recu.heure ? ` à ${recu.heure}` : ''}
                        {recu.annee_libelle ? `  •  Année scolaire ${recu.annee_libelle}` : ''}
                    </p>
                </div>

                {/* Cartes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 14 }}>
                    <Carte titre="ÉLÈVE" lignes={lignesEleve} couleur={P} couleurFoncee={PF} />
                    <Carte titre="PAIEMENT" lignes={lignesPaiement} couleur={P} couleurFoncee={PF} />
                </div>

                {/* Montant */}
                <div style={{ marginTop: 12, borderRadius: 12, padding: '12px 14px', background: annule ? '#fef2f2' : '#ecfdf5', border: `1px solid ${annule ? '#fecaca' : '#a7f3d0'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', color: annule ? ROUGE : VERT }}>MONTANT REÇU</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: GRIS }}>Ce versement</p>
                        </div>
                        <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: annule ? ROUGE : VERT, textDecoration: annule ? 'line-through' : 'none' }}>
                            {formaterMontant(recu.montant)} {devise}
                        </p>
                    </div>
                    {lettres && <p style={{ margin: '6px 0 0', fontSize: 11.5, fontStyle: 'italic', color: ENCRE }}>{lettres}</p>}
                </div>

                {/* Situation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                    {([
                        ['TOTAL FACTURE', fac.montant_total, ENCRE],
                        ['TOTAL PAYÉ', fac.paye_a_date, VERT],
                        ['RESTE À PAYER', reste, reste > 0 ? AMBRE : VERT],
                    ] as [string, number, string][]).map(([e, v, c]) => (
                        <div key={e} style={{ border: `1px solid ${BORD}`, borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: GRIS, letterSpacing: '0.04em' }}>{e}</p>
                            {/* Devise sur sa propre ligne : sur téléphone, « 450 000 GNF »
                                ne tient pas dans un tiers de largeur sans être coupé. */}
                            <p style={{ margin: '3px 0 0', fontSize: 'clamp(12px, 3.6vw, 14px)', fontWeight: 800, color: c, whiteSpace: 'nowrap' }}>{formaterMontant(v)}</p>
                            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: GRIS }}>{devise}</p>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 10, height: 7, borderRadius: 99, background: BORD, overflow: 'hidden' }}>
                    <div style={{ width: `${pourcentage}%`, height: '100%', borderRadius: 99, background: reste <= 0 ? VERT : P }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 11 }}>
                    <span style={{ fontWeight: 800, color: reste <= 0 ? VERT : PF }}>{reste <= 0 ? 'FACTURE SOLDÉE' : `PAYÉ À ${pourcentage} %`}</span>
                    {recu.anterieurs.length > 0 && <span style={{ color: GRIS }}>Dont {formaterMontant(fac.deja_paye)} {devise} versés auparavant</span>}
                </div>

                {recu.anterieurs.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <p style={{ ...titreSection, color: GRIS, fontSize: 10 }}>VERSEMENTS PRÉCÉDENTS</p>
                        {recu.anterieurs.map(a => (
                            <div key={a.numero_recu} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderTop: `1px solid ${BORD}`, fontSize: 12 }}>
                                <span>{dateFr(a.date_paiement)} <span style={{ color: GRIS }}>— Reçu {a.numero_recu} — {a.mode_paiement}</span></span>
                                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formaterMontant(a.montant)} {devise}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Vérification + signature */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
                    {/* Sans code (serveur pas encore à jour), pas de QR : un QR
                        sans code mènerait à « Reçu non reconnu ». */}
                    {recu.code_verification ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ padding: 5, border: `1px solid ${BORD}`, borderRadius: 10, background: '#fff', lineHeight: 0 }}>
                            {urlQr ? <QRCodeSVG value={urlQr} size={84} level="M" /> : <div style={{ width: 84, height: 84 }} />}
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Reçu vérifiable</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: GRIS, maxWidth: 170 }}>Scannez le QR code pour confirmer son authenticité.</p>
                            <p style={{ margin: '6px 0 0', fontSize: 10, color: GRIS }}>Code de vérification</p>
                            <p style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 800, fontSize: 14, color: PF, letterSpacing: '0.04em' }}>{recu.code_verification}</p>
                        </div>
                    </div>
                    ) : <div />}
                    <div style={{ textAlign: 'center', minWidth: 170, flex: '0 1 auto', marginLeft: 'auto' }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>Le Comptable / La Direction</p>
                        <div style={{ height: 52, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                            {[etab.cachet_url, etab.signature_url].filter(Boolean).map(u => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={u!} src={imageUrl(u)!} alt="" style={{ maxHeight: 48, maxWidth: 80, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ))}
                        </div>
                        <div style={{ borderTop: `1px solid ${GRIS}`, paddingTop: 4, fontSize: 10.5, color: GRIS }}>Cachet et signature</div>
                    </div>
                </div>
                <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 10.5, fontStyle: 'italic', color: GRIS }}>
                    Toute rature ou surcharge annule ce reçu. Conservez-le précieusement.
                </p>
            </div>
            <div style={{ height: 4, background: P }} />
            <div style={{ background: PF, color: 'rgba(255,255,255,0.85)', fontSize: 10.5, textAlign: 'center', padding: '8px 12px' }}>
                {etab.nom}  •  Reçu {recu.numero_recu}  •  SmartSchool
            </div>

            {annule && (
                <div aria-label="Reçu annulé" style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%) rotate(-28deg)', border: `4px solid ${ROUGE}`, color: ROUGE, borderRadius: 14, padding: '6px 26px', fontSize: 52, fontWeight: 900, opacity: 0.55, pointerEvents: 'none', letterSpacing: '0.08em' }}>
                    ANNULÉ
                </div>
            )}
        </div>
    );
}
