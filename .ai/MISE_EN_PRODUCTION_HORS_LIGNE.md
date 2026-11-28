# Mettre en production le fonctionnement hors-ligne

Pour : le fondateur, avec Sams (accès au serveur loué, à Supabase et à
Cloudflare). Je ne touche jamais à la production : chaque étape est faite par
vous. Je vérifie ensuite de l'extérieur, en lecture seule.

Ce document sert à l'étape D7 du plan, **après votre accord sur la fusion**
(`IYA-hors-ligne` → `IYA` → `main`). Rien ici n'est à faire avant.

## Ce qui change en production

1. **La base (Supabase).** Les identifiants passent sur 64 bits (BIGINT). C'est
   la seule migration à lancer à la main. Elle ne change aucune valeur.
2. **Le serveur (API).** Au démarrage, il installe tout seul le journal des
   changements : un déclencheur par table, posé sous verrou par les 4
   processus. Il ajoute aussi les colonnes manquantes (dont `emploi_pdf` des
   classes) et rattache à leur école les anciennes présences sans école.
3. **Le site (Cloudflare).** Écran « Synchronisation » et corrections
   d'affichage. Il fonctionne aussi avec l'ancien serveur.
4. **L'installeur Windows.** Il est publié pour la première fois, sur un
   dépôt GitHub public dédié (`smartschool-installation`).
5. **La vitrine.** Son bouton « Télécharger » mène à cet installeur. Elle
   part donc en dernier.

**Pourquoi la migration doit passer AVANT le nouveau serveur :** le nouveau
code crée certaines lignes avec des identifiants au-delà de 2³¹ (identifiants
« naturels », et ceux des postes). Une colonne encore en INTEGER les refuse :
l'enregistrement échouerait, pour les utilisateurs du web aussi.

L'ancien code fonctionne sur une base migrée : la migration n'empêche donc
jamais un retour en arrière du code.

## Durée et créneau

- **Migration : à peine plus d'une seconde, mesurée le 22/11.**
  - Mesurée sur une copie fraîche de la base de développement : 5 000
    élèves, 20 Mo, 232 colonnes élargies.
  - La durée croît avec la taille de la base. Vérifier celle de la
    production dans Supabase (Database → Database size) : même à 1 Go, elle
    resterait de l'ordre d'une minute.
  - Pendant la migration, les tables sont verrouillées.
- **Premier démarrage de la nouvelle version : 5 s**, journal posé par les
  4 processus sur les 73 tables, mesuré sur la même copie.
- **Interruption du service web : quelques minutes** (étapes 3 à 5).
  L'ensemble de l'opération prend environ une heure.
- **À faire hors des heures de saisie** (soir ou week-end), écoles prévenues.

## Avant le jour J

