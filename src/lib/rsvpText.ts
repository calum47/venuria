/**
 * Texts for the public RSVP page. The app has no i18n framework yet, so the
 * guest page carries its own small dictionary (ES / EN / FR). Placeholders are
 * written {like_this} and filled by fill().
 *
 * These wordings were written by Claude, not by a native-speaking reviewer, and
 * the consent / privacy lines are placeholders until the data-controller
 * question is settled with proper legal advice.
 */

export type Lang = 'es' | 'en' | 'fr'
export const LANGS: Lang[] = ['es', 'en', 'fr']
export const LANG_NAME: Record<Lang, string> = { es: 'Español', en: 'English', fr: 'Français' }

const EN = {
  intro: 'Please let us know if you can make it.',
  nameLabel: 'Your full name',
  nameHelp: 'Type it as it appears on your invitation.',
  continue: 'Continue',
  checking: 'Checking…',
  back: 'Back',
  confirmTitle: 'Is this you?',
  yesMe: "Yes, that's me",
  notMe: 'No, go back',
  noMatch: "We couldn't find that name on the guest list. You can still answer and the organisers will check your details.",
  ambiguous:
    "We found more than one possible match, or the name looks incomplete. Please type your full name as it appears on your invitation. If that doesn't work, contact the organisers.",
  answered: 'This name has already answered. To change your answer, please contact the organisers.',
  closedTitle: 'RSVP is closed',
  closedBody: 'This link is not accepting answers right now. Please contact the organisers.',
  rateLimited: 'Too many attempts right now. Please try again in a few minutes.',
  generalError: 'Something went wrong. Please try again.',
  plusOneExists: 'A plus-one is already registered for you. Please contact the organisers to change it.',
  attendQ: 'Will you be there?',
  attending: 'Yes, I will be there',
  declined: "No, I can't make it",
  maybe: "I'm not sure yet",
  dietaryLabel: 'Dietary requirements or allergies (optional)',
  dietaryHelp: 'For example: vegetarian, gluten-free, nut allergy.',
  plusOneCheck: "I'm bringing a plus-one",
  plusName: "Plus-one's full name",
  plusDietary: "Plus-one's dietary requirements (optional)",
  consent: 'I agree that my name, my answer and any dietary information are stored and shared with the planning team to organise this event.',
  privacy: 'Dietary information can reveal health or religious details, so only share what you are comfortable with. You can leave it empty.',
  submit: 'Send my answer',
  sending: 'Sending…',
  thanksAttending: 'Thank you! We look forward to seeing you.',
  thanksDeclined: "Thank you for letting us know. We'll miss you.",
  thanksMaybe: 'Thank you! Please let the organisers know as soon as you can.',
  deadline: 'Please answer by {date}.',
  language: 'Language',
  invited: 'You are invited',
}

const ES: typeof EN = {
  intro: 'Por favor, cuéntanos si podrás venir.',
  nameLabel: 'Tu nombre completo',
  nameHelp: 'Escríbelo tal como aparece en tu invitación.',
  continue: 'Continuar',
  checking: 'Comprobando…',
  back: 'Atrás',
  confirmTitle: '¿Eres tú?',
  yesMe: 'Sí, soy yo',
  notMe: 'No, volver',
  noMatch: 'No hemos encontrado ese nombre en la lista de invitados. Aun así puedes responder y los organizadores revisarán tus datos.',
  ambiguous:
    'Hemos encontrado más de una posible coincidencia, o el nombre parece incompleto. Escribe tu nombre completo tal como aparece en tu invitación. Si no funciona, ponte en contacto con los organizadores.',
  answered: 'Este nombre ya ha respondido. Para cambiar tu respuesta, ponte en contacto con los organizadores.',
  closedTitle: 'La confirmación está cerrada',
  closedBody: 'Este enlace no acepta respuestas en este momento. Ponte en contacto con los organizadores.',
  rateLimited: 'Demasiados intentos en este momento. Inténtalo de nuevo en unos minutos.',
  generalError: 'Algo ha salido mal. Inténtalo de nuevo.',
  plusOneExists: 'Ya hay un acompañante registrado para ti. Ponte en contacto con los organizadores para cambiarlo.',
  attendQ: '¿Vendrás?',
  attending: 'Sí, asistiré',
  declined: 'No, no podré asistir',
  maybe: 'Aún no lo sé',
  dietaryLabel: 'Requisitos dietéticos o alergias (opcional)',
  dietaryHelp: 'Por ejemplo: vegetariano, sin gluten, alergia a los frutos secos.',
  plusOneCheck: 'Vengo con acompañante',
  plusName: 'Nombre completo del acompañante',
  plusDietary: 'Requisitos dietéticos del acompañante (opcional)',
  consent: 'Acepto que mi nombre, mi respuesta y la información dietética se guarden y se compartan con el equipo de organización para preparar este evento.',
  privacy: 'La información dietética puede revelar datos de salud o religión, así que comparte solo lo que te parezca bien. Puedes dejarlo vacío.',
  submit: 'Enviar mi respuesta',
  sending: 'Enviando…',
  thanksAttending: '¡Gracias! Estamos deseando verte.',
  thanksDeclined: 'Gracias por avisarnos. Te echaremos de menos.',
  thanksMaybe: '¡Gracias! Avisa a los organizadores en cuanto puedas.',
  deadline: 'Por favor, responde antes del {date}.',
  language: 'Idioma',
  invited: 'Estás invitado/a',
}

