# 🏫 SmartSchool ERP — Système de Gestion Scolaire Intégré

> **Client** : Gouvernement de Guinée  
> **Stack** : FastAPI (Python) + Next.js 16 (React/TypeScript) + PostgreSQL  
> **Deadline** : 15 Juillet 2026

---

## 📁 Structure du Projet

```
SMART_SCHOOL_FINAL/
├── backend/            # API FastAPI (Python)
│   ├── app/
│   │   ├── api/        # Endpoints (eleves, enseignants, finance, etc.)
│   │   ├── core/       # Auth, sécurité, config base de données
│   │   ├── models/     # Modèles SQLAlchemy (ORM)
│   │   └── schemas/    # Schémas Pydantic (validation)
│   └── main.py         # Point d'entrée du serveur
│
├── frontend/           # Application Next.js (TypeScript)
│   └── src/
│       ├── app/        # Pages (dashboard, eleves, comptabilite, portails...)
│       ├── components/ # Composants réutilisables (Sidebar, Topbar...)
│       ├── context/    # Contextes React (Auth, App)
│       └── lib/        # Utilitaires (api.ts)
│
├── database/           # Scripts SQL (structure, données de démo)
├── docs/               # Documentation du projet
│   ├── audit/          # Audits de sécurité et plans de travail
│   ├── comptabilite/   # Cahier des charges et suivi du module comptabilité
│   ├── guides/         # Guides d'équipe (GitHub workflow, commandes)
│   └── pedagogie/      # Programmes scolaires guinéens et système de notation
│
├── scripts/            # Scripts utilitaires (migrations, corrections)
├── secrets/            # Mots de passe locaux (⚠️ EXCLUS de Git)
│
├── docker-compose.yml  # Orchestration Docker
├── START.bat           # Lancement rapide Windows
├── STOP.bat            # Arrêt rapide Windows
└── .gitignore          # Fichiers exclus du dépôt
```

---

## 🚀 Installation Rapide

### Prérequis
- **Node.js** (v18+) et **npm**
- **Python** (v3.10+) et **pip**
- **PostgreSQL** (v14+)

### 1. Cloner le projet
```bash
git clone https://github.com/lya2006/SmartSchool_Final15J.git
cd SmartSchool_Final15J
```

### 2. Configurer le backend
```bash
cd backend
pip install -r requirements.txt
# Créer un fichier .env avec vos identifiants PostgreSQL
uvicorn main:app --reload --port 8000
```

### 3. Configurer le frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Accéder à l'application
- **Admin** : http://localhost:3000
- **API** : http://localhost:8000/docs

---

## 🌿 Workflow Git (Pour l'équipe)

Voir le guide complet : [`docs/guides/github_workflow_guide.md`](docs/guides/github_workflow_guide.md)

**En résumé :**
1. `git checkout develop` → Se placer sur la branche d'intégration
2. `git pull origin develop` → Récupérer les dernières mises à jour
3. `git checkout -b feature/ma-tache` → Créer sa branche personnelle
4. Coder, tester, `git add .`, `git commit -m "..."`, `git push origin feature/ma-tache`
5. Créer une **Pull Request** sur GitHub de `feature/...` vers `develop`

---

## 📋 Répartition des Tâches

Voir : [`docs/comptabilite/repartition_taches_comptabilite.md`](docs/comptabilite/repartition_taches_comptabilite.md)

---

## ⚠️ Règles Importantes

- **NE JAMAIS** coder directement sur `main` ou `develop`.
- **NE JAMAIS** pousser le dossier `secrets/` ou les fichiers `.env` sur GitHub.
- **TOUJOURS** créer une branche `feature/...` pour chaque tâche.
- **COMMUNIQUER** sur le groupe avant de modifier un fichier partagé.



# EDUNET FONCTIONNALITER QUI EST NOTRE CONCURENT DIRECT SUR LE MARCHER : 

