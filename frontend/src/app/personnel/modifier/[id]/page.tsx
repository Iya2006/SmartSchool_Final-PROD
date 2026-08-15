'use client';

/**
 * Modification du dossier d'un membre du personnel.
 *
 * Cette page manquait : la liste du personnel proposait « Modifier le dossier »
 * vers `/personnel/modifier/{id}`, mais la route n'existait sur AUCUNE branche.
 * Le bouton menait donc à la page 404 de Next.js, alors que l'API
 * `PUT /api/personnel/{id}` existe depuis le début. Un administrateur ne
 * pouvait tout simplement pas corriger une fiche.
 *
 * Le formulaire n'envoie QUE les champs réellement modifiés : `PersonnelUpdate`
 * a tous ses champs facultatifs, donc envoyer un champ vide l'effacerait.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Loader2, Save, AlertTriangle, CheckCircle2, KeyRound,
} from 'lucide-react';

import api from '@/lib/api';

const ROLES = [
    { value: 'FONDATEUR', label: 'Fondateur' },
    { value: 'DG', label: 'Directeur Général' },
    { value: 'DIRECTEUR_NIVEAU', label: 'Directeur des Études' },
    { value: 'ADMIN', label: 'Administrateur' },
    { value: 'COMPTABLE', label: 'Comptable' },
    { value: 'BIBLIOTHECAIRE', label: 'Bibliothécaire' },
    { value: 'INFORMATICIEN', label: 'Informaticien' },
    { value: 'SURVEILLANT', label: 'Surveillant' },
    { value: 'OPERATEUR', label: 'Opérateur / Secrétaire' },
    { value: 'AGENT_ENTRETIEN', label: "Agent d'Entretien" },
    { value: 'GARDIEN', label: 'Gardien' },
    { value: 'CHAUFFEUR', label: 'Chauffeur' },
    { value: 'AUTRE', label: 'Autre Personnel' },
];

const CONTRATS = ['PERMANENT', 'VACATAIRE', 'STAGIAIRE', 'CONTRACTUEL'];
const MODES_PAIEMENT = ['ESPECES', 'VIREMENT', 'MOBILE_MONEY', 'CHEQUE'];

/** Champs éditables, avec leur type de saisie. */
type Champ = { cle: string; label: string; type?: string; options?: string[]; aide?: string };

const IDENTITE: Champ[] = [
    { cle: 'nom', label: 'Nom' },
    { cle: 'prenom', label: 'Prénom' },
    { cle: 'sexe', label: 'Sexe', options: ['M', 'F'] },
    { cle: 'date_naissance', label: 'Date de naissance', type: 'date' },
    { cle: 'lieu_naissance', label: 'Lieu de naissance' },
    { cle: 'numero_cni', label: 'Numéro CNI' },
    { cle: 'adresse', label: 'Adresse' },
];

const CONTACT: Champ[] = [
    { cle: 'telephone', label: 'Téléphone', aide: "Sert aussi d'identifiant de connexion" },
    { cle: 'email', label: 'E-mail', type: 'email', aide: "Sert aussi d'identifiant de connexion" },
];

const CONTRAT: Champ[] = [
    { cle: 'type_contrat', label: 'Type de contrat', options: CONTRATS },
    { cle: 'date_embauche', label: "Date d'embauche", type: 'date' },
    { cle: 'salaire_base', label: 'Salaire de base (GNF)', type: 'number' },
    { cle: 'taux_horaire', label: 'Taux horaire (GNF)', type: 'number' },
    { cle: 'prime_mensuelle', label: 'Prime mensuelle (GNF)', type: 'number' },
    { cle: 'heures_hebdo', label: 'Heures par semaine', type: 'number' },
    { cle: 'mode_paiement_salaire', label: 'Mode de paiement', options: MODES_PAIEMENT },
    { cle: 'rib', label: 'RIB / Compte' },
];

type Dossier = Record<string, unknown>;

