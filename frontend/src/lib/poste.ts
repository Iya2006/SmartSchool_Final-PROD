/**
 * L'interface tourne-t-elle dans l'application installée (poste local) ?
 *
 * Deux versions de la même interface sont compilées :
 * - la version web, servie par le cloud, qui parle à l'API en ligne ;
 * - la version poste (application installée), qui parle au moteur SmartSchool
 *   de l'ordinateur (`NEXT_PUBLIC_API_URL=http://127.0.0.1:47830`), avec ou
 *   sans internet. Compilée avec `NEXT_PUBLIC_SMARTSCHOOL_POSTE=1`.
 *
 * Sur le poste, la préparation hors-ligne du navigateur (Phase 0) n'a pas de
 * sens : les données sont déjà sur l'ordinateur, dans sa base locale.
 */
export const EST_POSTE = process.env.NEXT_PUBLIC_SMARTSCHOOL_POSTE === '1';
