'use client';

/**
 * Choix de l'école active pour un administrateur PLATEFORME.
 *
 * Un SUPER_ADMIN est l'éditeur de la plateforme : il n'appartient à aucune
 * école. Toutes les routes métier exigeant un établissement, elles lui
 * répondent 403 tant qu'il n'en a pas désigné une — sans cet écran,
 * l'application lui paraît simplement cassée.
 *
 * Le choix n'est pas un réglage local : il déclenche l'émission d'un NOUVEAU
 * jeton par le serveur, qui vérifie que l'école existe. Le client ne se
 * fabrique jamais son propre `etablissement_id`.
 */
import React, { useEffect, useState } from 'react';
import { Building2, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';

import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface EtablissementDisponible {
    etablissement_id: number;
    code: string;
    nom: string;
    ville: string | null;
    statut: string;
}

export default function SelectionEtablissementPage() {
    const { user, login } = useAuth();
    const [etablissements, setEtablissements] = useState<EtablissementDisponible[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [enCours, setEnCours] = useState<number | null>(null);

    useEffect(() => {
        api.get('/api/auth/etablissements-disponibles')
            .then((res) => setEtablissements(res.data.etablissements || []))
            .catch(() => setErreur("Impossible de récupérer la liste des établissements."))
            .finally(() => setChargement(false));
    }, []);

    const choisir = async (etablissementId: number) => {
        if (!user) return;
        setEnCours(etablissementId);
        setErreur(null);
        try {
            const res = await api.post('/api/auth/etablissement-actif', {
                etablissement_id: etablissementId,
            });
            // `login` réécrit le jeton ET l'utilisateur stockés, puis redirige.
            // C'est le nouveau jeton qui porte l'établissement : rien n'est
            // décidé côté client.
            login(res.data.token, { ...user, etablissement_id: etablissementId });
        } catch {
            setErreur("Ce choix a été refusé. Reconnectez-vous, puis réessayez.");
            setEnCours(null);
        }
    };

    return (
        <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px' }}>
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontWeight: 800 }}>
                    Dans quel établissement souhaitez-vous travailler&nbsp;?
                </h1>
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Votre compte administre la <strong>plateforme</strong> : il n&apos;appartient à
                    aucune école. Choisissez celle dans laquelle vous intervenez — vous pourrez en
                    changer à tout moment en revenant sur cet écran.
                </p>
            </div>

            {erreur && (
                <div
                    role="alert"
                    style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
                        padding: '12px 14px', borderRadius: 8, background: '#fef2f2',
                        border: '1px solid #fecaca', color: '#991b1b',
                    }}
                >
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{erreur}</span>
                </div>
            )}

            {chargement && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
                    <Loader2 size={18} className="spin" /> Chargement des établissements…
                </div>
            )}

            {!chargement && etablissements.length === 0 && !erreur && (
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 8 }}>Aucun établissement pour le moment</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        La plateforme ne contient encore aucune école. Créez-en une avant de pouvoir
                        y travailler — un établissement, son année scolaire et son administrateur
                        sont nécessaires pour que les écrans métier aient du contenu.
                    </p>
                </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
                {etablissements.map((etab) => (
                    <button
                        key={etab.etablissement_id}
                        type="button"
                        onClick={() => choisir(etab.etablissement_id)}
                        disabled={enCours !== null}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                            padding: '16px 18px', borderRadius: 12, textAlign: 'left',
                            border: '1px solid var(--border, #e2e8f0)', background: 'var(--card, white)',
                            cursor: enCours !== null ? 'wait' : 'pointer',
                            opacity: enCours !== null && enCours !== etab.etablissement_id ? 0.5 : 1,
                        }}
                    >
                        <span
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                                background: '#eef2ff', color: '#4f46e5',
                            }}
                        >
                            <Building2 size={20} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700 }}>{etab.nom}</span>
                            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {etab.code}
                                {etab.ville ? ` — ${etab.ville}` : ''}
                                {etab.statut !== 'ACTIF' ? ` — ${etab.statut}` : ''}
                            </span>
                        </span>
                        {enCours === etab.etablissement_id
                            ? <Loader2 size={18} className="spin" />
                            : <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />}
                    </button>
                ))}
            </div>
        </div>
    );
}
