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
from datetime import date, datetime
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
    from app.core.auth import SECRET_KEY
    return (SECRET_KEY or "").encode("utf-8")


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


def code_est_valide(paiement: Paiement, code: str) -> bool:
    attendu = code_verification(paiement)
    propre = (code or "").strip().upper().replace(" ", "")
    if "-" not in propre and len(propre) == 12:
        propre = f"{propre[0:4]}-{propre[4:8]}-{propre[8:12]}"
    return hmac.compare_digest(attendu, propre)


def base_url_publique(request=None) -> str:
    """Adresse du site (frontend) vers laquelle pointe le QR code.

    1. FRONTEND_PUBLIC_URL si l'hébergeur la fournit ;
    2. sinon l'origine du site qui a demandé le reçu, seulement si elle fait
       partie des origines autorisées (CORS) — pas d'adresse arbitraire ;
    3. sinon la première origine autorisée qui n'est pas locale."""
    explicite = (os.getenv("FRONTEND_PUBLIC_URL") or "").strip().rstrip("/")
    if explicite:
        return explicite
    autorisees = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
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

def formater_montant(valeur) -> str:
    """80000 -> « 80 000 » (espace des milliers, à la française)."""
    try:
        n = round(float(valeur or 0))
    except (TypeError, ValueError):
        n = 0
    return f"{n:,}".replace(",", " ")


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


