import type { Env } from '../env';
import { esc } from './layout';

/**
 * Legal documents. French is the reference version; English is provided for international users.
 * Other locales display the English text. Have them reviewed by a lawyer before publication.
 */
export function legal(kind: 'privacy' | 'terms' | 'notice', lang: 'fr' | 'en', env: Env): { title: string; html: string } {
  const pub = esc(env.LEGAL_PUBLISHER);
  const addr = esc(env.LEGAL_ADDRESS);
  const mail = esc(env.LEGAL_CONTACT_EMAIL);
  const host = esc(env.LEGAL_HOSTING);
  const updated = '2026-09-27';
  if (lang === 'fr') {
    if (kind === 'notice') {
      return { title: 'Mentions légales', html: `<h1>Mentions légales</h1><div class="card"><p><b>Éditeur :</b> ${pub}<br>${addr}<br>Contact : <a href="mailto:${mail}">${mail}</a></p><p><b>Hébergement :</b> ${host}</p><p>L'application PepperedApron et son contenu graphique sont protégés par le droit de la propriété intellectuelle. Les recettes publiées restent la propriété de leurs auteurs.</p></div>` };
    }
    if (kind === 'terms') {
      return { title: "Conditions d'utilisation", html: `<h1>Conditions générales d'utilisation</h1><p class="muted">Mise à jour : ${updated}</p><div class="card">
<h2>1. Objet</h2><p>PepperedApron est une application gratuite permettant d'organiser ses recettes, de planifier ses repas et de gérer ses listes de courses. Elle est financée par de la publicité.</p>
<h2>2. Compte</h2><p>Vous êtes responsable de la confidentialité de vos identifiants. Vous pouvez supprimer votre compte à tout moment depuis Profil → Paramètres → Données.</p>
<h2>3. Contenu</h2><p>Vous restez propriétaire des recettes et photos que vous ajoutez. En publiant une recette publiquement, vous accordez à PepperedApron une licence non exclusive et gratuite pour l'afficher aux autres utilisateurs, tant qu'elle reste publique. Vous garantissez disposer des droits sur les contenus publiés. Les contenus importés depuis d'autres services restent soumis aux droits de leurs auteurs et ne doivent être republiés publiquement qu'avec leur accord.</p>
<h2>4. Comportements interdits</h2><p>Contenus illicites, haineux, dangereux, trompeurs, spam ou portant atteinte aux droits de tiers. Tout contenu peut être signalé ; nous pouvons retirer un contenu ou restreindre la publication d'un compte.</p>
<h2>5. Foyer</h2><p>Les données que vous partagez avec votre foyer sont visibles et modifiables par ses membres. Quitter un foyer arrête le partage de vos données.</p>
<h2>6. Responsabilité</h2><p>Les recettes sont fournies par les utilisateurs. Vérifiez les allergènes, temps de cuisson et températures. L'application est fournie « en l'état ».</p>
<h2>7. Droit applicable</h2><p>Droit français. Contact : <a href="mailto:${mail}">${mail}</a>.</p></div>` };
    }
    return { title: 'Politique de confidentialité', html: `<h1>Politique de confidentialité</h1><p class="muted">Mise à jour : ${updated}</p><div class="card">
<h2>Responsable du traitement</h2><p>${pub}, ${addr} — <a href="mailto:${mail}">${mail}</a></p>
<h2>Données collectées</h2><ul><li><b>Compte :</b> adresse e-mail, nom affiché, mot de passe (haché), identifiant Apple/Google/Facebook si vous l'utilisez.</li><li><b>Contenu :</b> recettes, photos, favoris, collections, planning, listes de courses, paramètres.</li><li><b>Sécurité :</b> sessions (nom et type d'appareil, dates d'utilisation).</li><li><b>Mesure d'audience (optionnelle, avec votre accord) :</b> événements d'usage anonymisés par jour (ex. « recette créée »), sans contenu.</li><li><b>Publicité :</b> la régie Google AdMob peut traiter des identifiants publicitaires selon vos choix de consentement (bannière de consentement et, sur iOS, autorisation de suivi).</li><li><b>Crashs :</b> rapports techniques d'erreur (sans contenu de recette).</li></ul>
<h2>Finalités et bases légales</h2><ul><li>Fournir le service et synchroniser vos appareils — exécution du contrat.</li><li>Sécurité, prévention des abus — intérêt légitime.</li><li>Mesure d'audience et publicité personnalisée — consentement, retirable à tout moment dans Paramètres → Confidentialité.</li></ul>
<h2>Destinataires</h2><p>Hébergeur (${host}), stockage des photos, envoi d'e-mails, notifications (Expo/Apple/Google), régie publicitaire (Google AdMob), rapports de crash. Aucune donnée n'est vendue.</p>
<h2>Conservation</h2><p>Tant que votre compte existe. Les éléments supprimés sont effacés définitivement sous 90 jours. La suppression du compte efface immédiatement vos données de la base ; les photos sont supprimées du stockage sous 24 heures.</p>
<h2>Vos droits</h2><p>Accès, rectification, effacement, portabilité (export JSON dans l'app : Paramètres → Données → Exporter), opposition, limitation, retrait du consentement. Contact : <a href="mailto:${mail}">${mail}</a>. Réclamation possible auprès de la CNIL (cnil.fr).</p>
<h2>Transferts</h2><p>Certains prestataires peuvent être situés hors de l'UE ; les transferts sont encadrés par des clauses contractuelles types.</p>
<h2>Cookies</h2><p>Les pages web de PepperedApron (partage de recettes, pages légales) n'utilisent aucun cookie ni traceur.</p></div>` };
  }
  if (kind === 'notice') {
    return { title: 'Legal notice', html: `<h1>Legal notice</h1><div class="card"><p><b>Publisher:</b> ${pub}<br>${addr}<br>Contact: <a href="mailto:${mail}">${mail}</a></p><p><b>Hosting:</b> ${host}</p><p>Published recipes remain the property of their authors.</p></div>` };
  }
  if (kind === 'terms') {
    return { title: 'Terms of use', html: `<h1>Terms of use</h1><p class="muted">Updated: ${updated}</p><div class="card">
<h2>1. Service</h2><p>PepperedApron is a free, ad-supported app to organise recipes, plan meals and manage shopping lists.</p>
<h2>2. Account</h2><p>You are responsible for your credentials. You can delete your account at any time in Profile → Settings → Data.</p>
<h2>3. Content</h2><p>You keep ownership of your recipes and photos. Publishing a recipe publicly grants PepperedApron a free, non-exclusive licence to display it to other users while it stays public. You must hold the rights to what you publish; content imported from other services remains subject to its authors' rights.</p>
<h2>4. Prohibited behaviour</h2><p>Illegal, hateful, dangerous or misleading content, spam, or infringement of third-party rights. Content can be reported; we may remove it or restrict an account's publishing.</p>
<h2>5. Household</h2><p>Data you share with your household can be seen and edited by its members. Leaving stops sharing your data.</p>
<h2>6. Liability</h2><p>Recipes are user-provided. Check allergens, cooking times and temperatures. The app is provided "as is".</p>
<h2>7. Governing law</h2><p>French law. Contact: <a href="mailto:${mail}">${mail}</a>.</p></div>` };
  }
  return { title: 'Privacy policy', html: `<h1>Privacy policy</h1><p class="muted">Updated: ${updated}</p><div class="card">
<h2>Controller</h2><p>${pub}, ${addr} — <a href="mailto:${mail}">${mail}</a></p>
<h2>Data we collect</h2><ul><li><b>Account:</b> email, display name, hashed password, Apple/Google/Facebook identifier if used.</li><li><b>Content:</b> recipes, photos, favourites, collections, meal plans, shopping lists, settings.</li><li><b>Security:</b> sessions (device name and type, usage dates).</li><li><b>Analytics (optional, with your consent):</b> daily usage events (e.g. "recipe created"), no content.</li><li><b>Advertising:</b> Google AdMob may process advertising identifiers according to your consent choices (consent form and, on iOS, tracking permission).</li><li><b>Crashes:</b> technical error reports (no recipe content).</li></ul>
<h2>Purposes and legal bases</h2><ul><li>Providing the service and syncing devices — contract.</li><li>Security and abuse prevention — legitimate interest.</li><li>Analytics and personalised ads — consent, which you can withdraw in Settings → Privacy.</li></ul>
<h2>Recipients</h2><p>Hosting (${host}), photo storage, email delivery, notifications (Expo/Apple/Google), ad network (Google AdMob), crash reporting. We never sell data.</p>
<h2>Retention</h2><p>As long as your account exists. Deleted items are permanently erased within 90 days. Deleting your account erases your data from the database immediately; photos are removed from storage within 24 hours.</p>
<h2>Your rights</h2><p>Access, rectification, erasure, portability (JSON export in Settings → Data → Export), objection, restriction and withdrawal of consent: <a href="mailto:${mail}">${mail}</a>. You may lodge a complaint with your data protection authority.</p>
<h2>Cookies</h2><p>PepperedApron web pages (shared recipes, legal pages) use no cookies or trackers.</p></div>` };
}
