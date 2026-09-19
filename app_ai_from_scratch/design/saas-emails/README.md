# Correos SaaS

Esta carpeta define las comunicaciones que puede enviar IA desde cero. `templates.ts` contiene el HTML compatible con clientes de correo, texto alternativo y los campos dinámicos, en español e inglés (`SPECS[lang][kind]`; usa `mailLang()` para normalizar el idioma del usuario, que puede ser `auto`, `fr` o `pt`). `preview.html` permite inspeccionar cada estado y sus vistas Mostrar/Cerrar sin conectar ningún proveedor.

## Catálogo y disparador

| Grupo | Plantillas | Disparador autorizado |
|---|---|---|
| Cuenta | `welcome`, `verify_email` | Registro exitoso y verificación solicitada. |
| Seguridad | `password_reset`, `password_changed`, `sign_in_alert`, `account_locked` | Eventos de `/auth`. Nunca adjuntar contraseñas, tokens o IPs completas. |
| Pago | `purchase_receipt`, `payment_pending`, `payment_failed`, `refund_confirmed`, `dispute_received` | Estado confirmado por webhook de Mercado Pago. No enviar un recibo por el retorno del navegador. |
| Suscripción | `subscription_started`, `renewal_notice`, `subscription_receipt`, `subscription_cancelled`, `access_expiring` | Cambios de estado confirmados por el proveedor y tareas programadas. |
| Soporte | `support_opened`, `support_reply`, `support_closed` | Sistema de tickets. Conservar el identificador del caso en los campos. |
| Producto | `product_update` | Solo con consentimiento de comunicaciones de producto. No mezclarlo con los correos transaccionales. |

## Integración segura

1. Conectar un proveedor de correo transaccional en un adaptador nuevo. No usar el proceso web como cola de envíos.
2. Duplicar el patrón durable de pagos: registrar el evento, deduplicar por evento y reintentar de forma acotada.
3. Para recibos, conservar en los `fields` el identificador del proveedor, importe, moneda, producto, fecha y estado. El importe solo se toma del webhook confirmado.
4. Definir una dirección remitente con SPF, DKIM y DMARC antes de enviar correo real.
5. Registrar consentimiento, baja y categorías de marketing por separado. `product_update` nunca se entrega por defecto.

## Qué está conectado HOY

El proveedor es Resend (`api/src/mail.ts`), y `RESEND_API_KEY` + `MAIL_FROM` son
ambas-o-ninguna: media configuración lanza al arrancar, no degrada en silencio.

| Plantilla | Disparador en el código |
|---|---|
| `welcome` | `POST /api/auth/register` — `auth/src/index.ts` |
| `password_reset` | `POST /api/auth/recover` — `auth/src/index.ts` |
| `password_changed` | `POST /api/auth/reset` — `auth/src/index.ts` |
| `purchase_receipt` | `POST /api/internal/entitlements` con `source = mercadopago.payment` — `api/src/server.ts` |

Las 16 restantes siguen sin disparador. Están traducidas y probadas
(`api/test/email-templates.mts`), pero nada en el código las envía: no las
cuentes como funcionalidad.

## Lo que sigue sin hacerse

1. **No hay reintento ni cola.** Todo envío es «dispara y olvida» con log: un
   429 o un 5xx de Resend pierde el correo para siempre. La plataforma ya tiene
   RabbitMQ y un patrón durable en `payments` — duplicarlo aquí es el siguiente
   paso, no un lujo.
2. **No hay registro de consentimiento ni baja por categoría.** `product_update`
   está marcada `marketing: true` y no debe salir hasta que eso exista.
3. **SPF, DKIM y DMARC** del dominio remitente antes de enviar correo real.
4. **`account_locked` no está conectada y no debe conectarse tal cual.** Su
   disparador es un login fallido: sin autenticar y elegido por el atacante.
   Cinco contraseñas erróneas contra una dirección conocida le mandan un correo
   a su dueño, y se repite cada vez que caduca el bloqueo. Necesita un tope de
   envíos por destinatario antes de existir — el mismo motivo por el que
   `/api/auth/recover` está limitada a 3 por hora y cuenta.
