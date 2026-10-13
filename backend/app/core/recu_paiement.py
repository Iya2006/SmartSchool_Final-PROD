"""
SMARTSCHOOL — Reçu de paiement : UN seul modèle pour toute l'application.

Le reçu affiché juste après un encaissement, celui réimprimé depuis
l'historique et celui que le parent télécharge dans son portail sortent
tous d'ici : mêmes données (`charger_donnees_recu`), même rendu
(`generer_pdf_recu`). Auparavant chaque écran avait sa propre version, et
aucune ne ressemblait aux autres.

Authenticité : chaque reçu porte un code de vérification (HMAC de ses
données essentielles, signé avec la clé secrète du serveur) et un QR code
qui ouvre la page publique de vérification. Un reçu retouché (montant,
date, numéro) ou fabriqué de toutes pièces n'a pas de code valide, et la
page dit aussi si le paiement a été annulé depuis.
"""
import base64
import hashlib
import hmac
import io
import os
import re
import unicodedata
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode, urlparse

from sqlalchemy.orm import Session

from app.models.academique import (
    AnneeScolaire, EcheanceFacture, EleveParent, Etablissement, Paiement,
    Parent, ParametreEtablissement, TypeFrais,
)

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

COULEUR_DEFAUT = "#1e3a8a"

LIBELLES_MODES = {
    "ESPECES": "Espèces",
    "VIREMENT": "Virement bancaire",
    "ORANGE_MONEY": "Orange Money",
    "MTN_MONEY": "MTN Mobile Money",
    "CHEQUE": "Chèque",
    "CARTE_BANCAIRE": "Carte bancaire",
    "MOBILE_MONEY": "Mobile Money",
    "AUTRE": "Autre",
}


# ============================================================================
# Code de vérification
# ============================================================================

def _cle_secrete() -> bytes:
    """Clé qui signe les reçus : RECU_SIGNING_KEY si l'hébergeur la fournit
    (variable ou Docker Secret, comme JWT_SECRET_KEY), sinon la clé JWT.

    ATTENTION : un reçu imprimé vit des années, une clé JWT se fait tourner.
    Avant de changer JWT_SECRET_KEY, définir RECU_SIGNING_KEY avec son
    ANCIENNE valeur — sinon plus aucun reçu déjà remis aux familles ne se
    vérifie (la page publique les dirait tous faux)."""
    from app.core.secrets import read_secret
    cle = (read_secret("RECU_SIGNING_KEY") or "").strip()
    if not cle:
        from app.core.auth import SECRET_KEY
        cle = SECRET_KEY or ""
    return cle.encode("utf-8")


def code_verification(paiement: Paiement) -> str:
    """Code court, stable et infalsifiable sans la clé du serveur.

    Il couvre le numéro, le montant, la date et la facture : modifier l'un
    d'eux sur un reçu imprimé le rend invalide à la vérification."""
    montant = f"{float(paiement.montant or 0):.2f}"
    jour = str(paiement.date_paiement or "")
    message = f"recu|{paiement.paiement_id}|{paiement.numero_recu}|{montant}|{jour}|{paiement.facture_id}"
    empreinte = hmac.new(_cle_secrete(), message.encode("utf-8"), hashlib.sha256).digest()
    brut = base64.b32encode(empreinte).decode("ascii")[:12]
    return f"{brut[0:4]}-{brut[4:8]}-{brut[8:12]}"


# Tirets Unicode (traits d'union, tirets demi-cadratin / cadratin, signe
# moins) : un code recopié depuis un traitement de texte ou un téléphone en
# contient souvent à la place du « - ».
_TIRETS_UNICODE = dict.fromkeys(map(ord, "\u2010\u2011\u2012\u2013\u2014\u2015\u2212"), "-")
_CODE_PERMIS = re.compile(r"[A-Z2-7-]+")


def code_est_valide(paiement: Paiement, code: str) -> bool:
    """Ne lève jamais : `hmac.compare_digest` refuse une chaîne non ASCII
    (TypeError -> 500), et seulement quand le numéro existe — la réponse
    trahissait alors l'existence du reçu. Tout ce qui n'est pas de
    l'alphabet du code (base32 + tirets) est donc refusé AVANT la
    comparaison."""
    try:
        propre = "".join(str(code or "").translate(_TIRETS_UNICODE).split()).upper()
    except Exception:
        return False
    if not _CODE_PERMIS.fullmatch(propre):
        return False
    if "-" not in propre and len(propre) == 12:
        propre = f"{propre[0:4]}-{propre[4:8]}-{propre[8:12]}"
    return hmac.compare_digest(code_verification(paiement), propre)


def _origine_valide(valeur: str) -> str:
    """« https://ecole.gn/ » -> « https://ecole.gn » ; « * », « localhost:3000 »
    ou tout ce qui n'a pas de schéma http(s) ET d'hôte -> "" (un QR code
    vers « */verifier-recu » ne mène nulle part)."""
    p = urlparse((valeur or "").strip())
    if p.scheme not in ("http", "https") or not p.hostname:
        return ""
    return f"{p.scheme}://{p.netloc}"


def base_url_publique(request=None) -> str:
    """Adresse du site (frontend) vers laquelle pointe le QR code.

    1. FRONTEND_PUBLIC_URL si l'hébergeur la fournit ;
    2. sinon l'origine du site qui a demandé le reçu, seulement si elle fait
       partie des origines autorisées (CORS) — pas d'adresse arbitraire ;
    3. sinon la première origine autorisée qui n'est pas locale."""
    explicite = (os.getenv("FRONTEND_PUBLIC_URL") or "").strip().rstrip("/")
    if explicite:
        return explicite
    autorisees = [o for o in (_origine_valide(x) for x in os.getenv("CORS_ORIGINS", "").split(",")) if o]
    if request is not None:
        for entete in ("origin", "referer"):
            valeur = request.headers.get(entete)
            if not valeur:
                continue
            p = urlparse(valeur)
            origine = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else ""
            if origine and origine in autorisees:
                return origine
    for o in autorisees:
        hote = urlparse(o).hostname or ""
        if hote not in ("localhost", "127.0.0.1"):
            return o
    return "https://trxsmartschool.com"


