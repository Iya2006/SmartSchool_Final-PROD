# 📋 Workflow des Modifications — Photos, Carousels & UI

> **Date :** 10 avril 2026  
> **Objectif :** Résumé précis de toutes les modifications demandées pour validation AVANT implémentation.

---

## 🔴 PROBLÈME 1 : La photo du parent ne persiste pas en base de données

### Constat actuel
- L'endpoint `/api/photos/parent-upload/{entity_type}/{entity_id}` (fichier `backend/app/api/photos.py`, ligne 142) :g
  - ✅ Sauvegarde le fichier sur le disque
  - ✅ Met à jour `photo_url` dans la table `ss_parents` en base
  - ✅ Crée un message de notification pour l'admin
- **MAIS** : côté frontend (`portail-parent/page.tsx`), l'état `pendingPhotos` est stocké dans `localStorage`. Quand le parent recharge la page, `pendingPhotos` contient toujours l'ID du parent → le bouton affiche « En attente de validation » alors que la photo est DÉJÀ enregistrée en BD.
- De plus, le dashboard API (`/api/portail-parent/{id}/dashboard`) ne retourne PAS `photo_url` du parent dans la réponse, ce qui fait que le frontend ne voit jamais la photo du parent.

### Correction prévue
1. **Backend** : Vérifier que l'endpoint `/api/portail-parent/{id}/dashboard` retourne bien `photo_url` dans l'objet `parent`.
2. **Frontend** : Au chargement du dashboard, synchroniser `pendingPhotos` avec les données réelles du serveur — supprimer de `pendingPhotos` tout ID dont la `photo_url` est déjà définie coté serveur.
3. **Frontend** : Dans l'onglet Photos, afficher la photo du parent depuis `data.parent.photo_url` (pas seulement depuis `profilData`).

### Fichiers concernés
| Fichier | Modification |
|---------|-------------|
| `backend/app/api/portail_parent.py` | Ajouter `photo_url` dans la réponse dashboard du parent |
| `frontend/src/app/portail-parent/page.tsx` | Synchroniser `pendingPhotos` au chargement, afficher photo du parent dans l'en-tête |

---

## 🔴 PROBLÈME 2 : Notifications admin → Deep-link vers la galerie

### Comportement demandé
1. Quand le parent envoie une photo → un message est créé pour l'admin (✅ déjà fait)
2. L'admin voit la notification dans son centre de messages
3. **Quand l'admin clique sur la notification photo** → il est redirigé vers la page **Galerie** avec :
   - Le bon onglet pré-sélectionné (élève ou parent)
   - La recherche pré-remplie avec le nom de la personne 
   - La photo de la personne mise en évidence (bordure rouge)
4. Dans la galerie, un bouton **« Attribuer »** permet d'assigner directement la photo à l'entité

### Constat actuel
- Le message admin est créé avec le sujet `📷 Photo reçue pour {nom}` (✅)
- Mais il n'y a **aucun deep-link** dans le message → l'admin ne peut pas naviguer directement vers la galerie
- La galerie actuelle (`galerie/page.tsx`) supporte déjà les query params `?search=` et `?tab=`, mais n'a pas de surbrillance rouge ni de bouton « Attribuer »

### Correction prévue
1. **Backend** : Ajouter les métadonnées `entity_type` et `entity_id` dans le contenu du message pour permettre le deep-link
2. **Frontend (admin/messages ou dashboard)** : Quand un message a le sujet `📷`, ajouter un bouton « Voir dans la Galerie » qui redirige vers `/galerie?search=NOM&tab=TYPE&highlight=ID`
3. **Frontend (galerie/page.tsx)** : 
   - Lire le param `highlight` dans l'URL
   - Appliquer une bordure rouge animée sur la photo de l'entité ciblée
   - Afficher un bouton « Attribuer la photo » sur les photos en mode highlight
   - Ce bouton déclenche l'upload via `input[type=file]` et assigne la photo à l'entité

