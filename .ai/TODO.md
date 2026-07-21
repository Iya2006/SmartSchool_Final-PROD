# ⚙️ SUIVI D'IMPLÉMENTATION — Module Paramètres (Centre de Contrôle)

> Fichier de suivi vivant. Chaque tâche sera cochée `[x]` au fur et à mesure de sa réalisation.
> Dernière mise à jour : 21/07/2026 (conflit Git résolu, Section 2 revérifiée et décochée)

---

## 🔧 PHASE 0 : Fondations Techniques
*Avant de construire les pages, on pose la base de données et l'API.*

- `[x]` 0.1 — Créer le modèle `ParametreEtablissement` (table `ss_parametres` clé/valeur par établissement)
- `[x]` 0.2 — Ajouter les champs manquants sur `ss_etablissements` (`favicon_url`, `cachet_url`, `signature_url`, `slogan`)
- `[x]` 0.3 — Créer l'API CRUD `/api/parametrage/settings` (GET / PUT par catégorie)
- `[x]` 0.4 — Créer la page principale `/parametres/page.tsx` (Dashboard des 12 sections avec navigation)
- `[x]` 0.5 — Ajouter le hook React `useSettings()` ou contexte global pour charger/sauvegarder les paramètres

---

## 🏫 SECTION 1 : Identité de l'Établissement _(Priorité 1)_

- `[x]` 1.1 — Page `/parametres/identite/page.tsx`
- `[x]` 1.2 — Formulaire d'édition : Nom, Code, Type, Adresse, Ville, Région, Préfecture
- `[x]` 1.3 — Formulaire : Téléphone, Email, Nom du Directeur, Capacité max
- `[x]` 1.4 — Upload du Logo principal (drag & drop + preview)
- `[x]` 1.5 — Upload du Logo réduit / Favicon
- `[x]` 1.6 — Upload du Cachet officiel de l'école
- `[x]` 1.7 — Upload de la Signature numérisée du directeur
- `[x]` 1.8 — Champ Slogan / Devise de l'école
- `[x]` 1.9 — Endpoint API `PUT /api/parametrage/etablissements/{id}` (mise à jour complète)
- `[x]` 1.10 — Endpoint API upload fichiers (logo, cachet, signature)
- `[x]` 1.11 — Intégrer le logo dynamiquement dans la Sidebar et les en-têtes

---

## 🎨 SECTION 4 : Personnalisation UI / Theming _(Priorité 2)_

