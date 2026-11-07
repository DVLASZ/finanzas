# Pendientes e ideas

Lo que falta por hacer en el código y los límites que se conocen. Las tareas de cada instalación (saldos iniciales, claves, pruebas con personas) se llevan aparte, fuera del repositorio.

## Ideas

- Aviso al celular cuando las fotos de recibos se acercan al límite gratis de la base. Hoy solo se muestran en Ajustes y en `npm run salud`.
- Una sola frase para gastos que otra persona paga en parte (hoy hay una para el caso en que todo el gasto es de ella: `pollo 8000 para luis puso 6000 nequi`).
- Un botón para anular un arqueo que resultó innecesario sin dejar rastro en el historial.
- Varias monedas con tasa guardada por movimiento. Choca con la regla de no convertir dólares solos, así que antes hay que decidir qué se mostraría.
- Atajos fijos del chat según el tipo de app (la de empresa vende, la familiar paga jornales), además de los que salen de lo que se repite.

## Para probar con personas

- El dictado por voz con frases reales: cada persona habla distinto y el reconocedor se equivoca de formas distintas. Lo que se entienda mal se agrega a `packages/core/src/voz.ts` con su prueba.
- La ayuda de la IA con frases reales. Las pruebas usan una IA falsa y no dicen nada de la calidad del modelo.
- La conciliación con extractos reales de cada banco. El lector entiende `;`, `,` y tabulador, varias formas de fecha y de monto, pero no se ha visto con extractos de verdad.
- La usabilidad con personas de distintas edades.
- Los avisos de la mañana y de la tarde en celulares reales de distintas marcas: el ahorro de batería puede retrasarlos.

## Límites que ya se conocen

- `npm run e2e` y `npm run e2e:celular` no entran en `npm run check`: abren un Chrome y tardan. Correrlos antes de publicar cambios de pantalla.
- El dictado necesita internet (lo hace Chrome con los servidores de Google) y funciona en Chrome y Edge, no en Firefox ni en Safari.
- Las fotos de recibos no entran al respaldo de GitHub ni se restauran con él. Viven en la base.
- Al restaurar un respaldo, cada celular tiene que volver a activar los avisos, y los secretos se ponen de nuevo.
- El bot es de reglas. Una frase muy suelta puede no entenderse; para eso está la ayuda de la IA, que tiene tope diario.
- Los dólares y las deudas en dólares se muestran en dólares, nunca se convierten.
- El borrado definitivo en el servidor depende de que `PIN_BORRADO` esté puesto.
- Si cambias una plantilla, las bases ya publicadas no se actualizan solas: `npm run instalar -- actualizar <nombre>`.
- El 4x1000 no se calcula solo, porque el banco exonera una parte y el valor real casi nunca es el 0,4 % exacto.
- Las metas de ahorro son una etiqueta: la plata no cambia de cuenta, así que si la gastas la meta no se entera.
- El aviso de «ya contaste hoy» usa la hora del servidor.
- La sincronización parcial trae de nuevo todo si hace más de 30 días que la app no sincroniza o si en el servidor se purgó o se borró algo.
