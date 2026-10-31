/**
 * Texts of the website, in French (reference version for legal documents) and English. Have them reviewed by a lawyer before
 * publication. `p` = publisher details (see build.mjs).
 */
const UPDATED = '2026-10-31';

export const UI = {
  fr: {
    home: 'Accueil',
    support: 'Aide',
    privacy: 'Confidentialité',
    terms: 'Conditions d’utilisation',
    legal: 'Mentions légales',
    tagline: 'Vos recettes, votre planning de repas et vos listes de courses, au même endroit.',
    features: [
      'Toutes vos recettes, avec ou sans photo, classées et faciles à retrouver.',
      'Import depuis un site, TikTok, Instagram, une photo ou un texte, sans intelligence artificielle.',
      'Planning de la semaine et liste de courses générée automatiquement, rangée par rayon.',
      'Mode cuisine avec minuteurs, widgets et Live Activities.',
      'Aucun compte : vos données restent sur votre appareil et dans votre iCloud.',
    ],
    free: 'Gratuit, sans publicité, sans abonnement.',
  },
  en: {
    home: 'Home',
    support: 'Help',
    privacy: 'Privacy',
    terms: 'Terms of use',
    legal: 'Legal notice',
    tagline: 'Your recipes, meal plan and shopping lists, in one place.',
    features: [
      'All your recipes, with or without a photo, organised and easy to find.',
      'Import from a website, TikTok, Instagram, a photo or a text, without artificial intelligence.',
      'Weekly meal plan and a shopping list built automatically, sorted by aisle.',
      'Cook mode with timers, widgets and Live Activities.',
      'No account: your data stays on your device and in your iCloud.',
    ],
    free: 'Free, with no ads and no subscription.',
  },
};

export const FAQ = {
  fr: {
    title: 'Aide et assistance',
    intro: 'Les réponses aux questions les plus fréquentes sur PepperedApron.',
    contact: 'Une autre question, un bug, une idée ? Écrivez-nous :',
    qa: [
      [
        'Faut-il créer un compte ?',
        'Non. Ouvrez l’app et commencez : il n’y a ni compte, ni mot de passe.',
      ],
      [
        'Où sont enregistrées mes recettes ?',
        'Sur votre appareil. Elles sont aussi synchronisées dans votre iCloud privé (Réglages → Mes données). Personne d’autre n’y a accès, pas même nous.',
      ],
      [
        'Comment retrouver mes recettes sur un nouveau téléphone ?',
        'Sur iPhone et iPad, gardez la synchronisation iCloud activée et utilisez le même identifiant Apple : tout revient automatiquement. Sans iCloud : Réglages → Mes données → Exporter, puis Importer sur le nouvel appareil.',
      ],
      [
        'Puis-je utiliser l’app hors ligne ?',
        'Oui. Seuls l’import depuis un lien, le scan d’un code-barres et la synchronisation iCloud ont besoin d’internet.',
      ],
      [
        'Comment importer depuis TikTok ou Instagram ?',
        'Dans l’app TikTok ou Instagram, touchez Partager puis PepperedApron. Nous récupérons le lien, la description et l’image quand la plateforme les rend publiques ; vous complétez le reste.',
      ],
      [
        'L’app est-elle payante ?',
        'Non. PepperedApron est gratuite, sans publicité et sans abonnement.',
      ],
      [
        'Comment effacer mes données ?',
        'Réglages → Mes données → Effacer toutes mes données. Supprimer l’app efface aussi les données de l’appareil ; les données iCloud se gèrent dans Réglages → [votre nom] → iCloud.',
      ],
    ],
  },
  en: {
    title: 'Help & support',
    intro: 'Answers to the most common questions about PepperedApron.',
    contact: 'Another question, a bug, an idea? Write to us:',
    qa: [
      ['Do I need an account?', 'No. Open the app and start: there is no account and no password.'],
      [
        'Where are my recipes stored?',
        'On your device. They are also synced to your private iCloud (Settings → My data). Nobody else can access them, not even us.',
      ],
      [
        'How do I get my recipes on a new phone?',
        'On iPhone and iPad, keep iCloud sync on and use the same Apple Account: everything comes back automatically. Without iCloud: Settings → My data → Export, then Import on the new device.',
      ],
      [
        'Can I use the app offline?',
        'Yes. Only importing from a link, scanning a barcode and iCloud sync need the internet.',
      ],
      [
        'How do I import from TikTok or Instagram?',
        'In TikTok or Instagram, tap Share, then PepperedApron. We fetch the link, description and image when the platform makes them public; you complete the rest.',
      ],
      ['Is the app paid?', 'No. PepperedApron is free, with no ads and no subscription.'],
      [
        'How do I delete my data?',
        'Settings → My data → Delete all my data. Deleting the app also erases the data on the device; iCloud data is managed in Settings → [your name] → iCloud.',
      ],
    ],
  },
};

