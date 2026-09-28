import type { WebLang } from './layout';
import { esc } from './layout';

type Faq = { title: string; intro: string; contact: string; qa: [string, string][] };

const FAQ: Record<WebLang, Faq> = {
  fr: {
    title: 'Aide et assistance',
    intro: 'Les réponses aux questions les plus fréquentes sur PepperedApron.',
    contact:
      "Une autre question ? Écrivez-nous depuis l'app (Profil → Aide → Contact) ou par e-mail :",
    qa: [
      [
        'Mes recettes sont-elles privées ?',
        'Oui. Vous seul les voyez, sauf si vous les partagez avec votre foyer ou les publiez dans la communauté.',
      ],
      [
        "Puis-je utiliser l'app hors ligne ?",
        'Oui. Tout fonctionne sans réseau et se synchronise automatiquement au retour de la connexion.',
      ],
      [
        'Comment importer depuis TikTok ou Instagram ?',
        "Dans l'app, touchez Partager puis PepperedApron. Nous récupérons le lien, la description et l'image quand la plateforme les rend accessibles ; complétez le reste.",
      ],
      [
        'Comment partager avec ma famille ?',
        'Profil → Foyer : créez un foyer et envoyez le code d’invitation. Chacun garde son compte.',
      ],
      [
        "L'app est-elle payante ?",
        'Non. PepperedApron est gratuite et financée par une publicité discrète. Aucun abonnement.',
      ],
      [
        'Comment exporter ou supprimer mes données ?',
        'Profil → Mes données : export JSON de toutes vos données, ou suppression définitive du compte.',
      ],
    ],
  },
  en: {
    title: 'Help & support',
    intro: 'Answers to the most common questions about PepperedApron.',
    contact: 'Another question? Write to us from the app (Profile → Help → Contact) or by e-mail:',
    qa: [
      [
        'Are my recipes private?',
        'Yes. Only you can see them unless you share them with your household or publish them to the community.',
      ],
      [
        'Can I use the app offline?',
        'Yes. Everything works offline and syncs automatically when you are back online.',
      ],
      [
        'How do I import from TikTok or Instagram?',
        'In the app, tap Share, then PepperedApron. We fetch the link, description and image when the platform makes them available; you complete the rest.',
      ],
      [
        'How do I share with my family?',
        'Profile → Household: create a household and send the invitation code. Everyone keeps their own account.',
      ],
      [
        'Is the app paid?',
        'No. PepperedApron is free and funded by unobtrusive ads. No subscription.',
      ],
      [
        'How do I export or delete my data?',
        'Profile → My data: JSON export of all your data, or permanent account deletion.',
      ],
    ],
  },
  es: {
    title: 'Ayuda y soporte',
    intro: 'Respuestas a las preguntas más frecuentes sobre PepperedApron.',
    contact: '¿Otra pregunta? Escríbenos desde la app (Perfil → Ayuda → Contacto) o por correo:',
    qa: [
      [
        '¿Mis recetas son privadas?',
        'Sí. Solo tú puedes verlas, salvo que las compartas con tu hogar o las publiques en la comunidad.',
      ],
      [
        '¿Puedo usar la app sin conexión?',
        'Sí. Todo funciona sin conexión y se sincroniza automáticamente al volver a conectarte.',
      ],
      [
        '¿Cómo importo desde TikTok o Instagram?',
        'En la app, toca Compartir y luego PepperedApron. Recuperamos el enlace, la descripción y la imagen cuando la plataforma los hace accesibles; tú completas el resto.',
      ],
      [
        '¿Cómo comparto con mi familia?',
        'Perfil → Hogar: crea un hogar y envía el código de invitación. Cada uno conserva su cuenta.',
      ],
      [
        '¿La app es de pago?',
        'No. PepperedApron es gratuita y se financia con publicidad discreta. Sin suscripción.',
      ],
      [
        '¿Cómo exporto o elimino mis datos?',
        'Perfil → Mis datos: exportación JSON de todos tus datos o eliminación definitiva de la cuenta.',
      ],
    ],
  },
  de: {
    title: 'Hilfe & Support',
    intro: 'Antworten auf die häufigsten Fragen zu PepperedApron.',
    contact: 'Noch eine Frage? Schreib uns in der App (Profil → Hilfe → Kontakt) oder per E-Mail:',
    qa: [
      [
        'Sind meine Rezepte privat?',
        'Ja. Nur du siehst sie, außer du teilst sie mit deinem Haushalt oder veröffentlichst sie in der Community.',
      ],
      [
        'Kann ich die App offline nutzen?',
        'Ja. Alles funktioniert offline und wird automatisch synchronisiert, sobald du wieder online bist.',
      ],
      [
        'Wie importiere ich aus TikTok oder Instagram?',
        'Tippe in der App auf Teilen und dann auf PepperedApron. Wir übernehmen Link, Beschreibung und Bild, sofern die Plattform sie zugänglich macht; den Rest ergänzt du.',
      ],
      [
        'Wie teile ich mit meiner Familie?',
        'Profil → Haushalt: Haushalt erstellen und den Einladungscode senden. Jede Person behält ihr eigenes Konto.',
      ],
      [
        'Ist die App kostenpflichtig?',
        'Nein. PepperedApron ist kostenlos und wird durch dezente Werbung finanziert. Kein Abo.',
      ],
      [
        'Wie exportiere oder lösche ich meine Daten?',
        'Profil → Meine Daten: JSON-Export aller Daten oder endgültiges Löschen des Kontos.',
      ],
    ],
  },
  it: {
    title: 'Aiuto e assistenza',
    intro: 'Le risposte alle domande più frequenti su PepperedApron.',
    contact: "Un'altra domanda? Scrivici dall'app (Profilo → Aiuto → Contatti) o via e-mail:",
    qa: [
      [
        'Le mie ricette sono private?',
        'Sì. Solo tu puoi vederle, a meno che tu non le condivida con la tua famiglia o le pubblichi nella community.',
      ],
      [
        "Posso usare l'app offline?",
        'Sì. Tutto funziona offline e si sincronizza automaticamente quando torni online.',
      ],
      [
        'Come importo da TikTok o Instagram?',
        "Nell'app, tocca Condividi e poi PepperedApron. Recuperiamo link, descrizione e immagine quando la piattaforma li rende accessibili; il resto lo completi tu.",
      ],
      [
        'Come condivido con la mia famiglia?',
        'Profilo → Famiglia: crea una famiglia e invia il codice di invito. Ognuno mantiene il proprio account.',
      ],
      [
        "L'app è a pagamento?",
        'No. PepperedApron è gratuita ed è finanziata da pubblicità discreta. Nessun abbonamento.',
      ],
      [
        'Come esporto o elimino i miei dati?',
        "Profilo → I miei dati: esportazione JSON di tutti i dati o eliminazione definitiva dell'account.",
      ],
    ],
  },
};

export function supportPage(lang: WebLang, contactEmail: string, legalBase: string) {
  const f = FAQ[lang];
  const items = f.qa
    .map(([q, a]) => `<div class="card"><h2>${esc(q)}</h2><p class="muted">${esc(a)}</p></div>`)
    .join('');
  const mail = contactEmail
    ? ` <a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>`
    : '';
  return {
    title: f.title,
    html: `<h1>${esc(f.title)}</h1><p class="muted">${esc(f.intro)}</p>${items}
<div class="card"><p>${esc(f.contact)}${mail}</p>
<p class="muted"><a href="${esc(legalBase)}/legal/privacy">Privacy</a> · <a href="${esc(legalBase)}/legal/terms">Terms</a> · <a href="${esc(legalBase)}/legal/notice">Legal</a></p></div>`,
  };
}
