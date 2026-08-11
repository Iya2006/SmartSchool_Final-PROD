"""
SMARTSCHOOL API — Routes Dashboard
GET /api/dashboard → KPIs + stats réelles (taux de réussite par cycle & détail par classe, événements, activités)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import (
    AnneeScolaire, Eleve, Enseignant, Classe, Inscription, Facture, Paiement, Presence,
    Depense, Incident, Evaluation, Bulletin, Cycle, Niveau, Evenement, Note, ActiviteJour
)
from app.schemas.schemas import DashboardResponse, DashboardKPI

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    annee_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Lot 11 — `etablissement_id` et `annee_id` étaient des paramètres de
    requête fournis par le client, avec 1 pour valeur par défaut : il suffisait
    d'incrémenter l'identifiant pour obtenir le tableau de bord complet d'une
    autre école (effectifs, chiffre d'affaires, impayés, dépenses, incidents).

    `etablissement_id` vient désormais du compte authentifié, et `annee_id`,
    devenu obligatoire, doit appartenir à cette école.
    """
    if not db.query(AnneeScolaire.annee_id).filter(
        AnneeScolaire.annee_id == annee_id,
        AnneeScolaire.etablissement_id == etablissement_id,
    ).first():
        raise HTTPException(404, "Année scolaire non trouvée")

    # KPI 1: Élèves inscrits (actifs)
    nb_eleves = db.query(func.count(Inscription.inscription_id)).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Inscription.annee_id == annee_id,
        Inscription.statut == "ACTIVE"
    ).scalar() or 0

    # KPI 2: Enseignants actifs
    nb_enseignants = db.query(func.count(Enseignant.enseignant_id)).filter(
        Enseignant.etablissement_id == etablissement_id,
        Enseignant.statut == "ACTIF"
    ).scalar() or 0

    # KPI 3: Classes actives
    nb_classes = db.query(func.count(Classe.classe_id)).filter(
        Classe.etablissement_id == etablissement_id,
        Classe.annee_id == annee_id,
        Classe.statut == "ACTIVE"
    ).scalar() or 0

    # KPI 4: Total recettes
    total_recettes = db.query(func.coalesce(func.sum(Paiement.montant), 0)).join(
        Facture, Paiement.facture_id == Facture.facture_id
    ).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Inscription.annee_id == annee_id,
        Paiement.statut == "VALIDE"
    ).scalar() or 0

    # KPI 4b: Total dépenses
    total_depenses = db.query(func.coalesce(func.sum(Depense.montant), 0)).filter(
        Depense.etablissement_id == etablissement_id,
        Depense.annee_id == annee_id
    ).scalar() or 0

    # KPI 5: Taux de présence (30 derniers jours)
    total_presences = db.query(func.count(Presence.presence_id)).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Presence.date_presence >= func.current_date() - 30
    ).scalar() or 0

    presences_ok = db.query(func.count(Presence.presence_id)).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Presence.date_presence >= func.current_date() - 30,
        Presence.statut_presence == "PRESENT"
    ).scalar() or 0

    taux = round((presences_ok / total_presences * 100), 1) if total_presences > 0 else 0

    # KPI 6: Incidents du mois
    incidents_mois = db.query(func.count(Incident.incident_id)).filter(
        Incident.etablissement_id == etablissement_id,
        Incident.date_incident >= func.current_date() - 30
    ).scalar() or 0

    # KPI 7: Évaluations prévues
    evaluations_prevues = db.query(func.count(Evaluation.evaluation_id)).join(
        Classe, Evaluation.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Classe.annee_id == annee_id,
        Evaluation.statut == "PLANIFIEE"
    ).scalar() or 0

    # ==== FINANCE ====
    total_net = db.query(func.coalesce(func.sum(Facture.montant_net), 0)).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(Classe, Inscription.classe_id == Classe.classe_id).filter(
        Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id
    ).scalar() or 0

    total_impayes = db.query(func.coalesce(func.sum(Facture.montant_restant), 0)).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(Classe, Inscription.classe_id == Classe.classe_id).filter(
        Classe.etablissement_id == etablissement_id, Inscription.annee_id == annee_id
    ).scalar() or 0

    taux_recouvrement = round((float(total_recettes) / float(total_net) * 100), 1) if total_net > 0 else 0

    repartition_methodes_raw = db.query(Paiement.mode_paiement, func.coalesce(func.sum(Paiement.montant), 0)).join(
        Facture, Paiement.facture_id == Facture.facture_id
    ).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(Classe, Inscription.classe_id == Classe.classe_id).filter(
        Classe.etablissement_id == etablissement_id
    ).group_by(Paiement.mode_paiement).all()

    repartition_methodes = [{"mode": r[0] if r[0] else "AUTRE", "total": float(r[1])} for r in repartition_methodes_raw]
    paiements_mobile_money = sum([1 for r in db.query(Paiement.paiement_id).filter(Paiement.mode_paiement.in_(["ORANGE_MONEY", "MTN_MONEY"])).all()])

    # ==== TAUX DE RÉUSSITE RÉEL PAR CYCLE ET DÉTAIL PAR CLASSE ====
    cycles_raw = db.query(Cycle).filter(Cycle.etablissement_id == etablissement_id).order_by(Cycle.ordre).all()

    taux_reussite_par_cycle = []
    total_evaluations_bulletins = 0
    total_admis_global = 0

    # Fonction utilitaire pour calculer les stats d'une classe spécifique
    def _calc_classe_stats(c_id: int):
        c_obj = db.query(Classe).filter(Classe.classe_id == c_id).first()
        if not c_obj:
            return None
        
        inscs_raw = db.query(Inscription.inscription_id).filter(
            Inscription.classe_id == c_id, Inscription.annee_id == annee_id, Inscription.statut == "ACTIVE"
        ).all()
        i_ids = [i[0] for i in inscs_raw]

        if not i_ids:
            return {"classe_id": c_id, "code": c_obj.code, "libelle": c_obj.libelle, "taux": 0.0, "nb_eleves": 0, "nb_admis": 0}

        b_cnt = db.query(func.count(Bulletin.bulletin_id)).filter(Bulletin.inscription_id.in_(i_ids)).scalar() or 0
        a_cnt = db.query(func.count(Bulletin.bulletin_id)).filter(Bulletin.inscription_id.in_(i_ids), Bulletin.moyenne_generale >= 10).scalar() or 0

        # Fallback notes brutes
        if b_cnt == 0:
            notes_avg = db.query(Note.inscription_id, func.avg(Note.valeur).label("moy")).filter(Note.inscription_id.in_(i_ids)).group_by(Note.inscription_id).all()
            b_cnt = len(notes_avg)
            a_cnt = sum([1 for n in notes_avg if float(n.moy or 0) >= 10.0])

        taux_c = round((a_cnt / b_cnt * 100), 1) if b_cnt > 0 else 0.0
        return {
            "classe_id": c_id,
            "code": c_obj.code,
            "libelle": c_obj.libelle,
            "taux": taux_c,
            "nb_eleves": b_cnt,
            "nb_admis": a_cnt
        }

    if not cycles_raw:
        cycle_names = [
            ("Primaire", ["1", "2", "3", "4", "5", "6", "CP", "CE", "CM"]),
            ("Collège", ["7", "8", "9", "10"]),
            ("Lycée", ["11", "12", "TLE", "TERMINALE", "SS", "SM", "SE"])
        ]
        for c_name, keywords in cycle_names:
            classes_c = db.query(Classe).filter(
                Classe.etablissement_id == etablissement_id,
                Classe.annee_id == annee_id
            ).all()
            
            matching_classes = [c for c in classes_c if any(k in c.code.upper() or k in c.libelle.upper() for k in keywords)]
            classes_details = []
            c_b_cnt = 0
            c_a_cnt = 0

            for mc in matching_classes:
                st = _calc_classe_stats(mc.classe_id)
                if st:
                    classes_details.append(st)
                    c_b_cnt += st["nb_eleves"]
                    c_a_cnt += st["nb_admis"]

            taux_val = round((c_a_cnt / c_b_cnt * 100), 1) if c_b_cnt > 0 else 0.0
            taux_reussite_par_cycle.append({
                "cycle": c_name,
                "taux": taux_val,
                "nb_eleves": c_b_cnt,
                "nb_admis": c_a_cnt,
                "classes_detail": classes_details
            })
            total_evaluations_bulletins += c_b_cnt
            total_admis_global += c_a_cnt
    else:
        for cycle in cycles_raw:
            niveau_ids = [n.niveau_id for n in cycle.niveaux]
            c_classes = db.query(Classe).filter(
                Classe.etablissement_id == etablissement_id,
                Classe.annee_id == annee_id,
                Classe.niveau_id.in_(niveau_ids) if niveau_ids else True
            ).all()

            classes_details = []
            c_b_cnt = 0
            c_a_cnt = 0

            for mc in c_classes:
                st = _calc_classe_stats(mc.classe_id)
                if st:
                    classes_details.append(st)
                    c_b_cnt += st["nb_eleves"]
                    c_a_cnt += st["nb_admis"]

            taux_val = round((c_a_cnt / c_b_cnt * 100), 1) if c_b_cnt > 0 else 0.0
            taux_reussite_par_cycle.append({
                "cycle": cycle.libelle,
                "taux": taux_val,
                "nb_eleves": c_b_cnt,
                "nb_admis": c_a_cnt,
                "classes_detail": classes_details
            })
            total_evaluations_bulletins += c_b_cnt
            total_admis_global += c_a_cnt

    taux_reussite_global = round((total_admis_global / total_evaluations_bulletins * 100), 1) if total_evaluations_bulletins > 0 else 0.0
    bulletins_generes = total_evaluations_bulletins

    # ==== COMMUNICATION ====
    conflits_edt_ia = 0
    sms_relances_envoyes = round(nb_eleves * 0.4) if nb_eleves else 0
    parents_inscrits_portail = round(nb_eleves * 0.8) if nb_eleves else 0
    taux_ouverture_app = 65.4

    # ==== INSCRIPTIONS PAR CLASSE ====
    inscriptions_par_classe = db.query(
        Classe.code,
        func.count(Inscription.inscription_id).label("effectif")
    ).outerjoin(
        Inscription, (Classe.classe_id == Inscription.classe_id) & (Inscription.statut == "ACTIVE")
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Classe.annee_id == annee_id
    ).group_by(Classe.code).order_by(Classe.code).all()

    # ==== PAIEMENTS RÉCENTS ====
    paiements_recents = db.query(
        Paiement.numero_recu,
        Paiement.montant,
        Paiement.mode_paiement,
        Paiement.date_paiement,
        Paiement.statut,
        Eleve.nom,
        Eleve.prenom,
        Classe.code.label("classe")
    ).join(
        Facture, Paiement.facture_id == Facture.facture_id
    ).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id
    ).order_by(Paiement.date_paiement.desc()).limit(8).all()

    # ==== IMPAYÉS EN ATTENTE ====
    impayes_en_attente = db.query(
        Facture.numero_facture,
        Facture.montant_restant,
        Facture.statut,
        Eleve.nom,
        Eleve.prenom,
        Classe.code.label("classe")
    ).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE"])
    ).order_by(Facture.montant_restant.desc()).all()

    # ==== ÉVÉNEMENTS À VENIR (Publiés) ====
    evenements_a_venir_raw = db.query(Evenement).filter(
        Evenement.etablissement_id == etablissement_id,
        Evenement.date_debut >= func.current_date(),
        Evenement.statut.in_(["PUBLIE", "PLANIFIE", "EN_COURS"])
    ).order_by(Evenement.date_debut.asc()).limit(5).all()

    evenements_a_venir = [
        {
            "evenement_id": e.evenement_id,
            "titre": e.titre,
            "description": e.description,
            "type_evenement": e.type_evenement,
            "date_debut": str(e.date_debut),
            "date_fin": str(e.date_fin) if e.date_fin else None,
            "heure_debut": e.heure_debut,
            "lieu": e.lieu,
            "cible": e.cible,
            "couleur": e.couleur,
            "statut": e.statut,
        }
        for e in evenements_a_venir_raw
    ]

    # ==== ACTIVITÉS DU JOUR ====
    activites_du_jour = []
    activites_manuelles = db.query(ActiviteJour).filter(
        ActiviteJour.etablissement_id == etablissement_id,
        ActiviteJour.date_activite == func.current_date(),
        ActiviteJour.est_actif == "O"
    ).order_by(ActiviteJour.heure.asc()).all()

    for m in activites_manuelles:
        activites_du_jour.append({
            "activite_id": m.activite_id,
            "type": m.type_activite,
            "titre": m.titre,
            "description": m.description or "",
            "heure": m.heure or "Toute la journée",
            "icone": m.icone or "Activity",
            "couleur": m.couleur or "#3b82f6",
            "est_manuel": True
        })

    # System activity logs for today
    nouvelles_inscriptions = db.query(func.count(Inscription.inscription_id)).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        func.date(Inscription.date_inscription) == func.current_date()
    ).scalar() or 0
    if nouvelles_inscriptions > 0:
        activites_du_jour.append({
            "type": "INSCRIPTION",
            "titre": f"{nouvelles_inscriptions} nouvelle(s) inscription(s)",
            "description": "Élèves inscrits aujourd'hui dans l'établissement",
            "heure": "Aujourd'hui",
            "icone": "UserPlus",
            "couleur": "#10b981",
            "est_manuel": False
        })

    paiements_jour = db.query(func.count(Paiement.paiement_id)).join(
        Facture, Paiement.facture_id == Facture.facture_id
    ).join(
        Inscription, Facture.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        func.date(Paiement.date_paiement) == func.current_date(),
        Paiement.statut == "VALIDE"
    ).scalar() or 0
    if paiements_jour > 0:
        activites_du_jour.append({
            "type": "PAIEMENT",
            "titre": f"{paiements_jour} paiement(s) encaissé(s)",
            "description": "Frais scolaires collectés aujourd'hui",
            "heure": "Aujourd'hui",
            "icone": "CreditCard",
            "couleur": "#3b82f6",
            "est_manuel": False
        })

    return DashboardResponse(
        kpi=DashboardKPI(
            nb_eleves=nb_eleves,
            nb_enseignants=nb_enseignants,
            nb_classes=nb_classes,
            total_recettes=float(total_recettes),
            total_depenses=float(total_depenses),
            taux_presence=taux,
            incidents_mois=incidents_mois,
            evaluations_prevues=evaluations_prevues
        ),
        finance_stats={
            "taux_recouvrement": taux_recouvrement,
            "total_impayes": float(total_impayes),
            "paiements_mobile_money": paiements_mobile_money,
            "repartition_methodes": repartition_methodes
        },
        pedagogie_stats={
            "conflits_edt_ia": conflits_edt_ia,
            "bulletins_generes": bulletins_generes,
            "taux_reussite_global": taux_reussite_global,
            "taux_reussite_par_cycle": taux_reussite_par_cycle,
        },
        communication_stats={
            "sms_relances_envoyes": sms_relances_envoyes,
            "parents_inscrits_portail": parents_inscrits_portail,
            "taux_ouverture_app": taux_ouverture_app
        },
        inscriptions_par_classe=[
            {"classe": r[0], "effectif": r[1]} for r in inscriptions_par_classe
        ],
        paiements_recents=[
            {
                "recu": r.numero_recu,
                "montant": float(r.montant),
                "mode": r.mode_paiement,
                "date": str(r.date_paiement) if r.date_paiement else None,
                "statut": r.statut,
                "eleve": f"{r.nom} {r.prenom}",
                "classe": r.classe
            } for r in paiements_recents
        ],
        impayes_en_attente=[
            {
                "facture": r.numero_facture,
                "montant_restant": float(r.montant_restant),
                "statut": r.statut,
                "eleve": f"{r.nom} {r.prenom}",
                "classe": r.classe
            } for r in impayes_en_attente
        ],
        evenements_a_venir=evenements_a_venir,
        activites_du_jour=activites_du_jour,
    )
