'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ClipboardList, Search, Filter, BarChart3, Users, BookOpen, Trophy,
    ChevronDown, AlertCircle, Check, Edit3, Save, Eye, Calculator,
    FileText, X, ArrowUpDown, TrendingUp, TrendingDown, Minus, CheckCircle2,
    ListChecks, Settings2, Trash2
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';
import { lancerTache } from '@/lib/taskPolling';
import Pagination from '@/components/Pagination';
import Link from 'next/link';



interface MatiereInfo { matiere_id: number; code: string; libelle: string; coefficient: number; }
interface EleveNotes {
    eleve_id: number; inscription_id: number; nom: string; prenom: string;
    matricule: string; sexe: string; moyenne_generale: number | null;
    rang: number; mention: string | null;
    matieres: Record<string, { moyenne: number | null; nb_notes: number; appreciation: string | null }>;
}
interface ClasseData {
    classe: { classe_id: number; code: string; libelle: string };
    matieres: MatiereInfo[];
    matieres_stats: Record<string, { moyenne_classe: number | null; note_min: number | null; note_max: number | null }>;
    eleves: EleveNotes[];
    effectif: number;
}
interface EvalCentralisee {
    evaluation_id: number; libelle: string; date_evaluation: string;
    matiere: string; matiere_id: number; classe: string; classe_id: number;
    trimestre: string; trimestre_id: number;
    enseignant: string; note_sur: number; coefficient: number;
    nb_notes: number; moyenne: number | null; statut: string;
    session_id: number | null;
    type_eval_id: number; enseignant_id: number | null;
    est_coefficientee: string; coefficient_override: number | null;
}
interface TypeEvalInfo {
    type_eval_id: number; code: string; libelle: string;
    coefficient: number; statut: string;
}
interface SessionInfo {
    session_id: number; libelle: string; date_evaluation: string;
    type_libelle: string; est_coefficientee: string;
    statut: string; nb_evaluations: number;
}
interface MoisCalendrier {
    cle: string; libelle: string; date_debut: string; date_fin: string;
    trimestre_id: number | null; trimestre: string | null; disponible: boolean;
}
interface EpreuvePeriode {
    cle: string; session_id: number | null; evaluation_ids: number[];
    libelle: string; type: string; coefficient_type: number;
    date_evaluation: string | null; est_coefficientee: string;
    nb_matieres: number; nb_centralisees: number;
    centralisee: boolean; retenue: boolean;
}

