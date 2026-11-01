# Informations App Store Connect (prêtes à renseigner)

La source des textes est [`docs/store/listings.json`](../docs/store/listings.json). Le workflow « App Store listing » les envoie déjà ; ce qui suit récapitule chaque champ.

## Identité

| Champ | Valeur |
|---|---|
| Bundle ID | `app.pepperedapron.com` |
| SKU / Apple ID | ASC App ID `6829014530` |
| Version | 2.0.0 (numéro de build géré par EAS, `autoIncrement`) |
| Langue principale | Français (France) ; anglais (États-Unis) en seconde langue |
| Nom (FR, 30 car. max) | `PepperedApron: Recettes & Menu` (30) |
| Nom (EN) | `PepperedApron: Recipes & Meals` (30) |
| Sous-titre (FR) | `Recettes, planning et courses` (29) |
| Sous-titre (EN) | `Recipes, meal plans, groceries` (30) |
| Mots-clés (FR, 100 car. max) | `recette,cuisine,menu,semaine,liste,courses,planning,repas,livre,famille,frigo,batch,cooking,dîner` (97) |
| Mots-clés (EN) | `recipe,cooking,meal,planner,grocery,shopping,list,week,cookbook,family,fridge,prep,dinner,food` (94) |
| Texte promotionnel | Voir `listings.json` (154 / 143 car., modifiable sans nouvelle version) |
| Description | Voir `listings.json`. **Corrigée** : « hors ligne, sauf l'import d'un lien et la recherche d'un code-barres » |
| Catégorie principale / secondaire | Cuisine et boissons (Food & Drink) / Style de vie (Lifestyle) |
| Prix | Gratuit, dans tous les pays |
| Achats intégrés | Aucun |
| URL d'assistance | `https://hugobsqtgames.github.io/PepperedApronApp/fr/support/` (EN : `/en/support/`) — vérifiée (200) |
| URL marketing | `https://hugobsqtgames.github.io/PepperedApronApp/fr/` |
| URL de confidentialité | `https://hugobsqtgames.github.io/PepperedApronApp/fr/privacy/` (EN : `/en/privacy/`) — vérifiée (200) |
| Copyright | `© 2026 PepperedApron`. Recommandé : ton nom ou le nom de ta structure, par exemple `© 2026 Hugo Busquet` |

Les noms et mots-clés ne contiennent aucune marque tierce (guideline 2.3.7). TikTok et Instagram apparaissent seulement dans la description et le texte promotionnel, pour décrire une compatibilité réelle.

## App Privacy (Confidentialité de l'app)

- Collecte de données : **Non, nous ne collectons pas de données** (justification dans [PRIVACY_AUDIT.md](PRIVACY_AUDIT.md) §3).
- Suivi (tracking) : **Non**.

## Classification par âge (questionnaire 2026)

| Question | Réponse |
|---|---|
| Contrôles parentaux / vérification d'âge | Non / Non |
| Accès web non restreint | **Non** : seules les pages du site de l'app s'ouvrent dans l'app ; les recettes s'ouvrent dans Safari |
| Contenu généré par les utilisateurs | **Non** : les recettes restent privées ; pas de diffusion publique |
| Réseau social / messagerie | Non / Non |
| Publicité | Non |
| Grossièretés, horreur | Aucun |
| Alcool, tabac, drogues (références) | **Peu fréquent / léger** : suggestions de vin, bière ou cidre désactivées par défaut, et recettes pouvant citer du vin. Résultat attendu : **13+**. Pour viser 4+, voir REMAINING_ACTIONS (supprimer complètement les accords avec alcool) |
| Informations médicales | Aucune |
| Santé, bien-être (régimes, calories) | Aucun : étiquettes végétarien / sans gluten seulement, sans conseil |
| Sexualité, nudité, violence, armes | Aucun |
| Jeux de hasard, concours, loot boxes | Aucun |

## Chiffrement (Export Compliance)

`ITSAppUsesNonExemptEncryption = false` est déjà dans le build : la question n'est plus posée. L'app utilise seulement le HTTPS du système.

## Droits sur les contenus (Content Rights)

« Votre app contient-elle, affiche-t-elle ou accède-t-elle à du contenu tiers ? » → **Oui**. L'app lit, à la demande de l'utilisateur, des pages publiques de sites et de réseaux sociaux qu'il partage, pour son carnet personnel, ainsi que la base libre Open Food Facts (licence ODbL). Les photos intégrées viennent d'Unsplash (licence Unsplash). Coche « Oui, j'ai les droits nécessaires » seulement si tu l'estimes juste (décision juridique : voir REMAINING_ACTIONS).

## Règlements de l'App Store (UE)

- **Digital Services Act, statut de commerçant** : à déclarer (Business → Agreements → Compliance, puis App Information → App Store Regulations and Permits). Décision dans REMAINING_ACTIONS.

## Accessibilité (étiquettes)

Voir [`docs/store/README.md`](../docs/store/README.md) : VoiceOver, Contrôle vocal, Texte plus grand, Interface sombre, Différencier sans couleur, Contraste suffisant, Réduire les animations, pour iPhone et iPad.

## Notes de version (« Nouveautés »)

Champ non demandé pour une première version publiée. Texte prêt pour les mises à jour :

> FR : Démarrage guidé, 10 recettes pour commencer, écran « Vérifiez la recette » après un import, import Facebook et Threads, minuteurs qui rappellent de retourner ou de remuer, sauvegarde automatique chaque semaine. Corrections : mode cuisine sur les recettes anciennes, minuteur qui restait dans la Dynamic Island.
>
> EN: Guided start, 10 recipes to begin with, a "Check the recipe" screen after an import, Facebook and Threads import, timers that remind you to flip or stir, weekly automatic backup. Fixes: cook mode on older recipes, a timer that stayed in the Dynamic Island.

## Informations pour la vérification (App Review)

- Connexion requise : **Non** (aucun compte, aucun identifiant de démonstration nécessaire).
- Coordonnées : nom, téléphone et e-mail à saisir à la main (non stockés dans le dépôt).
- Notes : copier [REVIEW_NOTES.md](REVIEW_NOTES.md).

## Visuels

- **Icône** : 1024×1024 RVB, sans alpha (vérifiée).
- **Captures** : iPhone 6,9″ (1320×2868) et iPad 13″ (2064×2752), FR et EN, 7 chacune, déjà en ligne.
- **Aperçu vidéo** : présent.
- Ces visuels n'ont pas été modifiés, à ta demande. Le risque de refus est expliqué dans REMAINING_ACTIONS.