# 1 FONCTIONNALITE 1: ENREGISTREMENT DE PRESENCE DES ENSEIGNENT PERSONNEL ET AUTRE :

Voilà, on va essayer de gérer une fonctionnalité là. J'ai vu une fonctionnalité sur un système d'un concurrent, donc voici l'explication détaillée de la vidéo faite de la présentation de son application. Donc, veuillez faire écouter. Découvrons une autre fonctionnalité importante de Edunet. Dans ce logiciel, vous avez la possibilité d'enregistrer automatiquement la présence de vos agents grâce au code QR. Avec cette nouvelle méthode moderne, il n'est plus nécessaire d'utiliser des feuilles ou des papiers pour noter les présences. Il suffit simplement de scanner le code QR de l'agent et sa présence sera enregistrée automatiquement dans le système. Pour commencer l'enregistrement d'une présence, cliquez sur Démarrer. Lorsque votre agent arrive dans l'établissement, il doit simplement présenter son badge contenant son code QR devant la caméra. Le système va automatiquement détecter son code. Après le scan, le logiciel va afficher sa photo de profil, envoyer son identité ainsi que son heure d'arrivée. Au moment du départ de l'agent, l'agent présente enfin son code QR devant la caméra. Le système va automatiquement enregistrer son heure de sortie. Le système dispose également d'une sécurité pour éviter les erreurs dans l'enregistrement des présences. Par exemple, si une personne essaie de scanner son code QR plusieurs fois dans la même journée, le logiciel va détecter que cette présence a déjà été enregistrée. Il va afficher un message indiquant que cette personne est déjà enregistrée. Cette sécurité permet d'éviter les fraudes et les erreurs, comme une personne qui essayerait de modifier son heure d'arrivée ou son heure de départ. Pour consulter toutes les présences enregistrées dans votre école, cliquez sur l'option « Historique de présence ». Dans cette partie, vous retrouverez toutes les informations liées aux présences de vos agents depuis le début de l'utilisation du système. Vous pouvez faire défiler la page pour voir toutes les présences enregistrées. Vous avez également la possibilité d'utiliser les filtres pour obtenir des résultats plus précis. Vous pouvez choisir une période, un mois, une année scolaire ou rechercher directement un agent avec son nom. Cette recherche vous permettra de savoir si un agent est régulièrement présent ou non dans votre établissement. Vous pouvez voir son heure d'arrivée, son heure de départ et toutes les informations liées à sa présence. Parlons maintenant d'une partie très importante de Edunet, la gestion pédagogique. Pour accéder à cette partie, cliquez sur l'option « Gestion pédagogique ». Dans cet espace, vous trouverez plusieurs fonctionnalités importantes pour l'organisation scolaire. Vous avez la possibilité de configurer l'horaire de votre école. Vous pouvez également gérer les stagiaires qui viennent effectuer leurs stages pédagogiques dans votre établissement. Le système vous permet aussi de gérer les finalistes de votre école. Une autre fonctionnalité importante est la génération automatique de la liste déclarative des finalistes. Cette liste est généralement envoyée au ministère de l'Enseignement. Avec Edunet, vous n'avez plus besoin de refaire cette liste manuellement dans des logiciels bureautiques. Elle est déjà générée automatiquement dans le système. Vous avez également la possibilité d'attribuer des livres ou des matières à vos enseignants. Pour commencer la configuration pédagogique, la première étape consiste à définir les heures de service de votre école. Ces horaires sont appelés les créneaux. Pour cela, cliquez sur « Configuration ». Ensuite, cliquez sur le bouton « Modifier ». Une petite fenêtre va apparaître avec les horaires de service de votre établissement. Vérifiez les informations puis cliquez sur « Enregistrer ». Les heures de service de votre école seront enregistrées automatiquement. Maintenant, voyons comment configurer l'horaire des cours. Pour modifier ou créer l'horaire de votre établissement, cliquez sur le bouton « Horaire ». Dans cette partie, toutes les classes de votre école sont déjà disponibles. Si vous souhaitez modifier l'horaire d'une classe précise, sélectionnez simplement la salle de classe concernée. Après avoir sélectionné la classe, vous serez dirigé vers la partie de remplissage des cours. À partir de cette page, vous pouvez ajouter rapidement les différents cours selon chaque créneau horaire. Une fois que vous avez terminé de remplir l'horaire, cliquez sur « Enregistrer ». Les informations seront automatiquement sauvegardées dans le système. Pour consulter l'horaire d'une classe précise, cliquez simplement sur la salle de classe.   Concernant les fonctionnalités de Handemet, continuer Edinet et aussi ce système. Maintenant, tout ce qui m'intéresse ici, c'est concernant les fonctionnalités de présence et puis, comment dire, de présence des anciens et là. Donc, je vais t'envoyer aussi des images, des captures que j'ai faites concernant ça. OK? Donc, on va gérer ça de façon claire et propre. Maintenant, parce que là, il faudra que les anciens ont des cartes, mais pour l'instant, finissons de gérer ça. On va adapter. Lorsqu'on fera l'ajout d'un ancien automatiquement, sa carte doit être générée, créée. On peut visualiser sa carte avec ses informations. C'est comme si c'était un badge et le code QR là-dessus. OK? Il peut imprimer, genre, ça peut rester dans son téléphone. Là, comme sur l'image, il met au niveau de la caméra, ça scanne et puis ça enregistre son truc. Donc, mais pour l'instant, on va s'occuper de cette fonctionnalité-là. Ensuite, on reviendra sur l'ajout des anciens pour faire en sorte que lorsque l'ajout de l'ancien finit au niveau truc, on puisse avoir la carte, c'est-à-dire l'identifiant, la carte d'entrée de l'ancien avec ses informations, photo directement. Parce que lors de l'ajout de l'ancien, il faut qu'on puisse mettre la photo. Déjà, c'est géré, mais au niveau de l'ajout, il n'y a pas cette option-là en fait. On met la photo et puis sa carte se génère avec ses informations et le code QR aussi unique à lui lorsqu'il scanne. C'est un peu ça. Je vais t'envoyer d'autres images aussi. Il faudra que cette partie-là soit vraiment bien faite, parce que si on le fait bien et plus encore, on pourra battre nos concurrents sur le marché au fait. J'ai plusieurs fonctionnalités de ces concurrents-là comme ça, mais pour l'instant, on finit avec ça d'abord. Et puis, je vais t'envoyer aussi d'autres fonctionnalités concernant le système Edinet.

