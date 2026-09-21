# IA desde cero — Brief de producto y operación

**Marca:** IA desde cero / AI from Scratch · **Creador:** Alejandro Padrón · **Proyecto:** Alpadev

**Producto inicial:** Fundamentos Vol. 1 · **Fecha de revisión:** 14 de septiembre de 2026

**Uso:** documento de referencia para producto, ventas, contenido, soporte y operación.

## 1. Resumen ejecutivo

**IA desde cero es una plataforma de aprendizaje práctico para entender la inteligencia artificial y empezar a usarla con criterio, sin conocimientos previos de programación.** Combina explicaciones visuales, ejercicios interactivos, evaluaciones, un asistente de IA y seguimiento personal del avance.

La puerta de entrada es una lección gratuita. El acceso completo cuesta **39.990 COP por 30 días**, con renovación automática mensual opcional. Mientras el acceso esté activo, la oferta incluye el contenido publicado y los tutoriales, laboratorios y cursos nuevos que se incorporen.

La propuesta comercial también incluye un PDF en español y acceso al entorno de trabajo de Claude Code del creador, con nueve prompts y sus plantillas. La entrega de ese repositorio y de las plantillas necesita confirmación operativa; el material del curso y el PDF español sí están presentes en el proyecto revisado.

**Base de este brief:** revisión del código, contenido y documentación del checkout local, incluidos los cambios locales existentes. «Implementado» significa que se encontró la función en el proyecto. La revisión no confirma qué versión está desplegada, ni prueba cobros, entrega de correo o disponibilidad actual en producción.

## 2. Público y valor que ofrecemos

### Público principal

- Personas que empiezan con IA y necesitan explicaciones sencillas.
- Personas que ya usan asistentes de IA, pero quieren entender sus respuestas y limitaciones.
- Profesionales, emprendedores y creadores que quieren mejorar sus instrucciones, revisar resultados y aplicar IA a tareas cotidianas.

Esta segmentación es una síntesis de la propuesta y del contenido; no representa una medición de clientes actuales.

### Resultado de aprendizaje

El estudiante practica cómo formular pedidos claros, reconocer el efecto del contexto y la temperatura, distinguir entrenamiento de uso del modelo y verificar respuestas que pueden contener información inventada. El contenido presenta aplicaciones a informes, correos, propuestas, resúmenes y organización del trabajo.

El formato es autónomo y a ritmo propio. La comunicación comercial menciona aproximadamente **40 minutos de lectura**; ese dato es una estimación de lectura, no la duración total con ejercicios, evaluaciones y práctica.

## 3. Catálogo completo de la oferta

| Componente | Qué recibe la persona | Entrega y estado observado |
|---|---|---|
| Primera lección gratuita | Lección 1, sus tres laboratorios y su quiz | Con cuenta, sin compra. Implementado. |
| Curso Fundamentos Vol. 1 | 12 lecciones con explicación, analogía y dos ejemplos resueltos por lección e idioma | Contenido ES/EN presente y comprobado localmente. |
| Experiencias visuales | Una escena animada por lección para mostrar el concepto | Integradas en las páginas del curso. |
| Laboratorios interactivos | 36 ejercicios, tres por lección: fácil, medio y difícil | Corrección en el servidor, intentos y avance guardados. Comprobados localmente. |
| Quizzes | 12 cuestionarios de tres preguntas: 36 preguntas en total | Integrados en las lecciones y corregidos en el servidor. |
| Exámenes de bloque | Tres exámenes de seis preguntas: 18 preguntas adicionales | Bloques 1–4, 5–8 y 9–12. Aprobación con cinco de seis aciertos. |
| Asistente de IA | Explicaciones, búsqueda dentro del curso, orientación sobre errores, progreso y siguiente paso | Chat y panel flotante implementados; requiere proveedores activos. |
| Acompañamiento automático | Sugerencias sobre qué continuar y recordatorios dentro de la plataforma basados en actividad | Implementado; el usuario puede desactivar las sugerencias. |
| Seguimiento personal | Avance por lección, laboratorios resueltos, intentos, rachas y actividad | Panel, perfil y herramientas del asistente. |
| Reconocimientos | 36 insignias de lección y 12 rangos: **48 logros en total** | Se obtienen con laboratorios resueltos y lecciones completadas. |
| Ranking y ligas | Participación opcional con alias; ligas semanales de bronce, plata y oro | Implementados; las ligas requieren compra, inscripción al ranking y al menos cinco participantes elegibles. |
| PDF del curso | Guía descargable en español para consultar fuera de la plataforma | Archivo presente; descarga protegida por acceso de pago. PDF inglés pendiente. |
| Nueve prompts y plantillas | Recursos reutilizables anunciados en la oferta | No se localizó un paquete de entrega ni un acceso para el alumno en las rutas revisadas. |
| Entorno de Claude Code | Configuración del creador: skills, hooks, comandos, ajustes, agentes y flujos de trabajo | Anunciado como repositorio incluido; acceso y actualización para compradores por confirmar. |
| Nuevas publicaciones | Tutoriales, laboratorios, actualizaciones y cursos que se publiquen | Incluidos mientras el acceso esté activo. Sin frecuencia de publicación comprometida. |
| Soporte humano | Ayuda con cuenta, compra, acceso, contenido y devoluciones | Página de soporte con correo y botón para escribir. |

