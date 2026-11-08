"""
Récapitulatif de plusieurs encaissements d'un même élève, en PDF.

CE QUE C'EST, ET CE QUE CE N'EST PAS
Un RÉCAPITULATIF, pas une facture. Il rappelle des reçus déjà émis et en fait
la somme ; il ne crée aucune pièce comptable nouvelle, ne porte pas de numéro
propre et n'engendre aucune écriture. C'est un choix délibéré : inventer une
pièce pour un document d'impression fausserait les livres, alors que le besoin
est simplement de remettre à une famille un seul feuillet au lieu de cinq.

Chaque ligne cite son numéro de reçu. La vérification par QR code reste donc
possible — sur les reçus individuels, qui eux sont les vraies pièces. On ne
met pas de QR sur le récapitulatif : il certifierait un document qui n'existe
pas dans les registres.

Le style suit le reçu de `recu_paiement.py` : même bandeau, mêmes couleurs,
mêmes outils de formatage. Les deux documents partent dans la même enveloppe,
ils doivent se ressembler.
"""
import io
from typing import Optional

from app.core.recu_paiement import (
    _hex_vers_rgb,
    formater_montant,
    libelle_mode,
    montant_en_lettres,
    texte_pdf,
)


def generer_pdf_recapitulatif(d: dict, documents_settings: Optional[dict] = None) -> bytes:
    """
    `d` attend :
      etablissement : {nom, adresse, telephone, couleur}
      eleve         : {nom_complet, matricule, classe}
      annee         : libellé de l'année scolaire
      devise        : "GNF"
      paiements     : [{date, numero_recu, motif, mode_paiement, montant}]
    """
    from reportlab.lib.pagesizes import A5
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.core.documents_settings import dessiner_filigrane

    settings = documents_settings or {}
    etab = d["etablissement"]
    eleve = d["eleve"]
    paiements = d["paiements"]
    devise = d.get("devise") or "GNF"

    L, H = A5
    M = 26
    W = L - 2 * M

    P = _hex_vers_rgb(etab.get("couleur"))
    P_FONCE = tuple(c * 0.72 for c in P)
    ENCRE = (0.06, 0.09, 0.16)
    GRIS = (0.39, 0.45, 0.55)
    BORD = (0.89, 0.91, 0.94)
    FOND = (0.973, 0.98, 0.988)
    VERT = (0.02, 0.59, 0.41)
    VERT_PALE = (0.925, 0.992, 0.961)
    BLANC = (1, 1, 1)

    total = sum(float(p.get("montant") or 0) for p in paiements)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    c.setTitle(f"Recapitulatif — {eleve['nom_complet']}")
    c.setAuthor(etab["nom"])
    c.setSubject("Récapitulatif de paiements")

    # ── Bandeau d'en-tête ────────────────────────────────────────────────
    haut = H
    c.setFillColorRGB(*P_FONCE)
    c.rect(0, haut - 64, L, 64, fill=1, stroke=0)
    c.setFillColorRGB(*BLANC)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(L / 2, haut - 28, texte_pdf(etab["nom"]).upper())
    c.setFont("Helvetica", 7.5)
    sous = " • ".join(x for x in [etab.get("adresse"), etab.get("telephone")] if x)
    if sous:
        c.drawCentredString(L / 2, haut - 41, texte_pdf(sous))
    c.setFont("Helvetica", 7)
    c.drawCentredString(L / 2, haut - 54, texte_pdf(f"Année scolaire {d.get('annee') or '—'}"))

    y = haut - 86

    c.setFillColorRGB(*ENCRE)
    c.setFont("Helvetica-Bold", 12.5)
    c.drawCentredString(L / 2, y, "RÉCAPITULATIF DE PAIEMENTS")
    y -= 12
    c.setFillColorRGB(*GRIS)
    c.setFont("Helvetica-Oblique", 7)
    # Dit d'emblée ce que le document est : personne ne doit le confondre avec
    # un reçu, ni le présenter comme tel.
    c.drawCentredString(L / 2, y, texte_pdf(
        "Document récapitulatif — ne remplace pas les reçus individuels cités ci-dessous."))
    y -= 20

    # ── Identité de l'élève ──────────────────────────────────────────────
    hauteur_bloc = 46
    c.setFillColorRGB(*FOND)
    c.setStrokeColorRGB(*BORD)
    c.roundRect(M, y - hauteur_bloc, W, hauteur_bloc, 5, fill=1, stroke=1)
    c.setFillColorRGB(*GRIS)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(M + 10, y - 14, "ÉLÈVE")
    c.setFillColorRGB(*ENCRE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(M + 10, y - 28, texte_pdf(eleve["nom_complet"]))
    c.setFillColorRGB(*GRIS)
    c.setFont("Helvetica", 7.5)
    détail = " • ".join(x for x in [eleve.get("matricule"), eleve.get("classe")] if x)
    c.drawString(M + 10, y - 39, texte_pdf(détail))
    y -= hauteur_bloc + 16

    # ── Tableau des versements ───────────────────────────────────────────
    # Colonnes calées en dur : quatre champs courts et un montant aligné à
    # droite. Un tableau auto-dimensionné serait plus savant et moins lisible
    # sur une page A5.
    x_date, x_recu, x_motif, x_mode = M + 8, M + 56, M + 136, M + 236
    x_montant_fin = M + W - 8

    c.setFillColorRGB(*P)
    c.rect(M, y - 15, W, 15, fill=1, stroke=0)
    c.setFillColorRGB(*BLANC)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(x_date, y - 10.5, "DATE")
    c.drawString(x_recu, y - 10.5, "N° REÇU")
    c.drawString(x_motif, y - 10.5, "TARIF")
    c.drawString(x_mode, y - 10.5, "MODE")
    c.drawRightString(x_montant_fin, y - 10.5, "MONTANT")
    y -= 15

    def tronquer(texte: str, largeur: float, police="Helvetica", taille=7.5) -> str:
        texte = texte_pdf(texte or "—")
        if stringWidth(texte, police, taille) <= largeur:
            return texte
        while texte and stringWidth(texte + "…", police, taille) > largeur:
            texte = texte[:-1]
        return texte + "…"

    for i, p in enumerate(paiements):
        if y < 120:          # place réservée au total et au pied de page
            c.showPage()
            y = H - M
        if i % 2 == 0:
            c.setFillColorRGB(*FOND)
            c.rect(M, y - 14, W, 14, fill=1, stroke=0)
        c.setFillColorRGB(*ENCRE)
        c.setFont("Helvetica", 7.5)
        c.drawString(x_date, y - 10, tronquer(p.get("date"), x_recu - x_date - 6))
        c.drawString(x_recu, y - 10, tronquer(p.get("numero_recu"), x_motif - x_recu - 6))
        c.drawString(x_motif, y - 10, tronquer(p.get("motif"), x_mode - x_motif - 6))
        c.drawString(x_mode, y - 10, tronquer(libelle_mode(p.get("mode_paiement")), 56))
        c.setFont("Helvetica-Bold", 7.5)
        c.drawRightString(x_montant_fin, y - 10, f"{formater_montant(p.get('montant'))} {devise}")
        y -= 14

    c.setStrokeColorRGB(*BORD)
    c.line(M, y, M + W, y)
    y -= 22

    # ── Total ────────────────────────────────────────────────────────────
    c.setFillColorRGB(*VERT_PALE)
    c.setStrokeColorRGB(*VERT)
    c.roundRect(M, y - 34, W, 34, 5, fill=1, stroke=1)
    c.setFillColorRGB(*VERT)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(M + 10, y - 13, texte_pdf(f"TOTAL DE {len(paiements)} VERSEMENT(S)"))
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(M + W - 10, y - 15, f"{formater_montant(total)} {devise}")
    c.setFillColorRGB(*GRIS)
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawString(M + 10, y - 27, texte_pdf(
        f"Soit : {montant_en_lettres(total)} {_nom_devise(devise)}."))
    y -= 50

    # ── Signature ────────────────────────────────────────────────────────
    c.setFillColorRGB(*ENCRE)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawRightString(M + W, y, "Le Comptable / La Direction")
    c.setStrokeColorRGB(*BORD)
    c.line(M + W - 130, y - 26, M + W, y - 26)
    c.setFillColorRGB(*GRIS)
    c.setFont("Helvetica", 6.5)
    c.drawRightString(M + W, y - 34, "Cachet et signature")

    # ── Pied de page ─────────────────────────────────────────────────────
    c.setFillColorRGB(*P_FONCE)
    c.rect(0, 0, L, 18, fill=1, stroke=0)
    c.setFillColorRGB(*BLANC)
    c.setFont("Helvetica", 6)
    c.drawCentredString(L / 2, 6.5, texte_pdf(
        f"Récapitulatif de {len(paiements)} versement(s) • {eleve['nom_complet']} • {etab['nom']}"))

    try:
        dessiner_filigrane(c, L, H, settings)
    except Exception:
        # Le filigrane est décoratif : son absence ne doit jamais empêcher
        # l'école de sortir le document.
        pass

    c.showPage()
    c.save()
    return buf.getvalue()


def _nom_devise(code: str) -> str:
    from app.core.recu_paiement import _NOMS_DEVISES
    return _NOMS_DEVISES.get((code or "GNF").upper(), code or "")
