'use client';

/**
 * Page vitrine publique — la première chose que voit un visiteur.
 *
 * POURQUOI ELLE EXISTE
 * Avant, la racine renvoyait directement vers l'écran de connexion : un
 * directeur qui découvrait SmartSchool tombait sur un formulaire sans savoir
 * ce que le logiciel fait ni qui l'édite. Cette page présente le produit,
 * puis propose la connexion.
 *
 * Un visiteur DÉJÀ connecté n'a rien à faire ici : le garde de route
 * (AuthContext) le renvoie vers l'espace de son rôle. La racine est donc
 * déclarée publique, mais reste réservée aux visiteurs non connectés.
 */
import Link from 'next/link';
import {
    ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Coins,
    FileText, GraduationCap, Landmark, LayoutGrid, Lock, Mail, MessageCircle,
    Phone, ShieldCheck, Target, Users, UserSquare2, Wallet,
} from 'lucide-react';
import SmartSchoolMark from '@/components/SmartSchoolMark';
import styles from './accueil.module.css';

/** Coordonnées commerciales de TrillionX, éditeur de SmartSchool. */
const TELEPHONE_1 = '627 17 13 97';
const TELEPHONE_2 = '610 93 55 24';
const EMAIL = 'trillionnx@gmail.com';

const PROBLEMES = [
    {
        titre: 'Les bulletins prennent des jours',
        texte: "Recopier les notes, calculer les moyennes à la main, corriger les erreurs… puis recommencer au trimestre suivant.",
    },
    {
        titre: 'Les impayés sont difficiles à suivre',
        texte: "Qui a payé ? Qui doit encore ? Sans suivi clair, l'école perd de l'argent qui lui revient.",
    },
    {
        titre: 'Les parents sont dans le flou',
        texte: "Ils découvrent les résultats trop tard, et l'école passe son temps à répondre aux mêmes questions.",
    },
    {
        titre: 'La direction décide à l’aveugle',
        texte: 'Sans chiffres fiables et à jour, chaque décision devient une impression plutôt qu’un choix éclairé.',
    },
];

const BENEFICES = [
    {
        titre: 'Des bulletins en quelques minutes',
        texte: "Les enseignants saisissent, le système calcule. Moyennes, rangs, mentions et appréciations — sans erreur de calcul.",
    },
    {
        titre: 'Chaque franc suivi',
        texte: 'Frais de scolarité, encaissements Mobile Money ou espèces, dépenses, impayés : vous savez où vous en êtes.',
    },
    {
        titre: 'Des parents informés, une école crédible',
        texte: 'Notes, présences et paiements consultables par la famille. Moins d’appels, plus de confiance.',
    },
    {
        titre: 'Une direction qui pilote sur des chiffres',
        texte: 'Effectifs, finances, présences, alertes : tout est là, à jour, sur un seul écran.',
    },
];

const FONCTIONS = [
    {
        Icone: Users, vert: false, titre: 'Élèves & inscriptions',
        texte: 'Dossiers complets, matricules automatiques, cartes scolaires, réinscriptions d’une année à l’autre.',
    },
    {
        Icone: FileText, vert: false, titre: 'Notes & bulletins',
        texte: 'Saisie par les enseignants, calcul automatique des moyennes, bulletins prêts à imprimer.',
    },
    {
        Icone: CheckCircle2, vert: true, titre: 'Présences & discipline',
        texte: 'Appel par cours ou par demi-journée, pointage des enseignants, suivi des incidents.',
    },
    {
        Icone: Wallet, vert: true, titre: 'Finances & comptabilité',
        texte: 'Facturation, encaissements, reçus, dépenses, paie du personnel et comptabilité complète.',
    },
    {
        Icone: MessageCircle, vert: false, titre: 'Communication familles',
        texte: 'Messages, annonces et espaces dédiés aux parents et aux élèves.',
    },
    {
        Icone: CalendarDays, vert: false, titre: 'Emploi du temps & examens',
        texte: 'Planning des cours et des salles, centre des examens, résultats de fin d’année.',
    },
];

const ESPACES = [
    { Icone: GraduationCap, vert: false, titre: 'La Direction', points: ['Tout piloter d’un écran', 'Créer les comptes', 'Finances et décisions'] },
    { Icone: ClipboardList, vert: false, titre: 'Les Enseignants', points: ['Saisir les notes', 'Faire l’appel', 'Cahier de textes'] },
    { Icone: Users, vert: true, titre: 'Les Parents', points: ['Notes et bulletins', 'Présences de l’enfant', 'Suivi des paiements'] },
    { Icone: UserSquare2, vert: true, titre: 'Les Élèves', points: ['Ses notes', 'Son bulletin', 'Son emploi du temps'] },
];

