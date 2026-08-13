'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
    PlusCircle, Trash2, Edit2, CheckCircle2, AlertTriangle, XCircle,
    Search, RefreshCw, FileText, DollarSign, Users, Calendar,
    ChevronDown, ChevronRight, Banknote, CreditCard, Smartphone, X, Coins, Lightbulb
} from 'lucide-react';
import { fetchModesPaiement, modePaiementLabel, DEFAULT_MODES_PAIEMENT } from '@/lib/modesPaiement';
import { useApp } from '@/context/AppContext';
import AnneeFilter from '@/components/AnneeFilter';
import Pagination from '@/components/Pagination';


// --- Types ---
type TypeFrais = {
    type_frais_id: number; code: string; libelle: string;
    categorie: string; montant_defaut: number; est_obligatoire: string; frequence: string; statut: string;
};
type Echeance = {
    echeance_id: number; libelle: string; date_limite: string;
    montant_attendu: number; montant_paye: number; statut: string;
};
type Facture = {
    facture_id: number; numero_facture: string; date_facture: string;
    montant_total: number; montant_paye: number; montant_restant: number;
    statut: string; type_frais_libelle: string; eleve_nom: string;
    eleve_prenom: string; classe_nom: string; classe_id: number;
    inscription_id: number; type_frais_id: number; echeances: Echeance[];
};
type Paiement = {
    paiement_id: number; numero_recu: string; date_paiement: string;
    montant: number; mode_paiement: string; statut: string;
    numero_facture: string; eleve_nom: string; eleve_prenom: string;
    echeance_id: number | null;
};

const CATEGORIES_FRAIS = [
    'Inscription', 'Scolarité', 'Transport', 'Cantine',
    'Uniforme', 'Fournitures', 'Activités', 'Réinscription', 'Autre'
];

const FREQUENCES = ['ANNUEL', 'TRIMESTRIEL', 'MENSUEL', 'UNIQUE'];

// Icônes pour les modes de paiement CONNUS — la liste réellement proposée dans
// le formulaire d'encaissement vient de Paramètres > Finance & Comptabilité
// (voir modesPaiementConfig state + fetchModesPaiement), pas d'ici.
const MODE_ICONS: Record<string, typeof Banknote> = {
    ESPECES: Banknote,
    CHEQUE: FileText,
    MOBILE_MONEY: Smartphone,
    ORANGE_MONEY: Smartphone,
    MTN_MONEY: Smartphone,
    VIREMENT: CreditCard,
};
const MODE_ICON_DEFAUT = CreditCard;

const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'PARTIELLEMENT_PAYEE': { bg: '#dbeafe', color: '#2563eb', label: 'Partielle' },
    'PAYEE': { bg: '#d1fae5', color: '#059669', label: 'Payée' },
    'EN_RETARD': { bg: '#fee2e2', color: '#dc2626', label: 'En retard' },
};

function Badge({ statut }: { statut: string }) {
    const s = STATUT_COLORS[statut] || { bg: '#f1f5f9', color: '#475569', label: statut };
    return (
        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', backgroundColor: s.bg, color: s.color }}>
            {s.label}
        </span>
    );
}

