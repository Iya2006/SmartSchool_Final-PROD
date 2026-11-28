"""
Messages aux familles, pour le comptable (décision du fondateur, 22/11/2026).

Le comptable écrit aux parents — relancer un paiement, répondre sur la
scolarité — et lit leurs réponses. Seulement les messages « Paiement » : les
autres échanges de la direction avec les familles, les demandes d'emploi du
temps et la messagerie interne lui restent fermés. Son écran était une copie
de celui de la direction, dont toutes les données lui étaient refusées.

Et la relance des impayés, qu'il déclenche : le texte réglé par l'école, le
parent responsable financier, un message par facture non soldée.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import (
    Classe, Cycle, EcheanceFacture, Eleve, EleveParent, Facture, Inscription, Message, Niveau, Parent,
    Utilisateur,
)
from tests.test_acces_dashboard_et_personnel_direction import _compte, _ecole, _headers, _uid


class Ecole:
    def __init__(self, db: Session):
        self.db = db
        self.etab, self.annee = _ecole(db)
        uid = _uid()
        cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"MF{uid}", libelle="Primaire", ordre=1)
        db.add(cycle); db.commit(); db.refresh(cycle)
        niveau = Niveau(cycle_id=cycle.cycle_id, code=f"MFN{uid}", libelle="CM1", ordre=1)
        db.add(niveau); db.commit(); db.refresh(niveau)
        self.classe = Classe(etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
                             niveau_id=niveau.niveau_id, code=f"MFC{uid}", libelle=f"CM1 A {uid}")
        db.add(self.classe); db.commit(); db.refresh(self.classe)

    @property
    def id(self) -> int:
        return self.etab.etablissement_id

    def entetes(self, client: TestClient, role: str, **champs) -> dict:
        compte = _compte(self.db, self.id, role)
        for cle, valeur in champs.items():
            setattr(compte, cle, valeur)
        self.db.commit()
        return _headers(client, compte.nom_utilisateur)

    def eleve(self, prenom: str = "Kadiatou") -> Eleve:
        uid = _uid()
        e = Eleve(etablissement_id=self.id, matricule=f"MF-{uid}", nom="Sow", prenom=prenom,
                  date_naissance=date(2015, 2, 2), sexe="F", statut="ACTIF")
        self.db.add(e); self.db.commit(); self.db.refresh(e)
        self.db.add(Inscription(eleve_id=e.eleve_id, classe_id=self.classe.classe_id,
                                annee_id=self.annee.annee_id, statut="ACTIVE"))
        self.db.commit()
        return e

    def parent(self, eleve: Eleve = None, prenom: str = "Fatou", **lien) -> Parent:
        uid = _uid()
        p = Parent(etablissement_id=self.id, nom="Sow", prenom=prenom, telephone_1=f"62500{uid:04d}", statut="ACTIF")
        self.db.add(p); self.db.commit(); self.db.refresh(p)
        if eleve is not None:
            self.db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=p.parent_id,
                                    lien_parente=lien.pop("lien_parente", "MERE"), **lien))
            self.db.commit()
        return p

    def facture(self, eleve: Eleve, restant: float, echeance: date = None) -> Facture:
        inscription = self.db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one()
        f = Facture(inscription_id=inscription.inscription_id, annee_id=self.annee.annee_id,
                    numero_facture=f"MF-FAC-{_uid()}", montant_total=restant, montant_net=restant,
                    montant_paye=0, montant_restant=restant, statut="EN_ATTENTE")
        self.db.add(f); self.db.commit(); self.db.refresh(f)
        if echeance:
            self.db.add(EcheanceFacture(facture_id=f.facture_id, libelle="Échéance 1", date_limite=echeance,
                                        montant_attendu=restant, statut="EN_ATTENTE"))
            self.db.commit()
        return f

    def message(self, **champs) -> Message:
        m = Message(etablissement_id=self.id, contenu="…", **champs)
        self.db.add(m); self.db.commit(); self.db.refresh(m)
        return m


def _sujets(reponse) -> set:
    assert reponse.status_code == 200, reponse.text
    return {m["sujet"] for m in reponse.json()}


class TestLeComptableEcritAuxFamilles:
    def test_il_ecrit_et_lit_les_reponses_sur_les_paiements(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        famille = ecole.parent(ecole.eleve())

        annuaire = client.get("/api/communication/parents-list", headers=entetes)
        assert annuaire.status_code == 200, annuaire.text
        assert famille.parent_id in {p["parent_id"] for p in annuaire.json()}

        # Il demande « Discipline » : son message est classé « Paiement ».
        envoi = client.post("/api/communication/messages-parents", headers=entetes, json={
            "destinataire_type": "PARENT", "destinataire_id": famille.parent_id,
            "objet_type": "DISCIPLINE", "sujet": "  Frais du 2e trimestre ", "contenu": "Merci de passer à la caisse.",
        })
        assert envoi.status_code == 201, envoi.text
        stocke = db.get(Message, envoi.json()["message_id"])
        assert (stocke.objet_type, stocke.sujet, stocke.expediteur_type) == ("PAIEMENT", "Frais du 2e trimestre", "ADMIN")

        # La réponse du parent (portail : même type que le message reçu) et un
        # échange de la direction sur un autre sujet.
        ecole.message(expediteur_type="PARENT", expediteur_id=famille.parent_id, destinataire_type="ADMIN",
                      objet_type="PAIEMENT", sujet="RE: Frais du 2e trimestre")
        ecole.message(expediteur_type="ADMIN", destinataire_type="PARENT", destinataire_id=famille.parent_id,
                      objet_type="DISCIPLINE", sujet="Retards répétés")

        vus = _sujets(client.get("/api/communication/messages-parents", headers=entetes))
        assert {"Frais du 2e trimestre", "RE: Frais du 2e trimestre"} <= vus
        assert "Retards répétés" not in vus
        # Demander un autre type ne lui ouvre rien de plus.
        vus = _sujets(client.get("/api/communication/messages-parents?objet_type=DISCIPLINE", headers=entetes))
        assert "Retards répétés" not in vus and "RE: Frais du 2e trimestre" in vus

    def test_la_direction_voit_tout_et_peut_filtrer(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "ADMIN")
        famille = ecole.parent(ecole.eleve())
        ecole.message(expediteur_type="ADMIN", destinataire_type="PARENT", destinataire_id=famille.parent_id,
                      objet_type="DISCIPLINE", sujet="Retards répétés")
        ecole.message(expediteur_type="ADMIN", destinataire_type="PARENT", destinataire_id=famille.parent_id,
                      objet_type="PAIEMENT", sujet="Reçu disponible")

        assert {"Retards répétés", "Reçu disponible"} <= _sujets(
            client.get("/api/communication/messages-parents", headers=entetes))
        assert _sujets(client.get("/api/communication/messages-parents?objet_type=PAIEMENT", headers=entetes)) \
            == {"Reçu disponible"}

        # La direction peut toujours classer son message comme elle veut.
        envoi = client.post("/api/communication/messages-parents", headers=entetes, json={
            "destinataire_type": "TOUS_PARENTS", "objet_type": "REUNION", "sujet": "Réunion des parents"})
        assert envoi.status_code == 201, envoi.text
        assert db.get(Message, envoi.json()["message_id"]).objet_type == "REUNION"

    def test_un_comptable_qui_cumule_la_direction_garde_tout(self, client: TestClient, db: Session):
        """Le rôle secondaire compte (roles_du_compte), comme pour require_roles."""
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE", roles_secondaires=["DG"])
        famille = ecole.parent(ecole.eleve())
        ecole.message(expediteur_type="ADMIN", destinataire_type="PARENT", destinataire_id=famille.parent_id,
                      objet_type="DISCIPLINE", sujet="Retards répétés")

        assert "Retards répétés" in _sujets(client.get("/api/communication/messages-parents", headers=entetes))
        assert client.get("/api/communication/messages?role=ADMIN", headers=entetes).status_code == 200

    def test_le_reste_de_la_communication_lui_reste_ferme(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        assert client.get("/api/communication/messages?role=ADMIN", headers=entetes).status_code == 403
        assert client.get("/api/communication/demandes", headers=entetes).status_code == 403
        assert client.post("/api/communication/demandes", headers=entetes,
                           json={"titre": "Disponibilités"}).status_code == 403

    def test_les_autres_roles_n_ecrivent_pas_aux_familles(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        for role in ("SURVEILLANT", "BIBLIOTHECAIRE"):
            entetes = ecole.entetes(client, role)
            assert client.get("/api/communication/parents-list", headers=entetes).status_code == 403, role
            assert client.post("/api/communication/messages-parents", headers=entetes, json={
                "destinataire_type": "TOUS_PARENTS", "sujet": "Test"}).status_code == 403, role

    def test_un_sujet_vide_ou_trop_long_est_refuse(self, client: TestClient, db: Session):
        """PostgreSQL refuse plus de 300 caractères, SQLite les accepterait sur
        un poste : la synchronisation buterait ensuite sur ce message."""
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        for sujet in ("   ", "x" * 301):
            rep = client.post("/api/communication/messages-parents", headers=entetes,
                              json={"destinataire_type": "TOUS_PARENTS", "sujet": sujet})
            assert rep.status_code == 400, rep.text


class TestUneFicheParentDisparue:
    def test_l_historique_le_dit_au_lieu_de_l_attribuer_a_l_administration(self, client: TestClient, db: Session):
        """Base remise à zéro, fiche supprimée : le message reste dans
        l'historique. Avant : « Parent ? », et la réponse d'un tel parent
        s'affichait comme venant de « Administration »."""
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        disparu = 2_000_000_000 + _uid()
        ecole.message(expediteur_type="ADMIN", destinataire_type="PARENT", destinataire_id=disparu,
                      objet_type="PAIEMENT", sujet="Rappel ancien")
        ecole.message(expediteur_type="PARENT", expediteur_id=disparu, destinataire_type="ADMIN",
                      objet_type="PAIEMENT", sujet="Réponse ancienne")

        rep = client.get("/api/communication/messages-parents", headers=entetes)
        assert rep.status_code == 200, rep.text
        par_sujet = {m["sujet"]: m for m in rep.json()}
        assert par_sujet["Rappel ancien"]["destinataire_nom"] == "Parent introuvable"
        assert par_sujet["Réponse ancienne"]["expediteur_nom"] == "Parent introuvable"


