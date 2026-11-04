#!/usr/bin/env bash
#
# SmartSchool — sauvegarde quotidienne des fichiers déposés.
#
# CE QUE ÇA SAUVEGARDE, ET CE QUE ÇA NE SAUVEGARDE PAS
# Uniquement le volume `uploads` : logo de l'école, photos d'élèves, sujets
# d'examen, justificatifs de dépenses, bulletins PDF déjà produits.
#
# Les DONNÉES (comptes, notes, paiements, comptabilité) ne sont pas ici : elles
# vivent chez Supabase, qui gère ses propres sauvegardes. Rien à faire de ce
# côté — et surtout, ne pas croire que ce script les protège.
#
# Pourquoi ça compte : c'est exactement ce qu'on a perdu en quittant Render.
# Les fichiers étaient sur un disque qu'on ne pouvait plus atteindre une fois
# le service suspendu.
#
# Installation (une fois) :
#     cp scripts/sauvegarde-uploads.sh /etc/cron.daily/smartschool-sauvegarde
#     chmod +x /etc/cron.daily/smartschool-sauvegarde

set -euo pipefail

VOLUME="smartschool_uploads"          # nom réel : <dossier>_uploads, voir `docker volume ls`
DESTINATION="/opt/sauvegardes"
GARDER_JOURS=14

# Le volume doit EXISTER. C'est la seule vraie anomalie : un volume absent
# signifie que la sauvegarde ne protège rien, et il faut le savoir. Un volume
# simplement vide, lui, est normal sur une installation neuve — avant que
# l'école n'ait déposé son premier logo.
if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
    echo "SmartSchool : le volume '$VOLUME' n'existe pas — rien n'est sauvegardé." >&2
    echo "Volumes disponibles : $(docker volume ls --format '{{.Name}}' | tr '\n' ' ')" >&2
    exit 1
fi

mkdir -p "$DESTINATION"
horodatage=$(date +%Y-%m-%d)
archive="$DESTINATION/uploads-$horodatage.tar.gz"

# On passe par un conteneur jetable : le volume Docker n'est pas lisible
# directement depuis le système de fichiers de la machine.
docker run --rm \
    -v "${VOLUME}:/source:ro" \
    -v "${DESTINATION}:/cible" \
    alpine:3 \
    tar czf "/cible/uploads-$horodatage.tar.gz" -C /source .

taille=$(stat -c%s "$archive")
find "$DESTINATION" -name 'uploads-*.tar.gz' -mtime +"$GARDER_JOURS" -delete

# Cron envoie un courriel dès qu'un script écrit quelque chose. On ne dit donc
# rien quand tout va bien : le silence quotidien est le signe que ça marche.
# Seule une archive anormalement petite alors que le volume contient des
# fichiers mérite un signalement.
fichiers=$(docker run --rm -v "${VOLUME}:/source:ro" alpine:3 sh -c 'find /source -type f | wc -l')
if [ "$fichiers" -gt 0 ] && [ "$taille" -lt 200 ]; then
    echo "SmartSchool : $fichiers fichier(s) dans le volume mais archive de $taille octets seulement." >&2
    exit 1
fi

# POUR ALLER PLUS LOIN
# Cette copie vit sur la même machine : elle protège d'une suppression
# accidentelle, pas de la perte du serveur. La sauvegarde quotidienne incluse
# par l'hébergeur couvre ce second cas. Pour une copie vraiment externe,
# envoyer l'archive vers Supabase Storage ou la récupérer périodiquement avec :
#     scp root@SERVEUR:/opt/sauvegardes/uploads-*.tar.gz .
