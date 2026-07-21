"""
Tests — Module Sécurité (fonctions utilitaires)
Teste les fonctions de hashage et vérification de mots de passe.

feat(test): ajouter tests unitaires sécurité (bcrypt)
"""
import pytest
from app.core.security import hash_password, verify_password


class TestHashPassword:
    """Tests de la fonction hash_password."""

    def test_hash_retourne_chaine_non_vide(self):
        """✅ hash_password retourne une chaîne non vide."""
        result = hash_password("motdepasse123")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_hash_different_du_mot_de_passe_original(self):
        """✅ Le hash n'est pas égal au mot de passe en clair."""
        plain = "motdepasse123"
        hashed = hash_password(plain)
        assert hashed != plain

    def test_meme_mot_de_passe_produit_hashes_differents(self):
        """✅ Bcrypt produit un hash différent à chaque appel (salt aléatoire)."""
        plain = "motdepasse123"
        hash1 = hash_password(plain)
        hash2 = hash_password(plain)
        assert hash1 != hash2  # Grâce au salt aléatoire de bcrypt

    def test_hash_commence_par_2b(self):
        """✅ Les hashes bcrypt commencent par '$2b$'."""
        hashed = hash_password("test")
        assert hashed.startswith("$2b$")


class TestVerifyPassword:
    """Tests de la fonction verify_password."""

    def test_mot_de_passe_correct_retourne_true(self):
        """✅ Le bon mot de passe passe la vérification."""
        plain = "monMotDePasse99!"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_mauvais_mot_de_passe_retourne_false(self):
        """❌ Un mauvais mot de passe échoue à la vérification."""
        hashed = hash_password("bonMotDePasse")
        assert verify_password("mauvaisMotDePasse", hashed) is False

    def test_mot_de_passe_vide_vs_hash(self):
        """❌ Un mot de passe vide ne doit pas correspondre."""
        hashed = hash_password("motdepasse123")
        assert verify_password("", hashed) is False

    def test_hash_invalide_retourne_false(self):
        """❌ Un hash invalide ne lève pas d'exception, retourne False."""
        result = verify_password("motdepasse", "hash_completement_invalide")
        assert result is False

    def test_mots_de_passe_similaires_ne_correspondent_pas(self):
        """❌ 'motdepasse' et 'Motdepasse' sont différents (sensible à la casse)."""
        hashed = hash_password("motdepasse")
        assert verify_password("Motdepasse", hashed) is False

    def test_mots_de_passe_guineens(self):
        """✅ Vérification avec des noms/prénoms guinéens comme mot de passe."""
        mots = ["Alpha2024!", "Fatoumata1", "Conakry2026", "Guinee224"]
        for mot in mots:
            hashed = hash_password(mot)
            assert verify_password(mot, hashed) is True, f"Échec pour : {mot}"