class TestLeFilDUneFamille:
    def test_une_relance_groupee_ne_noie_pas_les_reponses_d_une_famille(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        eleve = ecole.eleve()
        famille = ecole.parent(eleve)
        autre = ecole.parent(ecole.eleve(prenom="Binta"), prenom="Aïssatou")
        ecole.message(expediteur_type="PARENT", expediteur_id=famille.parent_id, destinataire_type="ADMIN",
                      objet_type="PAIEMENT", sujet="Je paierai lundi")
        ecole.message(expediteur_type="ADMIN", destinataire_type="CLASSE_PARENTS",
                      destinataire_id=ecole.classe.classe_id, objet_type="PAIEMENT", sujet="Rappel à la classe")
        ecole.message(expediteur_type="ADMIN", destinataire_type="TOUS_PARENTS",
                      objet_type="PAIEMENT", sujet="Rappel à tous")
        ecole.message(expediteur_type="ADMIN", destinataire_type="PARENT", destinataire_id=autre.parent_id,
                      objet_type="PAIEMENT", sujet="Pour une autre famille")
        # Puis une relance groupée : 205 messages plus récents.
        db.add_all([Message(etablissement_id=ecole.id, expediteur_type="ADMIN", destinataire_type="PARENT",
                            destinataire_id=autre.parent_id, objet_type="PAIEMENT", sujet=f"Relance {i}")
                    for i in range(205)])
        db.commit()

        assert "Je paierai lundi" not in _sujets(client.get("/api/communication/messages-parents", headers=entetes))
        fil = _sujets(client.get(f"/api/communication/messages-parents?parent_id={famille.parent_id}",
                                 headers=entetes))
        assert fil == {"Je paierai lundi", "Rappel à la classe", "Rappel à tous"}


class TestLaRelanceDesImpayes:
    def test_texte_de_l_ecole_et_parent_responsable_financier(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        rep = client.post("/api/finance/rappels/configurer", headers=entetes, json={
            "message_template": "Bonjour {parent_nom}, il reste {montant} GNF pour {eleve_nom} "
                                "avant le {date_limite}. {variable_inconnue}"})
        assert rep.status_code == 200, rep.text

        eleve = ecole.eleve(prenom="Mariama")
        ecole.parent(eleve, prenom="Ibrahima", lien_parente="PERE")  # rattaché en premier
        mere = ecole.parent(eleve, prenom="Hawa", est_responsable_financier="O")
        ecole.facture(eleve, 150000, echeance=date(2026, 12, 15))

        rep = client.post(f"/api/finance/communication/notifier-impayes?annee_id={ecole.annee.annee_id}",
                          headers=entetes)
        assert rep.status_code == 200, rep.text
        assert (rep.json()["nb_notifies"], rep.json()["nb_sans_parent"]) == (1, 0)

        envoyes = db.query(Message).filter(Message.etablissement_id == ecole.id).all()
        assert [(m.destinataire_type, m.destinataire_id, m.objet_type) for m in envoyes] == [
            ("PARENT", mere.parent_id, "PAIEMENT")]
        assert envoyes[0].contenu == (
            "Bonjour Hawa Sow, il reste 150 000 GNF pour Mariama Sow avant le 15/12/2026. {variable_inconnue}")

    def test_les_eleves_sans_parent_sont_signales(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        avec = ecole.eleve()
        ecole.parent(avec)
        ecole.facture(avec, 50000)
        ecole.facture(avec, 20000)  # deux factures : deux rappels
        ecole.facture(ecole.eleve(prenom="Seul"), 30000)

        rep = client.post(f"/api/finance/communication/notifier-impayes?annee_id={ecole.annee.annee_id}",
                          headers=entetes)
        assert rep.status_code == 200, rep.text
        assert (rep.json()["nb_notifies"], rep.json()["nb_impayes"], rep.json()["nb_sans_parent"]) == (2, 3, 1)
        assert "sans parent" in rep.json()["message"]

    def test_un_modele_invalide_n_empeche_pas_la_relance(self, client: TestClient, db: Session):
        ecole = Ecole(db)
        entetes = ecole.entetes(client, "COMPTABLE")
        client.post("/api/finance/rappels/configurer", headers=entetes, json={"message_template": "Payez { vite"})
        eleve = ecole.eleve()
        ecole.parent(eleve)
        ecole.facture(eleve, 1000)

        rep = client.post(f"/api/finance/communication/notifier-impayes?annee_id={ecole.annee.annee_id}",
                          headers=entetes)
        assert rep.status_code == 200, rep.text
        message = db.query(Message).filter(Message.etablissement_id == ecole.id).one()
        assert message.contenu.startswith("Cher(e) ")
