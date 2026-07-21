@echo off
chcp 65001 >nul 2>&1
title SMART SCHOOL - Arret
color 0B

echo.
echo  ============================================================
echo       ARRET DU SYSTEME SMART SCHOOL
echo  ============================================================
echo.

echo  [1/2] Arret des services Docker (Postgres, Redis, Keycloak, etc.)...
docker-compose down 2>nul
if %errorlevel% neq 0 (
    echo        NOTE: Docker Desktop n'est peut-etre pas lance.
    echo        Les services etaient probablement deja arretes.
) else (
    echo        OK - Services Docker arretes et nettoyes.
)

echo.
echo  [2/2] Liberation des ports Frontend/Backend locaux (au cas ou)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3300" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo        OK.

echo.
echo  ============================================================
echo       SYSTEME SMART SCHOOL ARRETE PROPREMENT
echo  ============================================================
echo.
echo  Les donnees (bases de donnees, minio) sont preservees.
echo.
pause
