[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Pendientes e ideas

> [!NOTE]
> Lo que falta por hacer en el código y los límites que se conocen. Las tareas de cada instalación (saldos iniciales, claves, pruebas con personas) se llevan aparte, fuera del repositorio.

## Ideas

Ninguna abierta. Las varias monedas con conversión automática se descartaron: chocan con la regla de que los dólares y las deudas en dólares nunca se convierten solos.

## Para probar con personas

Esto solo se comprueba con teléfonos y gente de verdad. Las pruebas automáticas no lo cubren.

- Las funciones de noviembre con datos reales: existencias en la app de la empresa y pagos fijos semanales, quincenales y anuales.
- El lenguaje natural del bot con frases de cada persona (vaca, a medias, lucas, me fiaron) y las preguntas con botones cuando hay duda. La suite tiene 43 frases inventadas.
- El dictado por voz con frases reales: cada persona habla distinto y el reconocedor se equivoca de formas distintas. Lo que se entienda mal se agrega a `packages/core/src/voz.ts` con su prueba.
- La ayuda de la IA con frases reales. Las pruebas usan una IA falsa y no dicen nada de la calidad del modelo.
- Pegar alertas con mensajes reales de cada banco (las pruebas usan textos de ejemplo).
- La conciliación con extractos reales de cada banco. El lector entiende `;`, `,` y tabulador, varias formas de fecha y de monto, pero no se ha visto con extractos de verdad.
- Los avisos de la mañana, de la tarde y el recordatorio de la noche, y el bloqueo por inactividad, en celulares de otras marcas: el ahorro de batería puede retrasarlos.
- La usabilidad con personas de distintas edades.
- Probar [Empezar](INICIO.md) con otra cuenta de Cloudflare, para ver si alguien distinto logra instalar desde cero.

## Ya resuelto

- Topes que se pausan y se reanudan sin borrarlos (`pausar tope comida`, «Pausar tope» en Categorías).
- Categorías con movimientos: «Archivar categoría» (los movimientos no cambian) o «Pasar movimientos» a otra categoría antes de archivar.
- El campo del chat es un cuadro de texto que crece hasta cuatro líneas: Enter envía y Mayús+Enter baja de renglón.
- La guía de ayuda sigue siendo de reglas, sin IA (ver [IA.md](IA.md)).
Lo que antes estaba aquí como pendiente y ya está hecho y publicado en las tres apps:

- Notificaciones push, OCR de tirillas, compartir y atajos del ícono, probados en un celular real.
- Ayuda de la IA como respaldo del bot, con tope diario.
- Editar movimientos con doble confirmación.
- Pagos fijos quincenales, semanales y anuales.
- Letra grande en pantallas angostas.
- Bot con lenguaje natural, gastos compartidos con aclaración por botones y la ayuda guiada «Pregúntale cómo decirlo».
- Gráficas nuevas del Resumen (flujo del mes, ranking de conceptos, anillo por medio de pago) y el desglose del gasto compartido.
- Seis temas, cada uno con su propia forma, con el contraste y la letra grande revisados.
- Varios movimientos en una sola línea: se parten y se confirman de a uno.

## Límites que ya se conocen

- `npm run e2e` y `npm run e2e:celular` no entran en `npm run check`: abren un Chrome y tardan. Correrlos antes de publicar cambios de pantalla.
- El dictado necesita internet (lo hace Chrome con los servidores de Google) y funciona en Chrome y Edge, no en Firefox ni en Safari.
- Las fotos de recibos no entran al respaldo de GitHub ni se restauran con él. Viven en la base.
- Al restaurar un respaldo, cada celular tiene que volver a activar los avisos, y los secretos se ponen de nuevo.
- El control de existencias no distingue sabores ni lotes: cuenta unidades por producto desde el último conteo.
- El bot es de reglas. Una frase muy suelta puede no entenderse; para eso está la ayuda de la IA, que tiene tope diario.
- Los dólares y las deudas en dólares se muestran en dólares, nunca se convierten.
- El borrado definitivo en el servidor depende de que `PIN_BORRADO` esté puesto.
- Si cambias una plantilla, las bases ya publicadas no se actualizan solas: `npm run instalar -- actualizar <nombre>`.
- El 4x1000 no se calcula solo, porque el banco exonera una parte y el valor real casi nunca es el 0,4 % exacto.
- El límite de peticiones del Worker cuenta en la memoria de cada instancia, así que es un freno de mejor esfuerzo. Para uno exacto haría falta Durable Objects o KV, que no son gratis a este nivel.
- El PIN y el bloqueo de la app son una barrera para quien agarre el teléfono desbloqueado: los datos locales no están cifrados. El respaldo con contraseña sí lo está.
- Las alertas del banco se leen con reglas escritas para el texto de hoy de Nequi, Bancolombia y Banco de Bogotá. Si un banco cambia sus mensajes, hay que agregar la forma nueva a `packages/core/src/notificaciones.ts` con su prueba.
- La proyección de liquidez solo cuenta los pagos fijos: no supone ingresos futuros ni gastos que no están anotados.
- `npm audit` muestra dos avisos moderados en `uuid`, dentro de `exceljs` (el Excel). Solo se arreglan bajando `exceljs` a una versión mayor anterior, que rompe el export; el Excel solo se arma con tus propios datos. Lo que sí tenía arreglo sin romper nada (`undici`, con un aviso alto) se actualizó con `npm audit fix`.
- Las metas de ahorro son una etiqueta: la plata no cambia de cuenta, así que si la gastas la meta no se entera.
- El aviso de «ya contaste hoy» usa la hora del servidor.
- La sincronización parcial trae de nuevo todo si hace más de 30 días que la app no sincroniza o si en el servidor se purgó o se borró algo.
