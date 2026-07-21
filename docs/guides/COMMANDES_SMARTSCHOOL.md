# 🚀 GUIDE DE DÉMARRAGE RAPIDE - SMARTSCHOOL ERP

Ce document contient toutes les commandes dont vous avez besoin pour démarrer l'application, vérifier votre base de données et tester vos APIs.

---

## 🟢 1. Lancer tout le projet d'un coup (Le plus simple)
Pour démarrer les 3 éléments indispensables (Base de données, API Backend, Interface Frontend), ouvrez un terminal PowerShell dans `C:\Users\hp\SMART_SCHOOL_FINAL` et collez :

```powershell
# 1. Base de données
docker-compose up -d

# 2. Stopper les anciens processus qui bloqueraient les ports (Optionnel)
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Stop-Process -Name python -Force -ErrorAction SilentlyContinue

# 3. Lancer le Backend (sur le port 8500)
Start-Process powershell -ArgumentList "-NoExit -Command `"cd C:\Users\hp\SMART_SCHOOL_FINAL\backend; .\venv\Scripts\python -m uvicorn main:app --reload --host 0.0.0.0 --port 8500`""

# 4. Lancer le Frontend (sur le port 3000)
Start-Process powershell -ArgumentList "-NoExit -Command `"cd C:\Users\hp\SMART_SCHOOL_FINAL\frontend; npm run dev`""
```

---

## 🔎 2. Vérifier que tout fonctionne

### A. Vérifier les APIs Backend (Temps Réel)
Une fois le backend lancé, ouvrez votre navigateur et allez sur ce lien interactif :
👉 **[http://localhost:8500/docs](http://localhost:8500/docs)**
- C'est l'interface **Swagger**. Vous y verrez toutes vos routes (GET, POST, PUT, DELETE).
- Vous pouvez cliquer sur une route (ex: `/api/eleves`), appuyer sur "Try it out", puis sur "Execute" pour voir les vraies données de votre base !

### B. Vérifier l'Interface Utilisateur (Frontend)
Allez sur :
👉 **[http://localhost:3000](http://localhost:3000)**
- Naviguez vers **Élèves** et **Enseignants**.
- Ajoutez, modifiez ou supprimez un élève depuis l'interface. Tout impactera directement la base de données.

---

## 🗄️ 3. Accéder et Vérifier la Base de Données (PostgreSQL)

Si vous voulez regarder à l'intérieur de la base de données (tables, lignes, informations) :

### Option A : Via pgAdmin ou DBeaver (Recommandé)
- **Hôte (Host)** : `localhost`
- **Port** : `5432`
- **Utilisateur** : `admin`
- **Mot de passe** : `admin`
- **Nom de la base (Database)** : `mydb`

### Option B : Directement en ligne de commande (Docker)
Ouvrez votre terminal et entrez :
```powershell
# Se connecter à la ligne de commande PostgreSQL dans le conteneur
docker exec -it postgres psql -U admin -d mydb

# Une fois dedans, tapez ces commandes pour tester :
\dt                      # Voir toutes les tables
SELECT * FROM eleves;    # Voir tous les élèves
SELECT * FROM enseignants; # Voir les profs
\q                       # Pour quitter
```

---

## 🛑 4. Arrêter le projet proprement

Quand vous avez terminé de travailler :
```powershell
cd C:\Users\hp\SMART_SCHOOL_FINAL
docker-compose down      # Arrête la base de données
Stop-Process -Name node -Force -ErrorAction SilentlyContinue   # Arrête le Frontend
Stop-Process -Name python -Force -ErrorAction SilentlyContinue # Arrête le Backend
```
