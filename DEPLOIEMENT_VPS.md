# Mettre SmartSchool sur son propre serveur

Ce guide remplace l'hébergement Render par **une seule machine louée**, pour
environ 5 $ par mois au lieu de 96 $.

Ce qui ne bouge pas : les **données** restent chez Supabase, le **site** reste
chez Cloudflare, le **domaine** ne change pas. On déplace uniquement le
programme qui fait le lien entre les trois.

Compter **45 minutes** la première fois.

---

## À FAIRE AUJOURD'HUI, AVANT TOUT LE RESTE

Le compte Render est suspendu, et un compte suspendu finit par être supprimé.
**Deux valeurs doivent en être recopiées maintenant**, tant qu'il est encore
consultable.

Aller sur `dashboard.render.com` → service **`smartschool-api`** → **Environment**,
et noter quelque part de sûr :

| Variable | Pourquoi elle est irremplaçable |
|---|---|
| `DATABASE_URL` | L'adresse de Supabase, avec son mot de passe. Sans elle, plus d'accès aux données. |
| `JWT_SECRET_KEY` | La clé qui signe les sessions. En changer déconnecte d'un coup **tous** les utilisateurs. |

Si `JWT_SECRET_KEY` est définitivement perdue, ce n'est pas dramatique : on en
génère une nouvelle et chacun se reconnecte une fois. Mais autant l'éviter.

---

## Étape 1 — Louer la machine

**Ce qu'il faut :** 2 Go de mémoire au minimum, un disque d'au moins 20 Go,
Ubuntu 24.04, et une localisation en Europe (c'est là qu'est Supabase).

**Ce qui a été pris en novembre 2026 :** Contabo **Cloud VPS 4** — 4 cœurs,
8 Go, 100 Go, région Union européenne — à **6,60 $/mois sans engagement**, plus
**2 $ d'Auto Backup**, soit 8,60 $. OVHcloud avait été essayé d'abord, mais ses
deux offres les moins chères étaient en rupture.

> **Deux pièges au moment de payer :**
> - Les tarifs d'appel supposent souvent **12 ou 24 mois réglés d'avance**.
>   Prendre la durée **1 mois** : l'économie ne vaut pas le verrouillage.
> - L'**Auto Backup** vaut ses 2 $. La sauvegarde de l'étape 8 vit sur le
>   serveur lui-même : elle protège d'une suppression accidentelle, pas de la
>   perte de la machine. C'est exactement ce qui a fait perdre les fichiers
>   restés chez Render.

À la commande, choisir **Ubuntu** comme système, et **copier immédiatement le
mot de passe root** : il n'est pas envoyé par courriel.

La livraison prend une trentaine de minutes. L'hébergeur envoie ensuite un
courriel avec l'**adresse IP** et les identifiants.

---

## Étape 2 — Se connecter au serveur

Depuis l'ordinateur, ouvrir un terminal (PowerShell sous Windows) :

```
ssh root@VOTRE_ADRESSE_IP
```

Répondre `yes` à la question de confiance, puis saisir le mot de passe. Le mot
de passe ne s'affiche pas pendant la frappe — c'est normal.

---

## Étape 3 — Préparer le serveur

Une seule commande installe Docker, ferme les portes inutiles et active les
mises à jour de sécurité automatiques :

```
apt-get update && apt-get install -y git
git clone https://github.com/Iya2006/SmartSchool_Final-PROD.git /opt/smartschool
cd /opt/smartschool
bash scripts/installer-serveur.sh
```

Compter 5 à 10 minutes. Le script annonce chaque étape et se termine par
**« Serveur prêt »**.

---

## Étape 4 — Renseigner les secrets

```
cp .env.vps.exemple .env
nano .env
```

Remplir les cinq valeurs. Le fichier explique chacune. Pour `REDIS_PASSWORD`,
qui est nouveau, en générer un :

```
openssl rand -hex 24
```

Enregistrer avec **Ctrl+O**, Entrée, puis **Ctrl+X** pour sortir.

