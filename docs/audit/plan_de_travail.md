# 📋 SMARTSCHOOL ERP — Plan de Travail Post-Analyse
> **Date** : 15 Mars 2026  
> **Mise à jour** : 17 Mars 2026  
> **Après audit** : audit_systeme_complet.md  
> **Organisation** : Par priorité (P0 → P3)

---

## 🔴 P0 — OBLIGATOIRE AVANT DÉPLOIEMENT ✅ TERMINÉ

### P0-01 : Hashage des mots de passe (bcrypt) ✅
- **Statut** : ✅ Terminé le 16/03
- Créé `backend/app/core/security.py` avec hash/verify bcrypt
- Modifié `enseignants.py`, `eleves.py` pour hasher à la création/mise à jour
- Modifié `portail_enseignant.py`, `portail_parent.py` pour vérifier le hash
- Créé et exécuté `migrate_passwords.py` — 8 mots de passe migrés (6 enseignants + 2 parents)
- Installé `passlib` + `bcrypt==4.2.1` (compatible avec passlib)

### P0-02 : Passer les login en POST ✅
- **Statut** : ✅ Terminé le 16/03
- Backend : endpoints changés de GET à POST avec Body JSON (Pydantic schemas)
- Frontend : `portail-enseignant/page.tsx` et `portail-parent/page.tsx` mis à jour

### P0-03 : Centraliser API_BASE_URL ✅
- **Statut** : ✅ Terminé le 16/03
- Créé `frontend/src/lib/api.ts` — instance axios centralisée
- **87 URLs** remplacées dans 22 fichiers
- Supprimé toutes les occurrences de `http://localhost:8000` (sauf config)
- Vérifié : 0 import `axios from 'axios'` restant dans les pages

---

## 🟠 P1 — HAUTE PRIORITÉ ✅ TERMINÉ

### P1-01 : Contexte global React (etablissement + année) ✅
- **Statut** : ✅ Terminé le 16/03
- Créé `frontend/src/context/AppContext.tsx`
- Charge les années via `/api/parametrage/annees`
- Détecte l'année courante (`est_courante = 'O'`)
- Fournit `etablissementId`, `anneeId`, `anneeLibelle`
- Wrappé dans `layout.tsx` via `Providers.tsx`
- **13 fichiers** migrés — remplacé tous les `etablissement_id=1` et `annee_id=1`
- Remplacé les 4 occurrences de `"Année 2024-2025"` en dur

### P1-02 : Authentification admin (JWT) ✅
- **Statut** : ✅ Terminé le 17/03
- Installé `pyjwt` pour la gestion JWT
- Créé `backend/app/core/auth.py` — token creation/validation/dependency
- Créé `backend/app/api/auth.py` — POST /login, GET /me (protégée)
- Login par email, téléphone ou matricule
- Token HS256, durée 8h
- Créé `frontend/src/context/AuthContext.tsx` — gestion session client
- Créé `frontend/src/app/login/page.tsx` — design premium glassmorphism
- Créé `frontend/src/app/login/layout.tsx` — layout sans sidebar
- Redirection automatique vers /login si non authentifié
- Pages publiques exemptées : /portail-parent, /portail-enseignant

### P1-03 : Topbar dynamique ✅
- **Statut** : ✅ Terminé le 17/03
- `Topbar.tsx` affiche le nom de l'utilisateur connecté depuis AuthContext
- Badge année scolaire dynamique depuis AppContext
- Dropdown profil avec infos user + bouton déconnexion
- Initiales dynamiques dans l'avatar
- Supprimé "Riley Morgan" et les badges fictifs (9, 5, 0)

---

## 🟡 P2 — PRIORITÉ MOYENNE
> Fonctionnalités manquantes importantes pour le fonctionnement quotidien de l'école.

### P2-01 : Saisie de notes depuis le portail enseignant ✅
- **Statut** : ✅ Terminé le 24/03
- **Actions** :
  - [x] Endpoint `POST /api/portail-enseignant/{id}/notes` existait, **corrigé** bug `type_evaluation_id` → `type_eval_id`
  - [x] Endpoint `GET /api/portail-enseignant/referentiels/trimestres` — liste trimestres année courante
  - [x] Endpoint `GET /api/portail-enseignant/referentiels/types-evaluation` — liste types actifs
  - [x] Endpoint `GET /api/portail-enseignant/{id}/evaluations` — historique évaluations
  - [x] Onglet "Saisie Notes" avec sélecteur Trimestre + Type + Nom + Note sur
  - [x] Grille de notes avec input + checkbox absent
  - [x] Section collapsible "📊 Historique des évaluations" avec tableau complet

