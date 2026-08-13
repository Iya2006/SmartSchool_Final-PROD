"""
SMARTSCHOOL — Le mode de paiement, écrit d'une seule façon.

LE PROBLÈME
-----------
`mode_paiement` était du texte libre. Chaque écran y écrivait ce qu'il voulait,
et la base contenait pour un même moyen de paiement :

    Espèces  2416 paiements        ESPECES        17 paiements
    Orange Money  763 paiements    ORANGE_MONEY    7 paiements
    Virement  821 paiements        Cash           (paiement groupé des salaires)

Conséquence directe, visible à l'écran : le panneau « Répartition par Mode »
affichait **0 GNF partout**. Il regroupe sur les codes de référence
(`ESPECES`, `VIREMENT`, `ORANGE_MONEY`, `MTN_MONEY`, `CHEQUE`), et aucune des
valeurs enregistrées ne leur correspondait. Un comptable ne pouvait donc pas
savoir combien était rentré en espèces — la question la plus élémentaire d'un
rapprochement de caisse.

Et ce n'était pas rattrapable à l'affichage : « Espèces » et « ESPECES » sont
deux chaînes différentes, mais « Cash » ne ressemble à rien de connu.

CE QUE CE MODULE FAIT
---------------------
Une seule façon d'écrire un mode, et une seule fonction pour y arriver. Les
libellés lisibles (« Orange Money »), les variantes de casse, les accents et
les synonymes courants tombent tous sur le même code.

Ce qui n'est pas reconnu n'est pas silencieusement rangé sous « Autre » : la
fonction le signale, et l'appelant décide. Ranger l'inconnu dans une case
fourre-tout, c'est refaire le problème en le cachant.
"""
import unicodedata
from typing import Optional

# Les codes de référence. Ils doivent rester alignés avec
# FINANCE_DEFAULTS["modes_paiement"] (app/api/finance.py) et
# DEFAULT_MODES_PAIEMENT (frontend/src/lib/modesPaiement.ts).
MODES_CONNUS = [
    "ESPECES", "VIREMENT", "ORANGE_MONEY", "MTN_MONEY", "CHEQUE",
    "CARTE_BANCAIRE", "MOBILE_MONEY", "AUTRE",
]

# Ce que les écrans, les scripts et les anciennes versions ont réellement
# écrit. Cette table est le fruit d'un relevé en base, pas d'une supposition.
SYNONYMES = {
    "ESPECE": "ESPECES", "ESPECES": "ESPECES", "CASH": "ESPECES",
    "LIQUIDE": "ESPECES", "NUMERAIRE": "ESPECES", "CAISSE": "ESPECES",
    "VIREMENT": "VIREMENT", "VIREMENT BANCAIRE": "VIREMENT",
    "BANQUE": "VIREMENT", "TRANSFERT": "VIREMENT",
    "ORANGE MONEY": "ORANGE_MONEY", "ORANGEMONEY": "ORANGE_MONEY",
    "OM": "ORANGE_MONEY", "ORANGE": "ORANGE_MONEY",
    "MTN MONEY": "MTN_MONEY", "MTNMONEY": "MTN_MONEY", "MTN": "MTN_MONEY",
    "MOMO": "MTN_MONEY",
    "CHEQUE": "CHEQUE", "CHQ": "CHEQUE",
    "CARTE": "CARTE_BANCAIRE", "CARTE BANCAIRE": "CARTE_BANCAIRE",
    "CB": "CARTE_BANCAIRE",
    "MOBILE MONEY": "MOBILE_MONEY", "MOBILE": "MOBILE_MONEY",
    "AUTRE": "AUTRE",
}


def normaliser_mode_paiement(valeur: Optional[str]) -> Optional[str]:
    """Le code de référence correspondant, ou `None` si rien ne correspond.

    `None` est un refus, pas un défaut : à l'appelant de dire ce qu'il en fait.
    Un mode inconnu rangé d'office sous « Autre » disparaîtrait des totaux tout
    aussi sûrement qu'aujourd'hui, mais sans qu'on puisse s'en apercevoir.
    """
    if not valeur:
        return None
    texte = unicodedata.normalize("NFD", str(valeur).strip())
    texte = "".join(c for c in texte if unicodedata.category(c) != "Mn")
    texte = texte.upper().replace("-", " ").replace("_", " ")
    texte = " ".join(texte.split())
    if texte in SYNONYMES:
        return SYNONYMES[texte]
    compact = texte.replace(" ", "_")
    return compact if compact in MODES_CONNUS else None


def exiger_mode_paiement(valeur: Optional[str], autorises=None) -> str:
    """Le code de référence, ou une erreur 400 explicite.

    `autorises` permet de restreindre aux modes que l'école a réellement
    configurés : une école sans compte Orange Money n'a aucune raison
    d'enregistrer un encaissement Orange Money.
    """
    from fastapi import HTTPException

    code = normaliser_mode_paiement(valeur)
    if code is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Mode de paiement inconnu : « {valeur} ». "
                f"Attendu : {', '.join(MODES_CONNUS[:5])}."
            ),
        )
    if autorises:
        permis = {normaliser_mode_paiement(m) for m in autorises}
        permis.discard(None)
        if permis and code not in permis:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Le mode « {code} » n'est pas activé pour cette école. "
                    f"Modes autorisés : {', '.join(sorted(permis))}."
                ),
            )
    return code