export default function ModifierPersonnel() {
    const params = useParams();
    const router = useRouter();
    const id = String(params?.id ?? '');

    const [initial, setInitial] = useState<Dossier | null>(null);
    const [form, setForm] = useState<Dossier>({});
    const [nouveauMotDePasse, setNouveauMotDePasse] = useState('');
    const [chargement, setChargement] = useState(true);
    const [envoi, setEnvoi] = useState(false);
    const [message, setMessage] = useState<{ texte: string; type: 'ok' | 'erreur' } | null>(null);

    useEffect(() => {
        if (!id) return;
        api.get(`/api/personnel/${id}`)
            .then((res) => {
                const d = res.data as Dossier;
                setInitial(d);
                setForm(d);
            })
            .catch(() =>
                setMessage({
                    texte: "Ce dossier est introuvable, ou il appartient à un autre établissement.",
                    type: 'erreur',
                }),
            )
            .finally(() => setChargement(false));
    }, [id]);

    const modifier = (cle: string, valeur: unknown) =>
        setForm((f) => ({ ...f, [cle]: valeur }));

    /** N'envoyer que ce qui a réellement changé : `PersonnelUpdate` a tous ses
     * champs facultatifs, donc renvoyer l'ensemble risquerait d'écraser une
     * valeur avec une chaîne vide. */
    const changements = useMemo(() => {
        if (!initial) return {};
        const diff: Dossier = {};
        for (const [cle, valeur] of Object.entries(form)) {
            const avant = initial[cle];
            const normalise = (v: unknown) => (v === '' || v === undefined ? null : v);
            if (normalise(valeur) !== normalise(avant)) diff[cle] = normalise(valeur);
        }
        return diff;
    }, [form, initial]);

    const nbChangements = Object.keys(changements).length + (nouveauMotDePasse ? 1 : 0);

    const enregistrer = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        if (nouveauMotDePasse && nouveauMotDePasse.length < 6) {
            setMessage({ texte: 'Le mot de passe doit contenir au moins 6 caractères.', type: 'erreur' });
            return;
        }
        setEnvoi(true);
        try {
            const charge: Dossier = { ...changements };
            if (nouveauMotDePasse) charge.mot_de_passe = nouveauMotDePasse;
            await api.put(`/api/personnel/${id}`, charge);
            setMessage({ texte: 'Dossier mis à jour.', type: 'ok' });
            setNouveauMotDePasse('');
            const res = await api.get(`/api/personnel/${id}`);
            setInitial(res.data as Dossier);
            setForm(res.data as Dossier);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setMessage({
                texte: e?.response?.data?.detail || "La modification n'a pas pu être enregistrée.",
                type: 'erreur',
            });
        } finally {
            setEnvoi(false);
        }
    };

    const champ = (c: Champ) => {
        const valeur = (form[c.cle] ?? '') as string | number;
        return (
            <label key={c.cle} style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {c.label}
                </span>
                {c.options ? (
                    <select
                        value={String(valeur)}
                        onChange={(e) => modifier(c.cle, e.target.value)}
                        style={styleChamp}
                    >
                        <option value="">—</option>
                        {c.options.map((o) => (
                            <option key={o} value={o}>{o}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        type={c.type ?? 'text'}
                        value={String(valeur ?? '')}
                        onChange={(e) => modifier(c.cle, e.target.value)}
                        style={styleChamp}
                    />
                )}
                {c.aide && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {c.aide}
                    </span>
                )}
            </label>
        );
    };

    if (chargement) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40 }}>
                <Loader2 size={18} className="spin" /> Chargement du dossier…
            </div>
        );
    }

    if (!initial) {
        return (
            <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ marginTop: 0 }}>Dossier introuvable</h3>
                    <p style={{ color: 'var(--text-muted)' }}>
                        {message?.texte ?? "Ce dossier n'existe pas."}
                    </p>
                    <Link href="/personnel">← Retour à la liste du personnel</Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 880, margin: '32px auto', padding: '0 20px' }}>
            <button
                type="button"
                onClick={() => router.push('/personnel')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none',
                         border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 16 }}
            >
                <ArrowLeft size={16} /> Retour au personnel
            </button>

            <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800 }}>
                {String(initial.prenom ?? '')} {String(initial.nom ?? '')}
            </h1>
            <p style={{ margin: '0 0 24px', color: 'var(--text-muted)' }}>
                Modification du dossier
                {initial.nom_utilisateur ? ` — identifiant : ${String(initial.nom_utilisateur)}` : ' — sans accès au système'}
            </p>

            {message && (
                <div
                    role="status"
                    style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
                        padding: '12px 14px', borderRadius: 8,
                        background: message.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${message.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                        color: message.type === 'ok' ? '#166534' : '#991b1b',
                    }}
                >
                    {message.type === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    <span>{message.texte}</span>
                </div>
            )}

            <form onSubmit={enregistrer}>
                <Section titre="Identité">{IDENTITE.map(champ)}</Section>
                <Section titre="Contact">{CONTACT.map(champ)}</Section>

                <Section titre="Rôle et statut">
                    <label style={{ display: 'block' }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Rôle</span>
                        <select
                            value={String(form.role ?? '')}
                            onChange={(e) => modifier('role', e.target.value)}
                            style={styleChamp}
                        >
                            {ROLES.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'block' }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Statut</span>
                        <select
                            value={String(form.statut ?? 'ACTIF')}
                            onChange={(e) => modifier('statut', e.target.value)}
                            style={styleChamp}
                        >
                            <option value="ACTIF">Actif</option>
                            <option value="INACTIF">Inactif</option>
                        </select>
                    </label>
                </Section>

                <Section titre="Contrat et rémunération">{CONTRAT.map(champ)}</Section>

                <Section titre="Accès au système">
                    <label style={{ display: 'block' }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                            <KeyRound size={13} style={{ verticalAlign: -2 }} /> Nouveau mot de passe
                        </span>
                        <input
                            type="password"
                            value={nouveauMotDePasse}
                            onChange={(e) => setNouveauMotDePasse(e.target.value)}
                            placeholder="Laisser vide pour ne pas le changer"
                            style={styleChamp}
                        />
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            Renseignez ce champ uniquement pour réinitialiser l&apos;accès de cette personne.
                        </span>
                    </label>
                </Section>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                    <button
                        type="submit"
                        disabled={envoi || nbChangements === 0}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '12px 22px', borderRadius: 12, border: 'none', fontWeight: 700,
                            color: 'white', background: nbChangements === 0 ? '#94a3b8' : '#1d4ed8',
                            cursor: envoi || nbChangements === 0 ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {envoi ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                        Enregistrer
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {nbChangements === 0
                            ? 'Aucune modification'
                            : `${nbChangements} modification${nbChangements > 1 ? 's' : ''} à enregistrer`}
                    </span>
                </div>
            </form>
        </div>
    );
}

const styleChamp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--border, #e2e8f0)', background: 'var(--card, white)',
    color: 'inherit', fontSize: 14,
};

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
    return (
        <section className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>{titre}</h2>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {children}
            </div>
        </section>
    );
}
