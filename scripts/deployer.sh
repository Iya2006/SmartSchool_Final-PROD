#!/usr/bin/env bash
#
# SmartSchool — met en ligne la dernière version du code.
#
#     cd /opt/smartschool && ./scripts/deployer.sh
#
# POURQUOI UN SCRIPT PLUTÔT QUE TROIS COMMANDES
# Les trois commandes (`git pull`, puis reconstruire, puis redémarrer) ne
# disent pas si l'application est bien revenue. Docker annonce « Started »
# dès que le conteneur démarre, pas quand l'application répond : une version
# qui plante au lancement affiche exactement le même message qu'une version
# saine. On s'en aperçoit quand une école appelle.
#
# Ce script attend la confirmation que l'application RÉPOND, et affiche les
# journaux d'erreur lui-même si elle ne revient pas.

set -euo pipefail

COMPOSE="docker-compose.vps.yml"
DELAI_MAX=120   # secondes avant de déclarer l'échec

cd "$(dirname "$0")/.."

bleu() { printf "\n\033[1;34m== %s\033[0m\n" "$1"; }
vert() { printf "\033[0;32m%s\033[0m\n" "$1"; }
rouge() { printf "\033[0;31m%s\033[0m\n" "$1"; }

if [ ! -f .env ]; then
    rouge "Pas de fichier .env ici. Le déploiement s'arrête."
    exit 1
fi

# ──────────────────────────────────────────────────────────────────────────
bleu "1/4  Récupération du code"
avant=$(git rev-parse --short HEAD)
git pull --ff-only
apres=$(git rev-parse --short HEAD)

if [ "$avant" = "$apres" ]; then
    echo "   déjà à jour ($apres) — on reconstruit quand même, au cas où"
else
    echo "   $avant → $apres"
    git log --oneline "$avant..$apres" | sed 's/^/     /'
fi

# ──────────────────────────────────────────────────────────────────────────
bleu "2/4  Construction"
docker compose -f "$COMPOSE" build

# ──────────────────────────────────────────────────────────────────────────
bleu "3/4  Redémarrage"
docker compose -f "$COMPOSE" up -d

# ──────────────────────────────────────────────────────────────────────────
bleu "4/4  Vérification"
echo "   on attend que l'application réponde (jusqu'à ${DELAI_MAX}s)…"

debut=$SECONDS
while true; do
    # Interrogé DEPUIS le conteneur Caddy : on teste le chemin réel que
    # prendra une requête venue d'Internet, pas seulement le conteneur de
    # l'API isolément.
    if docker compose -f "$COMPOSE" exec -T caddy \
         wget -qO- --timeout=5 http://api:8500/health 2>/dev/null | grep -q '"status":"ok"'; then
        duree=$((SECONDS - debut))
        vert "   l'application répond (${duree}s)"
        break
    fi

    if [ $((SECONDS - debut)) -ge "$DELAI_MAX" ]; then
        rouge "   l'application n'a pas répondu après ${DELAI_MAX}s."
        rouge "   Dernières lignes du journal :"
        echo
        docker compose -f "$COMPOSE" logs --tail=30 api | sed 's/^/     /'
        echo
        rouge "   La version précédente n'est PAS restaurée automatiquement."
        rouge "   Pour revenir en arrière :"
        echo "     git reset --hard $avant && ./scripts/deployer.sh"
        exit 1
    fi
    sleep 3
done

# État final, pour l'œil.
bleu "État des services"
docker compose -f "$COMPOSE" ps --format "table {{.Service}}\t{{.Status}}"

printf "\n"
vert "Déploiement terminé — version $apres en ligne."
