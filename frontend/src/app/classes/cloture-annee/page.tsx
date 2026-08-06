'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, ChevronRight, Loader2, GraduationCap, RefreshCw, CheckCircle2, AlertTriangle, Lock,
    Calculator, ShieldCheck, Ban, Landmark, CalendarPlus, UserCheck, Banknote, Archive as ArchiveIcon,
    PartyPopper, Coins, X, Save, ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import Stepper, { StepDef, StepStatus } from '@/components/Stepper';

interface Annee { annee_id: number; code: string; libelle: string; est_courante: string; }
interface ClasseItem { classe_id: number; libelle: string; code: string; effectif_actuel: number; niveau_id: number; }
interface ElevePreview {
    eleve_id: number; inscription_id: number; nom: string; prenom: string; matricule: string;
    moyenne_annuelle: number | null; total_points: number | null; rang: number | null;
    decision: string; classe_cible_id: number | null;
    statut_promotion: string | null;
}
interface Apercu {
    classe: { classe_id: number; libelle: string };
    niveau_suivant: { niveau_id: number; libelle: string } | null;
    frontiere_lycee: boolean;
    terminal: boolean;
    seuil_redoublement: number;
    redoublement_actif: boolean;
    deja_calcule: boolean;
    eleves: ElevePreview[];
}
interface Controle { code: string; label: string; severite: string; ok: boolean; detail: string; }
interface VerificationCloture {
    annee_id: number; annee_libelle: string; annee_statut: string;
    date_cloture_comptable: string | null; peut_cloturer: boolean; controles: Controle[];
}
interface EtatPromotion {
    classes: { classe_id: number; libelle: string; total_eleves: number; calcules: number; valides: number; sans_classe_cible: number; en_attente_filiere: number }[];
    total_classes: number; classes_entierement_calculees: number; classes_entierement_validees: number;
    eleves: number; calcules: number; valides: number; sans_classe_cible: number; en_attente_filiere: number;
}
interface EtatReinscription { total: number; par_statut: Record<string, number>; }

const DECISION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    ADMIS: { bg: '#d1fae5', color: '#059669', label: 'Admis' },
    REDOUBLANT: { bg: '#fef3c7', color: '#b45309', label: 'Redoublant' },
    EN_ATTENTE_FILIERE: { bg: '#dbeafe', color: '#1d4ed8', label: 'En attente du choix de filière' },
    DIPLOME: { bg: '#e0e7ff', color: '#4338ca', label: 'Diplômé' },
    EXCLU: { bg: '#fee2e2', color: '#b91c1c', label: 'Exclu' },
};

const REINSCRIPTION_LABEL: Record<string, string> = {
    A_REINSCRIRE: 'En attente', REINSCRIT: 'Réinscrit(e)', NON_REINSCRIT: 'Non réinscrit(e)',
    TRANSFERE: 'Transféré(e)', ABANDON: 'Abandon',
};

const ETAPES = [
    { id: 'verification', numero: 1, label: 'Vérification' },
    { id: 'cloture_comptable', numero: 2, label: 'Clôture comptable' },
    { id: 'creation_annee', numero: 3, label: 'Nouvelle année scolaire' },
    { id: 'resultats', numero: 4, label: 'Calcul des résultats' },
    { id: 'promotions', numero: 5, label: 'Promotions' },
    { id: 'filieres', numero: 6, label: 'Choix des filières' },
    { id: 'reinscription', numero: 7, label: 'Campagne de réinscription' },
    { id: 'frais', numero: 8, label: 'Génération des frais' },
    { id: 'archivage', numero: 9, label: 'Archivage' },
    { id: 'validation', numero: 10, label: 'Validation finale' },
] as const;

