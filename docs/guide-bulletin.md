Implémente un système de calcul des moyennes conforme aux pratiques courantes des établissements scolaires guinéens, tout en restant entièrement configurable.

1. Calcul de la moyenne d’une matière

* Chaque matière peut comporter trois types d’évaluations : Écrit, Oral et Composition.
* Par défaut, les pondérations sont :
    * Écrit = coefficient 1
    * Oral = coefficient 1
    * Composition = coefficient 2
* La formule par défaut est :
    Moyenne de la matière = (Écrit + Oral + (Composition × 2)) ÷ 4
* Le 4 correspond à la somme des pondérations (1 + 1 + 2).
* Le coefficient propre de la matière (Mathématiques = 4, Français = 3, etc.) ne doit pas intervenir dans ce calcul.

2. Calcul de la moyenne générale

* Une fois la moyenne de chaque matière obtenue, calculer les points :
    Points = Moyenne de la matière × Coefficient de la matière.
* Ensuite :
    * Total des points = somme de tous les points.
    * Total des coefficients = somme des coefficients des matières.
    * Moyenne générale = Total des points ÷ Total des coefficients.

3. Configuration

* Les pondérations des évaluations (Écrit, Oral, Composition) doivent être configurables par l’administrateur de l’établissement.
* Les coefficients des matières doivent également être configurables.
* Le système doit fonctionner pour le primaire, le collège et le lycée sans modifier le code : seuls les paramètres de l’établissement doivent changer.
* Si une évaluation (par exemple l’Oral) n’est pas utilisée dans un établissement, le système doit pouvoir la désactiver automatiquement et recalculer la moyenne selon les pondérations restantes.

Concevoir l’architecture de manière flexible afin que le logiciel puisse s’adapter aux différents règlements scolaires des établissements de la République de Guinée.



Pour ton projet SmartSchool

Je te conseille de générer un bulletin beaucoup plus moderne tout en restant conforme aux habitudes des écoles guinéennes.

Le bulletin pourrait contenir :

* ✅ Logo de l’école
* ✅ Photo de l’élève
* ✅ QR Code permettant de vérifier l’authenticité du bulletin
* ✅ Informations complètes de l’élève
* ✅ Tableau des notes (Écrit, Oral, Composition, Moyenne, Coefficient, Points)
* ✅ Total des points
* ✅ Total des coefficients
* ✅ Moyenne générale
* ✅ Rang de l’élève
* ✅ Nombre total d’élèves
* ✅ Moyenne de la classe
* ✅ Meilleure moyenne
* ✅ Plus faible moyenne
* ✅ Taux de présence ou d’absences
* ✅ Graphique des performances par matière
* ✅ Appréciation du professeur principal
* ✅ Décision du conseil de classe
* ✅ Signatures numériques
* ✅ Cachet de l’établissement
* ✅ QR Code de vérification

Avec ce format, ton logiciel sera adapté aux écoles guinéennes tout en offrant un bulletin plus professionnel et moderne que les modèles papier traditionnels.