# Actions qui demandent ton intervention

Elles demandent soit tes accès Apple, soit une décision humaine ou juridique, soit un appareil physique. Rien ici n'a été fait à ta place.

## Décisions qui influencent le risque de refus

1. **Captures d'écran et vidéo d'aperçu** (guidelines 2.3.3 et 2.3.4). *Risque : moyen.*
   - Les visuels en ligne sont des reconstitutions de l'interface en HTML, pas des captures réelles. Certains détails diffèrent de l'app actuelle (titre de l'accueil, texte qui passe sous la barre d'onglets sur la 1re capture).
   - Pour la vidéo, Apple écrit : *« previews may only use video screen captures of the app itself »*.
   - Tu as demandé de ne rien changer : je n'y ai pas touché.
   - Si App Review les refuse, il faudra :
     - faire de vraies captures sur iPhone et iPad (build TestFlight, bibliothèque de démo importée) ;
     - retirer la vidéo, ou la remplacer par un enregistrement d'écran réel.
2. **Vidéos des réseaux sociaux** (guideline 5.2.3). *Risque : faible à moyen.*
   - Pour une publication dont la recette n'est dite qu'à l'oral, la vidéo publique est téléchargée temporairement, transcrite sur l'appareil, puis supprimée.
   - Elle n'est jamais lisible ni enregistrable : c'est expliqué dans les notes de vérification.
   - Si Apple objecte, deux options :
     - désactiver l'écoute des vidéos et garder seulement la légende et l'image ;
     - obtenir l'autorisation des plateformes.
3. **Classification d'âge.** Les accords avec alcool sont désormais désactivés par défaut. La réponse honnête au questionnaire reste « Alcool : peu fréquent », ce qui donne **13+**.
   - Pour viser **4+**, il faut supprimer complètement les suggestions de vin, de bière et de cidre (une heure de travail). Dis-moi si tu le veux.
   - Vérifie aussi que la classification déjà saisie dans App Store Connect correspond au tableau de [APP_STORE_CONNECT.md](APP_STORE_CONNECT.md). L'ancienne fiche indiquait 4+.

## Dans App Store Connect (tes identifiants)

4. **Digital Services Act : statut de commerçant.** Business → Agreements → Compliance → Digital Services Act.
   - App gratuite, sans pub ni achat, publiée à titre personnel : le statut « non commerçant » est plausible, mais c'est à toi d'évaluer (Apple ne donne pas d'avis juridique).
   - Si tu te déclares commerçant, ton adresse, ton téléphone et ton e-mail seront affichés sur la fiche dans l'UE.
5. **Questionnaire de classification d'âge 2026** : réponses dans APP_STORE_CONNECT.md.
6. **App Privacy** : « Data Not Collected », et Tracking = Non.
7. **Droits sur les contenus** : la réponse « contenu tiers » est expliquée dans APP_STORE_CONNECT.md. La validation juridique t'appartient.
8. **Informations pour la vérification** :
   - ton nom, ton téléphone et ton e-mail (jamais stockés dans le dépôt) ;
   - « connexion requise » = Non ;
   - les notes = contenu de [REVIEW_NOTES.md](REVIEW_NOTES.md).
9. **Copyright** : remplacer « © 2026 PepperedApron » par ton nom ou celui de ta structure, si tu préfères.
10. **Choisir le build à soumettre**, puis **soumettre pour vérification**. C'est ta décision ; je ne soumets jamais.

## Sur ton iPhone et ton iPad (je n'ai ni Xcode ni simulateur)

11. Installer le prochain build TestFlight et refaire le parcours du reviewer de REVIEW_NOTES.md :
    - premier lancement, import depuis Safari et depuis une app, mode cuisine avec minuteur ;
    - fin de recette : l'île dynamique doit disparaître ;
    - widgets, Siri, scan d'un code-barres, ticket de caisse ;
    - envoi vers Rappels ;
    - sauvegarde et restauration.
12. Vérifier sur **iPad** : l'app est déclarée compatible, les reviewers testent souvent dessus.
13. Vérifier les **widgets en anglais** : iPhone en anglais, galerie de widgets et Raccourcis. Ces fichiers de localisation sont neufs et n'ont pas pu être compilés ici.
14. Mode sombre, très grandes tailles de texte, VoiceOver : un passage rapide sur les écrans principaux.

## Facultatif

15. Mettre à jour le site : il se publie automatiquement depuis la branche à chaque push ; vérifier que `/fr/privacy/` affiche la date du 1er novembre 2026.
16. Avis de sécurité restants dans les outils de build Expo (non embarqués dans l'app) : ils disparaîtront avec une future mise à jour d'Expo.
