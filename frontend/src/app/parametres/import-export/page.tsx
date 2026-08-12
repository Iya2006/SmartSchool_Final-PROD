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
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, Database, Download, FileSpreadsheet, Info, Loader2, ShieldAlert,
} from 'lucide-react';
import api from '@/lib/api';

interface Jeu {
    cle: string;
    libelle: string;
    volume: number;
    description: string;
}

export default function ImportExportPage() {
    const [jeux, setJeux] = useState<Jeu[]>([]);
    const [chargement, setChargement] = useState(true);
    const [enCours, setEnCours] = useState<string | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const charger = useCallback(async () => {
        setChargement(true);
        try {
            const res = await api.get('/api/export/catalogue');
            setJeux(Array.isArray(res.data) ? res.data : []);
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setErreur(detail || "Impossible de charger la liste des exports.");
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const telecharger = async (jeu: Jeu) => {
        setEnCours(jeu.cle);
        setErreur(null);
        try {
            // `blob` : c'est un fichier, pas du JSON. Sans cela le navigateur
            // tente de l'interpréter et le téléchargement échoue en silence.
            const res = await api.get(`/api/export/${jeu.cle}`, { responseType: 'blob' });
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
