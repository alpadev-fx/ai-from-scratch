/**
 * Plantillas transaccionales de IA desde cero.
 *
 * Este módulo no envía correo: rinde asunto, HTML y texto. El envío vive en
 * api/src/mail.ts (Resend) y lo disparan las rutas que ya observan el hecho
 * -- registro y recuperación en auth/src/index.ts, el recibo en la ruta de
 * entitlements de api/src/server.ts. Mantener el envío fuera de payments evita
 * que una caída de correo retrase el webhook de Mercado Pago o un entitlement.
 *
 * BILINGÜE POR TIPO, NO POR PLANTILLA SUELTA. `SPECS` es
 * `Record<Lang, Record<EmailKind, Spec>>`: el compilador exige la traducción
 * completa. Un mapa parcial con respaldo silencioso a español era la trampa --
 * quien conectara una plantilla nueva le mandaría español a un alumno en
 * inglés sin que nada fallara.
 */

export type Lang = 'es' | 'en';

export type EmailKind =
  | 'welcome' | 'verify_email' | 'password_reset' | 'password_changed'
  | 'sign_in_alert' | 'account_locked' | 'purchase_receipt' | 'payment_pending'
  | 'payment_failed' | 'subscription_started' | 'renewal_notice'
  | 'subscription_receipt' | 'subscription_cancelled' | 'access_expiring'
  | 'refund_confirmed' | 'dispute_received' | 'support_opened' | 'support_reply'
  | 'support_closed' | 'product_update';

export interface EmailInput {
  kind: EmailKind;
  name: string;
  /** 'es' por defecto. Usa `mailLang()` para normalizar el idioma del usuario. */
  lang?: Lang;
  actionUrl?: string;
  fields?: Array<{ label: string; value: string }>;
  supportEmail?: string;
}

/**
 * El idioma del usuario ('auto', 'fr', 'pt', ...) al idioma de correo.
 *
 * Español es el respaldo del producto en todo el servidor (lesson-meta.ts,
 * assess.ts, grading.ts): inglés es una capa explícita, nunca al revés.
 */
export const mailLang = (lang: unknown): Lang => (lang === 'en' ? 'en' : 'es');

type Spec = {
  category: string;
  subject: string;
  preheader: string;
  title: string;
  paragraphs: readonly string[];
  cta?: string;
  footer: string;
  marketing?: boolean;
};