### Fichiers concernés
| Fichier | Modification |
|---------|-------------|
| `backend/app/api/photos.py` | Ajouter `entity_type` et `entity_id` dans le contenu du message |
| `frontend/src/app/galerie/page.tsx` | Mode highlight + bouton « Attribuer » |

---

## 🟡 PROBLÈME 3 : Supprimer les flèches du sélecteur d'enfants (portail parent)

### Comportement demandé
- **Supprimer** les flèches `<` et `>` du carrousel de sélection d'enfants dans le portail parent
- Le carrousel de sélection d'enfants doit rester scrollable au toucher/souris, mais sans boutons de navigation

### Constat actuel
- Le sélecteur d'enfants (`portail-parent/page.tsx`, lignes 548-598) a des boutons flèches ChevronLeft/ChevronRight

### Correction prévue
1. Supprimer les deux `<button>` de navigation (gauche et droit) autour du carrousel d'enfants
2. Ajuster le padding du contenu pour compenser l'espace libéré

### Fichier concerné
| Fichier | Modification |
|---------|-------------|
| `frontend/src/app/portail-parent/page.tsx` | Supprimer les boutons flèches du sélecteur d'enfants |

---

## 🟡 PROBLÈME 4 : Vérifier que les flèches du tab bar fonctionnent (portail parent)

### Comportement demandé
- Les flèches `<` et `>` de la barre d'onglets (Dashboard, Notes, Bulletin, etc.) doivent **rester** et **fonctionner**

### Constat actuel  
- ✅ Déjà corrigé dans la session précédente avec `getElementById('parent-tab-bar').scrollLeft`
- À vérifier visuellement que ça marche bien

### Correction prévue
- Tester et confirmer le fonctionnement. Aucun code supplémentaire si tout fonctionne.

---

## 🔴 PROBLÈME 5 : Photo dans le dropdown du header (profil utilisateur)

### Comportement demandé
- **Portail Enseignant** : Dans le bouton profil en haut à droite + dans le dropdown menu, afficher la **vraie photo** de l'enseignant (au lieu des initiales FD)
- **Portail Parent** : Idem — afficher la photo du parent dans le bouton profil + le dropdown

### Constat actuel
- **Enseignant** (`portail-enseignant/page.tsx`, lignes 742-768) : 
  - Le bouton header affiche `{ens.prenom[0]}{ens.nom[0]}` dans un carré coloré
  - Le dropdown aussi affiche les initiales, aucune photo
- **Parent** (`portail-parent/page.tsx`, lignes 449-467) :
  - Le bouton header affiche `{data.parent.prenom[0]}{data.parent.nom[0]}` dans un cercle violet
  - Le dropdown n'affiche que le texte, pas de photo

### Correction prévue
1. **Enseignant** : Si `ens.photo_url` existe, afficher la photo dans le bouton header et dans le dropdown (background-image à la place des initiales)
2. **Parent** : Si `profilData?.photo_url` ou `data.parent.photo_url` existe, afficher la photo dans le bouton header et dans le dropdown

### Fichiers concernés
| Fichier | Modification |
|---------|-------------|
| `frontend/src/app/portail-enseignant/page.tsx` | Photo dans le header button + dropdown |
| `frontend/src/app/portail-parent/page.tsx` | Photo dans le header button + dropdown |

---

## 🔴 PROBLÈME 6 : Photos cliquables partout avec Lightbox

### Comportement demandé
- **Toutes les photos** affichées dans les portails parent et enseignant doivent être **cliquables** et ouvrir un **Lightbox** plein écran

### Constat actuel
- **Portail enseignant** :
  - ✅ Photo dans la Vue d'ensemble → cliquable (ouvre lightbox)
  - ❌ Photo dans l'en-tête → pas cliquable
- **Portail parent** :
  - ✅ Photo dans l'onglet Photos → cliquable (ouvre lightbox)
  - ❌ Photo dans le sélecteur d'enfants (carrousel) → pas cliquable
  - ❌ Photo dans la carte enfant (colonne gauche) → pas cliquable  
  - ❌ Photo dans l'en-tête → pas cliquable