def _hex_vers_rgb(valeur: str):
    v = (valeur or "").strip().lstrip("#")
    if len(v) == 3:
        v = "".join(ch * 2 for ch in v)
    try:
        return tuple(int(v[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except (ValueError, IndexError):
        return _hex_vers_rgb(COULEUR_DEFAUT)


def _couleur_ecole(db: Session, etablissement_id: int) -> str:
    """Couleur principale choisie par l'école (Paramètres > Apparence).
    Une couleur trop claire rendrait le bandeau illisible : repli."""
    p = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.cle == "theme.primary",
    ).first()
    couleur = (p.valeur if p and p.valeur else COULEUR_DEFAUT).strip()
    r, g, b = _hex_vers_rgb(couleur)
    if 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62:
        return COULEUR_DEFAUT
    return couleur if couleur.startswith("#") else f"#{couleur}"


# ============================================================================
# Données du reçu
# ============================================================================

def charger_donnees_recu(db: Session, paiement, facture, inscription, eleve, classe) -> dict:
    """Tout ce que le reçu affiche, calculé une seule fois. Sert à l'écran
    (JSON) comme au PDF : les deux ne peuvent plus diverger."""
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

    valides = (
        db.query(Paiement)
        .filter(Paiement.facture_id == facture.facture_id, Paiement.statut == "VALIDE")
        .order_by(Paiement.date_paiement.asc(), Paiement.paiement_id.asc())
        .all()
    )
    # Versements faits AVANT celui-ci : le reçu les retrace, et « déjà payé »
    # se calcule sur eux — pas sur le total d'aujourd'hui, qui inclurait des
    # versements postérieurs quand on réimprime un ancien reçu.
    anterieurs = [
        p for p in valides
        if p.paiement_id != paiement.paiement_id and (
            (p.date_paiement or date.min, p.paiement_id) < (paiement.date_paiement or date.min, paiement.paiement_id)
        )
    ]
    deja_paye = sum(float(p.montant or 0) for p in anterieurs)
    montant = float(paiement.montant or 0)
    total = float(facture.montant_net or facture.montant_total or 0)
    paye_a_date = deja_paye + (montant if paiement.statut == "VALIDE" else 0)
    reste_a_date = max(0.0, total - paye_a_date)

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

    emis = paiement.created_date if isinstance(paiement.created_date, datetime) else None
    code = code_verification(paiement)

    return {
        "paiement_id": paiement.paiement_id,
        "numero_recu": paiement.numero_recu,
        "statut": paiement.statut or "VALIDE",
        "motif_annulation": paiement.motif_annulation,
        "date_paiement": str(paiement.date_paiement) if paiement.date_paiement else None,
        "heure": emis.strftime("%H:%M") if emis else None,
        "montant": montant,
        "montant_en_lettres": montant_en_lettres(montant),
        "devise": paiement.devise or "GNF",
        "mode_paiement": paiement.mode_paiement,
        "mode_paiement_libelle": libelle_mode(paiement.mode_paiement),
        "reference_externe": paiement.reference_externe,
        "tranche": tranche,
        "code_verification": code,
        "facture": {
            "facture_id": facture.facture_id,
            "numero_facture": facture.numero_facture,
            "motif": motif,
            "montant_total": total,
            "deja_paye": deja_paye,
            "paye_a_date": paye_a_date,
            "reste_a_date": reste_a_date,
            # Situation ACTUELLE de la facture (peut avoir évolué depuis).
            "montant_paye": float(facture.montant_paye or 0),
            "montant_restant": float(facture.montant_restant or 0),
            "statut": facture.statut,
        },
        "anterieurs": [
            {
                "numero_recu": p.numero_recu,
                "date_paiement": str(p.date_paiement) if p.date_paiement else None,
                "montant": float(p.montant or 0),
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


def generer_pdf_recu(d: dict, url_qr: str, documents_settings: Optional[dict] = None) -> bytes:
    from reportlab.graphics import renderPDF
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.core.documents_settings import _bool, dessiner_filigrane

    settings = documents_settings or {}
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

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    c.setTitle(f"Reçu {d['numero_recu']} — {etab['nom']}")
    c.setAuthor(etab["nom"])
    c.setSubject("Reçu de paiement")

    def ajuster(texte: str, police: str, taille: float, largeur: float, mini: float = 6.0):
        """Réduit la police puis tronque, pour qu'un nom long ne déborde jamais."""
        texte = texte or ""
        t = taille
        while t > mini and stringWidth(texte, police, t) > largeur:
            t -= 0.25
        if stringWidth(texte, police, t) > largeur:
            while texte and stringWidth(texte + "…", police, t) > largeur:
                texte = texte[:-1]
            texte += "…"
        return texte, t

    def texte(x, y, s, police="Helvetica", taille=8, couleur=ENCRE, align="left", largeur=None):
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

    # ── Bandeau d'en-tête ────────────────────────────────────────────────
    # Hauteur calculée sur le contenu réel (logo, slogan, contacts) : jamais
    # de bandeau à moitié vide.
    logo = _chemin_image(etab.get("logo_url")) if _bool(settings.get("documents.entete_logo", "true")) else None
    taille_logo = 34
    contacts = "  •  ".join(x for x in [etab.get("adresse"), f"Tél : {etab['telephone']}" if etab.get("telephone") else "", etab.get("email")] if x)
    haut_bandeau = 12 + (taille_logo + 17) + 11 + (10 if etab.get("slogan") else 0) + (10 if contacts else 0) + 6
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
    y = H - 12
    c.setFillColorRGB(*BLANC)
    c.roundRect(L / 2 - taille_logo / 2 - 4, y - taille_logo - 4, taille_logo + 8, taille_logo + 8, 9, stroke=0, fill=1)
    logo_dessine = False
    if logo:
        try:
            c.drawImage(ImageReader(logo), L / 2 - taille_logo / 2, y - taille_logo, width=taille_logo, height=taille_logo,
                        preserveAspectRatio=True, anchor="c", mask="auto")
            logo_dessine = True
        except Exception:
            logo_dessine = False
    if not logo_dessine:
        mots = [m for m in (etab["nom"] or "").replace("-", " ").split() if m[:1].isalnum()]
        initiales = "".join(m[0] for m in mots[:3]).upper() or "S"
        texte(L / 2, y - taille_logo / 2 - 5, initiales, "Helvetica-Bold", 15 if len(initiales) < 3 else 12, P_FONCE, "center")
    y -= taille_logo + 17
    texte(L / 2, y, etab["nom"].upper(), "Helvetica-Bold", 14, BLANC, "center", W)
    y -= 11
    if etab.get("slogan"):
        texte(L / 2, y, etab["slogan"], "Helvetica-Oblique", 7.5, (0.88, 0.91, 0.98), "center", W)
        y -= 10
    if contacts:
        texte(L / 2, y, contacts, "Helvetica", 7, (0.85, 0.89, 0.97), "center", W)

    # ── Titre + numéro ───────────────────────────────────────────────────
    y = H - haut_bandeau - 24
    texte(L / 2, y, espace("REÇU DE PAIEMENT"), "Helvetica-Bold", 13, ENCRE, "center")
    y -= 16
    numero = f"N° {d['numero_recu']}"
    lg = stringWidth(numero, "Helvetica-Bold", 9) + 22
    c.setFillColorRGB(*P_PALE)
    c.setStrokeColorRGB(*P)
    c.setLineWidth(0.8)
    c.roundRect(L / 2 - lg / 2, y - 5, lg, 16, 8, stroke=1, fill=1)
    texte(L / 2, y, numero, "Helvetica-Bold", 9, P_FONCE, "center")
    y -= 15
    quand = _date_fr(d.get("date_paiement")) + (f" à {d['heure']}" if d.get("heure") else "")
    sous_titre = f"Payé le {quand}"
    if d.get("annee_libelle"):
        sous_titre += f"  •  Année scolaire {d['annee_libelle']}"
    texte(L / 2, y, sous_titre, "Helvetica", 7.5, GRIS, "center", W)

    # ── Deux cartes : élève / paiement ───────────────────────────────────
    y -= 12
    gouttiere = 10
    lc = (W - gouttiere) / 2
    eleve = d["eleve"]
    lignes_eleve = [
        ("Nom complet", f"{eleve.get('prenom') or ''} {eleve.get('nom') or ''}".strip()),
        ("Matricule", eleve.get("matricule") or "—"),
        ("Classe", eleve.get("classe") or "—"),
    ]
    if d["parent"].get("nom"):
        tel = f" — {d['parent']['telephone']}" if d["parent"].get("telephone") else ""
        lignes_eleve.append(("Parent / tuteur", d["parent"]["nom"] + tel))
    lignes_paiement = [("Motif", fac.get("motif") or "—")]
    if d.get("tranche"):
        t = d["tranche"]
        lignes_paiement.append(("Tranche", f"{t['numero']} sur {t['total']}" + (" (dernière)" if t["numero"] == t["total"] else "")))
    lignes_paiement.append(("Mode de paiement", d.get("mode_paiement_libelle") or "—"))
    lignes_paiement.append(("Référence", d.get("reference_externe") or "—"))
    lignes_paiement.append(("Facture", fac.get("numero_facture") or "—"))
    n_lignes = max(len(lignes_eleve), len(lignes_paiement))
    hc = 20 + n_lignes * 17.5

    def carte(x, titre, lignes):
        c.setFillColorRGB(*FOND)
        c.setStrokeColorRGB(*BORD)
        c.setLineWidth(0.6)
        c.roundRect(x, y - hc, lc, hc, 7, stroke=1, fill=1)
        c.setFillColorRGB(*P)
        c.roundRect(x, y - hc, 3.2, hc, 1.6, stroke=0, fill=1)
        texte(x + 11, y - 13, espace(titre), "Helvetica-Bold", 6.8, P_FONCE)
        yy = y - 26
        for etiquette, valeur in lignes:
            texte(x + 11, yy, etiquette, "Helvetica", 6.3, GRIS)
            texte(x + 11, yy - 8.5, valeur, "Helvetica-Bold", 8.2, ENCRE, largeur=lc - 18)
            yy -= 17.5

    carte(M, "ÉLÈVE", lignes_eleve)
    carte(M + lc + gouttiere, "PAIEMENT", lignes_paiement)
    y -= hc + 10

    # ── Montant reçu ─────────────────────────────────────────────────────
    lettres = f"Arrêté le présent reçu à la somme de : {montant_en_lettres(d['montant'])} francs guinéens."
    if devise.upper() != "GNF":
        lettres = f"Arrêté le présent reçu à la somme de : {montant_en_lettres(d['montant'])} ({devise})."
    lettres = lettres[0].upper() + lettres[1:]
    lignes_lettres = simpleSplit(lettres, "Helvetica-Oblique", 7.2, W - 24)[:2]
    hm = 37 + 9 * len(lignes_lettres)
    c.setFillColorRGB(*(ROUGE if annule else VERT_PALE))
    if annule:
        c.setFillColorRGB(1, 0.95, 0.95)
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
    etat = "FACTURE SOLDÉE" if reste <= 0 else f"PAYÉ À {round(ratio * 100)} %"
    texte(M, y, etat, "Helvetica-Bold", 6.8, VERT if reste <= 0 else P_FONCE)
    if d["anterieurs"]:
        texte(L - M, y, f"Dont {formater_montant(fac.get('deja_paye'))} {devise} versés auparavant",
              "Helvetica", 6.8, GRIS, "right")

    # Bloc du bas (QR + signature) : position fixe, le reste doit tenir au-dessus.
    pied = 34
    hb = 78
    yb = pied + 14  # bas du bloc
    plafond_bas = yb + hb + 8

    # ── Versements précédents (autant de lignes que la place le permet) ──
    if d["anterieurs"]:
        y -= 12
        texte(M, y, espace("VERSEMENTS PRÉCÉDENTS"), "Helvetica-Bold", 6.3, GRIS)
        y -= 3
        place = int((y - plafond_bas - 9) // 10.5)  # 9 pt gardés pour la ligne « + n »
        nb = max(0, min(3, place, len(d["anterieurs"])))
        visibles = d["anterieurs"][-nb:] if nb else []
        for p in visibles:
            y -= 10.5
            c.setStrokeColorRGB(*BORD)
            c.setLineWidth(0.4)
            c.line(M, y + 8, L - M, y + 8)
            texte(M, y, _date_fr(p["date_paiement"]), "Helvetica", 7, ENCRE)
            texte(M + 58, y, f"Reçu {p['numero_recu']}", "Helvetica", 7, GRIS, largeur=W * 0.42)
            texte(M + W * 0.66, y, p["mode_paiement"], "Helvetica", 7, GRIS, largeur=W * 0.16)
            texte(L - M, y, f"{formater_montant(p['montant'])} {devise}", "Helvetica-Bold", 7, ENCRE, "right")
        if len(d["anterieurs"]) > len(visibles):
            y -= 9
            texte(M, y, f"+ {len(d['anterieurs']) - len(visibles)} versement(s) plus ancien(s)", "Helvetica-Oblique", 6.3, GRIS)
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
                c.drawImage(ImageReader(img), xs + dx, yb + 10, width=56, height=46, preserveAspectRatio=True, anchor="c", mask="auto")
            except Exception:
                pass
    c.setStrokeColorRGB(*GRIS)
    c.setLineWidth(0.5)
    c.line(xs + 8, yb + 8, xs + 120, yb + 8)
    texte(xs + 64, yb, "Cachet et signature", "Helvetica", 6.3, GRIS, "center")

    # ── Pied de page ─────────────────────────────────────────────────────
    texte(L / 2, pied + 4, "Toute rature ou surcharge annule ce reçu. Conservez-le précieusement.", "Helvetica-Oblique", 6.3, GRIS, "center")
    c.setFillColorRGB(*P_FONCE)
    c.rect(0, 0, L, pied - 8, stroke=0, fill=1)
    c.setFillColorRGB(*P)
    c.rect(0, pied - 8, L, 3, stroke=0, fill=1)
    maintenant = datetime.now().strftime("%d/%m/%Y à %H:%M")
    texte(L / 2, 10, f"{etab['nom']}  •  Reçu {d['numero_recu']}  •  Édité le {maintenant}  •  SmartSchool",
          "Helvetica", 6.3, (0.85, 0.89, 0.97), "center", W)

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