const cardStyle: React.CSSProperties = { background: 'white', borderRadius: '16px', border: '1px solid var(--border-light)', padding: '24px' };
const btnPrimary: React.CSSProperties = { padding: '11px 20px', borderRadius: '10px', border: 'none', background: '#b45309', color: 'white', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' };
const btnOutline: React.CSSProperties = { padding: '10px 18px', borderRadius: '10px', border: '1px solid #3b82f6', background: 'white', color: '#1d4ed8', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' };

export default function ClotureAnneePage() {
    const [annees, setAnnees] = useState<Annee[]>([]);
    const [anneeSourceId, setAnneeSourceId] = useState<number | null>(null);
    const [anneeCibleId, setAnneeCibleId] = useState<number | null>(null);
    const [classes, setClasses] = useState<ClasseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [preparingClasses, setPreparingClasses] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [activeStep, setActiveStep] = useState<string>('verification');
    const hasAutoNavigated = useRef(false);

    const [selectedClasse, setSelectedClasse] = useState<ClasseItem | null>(null);
    const [apercu, setApercu] = useState<Apercu | null>(null);
    const [apercuLoading, setApercuLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [calculatingAll, setCalculatingAll] = useState(false);
    const [validating, setValidating] = useState(false);
    const [validatingAll, setValidatingAll] = useState(false);
    const [rowBusy, setRowBusy] = useState<number | null>(null);

    const [verifCloture, setVerifCloture] = useState<VerificationCloture | null>(null);
    const [cloturing, setCloturing] = useState(false);

    const [etatPromotion, setEtatPromotion] = useState<EtatPromotion | null>(null);
    const [etatReinscription, setEtatReinscription] = useState<EtatReinscription | null>(null);

    const [showCreateAnnee, setShowCreateAnnee] = useState(false);
    const [newAnnee, setNewAnnee] = useState({ code: '', libelle: '', date_debut: '', date_fin: '' });
    const [creatingAnnee, setCreatingAnnee] = useState(false);
    const [tarifsModal, setTarifsModal] = useState<{ nouvelleAnneeId: number; nouvelleAnneeLibelle: string } | null>(null);
    const [tarifsAnneeSourceId, setTarifsAnneeSourceId] = useState<number | null>(null);
    const [tarifsMode, setTarifsMode] = useState<'copier' | 'copier_editer' | 'vide'>('copier');
    const [tarifsLoading, setTarifsLoading] = useState(false);

    const [archiving, setArchiving] = useState(false);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMsg({ text, type });
        setTimeout(() => setMsg(null), 7000);
    };

    const loadAnnees = useCallback(async () => {
        try {
            const res = await api.get('/api/parametrage/annees?etablissement_id=1');
            const list: Annee[] = res.data || [];
            setAnnees(list);
            const courante = list.find(a => a.est_courante === 'O') || list[0];
            if (courante && anneeSourceId === null) setAnneeSourceId(courante.annee_id);
        } catch {
            showMsg('Impossible de charger la liste des années scolaires.', 'error');
        } finally {
            setLoading(false);
        }
    }, [anneeSourceId]);

    useEffect(() => { loadAnnees(); }, [loadAnnees]);

    const reloadClasses = useCallback(async () => {
        if (!anneeSourceId) return;
        try {
            const res = await api.get(`/api/classes?etablissement_id=1&annee_id=${anneeSourceId}`);
            setClasses(res.data || []);
        } catch {
            showMsg('Impossible de charger les classes de cette année.', 'error');
        }
    }, [anneeSourceId]);

    useEffect(() => { reloadClasses(); }, [reloadClasses]);

    const loadVerification = useCallback(async () => {
        if (!anneeSourceId) { setVerifCloture(null); return; }
        try {
            const res = await api.get(`/api/annee-scolaire/${anneeSourceId}/verification-cloture`);
            setVerifCloture(res.data);
        } catch {
            setVerifCloture(null);
        }
    }, [anneeSourceId]);

    const loadEtatPromotion = useCallback(async () => {
        if (!anneeSourceId) { setEtatPromotion(null); return; }
        try {
            const res = await api.get(`/api/promotion/annee/${anneeSourceId}/etat`);
            setEtatPromotion(res.data);
        } catch {
            setEtatPromotion(null);
        }
    }, [anneeSourceId]);

    const loadEtatReinscription = useCallback(async () => {
        if (!anneeCibleId) { setEtatReinscription(null); return; }
        try {
            const res = await api.get(`/api/reinscription/etat/${anneeCibleId}`);
            setEtatReinscription(res.data);
        } catch {
            setEtatReinscription(null);
        }
    }, [anneeCibleId]);

    useEffect(() => { loadVerification(); loadEtatPromotion(); }, [loadVerification, loadEtatPromotion]);
    useEffect(() => { loadEtatReinscription(); }, [loadEtatReinscription]);

    const preparerClasses = async () => {
        if (!anneeSourceId || !anneeCibleId) {
            showMsg('Sélectionnez une année source et une année cible.', 'error');
            return;
        }
        if (anneeSourceId === anneeCibleId) {
            showMsg('L’année cible doit être différente de l’année source.', 'error');
            return;
        }
        setPreparingClasses(true);
        try {
            const res = await api.post(`/api/promotion/annee/${anneeCibleId}/preparer-classes?annee_source_id=${anneeSourceId}`);
            showMsg(res.data?.message || 'Classes préparées.', 'success');
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la préparation des classes de l’année cible.', 'error');
        } finally {
            setPreparingClasses(false);
        }
    };

    const ouvrirApercu = async (classe: ClasseItem) => {
        setSelectedClasse(classe);
        setApercu(null);
        setApercuLoading(true);
        try {
            const res = await api.get(`/api/promotion/classe/${classe.classe_id}/apercu`);
            setApercu(res.data);
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Impossible de charger l’aperçu de cette classe.', 'error');
            setSelectedClasse(null);
        } finally {
            setApercuLoading(false);
        }
    };

    const rafraichirApercu = async () => {
        if (!selectedClasse) return;
        const res = await api.get(`/api/promotion/classe/${selectedClasse.classe_id}/apercu`);
        setApercu(res.data);
    };

    const calculerResultats = async (classeId: number) => {
        if (!anneeCibleId) { showMsg('Sélectionnez d’abord une année cible.', 'error'); return; }
        setCalculating(true);
        try {
            const res = await api.post(`/api/promotion/classe/${classeId}/calculer-resultats`, { annee_cible_id: anneeCibleId });
            showMsg(res.data?.message || 'Résultats calculés.', 'success');
            await rafraichirApercu();
            await loadEtatPromotion();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec du calcul des résultats.', 'error');
        } finally {
            setCalculating(false);
        }
    };

    const calculerResultatsTout = async () => {
        if (!anneeSourceId || !anneeCibleId) { showMsg('Sélectionnez une année source et une année cible.', 'error'); return; }
        setCalculatingAll(true);
        try {
            const res = await api.post(`/api/promotion/annee/${anneeSourceId}/calculer-resultats-tout`, { annee_cible_id: anneeCibleId });
            const r = res.data;
            showMsg(`${r.classes_traitees} classe(s) traitée(s) — ${r.total.proposes} proposé(s), ${r.total.en_attente_serie} en attente de filière, ${r.total.diplomes} diplômé(s).`, 'success');
            await loadEtatPromotion();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec du calcul global des résultats.', 'error');
        } finally {
            setCalculatingAll(false);
        }
    };

    const exclureEleve = async (inscriptionId: number, nomComplet: string) => {
        if (!confirm(`Exclure ${nomComplet} ? Cet élève ne sera proposé à aucune classe l'an prochain et n'entrera pas dans la campagne de réinscription.`)) return;
        setRowBusy(inscriptionId);
        try {
            await api.put(`/api/promotion/eleve/${inscriptionId}/decision`, { decision: 'EXCLU' });
            await rafraichirApercu();
            await loadEtatPromotion();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de l’exclusion.', 'error');
        } finally {
            setRowBusy(null);
        }
    };

    const validerClasse = async () => {
        if (!selectedClasse) return;
        if (!confirm(`Valider définitivement la promotion de "${selectedClasse.libelle}" ? Les élèves seront désactivés et la campagne de réinscription s'ouvrira pour eux. Non modifiable après validation.`)) return;
        setValidating(true);
        try {
            const res = await api.post(`/api/promotion/classe/${selectedClasse.classe_id}/valider`);
            showMsg(`${res.data.valides} élève(s) validé(s) pour ${selectedClasse.libelle}.`, 'success');
            await rafraichirApercu();
            await reloadClasses();
            await loadEtatPromotion();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la validation.', 'error');
        } finally {
            setValidating(false);
        }
    };

    const validerTout = async () => {
        if (!anneeSourceId) return;
        if (!confirm(`Valider définitivement la promotion de TOUTES les classes (${classes.length}) ? Les classes dont un élève n'a pas encore de filière choisie seront signalées et ignorées.`)) return;
        setValidatingAll(true);
        try {
            const res = await api.post(`/api/promotion/annee/${anneeSourceId}/valider-tout`);
            const r = res.data;
            const bloqueesTxt = r.classes_bloquees?.length
                ? ` — ${r.classes_bloquees.length} classe(s) bloquée(s) (filière non choisie) : ${r.classes_bloquees.map((c: any) => c.classe).join(', ')}`
                : '';
            showMsg(`${r.total_valides} élève(s) validé(s) sur ${r.classes_traitees} classe(s)${bloqueesTxt}`, r.classes_bloquees?.length ? 'error' : 'success');
            await reloadClasses();
            await loadEtatPromotion();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la validation globale.', 'error');
        } finally {
            setValidatingAll(false);
        }
    };

    const cloturerComptabilite = async () => {
        if (!anneeSourceId || !verifCloture?.peut_cloturer) return;
        if (!confirm(`Clôturer définitivement la comptabilité de ${verifCloture.annee_libelle} ? Plus aucune facture/paiement/dépense ne pourra être créé ou modifié pour cette année.`)) return;
        setCloturing(true);
        try {
            await api.post(`/api/annee-scolaire/${anneeSourceId}/cloturer-comptabilite`);
            showMsg('Comptabilité clôturée avec succès.', 'success');
            await loadVerification();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la clôture comptable.', 'error');
        } finally {
            setCloturing(false);
        }
    };

    const creerNouvelleAnnee = async () => {
        if (!newAnnee.code || !newAnnee.libelle || !newAnnee.date_debut || !newAnnee.date_fin) {
            showMsg('Renseignez tous les champs de la nouvelle année.', 'error');
            return;
        }
        setCreatingAnnee(true);
        try {
            const res = await api.post('/api/parametrage/annees', {
                etablissement_id: 1, ...newAnnee, statut: 'PLANIFIEE', est_courante: 'N',
            });
            showMsg('Nouvelle année scolaire créée.', 'success');
            setShowCreateAnnee(false);
            setNewAnnee({ code: '', libelle: '', date_debut: '', date_fin: '' });
            await loadAnnees();
            const nouvelleAnnee = res.data;
            setAnneeCibleId(nouvelleAnnee.annee_id);
            if (anneeSourceId) {
                setTarifsAnneeSourceId(anneeSourceId);
                setTarifsMode('copier');
                setTarifsModal({ nouvelleAnneeId: nouvelleAnnee.annee_id, nouvelleAnneeLibelle: nouvelleAnnee.libelle });
            }
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la création de l’année.', 'error');
        } finally {
            setCreatingAnnee(false);
        }
    };

    const confirmerTarifsModal = async () => {
        if (!tarifsModal) return;
        if (tarifsMode !== 'vide' && !tarifsAnneeSourceId) {
            showMsg('Sélectionnez l’année source des tarifs à reprendre.', 'error');
            return;
        }
        setTarifsLoading(true);
        try {
            await api.post('/api/finance/tarifs/copier', {
                annee_source_id: tarifsAnneeSourceId,
                annee_cible_id: tarifsModal.nouvelleAnneeId,
                mode: tarifsMode,
            });
            showMsg(tarifsMode === 'vide' ? 'Grille tarifaire laissée vide pour la nouvelle année.' : 'Les tarifs ont été copiés vers la nouvelle année.', 'success');
            setTarifsModal(null);
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'La copie des tarifs a échoué.', 'error');
        } finally {
            setTarifsLoading(false);
        }
    };

    const archiverAnnee = async () => {
        if (!anneeSourceId) return;
        if (!confirm(`Archiver définitivement ${verifCloture?.annee_libelle || 'cette année'} ? Plus aucune donnée pédagogique ou comptable ne sera modifiable ensuite.`)) return;
        setArchiving(true);
        try {
            await api.post(`/api/annee-scolaire/${anneeSourceId}/archiver`);
            showMsg('Année archivée avec succès.', 'success');
            await loadVerification();
            setActiveStep('validation');
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de l’archivage.', 'error');
        } finally {
            setArchiving(false);
        }
    };

    const anneeStatut = verifCloture?.annee_statut;

    const stepStatus = (id: string): StepStatus => {
        switch (id) {
            case 'verification':
                if (!verifCloture) return 'a_faire';
                return verifCloture.peut_cloturer || anneeStatut === 'CLOTURE_COMPTABLE' || anneeStatut === 'ARCHIVEE' ? 'fait' : 'attention';
            case 'cloture_comptable':
                return anneeStatut === 'CLOTURE_COMPTABLE' || anneeStatut === 'ARCHIVEE' ? 'fait' : 'a_faire';
            case 'creation_annee':
                return anneeCibleId ? 'fait' : 'a_faire';
            case 'resultats':
                return !!(etatPromotion && etatPromotion.total_classes > 0 && etatPromotion.classes_entierement_calculees === etatPromotion.total_classes) ? 'fait' : 'a_faire';
            case 'promotions':
                return !!(etatPromotion && etatPromotion.total_classes > 0 && etatPromotion.classes_entierement_validees === etatPromotion.total_classes) ? 'fait' : 'a_faire';
            case 'filieres':
                if (!etatPromotion || etatPromotion.total_classes === 0) return 'a_faire';
                return etatPromotion.en_attente_filiere > 0 ? 'attention' : 'fait';
            case 'reinscription':
                return stepStatus('promotions') === 'fait' ? 'fait' : 'a_faire';
            case 'frais': {
                if (!etatReinscription || etatReinscription.total === 0) return 'a_faire';
                const enAttente = (etatReinscription.par_statut.A_REINSCRIRE || 0) + (etatReinscription.par_statut.NON_REINSCRIT || 0);
                return enAttente > 0 ? 'attention' : 'fait';
            }
            case 'archivage':
                return anneeStatut === 'ARCHIVEE' ? 'fait' : 'a_faire';
            case 'validation':
                return anneeStatut === 'ARCHIVEE' ? 'fait' : 'a_faire';
            default:
                return 'a_faire';
        }
    };

    const steps: StepDef[] = ETAPES.map(e => ({ id: e.id, numero: e.numero, label: e.label, status: stepStatus(e.id) }));

    // Au premier chargement des données, place l'utilisateur sur la première
    // étape non terminée plutôt que de le laisser toujours sur "Vérification"
    // — mais une seule fois, pour ne jamais le faire sauter d'étape pendant
    // qu'il navigue manuellement ensuite.
    useEffect(() => {
        if (hasAutoNavigated.current || !verifCloture) return;
        hasAutoNavigated.current = true;
        const premierePasFaite = steps.find(s => s.status !== 'fait');
        if (premierePasFaite) setActiveStep(premierePasFaite.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verifCloture, etatPromotion]);

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={32} className="animate-spin" /></div>;
    }

    const toutValide = apercu?.eleves.length ? apercu.eleves.every(e => e.statut_promotion === 'VALIDE') : false;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1300px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/classes" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div className="breadcrumb">
                    <Link href="/">Accueil</Link>
                    <ChevronRight size={14} />
                    <Link href="/classes">Classes & Effectifs</Link>
                    <ChevronRight size={14} />
                    <span>Assistant de fin d&apos;année</span>
                </div>
            </div>

            <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <GraduationCap size={26} color="#b45309" /> Assistant de fin d&apos;année scolaire
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                    Parcourez les 10 étapes dans l&apos;ordre, ou naviguez librement — chaque étape reflète l&apos;état
                    réel des données, pas une simple case à cocher. Rien n&apos;est définitif tant que vous n&apos;avez
                    pas explicitement validé/clôturé/archivé.
                </p>
            </div>

            {msg && (
                <div style={{ padding: '12px 16px', borderRadius: '10px', background: msg.type === 'error' ? '#fee2e2' : '#d1fae5', color: msg.type === 'error' ? '#b91c1c' : '#047857', fontWeight: 600, fontSize: '14px' }}>
                    {msg.text}
                </div>
            )}

            <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'end' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Année à clôturer (source)</label>
                    <select value={anneeSourceId ?? ''} onChange={e => setAnneeSourceId(Number(e.target.value))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', minWidth: 220 }}>
                        {annees.map(a => <option key={a.annee_id} value={a.annee_id}>{a.libelle}{a.est_courante === 'O' ? ' (en cours)' : ''}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Année suivante (cible)</label>
                    <select value={anneeCibleId ?? ''} onChange={e => setAnneeCibleId(Number(e.target.value) || null)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', minWidth: 220 }}>
                        <option value="">-- Créer à l&apos;étape 3, ou choisir --</option>
                        {annees.filter(a => a.annee_id !== anneeSourceId).map(a => <option key={a.annee_id} value={a.annee_id}>{a.libelle}</option>)}
                    </select>
                </div>
                {anneeCibleId && (
                    <button onClick={preparerClasses} disabled={preparingClasses} className="btn btn-outline"
                        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', opacity: preparingClasses ? 0.6 : 1 }}>
                        {preparingClasses ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Préparer les classes de l&apos;année cible
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
                <div className="card" style={{ padding: '20px 20px 4px' }}>
                    <Stepper steps={steps} activeId={activeStep} onSelect={setActiveStep} />
                </div>

                <div style={cardStyle}>
                    {/* ── 1. Vérification ── */}
                    {activeStep === 'verification' && (
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>1. Vérification</h3>
                            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Ces contrôles doivent tous passer (BLOQUANT) avant de pouvoir clôturer la comptabilité de l&apos;année.
                            </p>
                            {!verifCloture ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader2 size={24} className="animate-spin" /></div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {verifCloture.controles.map(c => (
                                        <div key={c.code} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8,
                                            background: c.ok ? '#ecfdf5' : (c.severite === 'BLOQUANT' ? '#fef2f2' : '#fffbeb'),
                                            border: `1px solid ${c.ok ? '#a7f3d0' : (c.severite === 'BLOQUANT' ? '#fecaca' : '#fde68a')}`,
                                        }}>
                                            {c.ok ? <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
                                                : <AlertTriangle size={18} color={c.severite === 'BLOQUANT' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0, marginTop: 1 }} />}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.label}</span>
                                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', background: c.severite === 'BLOQUANT' ? '#fee2e2' : '#fef3c7', color: c.severite === 'BLOQUANT' ? '#b91c1c' : '#92400e' }}>{c.severite}</span>
                                                </div>
                                                <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{c.detail}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 2. Clôture comptable ── */}
                    {activeStep === 'cloture_comptable' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, padding: '10px 0' }}>
                            <div style={{ width: 60, height: 60, borderRadius: 999, background: stepStatus('cloture_comptable') === 'fait' ? '#ecfdf5' : '#fffbeb', color: stepStatus('cloture_comptable') === 'fait' ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Landmark size={28} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>2. Clôture comptable</h3>
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460 }}>
                                    {stepStatus('cloture_comptable') === 'fait'
                                        ? `Comptabilité clôturée le ${verifCloture?.date_cloture_comptable || '—'} — lecture seule.`
                                        : "Verrouille définitivement toutes les factures/paiements/dépenses de l'année (étape 1 doit être en ordre)."}
                                </p>
                            </div>
                            {stepStatus('cloture_comptable') !== 'fait' && (
                                <button onClick={cloturerComptabilite} disabled={cloturing || !verifCloture?.peut_cloturer} style={{ ...btnPrimary, opacity: (cloturing || !verifCloture?.peut_cloturer) ? 0.5 : 1 }}>
                                    {cloturing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                                    Clôturer la comptabilité
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── 3. Création nouvelle année ── */}
                    {activeStep === 'creation_annee' && (
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>3. Nouvelle année scolaire</h3>
                            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                                L&apos;année cible doit exister avant de pouvoir calculer les résultats/promotions (elle accueillera les classes des élèves promus).
                            </p>
                            {anneeCibleId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                                    <CheckCircle2 size={18} /> Année cible sélectionnée : {annees.find(a => a.annee_id === anneeCibleId)?.libelle}
                                </div>
                            ) : !showCreateAnnee ? (
                                <button onClick={() => setShowCreateAnnee(true)} style={btnOutline}>
                                    <CalendarPlus size={16} /> Créer la nouvelle année
                                </button>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <input placeholder="Code (ex: 2027-2028)" value={newAnnee.code} onChange={e => setNewAnnee(s => ({ ...s, code: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-light)' }} />
                                        <input placeholder="Libellé" value={newAnnee.libelle} onChange={e => setNewAnnee(s => ({ ...s, libelle: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-light)' }} />
                                        <input type="date" value={newAnnee.date_debut} onChange={e => setNewAnnee(s => ({ ...s, date_debut: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-light)' }} />
                                        <input type="date" value={newAnnee.date_fin} onChange={e => setNewAnnee(s => ({ ...s, date_fin: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-light)' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button onClick={creerNouvelleAnnee} disabled={creatingAnnee} style={{ ...btnPrimary, opacity: creatingAnnee ? 0.6 : 1 }}>
                                            {creatingAnnee ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Créer
                                        </button>
                                        <button onClick={() => setShowCreateAnnee(false)} style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 4. Calcul des résultats ── */}
                    {activeStep === 'resultats' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>4. Calcul des résultats</h3>
                                <button onClick={calculerResultatsTout} disabled={calculatingAll || !anneeCibleId || classes.length === 0} style={{ ...btnOutline, opacity: (!anneeCibleId || calculatingAll || classes.length === 0) ? 0.5 : 1 }}>
                                    {calculatingAll ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                                    Calculer les résultats (toutes)
                                </button>
                            </div>
                            {etatPromotion && etatPromotion.total_classes > 0 && (
                                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
                                    <strong>{etatPromotion.classes_entierement_calculees} / {etatPromotion.total_classes}</strong> classes entièrement calculées.
                                </p>
                            )}
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                                Le calcul est rejouable sans risque tant qu&apos;une classe n&apos;est pas validée. Cliquez une classe pour voir le détail élève par élève, ajuster (filière, exclusion) et valider individuellement.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                                {classes.map(c => (
                                    <button key={c.classe_id} onClick={() => ouvrirApercu(c)}
                                        style={{ textAlign: 'left', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'white', cursor: 'pointer' }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{c.libelle}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{c.effectif_actuel} élève(s) actif(s)</div>
                                    </button>
                                ))}
                                {classes.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Aucune classe pour cette année.</p>}
                            </div>
                        </div>
                    )}

                    {/* ── 5. Promotions ── */}
                    {activeStep === 'promotions' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>5. Promotions (validation)</h3>
                                <button onClick={validerTout} disabled={validatingAll || classes.length === 0} style={{ ...btnPrimary, opacity: (validatingAll || classes.length === 0) ? 0.5 : 1 }}>
                                    {validatingAll ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                                    Valider (toutes)
                                </button>
                            </div>
                            {etatPromotion && etatPromotion.total_classes > 0 && (
                                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
                                    <strong>{etatPromotion.classes_entierement_validees} / {etatPromotion.total_classes}</strong> classes entièrement validées
                                    ({etatPromotion.valides} / {etatPromotion.eleves} élève(s)).
                                </p>
                            )}
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                                Définitif : les élèves des classes validées sont désactivés et la campagne de réinscription s&apos;ouvre pour eux.
                                Les élèves de 10e admis passent automatiquement « en attente du choix de filière » — le choix de filière ne bloque jamais cette étape (voir étape 6).
                            </p>
                            <button onClick={() => setActiveStep('resultats')} style={{ ...btnOutline, background: '#f8fafc' }}>
                                Ouvrir la vue détaillée par classe
                            </button>
                        </div>
                    )}

                    {/* ── 6. Choix des filières ── */}
                    {activeStep === 'filieres' && (
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>6. Choix des filières</h3>
                            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                                Purement informatif — le choix de filière (SE/SM/SS) des élèves de 10e année admis ne se fait plus ici et ne bloque jamais la promotion. Il se fera au moment de leur réinscription (étape 7).
                            </p>
                            {!etatPromotion || etatPromotion.total_classes === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Calculez d&apos;abord les résultats (étape 4).</p>
                            ) : etatPromotion.en_attente_filiere > 0 ? (
                                <div style={{ padding: 16, borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1d4ed8', fontWeight: 700, fontSize: 14 }}>
                                        <GraduationCap size={18} /> {etatPromotion.en_attente_filiere} élève(s) en attente du choix de filière
                                    </div>
                                    <p style={{ margin: 0, fontSize: 13, color: '#1e40af' }}>
                                        Ces élèves de 10e sont admis et déjà promouvables — leur filière sera choisie lors de leur réinscription, pas ici.
                                    </p>
                                    <button onClick={() => setActiveStep('reinscription')} style={{ ...btnOutline, alignSelf: 'flex-start' }}>Aller à la campagne de réinscription</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                                    <CheckCircle2 size={18} /> Aucun élève en attente de choix de filière.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 7. Campagne de réinscription ── */}
                    {activeStep === 'reinscription' && (
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>7. Campagne de réinscription</h3>
                            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                                S&apos;ouvre automatiquement dès qu&apos;une classe est validée (étape 5) — indépendante de la promotion, gérée depuis sa propre page dédiée.
                            </p>
                            {stepStatus('promotions') !== 'fait' && stepStatus('reinscription') !== 'fait' ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Validez d&apos;abord les promotions (étape 5) pour ouvrir la campagne.</p>
                            ) : (
                                <>
                                    {etatReinscription && etatReinscription.total > 0 && (
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                                            {Object.entries(etatReinscription.par_statut).map(([statut, count]) => (
                                                <div key={statut} style={{ padding: '10px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border-light)' }}>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{count}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{REINSCRIPTION_LABEL[statut] || statut}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <Link href={anneeCibleId ? `/comptabilite/reinscription?annee_id=${anneeCibleId}` : '/comptabilite/reinscription'}
                                        style={{ ...btnPrimary, textDecoration: 'none', width: 'fit-content' }}>
                                        <UserCheck size={16} /> Ouvrir la campagne de réinscription <ExternalLink size={14} />
                                    </Link>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── 8. Génération des frais ── */}
                    {activeStep === 'frais' && (
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>8. Génération des frais</h3>
                            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                                Automatique : chaque confirmation de réinscription (étape 7) génère immédiatement les frais obligatoires de la nouvelle année selon la grille tarifaire de la classe — rien à faire ici manuellement.
                            </p>
                            {!etatReinscription || etatReinscription.total === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aucune réinscription en cours pour le moment.</p>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: stepStatus('frais') === 'fait' ? '#059669' : '#b45309', fontWeight: 700, fontSize: 14 }}>
                                    {stepStatus('frais') === 'fait' ? <CheckCircle2 size={18} /> : <Banknote size={18} />}
                                    {etatReinscription.par_statut.REINSCRIT || 0} confirmée(s) avec frais générés
                                    {((etatReinscription.par_statut.A_REINSCRIRE || 0) + (etatReinscription.par_statut.NON_REINSCRIT || 0)) > 0 &&
                                        ` — ${(etatReinscription.par_statut.A_REINSCRIRE || 0) + (etatReinscription.par_statut.NON_REINSCRIT || 0)} en attente`}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 9. Archivage ── */}
                    {activeStep === 'archivage' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, padding: '10px 0' }}>
                            <div style={{ width: 60, height: 60, borderRadius: 999, background: stepStatus('archivage') === 'fait' ? '#ecfdf5' : '#f1f5f9', color: stepStatus('archivage') === 'fait' ? '#10b981' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArchiveIcon size={28} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>9. Archivage</h3>
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460 }}>
                                    {stepStatus('archivage') === 'fait'
                                        ? 'Cette année est archivée — consultable en lecture seule dans le centre d\'historique.'
                                        : 'Étape finale et irréversible : plus aucune donnée pédagogique ou comptable ne sera modifiable. Nécessite la comptabilité déjà clôturée (étape 2).'}
                                </p>
                            </div>
                            {stepStatus('archivage') !== 'fait' && (
                                <>
                                    {((etatReinscription?.par_statut.A_REINSCRIRE || 0) + (etatReinscription?.par_statut.NON_REINSCRIT || 0)) > 0 && (
                                        <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 12, maxWidth: 420 }}>
                                            Des réinscriptions sont encore en attente — les archiver maintenant n&apos;empêche rien techniquement, mais elles ne pourront plus être finalisées normalement une fois l&apos;année archivée.
                                        </div>
                                    )}
                                    <button onClick={archiverAnnee} disabled={archiving || stepStatus('cloture_comptable') !== 'fait'} style={{ ...btnPrimary, background: '#1e293b', opacity: (archiving || stepStatus('cloture_comptable') !== 'fait') ? 0.5 : 1 }}>
                                        {archiving ? <Loader2 size={16} className="animate-spin" /> : <ArchiveIcon size={16} />}
                                        Archiver définitivement l&apos;année
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── 10. Validation finale ── */}
                    {activeStep === 'validation' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 18, padding: '10px 0' }}>
                            <div style={{ width: 64, height: 64, borderRadius: 999, background: stepStatus('validation') === 'fait' ? '#ecfdf5' : '#f1f5f9', color: stepStatus('validation') === 'fait' ? '#10b981' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <PartyPopper size={30} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800 }}>10. Validation finale</h3>
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                    {stepStatus('validation') === 'fait' ? `${verifCloture?.annee_libelle} est entièrement clôturée et archivée.` : 'Terminez les étapes précédentes (surtout l\'archivage) pour finaliser.'}
                                </p>
                            </div>
                            {etatPromotion && etatPromotion.total_classes > 0 && (
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <div style={{ padding: '10px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border-light)' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800 }}>{etatPromotion.eleves}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Élèves traités</div>
                                    </div>
                                    <div style={{ padding: '10px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border-light)' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800 }}>{etatReinscription?.par_statut.REINSCRIT || 0}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Réinscrits</div>
                                    </div>
                                </div>
                            )}
                            <Link href="/classes" style={{ ...btnPrimary, textDecoration: 'none' }}>Terminé — Retour aux classes</Link>
                        </div>
                    )}
                </div>
            </div>

            {selectedClasse && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
                    onClick={() => { setSelectedClasse(null); setApercu(null); }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', padding: '24px', maxWidth: '900px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{selectedClasse.libelle}</h3>
                            <button onClick={() => { setSelectedClasse(null); setApercu(null); }} style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>Fermer</button>
                        </div>

                        {apercuLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={28} className="animate-spin" /></div>
                        ) : apercu ? (
                            <>
                                {apercu.terminal && (
                                    <div style={{ padding: '10px 14px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
                                        Niveau Terminale : les élèves admis seront marqués DIPLÔMÉ (fin de cursus, aucun transfert).
                                    </div>
                                )}
                                {apercu.frontiere_lycee && (
                                    <div style={{ padding: '10px 14px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
                                        Frontière Collège → Lycée : les élèves admis passent « en attente du choix de filière ». La série (SE/SM/SS) sera choisie au moment de leur réinscription, pas ici.
                                    </div>
                                )}
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                                    Redoublement automatique {apercu.redoublement_actif ? `activé (seuil ${apercu.seuil_redoublement}/20)` : 'désactivé — tous les élèves seront admis par défaut'}.
                                    {apercu.niveau_suivant && <> Classe suivante : <strong>{apercu.niveau_suivant.libelle}</strong>.</>}
                                    {!apercu.deja_calcule && <> Aperçu calculé à la volée — cliquez « Calculer les résultats » pour le rendre définitif et l&apos;ouvrir à la validation.</>}
                                </p>

                                {!apercu.deja_calcule && apercu.eleves.length > 0 && (
                                    <div style={{ marginBottom: '14px' }}>
                                        <button onClick={() => calculerResultats(selectedClasse.classe_id)} disabled={calculating || !anneeCibleId}
                                            style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: (!anneeCibleId || calculating) ? 0.6 : 1 }}>
                                            {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                                            Calculer les résultats de cette classe
                                        </button>
                                    </div>
                                )}

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Élève</th>
                                            <th style={{ textAlign: 'right', padding: '8px' }}>Moyenne</th>
                                            <th style={{ textAlign: 'right', padding: '8px' }}>Points</th>
                                            <th style={{ textAlign: 'right', padding: '8px' }}>Rang</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Décision</th>
                                            {apercu.deja_calcule && <th style={{ textAlign: 'right', padding: '8px' }}>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {apercu.eleves.map(el => {
                                            const style = DECISION_STYLE[el.decision] || { bg: '#f1f5f9', color: '#475569', label: el.decision };
                                            const verrouille = el.statut_promotion === 'VALIDE';
                                            return (
                                                <tr key={el.eleve_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px' }}>{el.prenom} {el.nom} <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>({el.matricule})</span></td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{el.moyenne_annuelle ?? '—'}</td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{el.total_points ?? '—'}</td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{el.rang ?? '—'}</td>
                                                    <td style={{ padding: '8px' }}>
                                                        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: style.bg, color: style.color }}>{style.label}</span>
                                                    </td>
                                                    {apercu.deja_calcule && (
                                                        <td style={{ padding: '8px', textAlign: 'right' }}>
                                                            {verrouille ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#059669', fontSize: 12, fontWeight: 700 }}>
                                                                    <ShieldCheck size={14} /> Validé
                                                                </span>
                                                            ) : el.decision !== 'EXCLU' ? (
                                                                <button onClick={() => exclureEleve(el.inscription_id, `${el.prenom} ${el.nom}`)} disabled={rowBusy === el.inscription_id}
                                                                    title="Exclure cet élève"
                                                                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                    {rowBusy === el.inscription_id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                                                                    Exclure
                                                                </button>
                                                            ) : '—'}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                        {apercu.eleves.length === 0 && (
                                            <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Aucun élève actif dans cette classe.</td></tr>
                                        )}
                                    </tbody>
                                </table>

                                {apercu.deja_calcule && apercu.eleves.length > 0 && (
                                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                                        {toutValide ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                                                <ShieldCheck size={16} /> Classe déjà validée
                                            </span>
                                        ) : (
                                            <button onClick={validerClasse} disabled={validating}
                                                style={{ padding: '12px 24px', background: '#b45309', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: validating ? 0.6 : 1 }}>
                                                {validating ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                                                Valider la promotion de cette classe
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c' }}>
                                <AlertTriangle size={16} /> Impossible de charger l&apos;aperçu.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tarifsModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
                    onClick={() => !tarifsLoading && setTarifsModal(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Coins size={18} /> Grille tarifaire</h3>
                            <button onClick={() => setTarifsModal(null)} disabled={tarifsLoading} style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><X size={16} /></button>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                            {tarifsModal.nouvelleAnneeLibelle} ne contient encore aucun tarif. Comment démarrer sa grille ?
                        </p>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Reprendre les tarifs de l&apos;année</label>
                        <select value={tarifsAnneeSourceId ?? ''} disabled={tarifsMode === 'vide'} onChange={e => setTarifsAnneeSourceId(e.target.value ? Number(e.target.value) : null)}
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-light)', marginBottom: 14 }}>
                            <option value="">— Sélectionner —</option>
                            {annees.filter(a => a.annee_id !== tarifsModal.nouvelleAnneeId).map(a => <option key={a.annee_id} value={a.annee_id}>{a.libelle}</option>)}
                        </select>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                            {([
                                { value: 'copier' as const, label: 'Reprendre automatiquement', desc: 'Copie les tarifs existants tels quels.' },
                                { value: 'copier_editer' as const, label: 'Reprendre puis modifier', desc: 'Copie, puis ouvre l’écran de modification.' },
                                { value: 'vide' as const, label: 'Grille vide', desc: 'Configuration manuelle plus tard.' },
                            ]).map(opt => (
                                <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 8, border: `1px solid ${tarifsMode === opt.value ? '#10b981' : 'var(--border-light)'}`, background: tarifsMode === opt.value ? '#ecfdf5' : '#fff', cursor: 'pointer' }}>
                                    <input type="radio" name="tarifsMode" checked={tarifsMode === opt.value} onChange={() => setTarifsMode(opt.value)} style={{ marginTop: 3 }} />
                                    <span>
                                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{opt.label}</span>
                                        <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{opt.desc}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button onClick={() => setTarifsModal(null)} disabled={tarifsLoading} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Plus tard</button>
                            <button onClick={confirmerTarifsModal} disabled={tarifsLoading} style={{ ...btnPrimary, opacity: tarifsLoading ? 0.6 : 1 }}>
                                {tarifsLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
