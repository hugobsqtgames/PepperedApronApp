/**
 * Texts of the website. Legal documents exist in French (reference version) and English; the
 * other languages show the English version with a notice. Have them reviewed by a lawyer before
 * publication. `p` = publisher details (see build.mjs).
 */
const UPDATED = '2026-10-29';

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
    free: 'Gratuit, financé par une publicité discrète, jamais pendant que vous cuisinez.',
    englishOnly: '',
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
    free: 'Free, funded by unobtrusive ads, never while you cook.',
    englishOnly: '',
  },
  es: {
    home: 'Inicio',
    support: 'Ayuda',
    privacy: 'Privacidad',
    terms: 'Condiciones de uso',
    legal: 'Aviso legal',
    tagline:
      'Tus recetas, tu planificación de comidas y tus listas de la compra, en un solo lugar.',
    features: [
      'Todas tus recetas, con o sin foto, ordenadas y fáciles de encontrar.',
      'Importa desde una web, TikTok, Instagram, una foto o un texto, sin inteligencia artificial.',
      'Planificación semanal y lista de la compra generada automáticamente, ordenada por pasillos.',
      'Modo cocina con temporizadores, widgets y Live Activities.',
      'Sin cuenta: tus datos se quedan en tu dispositivo y en tu iCloud.',
    ],
    free: 'Gratis, financiada con publicidad discreta, nunca mientras cocinas.',
    englishOnly: 'Este documento solo está disponible en inglés y francés.',
  },
  de: {
    home: 'Start',
    support: 'Hilfe',
    privacy: 'Datenschutz',
    terms: 'Nutzungsbedingungen',
    legal: 'Impressum',
    tagline: 'Deine Rezepte, dein Wochenplan und deine Einkaufslisten an einem Ort.',
    features: [
      'Alle deine Rezepte, mit oder ohne Foto, geordnet und schnell gefunden.',
      'Import von einer Website, TikTok, Instagram, einem Foto oder einem Text – ohne künstliche Intelligenz.',
      'Wochenplan und automatisch erstellte Einkaufsliste, nach Gängen sortiert.',
      'Kochmodus mit Timern, Widgets und Live Activities.',
      'Kein Konto: Deine Daten bleiben auf deinem Gerät und in deiner iCloud.',
    ],
    free: 'Kostenlos, finanziert durch dezente Werbung – nie beim Kochen.',
    englishOnly: 'Dieses Dokument ist nur auf Englisch und Französisch verfügbar.',
  },
  it: {
    home: 'Home',
    support: 'Aiuto',
    privacy: 'Privacy',
    terms: 'Condizioni d’uso',
    legal: 'Note legali',
    tagline: 'Le tue ricette, il planning dei pasti e le liste della spesa, in un unico posto.',
    features: [
      'Tutte le tue ricette, con o senza foto, ordinate e facili da trovare.',
      'Importa da un sito, TikTok, Instagram, una foto o un testo, senza intelligenza artificiale.',
      'Planning settimanale e lista della spesa generata automaticamente, divisa per reparti.',
      'Modalità cucina con timer, widget e Live Activities.',
      'Nessun account: i tuoi dati restano sul dispositivo e nel tuo iCloud.',
    ],
    free: 'Gratuita, finanziata da pubblicità discreta, mai mentre cucini.',
    englishOnly: 'Questo documento è disponibile solo in inglese e francese.',
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
        'Sur votre appareil. Sur iPhone et iPad, elles sont aussi synchronisées dans votre iCloud privé (Réglages → Mes données). Personne d’autre n’y a accès, pas même nous.',
      ],
      [
        'Comment retrouver mes recettes sur un nouveau téléphone ?',
        'Sur iPhone et iPad, gardez la synchronisation iCloud activée et utilisez le même identifiant Apple : tout revient automatiquement. Sur Android, ou pour changer de plateforme, utilisez Réglages → Mes données → Exporter, puis Importer sur le nouvel appareil.',
      ],
      [
        'Puis-je utiliser l’app hors ligne ?',
        'Oui. Seuls l’import depuis un lien et la synchronisation iCloud ont besoin d’internet.',
      ],
      [
        'Comment importer depuis TikTok ou Instagram ?',
        'Dans l’app TikTok ou Instagram, touchez Partager puis PepperedApron. Nous récupérons le lien, la description et l’image quand la plateforme les rend publiques ; vous complétez le reste.',
      ],
      [
        'L’app est-elle payante ?',
        'Non. PepperedApron est gratuite et financée par une publicité discrète, jamais affichée en mode cuisine. Aucun abonnement.',
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
        'On your device. On iPhone and iPad they are also synced to your private iCloud (Settings → My data). Nobody else can access them, not even us.',
      ],
      [
        'How do I get my recipes on a new phone?',
        'On iPhone and iPad, keep iCloud sync on and use the same Apple Account: everything comes back automatically. On Android, or to switch platforms, use Settings → My data → Export, then Import on the new device.',
      ],
      [
        'Can I use the app offline?',
        'Yes. Only importing from a link and iCloud sync need the internet.',
      ],
      [
        'How do I import from TikTok or Instagram?',
        'In TikTok or Instagram, tap Share, then PepperedApron. We fetch the link, description and image when the platform makes them public; you complete the rest.',
      ],
      [
        'Is the app paid?',
        'No. PepperedApron is free and funded by unobtrusive ads, never shown in cook mode. No subscription.',
      ],
      [
        'How do I delete my data?',
        'Settings → My data → Delete all my data. Deleting the app also erases the data on the device; iCloud data is managed in Settings → [your name] → iCloud.',
      ],
    ],
  },
  es: {
    title: 'Ayuda y soporte',
    intro: 'Respuestas a las preguntas más frecuentes sobre PepperedApron.',
    contact: '¿Otra pregunta, un error, una idea? Escríbenos:',
    qa: [
      ['¿Hay que crear una cuenta?', 'No. Abre la app y empieza: no hay cuenta ni contraseña.'],
      [
        '¿Dónde se guardan mis recetas?',
        'En tu dispositivo. En iPhone y iPad también se sincronizan en tu iCloud privado (Ajustes → Mis datos). Nadie más tiene acceso, ni siquiera nosotros.',
      ],
      [
        '¿Cómo recupero mis recetas en un teléfono nuevo?',
        'En iPhone y iPad, deja activada la sincronización con iCloud y usa la misma cuenta de Apple: todo vuelve automáticamente. En Android, o para cambiar de plataforma, usa Ajustes → Mis datos → Exportar y luego Importar en el nuevo dispositivo.',
      ],
      [
        '¿Puedo usar la app sin conexión?',
        'Sí. Solo la importación desde un enlace y la sincronización con iCloud necesitan internet.',
      ],
      [
        '¿Cómo importo desde TikTok o Instagram?',
        'En TikTok o Instagram, toca Compartir y luego PepperedApron. Recuperamos el enlace, la descripción y la imagen cuando la plataforma los hace públicos; tú completas el resto.',
      ],
      [
        '¿La app es de pago?',
        'No. PepperedApron es gratuita y se financia con publicidad discreta, nunca en el modo cocina. Sin suscripción.',
      ],
      [
        '¿Cómo borro mis datos?',
        'Ajustes → Mis datos → Borrar todos mis datos. Eliminar la app también borra los datos del dispositivo; los datos de iCloud se gestionan en Ajustes → [tu nombre] → iCloud.',
      ],
    ],
  },
  de: {
    title: 'Hilfe & Support',
    intro: 'Antworten auf die häufigsten Fragen zu PepperedApron.',
    contact: 'Noch eine Frage, ein Fehler, eine Idee? Schreib uns:',
    qa: [
      [
        'Brauche ich ein Konto?',
        'Nein. Öffne die App und leg los: Es gibt weder Konto noch Passwort.',
      ],
      [
        'Wo werden meine Rezepte gespeichert?',
        'Auf deinem Gerät. Auf iPhone und iPad werden sie zusätzlich in deiner privaten iCloud synchronisiert (Einstellungen → Meine Daten). Niemand sonst hat Zugriff, auch wir nicht.',
      ],
      [
        'Wie bekomme ich meine Rezepte auf ein neues Telefon?',
        'Lass auf iPhone und iPad die iCloud-Synchronisierung aktiviert und nutze denselben Apple Account: Alles kommt automatisch zurück. Unter Android oder beim Plattformwechsel: Einstellungen → Meine Daten → Exportieren, dann auf dem neuen Gerät Importieren.',
      ],
      [
        'Kann ich die App offline nutzen?',
        'Ja. Nur der Import über einen Link und die iCloud-Synchronisierung brauchen Internet.',
      ],
      [
        'Wie importiere ich aus TikTok oder Instagram?',
        'Tippe in TikTok oder Instagram auf Teilen und dann auf PepperedApron. Wir übernehmen Link, Beschreibung und Bild, sofern die Plattform sie öffentlich macht; den Rest ergänzt du.',
      ],
      [
        'Ist die App kostenpflichtig?',
        'Nein. PepperedApron ist kostenlos und wird durch dezente Werbung finanziert, nie im Kochmodus. Kein Abo.',
      ],
      [
        'Wie lösche ich meine Daten?',
        'Einstellungen → Meine Daten → Alle meine Daten löschen. Das Löschen der App entfernt auch die Daten auf dem Gerät; iCloud-Daten verwaltest du unter Einstellungen → [dein Name] → iCloud.',
      ],
    ],
  },
  it: {
    title: 'Aiuto e assistenza',
    intro: 'Le risposte alle domande più frequenti su PepperedApron.',
    contact: 'Un’altra domanda, un bug, un’idea? Scrivici:',
    qa: [
      ['Serve un account?', 'No. Apri l’app e inizia: non ci sono account né password.'],
      [
        'Dove sono salvate le mie ricette?',
        'Sul tuo dispositivo. Su iPhone e iPad sono anche sincronizzate nel tuo iCloud privato (Impostazioni → I miei dati). Nessun altro può accedervi, nemmeno noi.',
      ],
      [
        'Come ritrovo le ricette su un nuovo telefono?',
        'Su iPhone e iPad lascia attiva la sincronizzazione iCloud e usa lo stesso Apple Account: tutto torna automaticamente. Su Android, o per cambiare piattaforma, usa Impostazioni → I miei dati → Esporta, poi Importa sul nuovo dispositivo.',
      ],
      [
        'Posso usare l’app offline?',
        'Sì. Solo l’importazione da un link e la sincronizzazione iCloud richiedono internet.',
      ],
      [
        'Come importo da TikTok o Instagram?',
        'In TikTok o Instagram tocca Condividi e poi PepperedApron. Recuperiamo link, descrizione e immagine quando la piattaforma li rende pubblici; il resto lo completi tu.',
      ],
      [
        'L’app è a pagamento?',
        'No. PepperedApron è gratuita ed è finanziata da pubblicità discreta, mai in modalità cucina. Nessun abbonamento.',
      ],
      [
        'Come cancello i miei dati?',
        'Impostazioni → I miei dati → Cancella tutti i miei dati. Eliminare l’app cancella anche i dati del dispositivo; i dati iCloud si gestiscono in Impostazioni → [il tuo nome] → iCloud.',
      ],
    ],
  },
};

