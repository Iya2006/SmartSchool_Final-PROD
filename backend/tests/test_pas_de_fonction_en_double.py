"""
Une fonction définie deux fois dans un même module : Python garde la seconde,
sans rien dire. Deux branches qui ajoutent chacune un `_paiement_de_l_ecole`
dans finance.py fusionnent sans conflit — et les reçus tombaient en erreur,
la seconde version ne rendant plus ce que la première rendait.
"""
import ast
from collections import Counter
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def test_aucune_fonction_definie_deux_fois_dans_un_module():
    doublons = []
    for fichier in sorted(APP.rglob("*.py")):
        arbre = ast.parse(fichier.read_text(encoding="utf-8"), filename=str(fichier))
        noms = Counter(
            noeud.name for noeud in arbre.body
            if isinstance(noeud, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        )
        doublons += [f"{fichier.relative_to(APP)} : {nom} ({n} fois)" for nom, n in noms.items() if n > 1]
    assert doublons == []
