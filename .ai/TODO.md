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

> ✅ Implémenté le 27/07/2026 : page frontend créée, backend complété, mode de découpage et vacances stockés via `ss_parametres` catégorie `CALENDRIER`.

- `[x]` 2.1 — Page `/parametres/calendrier/page.tsx`
- `[x]` 2.2 — CRUD des années scolaires (créer, modifier, activer)
- `[x]` 2.3 — CRUD des trimestres/semestres (dates de début/fin)
- `[x]` 2.4 — Toggle mode Semestre vs Trimestre
- `[x]` 2.5 — Calendrier des vacances scolaires (dates configurables)

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
# Tache a faire :
alors, ce qui concerne aussi la promotion des élèves admis, redoublement, transfert, déclasse, désactivation, réinscription, comme n'existe pas d'abord, donc je te confirme, il faut commencer d'abord par ça. Tu commences par ça, on va établir tout ceci-là pour le clôture de l'année et tout, parce que j'ai remarqué aussi que, déjà dans la partie année et trimestre, on peut créer une année scolaire, mais au niveau de l'en-tête de notre école, actuellement c'est 2024-2025. Alors, quand je crée une année, ça doit prendre automatiquement ce que j'ai configuré au niveau de trimestre et calendrier, en fait. Donc, c'est dans ce paramètre-là où quand on crée une année, on peut créer ces trimestres. Si c'est semestre et tout, on peut créer, c'est là-bas, on peut clôturer une année et clôturer les semestres. C'est-à-dire quand on crée une année, il y a ces semestres. Quand ce semestre est fini, les évaluations, tout, on clôture le premier semestre automatiquement, c'est le deuxième semestre qui prendra en compte, en fait. Donc, c'est un peu ça. Donc, en gros, tu vas commencer par ça. Tout doit être bien fait comme je l'ai dit. Vu que à part la page comptabilité, bon, j'ai signalé quelques trucs, mais on va commencer par ça d'abord, ensuite tu vas t'aimer sur les autres éléments que j'ai signalés dans ce texte que je viens de t'envoyer. OKConcernant le code QR, je disais que c'est lent. J'ai oublié, c'est pas bien, je devrais t'envoyer. Je disais que c'est lent. Lorsque je scanne, ça met trop de temps. Alors que lorsqu'on fait comme ça, lorsque c'est bien, ça doit pas automatiquement, ça doit être rapide parce qu'il y a plein de personnes qui viennent pour enregistrer leur entrée, les élèves aussi. Tout doit être de façon rapide et fluide. Donc, c'est de ça que je voulais parler. Et aussi concernant les tarifs qui sont déjà payés, c'est lorsque je clôture, n'est-ce pas, l'année scolaire. Je vais maintenant les facturer des élèves, tout ce qui a redoublé, comme j'ai dit, pour passer en classe supérieure. Donc là, ce que j'aimerais que tu fasses, c'est là, on a quand même des classes. J'ai la classe de la première année jusqu'en terminale, c'est-à-dire 1, 2, 3, 4, 12, 13. En tout, je crois, j'en ai 13 classes, parce qu'en Guinée, il y a 13, il y en a quand même des classes. Donc, je vais vérifier le nombre de classes et le nombre de matières dans chaque classe. Tu vas, parce qu'une classe peut avoir deux ou plus, une classe peut avoir le même professeur. Est-ce que je me fais comprendre? Donc, tu vas remplir la base de données, chaque classe, les matières enseignées dans chaque classe, pour un des professeurs, OK? Du coup, actuellement, il y a deux trimestres. Je crois, il y a des classes qui ont fait des évaluations dans des matières et pas de notes. Tu vas remplir tout ce qui est concernant les notes de toutes les matières des élèves dans toutes les classes, au fait. Et comme ça, on va essayer de voir, est-ce que le calcul fonctionne bien des résultats, et est-ce que le calcul des moyennes fonctionne bien? Est-ce que tu peux faire des recherches concernant comment la moyenne est calculée en Guinée? Comme ça, tu adoptes un autre système pour que les moyennes soient calculées et tu mets un petit détail au niveau de la partie bulletin pour dire, ouais, c'est comme ça, les notes ont été calculées. Comme ça, lorsque ça, c'est bon, tous les classes, toutes les matières sont enseignées par tous les professeurs, et on remplit la base de données avec les notes, tout, tout, tout. Je vois que toutes les cages de notes aussi pour une classe concernant les différentes matières des élèves sont en place. Je vais voir le bulletin. Le bulletin, c'est, je ne vais pour le premier trimestre et deuxième trimestre. Vérifier si tout cela aussi apparaît au niveau des portails parents et élèves, et ensuite on clôture le premier trimestre et on met maintenant le deuxième trimestre, et je vais voir comment est-ce que le transfert des élèves se fait selon la moyenne et tout, tout, tout, pour voir est-ce que bien il n'y a pas d'erreur, et s'il y a des erreurs, s'il n'y a pas d'erreurs. Donc, c'est un peu ça, parce que là, on est, je teste, je suis en train de tester. Et j'ai remarqué aussi au niveau de la page Apparent pour le téléchargement des reçus, il n'arrive pas à télécharger. Il y a une erreur lors du téléchargement, au fait. Et au niveau des cartes des enseignants, lorsque tu veux, lorsque tu pars au niveau de la page enseignants, au fait, pour voir les cartes d'un enseignant, par exemple, lorsque tu cliques sur un enseignant, tu veux voir sa carte, ça sort élève, alors que c'est un enseignant. Lorsque tu es dans le profil d'un enseignant, tu cliques sur voir sa carte, ça sort élève, alors que c'est un enseignant. Mais quand tu es directement dans la page des enseignants pour voir toutes les cartes, ça sort bien enseignant comme ici. Donc, un souci de centation de données, au fait. OK? Donc, c'est ces titres dont j'ai envie que tu fasses rapidement. Le pointage QR, le remplissage des bases de données pour les professeurs, donc, gérer pour les matières, pour que tout soit affecté, au fait, les professeurs soient affectés aux différentes classes et aux différentes matières. Parce qu'actuellement, il faut que, par exemple, la première année, le taux d'infection de professeurs est à 29%. Donc, tout doit être à 100% pour toutes les classes, où toutes les classes, le taux d'infection doit être à 100%. Comme ça, lorsque ça, c'est bon, les tuteurs, de façon aléatoire, les notes pour chaque matière, dans chaque matière pour chaque élève. Comme ça, je vais pouvoir aller dans la partie bulletin pour pouvoir, parce que le bulletin, lorsque les notes sont là, il suffit juste de choisir, au fait, déjà dans la centralisation des notes, il suffit juste de choisir, déjà là, les évaluations centralisées des anciens, tout est là. On voit les notes, il suffit juste de choisir une classe, et puis, parce que là, actuellement, en deuxième année, il n'y a que les notes concernant une seule matière, une seule matière en chimie. Donc, tout ceci-là doit être bien là. Toutes les matières doivent avoir les notes, les élèves doivent avoir leurs notes dans toutes les matières. Donc, en général, ça de façon rapide, et puis tu mets un petit message ici de manière à ce que pour dire à l'administrateur, bon, c'est comme ça, les notes sont calculées. Si ça se trouve que ce n'est pas comme ça que les notes sont calculées, on peut, on va essayer de mettre de côté une page de paramétrage pour le calcul des notes, comment c'est fait et tout. De base, les coefficients et tout, tout est, le paramétrage de tout ça, les coefficients des matières. Maintenant, lors des évaluations, le professeur, il peut avoir une page paramètre. Bon, il dit, c'est comme ça, les notes doivent être calculées automatiquement par le système, et il peut attribuer aussi, déjà une page paramètre dédiée au calcul des moyennes, disons comme ça, des notes, tout, tout, tout, et les coefficients. Déjà de base, les coefficients sont appliqués dans la page notation. Et il y aura une autre page paramètre où on pourra configurer comment est-ce que les notes doivent être calculées, et il peut dire aussi pour cette évaluation, les coefficients ne sont pas considérés. Donc il y aura une page paramètre pour gérer ceci. Donc, en gros, c'est un peu ça. Je veux faire aussi des tests concernant ça et pour clôturer l'année pour voir comment est-ce que l'application va fonctionner. Et comme on l'a dit, lorsque l'année est clôturée, les élèves passent en classe supérieure et par défaut, ils sont tous désactivés. Donc lorsque le parent vient pour la réinscription, le comptable doit bel et bien s'assurer que l'élève a été réinscrit et peut l'activer et tout, tout, tout. Et bon, ça va. Lorsque l'année atteint une certaines semaines et il y a des élèves qui ne sont pas totalement inscrits ou ne sont vraiment pas inscrits, donc l'admin peut supposer que, bon, cet élève va changer de cours, donc il peut le supprimer dans son système, dans sa classe, au fait, dans son établissement. Et par défaut, on va créer plus tard, parce que j'ai déjà une page archives scolaires ici. Donc les informations des élèves doivent être archivées comme si c'était une salle ou un bureau comme ça, une bibliothèque là où il y avait aussi des élèves concernant les livres scolaires, tout, tout, tout, tout, les anciennes notes, les anciens bulletins, tout. Donc on va s'occuper de ça plus tard. En gros, les élèves ne seront pas, ils seront supprimés, mais on pourra avoir accès à les informations dans la page archives. Mais ça, c'est pour plus tard. C'est pas maintenant, ça, c'est pour plus tard. Donc, en gros, c'est ce que je vais te signaler. Je sais que c'est trop, mais on va faire le travail de façon bien organisée et respective, au fait. Donc, les, c'est ce que j'avais à dire.
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
| Section 2 — Calendrier | 5 | 5 | 100% |
| Section 9 — Notifications | 5 | 0 | 0% |
| Section 10 — Emploi Temps | 6 | 0 | 0% |
| Section 11 — Import/Export | 5 | 0 | 0% |
| Section 12 — Multi-Tenant | 5 | 0 | 0% |
| **TOTAL** | **101** | **80** | **79%** |
