# Script — Vidéo de présentation SmartSchool (~19 minutes)

Préparé pour la présentation client de vendredi. Ce document est le script
complet à suivre pendant l'enregistrement d'écran : pour chaque section,
le texte à dire (ou à passer dans une voix IA) et l'écran exact à montrer.

## Avant d'enregistrer

- **Capture d'écran** : OBS Studio (gratuit) ou l'enregistreur intégré
  Windows (Win+Alt+R sur la fenêtre du navigateur).
- **Voix** : soit vous lisez le script directement, soit vous le collez
  dans une voix IA (Edge → menu "Lire à voix haute", ou ElevenLabs/
  Murf.ai pour une voix plus naturelle) et vous synchronisez ensuite au
  montage.
- **Données de démo** : préparez une école de démonstration avec des
  données réalistes déjà saisies (élèves, notes, un bulletin déjà
  généré) — ne PAS improviser la saisie en direct, ça ralentit et ça
  peut planter le rythme.
- **Résolution** : enregistrez en 1920×1080, navigateur en plein écran,
  zoom navigateur à 100%.
- Chaque section indique une durée cible — ajustez en gardant un rythme
  posé, pas précipité.

---

## 1. Accroche (0:00 – 1:30)

**Écran** : page vitrine (le site avant le login, thème sombre, « Votre
école mérite mieux que des cahiers et des tableurs »).

**Texte à dire :**

> Dans la plupart des écoles guinéennes aujourd'hui, la gestion se fait
> encore à la main : cahiers de notes, reçus papier, classeurs de dossiers
> élèves, calculs de moyennes au stylo. Chaque bulletin prend des heures.
> Chaque erreur de calcul coûte du temps — et de la crédibilité.
>
> SmartSchool est une plateforme de gestion scolaire complète, pensée
> pour le contexte guinéen : elle centralise les élèves, les enseignants,
> les notes, les finances et la communication avec les familles — dans
> un seul espace, accessible même avec une connexion instable.
>
> Je vais vous montrer, en quelques minutes, comment ça fonctionne
> concrètement.

---

## 2. Connexion et installation (1:30 – 3:00)

**Écran** : cliquer sur « Démarrer », arriver sur la page de connexion,
se connecter avec un compte administrateur de démonstration.

**Texte à dire :**