### P2-02 : Gestion des absences depuis le portail enseignant ✅
- **Statut** : ✅ Terminé le 24/03
- **Actions** :
  - [x] Endpoint `POST /api/portail-enseignant/{id}/presences` existait — fonctionnel
  - [x] Endpoint `GET /api/portail-enseignant/{id}/historique-appels` — historique 30 jours
  - [x] Onglet "Appel" avec boutons P/A/R par élève
  - [x] Barre de stats dynamiques (Présents/Absents/Retards)
  - [x] Section collapsible "📋 Historique des appels" avec tableau complet

### P2-03 : Page Finance / Paiements (admin)
- **Effort** : ~6 heures
- **Actions** :
  - [ ] Créer `frontend/src/app/finance/page.tsx`
  - [ ] Liste des factures par élève/classe
  - [ ] Enregistrement des paiements
  - [ ] Solde restant, récapitulatif

### P2-04 : Page Vie Scolaire / Discipline (admin)
- **Effort** : ~4 heures
- **Actions** :
  - [ ] Créer `frontend/src/app/vie-scolaire/page.tsx`
  - [ ] Gestion des incidents
  - [ ] Tableau des présences global
  - [ ] Statistiques d'assiduité

### P2-05 : Génération de bulletins PDF
- **Effort** : ~8 heures
- **Actions** :
  - [ ] Créer endpoint `GET /api/bulletins/{inscription_id}/pdf`
  - [ ] Utiliser `reportlab` ou `weasyprint` pour le PDF
  - [ ] Modèle bulletin avec en-tête école, notes, moyennes, appréciations
  - [ ] Bouton "Télécharger bulletin" dans le portail parent

### P2-06 : Données de présence réelles (profil enseignant)
- **Réf audit** : DATA-04
- **Effort** : ~2 heures
- **Actions** :
  - [ ] Créer endpoint `GET /api/enseignants/{id}/presence-stats`
  - [ ] Remplacer le tableau mock dans `enseignants/[id]/page.tsx`

---

## 🟢 P3 — PRIORITÉ BASSE (améliorations futures)
> Fonctionnalités qui améliorent l'expérience mais ne bloquent pas le fonctionnement.

### P3-01 : Student Dashboard réel
- **Effort** : ~8 heures

### P3-02 : Upload photo profil
- **Effort** : ~4 heures

### P3-03 : Notifications temps réel
- **Effort** : ~6 heures

### P3-04 : Export Excel/PDF des listes
- **Effort** : ~4 heures

### P3-05 : Gestion d'erreur réseau centralisée
- **Effort** : ~2 heures

---

## 📊 RÉCAPITULATIF

| Priorité | Nb tâches | Effort | Statut |
|---|---|---|---|
| 🔴 **P0** | 3 | ~3h30 | ✅ **TERMINÉ** |
| 🟠 **P1** | 3 | ~8h | ✅ **TERMINÉ** |
| 🟡 **P2** | 6 | ~30h | ⬜ 2/6 faites |
| 🟢 **P3** | 5 | ~24h | ⬜ À faire |
| **TOTAL** | **17** | **~65h** | **8/17 faites** |

---

## 📁 FICHIERS CRÉÉS/MODIFIÉS

### Nouveaux fichiers créés
- `backend/app/core/security.py` — Module bcrypt hash/verify
- `backend/app/core/auth.py` — Module JWT (pyjwt)
- `backend/app/api/auth.py` — API authentication (login/me)
- `backend/migrate_passwords.py` — Script migration mots de passe
- `frontend/src/lib/api.ts` — Instance axios centralisée
- `frontend/src/context/AppContext.tsx` — Contexte global (etablissement/année)
- `frontend/src/context/AuthContext.tsx` — Contexte authentification JWT
- `frontend/src/components/Providers.tsx` — Wrapper providers
- `frontend/src/app/login/page.tsx` — Page de login premium
- `frontend/src/app/login/layout.tsx` — Layout sans sidebar

### Fichiers principaux modifiés
- `backend/main.py` — Ajout auth_router
- `frontend/src/app/layout.tsx` — Wrap avec Providers
- `frontend/src/components/Topbar.tsx` — Dynamique (user + année)
- 22 fichiers frontend — Migration API_BASE_URL
- 13 fichiers frontend — Migration contexte IDs
