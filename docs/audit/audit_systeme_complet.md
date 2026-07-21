# 🔍 SMARTSCHOOL ERP — Audit Système Complet
> **Date** : 15 Mars 2026  
> **Projet** : ERP Scolaire National — Gouvernement de Guinée  
> **Version** : 1.0.0  

---

## 📊 Vue d'Ensemble du Système

| Composant | Techno | État | Fichiers |
|---|---|---|---|
| **Backend API** | FastAPI + Python | ✅ Opérationnel | 15 routes API |
| **Frontend** | Next.js 16 + React | ✅ Opérationnel | 23 pages |
| **Base de données** | PostgreSQL | ✅ Opérationnelle | ~30 tables |
| **Portail Parent** | React | ✅ Complet | Login + Dashboard |
| **Portail Enseignant** | React | ✅ Complet | Login + Dashboard + EDT |

---

## 🔴 PROBLÈMES CRITIQUES DE SÉCURITÉ

### SEC-01 : Mots de passe stockés en texte clair
- **Sévérité** : 🔴 CRITIQUE
- **Impact** : Violation des normes de sécurité gouvernementales
- **Détails** : Les mots de passe parents et enseignants sont stockés et comparés en texte brut dans la base de données. En cas de fuite de la BDD, tous les mots de passe sont exposés.
- **Fichiers concernés** :
  - `backend/app/api/portail_enseignant.py` (ligne 31) — comparaison directe
  - `backend/app/api/portail_parent.py` (ligne 35) — comparaison directe
  - `backend/app/api/eleves.py` (ligne 260) — stockage brut
  - `backend/app/api/enseignants.py` — stockage brut via schéma
- **Correction** : Implémenter `passlib` avec `bcrypt` pour le hashage

### SEC-02 : Login via méthode GET (mot de passe dans l'URL)
- **Sévérité** : 🔴 CRITIQUE
- **Impact** : Mot de passe visible dans les logs serveur, historique navigateur, proxy
- **Détails** : Les endpoints de login utilisent `@router.get("/login")` au lieu de POST. Le mot de passe transite comme paramètre d'URL : `/login?telephone=xxx&mot_de_passe=secret`
- **Fichiers concernés** :
  - `backend/app/api/portail_enseignant.py` (ligne 21)
  - `backend/app/api/portail_parent.py` (ligne 22)
- **Correction** : Passer en `@router.post("/login")` avec body JSON

### SEC-03 : Aucune authentification admin
- **Sévérité** : 🟠 HAUTE
- **Impact** : Toute personne avec l'URL peut accéder au back-office
- **Détails** : L'interface admin (localhost:3000) n'a aucun mécanisme de login. Les routes API ne vérifient pas de token d'authentification.
- **Correction** : Implémenter JWT tokens + page de login admin

---

## 🟠 PROBLÈMES ARCHITECTURAUX

### ARCH-01 : URL API en dur dans tout le frontend
- **Sévérité** : 🟠 HAUTE
- **Impact** : Impossible de déployer en production sans modifier 80+ fichiers
- **Détails** : `http://localhost:8000` est écrit en dur dans tous les fichiers frontend (80+ occurrences). Le fichier `frontend/src/config.ts` existe avec `API_BASE_URL` mais n'est importé nulle part.
- **Fichiers concernés** : TOUS les fichiers page.tsx (23 fichiers)
- **Correction** : `import { API_BASE_URL } from '@/config'` dans chaque fichier

### ARCH-02 : IDs en dur (etablissement_id=1, annee_id=1)  
- **Sévérité** : 🟠 HAUTE
- **Impact** : Le système ne fonctionne que pour 1 seul établissement, 1 seule année
- **Détails** : Les constantes `etablissement_id=1` et `annee_id=1` sont codées en dur dans 13+ endroits du frontend.
- **Fichiers** :
  - `page.tsx` (dashboard) — ligne 76
  - `classes/page.tsx` — ligne 50
  - `enseignants/[id]/page.tsx` — lignes 64-66, 88
  - `enseignants/nouveau/page.tsx` — ligne 68
  - `eleves/nouveau/page.tsx` — ligne 69
  - `classes/nouveau/page.tsx` — ligne 37
  - `communication/page.tsx` — ligne 89
  - `emploi-du-temps/page.tsx` — ligne 73
  - `emploi-du-temps/generes/page.tsx` — ligne 51
  - `examens/emploi/page.tsx` — ligne 74
  - `teacher-dashboard/page.tsx` — lignes 114, 116