// Los textos usan {{nombre}}. Los datos financieros entran por fields, nunca
// se inventan en la plantilla. Todo correo de producto exige consentimiento.
const ES: Record<EmailKind, Spec> = {
  welcome: {
    category: 'Cuenta', subject: 'Bienvenida a IA desde cero',
    preheader: 'Tu cuenta ya está lista para empezar.', title: 'Tu cuenta está lista.',
    paragraphs: ['Hola, {{nombre}}.',
      'Tu cuenta en IA desde cero ya está lista. Empiezas con la lección 1, gratis; el curso completo son 12 lecciones y 36 labs, en español e inglés.',
      'Si más adelante te llevas el curso completo, tienes 14 días de garantía desde el primer cobro, sin explicar por qué.'],
    cta: 'Entrar a la plataforma', footer: 'Este correo confirma la creación de una cuenta.'
  },
  verify_email: {
    category: 'Cuenta', subject: 'Confirma tu correo', preheader: 'Confirma que este correo es tuyo.',
    title: 'Confirma tu correo.', paragraphs: ['Hola, {{nombre}}.', 'Usa el botón para confirmar este correo y mantener seguras las notificaciones de tu cuenta.'],
    cta: 'Confirmar correo', footer: 'Si no creaste esta cuenta, puedes ignorar este mensaje.'
  },
  password_reset: {
    category: 'Seguridad', subject: 'Restablece tu contraseña', preheader: 'Solicitaste una contraseña nueva.',
    title: 'Restablece tu contraseña.', paragraphs: ['Hola, {{nombre}}.', 'Recibimos una solicitud para cambiar tu contraseña. El enlace vence pronto por seguridad.'],
    cta: 'Crear contraseña nueva', footer: 'Si no hiciste esta solicitud, ignora este correo. Tu contraseña actual seguirá vigente.'
  },
  password_changed: {
    category: 'Seguridad', subject: 'Tu contraseña fue actualizada', preheader: 'Confirmamos el cambio de contraseña.',
    title: 'Contraseña actualizada.', paragraphs: ['Hola, {{nombre}}.', 'La contraseña de tu cuenta se cambió correctamente y cerramos las demás sesiones.'],
    cta: 'Entrar a la plataforma', footer: 'Si no reconoces este cambio, restablece tu contraseña de inmediato y contacta a soporte.'
  },
  sign_in_alert: {
    category: 'Seguridad', subject: 'Nuevo acceso a tu cuenta', preheader: 'Te avisamos de un inicio de sesión nuevo.',
    title: 'Revisa este acceso.', paragraphs: ['Hola, {{nombre}}.', 'Detectamos un inicio de sesión nuevo en tu cuenta. Revisa los detalles para confirmar que fuiste tú.'],
    cta: 'Revisar seguridad', footer: 'No incluimos direcciones IP ni datos sensibles en este correo.'
  },
  account_locked: {
    category: 'Seguridad', subject: 'Tu cuenta fue bloqueada temporalmente', preheader: 'Protegimos tu cuenta tras varios intentos fallidos.',
    title: 'Protegimos tu cuenta.', paragraphs: ['Hola, {{nombre}}.', 'Bloqueamos temporalmente los nuevos inicios de sesión después de varios intentos fallidos.'],
    cta: 'Recuperar acceso', footer: 'Si fuiste tú, espera el tiempo indicado o usa recuperación de contraseña.'
  },
  purchase_receipt: {
    category: 'Pago', subject: 'Recibo de tu compra', preheader: 'Tu pago fue confirmado y tu acceso está activo.',
    title: 'Pago confirmado.', paragraphs: ['Hola, {{nombre}}.', 'Confirmamos tu pago. Tu acceso al curso está activo y este mensaje funciona como tu recibo de compra.'],
    cta: 'Abrir el curso', footer: 'Guarda este recibo. Para reembolsos o dudas, responde desde soporte.'
  },
  payment_pending: {
    category: 'Pago', subject: 'Tu pago está pendiente', preheader: 'Esperamos la confirmación del medio de pago.',
    title: 'Aún esperamos confirmación.', paragraphs: ['Hola, {{nombre}}.', 'Tu compra fue iniciada, pero el medio de pago todavía no la confirmó. No necesitas pagar de nuevo.'],
    cta: 'Ver estado de compra', footer: 'El acceso se habilita solo cuando el proveedor confirma el pago.'
  },
  payment_failed: {
    category: 'Pago', subject: 'No pudimos confirmar tu pago', preheader: 'Tu acceso no fue cobrado ni habilitado.',
    title: 'No confirmamos el pago.', paragraphs: ['Hola, {{nombre}}.', 'El proveedor no confirmó esta compra. Tu acceso no cambió y no debes hacer nada si no quieres intentar de nuevo.'],
    cta: 'Intentar otra vez', footer: 'Si ves un cargo confirmado, no repitas el pago. Contacta a soporte con el comprobante.'
  },
  subscription_started: {
    category: 'Suscripción', subject: 'Tu suscripción está activa', preheader: 'Confirmamos tu membresía.',
    title: 'Tu membresía está activa.', paragraphs: ['Hola, {{nombre}}.', 'Tu suscripción fue confirmada. Conservas el acceso mientras se mantenga activa.'],
    cta: 'Administrar suscripción', footer: 'Recibirás un aviso antes de cada cobro y podrás cancelar desde tu cuenta.'
  },
  renewal_notice: {
    category: 'Suscripción', subject: 'Próximo cobro de tu suscripción', preheader: 'Te avisamos antes de renovar.',
    title: 'Tu renovación se acerca.', paragraphs: ['Hola, {{nombre}}.', 'Te avisamos antes del siguiente cobro. Revisa el importe y la fecha en los detalles.'],
    cta: 'Administrar suscripción', footer: 'Puedes cancelar antes de la renovación desde tu cuenta.'
  },
  subscription_receipt: {
    category: 'Suscripción', subject: 'Recibo de renovación', preheader: 'Tu renovación fue confirmada.',
    title: 'Renovación confirmada.', paragraphs: ['Hola, {{nombre}}.', 'Confirmamos la renovación de tu suscripción. Tu acceso continúa activo.'],
    cta: 'Ver suscripción', footer: 'Guarda este recibo para tus registros.'
  },
  subscription_cancelled: {
    category: 'Suscripción', subject: 'Tu suscripción fue cancelada', preheader: 'Confirmamos la cancelación.',
    title: 'Cancelación confirmada.', paragraphs: ['Hola, {{nombre}}.', 'La renovación automática fue cancelada. Conservas tu acceso hasta el final del periodo ya pagado, si aplica.'],
    cta: 'Ver suscripción', footer: 'No se realizarán nuevos cobros después de la fecha indicada.'
  },
  access_expiring: {
    category: 'Suscripción', subject: 'Tu acceso está por vencer', preheader: 'Tu periodo actual termina pronto.',
    title: 'Tu acceso termina pronto.', paragraphs: ['Hola, {{nombre}}.', 'Tu periodo actual está por terminar. Actualiza tu medio de pago o reactiva la suscripción si quieres conservar el acceso.'],
    cta: 'Reactivar suscripción', footer: 'No se cobra nada hasta que confirmes una nueva suscripción.'
  },
  refund_confirmed: {
    category: 'Pago', subject: 'Tu reembolso fue confirmado', preheader: 'Iniciamos el reembolso con el mismo medio de pago.',
    title: 'Reembolso confirmado.', paragraphs: ['Hola, {{nombre}}.', 'Confirmamos el reembolso. El tiempo en que aparece depende de tu banco o del medio de pago.'],
    cta: 'Ver detalles', footer: 'El acceso asociado a esta compra fue revocado al procesar el reembolso.'
  },
  dispute_received: {
    category: 'Pago', subject: 'Recibimos una disputa de pago', preheader: 'Te explicamos qué sigue.',
    title: 'Estamos revisando una disputa.', paragraphs: ['Hola, {{nombre}}.', 'El proveedor nos avisó de una disputa relacionada con un pago. Nuestro equipo revisará la información y te contactará si necesita algo.'],
    cta: 'Contactar soporte', footer: 'No envíes información de tarjetas por correo.'
  },
  support_opened: {
    category: 'Soporte', subject: 'Recibimos tu solicitud de soporte', preheader: 'Tu caso ya está registrado.',
    title: 'Recibimos tu solicitud.', paragraphs: ['Hola, {{nombre}}.', 'Tu solicitud llegó a soporte. Usaremos este mismo hilo para mantener el contexto de la conversación.'],
    cta: 'Ver solicitud', footer: 'No respondas con contraseñas, códigos de recuperación ni datos de tarjeta.'
  },
  support_reply: {
    category: 'Soporte', subject: 'Soporte respondió tu solicitud', preheader: 'Hay una actualización en tu caso.',
    title: 'Hay una respuesta para ti.', paragraphs: ['Hola, {{nombre}}.', 'El equipo de soporte actualizó tu solicitud. Puedes leer y responder desde la plataforma.'],
    cta: 'Abrir conversación', footer: 'Este correo mantiene tu caso en un único hilo.'
  },
  support_closed: {
    category: 'Soporte', subject: 'Tu solicitud de soporte fue cerrada', preheader: 'Confirmamos el cierre de tu caso.',
    title: 'Tu caso fue cerrado.', paragraphs: ['Hola, {{nombre}}.', 'Cerramos tu solicitud de soporte. Si el problema continúa, abre una nueva solicitud con los detalles actuales.'],
    cta: 'Ir a soporte', footer: 'Conservamos el historial del caso para dar continuidad si vuelves a contactarnos.'
  },
  product_update: {
    category: 'Producto', subject: 'Novedades de IA desde cero', preheader: 'Hay contenido nuevo disponible.',
    title: 'Hay novedades en el curso.', paragraphs: ['Hola, {{nombre}}.', 'Publicamos una actualización de producto o contenido que puede interesarte.'],
    cta: 'Ver novedades', footer: 'Este correo se envía solo a personas que aceptaron comunicaciones de producto.', marketing: true
  },
};

