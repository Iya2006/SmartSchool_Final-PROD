#!/bin/bash
# setup_secrets.sh — Générer les fichiers de secrets en sécurité
# Usage: ./setup_secrets.sh

set -e

echo "=========================================="
echo "Docker Secrets Setup — SMART_SCHOOL_FINAL"
echo "=========================================="

# Créer le répertoire secrets
mkdir -p ./secrets
chmod 700 ./secrets

# Générer des secrets sécurisés (si inexistants)
echo "Génération des secrets..."

if [ ! -f ./secrets/db_password.txt ]; then
    echo "Générer une nouvelle DB_PASSWORD (32+ caractères alphanumériques):"
    read -s -p "Entrez le mot de passe PostgreSQL: " db_pass
    echo "$db_pass" > ./secrets/db_password.txt
    chmod 600 ./secrets/db_password.txt
    echo "[OK] DB_PASSWORD créé"
else
    echo "[SKIP] db_password.txt existe déjà"
fi

if [ ! -f ./secrets/jwt_secret.txt ]; then
    python3 -c "import secrets; print(secrets.token_urlsafe(50))" > ./secrets/jwt_secret.txt
    chmod 600 ./secrets/jwt_secret.txt
    echo "[OK] JWT_SECRET_KEY créé"
else
    echo "[SKIP] jwt_secret.txt existe déjà"
fi

if [ ! -f ./secrets/minio_password.txt ]; then
    echo "Générer MINIO_PASSWORD (32+ caractères):"
    read -s -p "Entrez le mot de passe MinIO: " minio_pass
    echo "$minio_pass" > ./secrets/minio_password.txt
    chmod 600 ./secrets/minio_password.txt
    echo "[OK] MINIO_PASSWORD créé"
else
    echo "[SKIP] minio_password.txt existe déjà"
fi

if [ ! -f ./secrets/keycloak_password.txt ]; then
    echo "Générer KEYCLOAK_PASSWORD (32+ caractères):"
    read -s -p "Entrez le mot de passe Keycloak: " keycloak_pass
    echo "$keycloak_pass" > ./secrets/keycloak_password.txt
    chmod 600 ./secrets/keycloak_password.txt
    echo "[OK] KEYCLOAK_PASSWORD créé"
else
    echo "[SKIP] keycloak_password.txt existe déjà"
fi

echo ""
echo "=========================================="
echo "✓ Secrets générés et sécurisés"
echo "=========================================="
echo ""
echo "Prochaines étapes:"
echo "1. Créer/mettre à jour .env depuis .env.example"
echo "2. Lancer: docker compose -f docker-compose.prod.yml up -d"
echo "3. Vérifier: docker compose -f docker-compose.prod.yml ps"
echo ""