- **Correction** : Créer un Context React `AppContext` avec ces valeurs récupérées depuis l'API

### ARCH-03 : Pas de gestion d'erreur réseau centralisée
- **Sévérité** : 🟡 MOYENNE
- **Impact** : Expérience utilisateur incohérente en cas de panne backend
- **Détails** : Chaque page a son propre `try/catch` avec des messages d'erreur différents
- **Correction** : Intercepteur Axios global (`axiosConfig.ts`)

---

## 🟡 DONNÉES FACTICES / EN DUR

### DATA-01 : Utilisateur admin fictif
| Donnée | Valeur actuelle | Fichier | Ligne |
|---|---|---|---|
| Nom | `Riley Morgan` | `components/Topbar.tsx` | 51 |
| Rôle | `Superviseur ERP` | `components/Topbar.tsx` | 52 |
| Badge notifications | `9` | `components/Topbar.tsx` | 22 |
| Badge moniteur | `5` | `components/Topbar.tsx` | 29 |
| Badge favori | `0` | `components/Topbar.tsx` | 36 |

### DATA-02 : Année scolaire "2024-2025" en dur
| Fichier | Ligne |
|---|---|
| `portail-parent/page.tsx` | 268, 596 |
| `portail-enseignant/page.tsx` | 365 |
| `enseignants/[id]/page.tsx` | 414 |

### DATA-03 : ID enseignant simulé
| Donnée | Valeur | Fichier | Ligne |
|---|---|---|---|
| `CURRENT_ENSEIGNANT_ID` | `1` | `teacher-dashboard/page.tsx` | 17 |

### DATA-04 : Données de présence fictives (profil enseignant)
| Fichier | Lignes | Description |
|---|---|---|
| `enseignants/[id]/page.tsx` | 103-107 | Array statique : `{month: 'Sept', present: 22, absent: 1}` etc. |

### DATA-05 : Student Dashboard 100% fictif
| Fichier | Description |
|---|---|
| `student-dashboard/page.tsx` | ENTIÈREMENT en données statiques : cours Figma, noms anglais (Ethan Walker, David Smith), GPA 3.85, devoirs inventés — **aucune connexion API** |

---

## ✅ BUGS CORRIGÉS DANS CETTE SESSION

| Bug | Fichier | Description | Statut |
|---|---|---|---|
| React key prop | `enseignants/[id]/page.tsx` (L439) | Fragment `<>` sans key dans `.map()` | ✅ Corrigé |
| Timetable crash | `portail-enseignant/page.tsx` (L397) | `getSlotColor` recevait index `-1` | ✅ Corrigé |
| Layout fullscreen | `portail-enseignant/layout.tsx` | Sidebar admin visible sur le portail | ✅ Corrigé |
| Port backend | `main.py` | Port 8500 bloqué par Windows → 8000 | ✅ Corrigé |

---

## 📋 MODULES EXISTANTS ET LEUR ÉTAT

| Module | Pages Frontend | API Backend | État |
|---|---|---|---|
| **Dashboard Admin** | `page.tsx` | `dashboard.py` | ✅ Connecté API |
| **Gestion Élèves** | `eleves/` (4 pages) | `eleves.py` | ✅ CRUD complet |
| **Gestion Enseignants** | `enseignants/` (4 pages) | `enseignants.py` | ✅ CRUD + portail |
| **Gestion Classes** | `classes/` (4 pages) | `classes.py` | ✅ CRUD + config |
| **Matières** | `matieres/page.tsx` | `matieres.py` | ✅ Auto-génération |
| **Emploi du Temps** | `emploi-du-temps/` (2 pages) | `emploi_du_temps.py` | ✅ Génération auto |
| **Évaluations** | `centre-evaluation/` | `evaluations.py` | ✅ Saisie notes |
| **Examens** | `examens/emploi/` | `examens.py` | ✅ Planning + sujets |
| **Communication** | `communication/` | `communication.py` | ✅ Messages + demandes |
| **Finance** | — | `finance.py` | ⚠️ Backend seul, pas de page |
| **Vie Scolaire** | — | `vie_scolaire.py` | ⚠️ Backend seul, pas de page |
| **Portail Parent** | `portail-parent/` | `portail_parent.py` | ✅ Complet |
| **Portail Enseignant** | `portail-enseignant/` | `portail_enseignant.py` | ✅ Complet |
| **Student Dashboard** | `student-dashboard/` | — | ❌ 100% mock |
| **Teacher Dashboard** | `teacher-dashboard/` | Utilise API existantes | ⚠️ Partiellement mock |
