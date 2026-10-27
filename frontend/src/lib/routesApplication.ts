/**
 * Écrans fixes de l'application connectée, préchargés par la préparation
 * hors-ligne (lib/preparationHorsLigne.ts) pour qu'un écran jamais ouvert
 * s'affiche quand même sans réseau. Filtrés par rôle avant usage.
 *
 * Exclus : les écrans publics (vitrine, connexions, inscription, vérification
 * de reçu), qui n'ont pas de sens hors-ligne, et les écrans à identifiant
 * (`/eleves/[id]`...), mis en cache à la première visite. Les portails du
 * personnel (`/personnel/portail/[role]`) sont ajoutés selon le rôle.
 *
 * src/tests/routesApplication.test.ts vérifie que cette liste suit les pages
 * réellement présentes dans src/app.
 */
export const ROUTES_APPLICATION: readonly string[] = [
    '/activites',
    '/administration/etablissements',
    '/administration/incidents',
    '/archive',
    '/bulletins',
    '/centre-evaluation',
    '/classes',
    '/classes/cloture-annee',
    '/classes/nouveau',
    '/communication',
    '/comptabilite',
    '/comptabilite/automatisations',
    '/comptabilite/autres-entrees',
    '/comptabilite/auxiliaire',
    '/comptabilite/communication',
    '/comptabilite/dashboard',
    '/comptabilite/depenses',
    '/comptabilite/encaissement',
    '/comptabilite/exports',
    '/comptabilite/frais',
    '/comptabilite/general',
    '/comptabilite/impayes',
    '/comptabilite/paiements',
    '/comptabilite/rapports',
    '/comptabilite/reinscription',
    '/comptabilite/salaires',
    '/comptabilite/salaires/historique',
    '/comptabilite/scolaire',
    '/dashboard',
    '/dashboard/presences/appel-du-jour',
    '/dashboard/presences/scan',
    '/eleves',
    '/eleves/cartes-classe',
    '/eleves/nouveau',
    '/emploi-du-temps',
    '/emploi-du-temps/generes',
    '/enseignants',
    '/enseignants/nouveau',
    '/evenements',
    '/examens/emploi',
    '/familles',
    '/fournitures',
    '/galerie',
    '/matieres',
    '/monitoring',
    '/notes',
    '/parametres',
    '/parametres/apparence',
    '/parametres/calendrier',
    '/parametres/cartes',
    '/parametres/documents',
    '/parametres/finance',
    '/parametres/horaires',
    '/parametres/identite',
    '/parametres/import-export',
    '/parametres/notation',
    '/parametres/securite',
    '/personnel',
    '/personnel/nouveau',
    '/portail-eleve',
    '/portail-enseignant',
    '/portail-parent',
    '/profil',
    '/resultats-annuels',
    '/salle-des-profs',
    '/student-dashboard',
    '/teacher-dashboard',
    '/vie-scolaire/absences-enseignants',
    '/vie-scolaire/incidents',
    '/vie-scolaire/seances',
];

/** Écrans publics ou hors session, volontairement absents de la liste. */
export const ROUTES_PUBLIQUES: readonly string[] = [
    '/',
    '/comptabilite/login',
    '/hors-ligne',
    '/inscription',
    '/installation',
    '/login',
    '/login/ecole',
    '/selection-etablissement',
    '/verifier-recu',
];