def url_verification(base: str, numero_recu: str, code: str) -> str:
    return f"{base.rstrip('/')}/verifier-recu?{urlencode({'n': numero_recu, 'c': code})}"


# ============================================================================
# Mise en forme
# ============================================================================

def arrondir_montant(valeur) -> float:
    """Montant au centime : la somme de flottants (150000.1 + 0.2…) traîne des
    décimales parasites qu'un reçu ne doit jamais afficher."""
    try:
        return round(float(valeur or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def formater_montant(valeur) -> str:
    """80000 -> « 80 000 » ; 1250.5 -> « 1 250,50 » (à la française).

    Les décimales ne s'affichent que si le montant en a : un versement en
    euros ou en dollars de 1 250,50 n'est plus imprimé « 1 250 »."""
    v = arrondir_montant(valeur)
    if abs(v - round(v)) < 0.005:
        return f"{int(round(v)):,}".replace(",", " ")
    return f"{v:,.2f}".replace(",", " ").replace(".", ",")


def libelle_mode(mode: Optional[str]) -> str:
    """Libellé lisible, quelle que soit la façon dont le mode a été saisi
    (« ESPECES », « Espèces », « cash »… — voir app/core/modes_paiement)."""
    if not mode:
        return "—"
    from app.core.modes_paiement import normaliser_mode_paiement
    code = normaliser_mode_paiement(mode)
    return LIBELLES_MODES.get(code or "", mode.replace("_", " ").capitalize())


_UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
           "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"]
_DIZAINES = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}


def _moins_de_cent(n: int, final: bool) -> str:
    if n <= 16:
        return _UNITES[n]
    if n < 20:
        return "dix-" + _UNITES[n - 10]
    d, u = divmod(n, 10)
    if d in (7, 9):
        base = "soixante" if d == 7 else "quatre-vingt"
        reste = 10 + u
        if d == 7 and u == 1:
            return "soixante et onze"
        return f"{base}-{_moins_de_cent(reste, final)}"
    if d == 8:
        if u == 0:
            return "quatre-vingts" if final else "quatre-vingt"
        return "quatre-vingt-" + _UNITES[u]
    if u == 0:
        return _DIZAINES[d]
    if u == 1:
        return f"{_DIZAINES[d]} et un"
    return f"{_DIZAINES[d]}-{_UNITES[u]}"


def _moins_de_mille(n: int, final: bool) -> str:
    c, r = divmod(n, 100)
    morceaux = []
    if c:
        if c == 1:
            morceaux.append("cent")
        else:
            morceaux.append(_UNITES[c] + (" cents" if (r == 0 and final) else " cent"))
    if r:
        morceaux.append(_moins_de_cent(r, final))
    return " ".join(morceaux)


def montant_en_lettres(valeur) -> str:
    """Montant en toutes lettres (règles traditionnelles), ex. 80000 ->
    « quatre-vingt mille ». Mention classique d'un reçu : elle rend la
    surcharge d'un chiffre immédiatement visible."""
    try:
        n = int(round(float(valeur or 0)))
    except (TypeError, ValueError):
        n = 0
    if n == 0:
        return "zéro"
    if n < 0:
        return "moins " + montant_en_lettres(-n)
    morceaux = []
    for taille, sing, plur in ((10 ** 9, "milliard", "milliards"), (10 ** 6, "million", "millions")):
        q, n = divmod(n, taille)
        if q:
            morceaux.append(f"{_moins_de_mille(q, True)} {sing if q == 1 else plur}")
    q, n = divmod(n, 1000)
    if q:
        # « mille » est invariable et ne prend pas « un » devant ; « cent » et
        # « quatre-vingt » ne prennent pas de s devant « mille ».
        morceaux.append("mille" if q == 1 else f"{_moins_de_mille(q, False)} mille")
    if n:
        morceaux.append(_moins_de_mille(n, True))
    return " ".join(morceaux)


# (singulier, pluriel) de chaque devise, et de sa subdivision.
_NOMS_DEVISES = {
    "GNF": ("franc guinéen", "francs guinéens"),
    "XOF": ("franc CFA", "francs CFA"),
    "EUR": ("euro", "euros"),
    "USD": ("dollar US", "dollars US"),
}
_NOMS_CENTIMES = {"USD": ("cent", "cents")}


def somme_en_lettres(montant, devise: Optional[str] = "GNF") -> str:
    """Phrase complète, accordée, prête à imprimer (sans point final) :
    2000000 GNF -> « Deux millions de francs guinéens » ;
    1250.5 USD -> « Mille deux cent cinquante dollars US et cinquante cents ».

    Écrite ici une seule fois pour l'écran, le PDF et la page de
    vérification : chacun recollait « francs guinéens » à sa façon, et le
    « de » de « deux millions DE francs » manquait partout."""
    code = (devise or "GNF").strip().upper() or "GNF"
    try:
        centimes_total = int(round(float(montant or 0) * 100))
    except (TypeError, ValueError):
        centimes_total = 0
    signe = "moins " if centimes_total < 0 else ""
    entier, centimes = divmod(abs(centimes_total), 100)

    sing, plur = _NOMS_DEVISES.get(code, (code, code))
    c_sing, c_plur = _NOMS_CENTIMES.get(code, ("centime", "centimes"))
    morceaux = []
    if entier or not centimes:
        # « un million DE francs », « deux milliards DE francs » — mais
        # « un million cinq cent mille francs » : le « de » ne suit que le
        # nom (million, milliard) lui-même.
        de = "de " if entier and entier % 1_000_000 == 0 else ""
        morceaux.append(f"{montant_en_lettres(entier)} {de}{sing if entier <= 1 else plur}")
    if centimes:
        lettres_c = f"{montant_en_lettres(centimes)} {c_sing if centimes == 1 else c_plur}"
        morceaux.append(f"et {lettres_c}" if morceaux else lettres_c)
    phrase = signe + " ".join(morceaux)
    return phrase[:1].upper() + phrase[1:]


