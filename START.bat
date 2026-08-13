@echo off
chcp 65001 >nul 2>&1
title SMARTSCHOOL ERP - Demarrage
color 0B

echo.
echo  ============================================================
echo       SMARTSCHOOL ERP - REPUBLIQUE DE GUINEE
echo       Systeme de Gestion Scolaire Nationale
echo  ============================================================
echo.

:: ---------------------------------------------------------------
:: ETAPE 1 : Liberer les ports 8300 et 3300
:: ---------------------------------------------------------------
echo  [1/4] Liberation des ports en cours...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8300" ^| findstr "LISTENING" 2^>nul') do (
    echo        - Fermeture du processus PID %%a sur port 8300
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3300" ^| findstr "LISTENING" 2^>nul') do (
    echo        - Fermeture du processus PID %%a sur port 3300
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 2 /nobreak >nul
echo        OK - Ports 8300 et 3300 liberes.

:: ---------------------------------------------------------------
:: ETAPE 2 : Verifier que les fichiers existent
:: ---------------------------------------------------------------
echo.
echo  [2/4] Verification des fichiers...

:: Python : celui de l'environnement virtuel s'il existe, sinon celui du
:: systeme. Refuser de demarrer faute de venv bloquait une machine ou les
:: dependances sont installees globalement — c'est le cas ici.
set "PYEXE=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PYEXE%" (
    set "PYEXE=python"
    echo        Pas de venv : utilisation du Python du systeme.
)

if not exist "%~dp0backend\main.py" (
    echo        ERREUR: backend\main.py introuvable !
    pause
    exit /b 1
)

if not exist "%~dp0frontend\package.json" (
    echo        ERREUR: frontend\package.json introuvable !
    pause
    exit /b 1
)

if not exist "%~dp0frontend\node_modules" (
    echo        ERREUR: frontend\node_modules introuvable !
    echo        Executez: cd frontend ^&^& npm install
    pause
    exit /b 1
)

echo        OK - Tous les fichiers sont presents.

:: ---------------------------------------------------------------
:: ETAPE 3 : Demarrage des services Docker (Postgres + Redis)
:: ---------------------------------------------------------------
echo.
echo  [3/5] Demarrage de PostgreSQL et Redis (Docker)...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo        Docker Desktop n'est pas lance. Demarrage en cours...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo        Attente du demarrage de Docker Desktop...
    :wait_docker
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        echo        ... Docker pas encore pret, on attend...
        goto wait_docker
    )
    echo        OK - Docker Desktop est operationnel.
) else (
    echo        OK - Docker Desktop est deja lance.
)
docker compose -f "%~dp0docker-compose.dev.yml" up -d >nul 2>&1
timeout /t 3 /nobreak >nul
echo        OK - PostgreSQL et Redis demarres.

:: ---------------------------------------------------------------
:: ETAPE 4 : Demarrage du Backend (port 8300)
:: ---------------------------------------------------------------
echo.
echo  [4/5] Demarrage du Backend Python (API sur port 8300 - voir backend\.env)...
start "SMARTSCHOOL-Backend" /D "%~dp0backend" cmd /c "title SMARTSCHOOL Backend && color 0A && echo. && echo  === SMARTSCHOOL BACKEND === && echo. && "%PYEXE%" -m uvicorn main:app --reload --host 0.0.0.0 --port 8300 || (echo. && echo ERREUR: Le backend a plante! && pause)"

:: Attendre que le backend demarre
echo        Attente du backend...
timeout /t 5 /nobreak >nul

:: Verifier que le backend tourne
netstat -ano | findstr ":8300" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo        OK - Backend demarre sur http://localhost:8300
) else (
    echo        ATTENTION: Le backend ne semble pas ecouter sur le port 8300.
    echo        Verifiez la fenetre "SMARTSCHOOL Backend" pour les erreurs.
)

:: ---------------------------------------------------------------
:: ETAPE 5 : Demarrage du Frontend (port 3300)
:: ---------------------------------------------------------------
echo.
echo  [5/5] Demarrage du Frontend Next.js (port 3300)...
start "SMARTSCHOOL-Frontend" /D "%~dp0frontend" cmd /c "title SMARTSCHOOL Frontend && color 0E && echo. && echo  === SMARTSCHOOL FRONTEND === && echo. && npm run dev -- -p 3300 || (echo. && echo ERREUR: Le frontend a plante! && pause)"

:: Attendre que le frontend demarre
echo        Attente du frontend...
timeout /t 8 /nobreak >nul

:: ---------------------------------------------------------------
:: RESUME
:: ---------------------------------------------------------------
echo.
echo  ============================================================
echo        SMARTSCHOOL - TOUT EST LANCE !
echo  ============================================================
echo.
echo   Application     : http://localhost:3300
echo   API Swagger      : http://localhost:8300/docs
echo.
echo   --- LIENS RAPIDES ---
echo   Admin (Login)      : http://localhost:3300/login
echo   Portail Parent     : http://localhost:3300/portail-parent
echo   Portail Enseignant : http://localhost:3300/portail-enseignant
echo.
echo   --- IDENTIFIANTS ADMIN ---
echo   Telephone   : 623969686
echo   Mot de passe: smart2025
echo.
echo  ============================================================
echo.

:: Ouvrir le navigateur automatiquement
start "" http://localhost:3300

echo  Appuyez sur une touche pour fermer cette fenetre...
echo  (Les serveurs continueront de tourner en arriere-plan)
echo.
pause >nul