const ESPACES_METIERS = [
    { Icone: ShieldCheck, titre: 'Surveillants', points: ['Présences et discipline', 'Pointage des enseignants'] },
    { Icone: Coins, titre: 'Comptables', points: ['Encaissements et reçus', 'Dépenses et paie'] },
    { Icone: Landmark, titre: 'Secrétariat', points: ['Inscriptions', 'Dossiers et familles'] },
];

export default function AccueilPage() {
    return (
        <div className={styles.page}>

            {/* ── Navigation ── */}
            <nav className={styles.nav}>
                <div className={`${styles.contenu} ${styles.navInterieur}`}>
                    <Link href="/" className={styles.marque}>
                        <span className={styles.marqueSigle}>
                            <SmartSchoolMark size={19} color="#ffffff" />
                        </span>
                        <span className={styles.marqueTexte}>
                            SmartSchool
                            <span>par TrillionX</span>
                        </span>
                    </Link>
                    <div className={styles.navLiens}>
                        <a href="#pourquoi">Pourquoi</a>
                        <a href="#fonctions">Fonctionnalités</a>
                        <a href="#espaces">Pour qui</a>
                        <a href="#contact">Contact</a>
                    </div>
                    <Link href="/login" className={`${styles.bouton} ${styles.boutonPrincipal}`}>
                        Se connecter
                    </Link>
                </div>
            </nav>

            {/* ── Ouverture ── */}
            <header className={styles.hero}>
                <div className={`${styles.contenu} ${styles.heroInterieur}`}>
                    <div>
                        <span className={styles.pastille}>
                            <i className={styles.point} /> Solution de gestion scolaire
                        </span>
                        <h1 className={styles.heroTitre}>
                            Votre école mérite mieux que des cahiers et des tableurs.
                            <br />
                            <span className={styles.degrade}>Reprenez le contrôle.</span>
                        </h1>
                        <p className={styles.heroTexte}>
                            SmartSchool réunit les inscriptions, les notes, les bulletins, les présences,
                            les finances et la communication avec les familles — dans une seule
                            application, simple et sécurisée.
                        </p>
                        <div className={styles.heroActions}>
                            <a href="#contact" className={`${styles.bouton} ${styles.boutonPrincipal}`}>
                                Demander une démonstration
                            </a>
                            <Link href="/login" className={`${styles.bouton} ${styles.boutonTransparent}`}>
                                J&apos;ai déjà un compte <ArrowRight size={16} />
                            </Link>
                        </div>
                        <div className={styles.heroGaranties}>
                            <span><i className={styles.point} /> Vos données protégées</span>
                            <span><i className={styles.point} /> Formation incluse</span>
                            <span><i className={styles.point} /> Accompagnement au démarrage</span>
                        </div>
                    </div>

                    {/* Aperçu illustratif — chiffres d'exemple, clairement annoncés. */}
                    <div className={styles.apercu}>
                        <div className={styles.apercuLigne}>
                            <span className={styles.apercuIcone}><Users size={17} /></span>
                            <span>
                                <span className={styles.apercuTitre}>Élèves inscrits</span>
                                <span className={styles.apercuSousTitre}>suivi en temps réel</span>
                            </span>
                            <span className={styles.apercuValeur}>1 248</span>
                        </div>
                        <div className={styles.apercuLigne}>
                            <span className={styles.apercuIcone}><FileText size={17} /></span>
                            <span>
                                <span className={styles.apercuTitre}>Bulletins générés</span>
                                <span className={styles.apercuSousTitre}>en quelques minutes</span>
                            </span>
                            <span className={styles.apercuValeur}>100 %</span>
                        </div>
                        <div className={styles.apercuLigne}>
                            <span className={styles.apercuIcone}><CheckCircle2 size={17} /></span>
                            <span>
                                <span className={styles.apercuTitre}>Présences du jour</span>
                                <span className={styles.apercuSousTitre}>appel par classe</span>
                            </span>
                            <span className={styles.apercuValeur}>96 %</span>
                        </div>
                        <div className={styles.apercuLigne}>
                            <span className={styles.apercuIcone}><Coins size={17} /></span>
                            <span>
                                <span className={styles.apercuTitre}>Recouvrement</span>
                                <span className={styles.apercuSousTitre}>impayés identifiés</span>
                            </span>
                            <span className={styles.apercuValeur}>suivi</span>
                        </div>
                        <p className={styles.apercuNote}>Aperçu illustratif du tableau de bord</p>
                    </div>
                </div>
            </header>

            {/* ── Le problème ── */}
            <section className={styles.section} id="pourquoi">
                <div className={styles.contenu}>
                    <div className={styles.centre}>
                        <span className={styles.surtitre}>Le quotidien de trop d&apos;écoles</span>
                        <h2 className={styles.titre}>Chaque trimestre, des dizaines d&apos;heures partent en fumée.</h2>
                        <p className={styles.intro}>
                            Ce n&apos;est pas un manque de sérieux. C&apos;est un manque d&apos;outil.
                            Et ça se paie — en temps, en erreurs, et en crédibilité.
                        </p>
                    </div>
                    <div className={`${styles.grille} ${styles.grille2}`}>
                        {PROBLEMES.map((p) => (
                            <div key={p.titre} className={styles.probleme}>
                                <b>{p.titre}</b>
                                <p>{p.texte}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Ce qui change ── */}
            <section className={`${styles.section} ${styles.sectionClaire}`}>
                <div className={styles.contenu}>
                    <div className={styles.centre}>
                        <span className={styles.surtitre}>Ce qui change avec SmartSchool</span>
                        <h2 className={styles.titre}>Le même travail. En une fraction du temps.</h2>
                        <p className={styles.intro}>
                            Vous ne changez pas votre façon d&apos;enseigner. Vous supprimez ce qui vous en empêche.
                        </p>
                    </div>
                    <div className={`${styles.grille} ${styles.grille2}`}>
                        {BENEFICES.map((b) => (
                            <div key={b.titre} className={styles.benefice}>
                                <b>{b.titre}</b>
                                <p>{b.texte}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Fonctionnalités ── */}
            <section className={styles.section} id="fonctions">
                <div className={styles.contenu}>
                    <div className={styles.centre}>
                        <span className={styles.surtitre}>Tout est inclus</span>
                        <h2 className={styles.titre}>Une seule application pour toute l&apos;école</h2>
                        <p className={styles.intro}>
                            De l&apos;inscription de l&apos;élève jusqu&apos;au bulletin de fin d&apos;année,
                            en passant par la caisse et la vie scolaire.
                        </p>
                    </div>
                    <div className={`${styles.grille} ${styles.grille3}`}>
                        {FONCTIONS.map(({ Icone, vert, titre, texte }) => (
                            <div key={titre} className={styles.carte}>
                                <span className={`${styles.icone} ${vert ? styles.iconeVerte : ''}`}>
                                    <Icone size={20} />
                                </span>
                                <h3>{titre}</h3>
                                <p>{texte}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Espaces par rôle ── */}
            <section className={`${styles.section} ${styles.sectionClaire}`} id="espaces">
                <div className={styles.contenu}>
                    <div className={styles.centre}>
                        <span className={styles.surtitre}>Chacun son espace</span>
                        <h2 className={styles.titre}>Chacun voit ce qui le concerne. Rien de plus.</h2>
                        <p className={styles.intro}>
                            Un accès adapté au rôle de chaque personne — la direction garde la main sur tout.
                        </p>
                    </div>
                    <div className={`${styles.grille} ${styles.grille4}`}>
                        {ESPACES.map(({ Icone, vert, titre, points }) => (
                            <div key={titre} className={styles.role}>
                                <div className={styles.roleTitre}>
                                    <span className={`${styles.roleIcone} ${vert ? styles.roleIconeVerte : ''}`}>
                                        <Icone size={16} />
                                    </span>
                                    {titre}
                                </div>
                                <ul className={styles.roleListe}>
                                    {points.map((pt) => <li key={pt}>{pt}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className={`${styles.grille} ${styles.grille3}`} style={{ marginTop: '18px' }}>
                        {ESPACES_METIERS.map(({ Icone, titre, points }) => (
                            <div key={titre} className={styles.role}>
                                <div className={styles.roleTitre}>
                                    <span className={styles.roleIcone}><Icone size={16} /></span>
                                    {titre}
                                </div>
                                <ul className={styles.roleListe}>
                                    {points.map((pt) => <li key={pt}>{pt}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Pourquoi TrillionX ── */}
            <section className={styles.section}>
                <div className={`${styles.contenu} ${styles.grille} ${styles.grille2}`} style={{ alignItems: 'center', gap: '40px', marginTop: 0 }}>
                    <div>
                        <span className={styles.surtitre}>Pourquoi TrillionX</span>
                        <p className={styles.citation}>
                            «&nbsp;Un logiciel, ça ne suffit pas. Ce qui compte, c&apos;est que votre équipe s&apos;en serve.&nbsp;»
                        </p>
                        <p className={styles.intro} style={{ marginTop: '18px' }}>
                            C&apos;est pourquoi nous ne livrons pas seulement une application : nous configurons
                            votre école, nous formons vos équipes et nous restons à vos côtés au démarrage.
                        </p>
                    </div>
                    <div className={styles.grille} style={{ gap: '14px', marginTop: 0 }}>
                        <div className={styles.carte}>
                            <h3 style={{ marginTop: 0 }}>
                                <span className={styles.iconeLigne}><Lock size={17} /></span>
                                Vos données vous appartiennent
                            </h3>
                            <p>Elles sont protégées, séparées de celles des autres écoles, et ne servent à rien d&apos;autre.</p>
                        </div>
                        <div className={styles.carte}>
                            <h3 style={{ marginTop: 0 }}>
                                <span className={`${styles.iconeLigne} ${styles.iconeLigneVerte}`}><Target size={17} /></span>
                                Formation de vos équipes
                            </h3>
                            <p>Direction, enseignants, comptables, surveillants : chacun est formé sur son espace.</p>
                        </div>
                        <div className={styles.carte}>
                            <h3 style={{ marginTop: 0 }}>
                                <span className={styles.iconeLigne}><LayoutGrid size={17} /></span>
                                Accompagnement au démarrage
                            </h3>
                            <p>Nous restons disponibles quand vos équipes prennent l&apos;outil en main.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Appel à l'action + contacts ── */}
            <section className={styles.section} id="contact">
                <div className={styles.contenu}>
                    <div className={styles.appel}>
                        <span className={styles.surtitre}>Faisons le premier pas</span>
                        <h2 className={styles.titre}>Voyez SmartSchool sur votre propre école.</h2>
                        <p className={styles.intro} style={{ marginBottom: '26px' }}>
                            Une démonstration gratuite, sans engagement. Nous vous montrons concrètement
                            ce que ça change pour votre établissement.
                        </p>
                        <div className={styles.appelActions}>
                            <a href={`tel:+224${TELEPHONE_1.replace(/\s/g, '')}`} className={`${styles.bouton} ${styles.boutonBlanc}`}>
                                Appeler maintenant
                            </a>
                            <a href={`mailto:${EMAIL}`} className={`${styles.bouton} ${styles.boutonTransparent}`}>
                                Écrire un e-mail
                            </a>
                        </div>
                        <div className={styles.contacts}>
                            <a className={styles.contact} href={`tel:+224${TELEPHONE_1.replace(/\s/g, '')}`}>
                                <span className={styles.contactIcone}><Phone size={17} /></span>
                                <span>
                                    <span className={styles.contactLibelle}>Téléphone</span>
                                    <span className={styles.contactValeur}>{TELEPHONE_1}</span>
                                </span>
                            </a>
                            <a className={styles.contact} href={`tel:+224${TELEPHONE_2.replace(/\s/g, '')}`}>
                                <span className={styles.contactIcone}><Phone size={17} /></span>
                                <span>
                                    <span className={styles.contactLibelle}>Téléphone</span>
                                    <span className={styles.contactValeur}>{TELEPHONE_2}</span>
                                </span>
                            </a>
                            <a className={styles.contact} href={`mailto:${EMAIL}`}>
                                <span className={styles.contactIcone}><Mail size={17} /></span>
                                <span>
                                    <span className={styles.contactLibelle}>E-mail</span>
                                    <span className={styles.contactValeur}>{EMAIL}</span>
                                </span>
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Pied de page ── */}
            <footer className={styles.pied}>
                <div className={`${styles.contenu} ${styles.piedInterieur}`}>
                    <span><strong>TrillionX</strong> — Services numériques · SmartSchool</span>
                    <span>{TELEPHONE_1} · {TELEPHONE_2} · {EMAIL}</span>
                    <Link href="/login">Accéder à l&apos;application <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link>
                </div>
            </footer>
        </div>
    );
}
