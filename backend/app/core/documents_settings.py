"""
SMARTSCHOOL — Configuration centralisée des documents PDF
(bulletins, certificats, reçus, filigranes)
"""
import math
from sqlalchemy.orm import Session
from app.models.academique import ParametreEtablissement


# ============================================================================
# DEFAULTS
# ============================================================================
DOCUMENTS_DEFAULTS = {
    # Template bulletin
    "documents.template_bulletin": "classique",
    # En-tête
    "documents.entete_logo": "true",
    "documents.entete_slogan": "true",
    "documents.entete_republique": "true",
    # Champs bulletin
    "documents.champ_rang": "true",
    "documents.champ_moyenne_classe": "true",
    "documents.champ_min_max": "true",
    "documents.champ_graphique": "false",
    "documents.champ_photo": "false",
    # Seuils appréciations
    "documents.seuil_tres_bien": "16",
    "documents.seuil_bien": "14",
    "documents.seuil_assez_bien": "12",
    "documents.seuil_passable": "10",
    # Signatures
    "documents.signature_directeur": "true",
    "documents.signature_prof": "true",
    "documents.signature_parent": "true",
    # Filigrane
    "documents.filigrane_actif": "false",
    "documents.filigrane_texte": "CONFIDENTIEL",
    "documents.filigrane_opacite": "0.08",
    "documents.filigrane_bulletins": "true",
    "documents.filigrane_certificats": "true",
    "documents.filigrane_recus": "false",
}


def get_documents_settings(db: Session, etablissement_id: int) -> dict:
    """Charge les paramètres DOCUMENTS depuis ss_parametres, fusionnés avec les défauts."""
    settings = dict(DOCUMENTS_DEFAULTS)
    try:
        params = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.categorie == "DOCUMENTS",
        ).all()
        for p in params:
            settings[p.cle] = p.valeur
    except Exception:
        pass
    return settings


def _bool(val) -> bool:
    return str(val).lower() in ("true", "1", "oui", "yes")


def appreciation_pour_moyenne(moyenne: float, settings: dict) -> str:
    """Retourne l'appréciation automatique basée sur les seuils configurés."""
    try:
        seuil_tb = float(settings.get("documents.seuil_tres_bien", 16))
        seuil_b = float(settings.get("documents.seuil_bien", 14))
        seuil_ab = float(settings.get("documents.seuil_assez_bien", 12))
        seuil_p = float(settings.get("documents.seuil_passable", 10))
    except (ValueError, TypeError):
        seuil_tb, seuil_b, seuil_ab, seuil_p = 16, 14, 12, 10

    if moyenne >= seuil_tb:
        return "Très Bien"
    if moyenne >= seuil_b:
        return "Bien"
    if moyenne >= seuil_ab:
        return "Assez Bien"
    if moyenne >= seuil_p:
        return "Passable"
    return "Insuffisant"


def dessiner_filigrane(pdf, largeur: float, hauteur: float, settings: dict):
    """Dessine un filigrane diagonal sur la page PDF courante.
    
    Rétrocompatible : ne fait rien si filigrane_actif est false.
    """
    if not _bool(settings.get("documents.filigrane_actif", "false")):
        return

    texte = settings.get("documents.filigrane_texte", "CONFIDENTIEL") or "CONFIDENTIEL"
    try:
        opacite = float(settings.get("documents.filigrane_opacite", 0.08))
    except (ValueError, TypeError):
        opacite = 0.08
    opacite = max(0.01, min(opacite, 0.5))  # clamp

    pdf.saveState()
    pdf.setFillColorRGB(0.5, 0.5, 0.5, opacite)
    pdf.setFont("Helvetica-Bold", 54)

    # Rotation de 45 degrés, centré
    cx, cy = largeur / 2, hauteur / 2
    pdf.translate(cx, cy)
    pdf.rotate(45)
    pdf.drawCentredString(0, 0, texte)
    # Repeat above and below center for coverage
    pdf.drawCentredString(0, 200, texte)
    pdf.drawCentredString(0, -200, texte)
    pdf.restoreState()


# ============================================================================
# TEMPLATES BULLETIN (couleurs et styles par modèle)
# ============================================================================
TEMPLATES_BULLETIN = {
    "classique": {
        "nom": "Classique",
        "description": "Style traditionnel sobre",
        "couleur_primaire": (0.1, 0.2, 0.5),   # bleu marine
        "couleur_secondaire": (0.9, 0.9, 0.95),  # bleu très clair (fond tableau)
        "couleur_ligne": (0.2, 0.4, 0.8),         # lignes séparatrices
        "police_titre": "Helvetica-Bold",
        "police_corps": "Helvetica",
        "taille_titre": 16,
        "taille_entete_tableau": 8,
        "taille_corps_tableau": 8,
    },
    "moderne": {
        "nom": "Moderne",
        "description": "Design épuré et contemporain",
        "couleur_primaire": (0.15, 0.15, 0.15),
        "couleur_secondaire": (0.96, 0.96, 0.96),
        "couleur_ligne": (0.3, 0.3, 0.3),
        "police_titre": "Helvetica-Bold",
        "police_corps": "Helvetica",
        "taille_titre": 16,
        "taille_entete_tableau": 8,
        "taille_corps_tableau": 8,
    },
    "officiel_gn": {
        "nom": "Officiel Guinéen",
        "description": "Format officiel République de Guinée",
        "couleur_primaire": (0.0, 0.4, 0.15),   # vert guinéen
        "couleur_secondaire": (0.95, 1.0, 0.95),
        "couleur_ligne": (0.0, 0.5, 0.2),
        "police_titre": "Helvetica-Bold",
        "police_corps": "Helvetica",
        "taille_titre": 14,
        "taille_entete_tableau": 7,
        "taille_corps_tableau": 7,
    },
    "minimaliste": {
        "nom": "Minimaliste",
        "description": "Simple et lisible",
        "couleur_primaire": (0.3, 0.3, 0.3),
        "couleur_secondaire": (1.0, 1.0, 1.0),
        "couleur_ligne": (0.7, 0.7, 0.7),
        "police_titre": "Helvetica-Bold",
        "police_corps": "Helvetica",
        "taille_titre": 14,
        "taille_entete_tableau": 8,
        "taille_corps_tableau": 8,
    },
}