const mail = (p) => `<a href="mailto:${p.email}">${p.email}</a>`;

export const LEGAL = {
  fr: {
    legal: (p) => ({
      title: 'Mentions légales',
      html: `<h1>Mentions légales</h1><div class="card"><p><b>Éditeur :</b> ${p.publisher}<br>${p.address}<br>Contact : ${mail(p)}</p><p><b>Hébergement du site :</b> ${p.hosting}</p><p>L’application PepperedApron ne dispose d’aucun serveur : les données des utilisateurs sont stockées sur leurs appareils et, s’ils l’activent, dans leur propre iCloud (Apple).</p><p>L’application, ce site et leur contenu graphique sont protégés par le droit de la propriété intellectuelle.</p></div>`,
    }),
    terms: (p) => ({
      title: "Conditions d'utilisation",
      html: `<h1>Conditions générales d'utilisation</h1><p class="muted">Mise à jour : ${UPDATED}</p><div class="card">
<h2>1. Objet</h2><p>PepperedApron est une application gratuite permettant d'organiser ses recettes, de planifier ses repas et de gérer ses listes de courses. Elle est financée par de la publicité. Aucun compte n'est nécessaire.</p>
<h2>2. Vos données</h2><p>Vos contenus sont enregistrés uniquement sur votre appareil et, si vous activez la synchronisation, dans votre iCloud, service fourni par Apple selon ses propres conditions. L'éditeur n'y a pas accès et ne peut pas les restaurer : pensez à garder iCloud activé ou à exporter régulièrement une sauvegarde (Réglages → Mes données).</p>
<h2>3. Contenus</h2><p>Vous restez propriétaire des recettes et photos que vous ajoutez. Les contenus importés depuis d'autres services restent soumis aux droits de leurs auteurs : ils sont destinés à votre usage personnel.</p>
<h2>4. Responsabilité</h2><p>Vérifiez les allergènes, temps de cuisson et températures des recettes. L'application est fournie « en l'état », sans garantie de disponibilité ; l'éditeur ne saurait être tenu responsable d'une perte de données stockées sur votre appareil ou votre iCloud.</p>
<h2>5. Publicité</h2><p>Des bannières publicitaires (Google AdMob) sont affichées hors du mode cuisine, selon vos choix de consentement, modifiables dans Réglages → Confidentialité.</p>
<h2>6. Droit applicable</h2><p>Droit français. Contact : ${mail(p)}.</p></div>`,
    }),
    privacy: (p) => ({
      title: 'Politique de confidentialité',
      html: `<h1>Politique de confidentialité</h1><p class="muted">Mise à jour : ${UPDATED}</p><div class="card">
<h2>En bref</h2><p>PepperedApron n'a ni compte, ni serveur. Vos recettes, photos, listes, planning et réglages restent sur votre appareil et, si vous l'activez, dans votre iCloud privé. L'éditeur ne reçoit, ne stocke et ne vend aucune de ces données.</p>
<h2>Responsable de traitement</h2><p>${p.publisher}, ${p.address} — ${mail(p)}</p>
<h2>Données sur votre appareil et dans iCloud</h2><p>Vos contenus sont stockés localement. Sur iPhone et iPad, la synchronisation iCloud (activée par défaut, désactivable dans Réglages → Mes données) les copie dans le conteneur privé de l'app dans votre compte iCloud, géré par Apple (voir la politique de confidentialité d'Apple). L'éditeur n'y a pas accès. Sur Android, les données peuvent être incluses dans la sauvegarde Google de votre appareil si vous l'avez activée.</p>
<h2>Import depuis un lien</h2><p>Lorsque vous importez une recette depuis un lien, l'app contacte directement le site concerné (ou le service oEmbed de TikTok ou YouTube), comme le ferait un navigateur. Ce site reçoit alors votre adresse IP selon sa propre politique.</p>
<h2>Photos et texte</h2><p>L'appareil photo et la photothèque ne sont utilisés que lorsque vous le demandez. La lecture du texte d'une photo se fait sur l'appareil ; rien n'est envoyé.</p>
<h2>Publicité</h2><p>La régie Google AdMob peut traiter des identifiants publicitaires et des informations techniques sur l'appareil selon vos choix de consentement (formulaire de consentement de Google et, sur iOS, autorisation de suivi). Base légale : votre consentement, modifiable à tout moment dans Réglages → Confidentialité → Choix publicitaires.</p>
<h2>Nous contacter</h2><p>Si vous nous écrivez par e-mail, nous utilisons votre adresse et votre message uniquement pour vous répondre, et les conservons au plus 3 ans.</p>
<h2>Vos droits</h2><p>Vos contenus sont sous votre contrôle : export et suppression dans Réglages → Mes données. Pour toute question ou pour exercer vos droits d'accès, de rectification, d'effacement, d'opposition et de retrait du consentement : ${mail(p)}. Réclamation possible auprès de la CNIL (cnil.fr).</p>
<h2>Enfants</h2><p>L'application ne collecte sciemment aucune donnée personnelle d'enfants.</p>
<h2>Ce site</h2><p>Ce site n'utilise ni cookie ni traceur.</p></div>`,
    }),
  },
  en: {
    legal: (p) => ({
      title: 'Legal notice',
      html: `<h1>Legal notice</h1><div class="card"><p><b>Publisher:</b> ${p.publisher}<br>${p.address}<br>Contact: ${mail(p)}</p><p><b>Website hosting:</b> ${p.hosting}</p><p>The PepperedApron app has no server: user data is stored on their devices and, if they turn it on, in their own iCloud (Apple).</p><p>The app, this website and their artwork are protected by intellectual property law.</p></div>`,
    }),
    terms: (p) => ({
      title: 'Terms of use',
      html: `<h1>Terms of use</h1><p class="muted">Updated: ${UPDATED}</p><div class="card">
<h2>1. Service</h2><p>PepperedApron is a free, ad-supported app to organise recipes, plan meals and manage shopping lists. No account is needed.</p>
<h2>2. Your data</h2><p>Your content is stored only on your device and, if you turn on sync, in your iCloud, a service provided by Apple under its own terms. The publisher has no access to it and cannot restore it: keep iCloud on or export a backup regularly (Settings → My data).</p>
<h2>3. Content</h2><p>You keep ownership of the recipes and photos you add. Content imported from other services remains subject to its authors' rights and is meant for your personal use.</p>
<h2>4. Liability</h2><p>Check allergens, cooking times and temperatures. The app is provided "as is", without any availability guarantee; the publisher cannot be held liable for the loss of data stored on your device or in your iCloud.</p>
<h2>5. Advertising</h2><p>Banner ads (Google AdMob) are shown outside cook mode, according to your consent choices, which you can change in Settings → Privacy.</p>
<h2>6. Governing law</h2><p>French law. Contact: ${mail(p)}.</p></div>`,
    }),
    privacy: (p) => ({
      title: 'Privacy policy',
      html: `<h1>Privacy policy</h1><p class="muted">Updated: ${UPDATED}</p><div class="card">
<h2>In short</h2><p>PepperedApron has no account and no server. Your recipes, photos, lists, meal plan and settings stay on your device and, if you turn it on, in your private iCloud. The publisher never receives, stores or sells any of this data.</p>
<h2>Controller</h2><p>${p.publisher}, ${p.address} — ${mail(p)}</p>
<h2>Data on your device and in iCloud</h2><p>Your content is stored locally. On iPhone and iPad, iCloud sync (on by default, can be turned off in Settings → My data) copies it to the app's private container in your iCloud account, operated by Apple (see Apple's privacy policy). The publisher has no access to it. On Android, the data may be included in your device's Google backup if you turned it on.</p>
<h2>Importing from a link</h2><p>When you import a recipe from a link, the app contacts that website (or the TikTok or YouTube oEmbed service) directly, like a browser would. That website then receives your IP address under its own policy.</p>
<h2>Photos and text</h2><p>The camera and photo library are only used when you ask. Reading the text of a photo happens on the device; nothing is sent.</p>
<h2>Advertising</h2><p>Google AdMob may process advertising identifiers and technical device information according to your consent choices (Google's consent form and, on iOS, tracking permission). Legal basis: your consent, which you can change at any time in Settings → Privacy → Ad choices.</p>
<h2>Contacting us</h2><p>If you e-mail us, we use your address and message only to answer you and keep them for at most 3 years.</p>
<h2>Your rights</h2><p>Your content is under your control: export and deletion in Settings → My data. For any question, or to exercise your rights of access, rectification, erasure, objection and withdrawal of consent: ${mail(p)}. You may lodge a complaint with your data protection authority.</p>
<h2>Children</h2><p>The app does not knowingly collect personal data from children.</p>
<h2>This website</h2><p>This website uses no cookies or trackers.</p></div>`,
    }),
  },
};