- [ ] Fusion acceptée : `IYA-hors-ligne` → `IYA` → `main`.
- [ ] Accès vérifiés :
  - SSH au serveur (`/opt/smartschool`) ;
  - tableau de bord Supabase ;
  - Cloudflare (`npx wrangler login` sur l'ordinateur qui déploie le site) ;
  - GitHub (création du dépôt public).
- [ ] Place disque sur le serveur pour une sauvegarde (`df -h /opt`).

## Le jour J

### 1. Sauvegarder la base

Sur le serveur, la sauvegarde va dans `/opt/sauvegardes`. L'adresse est celle
du `.env` du serveur, **sans `+pg8000`** : `pg_dump` ne connaît pas ce
préfixe.

```
mkdir -p /opt/sauvegardes
cd /opt/smartschool
ADRESSE=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/+pg8000//; s/^"//; s/"$//')
docker run --rm -v /opt/sauvegardes:/sauvegardes postgres:17 \
  pg_dump "$ADRESSE" -Fc -f /sauvegardes/avant-hors-ligne.dump
ls -lh /opt/sauvegardes
```

- Le fichier doit faire plusieurs mégaoctets. S'il fait quelques kilooctets,
  la sauvegarde a échoué : **on s'arrête là**.
- Si l'adresse utilise le port **6543** (« pooler » de Supabase), prendre
  pour cette étape et la suivante l'adresse **directe** (port 5432) :
  Supabase → Project Settings → Database.

### 2. Récupérer et construire la nouvelle version, sans la démarrer

Le service tourne encore pendant cette étape, qui prend 3 à 5 minutes :

```
cd /opt/smartschool
git pull --ff-only
docker compose -f docker-compose.vps.yml build api worker
```

### 3. Arrêter le service web

```
docker compose -f docker-compose.vps.yml stop api worker
```

Le site affiche alors « Serveur indisponible ». L'interruption commence ici.

### 4. Migrer la base

D'abord une **simulation**, qui n'écrit rien :

```
docker compose -f docker-compose.vps.yml run --rm --no-deps api \
  python migrations/2026_10_sync_01_identifiants_bigint.py
```

Elle annonce le nombre de colonnes à élargir, environ 230. Puis la vraie
migration :

```
docker compose -f docker-compose.vps.yml run --rm --no-deps api \
  python migrations/2026_10_sync_01_identifiants_bigint.py --appliquer
```

La migration tient en **une seule transaction** : en cas d'échec, rien n'est
changé. Relancée sur une base déjà migrée, elle ne fait rien.

### 5. Démarrer la nouvelle version

```
./scripts/deployer.sh
```

Le code est déjà à jour et l'image déjà construite : le script redémarre,
puis attend que l'application réponde vraiment. Il se termine par
« Déploiement terminé », et l'interruption s'arrête là. Au premier
démarrage, la pose du journal ajoute quelques secondes.

### 6. Déployer le site

Sur l'ordinateur qui déploie habituellement le site, à jour sur `main` :

```
cd frontend
npm run cf:deploy
```

Le script refuse de partir si l'adresse de l'API n'est pas celle de la
production.

### 7. Me prévenir : je vérifie (lecture seule)

- `https://api.trxsmartschool.com/health` : `database` et `redis` à `up` ;
- connexion au web, tableau de bord, une fiche élève ;
- un reçu : affichage et PDF (le défaut de `main` du 18/11 est corrigé) ;
- l'écran « Synchronisation » : rien à vérifier, aucun poste.

### 8. Publier l'installeur (avec votre accord)

1. Créer le dépôt **public** `Iya2006/smartschool-installation`, vide. Il ne
   contiendra que les installeurs.
2. Je construis l'installeur depuis le commit fusionné et vous le donne :
   `SmartSchool-Setup.exe`, plus `latest.yml` (le fichier que lisent les
   mises à jour automatiques).
3. Vous créez la version `v0.3.0` dans ce dépôt, avec ces deux fichiers.
4. Essai : installer sur un ordinateur de l'école avec un compte de
   direction. Puis couper internet, travailler, le rétablir.

### 9. Vitrine, en dernier

Déployer la vitrine seulement quand l'étape 8 est faite : son bouton
« Télécharger » ne doit jamais mener à un fichier absent.

## Si quelque chose se passe mal

| Où | Quoi faire |
|---|---|
| Sauvegarde trop petite ou en erreur | S'arrêter. Rien n'a changé. |
| Migration en erreur | Rien n'a changé (une transaction). Me transmettre le message. Redémarrer l'ancienne version : `docker compose -f docker-compose.vps.yml start api worker`. |
| Nouvelle version qui ne répond pas | Le script affiche les journaux et la commande de retour (`git reset --hard <version d'avant> && ./scripts/deployer.sh`). La base migrée convient à l'ancien code. |
| Données abîmées (très improbable) | Restaurer la sauvegarde de l'étape 1, avec moi. |

## Recommandé à Sams, sans lien obligé avec la fusion

**L'adresse réelle des visiteurs n'arrive pas jusqu'à l'API.**
- uvicorn ne fait confiance qu'à `127.0.0.1` pour l'en-tête `X-Forwarded-For`,
  or Caddy lui parle depuis son conteneur. Toutes les requêtes semblent donc
  venir de Caddy.
- De plus, Caddy transmet l'adresse de Cloudflare, pas celle du visiteur.
- Conséquence jusqu'ici : la limite de 5 tentatives de connexion par minute
  était **commune à toute la plateforme**, partagée par Redis entre les 4
  processus. À 7 h 50, la sixième personne qui se connectait dans la minute
  était refusée.

La fusion règle déjà le blocage : le compteur porte désormais sur l'adresse
**et** le compte visé. Pour retrouver aussi l'adresse réelle, deux réglages :
- `FORWARDED_ALLOW_IPS: "*"` dans l'environnement du service `api`. C'est
  sans risque : l'API n'est joignable que par Caddy.
- Dans Caddy, faire confiance aux adresses de Cloudflare et transmettre
  l'adresse du visiteur, au lieu de `{remote_host}`.
