#!/bin/sh
# Démarrage combiné API + worker RQ dans le MÊME conteneur, pour le
# déploiement Render (voir render.yaml et GUIDE_DEPLOIEMENT.md).
#
# Render attache un disque persistant à UN SEUL service, jamais partagé
# entre plusieurs services — hors de ce script, l'API (sert les fichiers
# via /uploads) et le worker (écrit les PDF générés dans /app/uploads)
# tourneraient sur deux systèmes de fichiers séparés, et un bulletin
# généré par le worker serait invisible pour l'API. Les deux processus
# partagent donc ce conteneur (et son disque) — limite assumée pour ce
# premier déploiement, documentée dans le guide, pas un choix silencieux.
#
# Ce script est UNIQUEMENT utilisé par render.yaml (dockerCommand) — il
# ne remplace pas le CMD de Dockerfile.prod, inchangé pour Docker Compose.
rq worker --url "$REDIS_URL" default &
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8500}" --workers 2 --loop uvloop --http httptools --access-log