function FraisScolaritePage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const tabParam = searchParams.get('tab') || 'types';
    const { anneeId: anneeCouranteId } = useApp();

    // Data loaded via React Query
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const queryClient = useQueryClient();

    // Année scolaire consultée — par défaut l'année en cours ; le comptable
    // peut consulter une année archivée sans que ça n'affecte les nouvelles factures.
    const [filterAnnee, setFilterAnnee] = useState<number>(anneeCouranteId);
    useEffect(() => { setFilterAnnee(anneeCouranteId); }, [anneeCouranteId]);

    // UI State
    const [searchFacture, setSearchFacture] = useState('');
    const [activeTab, setActiveTab] = useState('Scolarité');
    const [filterStatut, setFilterStatut] = useState('');
    const [facturesPage, setFacturesPage] = useState(1);
    const FACTURES_PAGE_SIZE = 25;

    // Modals
    const [showTypeFraisModal, setShowTypeFraisModal] = useState(false);
    const [editingTypeFrais, setEditingTypeFrais] = useState<TypeFrais | null>(null);
    const [showFactureModal, setShowFactureModal] = useState(false);
    const [showPaiementModal, setShowPaiementModal] = useState(false);
    const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null);

    // Form States - Type Frais
    const [tfCode, setTfCode] = useState('');
    const [tfLibelle, setTfLibelle] = useState('');
    const [tfCategorie, setTfCategorie] = useState('Scolarité');
    const [tfMontantDefaut, setTfMontantDefaut] = useState('');
    const [tfObligatoire, setTfObligatoire] = useState('O');
    const [tfFrequence, setTfFrequence] = useState('ANNUEL');

    // Form States - Facture
    // Une classe cochée = une entrée { montant } — chaque classe peut avoir un
    // montant différent (une école n'a pas la même scolarité en maternelle qu'en
    // terminale), au lieu d'un seul montant partagé appliqué à toutes les classes.
    const [factClasseMontants, setFactClasseMontants] = useState<Record<string, string>>({});
    const [factTypeFraisId, setFactTypeFraisId] = useState('');
    const [factMontant, setFactMontant] = useState('');
    const [factNbEcheances, setFactNbEcheances] = useState('1');

    // Le nombre de mois "facturables" d'une année scolaire type (utilisé pour
    // pré-remplir le fractionnement MENSUEL — l'admin peut toujours l'ajuster).
    const MOIS_ANNEE_SCOLAIRE = 10;

    // Génère l'échéancier pour UN montant donné (même fractionnement/dates pour
    // toutes les classes, mais calculé sur le montant propre à chaque classe).
    const genererEcheances = (montantTotal: number, nb: number) => {
        if (montantTotal <= 0) return [];
        if (nb <= 1) {
            return [{ libelle: 'Paiement unique', montant_attendu: montantTotal, date_limite: new Date().toISOString().split('T')[0] }];
        }
        const tranches = [];
        const splitAmount = Math.round(montantTotal / nb);
        for (let i = 0; i < nb; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() + i);
            tranches.push({
                libelle: `Tranche ${i + 1}/${nb}`,
                montant_attendu: i === nb - 1 ? montantTotal - (splitAmount * (nb - 1)) : splitAmount,
                date_limite: d.toISOString().split('T')[0]
            });
        }
        return tranches;
    };

    // Sélectionner un type de frais pré-remplit montant + fractionnement à partir
    // de sa configuration (montant_defaut / fréquence), au lieu de tout ressaisir
    // à la main à chaque génération de factures. Pré-coche aussi les classes qui ont
    // déjà un tarif configuré (Comptabilité > Frais ou fiche de classe), avec leur
    // propre montant.
    const onSelectTypeFrais = async (id: string) => {
        setFactTypeFraisId(id);
        const tf = typesFrais.find(t => String(t.type_frais_id) === id);
        if (!tf) return;
        if (tf.montant_defaut) setFactMontant(String(tf.montant_defaut));
        if (tf.frequence === 'MENSUEL') setFactNbEcheances(String(MOIS_ANNEE_SCOLAIRE));
        else if (tf.frequence === 'TRIMESTRIEL') setFactNbEcheances('3');
        else setFactNbEcheances('1');
        try {
            const res = await api.get(`/api/finance/tarifs-classe?type_frais_id=${id}`);
            const next: Record<string, string> = {};
            (res.data || []).forEach((t: any) => { next[String(t.classe_id)] = String(t.montant); });
            setFactClasseMontants(next);
        } catch { /* pas de tarifs préconfigurés, l'admin coche manuellement */ }
    };

    // --- Tarifs par classe (gérés depuis "Types de Frais", visibles/éditables
    //     aussi depuis la fiche de configuration de chaque classe — même table). ---
    const [showTarifsModal, setShowTarifsModal] = useState(false);
    const [tarifsTypeFrais, setTarifsTypeFrais] = useState<TypeFrais | null>(null);
    const [tarifsMontants, setTarifsMontants] = useState<Record<string, string>>({});
    const [tarifsSaving, setTarifsSaving] = useState(false);

    const openTarifsModal = async (tf: TypeFrais) => {
        setTarifsTypeFrais(tf);
        setShowTarifsModal(true);
        try {
            const res = await api.get(`/api/finance/tarifs-classe?type_frais_id=${tf.type_frais_id}`);
            const next: Record<string, string> = {};
            (res.data || []).forEach((t: any) => { next[String(t.classe_id)] = String(t.montant); });
            setTarifsMontants(next);
        } catch {
            setTarifsMontants({});
        }
    };

    const saveTarifs = async () => {
        if (!tarifsTypeFrais) return;
        setTarifsSaving(true);
        try {
            const entries = classes.map((c: any) => ({
                type_frais_id: tarifsTypeFrais.type_frais_id,
                classe_id: c.classe_id,
                montant: parseFloat(tarifsMontants[String(c.classe_id)] || '0') || 0,
            }));
            await api.put('/api/finance/tarifs-classe', entries);
            showMsg('Tarifs par classe enregistrés', 'success');
            setShowTarifsModal(false);
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        } finally {
            setTarifsSaving(false);
        }
    };

    const toggleFactClasse = (classeId: string, checked: boolean) => {
        setFactClasseMontants(prev => {
            const next = { ...prev };
            if (checked) next[classeId] = prev[classeId] ?? factMontant ?? '';
            else delete next[classeId];
            return next;
        });
    };

    const appliquerMontantATous = () => {
        setFactClasseMontants(prev => {
            const next: Record<string, string> = {};
            for (const id of Object.keys(prev)) next[id] = factMontant;
            return next;
        });
    };

    // Modes de paiement configurés (Paramètres > Finance & Comptabilité) —
    // source unique de vérité pour ce sélecteur.
    const [modesPaiementConfig, setModesPaiementConfig] = useState<string[]>(DEFAULT_MODES_PAIEMENT);
    useEffect(() => { fetchModesPaiement().then(setModesPaiementConfig); }, []);
    const modesAffichables = modesPaiementConfig.map(value => ({
        value,
        label: modePaiementLabel(value),
        icon: MODE_ICONS[value] || MODE_ICON_DEFAUT,
    }));

    // Form States - Paiement
    const [payMontant, setPayMontant] = useState('');
    const [payMode, setPayMode] = useState('ESPECES');
    const [payReference, setPayReference] = useState('');
    const [payEcheanceId, setPayEcheanceId] = useState('');

    const showMsg = (text: any, type: 'success' | 'error') => {
        let messageText = typeof text === 'string' ? text : 'Erreur inattendue';
        if (Array.isArray(text)) {
            messageText = text.map((t: any) => t.msg || JSON.stringify(t)).join(', ');
        } else if (typeof text === 'object' && text !== null) {
            messageText = text.msg || text.message || JSON.stringify(text);
        }
        setMessage({ text: messageText, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const { data: fraisData, isLoading: loading } = useQuery({
        queryKey: ['frais-all', filterAnnee],
        queryFn: async () => {
            const [tfRes, factRes, payRes, statsRes, classRes] = await Promise.all([
                api.get('/api/finance/types-frais'),
                api.get(`/api/finance/factures?etablissement_id=1&annee_id=${filterAnnee}&limit=5000`),
                api.get(`/api/finance/paiements?etablissement_id=1&annee_id=${filterAnnee}&limit=5000`),
                api.get(`/api/finance/factures/stats?etablissement_id=1&annee_id=${filterAnnee}`),
                api.get(`/api/classes?etablissement_id=1&annee_id=${filterAnnee}&limit=100`),
            ]);

            // La liste était plafonnée à `limit=200` en dur — silencieusement
            // tronquée dès que l'année dépassait 200 factures (bug signalé : 263
            // factures réelles affichées comme 200). `X-Total-Count` permet de
            // détecter une troncature et de rattraper avec le vrai total au lieu
            // de deviner une limite "assez grande".
            let factures = factRes.data as Facture[];
            const factTotal = parseInt(factRes.headers?.['x-total-count'] || '0', 10);
            if (factTotal > factures.length) {
                const full = await api.get(`/api/finance/factures?etablissement_id=1&annee_id=${filterAnnee}&limit=${factTotal}`);
                factures = full.data as Facture[];
            }

            let paiements = payRes.data as Paiement[];
            const payTotal = parseInt(payRes.headers?.['x-total-count'] || '0', 10);
            if (payTotal > paiements.length) {
                const full = await api.get(`/api/finance/paiements?etablissement_id=1&annee_id=${filterAnnee}&limit=${payTotal}`);
                paiements = full.data as Paiement[];
            }

            return {
                typesFrais: tfRes.data as TypeFrais[],
                factures,
                paiements,
                stats: statsRes.data,
                classes: classRes.data as any[],
            };
        },
        staleTime: 1000 * 60 * 3,
        enabled: !!filterAnnee,
    });

    const typesFrais: TypeFrais[] = fraisData?.typesFrais || [];
    const factures: Facture[] = fraisData?.factures || [];
    const paiements: Paiement[] = fraisData?.paiements || [];
    const stats = fraisData?.stats || null;
    const classes: any[] = fraisData?.classes || [];

    const loadAll = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['frais-all'] });
    }, [queryClient]);

    /* ─── Grille des tarifs : le coût de l'année, classe par classe ──────────
       Le réglage vivait derrière un petit bouton sur une ligne de liste, et
       s'ouvrait un type de frais à la fois. Impossible de répondre à « la 6ᵉ,
       ça coûte combien à l'année ? » sans additionner de tête. */
    const { data: grille } = useQuery({
        queryKey: ['grille-tarifs', filterAnnee],
        queryFn: async () =>
            (await api.get(`/api/finance/tarifs-classe/grille?annee_id=${filterAnnee}`)).data,
        enabled: !!filterAnnee,
        staleTime: 1000 * 60 * 3,
    });
    // Saisie en cours, par (classe, type de frais). Tant qu'elle n'est pas
    // enregistrée elle vit ici : un rechargement ne doit pas laisser croire
    // qu'un tarif est posé alors qu'il n'a jamais quitté l'écran.
    const [grilleSaisie, setGrilleSaisie] = useState<Record<string, string>>({});
    const [grilleEnCours, setGrilleEnCours] = useState(false);

    const cleGrille = (classeId: number, typeId: number) => `${classeId}:${typeId}`;
    const valeurGrille = (classeId: number, typeId: number, montant: number | null) => {
        const k = cleGrille(classeId, typeId);
        if (k in grilleSaisie) return grilleSaisie[k];
        return montant ? String(montant) : '';
    };
    const majGrille = (classeId: number, typeId: number, v: string) =>
        setGrilleSaisie(prev => ({ ...prev, [cleGrille(classeId, typeId)]: v }));
    const caseModifiee = (classeId: number, typeId: number) => cleGrille(classeId, typeId) in grilleSaisie;
    const grilleModifiee = Object.keys(grilleSaisie).length > 0;

    const enregistrerGrille = async () => {
        if (!grille || !grilleModifiee) return;
        // On n'envoie que ce qui a changé : réécrire la grille entière
        // répercuterait un tarif inchangé sur des factures impayées sans raison.
        const entries = Object.entries(grilleSaisie).map(([k, v]) => {
            const [classeId, typeId] = k.split(':').map(Number);
            return { classe_id: classeId, type_frais_id: typeId, montant: parseFloat(v) || 0 };
        });
        setGrilleEnCours(true);
        try {
            const res = await api.put('/api/finance/tarifs-classe', entries);
            showMsg(res.data?.message || 'Tarifs enregistrés', 'success');
            setGrilleSaisie({});
            await queryClient.invalidateQueries({ queryKey: ['grille-tarifs'] });
            await loadAll();
        } catch (err: any) {
            showMsg(err?.response?.data?.detail || "Erreur lors de l'enregistrement", 'error');
        }
        setGrilleEnCours(false);
    };

    /* ─── Factures rattachées à aucun type de frais ──────────────────────────
       Une facture sans type n'apparaît sous aucun intitulé dans les rapports :
       le total « recettes par type de frais » l'ignore, alors que l'argent a
       bien été encaissé. Elles existaient sans que rien ne les signale. */
    const { data: orphelines } = useQuery({
        queryKey: ['factures-sans-type'],
        queryFn: async () => (await api.get('/api/finance/factures/sans-type')).data,
        staleTime: 1000 * 60 * 5,
    });
    const [rattachTypeId, setRattachTypeId] = useState('');
    const [rattachEnCours, setRattachEnCours] = useState(false);

    const rattacherOrphelines = async () => {
        if (!rattachTypeId || !orphelines?.factures?.length) return;
        const tf = typesFrais.find(t => String(t.type_frais_id) === rattachTypeId);
        if (!confirm(
            `Rattacher ${orphelines.total} facture(s) — ${fmtMoney(orphelines.montant_total)} — ` +
            `au frais « ${tf?.libelle || ''} » ?\n\n` +
            `Ces recettes seront désormais comptées sous cet intitulé.`
        )) return;
        setRattachEnCours(true);
        try {
            const res = await api.put('/api/finance/factures/rattacher-type', {
                facture_ids: orphelines.factures.map((f: any) => f.facture_id),
                type_frais_id: Number(rattachTypeId),
            });
            showMsg(res.data?.message || 'Factures rattachées', 'success');
            await queryClient.invalidateQueries({ queryKey: ['factures-sans-type'] });
            await loadAll();
        } catch (err: any) {
            showMsg(err?.response?.data?.detail || 'Erreur lors du rattachement', 'error');
        }
        setRattachEnCours(false);
    };

    // --- TypeFrais CRUD ---
    const openNewTypeFrais = () => {
        setEditingTypeFrais(null);
        setTfCode(''); setTfLibelle(''); setTfCategorie('Scolarité');
        setTfMontantDefaut(''); setTfObligatoire('O'); setTfFrequence('ANNUEL');
        setShowTypeFraisModal(true);
    };

    const openEditTypeFrais = (tf: TypeFrais) => {
        setEditingTypeFrais(tf);
        setTfCode(tf.code); setTfLibelle(tf.libelle); setTfCategorie(tf.categorie);
        setTfMontantDefaut(tf.montant_defaut?.toString() || '0');
        setTfObligatoire(tf.est_obligatoire); setTfFrequence(tf.frequence);
        setShowTypeFraisModal(true);
    };

    const submitTypeFrais = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = { code: tfCode, libelle: tfLibelle, categorie: tfCategorie, montant_defaut: parseFloat(tfMontantDefaut) || 0, est_obligatoire: tfObligatoire, frequence: tfFrequence };
            if (editingTypeFrais) {
                await api.put(`/api/finance/types-frais/${editingTypeFrais.type_frais_id}`, payload);
                showMsg('Type de frais mis à jour', 'success');
            } else {
                await api.post('/api/finance/types-frais', payload);
                showMsg('Type de frais créé', 'success');
            }
            setShowTypeFraisModal(false);
            loadAll();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    const deleteTypeFrais = async (id: number) => {
        if (!confirm('Supprimer ce type de frais ?')) return;
        try {
            await api.delete(`/api/finance/types-frais/${id}`);
            showMsg('Supprimé', 'success');
            loadAll();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // --- Facture creation ---
    const submitFacture = async (e: React.FormEvent) => {
        e.preventDefault();
        const entries = Object.entries(factClasseMontants);
        if (entries.length === 0) {
            showMsg('Sélectionnez au moins une classe.', 'error');
            return;
        }
        if (entries.some(([, m]) => !m || parseFloat(m) <= 0)) {
            showMsg('Chaque classe cochée doit avoir un montant supérieur à 0.', 'error');
            return;
        }

        // Un frais FACULTATIF (ex: cantine) facturé à toute une classe imposerait
        // le paiement à des familles qui n'y ont jamais adhéré — le backend refuse
        // ce cas par défaut (voir generer_factures_classe). On demande donc une
        // confirmation explicite avant de forcer, plutôt que de facturer en silence
        // tout le monde comme c'était le cas auparavant (bug signalé).
        const typeFraisSelectionne = typesFrais.find(t => String(t.type_frais_id) === factTypeFraisId);
        let forcerOptionnel = false;
        if (typeFraisSelectionne && typeFraisSelectionne.est_obligatoire !== 'O') {
            const ok = confirm(
                `"${typeFraisSelectionne.libelle}" est un frais FACULTATIF. Le facturer à toute la classe l'imposera aussi aux familles qui n'y ont pas adhéré. ` +
                `Pour ne facturer que les familles concernées, préférez la fiche de compte de chaque élève (Auxiliaire). Continuer quand même pour toute la classe ?`
            );
            if (!ok) return;
            forcerOptionnel = true;
        }

        // Chaque classe a son propre montant (et donc son propre échéancier, calculé
        // avec le même fractionnement pour toutes) — un appel par classe, l'endpoint
        // étant déjà idempotent (il ignore les factures déjà existantes via skipped_count).
        const nb = parseInt(factNbEcheances) || 1;
        let totalCreated = 0, totalSkipped = 0, erreurs = 0;
        for (const [classeId, montantStr] of entries) {
            const montant = parseFloat(montantStr);
            try {
                const res = await api.post('/api/finance/factures/generer-classe', {
                    classe_id: parseInt(classeId),
                    annee_id: filterAnnee,
                    type_frais_id: parseInt(factTypeFraisId),
                    montant,
                    forcer_optionnel: forcerOptionnel,
                    echeances: genererEcheances(montant, nb).map(ech => ({
                        libelle: ech.libelle,
                        montant_attendu: ech.montant_attendu,
                        date_limite: ech.date_limite
                    }))
                });
                totalCreated += res.data.created || 0;
                totalSkipped += res.data.skipped || 0;
            } catch {
                erreurs += 1;
            }
        }

        if (erreurs > 0) {
            showMsg(`${totalCreated} facture(s) générée(s), ${erreurs} classe(s) en erreur`, 'error');
        } else {
            showMsg(`${totalCreated} facture(s) générée(s) sur ${entries.length} classe(s) (${totalSkipped} déjà existante(s))`, 'success');
            setShowFactureModal(false);
        }
        loadAll();
        // Sans ça, les nouvelles factures n'apparaissent nulle part ailleurs :
        // Encaissement restait bloqué sur "élève déjà réglé" (cache solvabilité
        // vieux de 5 min ne voyant pas les factures qu'on vient de créer ici).
        queryClient.invalidateQueries({ queryKey: ['encaissement-solvabilite'] });
        queryClient.invalidateQueries({ queryKey: ['impayes'] });
        queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] });
    };

    // --- Paiement ---
    const openPaiement = (f: Facture) => {
        setSelectedFacture(f);
        setPayMontant(f.montant_restant.toString());
        setPayMode('ESPECES');
        setPayReference('');
        setPayEcheanceId('');
        setShowPaiementModal(true);
    };

    const submitPaiement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFacture) return;
        try {
            const res = await api.post('/api/finance/paiements', {
                facture_id: selectedFacture.facture_id,
                echeance_id: payEcheanceId ? parseInt(payEcheanceId) : null,
                montant: parseFloat(payMontant),
                mode_paiement: payMode,
                reference_externe: payReference || null,
            });
            showMsg(res.data.message, 'success');
            setShowPaiementModal(false);
            // Refresh via React Query
            // Même correction que sur l'écran d'Encaissement : un paiement ici doit
            // aussi invalider Impayés et le Dashboard financier, pas seulement cette page.
            queryClient.invalidateQueries({ queryKey: ['frais-all'] });
            queryClient.invalidateQueries({ queryKey: ['impayes'] });
            queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['encaissement-solvabilite'] });
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur', 'error');
        }
    };

    // Extract Categories for tabs
    const categories = Array.from(new Set(typesFrais.map(tf => tf.categorie)));
    if (!categories.includes('Scolarité')) categories.unshift('Scolarité');
    if (!categories.includes('Cantine')) categories.push('Cantine');
    if (!categories.includes('Inscription')) categories.push('Inscription');

    // Filtered factures
    useEffect(() => { setFacturesPage(1); }, [searchFacture, filterStatut, activeTab]);

    const filteredFactures = factures.filter(f => {
        const tf = typesFrais.find(t => t.type_frais_id === f.type_frais_id);
        const cat = tf ? tf.categorie : 'Scolarité';
        if (cat !== activeTab) return false;
        
        if (filterStatut && f.statut !== filterStatut) return false;
        if (searchFacture) {
            const q = searchFacture.toLowerCase();
            if (!f.eleve_nom.toLowerCase().includes(q) &&
                !f.eleve_prenom.toLowerCase().includes(q) &&
                !f.numero_facture.toLowerCase().includes(q) &&
                !f.classe_nom.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const fmtMoney = (n: number | null | undefined) => (n || 0).toLocaleString('fr-FR') + ' GNF';

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Filtre année scolaire */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                <AnneeFilter value={filterAnnee} onChange={setFilterAnnee} />
            </div>
            {filterAnnee !== anneeCouranteId && (
                <div style={{ padding: '10px 16px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: '16px' }}>
                    Vous consultez une année scolaire archivée — les nouvelles factures générées ici seront rattachées à CETTE année, pas à l'année en cours.
                </div>
            )}
            {/* Message */}
            {message && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', backgroundColor: message.type === 'error' ? '#fee2e2' : '#d1fae5', color: message.type === 'error' ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                    {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    {[
                        { label: 'Total Facturé', value: fmtMoney(stats.total_facture), color: '#3b82f6', icon: FileText },
                        { label: 'Total Encaissé', value: fmtMoney(stats.total_paye), color: '#10b981', icon: CheckCircle2 },
                        { label: 'Reste à Recouvrer', value: fmtMoney(stats.total_restant), color: '#f59e0b', icon: AlertTriangle },
                        { label: 'Taux de Recouvrement', value: `${stats.taux_recouvrement}%`, color: stats.taux_recouvrement >= 80 ? '#10b981' : '#f59e0b', icon: RefreshCw },
                    ].map(({ label, value, color, icon: Icon }) => (
                        <div key={label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{label}</p>
                                    <p style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{value}</p>
                                </div>
                                <Icon size={20} color={color} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* =========== TAB: TYPES DE FRAIS =========== */}
            {tabParam === 'types' && (
              <>
                {/* On ne devine pas ce que ces factures facturent — c'est de
                    l'argent. On les montre, et l'école le dit elle-même. */}
                {orphelines?.total > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <AlertTriangle size={20} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#92400e' }}>
                                    {orphelines.total} facture{orphelines.total > 1 ? 's' : ''} ne {orphelines.total > 1 ? 'sont' : 'est'} rattachée{orphelines.total > 1 ? 's' : ''} à aucun frais
                                </h4>
                                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#92400e', lineHeight: 1.6 }}>
                                    Elles totalisent <strong>{fmtMoney(orphelines.montant_total)}</strong>. L&apos;argent
                                    a bien été encaissé, mais ces recettes n&apos;apparaissent sous aucun intitulé
                                    dans les rapports — le total par type de frais les ignore.
                                </p>

                                {typesFrais.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                                        Créez d&apos;abord un type de frais ci-dessous, puis revenez les rattacher.
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <select value={rattachTypeId} onChange={e => setRattachTypeId(e.target.value)}
                                            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #fcd34d', background: '#fff', fontSize: '13px', minWidth: '220px' }}>
                                            <option value="">Ces factures correspondent à…</option>
                                            {typesFrais.map(tf => (
                                                <option key={tf.type_frais_id} value={tf.type_frais_id}>{tf.libelle}</option>
                                            ))}
                                        </select>
                                        <button onClick={rattacherOrphelines} disabled={!rattachTypeId || rattachEnCours}
                                            style={{
                                                padding: '9px 16px', borderRadius: '8px', border: 'none',
                                                background: rattachTypeId ? '#b45309' : '#e2e8f0',
                                                color: rattachTypeId ? '#fff' : '#94a3b8',
                                                fontSize: '13px', fontWeight: 700,
                                                cursor: rattachTypeId ? 'pointer' : 'not-allowed',
                                            }}>
                                            {rattachEnCours ? 'Rattachement…' : 'Rattacher'}
                                        </button>
                                        <details style={{ fontSize: '12.5px', color: '#92400e' }}>
                                            <summary style={{ cursor: 'pointer' }}>Voir lesquelles</summary>
                                            <div style={{ maxHeight: '180px', overflowY: 'auto', marginTop: '8px', background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px' }}>
                                                {orphelines.factures.map((f: any) => (
                                                    <div key={f.facture_id} style={{ padding: '4px 0', borderBottom: '1px solid #fef3c7', color: '#78350f' }}>
                                                        {f.numero_facture} · {f.eleve} · {f.classe} · <strong>{fmtMoney(f.montant_net)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Paramétrage des Tarifs</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Gérez tous les types de frais applicables aux élèves</p>
                        </div>
                        <button onClick={openNewTypeFrais} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                            <PlusCircle size={16} /> Nouveau type de frais
                        </button>
                    </div>

                    {/* Category Groups */}
                    {CATEGORIES_FRAIS.map(cat => {
                        const items = typesFrais.filter(tf => tf.categorie === cat);
                        if (items.length === 0) return null;
                        return (
                            <div key={cat} style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 0', borderBottom: '1px solid #f1f5f9', marginBottom: '8px' }}>
                                    {cat}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {items.map(tf => (
                                        <div key={tf.type_frais_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <span style={{ fontWeight: '700', fontSize: '13px', color: '#475569', padding: '2px 8px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}>{tf.code}</span>
                                                <div>
                                                    <p style={{ margin: '0 0 2px 0', fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{tf.libelle}</p>
                                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
                                                        {tf.frequence} · {tf.est_obligatoire === 'O' ? <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Obligatoire</> : '✓ Facultatif'}
                                                        {tf.montant_defaut > 0 && <><Coins size={12} style={{display:'inline', verticalAlign:'middle'}}/> {' ' + fmtMoney(tf.montant_defaut)}</>}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => openTarifsModal(tf)} title="Tarifs par classe"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#ecfdf5', color: '#059669', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                                                    <Coins size={14} /> Tarifs par classe
                                                </button>
                                                <button onClick={() => openEditTypeFrais(tf)} style={{ padding: '6px 10px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => deleteTypeFrais(tf.type_frais_id)} style={{ padding: '6px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {typesFrais.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                            <Coins size={40} style={{ margin: '0 auto 12px auto' }} />
                            <p style={{ fontWeight: '600' }}>Aucun type de frais configuré</p>
                            <p style={{ fontSize: '13px' }}>Commencez par créer vos catégories de frais (Inscription, Scolarité, etc.)</p>
                        </div>
                    )}
                </div>
              </>
            )}

            {/* =========== TAB: TARIFS PAR CLASSE =========== */}
            {/* La question d'un fondateur est « la 6ᵉ, ça coûte combien à
                l'année ? ». Avant, il fallait ouvrir chaque type de frais l'un
                après l'autre et additionner de tête. */}
            {tabParam === 'tarifs' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', gap: '16px', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Ce que coûte l&apos;année, classe par classe</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                                Chaque école fixe ses propres montants. La scolarité de la 7ᵉ n&apos;est pas
                                celle de la Terminale.
                            </p>
                        </div>
                        {grilleModifiee && (
                            <button onClick={enregistrerGrille} disabled={grilleEnCours}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                                {grilleEnCours ? 'Enregistrement…' : 'Enregistrer les tarifs'}
                            </button>
                        )}
                    </div>

                    {/* Un écran vide qui dit « allez ailleurs » sans y emmener est un
                        cul-de-sac. Et il manque parfois DEUX choses : les frais et les
                        classes. On dit lesquelles, dans l'ordre où il faut les faire. */}
                    {!grille ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Chargement…</div>
                    ) : grille.types_frais.length === 0 || grille.classes.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <Coins size={40} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
                            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '16px', margin: '0 0 6px' }}>
                                Il manque {grille.types_frais.length === 0 && grille.classes.length === 0
                                    ? 'deux choses' : 'une chose'} avant de pouvoir fixer les tarifs
                            </p>
                            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 22px' }}>
                                Un tarif, c&apos;est un montant pour <strong>une classe</strong> et
                                <strong> un type de frais</strong>. Il faut les deux.
                            </p>

                            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '620px', margin: '0 auto' }}>
                                <div style={{ flex: '1 1 260px', border: `1px solid ${grille.classes.length === 0 ? '#fde68a' : '#dcfce7'}`, background: grille.classes.length === 0 ? '#fffbeb' : '#f0fdf4', borderRadius: '12px', padding: '18px', textAlign: 'left' }}>
                                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '14px', color: grille.classes.length === 0 ? '#92400e' : '#15803d' }}>
                                        {grille.classes.length === 0 ? '1. Vos classes' : '✓ Vos classes'}
                                    </p>
                                    <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#64748b', lineHeight: 1.55 }}>
                                        {grille.classes.length === 0
                                            ? "Aucune classe active pour cette année scolaire. Créez-les d'abord : ce sont les lignes du tableau des tarifs."
                                            : `${grille.classes.length} classe(s) active(s) pour cette année.`}
                                    </p>
                                    {grille.classes.length === 0 && (
                                        <button onClick={() => router.push('/classes')}
                                            style={{ padding: '9px 16px', background: '#b45309', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                                            Créer mes classes
                                        </button>
                                    )}
                                </div>

                                <div style={{ flex: '1 1 260px', border: `1px solid ${grille.types_frais.length === 0 ? '#fde68a' : '#dcfce7'}`, background: grille.types_frais.length === 0 ? '#fffbeb' : '#f0fdf4', borderRadius: '12px', padding: '18px', textAlign: 'left' }}>
                                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '14px', color: grille.types_frais.length === 0 ? '#92400e' : '#15803d' }}>
                                        {grille.types_frais.length === 0 ? '2. Ce que vous faites payer' : '✓ Ce que vous faites payer'}
                                    </p>
                                    <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#64748b', lineHeight: 1.55 }}>
                                        {grille.types_frais.length === 0
                                            ? 'Scolarité, inscription, cantine… Ce sont les colonnes du tableau des tarifs.'
                                            : `${grille.types_frais.length} type(s) de frais défini(s).`}
                                    </p>
                                    {grille.types_frais.length === 0 && (
                                        <button onClick={() => { router.push('/comptabilite/frais?tab=types'); openNewTypeFrais(); }}
                                            style={{ padding: '9px 16px', background: '#b45309', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                                            Créer un type de frais
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {grille.nb_classes_incompletes > 0 && (
                                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400e', lineHeight: 1.6 }}>
                                    <strong>{grille.nb_classes_incompletes} classe{grille.nb_classes_incompletes > 1 ? 's' : ''}</strong> sur {grille.classes.length} n&apos;{grille.nb_classes_incompletes > 1 ? 'ont' : 'a'} pas
                                    de tarif pour tous les frais obligatoires. Tant qu&apos;une case reste vide, la
                                    facture se fait au montant tapé à la main — c&apos;est ainsi que deux élèves
                                    d&apos;une même classe finissent facturés différemment.
                                </div>
                            )}

                            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f8fafc' }}>
                                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', position: 'sticky', left: 0, background: '#f8fafc', minWidth: '170px' }}>Classe</th>
                                            {grille.types_frais.map((tf: any) => (
                                                <th key={tf.type_frais_id} style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569', minWidth: '140px' }}>
                                                    {tf.libelle}
                                                    <div style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8' }}>
                                                        {tf.est_obligatoire === 'O' ? 'obligatoire' : 'facultatif'}
                                                    </div>
                                                </th>
                                            ))}
                                            <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a', minWidth: '150px' }}>
                                                Total pour l&apos;année
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grille.classes.map((ligne: any) => {
                                            const total = grille.types_frais.reduce((t: number, tf: any) => {
                                                const v = valeurGrille(ligne.classe_id, tf.type_frais_id, ligne.montants[tf.type_frais_id]);
                                                return t + (parseFloat(v) || 0);
                                            }, 0);
                                            return (
                                                <tr key={ligne.classe_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a', position: 'sticky', left: 0, background: '#fff' }}>
                                                        {ligne.classe_libelle}
                                                        <div style={{ fontSize: '11.5px', fontWeight: 400, color: '#94a3b8' }}>
                                                            {ligne.effectif} élève{ligne.effectif > 1 ? 's' : ''}
                                                        </div>
                                                    </td>
                                                    {grille.types_frais.map((tf: any) => (
                                                        <td key={tf.type_frais_id} style={{ padding: '8px 14px', textAlign: 'right' }}>
                                                            <input type="number" min={0}
                                                                value={valeurGrille(ligne.classe_id, tf.type_frais_id, ligne.montants[tf.type_frais_id])}
                                                                onChange={e => majGrille(ligne.classe_id, tf.type_frais_id, e.target.value)}
                                                                placeholder="—"
                                                                style={{
                                                                    width: '125px', padding: '7px 9px', textAlign: 'right',
                                                                    border: `1px solid ${caseModifiee(ligne.classe_id, tf.type_frais_id) ? '#f59e0b' : '#e2e8f0'}`,
                                                                    borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
                                                                }} />
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: total > 0 ? '#059669' : '#b45309' }}>
                                                        {total > 0 ? fmtMoney(total) : 'à fixer'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <p style={{ margin: '14px 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.6 }}>
                                Laissez une case <strong>vide ou à 0</strong> pour une classe non concernée par ce
                                frais. Modifier un tarif met à jour les factures <strong>encore impayées</strong> de
                                cette classe — celles déjà réglées ne bougent pas, une recette encaissée ne se
                                réécrit pas.
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* =========== TAB: FACTURES =========== */}
            {tabParam === 'factures' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Gestion des Factures</h3>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{filteredFactures.length} facture(s) trouvée(s)</p>
                        </div>
                        <button onClick={() => {
                            setFactClasseMontants({}); setFactTypeFraisId(''); setFactMontant(''); setFactNbEcheances('1');
                            setShowFactureModal(true);
                        }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                            <PlusCircle size={16} /> Facturer une classe
                        </button>
                    </div>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {categories.map((cat: any) => (
                            <button
                                key={cat}
                                onClick={() => setActiveTab(cat)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    border: 'none',
                                    fontWeight: '500',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    backgroundColor: activeTab === cat ? '#3b82f6' : '#f1f5f9',
                                    color: activeTab === cat ? 'white' : '#64748b',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={searchFacture} onChange={e => setSearchFacture(e.target.value)} placeholder="Rechercher par nom, numéro, classe..." style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', backgroundColor: 'white', cursor: 'pointer' }}>
                            <option value="">Tous les statuts</option>
                            <option value="EN_ATTENTE">En attente</option>
                            <option value="PARTIELLEMENT_PAYEE">Partiellement payées</option>
                            <option value="PAYEE">Payées</option>
                            <option value="EN_RETARD">En retard</option>
                        </select>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    {['N° Facture', 'Élève', 'Classe', 'Type de frais', 'Montant', 'Payé', 'Reste', 'Statut', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredFactures.slice((facturesPage - 1) * FACTURES_PAGE_SIZE, facturesPage * FACTURES_PAGE_SIZE).map(f => (
                                    <tr key={f.facture_id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#3b82f6' }}>{f.numero_facture}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '500', color: '#0f172a' }}>{f.eleve_prenom} {f.eleve_nom}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{f.classe_nom}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{f.type_frais_libelle}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '600', color: '#0f172a' }}>{fmtMoney(f.montant_total)}</td>
                                        <td style={{ padding: '10px 12px', color: '#10b981', fontWeight: '600' }}>{fmtMoney(f.montant_paye)}</td>
                                        <td style={{ padding: '10px 12px', color: f.montant_restant > 0 ? '#f59e0b' : '#10b981', fontWeight: '600' }}>{fmtMoney(f.montant_restant)}</td>
                                        <td style={{ padding: '10px 12px' }}><Badge statut={f.statut} /></td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {f.statut !== 'PAYEE' && (
                                                <button onClick={() => openPaiement(f)} style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                    Encaisser
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredFactures.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucune facture trouvée</div>
                        )}
                        <Pagination page={facturesPage} pageSize={FACTURES_PAGE_SIZE} total={filteredFactures.length} onPageChange={setFacturesPage} />
                    </div>
                </div>
            )}

            {/* =========== TAB: ÉCHEANCIERS =========== */}
            {tabParam === 'echeances' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Suivi des Échéanciers</h3>
                    <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '13px' }}>Vue d'ensemble des paiements fractionnés et de leurs échéances</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {factures.filter(f => f.echeances && f.echeances.length > 0).map(f => (
                            <div key={f.facture_id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '700', color: '#3b82f6', fontSize: '14px' }}>{f.numero_facture}</span>
                                        <span style={{ color: '#0f172a', fontWeight: '600' }}>{f.eleve_prenom} {f.eleve_nom}</span>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>{f.classe_nom}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{fmtMoney(f.montant_total)}</span>
                                        <Badge statut={f.statut} />
                                        {f.statut !== 'PAYEE' && (
                                            <button onClick={() => openPaiement(f)} style={{ padding: '5px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                                Payer
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ padding: '0 16px' }}>
                                    {f.echeances.map((e, i) => (
                                        <div key={e.echeance_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < f.echeances.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <Calendar size={14} color="#94a3b8" />
                                                <span style={{ fontSize: '13px', color: '#475569' }}>{e.libelle}</span>
                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Échéance : {new Date(e.date_limite).toLocaleDateString('fr-FR')}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{fmtMoney(e.montant_attendu)}</span>
                                                <span style={{ fontSize: '12px', color: '#10b981' }}>Payé: {fmtMoney(e.montant_paye)}</span>
                                                <Badge statut={e.statut} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {factures.filter(f => f.echeances && f.echeances.length > 0).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                <Calendar size={40} style={{ margin: '0 auto 12px auto' }} />
                                <p style={{ fontWeight: '600' }}>Aucun échéancier créé</p>
                                <p style={{ fontSize: '13px' }}>Les factures générées avec fractionnement apparaîtront ici.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* =========== TAB: PAIEMENTS =========== */}
            {tabParam === 'paiements' && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>Suivi des Encaissements</h3>
                    <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '13px' }}>Historique de tous les paiements enregistrés</p>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    {['N° Reçu', 'Date', 'Élève', 'N° Facture', 'Montant', 'Mode', 'Statut'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paiements.map(p => (
                                    <tr key={p.paiement_id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#10b981' }}>{p.numero_recu}</td>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{new Date(p.date_paiement).toLocaleDateString('fr-FR')}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '500', color: '#0f172a' }}>{p.eleve_prenom} {p.eleve_nom}</td>
                                        <td style={{ padding: '10px 12px', color: '#3b82f6' }}>{p.numero_facture}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f172a' }}>{fmtMoney(p.montant)}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#f1f5f9', color: '#475569' }}>
                                                {modePaiementLabel(p.mode_paiement)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {p.statut === 'ANNULE' ? (
                                                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', backgroundColor: '#fee2e2', color: '#dc2626' }}>Annulé</span>
                                            ) : (
                                                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', backgroundColor: '#d1fae5', color: '#059669' }}>✓ Validé</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {paiements.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucun encaissement enregistré</div>
                        )}
                    </div>
                </div>
            )}

            {/* =========== MODAL: TYPE FRAIS =========== */}
            {showTypeFraisModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{editingTypeFrais ? 'Modifier' : 'Nouveau'} type de frais</h3>
                            <button onClick={() => setShowTypeFraisModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>
                        {/* Un type de frais dit CE QUE l'école fait payer, pas COMBIEN.
                            Le montant dépend de la classe : la 6ᵉ ne coûte pas comme la
                            Terminale. Le formulaire le disait mal — « Montant par défaut »
                            laissait croire à un prix unique pour toute l'école. */}
                        <form onSubmit={submitTypeFrais} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12.5px', color: '#1e40af', lineHeight: 1.55 }}>
                                Un type de frais désigne <strong>ce que l&apos;école fait payer</strong> —
                                scolarité, inscription, cantine. Le <strong>montant réel se fixe
                                ensuite par classe</strong> ; celui saisi ici sert de valeur de départ.
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>
                                    Nom du frais <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    value={tfLibelle}
                                    onChange={e => {
                                        setTfLibelle(e.target.value);
                                        // Le code est technique : le faire saisir par l'école
                                        // n'apporte rien et produit des « csfd ». On le
                                        // dérive du nom, en le laissant modifiable.
                                        if (!editingTypeFrais) {
                                            setTfCode(
                                                e.target.value
                                                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                                    .toUpperCase().replace(/[^A-Z0-9]/g, '')
                                                    .slice(0, 12)
                                            );
                                        }
                                    }}
                                    required
                                    placeholder="Frais de scolarité"
                                    autoFocus
                                    style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                    C&apos;est ce nom qui apparaîtra sur les factures et les reçus des parents.
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Catégorie</label>
                                    <select value={tfCategorie} onChange={e => setTfCategorie(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        {CATEGORIES_FRAIS.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Payé</label>
                                    <select value={tfFrequence} onChange={e => setTfFrequence(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        <option value="ANNUEL">Une fois par an</option>
                                        <option value="TRIMESTRIEL">Chaque trimestre</option>
                                        <option value="MENSUEL">Chaque mois</option>
                                        <option value="UNIQUE">Une seule fois</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>
                                    Montant de référence (GNF)
                                </label>
                                <input
                                    type="number" min={0}
                                    value={tfMontantDefaut}
                                    onChange={e => setTfMontantDefaut(e.target.value)}
                                    placeholder="150000"
                                    style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                    Facultatif. Utilisé pour les classes dont le tarif n&apos;est pas encore fixé.
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 13px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                <input
                                    type="checkbox" id="tf-obligatoire"
                                    checked={tfObligatoire === 'O'}
                                    onChange={e => setTfObligatoire(e.target.checked ? 'O' : 'N')}
                                    style={{ marginTop: 2, cursor: 'pointer' }}
                                />
                                <label htmlFor="tf-obligatoire" style={{ cursor: 'pointer', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                                    <strong>Frais obligatoire</strong>
                                    <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                                        Facturé automatiquement à tous les élèves. Décochez pour un frais
                                        optionnel — cantine, transport — facturé au cas par cas.
                                    </span>
                                </label>
                            </div>

                            {/* Le code reste visible mais discret : il sert au systeme, pas
                                a l'ecole. L'imposer en premier champ produisait des « csfd ». */}
                            <details>
                                <summary style={{ fontSize: '12.5px', color: '#64748b', cursor: 'pointer' }}>
                                    Code interne : <strong>{tfCode || '—'}</strong>
                                </summary>
                                <input
                                    value={tfCode}
                                    onChange={e => setTfCode(e.target.value.toUpperCase())}
                                    required
                                    placeholder="SCOL"
                                    style={{ width: '100%', marginTop: '8px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', textTransform: 'uppercase' }}
                                />
                                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                    Généré depuis le nom. Ne le changez que si vous savez pourquoi.
                                </span>
                            </details>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowTypeFraisModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                                <button type="submit" style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                                    {editingTypeFrais ? 'Enregistrer' : 'Créer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========== MODAL: GENERER FACTURES =========== */}
            {showFactureModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '500px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Facturer des Classes</h3>
                            <button onClick={() => setShowFactureModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#2563eb' }}>
                            <Lightbulb size={16} color="#d97706" style={{display:'inline', verticalAlign:'middle'}}/> Génère automatiquement une facture pour chaque élève actif de chaque classe cochée, sans double saisie (les classes déjà facturées pour ce type sont ignorées).
                        </div>
                        <form onSubmit={submitFacture} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Type de frais *</label>
                                <select value={factTypeFraisId} onChange={e => onSelectTypeFrais(e.target.value)} required style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                    <option value="">-- Sélectionner un type --</option>
                                    {typesFrais.map(tf => <option key={tf.type_frais_id} value={tf.type_frais_id}>{tf.libelle} ({tf.categorie})</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Montant par défaut (GNF)</label>
                                    <input type="number" value={factMontant} onChange={e => setFactMontant(e.target.value)} min="1" placeholder="ex: 500000" style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Fractionnement (toutes classes)</label>
                                    <select value={factNbEcheances} onChange={e => setFactNbEcheances(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        <option value="1">Paiement unique</option>
                                        <option value="2">2 versements</option>
                                        <option value="3">3 versements (Trimestriel)</option>
                                        <option value="6">6 versements</option>
                                        <option value="9">9 versements</option>
                                        <option value="10">10 versements</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: 6 }}>
                                    <label style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>Classes concernées et montant *</label>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button type="button" onClick={appliquerMontantATous}
                                            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                            Appliquer le montant par défaut à toutes les cochées
                                        </button>
                                        <button type="button" onClick={() => {
                                            if (Object.keys(factClasseMontants).length === classes.length) { setFactClasseMontants({}); return; }
                                            const next: Record<string, string> = {};
                                            classes.forEach((c: any) => { next[String(c.classe_id)] = factClasseMontants[String(c.classe_id)] ?? factMontant ?? ''; });
                                            setFactClasseMontants(next);
                                        }}
                                            style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                            {classes.length > 0 && Object.keys(factClasseMontants).length === classes.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                                        </button>
                                    </div>
                                </div>
                                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' }}>Cochez chaque classe concernée et ajustez son montant si sa scolarité diffère (maternelle, primaire, secondaire...).</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                                    {classes.map((c: any) => {
                                        const id = String(c.classe_id);
                                        const checked = id in factClasseMontants;
                                        return (
                                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', flex: '1 1 auto' }}>
                                                    <input type="checkbox" checked={checked} onChange={e => toggleFactClasse(id, e.target.checked)} />
                                                    {c.libelle}
                                                </label>
                                                {checked && (
                                                    <input type="number" min="1" required value={factClasseMontants[id]}
                                                        onChange={e => setFactClasseMontants(prev => ({ ...prev, [id]: e.target.value }))}
                                                        placeholder="Montant" style={{ width: '140px', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                                <button type="button" onClick={() => setShowFactureModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                                <button type="submit" style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                                    Générer les factures
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========== MODAL: TARIFS PAR CLASSE =========== */}
            {showTarifsModal && tarifsTypeFrais && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Tarifs par classe — {tarifsTypeFrais.libelle}</h3>
                            <button onClick={() => setShowTarifsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
                            Laissez à 0 les classes non concernées par ce type de frais. Ces montants sont aussi
                            visibles/modifiables depuis la fiche de configuration de chaque classe.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
                            {classes.map((c: any) => (
                                <div key={c.classe_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                    <span style={{ fontSize: '13px', color: '#334155' }}>{c.libelle}</span>
                                    <input type="number" min="0" value={tarifsMontants[String(c.classe_id)] || ''}
                                        onChange={e => setTarifsMontants(prev => ({ ...prev, [String(c.classe_id)]: e.target.value }))}
                                        placeholder="0" style={{ width: '140px', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', marginTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                            <button type="button" onClick={() => setShowTarifsModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                            <button onClick={saveTarifs} disabled={tarifsSaving} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', opacity: tarifsSaving ? 0.6 : 1 }}>
                                {tarifsSaving ? 'Enregistrement...' : 'Enregistrer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =========== MODAL: PAIEMENT =========== */}
            {showPaiementModal && selectedFacture && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Enregistrer un Paiement</h3>
                            <button onClick={() => setShowPaiementModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        {/* Recap Facture */}
                        <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Élève</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{selectedFacture.eleve_prenom} {selectedFacture.eleve_nom}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Facture</span>
                                <span style={{ fontWeight: '600', color: '#3b82f6' }}>{selectedFacture.numero_facture}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Reste à payer</span>
                                <span style={{ fontWeight: '700', color: '#f59e0b', fontSize: '16px' }}>{fmtMoney(selectedFacture.montant_restant)}</span>
                            </div>
                        </div>

                        <form onSubmit={submitPaiement} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Échéance si dispo */}
                            {selectedFacture.echeances && selectedFacture.echeances.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Appliquer à l'échéance (optionnel)</label>
                                    <select value={payEcheanceId} onChange={e => {
                                        setPayEcheanceId(e.target.value);
                                        if (e.target.value) {
                                            const ech = selectedFacture.echeances.find(ec => ec.echeance_id === parseInt(e.target.value));
                                            if (ech) setPayMontant((ech.montant_attendu - ech.montant_paye).toString());
                                        }
                                    }} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                                        <option value="">-- Paiement libre --</option>
                                        {selectedFacture.echeances.filter(e => e.statut !== 'PAYEE').map(e => (
                                            <option key={e.echeance_id} value={e.echeance_id}>
                                                {e.libelle} — Reste: {fmtMoney(e.montant_attendu - e.montant_paye)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {(() => {
                                const echeanceSelectionnee = payEcheanceId
                                    ? selectedFacture.echeances.find(ec => ec.echeance_id === parseInt(payEcheanceId))
                                    : null;
                                const maxMontant = echeanceSelectionnee
                                    ? echeanceSelectionnee.montant_attendu - echeanceSelectionnee.montant_paye
                                    : selectedFacture.montant_restant;
                                return (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Montant encaissé (GNF) *</label>
                                        <input type="number" value={payMontant} onChange={e => setPayMontant(e.target.value)} required min="1" max={maxMontant} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '16px', fontWeight: '700', boxSizing: 'border-box' }} />
                                        {echeanceSelectionnee && (
                                            <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Plafonné au reste dû sur l'échéance : {fmtMoney(maxMontant)}</p>
                                        )}
                                    </div>
                                );
                            })()}

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '8px', fontWeight: '500' }}>Mode de paiement *</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {modesAffichables.map(m => (
                                        <button key={m.value} type="button" onClick={() => setPayMode(m.value)} style={{
                                            padding: '10px', border: `2px solid ${payMode === m.value ? '#10b981' : '#e2e8f0'}`,
                                            borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                                            backgroundColor: payMode === m.value ? '#ecfdf5' : 'white',
                                            color: payMode === m.value ? '#059669' : '#475569', transition: 'all 0.2s'
                                        }}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {(payMode === 'CHEQUE' || payMode === 'MOBILE_MONEY' || payMode === 'VIREMENT') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: '500' }}>Référence externe</label>
                                    <input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="N° de chèque, transaction, etc." style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                                <button type="button" onClick={() => setShowPaiementModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
                                <button type="submit" style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '15px' }}>
                                    ✓ Valider le paiement
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Chargement...</div>}>
            <FraisScolaritePage />
        </Suspense>
    );
}
