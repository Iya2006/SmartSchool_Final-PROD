# 📖 Guide Pratique du Workflow GitHub pour l'Équipe

Pour que tout le monde puisse coder en même temps sans jamais écraser le travail de quelqu'un d'autre (et respecter notre deadline du 15 juillet !), voici le guide exact à suivre.

---

## 🌳 Comprendre les Branches

- 🔴 **`main`** : La version finale, le code parfait. **On ne code jamais directement ici.**
- 🟡 **`develop`** : La salle d'assemblage. C'est ici que se trouve le projet complet à jour. On récupère toujours le code à partir d'ici.
- 🟢 **`feature/votre-tache`** : Votre espace de travail privé. C'est ici que vous codez.

---

## 👨‍💻 Comment travailler chaque jour (Pour toute l'équipe)

Voici ce que chacun de vous doit faire quand il commence sa tâche.

### ÉTAPE 1 : Cloner le projet (Le tout premier jour seulement)
Vous devez télécharger le projet complet depuis le lien que le chef de projet vous donnera.
```bash
# 1. Télécharger le dépôt
git clone LE_LIEN_DU_REPO

# 2. Entrer dans le dossier
cd SMART_SCHOOL_FINAL
```

### ÉTAPE 2 : Se placer sur la base (`develop`) et récupérer les mises à jour
On ne travaille pas à partir de `main`. Avant de coder, il faut s'assurer qu'on a le dernier code de l'équipe :
```bash
# 1. Aller sur la branche d'intégration
git checkout develop

# 2. Récupérer les toutes dernières modifications
git pull origin develop
```

### ÉTAPE 3 : Créer sa propre branche
Ne codez jamais directement sur `develop`. Créez votre "copie de brouillon" :
```bash
# Remplacer "impayes" par le nom de la tâche
git checkout -b feature/impayes
```

### ÉTAPE 4 : Coder, Tester, Sauvegarder
Maintenant que vous êtes sur votre branche (`feature/impayes`), ouvrez VS Code. Codez vos pages, vos API, et testez sur votre machine. Une fois satisfait :
```bash
# 1. Ajouter tous les fichiers modifiés
git add .

# 2. Sauvegarder avec un message clair
git commit -m "Terminé le tableau de bord des impayés"

# 3. Pousser (Envoyer) VOTRE branche personnelle sur GitHub
git push origin feature/impayes
```

### ÉTAPE 5 : Demander la validation (Pull Request)
Une fois poussé, allez sur la page GitHub du projet dans votre navigateur.
1. Vous verrez un bouton vert **"Compare & pull request"**. Cliquez dessus.
2. Vérifiez que la flèche va de votre branche vers `develop` : `base: develop` ← `compare: feature/impayes`.
3. Écrivez un titre.
4. Cliquez sur **Create Pull Request**. 
5. C'est fini ! Vous attendez que le chef de projet valide.

---

## 👑 Rôle du Chef de Projet (Validation)

Quand un membre de l'équipe a fait une Pull Request, c'est au Chef de Projet de valider.
1. Aller dans l'onglet **"Pull requests"** sur GitHub.
2. Vérifier le code (onglet "Files changed").
3. Si c'est bon : Cliquer sur **Merge pull request** puis **Confirm merge**.
4. Le code du membre de l'équipe est officiellement intégré à `develop` ! Les autres pourront le récupérer en refaisant l'ÉTAPE 2 (`git pull origin develop`).