_HEX_COULEUR = re.compile(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")


def _hex_vers_rgb(valeur: str):
    v = (valeur or "").strip().lstrip("#")
    if len(v) == 3:
        v = "".join(ch * 2 for ch in v)
    try:
        return tuple(int(v[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except (ValueError, IndexError):
        return _hex_vers_rgb(COULEUR_DEFAUT)


def _contraste_avec_blanc(r: int, g: int, b: int) -> float:
    """Rapport de contraste WCAG 2 entre (r, g, b) 0-255 et le blanc."""
    def lineaire(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    lum = 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b)
    return 1.05 / (lum + 0.05)


def couleur_lisible(valeur: Optional[str]) -> str:
    """Couleur de l'école, normalisée en « #rrggbb » et assez foncée pour
    porter du texte blanc (contraste WCAG >= 4,5).

    Une couleur trop claire n'est plus remplacée par le bleu par défaut :
    on l'ASSOMBRIT pas à pas, l'école garde sa teinte. Une valeur qui n'est
    pas un hexadécimal (« red », « url(...) », « #12345 ») -> COULEUR_DEFAUT :
    elle finit dans le CSS de l'écran et de la page publique."""
    m = _HEX_COULEUR.fullmatch((valeur or "").strip())
    if not m:
        return COULEUR_DEFAUT
    v = m.group(1).lower()
    if len(v) == 3:
        v = "".join(ch * 2 for ch in v)
    r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
    # Arrondi vers le bas : chaque tour assombrit réellement, la boucle
    # finit au pire sur le noir (contraste 21).
    while _contraste_avec_blanc(r, g, b) < 4.5:
        r, g, b = int(r * 0.9), int(g * 0.9), int(b * 0.9)
    return f"#{r:02x}{g:02x}{b:02x}"


def _couleur_ecole(db: Session, etablissement_id: int) -> str:
    """Couleur principale choisie par l'école (Paramètres > Apparence)."""
    p = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.cle == "theme.primary",
    ).first()
    return couleur_lisible(p.valeur if p and p.valeur else COULEUR_DEFAUT)


# ============================================================================
# Données du reçu
# ============================================================================

def charger_donnees_recu(db: Session, paiement, facture, inscription, eleve, classe, request=None) -> dict:
    """Tout ce que le reçu affiche, calculé une seule fois. Sert à l'écran
    (JSON) comme au PDF : les deux ne peuvent plus diverger.

    `request` sert à l'adresse du QR code (voir base_url_publique) : l'écran
    reçoit ainsi exactement l'URL imprimée sur le PDF."""
    etablissement_id = classe.etablissement_id
    etablissement = db.query(Etablissement).filter(Etablissement.etablissement_id == etablissement_id).first()

    type_frais = None
    if facture.type_frais_id:
        type_frais = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()
    motif = (type_frais.libelle if type_frais else None) or (facture.description or None) or "Frais scolaires"

    # Tranche réglée : « 2 sur 3 », utile aux familles qui paient en plusieurs fois.
    tranche = None
    if paiement.echeance_id:
        echeances = (
            db.query(EcheanceFacture)
            .filter(EcheanceFacture.facture_id == facture.facture_id)
            .order_by(EcheanceFacture.date_limite.asc(), EcheanceFacture.echeance_id.asc())
            .all()
        )
        for idx, ech in enumerate(echeances, start=1):
            if ech.echeance_id == paiement.echeance_id:
                tranche = {"numero": idx, "total": len(echeances), "libelle": ech.libelle}
                break

    # Versements faits AVANT celui-ci : le reçu les retrace, et « déjà payé »
    # se calcule sur eux — pas sur le total d'aujourd'hui, qui inclurait des
    # versements postérieurs quand on réimprime un ancien reçu.
    # « Avant » = dans l'ordre de SAISIE (paiement_id), pas de date_paiement :
    # un versement saisi plus tard mais antidaté (recettes de la veille)
    # se glissait sinon parmi les antérieurs d'un reçu déjà remis, qui
    # changeait à la réimpression.
    anterieurs = (
        db.query(Paiement)
        .filter(
            Paiement.facture_id == facture.facture_id,
            Paiement.statut == "VALIDE",
            Paiement.paiement_id < paiement.paiement_id,
        )
        .order_by(Paiement.paiement_id.asc())
        .all()
    )
    deja_paye = arrondir_montant(sum(float(p.montant or 0) for p in anterieurs))
    montant = arrondir_montant(paiement.montant)
    total = arrondir_montant(facture.montant_net or facture.montant_total)
    paye_a_date = arrondir_montant(deja_paye + (montant if paiement.statut == "VALIDE" else 0))
    reste_a_date = arrondir_montant(max(0.0, total - paye_a_date))
    if reste_a_date < 0.005:
        reste_a_date = 0.0

    parent = (
        db.query(Parent)
        .join(EleveParent, EleveParent.parent_id == Parent.parent_id)
        .filter(EleveParent.eleve_id == eleve.eleve_id)
        .first()
    )

    annee = None
    annee_id = facture.annee_id or inscription.annee_id
    if annee_id:
        annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()

    # L'heure de saisie n'est imprimée que si la saisie a eu lieu LE JOUR du
    # paiement : pour un versement antidaté, « payé le 12 à 09:14 » mêlerait
    # le jour de l'encaissement et l'heure de la saisie du lendemain.
    emis = paiement.created_date if isinstance(paiement.created_date, datetime) else None
    heure = None
    if emis and paiement.date_paiement and emis.date() == paiement.date_paiement:
        heure = emis.strftime("%H:%M")
    code = code_verification(paiement)
    devise = paiement.devise or "GNF"

    return {
        "paiement_id": paiement.paiement_id,
        "numero_recu": paiement.numero_recu,
        "statut": paiement.statut or "VALIDE",
        "motif_annulation": paiement.motif_annulation,
        "date_paiement": str(paiement.date_paiement) if paiement.date_paiement else None,
        "heure": heure,
        "montant": montant,
        "montant_en_lettres": montant_en_lettres(montant),
        "somme_en_lettres": somme_en_lettres(montant, devise),
        "devise": devise,
        "mode_paiement": paiement.mode_paiement,
        "mode_paiement_libelle": libelle_mode(paiement.mode_paiement),
        "reference_externe": paiement.reference_externe,
        "tranche": tranche,
        "code_verification": code,
        "url_verification": url_verification(base_url_publique(request), paiement.numero_recu, code),
        "facture": {
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "motif": motif,
            "montant_total": total,
            "deja_paye": deja_paye,
            "paye_a_date": paye_a_date,
            "reste_a_date": reste_a_date,
            # Situation ACTUELLE de la facture (peut avoir évolué depuis).
            "montant_paye": arrondir_montant(facture.montant_paye),
            "montant_restant": arrondir_montant(facture.montant_restant),
            "statut": facture.statut,
        },
        "anterieurs": [
            {
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement) if p.date_paiement else None,
                "montant": arrondir_montant(p.montant),
                "mode_paiement": libelle_mode(p.mode_paiement),
            }
            for p in anterieurs
        ],
        "eleve": {
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "classe": classe.libelle,
        },
        "annee_libelle": annee.libelle if annee else None,
        "parent": {
            "nom": f"{parent.prenom or ''} {parent.nom or ''}".strip() if parent else None,
            "telephone": parent.telephone_1 if parent else None,
        },
        "etablissement": {
            "etablissement_id": etablissement_id,
            "nom": (etablissement.nom if etablissement else None) or "Établissement",
            "slogan": (getattr(etablissement, "slogan", None) or "") if etablissement else "",
            "adresse": ", ".join(x for x in [
                (etablissement.adresse if etablissement else None),
                (etablissement.ville if etablissement else None),
            ] if x) or "",
            "telephone": (etablissement.telephone if etablissement else "") or "",
            "email": (etablissement.email if etablissement else "") or "",
            "directeur": (etablissement.directeur if etablissement else "") or "",
            "logo_url": (etablissement.logo_url if etablissement else None),
            "cachet_url": (getattr(etablissement, "cachet_url", None) if etablissement else None),
            "signature_url": (getattr(etablissement, "signature_url", None) if etablissement else None),
            "couleur": _couleur_ecole(db, etablissement_id),
        },
    }


# ============================================================================
# Rendu PDF : texte et images
# ============================================================================

def texte_pdf(s) -> str:
    """Texte dessinable avec les polices standard du PDF (Helvetica, Courier).

    Elles ne connaissent que le jeu WinAnsi (≈ cp1252) : tout autre caractère
    sort en carré noir, et les caractères invisibles (U+200B, retour à la
    ligne collé dans un nom…) faussent la mesure des largeurs. On garde donc
    les lettres accentuées du français, on remplace les espaces spéciales,
    on retire les invisibles, et on ramène à sa lettre de base ce qui peut
    l'être (« ā » -> « a ») ; le reste est retiré plutôt que noirci."""
    s = unicodedata.normalize("NFC", "" if s is None else str(s))
    sortie = []
    for ch in s:
        if ch.isspace():
            # U+00A0, U+202F, U+2009, tabulations, retours à la ligne…
            sortie.append(" ")
            continue
        if unicodedata.category(ch) in ("Cf", "Cc"):
            continue
        try:
            ch.encode("cp1252")
            sortie.append(ch)
            continue
        except UnicodeEncodeError:
            pass
        base = "".join(x for x in unicodedata.normalize("NFKD", ch) if not unicodedata.combining(x))
        try:
            base.encode("cp1252")
            sortie.append(base)
        except UnicodeEncodeError:
            pass
    return "".join(sortie)


# Images réduites, par (fichier, date de modification, taille) : un logo de
# 4000 px pesait plusieurs Mo dans CHAQUE reçu, et était relu à chaque fois.
_CACHE_IMAGES: dict = {}


def _image_reduite(chemin: str, largeur_pt: float, hauteur_pt: float):
    """ImageReader d'une copie réduite à ~3x la taille affichée (300 px au
    plus de côté) — net à l'impression, léger à télécharger. La
    transparence est conservée (logo détouré, cachet sur fond blanc)."""
    from PIL import Image
    from reportlab.lib.utils import ImageReader

    cote = int(min(300, 3 * max(largeur_pt, hauteur_pt)))
    cle = (chemin, os.path.getmtime(chemin), cote)
    lecteur = _CACHE_IMAGES.get(cle)
    if lecteur is not None:
        return lecteur
    with Image.open(chemin) as im:
        im.load()
        transparent = im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info
        image = im.convert("RGBA" if transparent else "RGB")
    image.thumbnail((cote, cote), Image.LANCZOS)
    lecteur = ImageReader(image)
    if len(_CACHE_IMAGES) >= 64:
        _CACHE_IMAGES.clear()
    _CACHE_IMAGES[cle] = lecteur
    return lecteur


# ============================================================================
# Rendu PDF (A5 portrait)
# ============================================================================

def _chemin_image(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    chemin = os.path.join(BACKEND_ROOT, url.lstrip("/").replace("/", os.sep))
    return chemin if os.path.isfile(chemin) else None


def _date_fr(valeur: Optional[str]) -> str:
    if not valeur:
        return "—"
    try:
        return datetime.strptime(valeur[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return valeur


def generer_pdf_recu(d: dict, url_qr: Optional[str] = None, documents_settings: Optional[dict] = None) -> bytes:
    import math

    from reportlab.graphics import renderPDF
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.pagesizes import A5
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.core.documents_settings import _bool, dessiner_filigrane

    settings = documents_settings or {}
    # Même URL que celle renvoyée à l'écran (charger_donnees_recu).
    url_qr = url_qr or d.get("url_verification") or url_verification(
        base_url_publique(), d["numero_recu"], d["code_verification"])
    L, H = A5
    M = 26  # marge
    W = L - 2 * M

    P = _hex_vers_rgb(d["etablissement"]["couleur"])
    P_FONCE = tuple(c * 0.72 for c in P)
    P_PALE = tuple(1 - (1 - c) * 0.08 for c in P)
    ENCRE = (0.06, 0.09, 0.16)
    GRIS = (0.39, 0.45, 0.55)
    BORD = (0.89, 0.91, 0.94)
    FOND = (0.973, 0.98, 0.988)
    VERT = (0.02, 0.59, 0.41)
    VERT_PALE = (0.925, 0.992, 0.961)
    VERT_BORD = (0.65, 0.95, 0.82)
    AMBRE = (0.85, 0.47, 0.02)
    ROUGE = (0.86, 0.15, 0.15)
    BLANC = (1, 1, 1)

    annule = (d.get("statut") or "VALIDE").upper() == "ANNULE"
    devise = d.get("devise") or "GNF"
    etab = d["etablissement"]
    fac = d["facture"]
    parent = d.get("parent") or {}

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    c.setTitle(f"Reçu {d['numero_recu']} — {etab['nom']}")
    c.setAuthor(etab["nom"])
    c.setSubject("Reçu de paiement")

    def tronquer(s, police: str, taille: float, largeur: float, force: bool = False) -> str:
        """Coupe avec « … » ce qui dépasse (`force` : même si ça tient — la
        suite du texte a été coupée en amont)."""
        s = texte_pdf(s)
        if not force and stringWidth(s, police, taille) <= largeur:
            return s
        while s and stringWidth(s.rstrip() + "…", police, taille) > largeur:
            s = s[:-1]
        return s.rstrip() + "…"

    def ajuster(s, police: str, taille: float, largeur: float, mini: float = 6.0):
        """Réduit la police puis tronque, pour qu'un texte d'une ligne ne
        déborde jamais."""
        s = texte_pdf(s)
        t = taille
        while t > mini and stringWidth(s, police, t) > largeur:
            t -= 0.25
        return tronquer(s, police, t, largeur), t

    def couper(s, police: str, taille: float, largeur: float, max_lignes: int) -> list:
        """Lignes d'au plus `largeur` ; au-delà de `max_lignes`, la dernière
        se termine par « … ». Un nom long garde ainsi une taille lisible au
        lieu d'être réduit à 6 pt."""
        lignes, courante = [], ""
        for mot in texte_pdf(s).split():
            essai = f"{courante} {mot}" if courante else mot
            if stringWidth(essai, police, taille) <= largeur:
                courante = essai
                continue
            if courante:
                lignes.append(courante)
            # Un « mot » plus large que la ligne (référence, e-mail) est
            # coupé au caractère.
            while len(mot) > 1 and stringWidth(mot, police, taille) > largeur:
                i = len(mot) - 1
                while i > 1 and stringWidth(mot[:i], police, taille) > largeur:
                    i -= 1
                lignes.append(mot[:i])
                mot = mot[i:]
            courante = mot
        if courante:
            lignes.append(courante)
        if len(lignes) > max_lignes:
            reste = " ".join(lignes[max_lignes - 1:])
            lignes = lignes[:max_lignes - 1] + [tronquer(reste, police, taille, largeur, force=True)]
        return lignes or [""]

    def texte(x, y, s, police="Helvetica", taille=8, couleur=ENCRE, align="left", largeur=None):
        s = texte_pdf(s)
        if largeur:
            s, taille = ajuster(s, police, taille, largeur)
        c.setFont(police, taille)
        c.setFillColorRGB(*couleur)
        if align == "center":
            c.drawCentredString(x, y, s)
        elif align == "right":
            c.drawRightString(x, y, s)
        else:
            c.drawString(x, y, s)

    def espace(s: str, n: int = 1) -> str:
        return (" " * n).join(list(s))

    # ════════════════════════════════════════════════════════════════════
    # 1. Tout est MESURÉ avant d'être dessiné : un nom d'école de 90
    #    caractères, un parent avec téléphone et un motif interminable
    #    doivent tenir sur la page sans jamais passer sous le bloc QR /
    #    signature, qui a une place fixe en bas.
    # ════════════════════════════════════════════════════════════════════
    MARGE_HAUT = 15   # rien de dessiné au-dessus : zone non imprimable
    PIED_TEXTE = 15.5  # idem en bas (base du texte du pied)
    BANDE_PIED = 28
    yb = BANDE_PIED + 22  # bas du bloc QR / signature
    hb = 78
    plafond_bas = yb + hb + 8

    # Bandeau : nom d'école sur une ligne de 14 à 11 pt ; au-delà, sur deux
    # lignes (13 pt -> 8 pt) ; en dernier recours, « … » sur la seconde.
    police_nom = "Helvetica-Bold"
    nom_ecole = texte_pdf((etab.get("nom") or "").upper()).strip() or "ÉTABLISSEMENT"
    t_nom = 14.0
    while t_nom > 11 and stringWidth(nom_ecole, police_nom, t_nom) > W:
        t_nom -= 0.5
    if stringWidth(nom_ecole, police_nom, t_nom) <= W:
        lignes_nom = [nom_ecole]
    else:
        t_nom = 13.0
        while t_nom > 8 and len(couper(nom_ecole, police_nom, t_nom, W, 99)) > 2:
            t_nom -= 0.5
        lignes_nom = couper(nom_ecole, police_nom, t_nom, W, 2)
    slogan = texte_pdf(etab.get("slogan")).strip() if _bool(settings.get("documents.entete_slogan", "true")) else ""
    adresse = texte_pdf(etab.get("adresse")).strip()
    tel = texte_pdf(etab.get("telephone")).strip()
    contacts = "  •  ".join(x for x in [f"Tél : {tel}" if tel else "", texte_pdf(etab.get("email")).strip()] if x)
    # (texte, police, taille, couleur, descente depuis la ligne précédente)
    lignes_entete = [
        (ligne, police_nom, t_nom, BLANC, (7 + 0.72 * t_nom) if i == 0 else 1.1 * t_nom)
        for i, ligne in enumerate(lignes_nom)
    ]
    if slogan:
        lignes_entete.append((slogan, "Helvetica-Oblique", 7.5, (0.88, 0.91, 0.98), 11))
    # Adresse puis « Tél • e-mail » sur deux lignes : sur une seule, l'e-mail
    # finissait coupé dès que l'adresse était un peu longue.
    if adresse:
        lignes_entete.append((adresse, "Helvetica", 7, (0.85, 0.89, 0.97), 10 if lignes_entete[-1][2] < 10 else 11))
    if contacts:
        lignes_entete.append((contacts, "Helvetica", 7, (0.85, 0.89, 0.97), 9.5 if lignes_entete[-1][2] < 10 else 11))

    # Cartes élève / paiement : chaque valeur sur 2 lignes au plus.
    gouttiere = 10
    lc = (W - gouttiere) / 2
    eleve = d["eleve"]
    lignes_eleve = [
        ("Nom complet", f"{eleve.get('prenom') or ''} {eleve.get('nom') or ''}".strip() or "—"),
        ("Matricule", eleve.get("matricule") or "—"),
        ("Classe", eleve.get("classe") or "—"),
    ]
    if parent.get("nom"):
        lignes_eleve.append(("Parent / tuteur", parent["nom"]))
    if parent.get("telephone"):
        lignes_eleve.append(("Téléphone parent", parent["telephone"]))
    lignes_paiement = [("Motif", fac.get("motif") or "—")]
    if d.get("tranche"):
        t = d["tranche"]
        lignes_paiement.append(("Tranche", f"{t['numero']} sur {t['total']}" + (" (dernière)" if t["numero"] == t["total"] else "")))
    lignes_paiement.append(("Mode de paiement", d.get("mode_paiement_libelle") or "—"))
    lignes_paiement.append(("Référence", d.get("reference_externe") or "—"))
    lignes_paiement.append(("Facture", fac.get("numero_facture") or "—"))

    # Montant en toutes lettres : jamais tronqué (c'est la mention qui fait
    # foi), d'où trois lignes possibles pour les très grands montants.
    phrase = d.get("somme_en_lettres") or somme_en_lettres(d.get("montant"), devise)
    lettres = f"Arrêté le présent reçu à la somme de : {phrase[:1].lower()}{phrase[1:]}."
    lignes_lettres = couper(lettres, "Helvetica-Oblique", 7.2, W - 24, 3)
    hm = 37 + 9 * len(lignes_lettres)

    def plan(niveau: int) -> dict:
        """Mise en page au niveau de compacité `niveau` (0 = normale ; 1 =
        logo et interlignes réduits ; 2 = valeurs des cartes sur 1 ligne)."""
        compact = niveau > 0
        p = {
            "taille_logo": 26 if compact else 34,
            "titre": (20, 14, 13) if compact else (24, 16, 15),
            "pas": 15.5 if compact else 17.5,
            "pas_suite": 9 if compact else 9.5,
        }
        max_lignes = 1 if niveau > 1 else 2
        p["haut_bandeau"] = MARGE_HAUT + p["taille_logo"] + 8 + sum(x[4] for x in lignes_entete) + 8
        largeur_valeur = lc - 18
        p["eleve"] = [(e, couper(v, "Helvetica-Bold", 8.2, largeur_valeur, max_lignes)) for e, v in lignes_eleve]
        p["paiement"] = [(e, couper(v, "Helvetica-Bold", 8.2, largeur_valeur, max_lignes)) for e, v in lignes_paiement]

        def hauteur(lignes):
            return 23 + sum(p["pas"] + p["pas_suite"] * (len(v) - 1) for _, v in lignes)
        # Les deux cartes ont la même hauteur : celle de la plus remplie.
        p["hc"] = max(hauteur(p["eleve"]), hauteur(p["paiement"]))
        # Base de la ligne « PAYÉ À n % » : doit rester au-dessus du bloc du bas.
        p["y_etat"] = H - p["haut_bandeau"] - sum(p["titre"]) - 12 - p["hc"] - 10 - hm - 9 - 40 - 15
        return p

    # Le niveau 1 sert aussi à faire une place à l'historique (titre + une
    # ligne) quand il y a des versements antérieurs ; le niveau 2 (valeurs
    # sur une ligne) seulement si le reçu ne tiendrait pas du tout.
    place_historique = 15 + 10.5 if d["anterieurs"] else 0
    for niveau in range(3):
        mise = plan(niveau)
        if mise["y_etat"] >= yb + hb and (niveau > 0 or mise["y_etat"] >= plafond_bas + place_historique):
            break
    taille_logo = mise["taille_logo"]
    haut_bandeau = mise["haut_bandeau"]
    hc = mise["hc"]

    # ════════════════════════════════════════════════════════════════════
    # 2. Dessin
    # ════════════════════════════════════════════════════════════════════

    # ── Bandeau d'en-tête ────────────────────────────────────────────────
    c.setFillColorRGB(*P_FONCE)
    c.rect(0, H - haut_bandeau, L, haut_bandeau, stroke=0, fill=1)
    # Grande forme oblique plus claire : profondeur, sans dégradé (impression).
    c.setFillColorRGB(*P)
    chemin = c.beginPath()
    chemin.moveTo(0, H)
    chemin.lineTo(L * 0.78, H)
    chemin.lineTo(L * 0.52, H - haut_bandeau)
    chemin.lineTo(0, H - haut_bandeau)
    chemin.close()
    c.drawPath(chemin, stroke=0, fill=1)
    # Filet clair sous le bandeau
    c.setFillColorRGB(*P_PALE)
    c.rect(0, H - haut_bandeau - 4, L, 4, stroke=0, fill=1)

    # Logo dans une pastille blanche, centré ; à défaut, les initiales de
    # l'école (le bandeau garde son équilibre).
    logo = _chemin_image(etab.get("logo_url")) if _bool(settings.get("documents.entete_logo", "true")) else None
    haut_pastille = taille_logo + 8
    y = H - MARGE_HAUT
    c.setFillColorRGB(*BLANC)
    c.roundRect(L / 2 - haut_pastille / 2, y - haut_pastille, haut_pastille, haut_pastille, 9, stroke=0, fill=1)
    logo_dessine = False
    if logo:
        try:
            c.drawImage(_image_reduite(logo, taille_logo, taille_logo), L / 2 - taille_logo / 2, y - 4 - taille_logo,
                        width=taille_logo, height=taille_logo, preserveAspectRatio=True, anchor="c", mask="auto")
            logo_dessine = True
        except Exception:
            logo_dessine = False
    if not logo_dessine:
        mots = [m for m in texte_pdf((etab.get("nom") or "").upper()).replace("-", " ").split() if m[:1].isalnum()]
        initiales = "".join(m[0] for m in mots[:3]) or "S"
        t_ini = (15 if len(initiales) < 3 else 12) * taille_logo / 34
        texte(L / 2, y - haut_pastille / 2 - 0.36 * t_ini, initiales, "Helvetica-Bold", t_ini, P_FONCE, "center")
    y -= haut_pastille
    for s, police, taille, couleur, descente in lignes_entete:
        y -= descente
        texte(L / 2, y, s, police, taille, couleur, "center", W)

    # ── Titre + numéro ───────────────────────────────────────────────────
    t1, t2, t3 = mise["titre"]
    y = H - haut_bandeau - t1
    texte(L / 2, y, espace("REÇU DE PAIEMENT"), "Helvetica-Bold", 13, ENCRE, "center")
    y -= t2
    numero = texte_pdf(f"N° {d['numero_recu']}")
    lg = min(W, stringWidth(numero, "Helvetica-Bold", 9) + 22)
    c.setFillColorRGB(*P_PALE)
    c.setStrokeColorRGB(*P)
    c.setLineWidth(0.8)
    c.roundRect(L / 2 - lg / 2, y - 5, lg, 16, 8, stroke=1, fill=1)
    texte(L / 2, y, numero, "Helvetica-Bold", 9, P_FONCE, "center", W - 22)
    y -= t3
    quand = _date_fr(d.get("date_paiement")) + (f" à {d['heure']}" if d.get("heure") else "")
    sous_titre = f"Payé le {quand}"
    if d.get("annee_libelle"):
        sous_titre += f"  •  Année scolaire {d['annee_libelle']}"
    texte(L / 2, y, sous_titre, "Helvetica", 7.5, GRIS, "center", W)

    # ── Deux cartes : élève / paiement ───────────────────────────────────
    y -= 12
    pas, pas_suite = mise["pas"], mise["pas_suite"]

    def carte(x, titre, lignes):
        c.setFillColorRGB(*FOND)
        c.setStrokeColorRGB(*BORD)
        c.setLineWidth(0.6)
        c.roundRect(x, y - hc, lc, hc, 7, stroke=1, fill=1)
        c.setFillColorRGB(*P)
        c.roundRect(x, y - hc, 3.2, hc, 1.6, stroke=0, fill=1)
        texte(x + 11, y - 13, espace(titre), "Helvetica-Bold", 6.8, P_FONCE)
        yy = y - 26
        for etiquette, valeurs in lignes:
            texte(x + 11, yy, etiquette, "Helvetica", 6.3, GRIS)
            for k, valeur in enumerate(valeurs):
                texte(x + 11, yy - 8.5 - pas_suite * k, valeur, "Helvetica-Bold", 8.2, ENCRE)
            yy -= pas + pas_suite * (len(valeurs) - 1)

    carte(M, "ÉLÈVE", mise["eleve"])
    carte(M + lc + gouttiere, "PAIEMENT", mise["paiement"])
    y -= hc + 10

    # ── Montant reçu ─────────────────────────────────────────────────────
    if annule:
        c.setFillColorRGB(1, 0.95, 0.95)
    else:
        c.setFillColorRGB(*VERT_PALE)
    c.setStrokeColorRGB(*((0.98, 0.7, 0.7) if annule else VERT_BORD))
    c.setLineWidth(0.8)
    c.roundRect(M, y - hm, W, hm, 8, stroke=1, fill=1)
    couleur_montant = ROUGE if annule else VERT
    texte(M + 12, y - 16, espace("MONTANT REÇU"), "Helvetica-Bold", 7, couleur_montant)
    texte(M + 12, y - 27, "Ce versement", "Helvetica", 6.8, GRIS)
    texte(L - M - 12, y - 25, f"{formater_montant(d['montant'])} {devise}", "Helvetica-Bold", 20, couleur_montant, "right", W * 0.62)
    yy = y - 38
    for ligne in lignes_lettres:
        texte(M + 12, yy, ligne, "Helvetica-Oblique", 7.2, ENCRE)
        yy -= 9
    y -= hm + 9

    # ── Situation de la facture ──────────────────────────────────────────
    total = fac.get("montant_total") or 0
    paye = fac.get("paye_a_date") or 0
    reste = fac.get("reste_a_date") or 0
    if reste < 0.005:
        reste = 0
    tuiles = [
        ("TOTAL FACTURE", f"{formater_montant(total)} {devise}", ENCRE),
        ("TOTAL PAYÉ", f"{formater_montant(paye)} {devise}", VERT),
        ("RESTE À PAYER", f"{formater_montant(reste)} {devise}", AMBRE if reste > 0 else VERT),
    ]
    lt = (W - 2 * 8) / 3
    for i, (etq, val, coul) in enumerate(tuiles):
        x = M + i * (lt + 8)
        c.setFillColorRGB(*BLANC)
        c.setStrokeColorRGB(*BORD)
        c.setLineWidth(0.6)
        c.roundRect(x, y - 31, lt, 31, 6, stroke=1, fill=1)
        texte(x + lt / 2, y - 11, etq, "Helvetica-Bold", 5.9, GRIS, "center")
        texte(x + lt / 2, y - 23, val, "Helvetica-Bold", 9, coul, "center", lt - 8)
    y -= 40
    # Barre de progression
    ratio = 0 if total <= 0 else max(0.0, min(1.0, paye / total))
    c.setFillColorRGB(*BORD)
    c.roundRect(M, y - 5, W, 5, 2.5, stroke=0, fill=1)
    if ratio > 0:
        c.setFillColorRGB(*(VERT if reste <= 0 else P))
        c.roundRect(M, y - 5, max(5, W * ratio), 5, 2.5, stroke=0, fill=1)
    y -= 15
    # Tant qu'il reste quelque chose, jamais « 100 % » : 99,6 % arrondi à
    # 100 % à côté d'un reste à payer de 2 000 GNF, c'est une contradiction
    # sur le même papier.
    etat = "FACTURE SOLDÉE" if reste <= 0 else f"PAYÉ À {min(99, math.floor(ratio * 100))} %"
    texte(M, y, etat, "Helvetica-Bold", 6.8, VERT if reste <= 0 else P_FONCE)
    if d["anterieurs"]:
        texte(L - M, y, f"Dont {formater_montant(fac.get('deja_paye'))} {devise} versés auparavant",
              "Helvetica", 6.8, GRIS, "right", W * 0.62)

    # ── Versements précédents (autant de lignes que la place le permet) ──
    # Au moins le titre et une ligne, sinon rien : « Dont … versés
    # auparavant » ci-dessus le dit déjà. Les plus anciens qui ne tiennent
    # pas sont comptés sur la ligne du titre (pas de ligne de plus).
    if d["anterieurs"]:
        if y - 15 - 10.5 >= plafond_bas:
            y -= 12
            texte(M, y, espace("VERSEMENTS PRÉCÉDENTS"), "Helvetica-Bold", 6.3, GRIS)
            n = len(d["anterieurs"])
            nb = max(1, min(3, n, int((y - 3 - plafond_bas) // 10.5)))
            if n > nb:
                texte(L - M, y, f"+ {n - nb} plus ancien{'s' if n - nb > 1 else ''}", "Helvetica-Oblique", 6.3, GRIS, "right")
            y -= 3
            visibles = d["anterieurs"][-nb:]
            for p in visibles:
                y -= 10.5
                c.setStrokeColorRGB(*BORD)
                c.setLineWidth(0.4)
                c.line(M, y + 8, L - M, y + 8)
                texte(M, y, _date_fr(p["date_paiement"]), "Helvetica", 7, ENCRE)
                texte(M + 58, y, f"Reçu {p['numero_recu']}", "Helvetica", 7, GRIS, largeur=W * 0.42)
                texte(M + W * 0.66, y, p["mode_paiement"], "Helvetica", 7, GRIS, largeur=W * 0.16)
                texte(L - M, y, f"{formater_montant(p['montant'])} {devise}", "Helvetica-Bold", 7, ENCRE, "right", W * 0.17)
    elif y - plafond_bas > 40:
        texte(L / 2, (y + plafond_bas) / 2 - 3, "Merci pour votre confiance.", "Helvetica-Oblique", 8, GRIS, "center")

    # ── Bas : QR de vérification + signature ─────────────────────────────
    taille_qr = 62
    qr = QrCodeWidget(url_qr, barLevel="M")
    x0, y0, x1, y1 = qr.getBounds()
    dessin = Drawing(taille_qr, taille_qr, transform=[taille_qr / (x1 - x0), 0, 0, taille_qr / (y1 - y0), 0, 0])
    dessin.add(qr)
    c.setFillColorRGB(*BLANC)
    c.setStrokeColorRGB(*BORD)
    c.setLineWidth(0.6)
    c.roundRect(M, yb, taille_qr + 8, taille_qr + 8, 6, stroke=1, fill=1)
    renderPDF.draw(dessin, c, M + 4, yb + 4)
    xq = M + taille_qr + 16
    texte(xq, yb + 56, "Reçu vérifiable", "Helvetica-Bold", 8.5, ENCRE)
    texte(xq, yb + 46, "Scannez le QR code pour", "Helvetica", 6.8, GRIS)
    texte(xq, yb + 37, "confirmer son authenticité.", "Helvetica", 6.8, GRIS)
    texte(xq, yb + 24, "Code de vérification", "Helvetica", 6.3, GRIS)
    texte(xq, yb + 13, d["code_verification"], "Courier-Bold", 9.5, P_FONCE)

    # Signature / cachet
    xs = L - M - 128
    texte(xs + 64, yb + hb - 18, "Le Comptable / La Direction", "Helvetica-Bold", 7.5, ENCRE, "center")
    cachet = _chemin_image(etab.get("cachet_url"))
    signature = _chemin_image(etab.get("signature_url"))
    for img, dx in ((cachet, 8), (signature, 64)):
        if img:
            try:
                c.drawImage(_image_reduite(img, 56, 46), xs + dx, yb + 10, width=56, height=46,
                            preserveAspectRatio=True, anchor="c", mask="auto")
            except Exception:
                pass
    c.setStrokeColorRGB(*GRIS)
    c.setLineWidth(0.5)
    c.line(xs + 8, yb + 8, xs + 120, yb + 8)
    texte(xs + 64, yb, "Cachet et signature", "Helvetica", 6.3, GRIS, "center")

    # ── Pied de page ─────────────────────────────────────────────────────
    texte(L / 2, BANDE_PIED + 3 + 8, "Toute rature ou surcharge annule ce reçu. Conservez-le précieusement.",
          "Helvetica-Oblique", 6.3, GRIS, "center")
    c.setFillColorRGB(*P_FONCE)
    c.rect(0, 0, L, BANDE_PIED, stroke=0, fill=1)
    c.setFillColorRGB(*P)
    c.rect(0, BANDE_PIED, L, 3, stroke=0, fill=1)
    # Numéro et date d'édition d'abord : c'est ce qui sert ; le nom de
    # l'école (déjà dans l'en-tête) se tronque s'il manque de place.
    maintenant = datetime.now().strftime("%d/%m/%Y à %H:%M")
    debut = texte_pdf(f"Reçu N° {d['numero_recu']}  •  Édité le {maintenant}")
    reste_pied = W - stringWidth(debut + "  •  ", "Helvetica", 6.3)
    pied = debut
    if reste_pied > 40:
        pied += "  •  " + tronquer(etab.get("nom") or "", "Helvetica", 6.3, reste_pied)
    texte(L / 2, PIED_TEXTE, pied, "Helvetica", 6.3, (0.85, 0.89, 0.97), "center", W)

    # ── Annulation : tampon bien visible ─────────────────────────────────
    if annule:
        c.saveState()
        c.setFillColorRGB(*ROUGE, 0.16)
        c.setStrokeColorRGB(*ROUGE, 0.55)
        c.translate(L / 2, H / 2)
        c.rotate(28)
        c.setLineWidth(3)
        c.roundRect(-150, -32, 300, 64, 10, stroke=1, fill=0)
        c.setFont("Helvetica-Bold", 46)
        c.setFillColorRGB(*ROUGE, 0.55)
        c.drawCentredString(0, -16, "ANNULÉ")
        c.restoreState()

    if _bool(settings.get("documents.filigrane_recus", "false")):
        dessiner_filigrane(c, L, H, settings)

    c.showPage()
    c.save()
    return buf.getvalue()
