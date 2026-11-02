# Notes pour l'équipe App Review

À copier dans App Store Connect → Version → Informations utiles à la vérification de l'app → Remarques. Texte en anglais (langue de travail d'App Review), 3833 caractères sur 4 000.

---

PepperedApron is a free recipe book, meal planner and grocery list. No account, no sign-in, no server, no ads, no in-app purchase, no analytics, no tracking. Data stays on the device and, if iCloud is on, in the user's private iCloud container. Nothing needs to be set up to review the app.

QUICK TEST (about 5 minutes)
1. First launch: swipe through the intro, type a first name (or skip), tap "Add the 10 recipes" to get classic recipes to try, then "Later" on the share tutorial.
2. Open a recipe: change the servings (quantities and steps adjust), tap "Start cooking" for step-by-step cook mode. Start a timer from a step: it shows on the Lock Screen / Dynamic Island (Live Activity) and ends when the timer or the recipe ends.
3. Import (main feature): in Safari, open any recipe page (e.g. a large cooking site), tap Share > PepperedApron. The app reads the public page, saves the recipe and opens "Check the recipe" to fix a line in one tap. The + button also offers: From a link, From text, From a photo (printed or handwritten recipe, read on device), My latest screenshot, A PDF, Dictate a recipe, New recipe.
4. Planning tab: add recipes to days, then "Add the week to my shopping list". Groceries tab: items are sorted by aisle; the list can be sent to Apple Reminders.
5. Pantry (basket icon on the home screen): scan a product barcode or photograph a receipt.
6. Siri: "What's for dinner in PepperedApron". Widgets: tonight's meal, next meal, grocery list, random recipe, timer.

SHARING FROM SOCIAL APPS
Users can share a public post (TikTok, Instagram, YouTube, Pinterest, Facebook) to the app. The app reads only what any logged-out browser sees: no login, no cookies, no private content, no automation of the user's account. Many creators say the recipe out loud instead of writing it. The app then uses the public subtitles of the post when there are some; otherwise it downloads the public video temporarily to its cache, transcribes the speech on the device (Apple Speech, requiresOnDeviceRecognition = true), and deletes the file right away. The video is never played, saved, shown or exported. Only the recipe text and one still picture are kept in the user's private recipe book, with a link to the original post and its author.
If a recipe still comes without steps, "Complete with the video" lets the user pick a video they saved themselves; it is transcribed on the device too.

PERMISSIONS (each asked only when the related feature is used, never at launch)
- Camera: recipe photo, printed recipe, receipt, barcode.
- Photos: choose a picture or a video, latest screenshot (system picker).
- Microphone + Speech Recognition: dictating a recipe, optional voice commands in cook mode ("next"), transcription of a video. Always on device.
- Reminders: send the grocery list to a list the user chooses.
- Notifications: timers and optional reminders. Local notifications only, no push.

NETWORK
The app only contacts: the page or post the user shares; the free Open Food Facts database for a scanned barcode (only the barcode number is sent); and Apple's own captive.apple.com check, to tell "no network" from "site not answering" during an import. There is no PepperedApron server.

CONTENT AND AGE RATING
Recipes come from the user. The 10 starter recipes were written for the app. Drink pairings are alcohol-free by default; wine, beer or cider are suggested only if the user turns on "Also suggest wine, beer or cider" in settings (marked "For adults only").

PRIVACY
Data Not Collected. Privacy policy: https://hugobsqtgames.github.io/PepperedApronApp/en/privacy/ (also in the app: Profile > Privacy). Profile > My data: "Export my data" and "Delete all my data".

Works offline except web imports, barcode lookups and iCloud sync. iPhone and iPad, French and English.
Contact: hugobsqt.collab@gmail.com