> La connexion se fait par identifiant, email ou téléphone — chaque
> établissement a son propre espace, totalement isolé des autres écoles
> qui utilisent la plateforme.
>
> Autre point important : SmartSchool est une application installable.
> [Montrer le bouton d'installation PWA ou le menu du navigateur.]
> On peut l'installer comme une vraie application, sur ordinateur comme
> sur téléphone — sans passer par un store, en quelques secondes. Une
> fois installée, elle démarre comme n'importe quelle application native.

---

## 3. Tableau de bord (3:00 – 5:00)

**Écran** : `/dashboard` — montrer les KPI, la section raccourcis
stratégiques, le graphique de répartition.

**Texte à dire :**

> Dès la connexion, le directeur retrouve une vue d'ensemble de son
> établissement : effectif total, taux de présence du jour, situation
> financière, activité récente. Tout ce qui compte pour piloter l'école
> au quotidien, en un coup d'œil, sans avoir à ouvrir dix fichiers Excel
> différents.
>
> Les raccourcis stratégiques donnent un accès direct aux fonctions les
> plus utilisées : communication, paiements, agenda, centre de contrôle.

---

## 4. Gestion des élèves et enseignants (5:00 – 7:30)

**Écran** : `/eleves` — montrer la liste, ouvrir la fiche d'un élève
(photo, dossier scolaire, historique). Puis `/enseignants` rapidement.

**Texte à dire :**

> Chaque élève a un dossier complet : informations personnelles, classe,
> historique scolaire, situation financière, bulletins précédents. La
> recherche fonctionne même avec des fautes de frappe ou des accents mal
> saisis — pensée pour un usage réel, pas un usage idéal.
>
> [Si disponible : montrer l'import Excel/CSV.]
> Pour une école qui bascule depuis des fichiers Excel existants,
> l'import en masse permet de charger des centaines d'élèves en quelques
> minutes, avec une détection automatique des doublons.
>
> Côté enseignants, chaque professeur est affecté à ses classes et
> matières, avec son propre espace de connexion pour saisir ses notes.

---

## 5. Notes et bulletins — le cœur du système (7:30 – 13:00)

C'est la partie la plus importante : prenez le temps de bien la montrer.

**Écran (7:30 – 9:30)** : `/notes` (Centralisation des notes) — montrer
la liste des évaluations et compositions, le taux de centralisation.

**Texte à dire :**

> Les enseignants saisissent leurs notes depuis leur propre portail.
> L'administration suit ici la centralisation en temps réel : combien
> d'évaluations sont saisies, combien restent en attente, matière par
> matière, classe par classe. Le calcul des moyennes suit exactement les
> coefficients configurés par l'école — rien n'est codé en dur.

**Écran (9:30 – 12:30)** : `/bulletins` — sélectionner une classe et un
trimestre, montrer la liste des bulletins, ouvrir l'aperçu d'un
bulletin.

**Texte à dire :**

> Une fois les notes centralisées, les bulletins se génèrent
> automatiquement — moyennes, rang de classe, mention, tout est calculé
> instantanément pour toute une classe.
>
> Et voici un point sur lequel nous avons été particulièrement exigeants :
> le format du bulletin respecte exactement le modèle officiel guinéen —
> en-tête République de Guinée, photo de l'élève, QR code de vérification,
> décision du conseil de classe, signatures. Ce n'est pas un bulletin
> générique : c'est le document que l'école utilise déjà, simplement
> généré en quelques secondes au lieu de plusieurs heures.
>
> [Cliquer sur Imprimer pour montrer l'aperçu d'impression.]
> Et il s'imprime directement, prêt à signer.

**Écran (12:30 – 13:00)** : réduire la fenêtre du navigateur ou basculer
sur un téléphone/émulateur pour montrer le même aperçu de bulletin en
version mobile.

**Texte à dire :**

> Et parce que beaucoup de personnels consultent leurs dossiers depuis
> leur téléphone plutôt qu'un ordinateur, toute l'application — y
> compris les bulletins — est pensée pour le mobile en priorité.

---

## 6. Finances et comptabilité (13:00 – 15:00)

**Écran** : `/comptabilite/paiements` — montrer l'enregistrement d'un
paiement, la situation des impayés.

**Texte à dire :**

> Côté finances, chaque paiement de frais de scolarité est enregistré
> avec reçu automatique. L'école a une vision immédiate des impayés,
> classe par classe, élève par élève — plus besoin de croiser des
> cahiers de caisse avec des listes d'élèves.
>
> Les dépenses de l'établissement sont suivies de la même façon, avec
> un solde de caisse toujours à jour.

---

## 7. Communication et vie scolaire (15:00 – 16:30)

**Écran** : `/communication` puis un aperçu de la gestion des présences/
incidents.

**Texte à dire :**

> La communication avec les familles se fait directement dans
> l'application — messages, annonces, notifications — plutôt que par des
> canaux dispersés et difficiles à tracer.
>
> Le suivi de la vie scolaire — présences, absences, incidents — est
> centralisé lui aussi, avec un historique complet consultable à tout
> moment.

---

## 8. Le mode hors-ligne — le vrai différenciateur (16:30 – 18:00)

**Écran** : si possible, démontrer concrètement (couper le Wi-Fi,
montrer qu'une action reste possible et se synchronise au retour du
réseau). Sinon, l'expliquer avec le dashboard/l'icône de synchronisation
visible à l'écran.

**Texte à dire :**

> Un point essentiel pour le contexte guinéen : la connexion internet
> n'est pas toujours fiable. SmartSchool a été conçu pour fonctionner
> même hors ligne — les données consultées récemment restent
> disponibles, et certaines actions peuvent être effectuées sans réseau :
> elles se synchronisent automatiquement dès que la connexion revient.
> L'école n'est jamais totalement bloquée par une coupure internet.

---

## 9. Conclusion (18:00 – 19:00)

**Écran** : retour au tableau de bord ou à la page vitrine.

**Texte à dire :**

> En résumé : SmartSchool remplace les cahiers, les fichiers Excel
> dispersés et les calculs manuels par une plateforme unique, pensée
> pour la réalité du terrain guinéen — connexion instable, usage mobile,
> et un format de bulletin qui respecte les standards officiels.
>
> Nous serions ravis d'en discuter plus en détail et de vous montrer
> l'application en direct sur vos propres besoins.
>
> Merci de votre attention.

---

## Checklist avant envoi au client

- [ ] Données de démonstration réalistes et propres (pas de "test123")
- [ ] Aucune donnée réelle d'élève affichée (RGPD / confidentialité)
- [ ] Audio synchronisé, pas de blanc long ni de coupure
- [ ] Export en MP4, résolution 1080p minimum
- [ ] Durée finale vérifiée (viser 18-20 min, pas plus de 25)
- [ ] Relecture du script à voix haute une fois avant l'enregistrement final
