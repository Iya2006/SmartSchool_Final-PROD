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

# Une archive vide ou minuscule signale un volume mal nommé : mieux vaut le
# savoir tout de suite que de le découvrir le jour où on en a besoin.
taille=$(stat -c%s "$archive")
if [ "$taille" -lt 100 ]; then
    echo "SmartSchool : sauvegarde suspecte ($taille octets) — le volume '$VOLUME' existe-t-il ?" >&2
    exit 1
fi

find "$DESTINATION" -name 'uploads-*.tar.gz' -mtime +"$GARDER_JOURS" -delete

echo "SmartSchool : sauvegarde du $horodatage — $(numfmt --to=iec "$taille")"

# POUR ALLER PLUS LOIN
# Cette copie vit sur la même machine : elle protège d'une suppression
# accidentelle, pas de la perte du serveur. La sauvegarde quotidienne incluse
# par l'hébergeur couvre ce second cas. Pour une copie vraiment externe,
# envoyer l'archive vers Supabase Storage ou la récupérer périodiquement avec :
#     scp root@SERVEUR:/opt/sauvegardes/uploads-*.tar.gz .
