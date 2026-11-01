# Checklist de publication

✅ = fait et vérifié ici · ⬜ = à faire par toi (voir REMAINING_ACTIONS)

## Build

- ✅ Variante production : bundle `app.pepperedapron.com`, nom « PepperedApron », version 2.0.0, numéro de build incrémenté par EAS
- ✅ Xcode 26 / SDK iOS 26 : builds EAS acceptés par App Store Connect
- ✅ Entitlements : App Group, iCloud (conteneur privé, Production), aucun push
- ✅ Info.plist : 6 textes d'autorisation FR et EN, chiffrement = `false`, aucune exception ATS, aucun mode d'arrière-plan, pas de réseau local
- ✅ Manifestes de confidentialité : app, partage, widgets, Siri (`pnpm qa:native` : 70 contrôles en production)
- ✅ Phase de bundle JavaScript d'Xcode exécutée comme sur EAS (`qa:native`)
- ✅ Aucun code de débogage accessible, aucun écran caché, aucun secret dans le dépôt
- ✅ Télémétrie Expo désactivée, pas de mises à jour OTA
- ✅ Build de production avec ces corrections lancé sur EAS → TestFlight (sans soumission)

## Qualité

- ✅ Lint, types, format (`pnpm verify`)
- ✅ Tests : 5 (site) + 354 (logique) + 70 (base et synchro) + 258 (app)
- ✅ Campagne de stress dev et prod (voir TESTS_EFFECTUES.md)
- ⬜ Parcours manuel sur iPhone et iPad (REMAINING_ACTIONS 11 à 14)

## Fiche App Store

- ✅ Nom, sous-titre, mots-clés dans les limites et sans marque tierce
- ✅ Description exacte (correction « hors ligne »)
- ✅ URL d'assistance et de confidentialité en ligne (200)
- ✅ Politique de confidentialité à jour (1er novembre 2026), lien dans l'app
- ✅ Icône 1024×1024 sans alpha
- ✅ Captures iPhone 6,9″ et iPad 13″, FR et EN (laissées telles quelles à ta demande)
- ⬜ Classification d'âge 2026 (réponses dans APP_STORE_CONNECT.md)
- ⬜ App Privacy : « Data Not Collected »
- ⬜ Statut DSA (commerçant ou non)
- ⬜ Informations pour App Review : coordonnées et notes (REVIEW_NOTES.md)
- ⬜ Copyright (ton nom, si tu préfères)
- ⬜ Prix gratuit et pays de disponibilité

## Soumission (toi seul)

- ⬜ Sélectionner le build dans la version 2.0.0
- ⬜ « Ajouter pour vérification », puis « Soumettre » (publication manuelle recommandée)
- ⬜ Surveiller les messages d'App Review dans App Store Connect
