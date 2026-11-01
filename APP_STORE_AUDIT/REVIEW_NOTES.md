# Notes pour l'équipe App Review

À copier dans App Store Connect → Version → Informations pour la vérification → Notes. Texte en anglais (langue de travail d'App Review).

---

PepperedApron is a free recipe manager, meal planner and grocery list. There is no account, no server, no ads, no in-app purchase and no analytics: all data stays on the device and, if iCloud is on, in the user's private iCloud container. No sign-in is needed to review the app.

HOW TO TEST
1. First launch: swipe through the intro, enter a first name (or skip), accept the 10 welcome recipes, then tap "Later" on the share tutorial. The home screen shows tonight's idea and the recipe library.
2. Recipes: open a recipe, change the number of servings (quantities and steps adjust), tap "Cook" for step-by-step cook mode, start a timer from a step (it appears on the Lock Screen / Dynamic Island as a Live Activity and ends when the timer ends or the recipe is finished).
3. Import (main feature): in Safari, open any recipe web page, tap Share → PepperedApron. The recipe is read from the public page, saved, and a "Check the recipe" screen opens. The same works from the share sheet of other apps (public posts only) and with "+ → Paste a link / Photo / Text / Dictate".
4. Plan & groceries: Planning tab → add recipes to days → "Add the week to groceries"; the Groceries tab sorts items by aisle; the list can be sent to Apple Reminders.
5. Pantry: Profile → Pantry → scan a product barcode (only the barcode number is sent to the free Open Food Facts database) or photograph a receipt (read on device).
6. Siri / Shortcuts: "What's for dinner in PepperedApron". Widgets: Tonight, Next meal, Grocery list, Random recipe, Timer.

PERMISSIONS (all requested only when the related feature is used)
Camera (recipe photo, printed recipe, receipt, barcode), Photos (choose a picture, latest screenshot), Microphone + Speech Recognition (dictating a recipe, optional voice commands in cook mode; recognition runs on device with requiresOnDeviceRecognition), Reminders (send the grocery list), Notifications (timers and optional reminders; local notifications only).

CONTENT FROM OTHER SERVICES
When the user shares a public post or page, the app reads what any browser would see (no login, no cookies). If the recipe is only spoken in a public video, the video is downloaded temporarily to the app's cache, its speech is transcribed on the device, then the file is deleted; the video is never played back, saved or exported. Only the recipe text and a still picture are kept in the user's private recipe book, with a link to the original source.

PRIVACY
Data Not Collected. Privacy policy: https://hugobsqtgames.github.io/PepperedApronApp/en/privacy/ (also in the app: Profile → Privacy). Users can export and delete all their data in Profile → My data.