### Correction prévue
1. Rendre cliquable chaque avatar/photo qui a une `photo_url` dans les deux portails
2. Réutiliser le `lightboxUrl` existant pour ouvrir la photo en plein écran

### Fichiers concernés
| Fichier | Modification |
|---------|-------------|
| `frontend/src/app/portail-enseignant/page.tsx` | Photo header cliquable |
| `frontend/src/app/portail-parent/page.tsx` | Toutes les photos cliquables (carrousel, carte enfant, header) |

---

## 🔴 PROBLÈME 7 : Ajouter gestion de photo dans les Paramètres

### Comportement demandé
- **Portail Enseignant** : Ajouter dans l'onglet **Paramètres** une section « Ma Photo de Profil » permettant de modifier/ajouter sa photo
- **Portail Parent** : Idem dans l'onglet **Paramètres** — section « Ma Photo de Profil »

### Constat actuel
- **Enseignant** : L'onglet Paramètres existe déjà (mot de passe) mais n'a PAS de section photo
- **Parent** : L'onglet Paramètres (`parametres`) a le changement de mot de passe mais PAS de section photo

### Correction prévue
1. **Enseignant (Paramètres)** : Ajouter une carte « Ma Photo de Profil » avec :
   - Affichage de la photo actuelle (ou initiales)
   - Bouton « Modifier ma photo » qui déclenche un `input[type=file]`
   - Appel à `/api/photos/upload/enseignant/{id}` (upload direct, pas besoin de validation admin)
   - Feedback visuel de succès
2. **Parent (Paramètres)** : Ajouter la même carte avec :
   - Appel à `/api/photos/parent-upload/parent/{id}` (upload avec notification admin)

### Fichiers concernés
| Fichier | Modification |
|---------|-------------|
| `frontend/src/app/portail-enseignant/page.tsx` | Section photo dans Paramètres |
| `frontend/src/app/portail-parent/page.tsx` | Section photo dans Paramètres |

---

## 🔴 PROBLÈME 8 : Carousel des classes dans la page Élèves (admin) — flèches ne fonctionnent pas

### Comportement demandé
- Les boutons flèches ◀ et ▶ du carrousel de classes dans la page `/eleves` doivent faire défiler les classes

### Constat actuel
- Le carrousel utilise `overflowX: 'hidden'` (ligne 357 de `eleves/page.tsx`) au lieu de `'auto'`
- La fonction `scrollCarousel` (ligne 194) utilise `el.scrollTo()` qui fonctionne, **MAIS** le scroll est bloqué car `overflow` est en `hidden`
- L'auto-scroll animé (requestAnimationFrame, lignes 156-191) interfère aussi avec le scroll manuel car il repositionne constamment `el.scrollLeft`

### Correction prévue
1. Changer `overflowX: 'hidden'` → `overflowX: 'auto'` avec `scrollbarWidth: 'none'` pour masquer la scrollbar
2. Quand on clique sur une flèche, **mettre en pause** l'auto-scroll pendant 3 secondes pour laisser le scroll manuel se faire
3. Synchroniser `scrollPos` avec `el.scrollLeft` après le scroll manuel

### Fichier concerné
| Fichier | Modification |
|---------|-------------|
| `frontend/src/app/eleves/page.tsx` | Fix overflowX + pause auto-scroll sur clic flèche |

---

## 🔴 PROBLÈME 9 : Attribution photo depuis la Galerie (« Attribuer »)

### Comportement demandé
Workflow complet :
1. L'admin va dans la page **Élèves**, **Enseignants** ou **Familles**
2. Il voit un identifiant **sans photo** et clique sur l'icône 📷 (camera)
3. Il est redirigé vers la page **Galerie** avec la photo de l'entité mise en évidence
4. **La photo de l'entité ciblée** doit avoir une **bordure rouge** pour l'identifier visuellement
5. Un bouton **« Attribuer »** ou **« Ajouter photo »** est affiché à côté
6. Quand on clique, ça ouvre le sélecteur de fichier et assigne directement la photo à l'entité