const EN: Record<EmailKind, Spec> = {
  welcome: {
    category: 'Account', subject: 'Welcome to IA desde cero',
    preheader: 'Your account is ready.', title: 'Your account is ready.',
    paragraphs: ['Hi {{nombre}},',
      'Your IA desde cero account is ready. You start with lesson 1, free; the full course is 12 lessons and 36 labs, in Spanish and English.',
      'If you take the full course later, you get a 14-day guarantee from the first charge, no reason needed.'],
    cta: 'Open the platform', footer: 'This email confirms that an account was created.'
  },
  verify_email: {
    category: 'Account', subject: 'Confirm your email', preheader: 'Confirm this email is yours.',
    title: 'Confirm your email.', paragraphs: ['Hi {{nombre}},', 'Use the button to confirm this address and keep your account notifications secure.'],
    cta: 'Confirm email', footer: 'If you did not create this account, you can ignore this message.'
  },
  password_reset: {
    category: 'Security', subject: 'Reset your password', preheader: 'You asked for a new password.',
    title: 'Reset your password.', paragraphs: ['Hi {{nombre}},', 'We received a request to change your password. The link expires soon for security.'],
    cta: 'Set a new password', footer: 'If you did not ask for this, ignore this email. Your current password stays valid.'
  },
  password_changed: {
    category: 'Security', subject: 'Your password was updated', preheader: 'We confirmed the password change.',
    title: 'Password updated.', paragraphs: ['Hi {{nombre}},', 'Your account password was changed and we signed out the other sessions.'],
    cta: 'Open the platform', footer: 'If you do not recognise this change, reset your password right away and contact support.'
  },
  sign_in_alert: {
    category: 'Security', subject: 'New sign-in to your account', preheader: 'We are flagging a new sign-in.',
    title: 'Check this sign-in.', paragraphs: ['Hi {{nombre}},', 'We detected a new sign-in on your account. Review the details to confirm it was you.'],
    cta: 'Review security', footer: 'We never include IP addresses or sensitive data in this email.'
  },
  account_locked: {
    category: 'Security', subject: 'Your account was locked temporarily', preheader: 'We protected your account after failed attempts.',
    title: 'We protected your account.', paragraphs: ['Hi {{nombre}},', 'We temporarily blocked new sign-ins after several failed attempts.'],
    cta: 'Recover access', footer: 'If it was you, wait out the lock or use password recovery.'
  },
  purchase_receipt: {
    category: 'Payment', subject: 'Your purchase receipt', preheader: 'Your payment cleared and your access is active.',
    title: 'Payment confirmed.', paragraphs: ['Hi {{nombre}},', 'Your payment is confirmed. Your course access is active and this message is your purchase receipt.'],
    cta: 'Open the course', footer: 'Keep this receipt. For refunds or questions, reply through support.'
  },
  payment_pending: {
    category: 'Payment', subject: 'Your payment is pending', preheader: 'We are waiting on the payment provider.',
    title: 'Still waiting for confirmation.', paragraphs: ['Hi {{nombre}},', 'Your purchase started, but the payment method has not confirmed it yet. You do not need to pay again.'],
    cta: 'Check purchase status', footer: 'Access is enabled only once the provider confirms the payment.'
  },
  payment_failed: {
    category: 'Payment', subject: 'We could not confirm your payment', preheader: 'You were not charged and access did not change.',
    title: 'The payment was not confirmed.', paragraphs: ['Hi {{nombre}},', 'The provider did not confirm this purchase. Your access is unchanged and you need to do nothing unless you want to try again.'],
    cta: 'Try again', footer: 'If you see a confirmed charge, do not pay again. Contact support with the proof of payment.'
  },
  subscription_started: {
    category: 'Subscription', subject: 'Your subscription is active', preheader: 'We confirmed your membership.',
    title: 'Your membership is active.', paragraphs: ['Hi {{nombre}},', 'Your subscription is confirmed. You keep access while it stays active.'],
    cta: 'Manage subscription', footer: 'You will be notified before each charge and can cancel from your account.'
  },
  renewal_notice: {
    category: 'Subscription', subject: 'Upcoming subscription charge', preheader: 'A heads-up before we renew.',
    title: 'Your renewal is coming up.', paragraphs: ['Hi {{nombre}},', 'This is your notice before the next charge. Check the amount and date in the details.'],
    cta: 'Manage subscription', footer: 'You can cancel before the renewal from your account.'
  },
  subscription_receipt: {
    category: 'Subscription', subject: 'Renewal receipt', preheader: 'Your renewal was confirmed.',
    title: 'Renewal confirmed.', paragraphs: ['Hi {{nombre}},', 'We confirmed your subscription renewal. Your access continues.'],
    cta: 'View subscription', footer: 'Keep this receipt for your records.'
  },
  subscription_cancelled: {
    category: 'Subscription', subject: 'Your subscription was cancelled', preheader: 'We confirmed the cancellation.',
    title: 'Cancellation confirmed.', paragraphs: ['Hi {{nombre}},', 'Automatic renewal was cancelled. You keep access until the end of the period you already paid for, if any.'],
    cta: 'View subscription', footer: 'No further charges will be made after the date shown.'
  },
  access_expiring: {
    category: 'Subscription', subject: 'Your access is about to expire', preheader: 'Your current period ends soon.',
    title: 'Your access ends soon.', paragraphs: ['Hi {{nombre}},', 'Your current period is about to end. Update your payment method or restart the subscription if you want to keep access.'],
    cta: 'Restart subscription', footer: 'Nothing is charged until you confirm a new subscription.'
  },
  refund_confirmed: {
    category: 'Payment', subject: 'Your refund was confirmed', preheader: 'We issued the refund to the original payment method.',
    title: 'Refund confirmed.', paragraphs: ['Hi {{nombre}},', 'We confirmed the refund. How long it takes to appear depends on your bank or payment method.'],
    cta: 'View details', footer: 'The access tied to this purchase was revoked when the refund was processed.'
  },
  dispute_received: {
    category: 'Payment', subject: 'We received a payment dispute', preheader: 'Here is what happens next.',
    title: 'We are reviewing a dispute.', paragraphs: ['Hi {{nombre}},', 'The provider notified us of a dispute on a payment. Our team will review it and contact you if anything is needed.'],
    cta: 'Contact support', footer: 'Never send card details by email.'
  },
  support_opened: {
    category: 'Support', subject: 'We received your support request', preheader: 'Your case is registered.',
    title: 'We received your request.', paragraphs: ['Hi {{nombre}},', 'Your request reached support. We will use this same thread to keep the context of the conversation.'],
    cta: 'View request', footer: 'Never reply with passwords, recovery codes or card details.'
  },
  support_reply: {
    category: 'Support', subject: 'Support replied to your request', preheader: 'There is an update on your case.',
    title: 'There is a reply for you.', paragraphs: ['Hi {{nombre}},', 'The support team updated your request. You can read and reply from the platform.'],
    cta: 'Open conversation', footer: 'This email keeps your case in a single thread.'
  },
  support_closed: {
    category: 'Support', subject: 'Your support request was closed', preheader: 'We confirmed your case is closed.',
    title: 'Your case was closed.', paragraphs: ['Hi {{nombre}},', 'We closed your support request. If the problem continues, open a new request with the current details.'],
    cta: 'Go to support', footer: 'We keep the case history so we can pick up where we left off.'
  },
  product_update: {
    category: 'Product', subject: 'What is new in IA desde cero', preheader: 'There is new content available.',
    title: 'There is something new in the course.', paragraphs: ['Hi {{nombre}},', 'We published a product or content update you may care about.'],
    cta: 'See what is new', footer: 'This email only goes to people who opted in to product communications.', marketing: true
  },
};