const FR: typeof EN = {
  intro: 'Merci de nous dire si vous pourrez venir.',
  nameLabel: 'Votre nom complet',
  nameHelp: 'Saisissez-le tel qu’il figure sur votre invitation.',
  continue: 'Continuer',
  checking: 'Vérification…',
  back: 'Retour',
  confirmTitle: 'Est-ce bien vous ?',
  yesMe: 'Oui, c’est moi',
  notMe: 'Non, retour',
  noMatch: 'Nous n’avons pas trouvé ce nom dans la liste des invités. Vous pouvez tout de même répondre ; les organisateurs vérifieront vos informations.',
  ambiguous:
    'Nous avons trouvé plusieurs correspondances possibles, ou le nom semble incomplet. Saisissez votre nom complet tel qu’il figure sur votre invitation. Si cela ne fonctionne pas, contactez les organisateurs.',
  answered: 'Ce nom a déjà répondu. Pour modifier votre réponse, contactez les organisateurs.',
  closedTitle: 'Les réponses sont closes',
  closedBody: 'Ce lien n’accepte pas de réponses pour le moment. Veuillez contacter les organisateurs.',
  rateLimited: 'Trop de tentatives en ce moment. Réessayez dans quelques minutes.',
  generalError: 'Une erreur s’est produite. Veuillez réessayer.',
  plusOneExists: 'Un accompagnant est déjà enregistré pour vous. Contactez les organisateurs pour le modifier.',
  attendQ: 'Serez-vous présent(e) ?',
  attending: 'Oui, je serai là',
  declined: 'Non, je ne pourrai pas venir',
  maybe: 'Je ne sais pas encore',
  dietaryLabel: 'Régime alimentaire ou allergies (facultatif)',
  dietaryHelp: 'Par exemple : végétarien, sans gluten, allergie aux fruits à coque.',
  plusOneCheck: 'Je viens avec un(e) accompagnant(e)',
  plusName: 'Nom complet de l’accompagnant(e)',
  plusDietary: 'Régime alimentaire de l’accompagnant(e) (facultatif)',
  consent: 'J’accepte que mon nom, ma réponse et les informations alimentaires soient conservés et transmis à l’équipe d’organisation pour préparer cet événement.',
  privacy: 'Les informations alimentaires peuvent révéler des données de santé ou de religion : ne partagez que ce qui vous convient. Vous pouvez laisser ce champ vide.',
  submit: 'Envoyer ma réponse',
  sending: 'Envoi…',
  thanksAttending: 'Merci ! Nous avons hâte de vous voir.',
  thanksDeclined: 'Merci de nous avoir prévenus. Vous nous manquerez.',
  thanksMaybe: 'Merci ! Prévenez les organisateurs dès que possible.',
  deadline: 'Merci de répondre avant le {date}.',
  language: 'Langue',
  invited: 'Vous êtes invité(e)',
}

export type Dict = typeof EN
export const TEXT: Record<Lang, Dict> = { es: ES, en: EN, fr: FR }

export function fill(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

/** First supported language in an Accept-Language header, else Spanish (the launch market). */
export function pickLang(acceptLanguage: string | null | undefined, explicit?: string | null): Lang {
  if (explicit && (LANGS as string[]).includes(explicit)) return explicit as Lang
  for (const part of (acceptLanguage ?? '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase()
    if ((LANGS as string[]).includes(code)) return code as Lang
  }
  return 'es'
}
