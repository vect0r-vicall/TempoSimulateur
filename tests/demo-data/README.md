# Données de démonstration (SYNTHÉTIQUES)

Ces fichiers sont des données **synthétiques** générées par `scripts/gen-demo-data.mjs`.
Ce n'est pas une consommation réelle. Ils reproduisent le format des exports EDF
(index et puissance max) et servent aux contrôles optionnels `TEMPO_DEMO_DATA=1 npm test`
et à essayer le simulateur (glisser-déposer les deux fichiers).

Régénération (déterministe, graine fixe) : `node scripts/gen-demo-data.mjs`