/** How to write to the publisher: their e-mail address, or else the contact page. */
export const contactLink = (p, lang = 'fr') =>
  p.email
    ? `<a href="mailto:${p.email}">${p.email}</a>`
    : `<a href="${p.url}">${lang === 'fr' ? 'formulaire de contact' : 'contact page'}</a>`;
const mail = (p) => contactLink(p, 'fr');
const mailEn = (p) => contactLink(p, 'en');
/** No address published: a non-professional publisher, known to the host (LCEN art. 6-III-2). */
const addr = (p, lang) =>
  p.address ||
  (lang === 'fr'
    ? 'Éditeur non professionnel : coordonnées communiquées à l’hébergeur (art. 6-III-2 de la LCEN)'
    : 'Non-professional publisher: contact details given to the host (French LCEN, art. 6-III-2)');

export const LEGAL = {
  fr: {
    legal: (p) => ({
      title: 'Mentions légales',
      html: `<h1>Mentions légales</h1><div class="card"><p><b>Éditeur :</b> ${p.publisher}<br>${addr(p, 'fr')}<br>Contact : ${mail(p)}</p><p><b>Hébergement du site :</b> ${p.hosting}</p><p>L’application PepperedApron ne dispose d’aucun serveur : les données des utilisateurs sont stockées sur leurs appareils et, s’ils l’activent, dans leur propre iCloud (Apple).</p><p>L’application, ce site et leur contenu graphique sont protégés par le droit de la propriété intellectuelle.</p></div>`,
    }),
    terms: (p) => ({
      title: "Conditions d'utilisation",
      html: `<h1>Conditions générales d'utilisation</h1><p class="muted">Mise à jour : ${UPDATED}</p><div class="card">
<h2>1. Objet</h2><p>PepperedApron est une application gratuite permettant d'organiser ses recettes, de planifier ses repas et de gérer ses listes de courses. Elle ne contient aucune publicité. Aucun compte n'est nécessaire.</p>
<h2>2. Vos données</h2><p>Vos contenus sont enregistrés uniquement sur votre appareil et, si vous activez la synchronisation, dans votre iCloud, service fourni par Apple selon ses propres conditions. L'éditeur n'y a pas accès et ne peut pas les restaurer : pensez à garder iCloud activé ou à exporter régulièrement une sauvegarde (Réglages → Mes données).</p>
<h2>3. Contenus</h2><p>Vous restez propriétaire des recettes et photos que vous ajoutez. Les contenus importés depuis d'autres services restent soumis aux droits de leurs auteurs : ils sont destinés à votre usage personnel.</p>
<h2>4. Responsabilité</h2><p>Vérifiez les allergènes, temps de cuisson et températures des recettes. L'application est fournie « en l'état », sans garantie de disponibilité ; l'éditeur ne saurait être tenu responsable d'une perte de données stockées sur votre appareil ou votre iCloud.</p>
<h2>5. Droit applicable</h2><p>Droit français. Contact : ${mail(p)}.</p></div>`,
    }),
    privacy: (p) => ({
      title: 'Politique de confidentialité',
      html: `<h1>Politique de confidentialité</h1><p class="muted">Mise à jour : ${UPDATED}</p><div class="card">
<h2>En bref</h2><p>PepperedApron n'a ni compte, ni serveur, ni publicité, ni mesure d'audience. Vos recettes, photos, listes, planning et réglages restent sur votre appareil et, si vous l'activez, dans votre iCloud privé. L'éditeur ne reçoit, ne stocke et ne vend aucune de ces données.</p>
<h2>Responsable de traitement</h2><p>${p.publisher}, ${addr(p, 'fr')} — ${mail(p)}</p>
<h2>Données sur votre appareil et dans iCloud</h2><p>Vos contenus sont stockés localement. Sur iPhone et iPad, la synchronisation iCloud (activée par défaut, désactivable dans Réglages → Mes données) les copie dans le conteneur privé de l'app dans votre compte iCloud, géré par Apple (voir la politique de confidentialité d'Apple). L'éditeur n'y a pas accès. Elles sont aussi incluses dans la sauvegarde iCloud de l'appareil si vous l'avez activée.</p>
<h2>Import depuis un lien</h2><p>Lorsque vous importez une recette depuis un lien, l'app contacte directement le site concerné (ou le service oEmbed de TikTok ou YouTube), comme le ferait un navigateur. Ce site reçoit alors votre adresse IP selon sa propre politique.</p>
<h2>Photos et texte</h2><p>L'appareil photo et la photothèque ne sont utilisés que lorsque vous le demandez. La lecture du texte d'une photo se fait sur l'appareil ; rien n'est envoyé.</p>
<h2>Codes-barres</h2><p>Lorsque vous scannez le code-barres d’un produit pour votre placard, l’app envoie uniquement ce numéro à Open Food Facts (base de données libre et gratuite) pour obtenir le nom et le format du produit. Ce service reçoit alors votre adresse IP selon sa propre politique. La caméra n’enregistre ni image ni son.</p>
<h2>Recettes envoyées par lien</h2><p>Une recette envoyée « par un lien » est contenue dans le lien lui-même, après le signe « # ». Cette partie du lien n’est jamais transmise au serveur de ce site : la page la lit et l’affiche dans le navigateur de la personne qui l’ouvre.</p>
<h2>Micro, voix et Rappels</h2><p>Le micro n'est utilisé que si vous dictez une recette. Votre voix, comme le son d'une vidéo importée, est transcrite par la reconnaissance vocale de l'iPhone, sur l'appareil, puis l'enregistrement est supprimé ; rien n'est envoyé. L'accès à l'app Rappels n'est demandé que si vous y envoyez votre liste de courses.</p>
<h2>Nous contacter</h2><p>Si vous nous écrivez par e-mail, nous utilisons votre adresse et votre message uniquement pour vous répondre, et les conservons au plus 3 ans.</p>
<h2>Vos droits</h2><p>Vos contenus sont sous votre contrôle : export et suppression dans Réglages → Mes données. Pour toute question ou pour exercer vos droits d'accès, de rectification, d'effacement, et d'opposition : ${mail(p)}. Réclamation possible auprès de la CNIL (cnil.fr).</p>
<h2>Enfants</h2><p>L'application ne collecte sciemment aucune donnée personnelle d'enfants.</p>
<h2>Ce site</h2><p>Ce site n'utilise ni cookie ni traceur.</p></div>`,
    }),
  },
  en: {
    legal: (p) => ({
      title: 'Legal notice',
      html: `<h1>Legal notice</h1><div class="card"><p><b>Publisher:</b> ${p.publisher}<br>${addr(p, 'en')}<br>Contact: ${mailEn(p)}</p><p><b>Website hosting:</b> ${p.hosting}</p><p>The PepperedApron app has no server: user data is stored on their devices and, if they turn it on, in their own iCloud (Apple).</p><p>The app, this website and their artwork are protected by intellectual property law.</p></div>`,
    }),
    terms: (p) => ({
      title: 'Terms of use',
      html: `<h1>Terms of use</h1><p class="muted">Updated: ${UPDATED}</p><div class="card">
<h2>1. Service</h2><p>PepperedApron is a free app, without ads, to organise recipes, plan meals and manage shopping lists. No account is needed.</p>
<h2>2. Your data</h2><p>Your content is stored only on your device and, if you turn on sync, in your iCloud, a service provided by Apple under its own terms. The publisher has no access to it and cannot restore it: keep iCloud on or export a backup regularly (Settings → My data).</p>
<h2>3. Content</h2><p>You keep ownership of the recipes and photos you add. Content imported from other services remains subject to its authors' rights and is meant for your personal use.</p>
<h2>4. Liability</h2><p>Check allergens, cooking times and temperatures. The app is provided "as is", without any availability guarantee; the publisher cannot be held liable for the loss of data stored on your device or in your iCloud.</p>
<h2>5. Governing law</h2><p>French law. Contact: ${mailEn(p)}.</p></div>`,
    }),
    privacy: (p) => ({
      title: 'Privacy policy',
      html: `<h1>Privacy policy</h1><p class="muted">Updated: ${UPDATED}</p><div class="card">
<h2>In short</h2><p>PepperedApron has no account, no server, no ads and no analytics. Your recipes, photos, lists, meal plan and settings stay on your device and, if you turn it on, in your private iCloud. The publisher never receives, stores or sells any of this data.</p>
<h2>Controller</h2><p>${p.publisher}, ${addr(p, 'en')} — ${mailEn(p)}</p>
<h2>Data on your device and in iCloud</h2><p>Your content is stored locally. On iPhone and iPad, iCloud sync (on by default, can be turned off in Settings → My data) copies it to the app's private container in your iCloud account, operated by Apple (see Apple's privacy policy). The publisher has no access to it. They are also included in the device's iCloud Backup if you turned it on.</p>
<h2>Importing from a link</h2><p>When you import a recipe from a link, the app contacts that website (or the TikTok or YouTube oEmbed service) directly, like a browser would. That website then receives your IP address under its own policy.</p>
<h2>Photos and text</h2><p>The camera and photo library are only used when you ask. Reading the text of a photo happens on the device; nothing is sent.</p>
<h2>Barcodes</h2><p>When you scan a product’s barcode for your pantry, the app sends only that number to Open Food Facts (a free, open database) to get the product’s name and size. That service then receives your IP address under its own policy. The camera records no picture and no sound.</p>
<h2>Recipes sent as a link</h2><p>A recipe sent “as a link” is contained in the link itself, after the “#” sign. That part of the link is never sent to this website’s server: the page reads it and shows it in the browser of the person who opens it.</p>
<h2>Microphone, voice and Reminders</h2><p>The microphone is only used if you dictate a recipe. Your voice, like the sound of an imported video, is transcribed by the iPhone's speech recognition on the device, then the recording is deleted; nothing is sent. Access to the Reminders app is only requested if you send your shopping list there.</p>
<h2>Contacting us</h2><p>If you e-mail us, we use your address and message only to answer you and keep them for at most 3 years.</p>
<h2>Your rights</h2><p>Your content is under your control: export and deletion in Settings → My data. For any question, or to exercise your rights of access, rectification, erasure, and objection: ${mailEn(p)}. You may lodge a complaint with your data protection authority.</p>
<h2>Children</h2><p>The app does not knowingly collect personal data from children.</p>
<h2>This website</h2><p>This website uses no cookies or trackers.</p></div>`,
    }),
  },
};