**Capacidades de comodidad:** español e inglés, tema oscuro o papel, preferencias de sonido y movimiento reducido, recorrido de bienvenida y lectura en voz alta de las lecciones mediante las funciones del navegador.

## 4. Temario de Fundamentos Vol. 1

| Lección | Tema | Qué aprende a reconocer o hacer |
|---|---|---|
| 01 | Aprender con ejemplos | Entender que un modelo encuentra patrones a partir de ejemplos. |
| 02 | Entrenamiento y error | Comprender cómo mejora al reducir sus errores. |
| 03 | Pesos y parámetros | Relacionar lo aprendido con números ajustados dentro del modelo. |
| 04 | Inferencia | Distinguir entrenar un modelo de utilizarlo para responder. |
| 05 | Tokens | Entender cómo se divide el texto y por qué importa su longitud. |
| 06 | Generación de respuestas | Comprender la elección del siguiente token entre distintas opciones. |
| 07 | Prompts | Formular un pedido con qué necesita, para quién y cómo lo quiere. |
| 08 | Contexto | Reconocer qué información tiene presente el asistente y sus límites. |
| 09 | Temperatura | Relacionar consistencia y variedad con el azar en la generación. |
| 10 | Alucinaciones | Detectar respuestas convincentes que necesitan verificación. |
| 11 | Fecha del conocimiento | Reconocer cuándo hace falta aportar una fuente actual. |
| 12 | Aplicación cotidiana | Empezar a practicar con tareas y pedidos concretos. |

Los laboratorios utilizan seis tipos de interacción: elegir una opción, ordenar pasos, construir una respuesta con piezas, dividir texto, ajustar una perilla y aproximarse a un número mediante pistas de frío o caliente.

## 5. Modelo comercial y reglas de acceso

| Modalidad | Precio configurado | Duración y renovación |
|---|---|---|
| Cuenta gratuita | 0 COP | Primera lección y sus actividades; acceso inicial al asistente sujeto a límites. |
| Compra de un período | 39.990 COP | 30 días desde la aprobación del pago. Sin renovación automática. |
| Renovación mensual | 39.990 COP por mes | Cobro recurrente mediante Mercado Pago, hasta cancelar. La autorización se elige expresamente en el checkout. |

- **La renovación automática está apagada por defecto.** Si se activa, requiere consentimiento adicional.
- El checkout contempla tarjeta y opciones de billetera, PSE y efectivo según la región y el flujo disponible en Mercado Pago. Los medios habilitados deben comprobarse en la cuenta comercial; PSE y efectivo se desactivan al seleccionar renovación.
- Los cupones permiten descuentos, incluidos accesos con descuento total. Se aplican a compras de un período; el flujo recurrente los rechaza.
- El acceso se concede tras validar el pago y su relación con la orden y el usuario. Volver a la página de agradecimiento no basta para activar la compra.
- Cancelar la renovación desde **Perfil** conserva el acceso hasta el final del período pagado.
- Al vencer el período, la cuenta conserva su avance y vuelve al acceso gratuito. Puede comprar otro período.
- La política publicada ofrece **14 días desde el primer cobro para solicitar devolución**, por correo, sin tener que dar un motivo. Publica un plazo de devolución inferior a diez días hábiles; su ejecución corresponde a operación.
- Existen compradores anteriores al modelo de 30 días cuyos términos preservan acceso sin vencimiento. La fecha configurada de corte es el **9 de septiembre de 2026 a las 00:00 de Bogotá**; las excepciones deben respetar las condiciones con las que cada persona compró.

