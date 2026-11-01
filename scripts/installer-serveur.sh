#!/usr/bin/env bash
#
# SmartSchool — prépare un serveur Ubuntu/Debian neuf à héberger l'application.
#
# À lancer UNE SEULE FOIS, en root, sur une machine fraîchement louée :
#     bash installer-serveur.sh
#
# Ce script fait tout ce que l'hébergeur faisait pour nous avant : il installe
# Docker, ferme les portes inutiles, et met en place les mises à jour de
# sécurité automatiques. Après ça, le serveur se tient à jour tout seul.
#
# Il est IDEMPOTENT : le relancer ne casse rien, il saute ce qui est déjà fait.

set -euo pipefail

bleu() { printf "\n\033[1;34m== %s\033[0m\n" "$1"; }
ok()   { printf "   \033[0;32mok\033[0m %s\n" "$1"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Ce script doit être lancé en root (essayez : sudo bash $0)" >&2
    exit 1
fi

# ──────────────────────────────────────────────────────────────────────────
bleu "1/6  Mise à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
ok "système à jour"

# ──────────────────────────────────────────────────────────────────────────
bleu "2/6  Mises à jour de sécurité automatiques"
# C'est LE point qui remplace la maintenance de l'hébergeur : les correctifs
# de sécurité s'installent chaque nuit, sans personne devant l'écran.
apt-get install -y -qq unattended-upgrades apt-listchanges
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'FIN'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
FIN
# Redémarrage automatique si un correctif l'exige, à 4h du matin — avant
# l'ouverture de l'école. Les conteneurs reviennent seuls (`restart: always`).
sed -i 's|^//\s*Unattended-Upgrade::Automatic-Reboot "false";|Unattended-Upgrade::Automatic-Reboot "true";|' \
    /etc/apt/apt.conf.d/50unattended-upgrades || true
sed -i 's|^//\s*Unattended-Upgrade::Automatic-Reboot-Time .*|Unattended-Upgrade::Automatic-Reboot-Time "04:00";|' \
    /etc/apt/apt.conf.d/50unattended-upgrades || true
ok "correctifs de sécurité installés chaque nuit, redémarrage à 4h si nécessaire"

# ──────────────────────────────────────────────────────────────────────────
bleu "3/6  Docker"
if command -v docker >/dev/null 2>&1; then
    ok "déjà installé ($(docker --version))"
else
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
    ok "Docker installé"
fi
# Au démarrage de la machine, Docker relance les conteneurs marqués
# `restart: always`. C'est ce qui fait revenir l'application seule après une
# coupure de courant chez l'hébergeur.
systemctl enable --now docker
ok "Docker démarre automatiquement avec la machine"

# ──────────────────────────────────────────────────────────────────────────
bleu "4/6  Pare-feu"
apt-get install -y -qq ufw
ufw --force reset >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp   comment "SSH"   >/dev/null
ufw allow 80/tcp   comment "HTTP"  >/dev/null
ufw allow 443/tcp  comment "HTTPS" >/dev/null
ufw --force enable >/dev/null
ok "seuls SSH, HTTP et HTTPS sont ouverts"

# ──────────────────────────────────────────────────────────────────────────
bleu "5/6  Mémoire d'appoint"
# Le chiffrement des mots de passe à la connexion est l'opération la plus
# lourde de l'application. Un fichier d'échange évite qu'un pic de charge au
# moment de la rentrée du matin ne fasse tuer un conteneur faute de mémoire.
if swapon --show | grep -q .; then
    ok "déjà en place"
else
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "2 Go de mémoire d'appoint"
fi

# ──────────────────────────────────────────────────────────────────────────
bleu "6/6  Nettoyage automatique"
# Sans ça, les images Docker des anciennes versions remplissent le disque en
# quelques mois, et l'application s'arrête faute de place.
cat > /etc/cron.weekly/docker-menage <<'FIN'
#!/bin/sh
docker image prune -af --filter "until=168h" >/dev/null 2>&1
docker builder prune -af --filter "until=168h" >/dev/null 2>&1
FIN
chmod +x /etc/cron.weekly/docker-menage
ok "images inutilisées supprimées chaque semaine"

printf "\n\033[1;32mServeur prêt.\033[0m\n\n"
cat <<'FIN'
Ce qui reste à faire :

  1. Récupérer le code :
       git clone https://github.com/Iya2006/SmartSchool_Final-PROD.git /opt/smartschool
       cd /opt/smartschool

  2. Créer le fichier .env (voir DEPLOIEMENT_VPS.md pour chaque valeur) :
       cp .env.vps.exemple .env
       nano .env

  3. Démarrer :
       docker compose -f docker-compose.vps.yml up -d --build

  4. Vérifier :
       curl -fsS http://localhost/health   (via Caddy, une fois le DNS en place)
FIN