# Pareme du systeme : 

Bon là, je pense que pour l'instant, ça c'est parfait. Donc, on va essayer maintenant de bien s'organiser tout cela parce que le système, comme on dirait, est conçu pour être utilisé en prod. Donc, tout ce qu'on fait là, on doit tenir que le système doit se faire en prod en termes de robustesse de notre code, de la clinité, sans bug, sans erreur ni de faille de sécurité. Donc, on doit tenir compte de tout ça. Donc, si tout cela est garanti, on peut commencer l'implémentation de façon, de façon, comment dirais-je, pas de façon directe, cela étape. On va suivre des étapes pour faire tout de façon parfaite en fait. Donc là, pour l'instant, je valide, disons ça, c'est le premier plan, je valide parce qu'il se peut qu'on finisse les implémentations là. Et puis, il y a d'autres idées parce que c'est en fonction d'un travail réalisé qu'on voit la possibilité d'amélioration ou la possibilité de correction de problème, de faille, des trucs comme ça. Donc, vu que ça, c'est notre première idée, et si tout est bien fait à la loupe, sans erreur, on aura forcément d'autres idées qui seront aussi tout à fait importantes, essentielles et vraiment primordiales pour compléter les autres fonctionnalités de la page paramètres et pour un autre SaaS vraiment top. Donc, je dirais, let's go.