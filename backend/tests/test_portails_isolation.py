"""
Tests — un administrateur ne consulte les portails que DANS SON ÉCOLE.

Les trois portails (enseignant, élève, parent) accordaient un accès total aux
rôles administrateurs, sans vérifier l'établissement. Héritage du
mono-établissement : un administrateur de l'école A pouvait lire les notes, le
bulletin et le classement de n'importe quel élève de la plateforme, les données
de n'importe quel enseignant, et les enfants de n'importe quel parent — en
passant simplement leur identifiant dans l'URL.

Convention du projet : 404 pour une ressource d'une autre école (ne jamais
confirmer son existence), 403 pour un compte sans établissement déterminé.
"""
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.api.portail_eleve import _eleve_auth
from app.api.portail_enseignant import _enseignant_auth, get_trimestres
from app.api.portail_parent import _parent_auth
from app.models.academique import (
    AnneeScolaire, Cycle, Classe, Eleve, EleveParent, Enseignant, Etablissement,
    Niveau, Parent, Trimestre,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _admin(etablissement_id):
    return {"role": "ADMIN", "type": "utilisateur", "sub": "1",
            "etablissement_id": etablissement_id}


class Ecole:
    """Une école complète : année, période, classe, enseignant, élève, parent."""

    def __init__(self, db: Session, suffixe: str):
        uid = _uid()
        self.etab = Etablissement(code=f"PORT-{suffixe}-{uid}",
                                  nom=f"École {suffixe} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)
        e = self.etab.etablissement_id

        self.annee = AnneeScolaire(
            etablissement_id=e, code=f"PAN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1),
            statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.trimestre = Trimestre(
            annee_id=self.annee.annee_id, code=f"PT{uid}", libelle=f"1er Trimestre {uid}",
            numero=1, date_debut=date(2025, 9, 1), date_fin=date(2025, 12, 20),
            statut="EN_COURS",
        )
        self.cycle = Cycle(etablissement_id=e, code=f"PCY{uid}", libelle="Secondaire", ordre=1)
        db.add_all([self.trimestre, self.cycle]); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"PNV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=e, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"PCL{uid}", libelle=f"6e A {uid}",
            statut="ACTIVE",
        )
        self.enseignant = Enseignant(
            etablissement_id=e, matricule=f"PENS-{uid}", nom="Bah", prenom="Ousmane",
            sexe="M", telephone=f"75000{uid:04d}", statut="ACTIF",
        )
        self.eleve = Eleve(
            etablissement_id=e, matricule=f"PELV-{uid}", nom="Diallo", prenom="Aissata",
            date_naissance=date(2012, 5, 4), sexe="F", statut="ACTIF",
        )
        self.parent = Parent(nom="Diallo", prenom="Mamadou", telephone_1=f"76000{uid:04d}")
        db.add_all([self.classe, self.enseignant, self.eleve, self.parent])
        db.commit()
        for o in (self.classe, self.enseignant, self.eleve, self.parent):
            db.refresh(o)

        db.add(EleveParent(eleve_id=self.eleve.eleve_id, parent_id=self.parent.parent_id,
                           lien_parente="PERE"))
        db.commit()


@pytest.fixture
def deux_ecoles(db: Session):
    a, b = Ecole(db, "A"), Ecole(db, "B")
    yield a, b
    # Suppression par requête (et non par objet) : passer par l'ORM déclenche
    # les cascades de relation, qui tentent de mettre `etablissement_id` à NULL
    # sur les cycles avant de les supprimer — colonne NOT NULL, donc échec.
    db.rollback()
    for ec in (a, b):
        db.query(EleveParent).filter(EleveParent.parent_id == ec.parent.parent_id).delete(
            synchronize_session=False)
        for modele, colonne, valeur in (
            (Parent, Parent.parent_id, ec.parent.parent_id),
            (Eleve, Eleve.eleve_id, ec.eleve.eleve_id),
            (Enseignant, Enseignant.enseignant_id, ec.enseignant.enseignant_id),
            (Classe, Classe.classe_id, ec.classe.classe_id),
            (Niveau, Niveau.niveau_id, ec.niveau.niveau_id),
            (Cycle, Cycle.cycle_id, ec.cycle.cycle_id),
            (Trimestre, Trimestre.trimestre_id, ec.trimestre.trimestre_id),
            (AnneeScolaire, AnneeScolaire.annee_id, ec.annee.annee_id),
            (Etablissement, Etablissement.etablissement_id, ec.etab.etablissement_id),
        ):
            db.query(modele).filter(colonne == valeur).delete(synchronize_session=False)
        db.commit()


async def _appel(dependance, **kwargs):
    return await dependance(**kwargs)


class TestPortailEleve:
    @pytest.mark.asyncio
    async def test_admin_de_sa_propre_ecole_passe(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        res = await _eleve_auth(a.eleve.eleve_id, _admin(a.etab.etablissement_id), db)
        assert res["role"] == "ADMIN"

    @pytest.mark.asyncio
    async def test_admin_ne_lit_pas_l_eleve_d_une_autre_ecole(self, db: Session, deux_ecoles):
        """LE test : avant, cet appel renvoyait les notes et le bulletin."""
        a, b = deux_ecoles
        with pytest.raises(HTTPException) as exc:
            await _eleve_auth(b.eleve.eleve_id, _admin(a.etab.etablissement_id), db)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_admin_plateforme_sans_ecole_refuse(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        with pytest.raises(HTTPException) as exc:
            await _eleve_auth(a.eleve.eleve_id, _admin(None), db)
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_l_eleve_ne_lit_que_ses_propres_donnees(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        jeton = {"role": "", "type": "eleve", "sub": str(a.eleve.eleve_id)}
        assert await _eleve_auth(a.eleve.eleve_id, jeton, db) is jeton
        with pytest.raises(HTTPException) as exc:
            await _eleve_auth(b.eleve.eleve_id, jeton, db)
        assert exc.value.status_code == 403


class TestPortailEnseignant:
    @pytest.mark.asyncio
    async def test_admin_ne_lit_pas_l_enseignant_d_une_autre_ecole(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        with pytest.raises(HTTPException) as exc:
            await _enseignant_auth(b.enseignant.enseignant_id, _admin(a.etab.etablissement_id), db)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_admin_de_sa_propre_ecole_passe(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        res = await _enseignant_auth(a.enseignant.enseignant_id,
                                     _admin(a.etab.etablissement_id), db)
        assert res["role"] == "ADMIN"

    def test_les_periodes_sont_celles_de_son_ecole(self, db: Session, deux_ecoles):
        """Avant, `est_courante == "O"` sans filtre renvoyait l'année de la
        première école venue : l'enseignant voyait le calendrier du voisin."""
        a, b = deux_ecoles
        periodes_a = get_trimestres(db, a.etab.etablissement_id)
        periodes_b = get_trimestres(db, b.etab.etablissement_id)

        assert [p["trimestre_id"] for p in periodes_a] == [a.trimestre.trimestre_id]
        assert [p["trimestre_id"] for p in periodes_b] == [b.trimestre.trimestre_id]


class TestPortailParent:
    @pytest.mark.asyncio
    async def test_admin_ne_lit_pas_le_parent_d_une_autre_ecole(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        with pytest.raises(HTTPException) as exc:
            await _parent_auth(b.parent.parent_id, _admin(a.etab.etablissement_id), db)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_admin_lit_le_parent_dont_l_enfant_est_chez_lui(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        res = await _parent_auth(a.parent.parent_id, _admin(a.etab.etablissement_id), db)
        assert res["role"] == "ADMIN"

    @pytest.mark.asyncio
    async def test_le_parent_ne_lit_que_ses_propres_donnees(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        jeton = {"role": "", "type": "parent", "sub": str(a.parent.parent_id)}
        assert await _parent_auth(a.parent.parent_id, jeton, db) is jeton
        with pytest.raises(HTTPException) as exc:
            await _parent_auth(b.parent.parent_id, jeton, db)
        assert exc.value.status_code == 403