export default function CentralisationNotesPage() {
    const { etablissementId } = useApp();

    // State
    const [classes, setClasses] = useState<any[]>([]);
    const [trimestres, setTrimestres] = useState<any[]>([]);
    const [selectedClasse, setSelectedClasse] = useState<number | null>(null);
    const [selectedTrimestre, setSelectedTrimestre] = useState<number>(1);
    const [classeData, setClasseData] = useState<ClasseData | null>(null);
    const [evalsCentralisees, setEvalsCentralisees] = useState<EvalCentralisee[]>([]);
    const [stats, setStats] = useState({ total_evaluations: 0, centralisees: 0, non_centralisees: 0, taux_centralisation: 0 });
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    // Avancement d'une tâche mise en file (« en file d'attente… » / « en cours… »)
    const [etatTache, setEtatTache] = useState('');
    const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
    const [successMsg, setSuccessMsg] = useState('');
    const [search, setSearch] = useState('');
    // Terme réellement envoyé au serveur (temporisé), distinct de la saisie
    const [rechercheEnvoyee, setRechercheEnvoyee] = useState('');
    const [evalsPage, setEvalsPage] = useState(1);
    const [evalsTotal, setEvalsTotal] = useState(0);
    const EVALS_PAGE_SIZE = 50;

    // Élèves de la vue détail classe — paginés côté client (une seule réponse
    // imbriquée matrice élèves × matières, jusqu'à ~160 lignes par classe).
    const [classeElevesPage, setClasseElevesPage] = useState(1);
    const CLASSE_ELEVES_PAGE_SIZE = 25;

    // Types d'évaluation configurés (Paramètres > Notation) — affichés en clair
    // pour que l'admin voie EXACTEMENT comment les moyennes ont été calculées.
    const [typesEval, setTypesEval] = useState<TypeEvalInfo[]>([]);

    // Création d'une session (composition / évaluation sur toutes les matières)
    const [showSessionForm, setShowSessionForm] = useState(false);
    const [sessionForm, setSessionForm] = useState({
        type_eval_id: 0,
        libelle: '',
        mois: '',
        date_evaluation: new Date().toISOString().slice(0, 10),
        est_coefficientee: true,
        note_sur: '' as string | number,
    });

    // Calendrier de l'année scolaire : quel mois appartient à quelle période.
    // Le rattachement vient du backend (dates réelles des périodes), pas d'une
    // correspondance devinée côté navigateur.
    const [moisAnnee, setMoisAnnee] = useState<MoisCalendrier[]>([]);
    const [creatingSession, setCreatingSession] = useState(false);
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    // Matières retenues pour la session. null = toutes (cas courant d'une
    // composition) ; un tableau = sélection explicite quand l'école exclut
    // certaines matières de l'épreuve.
    const [matieresSession, setMatieresSession] = useState<number[] | null>(null);

    // Saisie des notes d'une évaluation, côté administration (l'enseignant
    // saisit normalement depuis son portail ; l'admin peut corriger ou saisir
    // à sa place, par exemple pour une composition organisée par l'école).
    const [saisieEval, setSaisieEval] = useState<any | null>(null);
    const [notesSaisie, setNotesSaisie] = useState<any[]>([]);
    const [loadingSaisie, setLoadingSaisie] = useState(false);
    const [savingNotes, setSavingNotes] = useState(false);
    const [statutFiltre, setStatutFiltre] = useState<string>('');

    // Correction d'une épreuve déjà créée. Une composition enregistrée avec la
    // mauvaise date, le mauvais barème ou le mauvais type était définitive :
    // rien dans l'écran ne permettait de la reprendre ni de l'effacer.
    const [epreuveEditee, setEpreuveEditee] = useState<LigneEval | null>(null);
    const [formEdition, setFormEdition] = useState({
        libelle: '', date_evaluation: '', type_eval_id: 0,
        note_sur: '' as string | number, est_coefficientee: true,
        coefficient_override: '' as string | number,
    });
    const [savingEdition, setSavingEdition] = useState(false);
    const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

    // Aperçu intermédiaire (classement de suivi, sans toucher aux bulletins).
    // Paginé comme le tableau pivot : une classe réelle dépasse souvent 150 élèves.
    const [apercu, setApercu] = useState<any | null>(null);
    const [loadingApercu, setLoadingApercu] = useState(false);
    const [apercuPage, setApercuPage] = useState(1);
    const APERCU_PAGE_SIZE = 25;
    // Épreuves sur lesquelles porte l'aperçu affiché : null = toute la période.
    // Conservé pour que « Fiche de classement » imprime exactement ce qui est
    // à l'écran, et non un autre périmètre.
    const [apercuEvaluationIds, setApercuEvaluationIds] = useState<number[] | null>(null);

    // Épreuves de la période et sélection de celles qui comptent pour le
    // résultat officiel (une période peut se jouer sur deux évaluations sans
    // composition, ou sur une composition seule — c'est l'école qui décide).
    const [epreuves, setEpreuves] = useState<EpreuvePeriode[]>([]);
    const [loadingEpreuves, setLoadingEpreuves] = useState(false);
    const [showEpreuves, setShowEpreuves] = useState(false);
    const [selectionEpreuves, setSelectionEpreuves] = useState<string[]>([]);
    const [selectionPersonnalisee, setSelectionPersonnalisee] = useState(false);
    const [savingSelection, setSavingSelection] = useState(false);

    // Load initial data (classes/trimestres/stats une seule fois)
    useEffect(() => {
        const loadInit = async () => {
            try {
                const [clsRes, triRes, statsRes, typesRes, moisRes] = await Promise.all([
                    api.get(`/api/classes?etablissement_id=${etablissementId}`),
                    api.get('/api/portail-enseignant/referentiels/trimestres'),
                    api.get('/api/evaluations/centralisation/stats'),
                    api.get('/api/evaluations/types').catch(() => ({ data: [] })),
                    api.get('/api/evaluations/calendrier/mois').catch(() => ({ data: { mois: [] } })),
                ]);
                setClasses(clsRes.data);
                setTrimestres(triRes.data);
                // La période sélectionnée était figée à 1 : l'identifiant de la
                // toute première période créée sur la plateforme, donc celle
                // d'une AUTRE école pour toutes sauf la première inscrite.
                // « Calculer les moyennes » travaillait alors sur une période
                // où cette école n'a aucune évaluation, et créait des bulletins
                // vides en annonçant sa réussite. On part de la période en
                // cours de l'école, sinon de la première qu'elle a définie.
                if (triRes.data?.length) {
                    const enCours = triRes.data.find((t: any) => t.statut === 'EN_COURS');
                    setSelectedTrimestre((enCours || triRes.data[0]).trimestre_id);
                }
                setStats(statsRes.data);
                setMoisAnnee(moisRes.data?.mois || []);
                const actifs = (typesRes.data || []).filter((t: TypeEvalInfo) => t.statut === 'ACTIF');
                setTypesEval(actifs);
                if (actifs.length) setSessionForm(f => ({ ...f, type_eval_id: actifs[0].type_eval_id }));
            } catch (e) { console.error(e); }
        };
        loadInit();
    }, [etablissementId]);

    // Liste des évaluations centralisées — paginée côté serveur (avant : un seul
    // fetch sans limite qui, avec 998 évaluations réelles, faisait timeout la
    // page entière — X-Total-Count lu pour piloter la pagination).
    const rechargerEvals = useCallback(async () => {
        try {
            const skip = (evalsPage - 1) * EVALS_PAGE_SIZE;
            const filtres = (statutFiltre ? `&statut=${statutFiltre}` : '')
                + (rechercheEnvoyee ? `&q=${encodeURIComponent(rechercheEnvoyee)}` : '');
            const res = await api.get(`/api/evaluations/centralisees?skip=${skip}&limit=${EVALS_PAGE_SIZE}${filtres}`);
            setEvalsCentralisees(res.data);
            const totalCount = res.headers?.['x-total-count'];
            setEvalsTotal(totalCount !== undefined ? Number(totalCount) : res.data.length);
        } catch (e) { console.error(e); }
    }, [evalsPage, statutFiltre, rechercheEnvoyee]);

    useEffect(() => { rechargerEvals(); }, [rechargerEvals]);

    // La recherche porte sur toute la base, pas sur la page affichée : elle part
    // donc au serveur. Court délai pour ne pas déclencher une requête par
    // frappe, et retour à la page 1 puisque le nombre de résultats change.
    useEffect(() => {
        const t = setTimeout(() => {
            setRechercheEnvoyee(search.trim());
            setEvalsPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [search]);
    // Revenir à la page 1 des élèves quand on change de classe/trimestre
    useEffect(() => { setClasseElevesPage(1); }, [selectedClasse, selectedTrimestre]);

    // Load classe detail view
    const loadClasseDetail = useCallback(async () => {
        if (!selectedClasse) return;
        setLoading(true);
        try {
            const res = await api.get(`/api/evaluations/classe/${selectedClasse}/notes-centralisees?trimestre_id=${selectedTrimestre}`);
            setClasseData(res.data);
            setViewMode('detail');
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [selectedClasse, selectedTrimestre]);

    useEffect(() => {
        if (selectedClasse) loadClasseDetail();
    }, [selectedClasse, selectedTrimestre, loadClasseDetail]);

    // Calculer moyennes — passe par la file de tâches (le calcul grossit avec
    // l'effectif : sur 160 élèves × 12 matières la version synchrone tient la
    // requête ouverte plusieurs dizaines de secondes). Repli automatique sur
    // l'endpoint synchrone si la file est indisponible, pour qu'une école dont
    // le Redis est éteint puisse quand même calculer.
    const handleCalculerMoyennes = async () => {
        if (!selectedClasse) return;
        setCalculating(true);
        setEtatTache('');
        try {
            const base = `/api/evaluations/classe/${selectedClasse}`;
            const res: any = await lancerTache(
                `${base}/calculer-moyennes-async?trimestre_id=${selectedTrimestre}`,
                {
                    urlSynchrone: `${base}/calculer-moyennes?trimestre_id=${selectedTrimestre}`,
                    onProgress: e => setEtatTache(
                        e.status === 'PENDING' ? 'Calcul en file d’attente…'
                            : e.status === 'RUNNING' ? 'Calcul en cours…' : ''),
                });
            setSuccessMsg(res.message
                || `Moyennes calculées pour ${res.classe} — ${res.bulletins_total} bulletins`);
            setTimeout(() => setSuccessMsg(''), 5000);
            await loadClasseDetail();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setEtatTache('');
        setCalculating(false);
    };

    // Sessions déjà créées pour la classe/période sélectionnée
    const loadSessions = useCallback(async () => {
        if (!selectedClasse) { setSessions([]); return; }
        try {
            const res = await api.get(`/api/evaluations/sessions?classe_id=${selectedClasse}&trimestre_id=${selectedTrimestre}`);
            setSessions(res.data || []);
        } catch { setSessions([]); }
    }, [selectedClasse, selectedTrimestre]);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    // Un barème inférieur à 5 est presque toujours un coefficient saisi dans la
    // mauvaise case : on ne l'interdit pas (une école peut noter /1), on alerte.
    const baremeDouteux = sessionForm.note_sur !== '' && Number(sessionForm.note_sur) > 0 && Number(sessionForm.note_sur) < 5;

    const moisChoisi = moisAnnee.find(m => m.cle === sessionForm.mois) || null;
    // La période de l'épreuve découle du mois choisi. Sans mois, on retombe sur
    // la période sélectionnée en haut de page (cas d'une composition de fin de
    // trimestre, où le mois importe moins que la période).
    const trimestreSession = moisChoisi?.trimestre_id ?? selectedTrimestre;
    const trimestreSessionLibelle = moisChoisi?.trimestre
        || trimestres.find((t: any) => t.trimestre_id === selectedTrimestre)?.libelle
        || `Trimestre ${selectedTrimestre}`;

    // Choisir un mois positionne la date dans ce mois : sans ça, la date reste
    // celle du jour et l'épreuve se retrouve datée hors de sa propre période.
    useEffect(() => {
        if (!moisChoisi) return;
        setSessionForm(f => (
            f.date_evaluation >= moisChoisi.date_debut && f.date_evaluation <= moisChoisi.date_fin
                ? f
                : { ...f, date_evaluation: moisChoisi.date_debut }
        ));
    }, [moisChoisi]);

    // Création groupée : une évaluation par matière, en une seule action
    const handleCreerSession = async () => {
        if (!selectedClasse || !sessionForm.type_eval_id || !sessionForm.libelle.trim()) return;
        setCreatingSession(true);
        try {
            const res = await api.post('/api/evaluations/sessions', {
                classe_id: selectedClasse,
                trimestre_id: trimestreSession,
                type_eval_id: sessionForm.type_eval_id,
                libelle: sessionForm.libelle.trim(),
                date_evaluation: sessionForm.date_evaluation,
                est_coefficientee: sessionForm.est_coefficientee ? 'O' : 'N',
                note_sur: sessionForm.note_sur === '' ? null : Number(sessionForm.note_sur),
                matiere_ids: matieresSession,
            });
            setSuccessMsg(res.data.message);
            setTimeout(() => setSuccessMsg(''), 6000);
            setShowSessionForm(false);
            setSessionForm(f => ({ ...f, libelle: '', note_sur: '', mois: '' }));
            setMatieresSession(null);
            await loadSessions();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur lors de la création');
        }
        setCreatingSession(false);
    };

    // Toutes les matières de la composition en cours de saisie : on passe de
    // l'une à l'autre sans quitter la fenêtre.
    const [matieresSaisie, setMatieresSaisie] = useState<EvalCentralisee[]>([]);

    // Ouvre la saisie : crée d'abord les lignes de notes manquantes pour que
    // chaque élève inscrit apparaisse, même si l'enseignant n'a rien saisi.
    const ouvrirSaisie = async (ev: any, groupe?: EvalCentralisee[]) => {
        if (groupe) setMatieresSaisie(groupe);
        setSaisieEval(ev);
        setLoadingSaisie(true);
        try {
            await api.post(`/api/evaluations/${ev.evaluation_id}/initialiser`).catch(() => null);
            const res = await api.get(`/api/evaluations/${ev.evaluation_id}/notes`);
            setNotesSaisie(res.data || []);
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Impossible de charger les notes');
            setSaisieEval(null);
        }
        setLoadingSaisie(false);
    };

    const enregistrerNotes = async () => {
        if (!saisieEval) return;
        setSavingNotes(true);
        try {
            await api.put(`/api/evaluations/${saisieEval.evaluation_id}/notes/batch-update`, {
                notes: notesSaisie.map(n => ({
                    note_id: n.note_id,
                    // Une case laissée vide signifie « pas encore noté » : la
                    // matière est alors ignorée dans la moyenne de l'élève.
                    valeur: n.valeur === '' || n.valeur === null || n.valeur === undefined ? null : Number(n.valeur),
                    est_absent: false,
                    observation: n.observation || null,
                })),
            });
            // Une évaluation saisie devient exploitable par le calcul des
            // moyennes, qui ne retient que les évaluations centralisées.
            await api.put(`/api/evaluations/${saisieEval.evaluation_id}/statut`, { statut: 'CENTRALISEE' })
                .catch(() => null);

            // Enchaîner sur la matière suivante non saisie de la composition
            const suivante = matieresSaisie.find(m =>
                m.evaluation_id !== saisieEval.evaluation_id && m.nb_notes === 0);
            setSuccessMsg(suivante
                ? `${saisieEval.matiere} enregistrée — passage à ${suivante.matiere}`
                : 'Notes enregistrées');
            setTimeout(() => setSuccessMsg(''), 4000);
            await rechargerEvals();
            if (suivante) {
                await ouvrirSaisie(suivante);
            } else {
                setSaisieEval(null);
            }
            await loadClasseDetail();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur lors de l’enregistrement');
        }
        setSavingNotes(false);
    };

    // Fiche de classement imprimable (PDF généré par le serveur). Le jeton
    // d'authentification ne passe pas dans une simple ouverture d'onglet :
    // on récupère le fichier via l'API puis on l'ouvre depuis le navigateur.
    const imprimerClassement = async (
        evaluationIds?: number[], classeId?: number, trimestreId?: number,
    ) => {
        const classe = classeId ?? selectedClasse;
        const trimestre = trimestreId ?? selectedTrimestre;
        if (!classe) return;
        try {
            const filtre = evaluationIds?.length ? `&evaluation_ids=${evaluationIds.join(',')}` : '';
            const res = await api.get(
                `/api/evaluations/classe/${classe}/classement/pdf?trimestre_id=${trimestre}${filtre}`,
                { responseType: 'blob' }
            );
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const onglet = window.open(url, '_blank');
            if (onglet) onglet.onload = () => onglet.print();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e: any) {
            // Une erreur renvoyée en blob doit être relue pour afficher son message
            let msg = 'Impossible de générer la fiche';
            try {
                const texte = await e?.response?.data?.text?.();
                if (texte) msg = JSON.parse(texte).detail || msg;
            } catch { /* message par défaut */ }
            alert(msg);
        }
    };

    // Classement de suivi : calcule sans rien écrire dans les bulletins.
    // `evaluationIds` restreint le classement à une épreuve précise (résultats
    // d'une composition seule) ou à la sélection cochée par l'école.
    const handleApercu = async (evaluationIds?: number[]) => {
        if (!selectedClasse) return;
        setLoadingApercu(true);
        try {
            const filtre = evaluationIds?.length ? `&evaluation_ids=${evaluationIds.join(',')}` : '';
            const res = await api.get(
                `/api/evaluations/classe/${selectedClasse}/resultats-intermediaires?trimestre_id=${selectedTrimestre}${filtre}`);
            setApercu(res.data);
            setApercuEvaluationIds(evaluationIds || null);
            setApercuPage(1);
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur');
        }
        setLoadingApercu(false);
    };

    // ── Classement d'une épreuve depuis la liste générale ────────────────────
    // Le classement doit être atteignable d'ici, sans passer par la classe :
    // c'est sur cette liste que l'école retrouve ses compositions terminées.
    // La classe et la période de l'épreuve priment sur ce qui est sélectionné
    // en haut de page — sinon on calculerait le classement d'une autre classe.
    const ouvrirClassementEpreuve = async (ligne: any) => {
        const evals: EvalCentralisee[] = ligne.evaluations || [];
        if (!evals.length) return;
        setLoadingApercu(true);
        try {
            const ids = evals.map(e => e.evaluation_id).join(',');
            const res = await api.get(
                `/api/evaluations/classe/${evals[0].classe_id}/resultats-intermediaires`
                + `?trimestre_id=${evals[0].trimestre_id}&evaluation_ids=${ids}`);
            setApercu(res.data);
            setApercuEvaluationIds(evals.map(e => e.evaluation_id));
            setApercuPage(1);
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur');
        }
        setLoadingApercu(false);
    };

    const imprimerClassementEpreuve = async (ligne: any) => {
        const evals: EvalCentralisee[] = ligne.evaluations || [];
        if (!evals.length) return;
        await imprimerClassement(
            evals.map(e => e.evaluation_id), evals[0].classe_id, evals[0].trimestre_id);
    };

    // ── Épreuves de la période : voir les résultats de chacune, et choisir
    //    lesquelles comptent pour le résultat officiel ────────────────────────
    const loadEpreuves = async () => {
        if (!selectedClasse) return;
        setLoadingEpreuves(true);
        try {
            const res = await api.get(
                `/api/evaluations/classe/${selectedClasse}/periode/${selectedTrimestre}/epreuves`);
            setEpreuves(res.data.epreuves || []);
            setSelectionPersonnalisee(res.data.selection_personnalisee);
            setSelectionEpreuves(
                (res.data.epreuves || []).filter((e: EpreuvePeriode) => e.retenue).map((e: EpreuvePeriode) => e.cle));
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur');
        }
        setLoadingEpreuves(false);
    };

    const evaluationIdsDeSelection = () =>
        epreuves.filter(e => selectionEpreuves.includes(e.cle)).flatMap(e => e.evaluation_ids);

    const enregistrerSelection = async () => {
        if (!selectedClasse) return;
        setSavingSelection(true);
        try {
            const res = await api.put(
                `/api/evaluations/classe/${selectedClasse}/periode/${selectedTrimestre}/epreuves`,
                { evaluation_ids: evaluationIdsDeSelection() });
            setSuccessMsg(res.data.message);
            setTimeout(() => setSuccessMsg(''), 6000);
            await loadEpreuves();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Erreur');
        }
        setSavingSelection(false);
    };

    // Regroupement par cycle réel, tel que la base le déclare (Classe → Niveau
    // → Cycle). L'ancienne version le devinait du libellé — « contient Année »
    // = primaire — ce qui rangeait la 7ème à la 12ème Année dans le primaire.
    const groupedClasses = classes.reduce((acc: any, cls: any) => {
        const cycle = cls.cycle_libelle || 'Autres';
        if (!acc[cycle]) acc[cycle] = [];
        acc[cycle].push(cls);
        return acc;
    }, {});

    // La recherche est faite par le serveur (paramètre `q`) : re-filtrer ici
    // masquerait des lignes légitimes le temps que la requête revienne, et
    // ferait mentir le compteur de pagination.
    const filteredEvals = evalsCentralisees;

    // Statut d'une épreuve regroupée : une composition porte une évaluation par
    // matière, qui peuvent être à des états différents. On affiche l'état le
    // moins avancé — celui qui reste à traiter — plutôt qu'une moyenne trompeuse.
    const statutEpreuve = (evals: EvalCentralisee[]) => {
        const statuts = new Set(evals.map(e => e.statut));
        if (statuts.size === 1 && statuts.has('ANNULEE'))
            return { cle: 'ANNULEE', label: 'Annulée', couleur: '#94a3b8', fond: '#f1f5f9' };
        if (evals.every(e => e.statut === 'CENTRALISEE'))
            return { cle: 'CENTRALISEE', label: 'Centralisée', couleur: '#059669', fond: '#ecfdf5' };
        if (evals.every(e => e.statut === 'CENTRALISEE' || e.statut === 'PUBLIEE'))
            return { cle: 'PUBLIEE', label: 'Publiée', couleur: '#1d4ed8', fond: '#eff6ff' };
        if (evals.some(e => e.nb_notes > 0))
            return { cle: 'PARTIEL', label: 'Saisie en cours', couleur: '#b45309', fond: '#fef3c7' };
        return { cle: 'PLANIFIEE', label: 'À saisir', couleur: '#b45309', fond: '#fef3c7' };
    };

    // ═══ CORRECTION / SUPPRESSION D'UNE ÉPREUVE ═══
    // Une composition porte les mêmes valeurs sur toutes ses matières : on la
    // corrige d'un seul geste côté serveur, sans une requête par matière.
    const ouvrirEdition = (ligne: LigneEval) => {
        const ref = ligne.evaluations[0];
        setFormEdition({
            libelle: ligne.libelle,
            date_evaluation: (ligne.date_evaluation || '').slice(0, 10),
            type_eval_id: ref.type_eval_id || 0,
            note_sur: ref.note_sur ?? '',
            est_coefficientee: ref.est_coefficientee !== 'N',
            coefficient_override: ref.coefficient_override ?? '',
        });
        setEpreuveEditee(ligne);
    };

    const enregistrerEdition = async () => {
        if (!epreuveEditee) return;
        const corps: Record<string, unknown> = {
            libelle: formEdition.libelle || undefined,
            date_evaluation: formEdition.date_evaluation || undefined,
            type_eval_id: formEdition.type_eval_id || undefined,
            note_sur: formEdition.note_sur === '' ? undefined : Number(formEdition.note_sur),
            est_coefficientee: formEdition.est_coefficientee ? 'O' : 'N',
            // Champ vidé = retour au coefficient du type ; le serveur distingue
            // « absent » (ne rien changer) de « null » (retirer la surcharge).
            coefficient_override: formEdition.coefficient_override === ''
                ? null : Number(formEdition.coefficient_override),
        };
        setSavingEdition(true);
        try {
            const url = epreuveEditee.session_id
                ? `/api/evaluations/sessions/${epreuveEditee.session_id}`
                : `/api/evaluations/${epreuveEditee.evaluations[0].evaluation_id}`;
            await api.put(url, corps);
            setSuccessMsg('Épreuve corrigée');
            setTimeout(() => setSuccessMsg(''), 4000);
            setEpreuveEditee(null);
            await rechargerEvals();
            if (showEpreuves) loadEpreuves();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setSavingEdition(false);
    };

    // Suppression volontairement bavarde : elle efface les notes déjà saisies,
    // et le serveur la refuse sur une épreuve centralisée (ses notes comptent
    // dans des bulletins). On annonce les deux avant de demander confirmation.
    const supprimerEpreuve = async (ligne: LigneEval) => {
        const nbNotes = ligne.evaluations.reduce((n, e) => n + (e.nb_notes || 0), 0);
        const quoi = ligne.session_id
            ? `la composition « ${ligne.libelle} » et ses ${ligne.evaluations.length} matières`
            : `l'épreuve « ${ligne.libelle} »`;
        if (!confirm(
            `Supprimer ${quoi} ?\n\n`
            + (nbNotes > 0
                ? `${nbNotes} note(s) déjà saisie(s) seront définitivement effacées.\n\n`
                : '')
            + 'Cette action est irréversible.'
        )) return;

        setSuppressionEnCours(ligne.cle);
        try {
            const url = ligne.session_id
                ? `/api/evaluations/sessions/${ligne.session_id}`
                : `/api/evaluations/${ligne.evaluations[0].evaluation_id}`;
            const res = await api.delete(url);
            setSuccessMsg(res.data?.message || 'Épreuve supprimée');
            setTimeout(() => setSuccessMsg(''), 4000);
            await rechargerEvals();
            if (showEpreuves) loadEpreuves();
        } catch (e: any) {
            alert(e?.response?.data?.detail || e.message);
        }
        setSuppressionEnCours(null);
    };

    // Une composition couvre toutes les matières d'une classe : on l'affiche
    // sur UNE ligne, pas une par matière. Les évaluations créées hors session
    // (saisie directe d'un enseignant) restent sur leur propre ligne.
    type LigneEval = {
        cle: string;
        session_id: number | null;
        libelle: string; classe: string; classe_id: number;
        date_evaluation: string; trimestre: string;
        evaluations: EvalCentralisee[];
    };
    const lignesEvals: LigneEval[] = Object.values(
        filteredEvals.reduce((acc: Record<string, LigneEval>, ev) => {
            const cle = ev.session_id ? `S${ev.session_id}` : `E${ev.evaluation_id}`;
            if (!acc[cle]) acc[cle] = {
                cle, session_id: ev.session_id ?? null,
                libelle: ev.libelle, classe: ev.classe, classe_id: ev.classe_id,
                date_evaluation: ev.date_evaluation, trimestre: ev.trimestre,
                evaluations: [],
            };
            acc[cle].evaluations.push(ev);
            return acc;
        }, {})
    );

    // Note coloring
    const getNoteColor = (note: number | null) => {
        if (note === null) return '#94a3b8';
        if (note >= 16) return '#059669';
        if (note >= 14) return '#10b981';
        if (note >= 10) return '#3b82f6';
        if (note >= 8) return '#f59e0b';
        return '#ef4444';
    };

    const getNoteBackground = (note: number | null) => {
        if (note === null) return '#f1f5f9';
        if (note >= 16) return '#ecfdf5';
        if (note >= 14) return '#f0fdf4';
        if (note >= 10) return '#eff6ff';
        if (note >= 8) return '#fffbeb';
        return '#fef2f2';
    };

    return (
        <div style={{ padding: '24px 30px', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            {/* ═══ HEADER ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ClipboardList size={22} color="white" />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>Centralisation des Notes</h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Centralisez, vérifiez et calculez les moyennes par classe et trimestre</p>
                </div>
                {viewMode === 'detail' && (
                    <button onClick={() => setViewMode('overview')}
                        style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                        ← Vue d&apos;ensemble
                    </button>
                )}
            </div>

            {/* ═══ SUCCESS MESSAGE ═══ */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ padding: '14px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1px solid #6ee7b7', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, color: '#065f46' }}>
                        <Check size={18} /> {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ EXPLICATION DU CALCUL ═══ — transparence pour l'admin : la
                formule affichée reflète les types réellement configurés dans
                Paramètres > Notation, pas une formule figée dans le code. */}
            <div style={{ padding: '12px 18px', borderRadius: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe', marginBottom: '20px', fontSize: '12.5px', color: '#5b21b6', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <ClipboardList size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                    <strong>Comment les moyennes sont calculées :</strong> pour chaque matière, les notes d&apos;un même
                    type sont d&apos;abord moyennées entre elles, puis pondérées par le coefficient du type
                    {typesEval.length > 0 && (
                        <> — {typesEval.map(t => `${t.libelle} (coef. ${t.coefficient})`).join(', ')}</>
                    )}. Un type sans note est exclu du calcul, et le nombre d&apos;évaluations d&apos;un même type ne
                    change pas son poids. La moyenne générale = somme (moyenne matière × coefficient matière) ÷ somme
                    des coefficients. Modifiable dans <Link href="/parametres/notation" style={{ color: '#5b21b6', fontWeight: 700 }}>Paramètres &gt; Notation</Link> (onglet « Évaluations &amp; Coefficients »).
                </span>
            </div>

            {/* ═══ KPI STATS ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Évaluations Totales', value: stats.total_evaluations, icon: BookOpen, color: '#6366f1', bg: '#eef2ff' },
                    { label: 'Centralisées', value: stats.centralisees, icon: Check, color: '#059669', bg: '#ecfdf5' },
                    { label: 'En Attente', value: stats.non_centralisees, icon: AlertCircle, color: '#f59e0b', bg: '#fffbeb' },
                    { label: 'Taux Centralisation', value: `${stats.taux_centralisation}%`, icon: TrendingUp, color: '#8b5cf6', bg: '#f5f3ff' },
                ].map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        style={{ padding: '18px 20px', borderRadius: '14px', background: 'white', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <kpi.icon size={20} color={kpi.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{kpi.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{kpi.label}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {viewMode === 'overview' ? (
                <>
                    {/* ═══ SÉLECTEURS ═══ */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <select value={selectedClasse || ''} onChange={e => setSelectedClasse(Number(e.target.value) || null)}
                            style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: 600, minWidth: '280px', background: 'white', cursor: 'pointer' }}>
                            <option value="">— Sélectionner une classe —</option>
                            {Object.entries(groupedClasses).map(([cycle, cls]: [string, any]) => (
                                <optgroup key={cycle} label={`${cycle}`}>
                                    {cls.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        <select value={selectedTrimestre} onChange={e => setSelectedTrimestre(Number(e.target.value))}
                            style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: 600, minWidth: '200px', background: 'white', cursor: 'pointer' }}>
                            {trimestres.length > 0 ? trimestres.map((t: any) => (
                                <option key={t.trimestre_id} value={t.trimestre_id}>{t.libelle}</option>
                            )) : (
                                <>
                                    <option value={1}>1er Trimestre</option>
                                    <option value={2}>2ème Trimestre</option>
                                    <option value={3}>3ème Trimestre</option>
                                </>
                            )}
                        </select>
                        <button onClick={loadClasseDetail} disabled={!selectedClasse || loading}
                            style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: selectedClasse ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0', color: selectedClasse ? 'white' : '#94a3b8', fontSize: '14px', fontWeight: 700, cursor: selectedClasse ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Eye size={16} /> Voir les Notes
                        </button>
                    </div>

                    {/* ═══ LISTE DES ÉVALUATIONS CENTRALISÉES ═══ */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><ClipboardList size={18} /> Évaluations &amp; Compositions</h3>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select value={statutFiltre} onChange={e => { setStatutFiltre(e.target.value); setEvalsPage(1); }}
                                style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600 }}>
                                {/* Les quatre états du cycle de vie d'une évaluation,
                                    tels que le backend les accepte (PUT /{id}/statut). */}
                                <option value="">Tous les statuts</option>
                                <option value="PLANIFIEE">Planifiée — notes à saisir</option>
                                <option value="PUBLIEE">Publiée — notes saisies, pas encore validées</option>
                                <option value="CENTRALISEE">Centralisée — compte dans les moyennes</option>
                                <option value="ANNULEE">Annulée — ne compte pas</option>
                            </select>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input type="text" placeholder="Rechercher une épreuve, une classe, un enseignant…" value={search} onChange={e => setSearch(e.target.value)}
                                    style={{ padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', width: '300px' }} />
                            </div>
                            </div>
                        </div>

                        {filteredEvals.length === 0 ? (
                            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8' }}>
                                <ClipboardList size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                <p style={{ fontSize: '15px', fontWeight: 600 }}>Aucune évaluation</p>
                                <p style={{ fontSize: '13px' }}>Créez une composition depuis une classe, ou attendez que les enseignants saisissent leurs notes.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Évaluation / Composition', 'Classe', 'Période', 'Date', 'Matières', 'Notes saisies', 'Statut', ''].map(h => (
                                                <th key={h} style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lignesEvals.map(ligne => {
                                            const nbMat = ligne.evaluations.length;
                                            const saisies = ligne.evaluations.filter(e => e.nb_notes > 0).length;
                                            const toutesCentralisees = ligne.evaluations.every(e => e.statut === 'CENTRALISEE');
                                            return (
                                                <tr key={ligne.cle} style={{ borderBottom: '1px solid #f1f5f9' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{ligne.libelle}</div>
                                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                            {ligne.session_id
                                                                ? `Composition sur ${nbMat} matière${nbMat > 1 ? 's' : ''}`
                                                                : `${ligne.evaluations[0].matiere} · ${ligne.evaluations[0].enseignant}`}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600 }}>{ligne.classe}</td>
                                                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>{ligne.trimestre}</td>
                                                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>{ligne.date_evaluation}</td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#eef2ff', color: '#6366f1', fontSize: '12px', fontWeight: 700 }}>{nbMat}</span>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: saisies === nbMat ? '#059669' : '#b45309' }}>
                                                        {saisies} / {nbMat}
                                                    </td>
                                                    {/* Le badge ne connaissait que « Centralisée » et « À saisir » :
                                                        une épreuve publiée ou annulée s'affichait donc à tort comme
                                                        « à saisir », alors que ses notes sont déjà là ou qu'elle ne
                                                        compte plus. Les quatre états sont maintenant distingués. */}
                                                    <td style={{ padding: '14px 16px' }}>
                                                        {(() => {
                                                            const st = statutEpreuve(ligne.evaluations);
                                                            return (
                                                                <span style={{ padding: '4px 12px', borderRadius: '20px', background: st.fond, color: st.couleur, fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    {st.cle === 'CENTRALISEE' && <CheckCircle2 size={12} />}
                                                                    {st.label}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                    {/* Le classement d'une épreuve doit être accessible d'ici,
                                                        sans passer par la classe : c'est sur cette liste que
                                                        l'école voit ses compositions une fois terminées. */}
                                                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <button onClick={() => ouvrirSaisie(ligne.evaluations[0], ligne.evaluations)}
                                                            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #6366f1', background: 'white', color: '#4338ca', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
                                                            <Edit3 size={13} /> {saisies > 0 ? 'Modifier' : 'Saisir'}
                                                        </button>
                                                        <button onClick={() => ouvrirClassementEpreuve(ligne)} disabled={saisies === 0}
                                                            title={saisies === 0 ? 'Aucune note saisie' : 'Classement de cette épreuve'}
                                                            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #0ea5e9', background: 'white', color: '#0369a1', fontSize: '12px', fontWeight: 700, cursor: saisies ? 'pointer' : 'not-allowed', opacity: saisies ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
                                                            <Trophy size={13} /> Classement
                                                        </button>
                                                        <button onClick={() => imprimerClassementEpreuve(ligne)} disabled={saisies === 0}
                                                            title={saisies === 0 ? 'Aucune note saisie' : 'Fiche imprimable de cette épreuve'}
                                                            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #059669', background: 'white', color: '#059669', fontSize: '12px', fontWeight: 700, cursor: saisies ? 'pointer' : 'not-allowed', opacity: saisies ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
                                                            <FileText size={13} /> Fiche
                                                        </button>
                                                        {/* Corriger une épreuve mal créée (date, barème, type,
                                                            coefficient) et la supprimer : ces deux gestes
                                                            n'existaient nulle part dans l'interface. */}
                                                        <button onClick={() => ouvrirEdition(ligne)}
                                                            title="Corriger cette épreuve (date, barème, type, coefficient)"
                                                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', marginRight: '6px' }}>
                                                            <Settings2 size={13} />
                                                        </button>
                                                        <button onClick={() => supprimerEpreuve(ligne)}
                                                            disabled={suppressionEnCours === ligne.cle || toutesCentralisees}
                                                            title={toutesCentralisees
                                                                ? 'Épreuve centralisée : ses notes comptent dans les bulletins. Passez-la en « Annulée » pour l’exclure du calcul.'
                                                                : 'Supprimer cette épreuve et ses notes'}
                                                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fecaca', background: 'white', color: '#b91c1c', fontSize: '12px', fontWeight: 700, cursor: toutesCentralisees ? 'not-allowed' : 'pointer', opacity: toutesCentralisees ? 0.4 : 1, display: 'inline-flex', alignItems: 'center' }}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <Pagination page={evalsPage} pageSize={EVALS_PAGE_SIZE} total={evalsTotal} onPageChange={setEvalsPage} />
                    </motion.div>
                </>
            ) : classeData ? (
                <>
                    {/* ═══ DETAIL VIEW: TABLEAU CROISÉ ÉLÈVES × MATIÈRES ═══ */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BarChart3 size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {classeData.classe.libelle}</span>
                            </h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                                {classeData.effectif} élèves • {classeData.matieres.length} matières • {trimestres.find((t: any) => t.trimestre_id === selectedTrimestre)?.libelle || `Trimestre ${selectedTrimestre}`}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button onClick={() => setShowSessionForm(v => !v)}
                                style={{ padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #6366f1', background: showSessionForm ? '#eef2ff' : 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#4338ca' }}>
                                <ClipboardList size={16} /> Nouvelle composition / évaluation
                            </button>
                            {/* Épreuves de la période : leurs résultats un par un, et
                                le choix de celles qui comptent pour le bulletin. */}
                            <button onClick={() => { setShowEpreuves(v => !v); if (!showEpreuves) loadEpreuves(); }}
                                style={{ padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: showEpreuves ? '#f1f5f9' : 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                                <ListChecks size={16} /> Épreuves &amp; résultats
                            </button>
                            <button onClick={() => handleApercu()} disabled={loadingApercu}
                                style={{ padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                                <Eye size={16} /> {loadingApercu ? 'Calcul...' : 'Aperçu du classement'}
                            </button>
                            {/* Fiche imprimable : ouverte dans un onglet, le PDF est
                                généré par le serveur avec l'en-tête de l'établissement.
                                Elle porte sur le même périmètre que l'aperçu affiché. */}
                            <button onClick={() => imprimerClassement(apercuEvaluationIds || undefined)}
                                style={{ padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #059669', background: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#059669' }}>
                                <FileText size={16} /> Fiche de classement
                            </button>
                            <button onClick={handleCalculerMoyennes} disabled={calculating}
                                style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(99,102,241,0.3)' }}>
                                <Calculator size={16} /> {calculating ? (etatTache || 'Calcul en cours...') : 'Calculer Moyennes & Classements'}
                            </button>
                            <button onClick={() => window.location.href = `/bulletins?classe_id=${selectedClasse}&trimestre_id=${selectedTrimestre}`}
                                style={{ padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                                <FileText size={16} /> Bulletins →
                            </button>
                        </div>
                    </div>

                    {/* ═══ CRÉATION D'UNE SESSION (toutes les matières d'un coup) ═══ */}
                    <AnimatePresence>
                        {showSessionForm && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden', marginBottom: '20px' }}>
                                <div style={{ padding: '20px', borderRadius: '16px', background: 'white', border: '2px dashed #6366f1' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                                        Créer une composition ou une évaluation
                                    </div>
                                    <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '10px' }}>
                                        Une seule saisie crée l&apos;épreuve pour <strong>toutes les matières</strong> de {classeData.classe.libelle} ({classeData.matieres.length} matières).
                                        Les enseignants n&apos;auront plus qu&apos;à saisir leurs notes.
                                    </div>
                                    {/* Le rattachement est affiché en clair : c'est lui qui décide sur
                                        quel bulletin l'épreuve comptera. */}
                                    <div style={{ fontSize: '12.5px', color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '8px 12px', marginBottom: '16px' }}>
                                        Comptera pour&nbsp;: <strong>{trimestreSessionLibelle}</strong>
                                        {moisChoisi
                                            ? <> — d&apos;après le mois choisi ({moisChoisi.libelle}).</>
                                            : <> — aucun mois choisi, la période sélectionnée en haut de page s&apos;applique.</>}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 170px 130px 120px', gap: '12px', alignItems: 'end' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>TYPE</label>
                                            <select value={sessionForm.type_eval_id} onChange={e => setSessionForm(f => ({ ...f, type_eval_id: Number(e.target.value) }))}
                                                style={{ width: '100%', padding: '9px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}>
                                                {typesEval.map(t => (
                                                    <option key={t.type_eval_id} value={t.type_eval_id}>{t.libelle} (coef. {t.coefficient})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>INTITULÉ</label>
                                            <input value={sessionForm.libelle} placeholder="ex : Composition du 1er Trimestre, Évaluation de Janvier"
                                                onChange={e => setSessionForm(f => ({ ...f, libelle: e.target.value }))}
                                                style={{ width: '100%', padding: '9px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                                        </div>
                                        {/* Le mois pilote la période : une « évaluation de janvier » doit
                                            compter pour la période qui contient janvier, pas pour celle
                                            qui se trouvait sélectionnée à l'écran. */}
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>MOIS</label>
                                            <select value={sessionForm.mois} onChange={e => setSessionForm(f => ({ ...f, mois: e.target.value }))}
                                                style={{ width: '100%', padding: '9px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}>
                                                <option value="">— choisir —</option>
                                                {moisAnnee.map(m => (
                                                    <option key={m.cle} value={m.cle} disabled={!m.disponible}>
                                                        {m.libelle}{m.trimestre ? ` — ${m.trimestre}` : ' — hors période'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>DATE</label>
                                            <input type="date" value={sessionForm.date_evaluation}
                                                min={moisChoisi?.date_debut} max={moisChoisi?.date_fin}
                                                onChange={e => setSessionForm(f => ({ ...f, date_evaluation: e.target.value }))}
                                                style={{ width: '100%', padding: '9px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>NOTÉE SUR</label>
                                            <input type="number" min={1} placeholder="20 (par défaut)" value={sessionForm.note_sur}
                                                onChange={e => setSessionForm(f => ({ ...f, note_sur: e.target.value }))}
                                                style={{ width: '100%', padding: '9px', borderRadius: '10px', border: `1px solid ${baremeDouteux ? '#f59e0b' : '#cbd5e1'}`, fontSize: '13px', textAlign: 'center' }} />
                                            {/* Un barème saisi ici par erreur (le coefficient, par exemple) ne se
                                                voit qu'au bulletin : une note de 15 sur une épreuve notée /1
                                                remonterait à 300/20. Mieux vaut alerter à la saisie. */}
                                            <div style={{ fontSize: '10.5px', color: baremeDouteux ? '#b45309' : '#94a3b8', marginTop: '4px', lineHeight: 1.35 }}>
                                                {baremeDouteux
                                                    ? `Note maximale de l'épreuve, pas le coefficient. Sur ${sessionForm.note_sur}, aucune note ne pourra dépasser ${sessionForm.note_sur}.`
                                                    : 'Note maximale de l’épreuve. Vide = barème de la matière.'}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Sélection des matières : toutes par défaut, décochables */}
                                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                                                MATIÈRES CONCERNÉES — {(matieresSession ?? classeData.matieres.map(m => m.matiere_id)).length} / {classeData.matieres.length}
                                            </span>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button type="button" onClick={() => setMatieresSession(null)}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                                                    Tout cocher
                                                </button>
                                                <button type="button" onClick={() => setMatieresSession([])}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                                                    Tout décocher
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                                            {classeData.matieres.map(m => {
                                                const selection = matieresSession ?? classeData.matieres.map(x => x.matiere_id);
                                                const coche = selection.includes(m.matiere_id);
                                                return (
                                                    <button key={m.matiere_id} type="button"
                                                        onClick={() => {
                                                            const base = matieresSession ?? classeData.matieres.map(x => x.matiere_id);
                                                            setMatieresSession(coche
                                                                ? base.filter(id => id !== m.matiere_id)
                                                                : [...base, m.matiere_id]);
                                                        }}
                                                        style={{
                                                            padding: '5px 11px', borderRadius: '999px', cursor: 'pointer',
                                                            fontSize: '12px', fontWeight: 600,
                                                            border: `1px solid ${coche ? '#6366f1' : '#e2e8f0'}`,
                                                            background: coche ? '#eef2ff' : 'white',
                                                            color: coche ? '#4338ca' : '#94a3b8',
                                                        }}>
                                                        {coche ? '✓ ' : ''}{m.libelle}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', gap: '16px', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155' }}>
                                            <input type="checkbox" checked={sessionForm.est_coefficientee}
                                                onChange={e => setSessionForm(f => ({ ...f, est_coefficientee: e.target.checked }))}
                                                style={{ width: '17px', height: '17px', cursor: 'pointer' }} />
                                            <span>
                                                <strong>Coefficienter les matières</strong>
                                                <span style={{ color: '#64748b' }}> — {sessionForm.est_coefficientee
                                                    ? 'les coefficients définis pour cette classe s’appliquent'
                                                    : 'toutes les matières comptent pour 1 sur cette épreuve'}</span>
                                            </span>
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={handleCreerSession} disabled={creatingSession || !sessionForm.libelle.trim()}
                                                style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: sessionForm.libelle.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#cbd5e1', color: 'white', fontSize: '13px', fontWeight: 700, cursor: sessionForm.libelle.trim() ? 'pointer' : 'not-allowed' }}>
                                                {creatingSession ? 'Création...' : 'Créer pour toutes les matières'}
                                            </button>
                                            <button onClick={() => setShowSessionForm(false)}
                                                style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>
                                                Annuler
                                            </button>
                                        </div>
                                    </div>

                                    {sessions.length > 0 && (
                                        <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                                                DÉJÀ CRÉÉES POUR CETTE PÉRIODE
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {sessions.map(s => (
                                                    <div key={s.session_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', fontSize: '12.5px' }}>
                                                        <span style={{ color: '#0f172a', fontWeight: 600 }}>
                                                            {s.libelle}
                                                            <span style={{ color: '#94a3b8', fontWeight: 500 }}> · {s.type_libelle} · {s.nb_evaluations} matières</span>
                                                            {s.est_coefficientee === 'N' && <span style={{ color: '#d97706', fontWeight: 600 }}> · non coefficientée</span>}
                                                        </span>
                                                        <span style={{ color: '#64748b' }}>{s.date_evaluation}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ═══ ÉPREUVES DE LA PÉRIODE ═══
                        Deux usages distincts sur le même écran : consulter le résultat
                        d'une épreuve isolée (le classement d'une composition seule), et
                        décider lesquelles comptent pour le bulletin de la période. */}
                    <AnimatePresence>
                        {showEpreuves && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden', marginBottom: '20px' }}>
                                <div style={{ padding: '18px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', gap: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                                                Épreuves de {trimestres.find((t: any) => t.trimestre_id === selectedTrimestre)?.libelle || `Trimestre ${selectedTrimestre}`}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                                                {selectionPersonnalisee
                                                    ? 'L’école a choisi les épreuves qui comptent pour le résultat de cette période.'
                                                    : 'Aucun choix enregistré : toutes les épreuves centralisées comptent pour le résultat.'}
                                            </div>
                                        </div>
                                        <button onClick={() => setShowEpreuves(false)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>
                                            <X size={15} color="#64748b" />
                                        </button>
                                    </div>

                                    {loadingEpreuves ? (
                                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Chargement…</div>
                                    ) : epreuves.length === 0 ? (
                                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                            Aucune épreuve sur cette période.
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>COMPTE</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>ÉPREUVE</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TYPE</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>DATE</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>MATIÈRES</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>RÉSULTATS</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {epreuves.map(ep => {
                                                            const coche = selectionEpreuves.includes(ep.cle);
                                                            return (
                                                                <tr key={ep.cle} style={{ borderTop: '1px solid #f1f5f9', opacity: ep.centralisee ? 1 : 0.55 }}>
                                                                    <td style={{ padding: '9px 12px' }}>
                                                                        {/* Une épreuve non centralisée ne peut pas compter :
                                                                            toutes ses notes ne sont pas encore remontées. */}
                                                                        <input type="checkbox" checked={coche} disabled={!ep.centralisee}
                                                                            onChange={() => setSelectionEpreuves(s =>
                                                                                coche ? s.filter(c => c !== ep.cle) : [...s, ep.cle])}
                                                                            style={{ width: '16px', height: '16px', cursor: ep.centralisee ? 'pointer' : 'not-allowed' }} />
                                                                    </td>
                                                                    <td style={{ padding: '9px 12px', color: '#0f172a', fontWeight: 600 }}>
                                                                        {ep.libelle}
                                                                        {ep.est_coefficientee === 'N' && (
                                                                            <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}> · sans coef. de matière</span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ padding: '9px 12px', color: '#475569' }}>
                                                                        {ep.type} <span style={{ color: '#94a3b8' }}>(coef. {ep.coefficient_type})</span>
                                                                    </td>
                                                                    <td style={{ padding: '9px 12px', textAlign: 'center', color: '#64748b' }}>
                                                                        {ep.date_evaluation ? new Date(ep.date_evaluation).toLocaleDateString('fr-FR') : '—'}
                                                                    </td>
                                                                    <td style={{ padding: '9px 12px', textAlign: 'center', color: ep.centralisee ? '#059669' : '#b45309', fontWeight: 700 }}>
                                                                        {ep.nb_centralisees} / {ep.nb_matieres}
                                                                    </td>
                                                                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                        <button onClick={() => handleApercu(ep.evaluation_ids)} disabled={!ep.nb_centralisees}
                                                                            style={{ padding: '5px 11px', borderRadius: '8px', border: '1px solid #6366f1', background: 'white', color: '#4338ca', fontSize: '11.5px', fontWeight: 700, cursor: ep.nb_centralisees ? 'pointer' : 'not-allowed', marginRight: '6px' }}>
                                                                            Classement
                                                                        </button>
                                                                        <button onClick={() => imprimerClassement(ep.evaluation_ids)} disabled={!ep.nb_centralisees}
                                                                            style={{ padding: '5px 11px', borderRadius: '8px', border: '1px solid #059669', background: 'white', color: '#059669', fontSize: '11.5px', fontWeight: 700, cursor: ep.nb_centralisees ? 'pointer' : 'not-allowed' }}>
                                                                            Fiche
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '12.5px', color: '#475569' }}>
                                                    <strong>{selectionEpreuves.length}</strong> épreuve{selectionEpreuves.length > 1 ? 's' : ''} retenue{selectionEpreuves.length > 1 ? 's' : ''} pour le résultat de la période.
                                                    {selectionEpreuves.length === 0 && ' Tout décocher revient au comportement par défaut (tout ce qui est centralisé compte).'}
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => handleApercu(evaluationIdsDeSelection())}
                                                        disabled={loadingApercu || selectionEpreuves.length === 0}
                                                        style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', background: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: '#0f172a' }}>
                                                        Classement sur la sélection
                                                    </button>
                                                    <button onClick={enregistrerSelection} disabled={savingSelection}
                                                        style={{ padding: '8px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                                        {savingSelection ? 'Enregistrement…' : 'Enregistrer ce choix'}
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>


                    {/* ═══ TABLEAU PIVOT ═══ */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${400 + classeData.matieres.length * 100}px` }}>
                                <thead>
                                    <tr style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}>
                                        <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'center', width: '40px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>#</th>
                                        <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'left', width: '200px', position: 'sticky', left: '40px', background: '#f8fafc', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>ÉLÈVE</th>
                                        {classeData.matieres.map(m => (
                                            <th key={m.matiere_id} style={{ padding: '10px 8px', fontSize: '10px', fontWeight: 700, color: '#475569', textAlign: 'center', minWidth: '90px', borderLeft: '1px solid #e2e8f0' }}>
                                                <div>{m.libelle}</div>
                                                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>Coef {m.coefficient}</div>
                                            </th>
                                        ))}
                                        <th style={{ padding: '14px 10px', fontSize: '11px', fontWeight: 800, color: '#6366f1', textAlign: 'center', borderLeft: '3px solid #6366f1', minWidth: '90px' }}>MOY. GÉN.</th>
                                        <th style={{ padding: '14px 10px', fontSize: '11px', fontWeight: 800, color: '#f59e0b', textAlign: 'center', minWidth: '60px' }}>RANG</th>
                                        <th style={{ padding: '14px 10px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'center', minWidth: '80px' }}>MENTION</th>
                                    </tr>
                                    {/* Stats row */}
                                    <tr style={{ background: '#fafbff' }}>
                                        <td colSpan={2} style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', position: 'sticky', left: 0, background: '#fafbff', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BarChart3 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Moyenne Classe</span>
                                        </td>
                                        {classeData.matieres.map(m => {
                                            const st = classeData.matieres_stats[String(m.matiere_id)];
                                            return (
                                                <td key={m.matiere_id} style={{ padding: '6px 8px', textAlign: 'center', borderLeft: '1px solid #e2e8f0', fontSize: '11px' }}>
                                                    <div style={{ fontWeight: 700, color: getNoteColor(st?.moyenne_classe ?? null) }}>
                                                        {st?.moyenne_classe?.toFixed(1) ?? '—'}
                                                    </div>
                                                    <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                                                        {st?.note_min?.toFixed(0) ?? '—'} — {st?.note_max?.toFixed(0) ?? '—'}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td colSpan={3} style={{ borderLeft: '3px solid #6366f1' }}></td>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classeData.eleves.slice((classeElevesPage - 1) * CLASSE_ELEVES_PAGE_SIZE, classeElevesPage * CLASSE_ELEVES_PAGE_SIZE).map((eleve, idx) => (
                                        <tr key={eleve.eleve_id}
                                            style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#fafbff')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <td style={{ padding: '10px 16px', fontSize: '12px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, position: 'sticky', left: 0, background: 'inherit', zIndex: 1, borderRight: '2px solid #e2e8f0' }}>{(classeElevesPage - 1) * CLASSE_ELEVES_PAGE_SIZE + idx + 1}</td>
                                            <td style={{ padding: '10px 16px', position: 'sticky', left: '40px', background: 'inherit', zIndex: 1, borderRight: '2px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{eleve.nom} {eleve.prenom}</div>
                                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{eleve.matricule}</div>
                                            </td>
                                            {classeData.matieres.map(m => {
                                                const matData = eleve.matieres[String(m.matiere_id)];
                                                const moy = matData?.moyenne;
                                                return (
                                                    <td key={m.matiere_id} style={{ padding: '6px 8px', textAlign: 'center', borderLeft: '1px solid #f1f5f9' }}>
                                                        <div style={{ padding: '4px 8px', borderRadius: '6px', background: getNoteBackground(moy ?? null), display: 'inline-block', minWidth: '40px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 700, color: getNoteColor(moy ?? null) }}>
                                                                {moy !== null && moy !== undefined ? moy.toFixed(1) : '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td style={{ padding: '10px 10px', textAlign: 'center', borderLeft: '3px solid #6366f1' }}>
                                                <div style={{ padding: '6px 12px', borderRadius: '8px', background: getNoteBackground(eleve.moyenne_generale), display: 'inline-block' }}>
                                                    <span style={{ fontSize: '15px', fontWeight: 800, color: getNoteColor(eleve.moyenne_generale) }}>
                                                        {eleve.moyenne_generale !== null ? eleve.moyenne_generale.toFixed(2) : '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                {eleve.rang <= 3 ? (
                                                    <span style={{ fontSize: '16px', fontWeight: 800, color: eleve.rang === 1 ? '#f59e0b' : eleve.rang === 2 ? '#94a3b8' : '#b45309' }}>
                                                        {eleve.rang === 1 ? '🥇' : eleve.rang === 2 ? '🥈' : '🥉'} {eleve.rang}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>{eleve.rang}<sup>e</sup></span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                {eleve.mention ? (
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                                        background: eleve.mention === 'TRÈS BIEN' ? '#ecfdf5' : eleve.mention === 'BIEN' ? '#f0fdf4' : eleve.mention === 'ASSEZ BIEN' ? '#eff6ff' : eleve.mention === 'PASSABLE' ? '#fffbeb' : '#fef2f2',
                                                        color: eleve.mention === 'TRÈS BIEN' ? '#065f46' : eleve.mention === 'BIEN' ? '#166534' : eleve.mention === 'ASSEZ BIEN' ? '#1e40af' : eleve.mention === 'PASSABLE' ? '#92400e' : '#991b1b',
                                                    }}>{eleve.mention}</span>
                                                ) : <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={classeElevesPage} pageSize={CLASSE_ELEVES_PAGE_SIZE} total={classeData.eleves.length} onPageChange={setClasseElevesPage} />
                    </motion.div>
                </>
            ) : loading ? (
                <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
                    <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto 16px' }}></div>
                    <p>Chargement des données...</p>
                </div>
            ) : null}

            {/* ═══ CORRECTION D'UNE ÉPREUVE ═══ */}
            <AnimatePresence>
                {epreuveEditee && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                        onClick={() => !savingEdition && setEpreuveEditee(null)}>
                        <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px', overflow: 'hidden' }}>

                            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Corriger l&apos;épreuve</div>
                                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                                        {epreuveEditee.classe} · {epreuveEditee.trimestre}
                                        {epreuveEditee.session_id
                                            ? ` · ${epreuveEditee.evaluations.length} matières`
                                            : ` · ${epreuveEditee.evaluations[0].matiere}`}
                                    </div>
                                </div>
                                <button onClick={() => setEpreuveEditee(null)}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '20px 22px', display: 'grid', gap: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>INTITULÉ</label>
                                    <input value={formEdition.libelle}
                                        onChange={e => setFormEdition(f => ({ ...f, libelle: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13.5px' }} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>DATE</label>
                                        <input type="date" value={formEdition.date_evaluation}
                                            onChange={e => setFormEdition(f => ({ ...f, date_evaluation: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13.5px' }} />
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                                            Doit rester dans {epreuveEditee.trimestre}
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>TYPE</label>
                                        <select value={formEdition.type_eval_id}
                                            onChange={e => setFormEdition(f => ({ ...f, type_eval_id: Number(e.target.value) }))}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13.5px' }}>
                                            {typesEval.map(t => (
                                                <option key={t.type_eval_id} value={t.type_eval_id}>
                                                    {t.libelle} (coef. {t.coefficient})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>NOTÉE SUR</label>
                                        <input type="number" min={1} step={0.5} value={formEdition.note_sur}
                                            onChange={e => setFormEdition(f => ({ ...f, note_sur: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13.5px' }} />
                                        {Number(formEdition.note_sur) > 0 && Number(formEdition.note_sur) < 5 && (
                                            <div style={{ fontSize: '11px', color: '#b45309', marginTop: '3px', fontWeight: 600 }}>
                                                Barème inhabituel — s&apos;agit-il du coefficient ?
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>COEFFICIENT DE L&apos;ÉPREUVE</label>
                                        <input type="number" min={0.5} step={0.5} value={formEdition.coefficient_override}
                                            placeholder="celui du type"
                                            onChange={e => setFormEdition(f => ({ ...f, coefficient_override: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13.5px' }} />
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                                            Laisser vide pour garder le coefficient du type
                                        </div>
                                    </div>
                                </div>

                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', cursor: 'pointer', padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                    <input type="checkbox" checked={formEdition.est_coefficientee}
                                        onChange={e => setFormEdition(f => ({ ...f, est_coefficientee: e.target.checked }))}
                                        style={{ marginTop: '2px', width: '16px', height: '16px' }} />
                                    <span style={{ fontSize: '12.5px', color: '#475569' }}>
                                        <strong style={{ color: '#0f172a' }}>Appliquer les coefficients de matière</strong><br />
                                        Décoché, toutes les matières comptent pour 1 sur cette épreuve.
                                    </span>
                                </label>
                            </div>

                            <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setEpreuveEditee(null)}
                                    style={{ padding: '9px 18px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: '#475569' }}>
                                    Annuler
                                </button>
                                <button onClick={enregistrerEdition} disabled={savingEdition}
                                    style={{ padding: '9px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                                    <Save size={15} /> {savingEdition ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ SAISIE DES NOTES D'UNE ÉVALUATION ═══ */}
            <AnimatePresence>
                {saisieEval && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                        onClick={() => !savingNotes && setSaisieEval(null)}>
                        <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '760px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{saisieEval.libelle}</div>
                                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                                        {saisieEval.classe} · noté sur {saisieEval.note_sur}
                                        {saisieEval.enseignant ? ` · ${saisieEval.enseignant}` : ''}
                                    </div>
                                    {/* Composition multi-matières : on navigue de l'une à
                                        l'autre sans refermer la fenêtre. */}
                                    {matieresSaisie.length > 1 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                                            {matieresSaisie.map(m => {
                                                const active = m.evaluation_id === saisieEval.evaluation_id;
                                                const fait = m.nb_notes > 0;
                                                return (
                                                    <button key={m.evaluation_id} type="button"
                                                        onClick={() => !savingNotes && !active && ouvrirSaisie(m)}
                                                        style={{
                                                            padding: '4px 10px', borderRadius: '999px', cursor: active ? 'default' : 'pointer',
                                                            fontSize: '11.5px', fontWeight: 700,
                                                            border: `1px solid ${active ? '#4f46e5' : fait ? '#a7f3d0' : '#e2e8f0'}`,
                                                            background: active ? '#4f46e5' : fait ? '#ecfdf5' : 'white',
                                                            color: active ? 'white' : fait ? '#059669' : '#94a3b8',
                                                        }}>
                                                        {fait && !active ? '✓ ' : ''}{m.matiere}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setSaisieEval(null)} disabled={savingNotes}
                                    style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>
                                    <X size={16} color="#64748b" />
                                </button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px' }}>
                                {loadingSaisie ? (
                                    <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>Chargement des élèves...</p>
                                ) : notesSaisie.length === 0 ? (
                                    <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>Aucun élève inscrit dans cette classe.</p>
                                ) : (
                                    <div className="table-scroll">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '380px' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>ÉLÈVE</th>
                                                <th style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: 700, width: '120px' }}>NOTE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {notesSaisie.map((n, i) => (
                                                <tr key={n.note_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '7px 8px', color: '#0f172a' }}>
                                                        {n.nom} {n.prenom}
                                                        <span style={{ color: '#94a3b8', fontSize: '11.5px' }}> · {n.matricule}</span>
                                                    </td>
                                                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                                                        <input type="number" min={0} max={saisieEval.note_sur} step={0.25}
                                                            value={n.valeur ?? ''}
                                                            placeholder="—"
                                                            onChange={e => setNotesSaisie(prev => prev.map((x, j) =>
                                                                j === i ? { ...x, valeur: e.target.value } : x))}
                                                            style={{ width: '90px', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '16px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                    Case vide = élève non noté (la matière est alors ignorée dans sa moyenne).
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setSaisieEval(null)} disabled={savingNotes}
                                        style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                        Annuler
                                    </button>
                                    <button onClick={enregistrerNotes} disabled={savingNotes || notesSaisie.length === 0}
                                        style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Save size={15} /> {savingNotes ? 'Enregistrement...' : 'Enregistrer les notes'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ CLASSEMENT PAR ORDRE DE MÉRITE ═══
                Rendu en fenêtre, hors des deux vues (liste et détail de classe) :
                le classement se demande aussi bien depuis la liste des épreuves
                que depuis une classe, et il n'avait aucune raison de n'exister
                que dans l'une des deux. Les noms viennent du résultat lui-même,
                pas de `classeData` — absent quand on arrive depuis la liste. */}
            <AnimatePresence>
                {apercu && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setApercu(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
                        <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'white', borderRadius: '18px', width: '100%', maxWidth: '860px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                                        Classement par ordre de mérite — {apercu.classe}
                                    </div>
                                    {/* Sans le détail des épreuves, un classement est ininterprétable :
                                        « ordre de mérite de janvier » et « ordre de mérite de fin de
                                        trimestre » se ressemblent à l'écran mais ne disent pas la même chose. */}
                                    {(apercu.epreuves || []).length > 0 && (
                                        <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '4px' }}>
                                            D&apos;après : {apercu.epreuves.map((e: any) =>
                                                e.type ? `${e.libelle} (${e.type})` : e.libelle).join(' + ')}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                        Effectif : {apercu.effectif} élèves · Outil de suivi : aucun bulletin n&apos;est modifié.
                                        {(apercu.epreuves || []).length > 0
                                            && apercu.epreuves.every((e: any) => e.est_coefficientee === 'N')
                                            && ' · Sans coefficients de matière'}
                                        {apercu.mode_agregation === 'PAR_EPREUVE' && ' · Règle : par épreuve'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    <button onClick={() => imprimerClassement(apercuEvaluationIds || undefined, apercu.classe_id, apercu.trimestre_id)}
                                        style={{ padding: '7px 14px', borderRadius: '9px', border: '1px solid #059669', background: 'white', color: '#059669', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <FileText size={14} /> Imprimer
                                    </button>
                                    <button onClick={() => setApercu(null)} style={{ padding: '7px', borderRadius: '9px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>
                                        <X size={16} color="#64748b" />
                                    </button>
                                </div>
                            </div>
                            <div className="table-scroll" style={{ padding: '4px 24px 20px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '520px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['RANG', 'ÉLÈVE', 'MATRICULE', 'MOYENNE', 'MENTION'].map((h, i) => (
                                                <th key={h} style={{ padding: '9px 12px', textAlign: i >= 3 ? 'center' : 'left', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(apercu.resultats || [])
                                            .slice((apercuPage - 1) * APERCU_PAGE_SIZE, apercuPage * APERCU_PAGE_SIZE)
                                            .map((r: any) => (
                                                <tr key={r.inscription_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#6366f1' }}>{r.rang}</td>
                                                    <td style={{ padding: '9px 12px', color: '#0f172a' }}>
                                                        {r.nom ? `${r.nom} ${r.prenom}` : `#${r.inscription_id}`}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', color: '#94a3b8', fontSize: '12px' }}>{r.matricule || '—'}</td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: r.moyenne_generale !== null && r.moyenne_generale < 10 ? '#b91c1c' : '#0f172a' }}>
                                                        {r.moyenne_generale !== null ? r.moyenne_generale.toFixed(2) : '—'}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: '11.5px', color: '#64748b' }}>{r.mention || '—'}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                                <Pagination page={apercuPage} pageSize={APERCU_PAGE_SIZE}
                                    total={(apercu.resultats || []).length} onPageChange={setApercuPage} />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