> **Le piège de `CORS_ORIGINS` :** pas d'espace après les virgules. Le code
> découpe la liste sur la virgule sans nettoyer, et une adresse précédée d'un
> espace ne correspond à rien — la connexion serait refusée sans message
> compréhensible. Cette erreur nous a déjà coûté une soirée.

---

## Étape 5 — Faire pointer le domaine vers le nouveau serveur

Sur **Cloudflare** → domaine `trxsmartschool.com` → **DNS** :

1. Trouver l'enregistrement **`api`**
2. Remplacer sa valeur par **l'adresse IP du nouveau serveur** (type `A`)
3. Mettre le nuage sur **gris (DNS only)** — temporairement

**Pourquoi le nuage gris :** pour délivrer le certificat HTTPS, Let's Encrypt
doit joindre le serveur directement. Avec le nuage orange, la vérification
n'arrive jamais et le certificat échoue en boucle.

Attendre deux ou trois minutes que le changement se propage.

---

## Étape 6 — Démarrer

```
cd /opt/smartschool
docker compose -f docker-compose.vps.yml up -d --build
```

La première construction prend 3 à 5 minutes. Puis vérifier :

```
docker compose -f docker-compose.vps.yml ps
```

Les quatre services — `api`, `worker`, `redis`, `caddy` — doivent être `Up`,
et `api` doit afficher `(healthy)`.

Tester enfin, depuis n'importe où :

```
curl https://api.trxsmartschool.com/health
```

La réponse attendue :

```
{"status":"ok","database":"up","redis":"up"}
```

`database: up` signifie que Supabase répond : les données sont bien là.

> **Si Supabase ne répond pas**, c'est probablement la mise en veille de la
> formule gratuite après une semaine d'inactivité. Ouvrir le tableau de bord
> Supabase et réveiller le projet.

---

## Étape 7 — Remettre la protection Cloudflare

Une fois le `https://` fonctionnel :

1. Cloudflare → **DNS** → enregistrement `api` → repasser le nuage en **orange**
2. Cloudflare → **SSL/TLS** → mode **Full (strict)**

Le site reprend alors la protection anti-attaques, et le serveur n'est plus
joignable directement.

---

## Étape 8 — Surveillance et sauvegardes

**Sauvegarde quotidienne des fichiers :**

```
cp scripts/sauvegarde-uploads.sh /etc/cron.daily/smartschool-sauvegarde
chmod +x /etc/cron.daily/smartschool-sauvegarde
/etc/cron.daily/smartschool-sauvegarde    # essai immédiat
```

**Alerte en cas de panne :** créer un compte gratuit sur **uptimerobot.com**,
ajouter une surveillance de type HTTP sur `https://api.trxsmartschool.com/health`,
toutes les 5 minutes, avec le numéro ou l'adresse à prévenir. C'est ce que
faisait la surveillance de Render — on est averti avant les utilisateurs.

---

## Étape 9 — Reposer ce qui a été perdu

Le disque de Render n'est pas venu avec nous. À refaire depuis l'application :

- le **logo de l'école** (Paramètres → Identité)
- les **photos d'élèves** déjà déposées
- les **sujets d'examen** que les enseignants avaient mis en ligne

Les bulletins PDF, eux, se régénèrent seuls à partir des notes.

---

## Au quotidien

**Mettre à jour après une modification du code :**

```
cd /opt/smartschool && git pull && docker compose -f docker-compose.vps.yml up -d --build
```

**Voir ce qui se passe :**

```
docker compose -f docker-compose.vps.yml logs -f api
```

**Tout redémarrer :**

```
docker compose -f docker-compose.vps.yml restart
```

Après une coupure de courant chez l'hébergeur, il n'y a **rien à faire** : les
services sont marqués `restart: always` et reviennent seuls avec la machine.

---

## Ce qui reste manuel

- Une mise à jour majeure d'Ubuntu tous les deux ou trois ans — une soirée.
- Réagir à un incident rare que le redémarrage automatique ne résout pas.

Tout le reste — correctifs de sécurité, redémarrages, certificats, nettoyage du
disque, sauvegardes — se fait sans intervention.
