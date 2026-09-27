import type { Env } from '../env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}

export class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}

export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string) {}
  async send(mail: Mail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}`);
  }
}

export function createMailer(env: Env): Mailer {
  if (env.MAIL_DRIVER === 'resend') return new ResendMailer(env.RESEND_API_KEY!, env.MAIL_FROM);
  if (env.MAIL_DRIVER === 'memory') return new MemoryMailer();
  return new ConsoleMailer();
}

type Lang = 'fr' | 'en' | 'es' | 'de' | 'it';
type Kind = 'verify_email' | 'reset_password' | 'change_email';

const T: Record<Kind, Record<Lang, { subject: string; intro: string; cta: string; outro: string }>> = {
  verify_email: {
    fr: { subject: 'Confirmez votre adresse e-mail', intro: 'Bienvenue sur PepperedApron ! Confirmez votre adresse pour sécuriser votre compte.', cta: 'Confirmer mon adresse', outro: 'Ce lien expire dans 48 heures.' },
    en: { subject: 'Confirm your email address', intro: 'Welcome to PepperedApron! Confirm your address to secure your account.', cta: 'Confirm my address', outro: 'This link expires in 48 hours.' },
    es: { subject: 'Confirma tu correo electrónico', intro: '¡Bienvenido a PepperedApron! Confirma tu dirección para proteger tu cuenta.', cta: 'Confirmar mi correo', outro: 'Este enlace caduca en 48 horas.' },
    de: { subject: 'Bestätige deine E-Mail-Adresse', intro: 'Willkommen bei PepperedApron! Bestätige deine Adresse, um dein Konto zu schützen.', cta: 'Adresse bestätigen', outro: 'Dieser Link läuft in 48 Stunden ab.' },
    it: { subject: 'Conferma il tuo indirizzo e-mail', intro: 'Benvenuto su PepperedApron! Conferma il tuo indirizzo per proteggere il tuo account.', cta: 'Conferma indirizzo', outro: 'Questo link scade tra 48 ore.' },
  },
  reset_password: {
    fr: { subject: 'Réinitialisez votre mot de passe', intro: 'Vous avez demandé à réinitialiser votre mot de passe PepperedApron.', cta: 'Choisir un nouveau mot de passe', outro: "Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail." },
    en: { subject: 'Reset your password', intro: 'You asked to reset your PepperedApron password.', cta: 'Choose a new password', outro: "This link expires in 1 hour. If you didn't ask for this, ignore this email." },
    es: { subject: 'Restablece tu contraseña', intro: 'Has solicitado restablecer tu contraseña de PepperedApron.', cta: 'Elegir una nueva contraseña', outro: 'Este enlace caduca en 1 hora. Si no lo has solicitado, ignora este correo.' },
    de: { subject: 'Passwort zurücksetzen', intro: 'Du hast angefordert, dein PepperedApron-Passwort zurückzusetzen.', cta: 'Neues Passwort wählen', outro: 'Dieser Link läuft in 1 Stunde ab. Falls du das nicht warst, ignoriere diese E-Mail.' },
    it: { subject: 'Reimposta la password', intro: 'Hai chiesto di reimpostare la password di PepperedApron.', cta: 'Scegli una nuova password', outro: "Questo link scade tra 1 ora. Se non sei stato tu, ignora questa e-mail." },
  },
  change_email: {
    fr: { subject: 'Confirmez votre nouvelle adresse', intro: 'Confirmez cette adresse pour la lier à votre compte PepperedApron.', cta: 'Confirmer la nouvelle adresse', outro: 'Ce lien expire dans 48 heures.' },
    en: { subject: 'Confirm your new email address', intro: 'Confirm this address to link it to your PepperedApron account.', cta: 'Confirm new address', outro: 'This link expires in 48 hours.' },
    es: { subject: 'Confirma tu nuevo correo', intro: 'Confirma esta dirección para vincularla a tu cuenta de PepperedApron.', cta: 'Confirmar nuevo correo', outro: 'Este enlace caduca en 48 horas.' },
    de: { subject: 'Neue E-Mail-Adresse bestätigen', intro: 'Bestätige diese Adresse, um sie mit deinem PepperedApron-Konto zu verknüpfen.', cta: 'Neue Adresse bestätigen', outro: 'Dieser Link läuft in 48 Stunden ab.' },
    it: { subject: 'Conferma il nuovo indirizzo', intro: 'Conferma questo indirizzo per collegarlo al tuo account PepperedApron.', cta: 'Conferma nuovo indirizzo', outro: 'Questo link scade tra 48 ore.' },
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function buildMail(kind: Kind, locale: string, to: string, link: string): Mail {
  const lang = (['fr', 'en', 'es', 'de', 'it'].includes(locale) ? locale : 'en') as Lang;
  const t = T[kind][lang];
  const html = `<!doctype html><html><body style="margin:0;background:#F7F1E6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1F2A24">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:480px;background:#FFFDF8;border-radius:20px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:22px;font-weight:700;color:#1F4D3A;padding-bottom:16px">PepperedApron</td></tr>
<tr><td style="font-size:16px;line-height:24px;padding-bottom:24px">${esc(t.intro)}</td></tr>
<tr><td><a href="${esc(link)}" style="display:inline-block;background:#1F4D3A;color:#FFFDF8;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:14px">${esc(t.cta)}</a></td></tr>
<tr><td style="font-size:13px;color:#6B6358;padding-top:24px">${esc(t.outro)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject: t.subject, text: `${t.intro}\n\n${t.cta}: ${link}\n\n${t.outro}`, html };
}
