import type { WebLang } from './layout';

type Keys =
  | 'openApp' | 'getIos' | 'getAndroid' | 'ingredients' | 'steps' | 'servings' | 'minutes' | 'notFound' | 'notFoundBody'
  | 'emailVerified' | 'emailVerifiedBody' | 'linkInvalid' | 'linkInvalidBody' | 'resetTitle' | 'newPassword' | 'save' | 'resetDone'
  | 'passwordTooShort' | 'emailChanged' | 'joinTitle' | 'joinBody' | 'by' | 'saveToLibrary';

export const WEB_T: Record<WebLang, Record<Keys, string>> = {
  fr: {
    openApp: "Ouvrir dans l'app", getIos: "Télécharger sur l'App Store", getAndroid: 'Disponible sur Google Play', ingredients: 'Ingrédients', steps: 'Préparation',
    servings: 'personnes', minutes: 'min', notFound: 'Recette introuvable', notFoundBody: "Ce lien n'est plus valide ou la recette a été supprimée.",
    emailVerified: 'Adresse confirmée ✓', emailVerifiedBody: "Merci ! Vous pouvez retourner dans l'application.", linkInvalid: 'Lien expiré',
    linkInvalidBody: "Ce lien n'est plus valide. Demandez-en un nouveau depuis l'application.", resetTitle: 'Nouveau mot de passe', newPassword: 'Nouveau mot de passe (10 caractères minimum)',
    save: 'Enregistrer', resetDone: "Mot de passe modifié ✓ Vous pouvez vous connecter dans l'application.", passwordTooShort: 'Le mot de passe doit contenir au moins 10 caractères.',
    emailChanged: 'Nouvelle adresse confirmée ✓', joinTitle: 'Rejoindre un foyer', joinBody: "Ouvrez PepperedApron pour rejoindre ce foyer avec le code :", by: 'par', saveToLibrary: 'Ajouter à mes recettes',
  },
  en: {
    openApp: 'Open in the app', getIos: 'Download on the App Store', getAndroid: 'Get it on Google Play', ingredients: 'Ingredients', steps: 'Method',
    servings: 'servings', minutes: 'min', notFound: 'Recipe not found', notFoundBody: 'This link is no longer valid or the recipe was deleted.',
    emailVerified: 'Email confirmed ✓', emailVerifiedBody: 'Thank you! You can go back to the app.', linkInvalid: 'Link expired',
    linkInvalidBody: 'This link is no longer valid. Request a new one from the app.', resetTitle: 'New password', newPassword: 'New password (at least 10 characters)',
    save: 'Save', resetDone: 'Password changed ✓ You can sign in from the app.', passwordTooShort: 'The password must be at least 10 characters long.',
    emailChanged: 'New email confirmed ✓', joinTitle: 'Join a household', joinBody: 'Open PepperedApron to join this household with the code:', by: 'by', saveToLibrary: 'Save to my recipes',
  },
  es: {
    openApp: 'Abrir en la app', getIos: 'Descargar en App Store', getAndroid: 'Disponible en Google Play', ingredients: 'Ingredientes', steps: 'Preparación',
    servings: 'personas', minutes: 'min', notFound: 'Receta no encontrada', notFoundBody: 'Este enlace ya no es válido o la receta se ha eliminado.',
    emailVerified: 'Correo confirmado ✓', emailVerifiedBody: '¡Gracias! Puedes volver a la app.', linkInvalid: 'Enlace caducado',
    linkInvalidBody: 'Este enlace ya no es válido. Solicita uno nuevo desde la app.', resetTitle: 'Nueva contraseña', newPassword: 'Nueva contraseña (mínimo 10 caracteres)',
    save: 'Guardar', resetDone: 'Contraseña cambiada ✓ Ya puedes iniciar sesión en la app.', passwordTooShort: 'La contraseña debe tener al menos 10 caracteres.',
    emailChanged: 'Nuevo correo confirmado ✓', joinTitle: 'Unirse a un hogar', joinBody: 'Abre PepperedApron para unirte a este hogar con el código:', by: 'por', saveToLibrary: 'Añadir a mis recetas',
  },
  de: {
    openApp: 'In der App öffnen', getIos: 'Im App Store laden', getAndroid: 'Jetzt bei Google Play', ingredients: 'Zutaten', steps: 'Zubereitung',
    servings: 'Portionen', minutes: 'Min.', notFound: 'Rezept nicht gefunden', notFoundBody: 'Dieser Link ist nicht mehr gültig oder das Rezept wurde gelöscht.',
    emailVerified: 'E-Mail bestätigt ✓', emailVerifiedBody: 'Danke! Du kannst zur App zurückkehren.', linkInvalid: 'Link abgelaufen',
    linkInvalidBody: 'Dieser Link ist nicht mehr gültig. Fordere in der App einen neuen an.', resetTitle: 'Neues Passwort', newPassword: 'Neues Passwort (mindestens 10 Zeichen)',
    save: 'Speichern', resetDone: 'Passwort geändert ✓ Du kannst dich in der App anmelden.', passwordTooShort: 'Das Passwort muss mindestens 10 Zeichen lang sein.',
    emailChanged: 'Neue E-Mail bestätigt ✓', joinTitle: 'Einem Haushalt beitreten', joinBody: 'Öffne PepperedApron, um diesem Haushalt mit dem Code beizutreten:', by: 'von', saveToLibrary: 'Zu meinen Rezepten',
  },
  it: {
    openApp: "Apri nell'app", getIos: "Scarica su App Store", getAndroid: 'Disponibile su Google Play', ingredients: 'Ingredienti', steps: 'Preparazione',
    servings: 'persone', minutes: 'min', notFound: 'Ricetta non trovata', notFoundBody: 'Questo link non è più valido o la ricetta è stata eliminata.',
    emailVerified: 'Indirizzo confermato ✓', emailVerifiedBody: "Grazie! Puoi tornare all'app.", linkInvalid: 'Link scaduto',
    linkInvalidBody: "Questo link non è più valido. Richiedine uno nuovo dall'app.", resetTitle: 'Nuova password', newPassword: 'Nuova password (almeno 10 caratteri)',
    save: 'Salva', resetDone: "Password modificata ✓ Puoi accedere dall'app.", passwordTooShort: 'La password deve contenere almeno 10 caratteri.',
    emailChanged: 'Nuovo indirizzo confermato ✓', joinTitle: 'Unisciti a una famiglia', joinBody: 'Apri PepperedApron per unirti a questa famiglia con il codice:', by: 'di', saveToLibrary: 'Aggiungi alle mie ricette',
  },
};