- `[x]` 4.1 — Page `/parametres/apparence/page.tsx`
- `[x]` 4.2 — Sélecteur de couleur principale (color picker + preview live)
- `[x]` 4.3 — Sélecteur de couleur secondaire
- `[x]` 4.4 — Sélecteur de couleur d'accent
- `[x]` 4.5 — Toggle Mode Sombre (dark mode global)
- `[x]` 4.6 — Galerie de palettes prédéfinies ("Bleu Classique", "Vert Nature", "Rouge Prestige", "Or Royal")
- `[x]` 4.7 — Sélecteur de police de caractères (Inter, Roboto, Outfit, Poppins, Montserrat)
- `[x]` 4.8 — Apparence spécifique par portail (Parent / Enseignant / Élève)
- `[x]` 4.9 — Messages d'accueil personnalisés par portail
- `[x]` 4.10 — Thèmes saisonniers : configuration des thèmes (Noël, Fête Nationale, Vacances, etc.)
- `[x]` 4.11 — Système de dates automatiques : le thème s'active à la date configurée
- `[x]` 4.12 — Notification à l'admin quand un thème saisonnier s'active (confirmation avant application)
- `[x]` 4.13 — Mécanisme CSS Variables dynamiques (les couleurs choisies s'appliquent en temps réel)
- `[x]` 4.14 — Sauvegarder le thème en base et le charger au démarrage de l'app

---

## 🪪 SECTION 5 : Format des Cartes Scolaires _(Priorité 3)_

- `[x]` 5.1 — Page `/parametres/cartes/page.tsx`
- `[x]` 5.2 — Choix du format : Horizontal / Vertical / Badge compact
- `[x]` 5.3 — Sélecteur couleur/dégradé de fond de la carte
- `[x]` 5.4 — Upload d'une image/texture de fond
- `[x]` 5.5 — Champs à afficher (toggle) : QR Code, Date naissance, Classe, Matricule, Adresse, Groupe sanguin
- `[x]` 5.6 — Position du logo sur la carte (Haut-gauche / Centre / Droite)
- `[x]` 5.7 — Texte en pied de carte (personnalisable)
- `[x]` 5.8 — Galerie de 5-6 modèles de cartes prédéfinis
- `[x]` 5.9 — Preview live de la carte pendant la configuration
- `[x]` 5.10 — Sauvegarder la config et l'utiliser dans `BadgeCarte.tsx`

---

## 📐 SECTION 3 : Système de Notation _(Priorité 4)_

- `[x]` 3.1 — Page `/parametres/notation/page.tsx`
- `[x]` 3.2 — Choix du barème global : sur 10, sur 20, sur 100
- `[x]` 3.3 — Option système de lettres (A/B/C/D/F) avec table de correspondance
- `[x]` 3.4 — Gestion des types d'évaluation (CRUD `ss_types_evaluation`)
- `[x]` 3.5 — Configuration de la pondération (% Devoir vs % Examen)
- `[x]` 3.6 — Moyenne de passage (seuil configurable)
- `[x]` 3.7 — Mode de calcul du rang (moyenne générale ou total des points)
- `[x]` 3.8 — Configuration des seuils de mentions (Très Bien > 16, Bien > 14...)
- `[x]` 3.9 — Redoublement automatique (toggle + seuil)
- `[x]` 3.10 — Coefficients par défaut par matière (lien avec `ss_matieres`)

---

## 💰 SECTION 7 : Configuration Financière _(Priorité 5)_

- `[x]` 7.1 — Page `/parametres/finance/page.tsx`
- `[x]` 7.2 — Sélecteur de devise (GNF, EUR, USD, XOF)
- `[x]` 7.3 — Liste configurable des modes de paiement
- `[x]` 7.4 — Gestion des types de frais (CRUD)
- `[x]` 7.5 — Fréquence de paiement (Mensuel / Trimestriel / Annuel)
- `[x]` 7.6 — Pénalités de retard (% ou montant fixe + délai)
- `[x]` 7.7 — Règles de réduction automatique (2ème enfant, 3ème enfant)
- `[x]` 7.8 — Format de numérotation des reçus (préfixe configurable)
- `[x]` 7.9 — PIN d'accès comptabilité (modifier le code existant)

---

## 📅 SECTION 2 : Gestion Années & Trimestres _(Priorité 6)_

> ⚠️ Vérifié le 21/07/2026 : la page n'existe pas et le CRUD backend est incomplet. Sous-tâches recochées `[ ]`.

- `[ ]` 2.1 — Page `/parametres/calendrier/page.tsx` (n'existe pas)
- `[ ]` 2.2 — CRUD des années scolaires (créer, modifier, activer) — `create_annee`/`activer_annee` existent dans `parametrage.py`, mais pas de `update_annee`
- `[ ]` 2.3 — CRUD des trimestres/semestres (dates de début/fin) — seul `list_trimestres` existe, pas de create/update/delete
- `[ ]` 2.4 — Toggle mode Semestre vs Trimestre (absent)
- `[ ]` 2.5 — Calendrier des vacances scolaires (dates configurables) (absent)

---

## 📄 SECTION 6 : Format des Bulletins & Documents PDF _(Priorité 7)_

- `[x]` 6.1 — Page `/parametres/documents/page.tsx`
- `[x]` 6.2 — Galerie de modèles de bulletins (Classique, Moderne, Officiel Guinéen, Minimaliste)
- `[x]` 6.3 — Personnalisation de l'en-tête (Logo + Nom + Slogan + "République de Guinée")
- `[x]` 6.4 — Toggle des champs du bulletin (Rang, Moyenne classe, Min/Max, Graphique, Photo)
- `[x]` 6.5 — Configuration des appréciations automatiques
- `[x]` 6.6 — Placement des zones de signature (Directeur, Prof Principal, Parent)
- `[x]` 6.7 — Template de certificat de scolarité
- `[x]` 6.8 — Template de reçu de paiement
- `[x]` 6.9 — Filigrane / Watermark sur les PDF officiels

---

## 🔒 SECTION 8 : Sécurité & Gestion des Accès _(Priorité 8)_

- `[x]` 8.1 — Page `/parametres/securite/page.tsx`
- `[x]` 8.2 — Créer table `ss_roles` et `ss_permissions`
- `[x]` 8.3 — Interface de création de rôles personnalisés
- `[x]` 8.4 — Matrice de permissions par module (grille cochable)
- `[x]` 8.5 — Politique de mot de passe (longueur, complexité, renouvellement)
- `[x]` 8.6 — Durée de session (déconnexion automatique)
- `[x]` 8.7 — Journal d'audit (table `ss_audit_log` + page de consultation)

---

## 📡 SECTION 9 : Communication & Notifications _(Priorité 9)_

- `[ ]` 9.1 — Page `/parametres/notifications/page.tsx`
- `[ ]` 9.2 — Toggle notification par email + configuration SMTP
- `[ ]` 9.3 — Toggle notification par SMS + clé API (Orange / Twilio)
- `[ ]` 9.4 — Templates de messages automatiques (absence, retard paiement, bulletin prêt)
- `[ ]` 9.5 — Personnalisation de l'en-tête des emails

---

## ⏰ SECTION 10 : Emploi du Temps & Vie Scolaire _(Priorité 10)_

- `[ ]` 10.1 — Page `/parametres/emploi-temps/page.tsx`
- `[ ]` 10.2 — Jours de cours (Lundi→Vendredi ou Lundi→Samedi)
- `[ ]` 10.3 — Heures d'ouverture / fermeture de l'école
- `[ ]` 10.4 — Durée standard d'un cours
- `[ ]` 10.5 — Configuration des pauses / récréations
- `[ ]` 10.6 — Seuil de retard (après X min = retard, après Y = absent)

---

## 📦 SECTION 11 : Import / Export _(Priorité 11)_

- `[ ]` 11.1 — Page `/parametres/import-export/page.tsx`
- `[ ]` 11.2 — Import élèves par fichier Excel/CSV
- `[ ]` 11.3 — Import enseignants par fichier Excel/CSV
- `[ ]` 11.4 — Export global en Excel (élèves, notes, paiements)
- `[ ]` 11.5 — Sauvegarde / Restauration de la base de données

---

## 🌐 SECTION 12 : Multi-Tenant / SaaS _(Priorité 12)_

- `[ ]` 12.1 — Page `/parametres/avance/page.tsx`
- `[ ]` 12.2 — Page publique d'inscription d'une nouvelle école
- `[ ]` 12.3 — Isolation complète des données par `etablissement_id`
- `[ ]` 12.4 — Plans d'abonnement (Gratuit / Standard / Premium)
- `[ ]` 12.5 — Domaine personnalisé par école

---

## 📊 PROGRESSION GLOBALE

| Section | Tâches | Faites | % |
|---------|--------|--------|---|
| Phase 0 — Fondations | 5 | 5 | 100% |
| Section 1 — Identité | 11 | 11 | 100% |
| Section 4 — Apparence | 14 | 14 | 100% |
| Section 5 — Cartes | 10 | 10 | 100% |
| Section 3 — Notation | 10 | 10 | 100% |
| Section 7 — Finance | 9 | 9 | 100% |
| Section 6 — Documents | 9 | 9 | 100% |
| Section 8 — Sécurité | 7 | 7 | 100% |
| Section 2 — Calendrier | 5 | 0 | 0% |
| Section 9 — Notifications | 5 | 0 | 0% |
| Section 10 — Emploi Temps | 6 | 0 | 0% |
| Section 11 — Import/Export | 5 | 0 | 0% |
| Section 12 — Multi-Tenant | 5 | 0 | 0% |
| **TOTAL** | **101** | **75** | **74%** |
