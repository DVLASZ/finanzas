# Ayuda de la IA

Las reglas del bot entienden casi todo lo de todos los días, pero una frase muy suelta como "me llegaron cincuenta mil de mi tía y gasté 5 lukas en mecato" se les escapa. Para esos casos el servidor puede pedirle ayuda a una IA.

## Qué hace y qué no

La IA no guarda nada. Solo reescribe lo que escribiste en frases cortas que el bot de siempre sí entiende, por ejemplo `ingreso 50000 tía` y `mecato 5000`. Esas frases pasan por el bot y por la tarjeta de confirmación como cualquier mensaje. Si la IA se equivoca, lo ves antes de confirmar.

La app lo hace sola cuando el bot responde que no entendió, hay servidor configurado y hay internet. Verás un "Déjame pensarlo un momento" y luego "Creo que quisiste decir". Si la IA tampoco entiende, queda el mensaje normal del bot.

Sin internet no hay ayuda de la IA: el bot dice lo que no entendió y reescribes la frase más simple.

## Leer comprobantes

La misma IA, con un modelo que ve imágenes, lee comprobantes: un pantallazo de Nequi, Daviplata o Bancolombia, o la foto de una tirilla de caja. Desde el botón de la cámara del chat, desde el detalle de un movimiento con foto, o compartiendo la imagen hacia la app desde otra app (el ícono ofrece «compartir» cuando la app está instalada).

La app baja la foto a unos 150 KB y la manda a `POST /api/ocr`. El servidor devuelve monto, fecha, comercio y una categoría sugerida, y la app los vuelve una frase («mercado tienda don pepe 45000») que pasa por el bot y por la tarjeta de confirmación. Nada se guarda sin que pulses Confirmar, y la imagen no queda en ningún registro del servidor.

Un modelo pequeño con visión se equivoca con letra borrosa o con tirillas largas. Por eso la tarjeta siempre se revisa antes de confirmar. Cuenta contra el mismo tope diario de ayudas. Si Cloudflare retira el modelo, se cambia con la variable `IA_OCR_MODELO` del Worker.

## Costo y límites

Usa Workers AI de Cloudflare, que tiene una cuota gratis diaria. Para no pasarse hay un tope de 30 ayudas por día por instalación. Pasado el tope, el servidor responde que ya se usaron todas y la app muestra el mensaje normal del bot.

El tope se cambia con la variable `IA_TOPE` del Worker. La cuenta del día vive en la base, en la clave `ia_uso` de la tabla config.

## Privacidad

La frase viaja a Cloudflare Workers AI, el mismo proveedor donde está tu servidor. El servidor no la guarda en ningún registro ni en la base. El modelo recibe los nombres de las cuentas y categorías de esa instalación, no los saldos ni los movimientos.

## Apagarla

Para una instalación, en su base:

```sql
INSERT OR REPLACE INTO config (clave, valor) VALUES ('ia', '0');
```

Para quitarla del todo, borra el bloque `[ai]` del `wrangler.toml` y vuelve a publicar. Sin el binding, el servidor responde 501 y la app ni la intenta.

## Cómo está hecho

- `packages/core/src/ia.ts` arma las instrucciones del modelo con las cuentas y categorías de esa app, limpia lo que devuelve y lleva la cuenta del día.
- `apps/worker/src/rutas/ia.ts` tiene la ruta `POST /api/interpretar` (pide el token). Usa el modelo `@cf/meta/llama-3.3-70b-instruct-fp8-fast` con respuesta en JSON. Cloudflare retira modelos de vez en cuando (el primero que usé ya estaba retirado). Si pasa, se cambia con la variable `IA_MODELO` o en `MODELO_IA` de ese archivo.
- `apps/web/src/services/app.ts` (`pedirAyudaIA`) y `apps/web/src/features/chat/Chat.tsx` llaman a la ruta cuando el bot no entiende.

Las pruebas usan una IA falsa, así que no gastan cuota. La calidad del modelo se miró con frases reales en la app publicada de la empresa: "gasté cinco lukas en etiquetas" salió como "gasto 5000 en etiquetas" y "hola como estas" no devolvió nada.

## Sin internet

Si el bot no entiende una frase y no hay conexión, la app la guarda (hasta 10) y avisa que la pensará cuando vuelva el internet. Al volver, la IA la lee y la app ofrece en el chat: «Cuando no había internet escribiste X. Ahora la entendí como Y. ¿La anoto?». Con el botón Anotar sale la tarjeta de siempre para confirmar. La frase lleva el día y la hora en que se escribió, para que no quede con la hora de ahora.