El idioma inglés amplía la accesibilidad del contenido. Por sí solo no acredita cobertura de pagos en todos los países.

## 6. Recorrido operativo del estudiante

1. **Descubre la propuesta.** La página pública presenta el curso, ejemplos visuales, precio, condiciones y preguntas frecuentes.
2. **Crea su cuenta.** Se registra, acepta los términos y entra a su espacio personal.
3. **Prueba la primera lección.** Lee, explora la escena, responde el quiz y practica en los tres laboratorios gratuitos.
4. **Compra acceso completo.** Selecciona el medio de pago, puede aplicar un cupón compatible y decide si desea renovación.
5. **Recibe acceso.** El sistema procesa la confirmación del proveedor y habilita el contenido de pago.
6. **Estudia y practica.** Continúa con las lecciones, pregunta al asistente, resuelve laboratorios y recibe correcciones.
7. **Revisa su aprendizaje.** Consulta su avance, repite preguntas y realiza los exámenes por bloque. Se conservan los mejores resultados por pregunta.
8. **Mantiene el hábito.** Recibe sugerencias dentro de la plataforma, gana logros y puede participar en ranking y ligas.
9. **Consulta sus materiales.** Descarga el PDF desde Perfil. La entrega del repositorio complementario necesita un procedimiento confirmado.
10. **Gestiona su relación con el producto.** Desde Perfil consulta acceso y renovación; desde Ajustes cambia preferencias o solicita el borrado de su cuenta; desde Soporte contacta a una persona.

## 7. Cómo funciona el acompañamiento con IA

El asistente puede explicar conceptos utilizando el material del curso, localizar una lección, presentar actividades, revisar el progreso propio y orientar sobre errores. También responde preguntas de producto: precio, contenidos incluidos, rutas, descargas y soporte.

Ejemplos de uso: «Explícame los tokens más fácil», «¿Qué me falta de esta lección?», «Ayúdame con mis errores» y «Organiza lo siguiente que debo practicar».

El panel flotante permite conversar desde la página que se está estudiando. Las sugerencias proactivas se construyen con datos de actividad y avance; esa parte funciona sin generar una respuesta de un modelo. La conversación con IA sí depende de proveedores configurados.

El acceso del agente a datos está diseñado alrededor de la sesión del estudiante y de sus permisos de compra. Las herramientas no aceptan un identificador de otra persona. El ranking expone alias de quienes aceptan participar.

**Capacidad de uso:** hay límites configurables por persona y para la plataforma. Los valores por defecto del código son 20 mensajes diarios para cuentas gratuitas y 120 para cuentas de pago, además de límites de frecuencia y consumo. Son parámetros operativos, no una cuota comercial verificada en producción. La oferta no debe describirse como IA ilimitada.

## 8. Funciones para operar la plataforma

| Perfil | Funciones observadas | Aplicación operativa |
|---|---|---|
| Estudiante | Curso, ejercicios, evaluaciones, asistente, avance, material, cuenta y participación opcional | Aprendizaje autónomo y autogestión. |
| Tutor | Estudiantes y dificultades agregadas de su cohorte asignada | Identificar inactividad y ejercicios que generan problemas. |
| Administrador | Usuarios, roles, historial de hitos por alumno, pagos, cupones y gestión manual de acceso | Resolver incidencias y gestionar la operación comercial y académica. |
| Root | Capacidades privilegiadas y registro global de laboratorios resueltos | Supervisión restringida del producto. |

La gestión manual permite conceder acceso por un número de días, retirar una concesión o bloquear acceso. Retirar una concesión manual puede dejar vigente una compra válida; el bloqueo tiene un efecto distinto. **Cambiar acceso dentro de la plataforma no equivale a cancelar un cobro recurrente en Mercado Pago.**

