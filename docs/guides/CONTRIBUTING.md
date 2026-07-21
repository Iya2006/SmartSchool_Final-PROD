# 🤝 Guide de Contribution — SMARTSCHOOL ERP

> Ce fichier définit les règles de travail à suivre à chaque session de développement.
> Lire ce fichier avant de commencer à coder.

---

## 📋 Checklist OBLIGATOIRE avant chaque commit

```
[ ] 1. npm run lint       → 0 erreur ESLint dans le frontend
[ ] 2. npm run type-check → 0 erreur TypeScript
[ ] 3. Aucun console.log() oublié dans le code de production
[ ] 4. Aucune clé API, mot de passe ou secret en dur dans le code
[ ] 5. Le fichier backend/.env N'EST PAS inclus dans le commit
[ ] 6. Les photos uploadées (backend/uploads/) ne sont pas committées
[ ] 7. Le message de commit respecte le format conventionnel ci-dessous
[ ] 8. La fonctionnalité a été testée manuellement dans le navigateur
```

---

## ✍️ Format des commits conventionnels

### Syntaxe
```
type(module): description courte en français
```

### Types autorisés
| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `refactor` | Restructuration du code (sans changer le comportement) |
| `style` | Modification d'interface / CSS uniquement |
| `chore` | Maintenance : mise à jour deps, config, scripts |
| `docs` | Documentation uniquement |
| `test` | Ajout ou modification de tests |
| `perf` | Amélioration de performance |

### Modules reconnus dans Smart School
`eleves` · `enseignants` · `classes` · `notes` · `evaluations` · `examens`  
`finance` · `familles` · `photos` · `galerie` · `communication` · `emploi-du-temps`  
`bulletins` · `auth` · `dashboard` · `portail-parent` · `portail-enseignant`  
`vie-scolaire` · `matieres` · `parametrage` · `topbar` · `sidebar` · `db` · `api`

### Exemples concrets pour Smart School
```bash
feat(eleves):         ajouter la pagination côté serveur
fix(auth):            corriger l'expiration du token JWT après 8h
refactor(topbar):     extraire NotifDropdown en sous-composant
style(familles):      corriger l'alignement des cartes sur mobile
chore(deps):          mettre à jour fastapi vers 0.115
feat(photos):         ajouter le workflow d'approbation admin
fix(evaluations):     corriger le calcul de moyenne pondérée
docs(readme):         documenter les variables d'environnement
feat(portail-parent): afficher le bulletin PDF depuis le portail
fix(finance):         corriger le total des paiements par famille
```

---

## 🔍 Commandes de vérification sécurité

```bash
# Chercher des secrets exposés dans le frontend
grep -rn "password\|secret\|token\|api_key\|JWT_SECRET" \
  --include="*.ts" --include="*.tsx" --include="*.js" frontend/src/

# Vérifier que .env est bien ignoré par Git
git ls-files | grep ".env"
# → Résultat attendu : vide (aucun .env ne doit apparaître)

# Détecter les patterns dangereux
grep -rn "innerHTML\|eval(\|dangerouslySetInnerHTML" \
  --include="*.tsx" --include="*.ts" frontend/src/

# Auditer les dépendances npm
cd frontend && npm audit

# Vérifier les dépendances Python
cd backend && pip audit  # ou : safety check
```

---

## 🔁 Workflow par session de développement

### Début de session
1. Lire `CONTRIBUTING.md` (ce fichier)
2. Définir l'objectif de la session en 1 phrase
3. Vérifier que le backend tourne : `http://localhost:8500/health`
4. Vérifier que le frontend tourne : `http://localhost:3000`

### Pendant le développement
1. Développer la feature par petites étapes
2. Tester dans le navigateur après chaque changement
3. Committer régulièrement avec le bon format

### Fin de session
1. Exécuter la checklist ci-dessus
2. Mettre à jour `CHANGELOG.md` avec ce qui a été fait
3. Committer tous les fichiers modifiés

---

## 🚀 Commandes de démarrage

```bash
# Backend FastAPI (port 8500)
cd backend
.\venv\Scripts\activate      # Windows
uvicorn main:app --reload --port 8500

# Frontend Next.js (port 3000)
cd frontend
npm run dev

# Ou utiliser le fichier START.bat à la racine
```

---

## 📦 Stack Technique Smart School

| Couche | Technologie | Version |
|--------|-------------|---------|
| Frontend | Next.js (App Router) + TypeScript | 14+ |
| Styling | CSS Modules + Variables CSS globales | — |
| Backend | FastAPI + Python | 3.10+ |
| ORM | SQLAlchemy | 2.x |
| Base de données (dev) | SQLite | — |
| Base de données (prod) | PostgreSQL | 15+ |
| Auth | JWT (PyJWT + bcrypt) | — |
| Upload | python-multipart + StaticFiles | — |
| Rate Limiting | slowapi | — |
| Containerisation | Docker Compose | — |

---

## ⚠️ Règles absolues

- **JAMAIS** de mot de passe ou clé secrète dans le code source
- **JAMAIS** de `any` en TypeScript sans commentaire justifiant pourquoi
- **TOUJOURS** valider les inputs côté backend (pas seulement côté frontend)
- **TOUJOURS** gérer les erreurs des appels API (try/catch ou .catch())
- **TOUJOURS** tester manuellement avant de committer
