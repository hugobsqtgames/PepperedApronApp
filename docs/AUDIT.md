# Audit du prototype web PepperedApron (V1)

Source analysée : `peppered-apron.zip` (template Manus WebDev). ~6 500 lignes applicatives hors `components/ui`.

## 1. Cartographie

| Couche | Technologie | Remarques |
|---|---|---|
| Front | React 19 + Vite + wouter + Tailwind 4 + shadcn/ui (45 composants, ~30 non utilisés) | SPA web responsive |
| API | Express + tRPC 11 | Un seul fichier `server/routers.ts` (395 l.) |
| Données | MySQL + Drizzle | 10 tables, pas de clés étrangères, pas d'index |
| Stockage | Proxy « Forge » propriétaire Manus → S3 | Upload en base64 via tRPC |
| IA | `invokeLLM` (4 routes), `imageGeneration`, `voiceTranscription`, `AIChatBox` | Coût variable par requête |
| Tests | Vitest, 55 tests | **100 % mockés** (`vi.mock("./db")`) : ne prouvent rien sur la base ni les permissions |

### Pages
Home (grille de 34 catégories en dégradés), Library, CategoryPage, Search, RecipeDetail (+PDF A5, impression), AddRecipe (manuel / import texte IA / import image IA), EditRecipe, Favorites, WeekPlanner (midi/soir), Calendar (mois), ShoppingList, Suggestions (IA), Contact, ComponentShowcase (démo template), NotFound.

### Modèle de données V1
`users, recipes, categories, recipe_categories, ingredients (quantity VARCHAR), steps, favorites, meal_plans (midi|soir), shopping_lists (items en JSON), contact_messages`.

## 2. Problèmes critiques

1. **Aucune authentification** : l'auth a été volontairement retirée (`DEFAULT_USER_ID = 1`). Toutes les données sont globales.
2. **IDOR généralisé** : `recipes.update` / `recipes.delete` n'ont aucune vérification de propriétaire ; n'importe qui peut modifier/supprimer n'importe quelle recette.
3. **Upload public** : `upload.image` accessible sans authentification → hébergement de fichiers arbitraire (vérification de type sur `contentType` déclaré par le client uniquement).
4. **Dépendance LLM** : parsing texte, OCR, suggestions de menus → coût non maîtrisé, à supprimer (exigence produit).
5. **Détection de doublons globale** : `checkDuplicateRecipe` compare avec les recettes de *tous* les utilisateurs (fuite d'information + blocage absurde en multi-utilisateur).
6. **`shoppingList.update` accepte `z.any()`** : aucune validation, JSON arbitraire stocké.
7. **Aucun rate limiting**, aucune validation de longueur côté serveur (titres, textes).
8. **Suppression non transactionnelle** (`deleteRecipe` : 6 requêtes sans transaction) → états incohérents possibles.
9. **Pas d'index** (`ingredients.recipeId`, `favorites.userId`, …) → requêtes lentes à l'échelle.

## 3. Dette technique / mauvaises pratiques

- Quantités stockées en `VARCHAR` → impossible de mettre à l'échelle proprement ; la génération de courses fait `parseFloat("1/2") = 1`.
- Fusion d'ingrédients par `name + unit` en minuscules : « 200 g farine » + « 0,5 kg farine » non fusionnés ; « Oeufs » vs « œufs » distincts.
- `mealType` limité à midi/soir ; pas de petit-déjeuner / goûter.
- Items de courses en JSON dans la liste → pas de synchronisation fine, écrasement concurrent.
- Catégorisation des courses par `includes` naïf (« poivron » contient « poivre » → Épicerie/Fruits selon l'ordre).
- Aucune notion d'offline, de synchronisation, de foyer, de visibilité publique.
- Textes codés en dur en français dans tous les composants ; pas d'i18n.
- Palette de 17 dégradés sans rôle (critique du produit confirmée).
- `ComponentShowcase`, `Map`, `ManusDialog`, `DashboardLayout`, `AIChatBox` : code mort du template.
- `patches/wouter` : patch local fragile.

## 4. À conserver (métier)

- Structure d'une recette (temps prép/cuisson/total, portions, difficulté, saison, notes, astuces, source, groupes d'ingrédients, étapes avec durée).
- Taxonomie de catégories (entrées, plats, desserts, soupes, salades, pâtes…).
- Planning hebdo + vue calendrier mensuelle.
- Génération de la liste de courses depuis le planning, avec regroupement par rayon.
- Recherche multicritère (titre, ingrédient, difficulté, saison, durée max).
- Formulaire de contact.
- Garde-fous upload (taille/type) — à refaire côté serveur réel.

## 5. À abandonner

Toute l'IA, le template Manus (OAuth Manus, Forge, heartbeat, debug-collector), l'export PDF A5 (remplacé par le partage natif + page web de recette), la page Suggestions IA, le code shadcn non utilisé, MySQL (remplacé par PostgreSQL), tRPC (remplacé par une API REST versionnée consommable hors ligne), la détection de doublons globale.

## 6. Conclusion

Le prototype est une maquette fonctionnelle mono-utilisateur. Rien de son architecture n'est réutilisable tel quel pour un produit multi-utilisateurs offline-first. Le **métier** est repris et amélioré dans `packages/core` ; tout le reste est reconstruit. Voir `ARCHITECTURE.md`.