El panel de tutor aporta herramientas para acompañar cohortes. No se encontró un paquete comercial independiente de tutoría individual o de formación empresarial definido en la oferta revisada.

## 9. Soporte y continuidad

**Canal publicado:** `founder.alpadev@gmail.com`, accesible desde `/soporte`. La página publica respuesta en menos de 24 horas hábiles, GMT-5. Este es el compromiso anunciado; no se midió su cumplimiento.

| Situación | Procedimiento operativo propuesto |
|---|---|
| Pagó y el curso sigue cerrado | Comprobar usuario, orden, estado del pago y entrega del acceso. Revisar pagos pendientes de asociar y reintentos antes de pedir otra compra. |
| Quiere cancelar renovación | Guiar a Perfil y confirmar el estado devuelto por el servicio de pagos y la fecha hasta la que conserva acceso. |
| Solicita devolución | Localizar la compra, tramitar la política publicada y comprobar tanto la devolución como el estado final del acceso y la renovación. |
| No puede recuperar contraseña | Verificar el envío del enlace de un solo uso y el proveedor de correo. Existe integración con Resend; su configuración y entrega real requieren comprobación. |
| Un ejercicio falla o no guarda | Registrar lección, laboratorio, idioma y resultado observado. Revisar corrección e historial del intento. |
| No recibe el repositorio o las plantillas | Confirmar el recurso y sus permisos, entregar acceso y dejar constancia. Falta localizar ese mecanismo en la plataforma revisada. |
| La plataforma no responde | Comprobar el dominio público y los servicios de origen, revisar alertas y aplicar el runbook de recuperación. |

El proyecto contiene comprobaciones de salud, controles de pago y acceso, copias y restauración, procedimientos de despliegue y reversión, y un monitor del dominio público. Su presencia en el proyecto no demuestra que todos estén activos en el entorno desplegado.

## 10. Estado de entrega que necesita conocer el equipo

| Área | Estado sustentado por esta revisión | Siguiente cierre operativo |
|---|---|---|
| Curso, laboratorios y precio | Contenido y coherencia del precio comprobados localmente | Confirmar la misma versión en el entorno público. |
| IA, pagos y recuperación | Funciones e integraciones implementadas | Comprobar proveedores, cobro autorizado → acceso, cancelación y entrega de correo en el entorno de venta. |
| PDF español | Archivo y ruta protegida presentes | Confirmar descarga con una cuenta de comprador en el entorno de venta. |
| PDF inglés | Archivo no presente | Generar, revisar y publicar. |
| Repositorio de Claude Code y nueve plantillas | Beneficios anunciados; entrega no localizada | Identificar repositorio, versión, permisos y acceso desde la cuenta del comprador. |
| Certificado | Aparece anunciado en Perfil y en texto público; no se encontró emisión o descarga | Definir e implementar su entrega o ajustar la promesa. No contarlo como entregable comprobado. |
| Apps iOS y Android | Proyectos nativos presentes: SwiftUI y Compose | Confirmar alcance, pruebas, distribución y cobro antes de presentarlas como apps publicadas. |
| Contenido futuro | Incluido por la oferta mientras el acceso esté activo | Mantener un catálogo de publicaciones; el inventario confirmado corresponde a Fundamentos Vol. 1. |

## 11. Rutina de operación e indicadores

**Distribución de responsabilidades propuesta:** Producto/contenido mantiene temario, materiales y promesas; Soporte/comercial atiende accesos, consultas y devoluciones; Ingeniería/operación mantiene servicios, integraciones, recuperación y medición. Una persona puede cubrir varios roles, pero cada pendiente necesita un responsable explícito.

### Rutina propuesta

- **Diaria:** comprobar disponibilidad pública, pagos sin acceso, renovaciones con error, consultas abiertas y presupuesto de IA.
- **Semanal:** revisar dificultades por ejercicio, actividad de estudiantes, cierre de ligas, devoluciones y motivos de abandono.
- **En cada publicación:** comprobar contenido en ambos idiomas, ejercicios, precio, materiales y acceso de una cuenta gratuita y otra de pago.
- **Periódica:** ensayar restauración, revisar permisos y comprobar que las promesas comerciales coinciden con lo que puede recibir el comprador.

