'use client';

/**
 * Installation de SmartSchool sur cet ordinateur (application installée).
 *
 * Une seule fois, avec internet : un compte de direction télécharge toute
 * l'école dans la base locale de l'ordinateur (moteur local, routes
 * /api/poste/etat et /api/poste/installer). Ensuite l'application fonctionne
 * avec ou sans connexion, et chacun s'y connecte avec ses identifiants
 * habituels. Écran propre à la version poste : la version web n'y mène jamais.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, HardDriveDownload, Loader2, Lock, Mail } from 'lucide-react';
import api from '@/lib/api';
import styles from '../login/login.module.css';

interface EtatPoste {
    statut: 'NON_INSTALLE' | 'EN_COURS' | 'INSTALLE' | 'ECHEC';
    etablissement_nom: string | null;
    tables_faites: number;
    tables_total: number;
    lignes_faites: number;
    lignes_total: number;
    fichiers_faits: number;
    fichiers_total: number;
    erreur: string | null;
}

export default function InstallationPage() {
    const router = useRouter();
    const [etat, setEtat] = useState<EtatPoste | null>(null);
    const [identifiant, setIdentifiant] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [voirMotDePasse, setVoirMotDePasse] = useState(false);
    const [envoi, setEnvoi] = useState(false);
    const [erreurEnvoi, setErreurEnvoi] = useState('');

    const lireEtat = useCallback(async () => {
        try {
            const res = await api.get('/api/poste/etat');
            setEtat(res.data);
        } catch {
            setErreurEnvoi("Le moteur SmartSchool de cet ordinateur ne répond pas. Relancez l'application.");
        }
    }, []);

    useEffect(() => { void lireEtat(); }, [lireEtat]);

    // Pendant le téléchargement, la progression est relue chaque seconde.
    useEffect(() => {
        if (etat?.statut !== 'EN_COURS') return;
        const minuteur = setInterval(() => void lireEtat(), 1000);
        return () => clearInterval(minuteur);
    }, [etat?.statut, lireEtat]);

    const lancer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (envoi) return;
        setEnvoi(true);
        setErreurEnvoi('');
        try {
            const res = await api.post('/api/poste/installer', {
                identifiant: identifiant.trim(),
                mot_de_passe: motDePasse,
            });
            setEtat(res.data);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } }; message?: string });
            setErreurEnvoi(detail?.response?.data?.detail || detail?.message || "L'installation n'a pas pu démarrer.");
        } finally {
            setEnvoi(false);
        }
    };

    // Les données comptent pour 90 % de la barre, les fichiers pour le reste.
    const pourcentage = etat && etat.lignes_total > 0
        ? Math.min(100, Math.round(
            (etat.lignes_faites / etat.lignes_total) * 90
            + (etat.fichiers_total > 0 ? (etat.fichiers_faits / etat.fichiers_total) * 10 : 0),
        ))
        : 0;
    const copieDesFichiers = !!etat && etat.lignes_total > 0 && etat.tables_faites === etat.tables_total && etat.fichiers_total > 0;
    const formulaireVisible = etat && (etat.statut === 'NON_INSTALLE' || etat.statut === 'ECHEC');
    const peutLancer = identifiant.trim().length > 0 && motDePasse.length > 0 && !envoi;
    const erreur = erreurEnvoi || (etat?.statut === 'ECHEC' ? etat.erreur : '');

    return (
        <>
            <div className={styles.fond} aria-hidden="true" />
            {/* `.scene` porte les couleurs des champs et de la carte (variables
                CSS) : on la garde, en remplaçant seulement sa grille à deux
                colonnes par une carte centrée. */}
            <div className={styles.scene} style={{ gridTemplateColumns: '1fr', justifyItems: 'center', alignItems: 'center' }}>
                <section className={styles.colonneFormulaire} style={{ width: 'min(520px, 100%)' }}>
                    <div className={styles.carte}>
                        <h1 className={styles.salutation}>Installer SmartSchool sur cet ordinateur</h1>
                        <p className={styles.salutationTexte}>
                            Une seule fois, avec internet. Toute votre école est copiée sur cet ordinateur :
                            ensuite, SmartSchool fonctionne avec ou sans connexion, et vos données se
                            synchronisent dès que le réseau est là.
                        </p>

                        {erreur && (
                            <div className={styles.erreur} role="alert">
                                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>{erreur}</span>
                            </div>
                        )}

                        {!etat && !erreurEnvoi && (
                            <p className={styles.salutationTexte}>
                                <Loader2 size={16} className={styles.rotation} /> Vérification de l&apos;ordinateur…
                            </p>
                        )}

                        {formulaireVisible && (
                            <form onSubmit={lancer}>
                                <p className={styles.salutationTexte} style={{ fontWeight: 600 }}>
                                    Connectez-vous avec un compte de direction (fondateur ou administrateur).
                                </p>
                                <div className={styles.champ}>
                                    <div className={styles.ligneLibelle}>
                                        <label className={styles.libelle} htmlFor="installation-identifiant">
                                            Identifiant, email ou téléphone
                                        </label>
                                    </div>
                                    <div className={styles.cadreChamp}>
                                        <Mail size={17} className={styles.iconeChamp} />
                                        <input
                                            id="installation-identifiant"
                                            type="text"
                                            value={identifiant}
                                            onChange={(e) => setIdentifiant(e.target.value)}
                                            required
                                            className={styles.saisie}
                                        />
                                    </div>
                                </div>
                                <div className={styles.champ}>
                                    <div className={styles.ligneLibelle}>
                                        <label className={styles.libelle} htmlFor="installation-mot-de-passe">Mot de passe</label>
                                    </div>
                                    <div className={styles.cadreChamp}>
                                        <Lock size={17} className={styles.iconeChamp} />
                                        <input
                                            id="installation-mot-de-passe"
                                            type={voirMotDePasse ? 'text' : 'password'}
                                            value={motDePasse}
                                            onChange={(e) => setMotDePasse(e.target.value)}
                                            required
                                            className={styles.saisie}
                                            style={{ paddingRight: '46px' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setVoirMotDePasse((v) => !v)}
                                            className={styles.oeil}
                                            aria-label={voirMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                        >
                                            {voirMotDePasse ? <EyeOff size={17} /> : <Eye size={17} />}
                                        </button>
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={!peutLancer}
                                    className={`${styles.valider} ${peutLancer ? styles.validerActif : styles.validerInactif}`}
                                >
                                    {envoi
                                        ? <><Loader2 size={18} className={styles.rotation} /> Démarrage…</>
                                        : <><HardDriveDownload size={18} /> {etat?.statut === 'ECHEC' ? "Reprendre l'installation" : "Installer"}</>}
                                </button>
                            </form>
                        )}

                        {etat?.statut === 'EN_COURS' && etat.lignes_total === 0 && (
                            <p className={styles.salutationTexte} aria-live="polite" style={{ fontWeight: 600 }}>
                                <Loader2 size={16} className={styles.rotation} /> Connexion au serveur SmartSchool…
                            </p>
                        )}

                        {etat?.statut === 'EN_COURS' && etat.lignes_total > 0 && (
                            <div aria-live="polite">
                                <p className={styles.salutationTexte} style={{ fontWeight: 600 }}>
                                    {copieDesFichiers
                                        ? `Copie des photos et documents… ${pourcentage} %`
                                        : `Téléchargement de ${etat.etablissement_nom ?? 'votre école'}… ${pourcentage} %`}
                                </p>
                                <div style={{ height: 10, borderRadius: 999, background: '#dbeafe', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${pourcentage}%`, height: '100%', borderRadius: 999,
                                        background: 'linear-gradient(90deg, #2563eb, #10b981)', transition: 'width 0.4s ease',
                                    }} />
                                </div>
                                <p className={styles.salutationTexte} style={{ marginTop: 10, fontSize: 13 }}>
                                    {copieDesFichiers
                                        ? `${etat.fichiers_faits} / ${etat.fichiers_total} fichiers`
                                        : `${etat.lignes_faites.toLocaleString('fr-FR')} / ${etat.lignes_total.toLocaleString('fr-FR')} informations · étape ${etat.tables_faites} / ${etat.tables_total}`}
                                    . Gardez la connexion jusqu&apos;à la fin.
                                </p>
                            </div>
                        )}

                        {etat?.statut === 'INSTALLE' && (
                            <div>
                                <p className={styles.salutationTexte} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                                    <CheckCircle2 size={20} color="#059669" />
                                    {etat.etablissement_nom ?? 'Votre école'} est installée sur cet ordinateur.
                                </p>
                                <p className={styles.salutationTexte}>
                                    Chacun peut maintenant s&apos;y connecter avec ses identifiants habituels,
                                    avec ou sans internet.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => router.replace('/login')}
                                    className={`${styles.valider} ${styles.validerActif}`}
                                >
                                    Se connecter <ArrowRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}