export const SPECS: Record<Lang, Record<EmailKind, Spec>> = { es: ES, en: EN };

/** @deprecated Se conserva para lectores del catálogo; usa `SPECS[lang]`. */
export const EMAIL_SPECS = ES;

const html = (value: string): string => value.replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[char] ?? char);

const fill = (value: string, name: string): string => value.replaceAll('{{nombre}}', html(name));

const HELP: Record<Lang, (support: string) => string> = {
  es: (support) => `¿Necesitas ayuda? <a href="mailto:${support}" style="color:#0A84FF">${support}</a>`,
  en: (support) => `Need help? <a href="mailto:${support}" style="color:#0A84FF">${support}</a>`,
};
const SUPPORT_LINE: Record<Lang, string> = { es: 'Soporte', en: 'Support' };

/** Rinde una tabla compatible con clientes de correo, sin CSS remoto ni scripts. */
export function renderEmailHtml(input: EmailInput): { subject: string; html: string; text: string } {
  const lang: Lang = input.lang ?? 'es';
  const spec = SPECS[lang][input.kind];
  const support = input.supportEmail ?? 'soporte@aifromscratch.shop';
  const details = (input.fields ?? []).map(({ label, value }) => `
    <tr><td style="padding:10px 0;border-top:1px solid #2C2C2E;color:#A1A1AA;font:12px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${html(label)}</td><td align="right" style="padding:10px 0;border-top:1px solid #2C2C2E;color:#F5F8FF;font:600 12px/18px ui-monospace,SFMono-Regular,Menlo,monospace">${html(value)}</td></tr>`).join('');
  const button = spec.cta && input.actionUrl ? `<tr><td style="padding-top:26px"><a href="${html(input.actionUrl)}" style="display:inline-block;background:#F5F8FF;color:#070B14;padding:13px 18px;font:700 12px/16px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none">${html(spec.cta)}</a></td></tr>` : '';
  const paragraphs = spec.paragraphs.map((p) => `<p style="margin:0 0 14px;color:#C7C7CC;font:16px/24px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${fill(p, input.name)}</p>`).join('');
  const result = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(spec.subject)}</title></head><body style="margin:0;background:#070B14"><span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${html(spec.preheader)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070B14"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0B0B0C;border:1px solid #2C2C2E"><tr><td style="padding:28px 30px 18px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:30px;height:30px;border:1px solid #57575D;color:#F5F8FF;text-align:center;font:700 13px/30px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">IA</td><td style="padding-left:10px;color:#F5F8FF;font:600 13px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">IA desde cero</td></tr></table></td></tr><tr><td style="padding:22px 30px 30px"><p style="margin:0 0 10px;color:#0A84FF;font:600 10px/14px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1.4px;text-transform:uppercase">${html(spec.category)}</p><h1 style="margin:0 0 18px;color:#F5F8FF;font:700 28px/32px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-.6px">${html(spec.title)}</h1>${paragraphs}${details ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px">${details}</table>` : ''}<table role="presentation" cellspacing="0" cellpadding="0">${button}</table></td></tr><tr><td style="padding:18px 30px 28px;border-top:1px solid #2C2C2E"><p style="margin:0;color:#8E8E93;font:12px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${html(spec.footer)}</p><p style="margin:12px 0 0;color:#8E8E93;font:12px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${HELP[lang](html(support))}</p></td></tr></table></td></tr></table></body></html>`;
  const text = [spec.title, ...spec.paragraphs.map((p) => p.replaceAll('{{nombre}}', input.name)), ...(input.fields ?? []).map((f) => `${f.label}: ${f.value}`), spec.cta && input.actionUrl ? `${spec.cta}: ${input.actionUrl}` : '', spec.footer, `${SUPPORT_LINE[lang]}: ${support}`].filter(Boolean).join('\n\n');
  return { subject: spec.subject, html: result, text };
}