### Indicadores propuestos

| Objetivo | Indicador |
|---|---|
| Activación | Porcentaje de registrados que resuelven el primer laboratorio. |
| Conversión | Porcentaje de usuarios de la prueba que completan una compra aprobada. |
| Entrega | Tiempo desde aprobación del pago hasta acceso disponible; pagos aprobados sin acceso. |
| Aprendizaje | Laboratorios resueltos, preguntas acertadas y exámenes aprobados. |
| Retención | Estudiantes activos por semana y renovaciones aprobadas entre las que vencían. |
| Atención | Tiempo de primera respuesta y resolución; incidencias repetidas. |
| Economía | Ingreso cobrado, devoluciones y costo de IA por estudiante activo. |
| Fiabilidad | Disponibilidad del dominio público y fallos en registro, compra y aprendizaje. |

La plataforma guarda datos de actividad y pagos e incluye instrumentación publicitaria de Meta configurable. Los indicadores anteriores son una propuesta de gestión; no se verificó un tablero completo ni resultados comerciales actuales.

## 12. Descripción breve para presentar el producto

> IA desde cero te ayuda a entender y usar la inteligencia artificial con explicaciones claras y práctica real. Empieza gratis con la primera lección y accede al curso completo por 39.990 COP durante 30 días, con renovación mensual opcional. Aprende a tu ritmo con 12 lecciones en español e inglés, 36 laboratorios, quizzes, exámenes, acompañamiento con IA y seguimiento de tu avance. Incluye el PDF en español y las nuevas publicaciones que se incorporen mientras tu acceso esté activo.

La versión comercial completa agrega el entorno de Claude Code del creador y nueve prompts con plantillas. Su procedimiento de entrega debe quedar confirmado para sostener esa promesa.

## Anexo — Fuentes y comprobaciones

Fuentes del proyecto revisadas para este brief:

- **Oferta y condiciones:** [landing](../web/src/data/landing.ts), [textos de interfaz y términos](../web/src/lib/i18n.ts), [información del producto para el asistente](../api/src/product.ts).
- **Precio y renovación:** [precio de pagos](../payments/src/price.ts), [checkout](../web/src/pages/pago.astro), [Mercado Pago](../payments/src/mercadopago.ts), [Perfil](../web/src/pages/perfil.astro).
- **Inventario académico:** `api/src/labs.ts` (lecciones y laboratorios; fuente local de la revisión), [contenido bilingüe](../api/src/content.ts), [quizzes y exámenes](../api/src/quizzes.ts), [logros](../api/src/achievements.ts).
- **Experiencia y operación:** [API](../api/src/server.ts), [herramientas del agente](../api/src/tools/index.ts), [roles y cuenta](../auth/src/index.ts), [soporte](../web/src/pages/soporte.astro), [correo](../api/src/mail.ts), [runbook](../RUNBOOK.md).
- **Entregables y continuidad:** [PDF español](../api/files/curso-es.pdf), [proyecto iOS](../ios/project.yml), [proyecto Android](../android/app/build.gradle.kts), `docs/sentinel.md` (monitor; documento local de la revisión).

Las dos referencias indicadas como locales no están incluidas en esta publicación del brief.

Comprobaciones realizadas el 14 de septiembre de 2026:

1. Importación directa del catálogo: **12 lecciones, 36 laboratorios, 12 textos por idioma, 12 quizzes de tres preguntas, tres exámenes de seis preguntas, 36 insignias y 12 rangos**.
2. `node --experimental-strip-types api/test/lessons.mts` — **exit 0**. Verifica tarjetas ES/EN, textos, quizzes y que cada laboratorio acepte su solución y rechace una respuesta incorrecta.
3. `node --experimental-strip-types scripts/check-price.mjs` — **exit 0**. Coinciden el precio del servicio de pagos, el anunciado por la web y el que informa el asistente: **39.990 COP**.

Estas comprobaciones son locales y acotadas. No se ejecutó una auditoría integral ni una prueba de compra en producción para elaborar este brief.
