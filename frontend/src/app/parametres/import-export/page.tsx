'use client';

/**
 * Paramètres › Import / Export.
 *
 * Sortir les données de l'école en fichier Excel : ses élèves, ses classes, ses
 * notes, ses paiements.
 *
 * La SAUVEGARDE COMPLÈTE de la base n'est volontairement pas ici. Un fichier
 * contenant toute une école embarque des mots de passe, les coordonnées des
 * familles et l'intégralité de la comptabilité : cela relève de l'exploitation
 * du serveur (sauvegarde planifiée et chiffrée), pas d'un bouton dans un
 * navigateur. L'écran le dit, plutôt que de laisser croire à un oubli.
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, Database, Download, FileSpreadsheet, Info, Loader2, ShieldAlert,
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';

interface Jeu {
    cle: string;
    libelle: string;
    volume: number;
    description: string;
}

export default function ImportExportPage() {
    const { anneeId } = useApp();
    const [jeux, setJeux] = useState<Jeu[]>([]);
    const [chargement, setChargement] = useState(true);
    const [enCours, setEnCours] = useState<string | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const charger = useCallback(async () => {
        setChargement(true);
        try {
            // Compteurs de l'année affichée : sinon les effectifs de toutes les
            // années s'additionnaient.
            const res = await api.get(`/api/export/catalogue?annee_id=${anneeId}`);
            setJeux(Array.isArray(res.data) ? res.data : []);
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || "Impossible de charger la liste des exports.");
        } finally {
            setChargement(false);
        }
    }, [anneeId]);

    useEffect(() => { charger(); }, [charger]);

    const telecharger = async (jeu: Jeu) => {
        setEnCours(jeu.cle);
        setErreur(null);
        try {
            // `blob` : c'est un fichier, pas du JSON. Sans cela le navigateur
            // tente de l'interpréter et le téléchargement échoue en silence.
            const res = await api.get(`/api/export/${jeu.cle}?annee_id=${anneeId}`, { responseType: 'blob' });
            const nom = (res.headers?.['content-disposition'] || '')
                .split('filename=')[1]?.replace(/"/g, '')
                || `${jeu.cle}.csv`;
            const url = URL.createObjectURL(new Blob([res.data]));
            const lien = document.createElement('a');
            lien.href = url;
            lien.download = nom;
            document.body.appendChild(lien);
            lien.click();
            lien.remove();
            URL.revokeObjectURL(url);
        } catch {
            setErreur(`Le téléchargement de « ${jeu.libelle} » a échoué.`);
        } finally {
            setEnCours(null);
        }
    };

    // ── Import des élèves ──
    const [fichierImport, setFichierImport] = useState<File | null>(null);
    const [rapport, setRapport] = useState<{ crees: number; total_lignes: number; ignorees: { ligne: number; eleve?: string; raison: string }[] } | null>(null);
    const [resultatImport, setResultatImport] = useState<{ message: string } | null>(null);
    const [importEnCours, setImportEnCours] = useState(false);
    const fichierRef = useRef<HTMLInputElement>(null);

    const telechargerModele = async () => {
        try {
            const res = await api.get('/api/eleves/import/modele', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url; a.download = 'modele_import_eleves.csv';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch { setErreur('Téléchargement du modèle impossible.'); }
    };

    // Message d'erreur lisible : le « detail » d'une 422 FastAPI est une LISTE
    // d'objets (pas une chaîne) — la montrer telle quelle donnait « [object
    // Object] ». On distingue aussi « serveur injoignable » (pas de réponse).
    const messageErreur = (e: unknown, repli: string): string => {
        const err = e as { response?: { status?: number; data?: { detail?: unknown } } };
        if (!err?.response) return "Serveur injoignable, ou fichier trop volumineux. Réessayez.";
        const detail = err.response.data?.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            const msgs = detail.map((d) => (d as { msg?: string })?.msg).filter(Boolean);
            return msgs.length ? msgs.join(' ; ') : repli;
        }
        if (err.response.status === 404) return "L'import n'est pas encore disponible en ligne (déploiement à faire).";
        return repli;
    };

    const analyser = async (f: File) => {
        setFichierImport(f); setRapport(null); setResultatImport(null); setErreur(null); setImportEnCours(true);
        try {
            const fd = new FormData(); fd.append('fichier', f);
            const res = await api.post(`/api/eleves/import?dry_run=true&annee_id=${anneeId}`, fd);
            setRapport(res.data);
        } catch (e: unknown) {
            setErreur(messageErreur(e, "Analyse du fichier impossible."));
        } finally { setImportEnCours(false); }
    };

    const confirmerImport = async () => {
        if (!fichierImport) return;
        setImportEnCours(true); setErreur(null);
        try {
            const fd = new FormData(); fd.append('fichier', fichierImport);
            const res = await api.post(`/api/eleves/import?annee_id=${anneeId}`, fd);
            setResultatImport(res.data); setRapport(null); setFichierImport(null);
            if (fichierRef.current) fichierRef.current.value = '';
            charger();
        } catch (e: unknown) {
            setErreur(messageErreur(e, "Import impossible."));
        } finally { setImportEnCours(false); }
    };

    return (
        <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: '17px', maxWidth: '900px', margin: '0 auto' }}>
            <Link href="/parametres" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', textDecoration: 'none', fontWeight: 600 }}>
                <ArrowLeft size={15} /> Paramètres
            </Link>

            <div>
                <h1 style={{ margin: 0, fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Database size={22} style={{ color: '#65a30d' }} /> Import / Export
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Sortez vos données au format Excel pour les relire, les archiver ou les transmettre.
                </p>
            </div>

            {erreur && (
                <div style={{ display: 'flex', gap: '10px', padding: '12px 15px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>{erreur}</span>
                </div>
            )}

            {chargement ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '56px' }}>
                    <Loader2 size={26} style={{ color: '#65a30d', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                    {jeux.map(j => {
                        const vide = j.volume === 0;
                        return (
                            <div key={j.cle} style={{
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
                                padding: '16px 17px', display: 'flex', flexDirection: 'column', gap: '11px',
                            }}>
                                <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
                                    <div style={{ width: 38, height: 38, borderRadius: '11px', background: '#f7fee7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                        <FileSpreadsheet size={19} style={{ color: '#65a30d' }} />
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
                                            {j.libelle}
                                        </h3>
                                        <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
                                            {j.description}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{
                                        padding: '3px 9px', borderRadius: 99, fontSize: '11.5px', fontWeight: 800,
                                        background: vide ? '#f1f5f9' : '#f7fee7',
                                        color: vide ? '#94a3b8' : '#4d7c0f',
                                    }}>
                                        {vide ? 'Aucune donnée' : `${j.volume} enregistrement${j.volume > 1 ? 's' : ''}`}
                                    </span>
                                    <button
                                        onClick={() => telecharger(j)}
                                        disabled={vide || enCours === j.cle}
                                        style={{
                                            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 14px', borderRadius: '10px', border: 'none',
                                            background: vide ? '#e2e8f0' : 'linear-gradient(135deg,#4d7c0f,#65a30d)',
                                            color: vide ? '#94a3b8' : '#fff',
                                            fontSize: '12.5px', fontWeight: 700,
                                            cursor: vide || enCours === j.cle ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {enCours === j.cle
                                            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                            : <Download size={14} />}
                                        Télécharger
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Import des élèves ── */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileSpreadsheet size={18} style={{ color: '#4d7c0f' }} /> Importer des élèves
                    </h3>
                    <p style={{ margin: '5px 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.6 }}>
                        Pour les élèves <strong>déjà de l&apos;école</strong>. Le matricule est attribué automatiquement, le mot de
                        passe par défaut est <strong>12345678</strong>, chaque élève est placé dans sa classe (colonne
                        « Classe ») de l&apos;année en cours et facturé <strong>scolarité + réinscription</strong> selon les tarifs
                        de sa classe. Aucun parent (à ajouter ensuite).
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={telechargerModele}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 15px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                        <Download size={14} /> Télécharger le modèle
                    </button>
                    <input ref={fichierRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) analyser(f); }} />
                    <button onClick={() => fichierRef.current?.click()} disabled={importEnCours}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 15px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#4d7c0f,#65a30d)', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: importEnCours ? 'wait' : 'pointer' }}>
                        {importEnCours ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={14} />}
                        Choisir un fichier
                    </button>
                </div>

                {rapport && (
                    <div style={{ padding: '14px', borderRadius: '11px', background: '#f7fee7', border: '1px solid #d9f99d' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#3f6212', marginBottom: '6px' }}>
                            Aperçu — {rapport.crees} élève(s) à importer sur {rapport.total_lignes} ligne(s)
                        </div>
                        {rapport.ignorees.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', marginBottom: '4px' }}>
                                    {rapport.ignorees.length} ligne(s) ignorée(s) :
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#92400e', maxHeight: '140px', overflowY: 'auto' }}>
                                    {rapport.ignorees.slice(0, 20).map((ig, k) => (
                                        <li key={k}>Ligne {ig.ligne}{ig.eleve ? ` — ${ig.eleve}` : ''} : {ig.raison}</li>
                                    ))}
                                    {rapport.ignorees.length > 20 && <li>+ {rapport.ignorees.length - 20} autre(s)</li>}
                                </ul>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setRapport(null); setFichierImport(null); if (fichierRef.current) fichierRef.current.value = ''; }}
                                style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '12.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                                Annuler
                            </button>
                            <button onClick={confirmerImport} disabled={importEnCours || rapport.crees === 0}
                                style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: rapport.crees === 0 ? '#e2e8f0' : '#059669', color: rapport.crees === 0 ? '#94a3b8' : '#fff', fontSize: '12.5px', fontWeight: 700, cursor: importEnCours || rapport.crees === 0 ? 'not-allowed' : 'pointer' }}>
                                Importer {rapport.crees} élève(s)
                            </button>
                        </div>
                    </div>
                )}

                {resultatImport && (
                    <div style={{ padding: '12px 14px', borderRadius: '11px', background: '#ecfdf5', border: '1px solid #a7f3d0', fontSize: '13px', color: '#065f46', fontWeight: 700 }}>
                        ✅ {resultatImport.message}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '11px', padding: '14px 16px', borderRadius: '13px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Info size={16} style={{ color: '#64748b', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
                    Les fichiers sont au format <strong>CSV</strong>, qui s&apos;ouvre directement
                    dans Excel. Ils ne contiennent que les données de <strong>votre
                    établissement</strong>.
                </div>
            </div>

            <div style={{ display: 'flex', gap: '11px', padding: '14px 16px', borderRadius: '13px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <ShieldAlert size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '12.5px', color: '#92400e', lineHeight: 1.6 }}>
                    <strong>La sauvegarde complète de la base n&apos;est pas proposée ici.</strong> Un
                    tel fichier contient les mots de passe, les coordonnées des familles et toute la
                    comptabilité : il ne doit pas transiter par un navigateur. La sauvegarde est
                    assurée côté serveur, planifiée et chiffrée.
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
        </div>
    );
}