### Constat actuel
- Le bouton 📷 dans la page Élèves redirige vers `/galerie?search=NOM&tab=eleves` (✅ navigation OK)
- Mais dans la galerie, il n'y a **aucune surbrillance** et **aucun bouton d'attribution directe**
- L'upload se fait via le hover overlay qui montre juste un bouton 👁 (Eye)

### Correction prévue
1. **Galerie** : Lire le query param `assign_type` et `assign_id` depuis l'URL
2. En mode « attribution » :
   - La carte de la personne ciblée reçoit une **bordure rouge clignotante** + badge « ⚠ Photo à attribuer »
   - Un bouton prominent **« 📷 Attribuer la photo »** remplace le overlay normal
   - Le clic déclenche l'upload et assigne la photo
   - Après succès, la bordure rouge disparaît et un feedback ✅ s'affiche
3. **Pages admin** : Modifier le lien du bouton 📷 pour inclure `assign_type` et `assign_id` dans l'URL :
   - Élèves : `/galerie?tab=eleves&assign_type=eleve&assign_id={eleve_id}&search={nom}`
   - Enseignants : `/galerie?tab=enseignants&assign_type=enseignant&assign_id={id}&search={nom}`
   - Familles : `/galerie?tab=parents&assign_type=parent&assign_id={id}&search={nom}`

### Fichiers concernés
| Fichier | Modification |
|---------|-------------|
| `frontend/src/app/galerie/page.tsx` | Mode attribution avec bordure rouge + bouton |
| `frontend/src/app/eleves/page.tsx` | Mettre à jour l'URL du bouton 📷 pour inclure assign_type/assign_id |
| `frontend/src/app/enseignants/page.tsx` | Idem pour les enseignants |
| `frontend/src/app/familles/page.tsx` | Idem pour les parents |

---

## 📊 Récapitulatif des fichiers à modifier

| # | Fichier | Problèmes traités |
|---|---------|-------------------|
| 1 | `backend/app/api/portail_parent.py` | P1 (photo_url dans dashboard) |
| 2 | `backend/app/api/photos.py` | P2 (métadonnées dans message) |
| 3 | `frontend/src/app/portail-parent/page.tsx` | P1, P3, P4, P5, P6, P7 |
| 4 | `frontend/src/app/portail-enseignant/page.tsx` | P5, P6, P7 |
| 5 | `frontend/src/app/galerie/page.tsx` | P2, P9 (deep-link, attribution) |
| 6 | `frontend/src/app/eleves/page.tsx` | P8 (carousel fix), P9 (URL) |
| 7 | `frontend/src/app/enseignants/page.tsx` | P9 (URL bouton photo) |
| 8 | `frontend/src/app/familles/page.tsx` | P9 (URL bouton photo) |

---

## 🔄 Ordre d'implémentation recommandé

### Phase 1 — Backend (fondations)
- P1 : `photo_url` dans la réponse dashboard parent
- P2 : Métadonnées entity_type/entity_id dans le message admin

### Phase 2 — Portail Parent (6 corrections)
- P1 : Synchroniser `pendingPhotos` + afficher photo parent
- P3 : Supprimer les flèches du sélecteur d'enfants
- P5 : Photo dans le header/dropdown
- P6 : Toutes les photos cliquables (lightbox)
- P7 : Section photo dans Paramètres

### Phase 3 — Portail Enseignant (3 corrections)
- P5 : Photo dans le header/dropdown
- P6 : Photos cliquables (lightbox header)
- P7 : Section photo dans Paramètres

### Phase 4 — Galerie (attribution)
- P2 : Deep-link depuis notification
- P9 : Mode attribution (bordure rouge + bouton Attribuer)

### Phase 5 — Pages Admin
- P8 : Fix carousel classes dans /eleves
- P9 : URLs assign_type/assign_id dans Élèves, Enseignants, Familles

### Phase 6 — Tests & Validation
- Vérifier chaque point sur navigateur

---

> **⚠️ EN ATTENTE DE VALIDATION**  
> Ce document résume fidèlement toutes les demandes. Veuillez confirmer que chaque point est correct avant que je procède à l'implémentation. Si un point doit être modifié ou précisé, merci de l'indiquer.
