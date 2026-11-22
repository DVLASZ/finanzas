[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Avisos en el celular

La app puede avisarte en el celular, aunque esté cerrada, cuando hay algo que mirar. Es gratis y no pasa por WhatsApp ni por ningún servicio de pago.

## Qué avisa

**A las 8 de la mañana** (Colombia), si hay algo, un solo aviso con lo más importante:

- una deuda tuya venció o vence en los próximos 10 días
- llevas 5 días o más sin anotar nada
- un gasto que se repite cada mes (`cada mes el 5 internet 60000`) toca en dos días o ya tocó y no lo has anotado
- los lunes, un resumen de la semana pasada; el primer día del mes, el del mes que pasó

**A las 6 de la tarde**, solo si hace falta:

- cierre del día: si hubo movimientos en la billetera y nadie la ha contado hoy, pregunta si tienes en efectivo y monedas lo que dice la app
- una cuenta de dinero en negativo

**Al momento:**

- una meta de ahorro que llega a su valor («Llegaste a la meta Moto»), una vez; si baja y vuelve a llegar, otra vez
- un giro que llega por el buzón de otra app (`Aviso de Mamá: $150.000`)

**Una vez por semana, si hace falta:** las fotos de recibos ocupan 3 GB o más de los 5 GB que da la base gratis.

**Los domingos:** si la copia de seguridad en la nube falla, con el motivo.

Los topes de gasto no mandan avisos al celular: solo salen como tarjeta dentro de Saldos y Resumen y en el chat al guardar un gasto.

Si no hay nada, no manda nada. El aviso de «falta decir cuánta plata tienes» no se manda por aquí, solo sale dentro de la app.

## Cómo se activa

En el celular: Más, Ajustes, Avisos en este celular, Activar avisos. El navegador pide permiso. Hay un botón para mandar una prueba. Para apagarlos, el botón Apagar.

Hace falta que la app ya esté conectada al servidor (dirección y token en Ajustes) y que esté instalada o abierta en Chrome.

## Cómo está hecho

Usa el estándar Web Push, sin librerías:

- El servidor crea sus llaves la primera vez que hacen falta y las guarda en su propia base, en claves que empiezan por `secreto_`. Esas claves nunca viajan a la app.
- El celular se suscribe con la llave pública. Su suscripción queda en el servidor (máximo 10 por instalación).
- El aviso va cifrado para ese celular (RFC 8291) y firmado por el servidor (VAPID, RFC 8292). Quien lo transporta, Google o Mozilla, no puede leerlo.
> [!NOTE]
> Hay un solo cron del Worker, `0,30 * * * *`, que corre cada media hora. A las 13:00 UTC (8 am en Colombia) manda los avisos de la mañana, a las 23:00 UTC (6 pm) el cierre del día, y en cada media hora revisa el recordatorio de la noche. Es uno solo porque la plan gratis de Cloudflare deja 5 crons por cuenta y hay tres apps. Los avisos al momento salen al sincronizar o al llegar algo por el buzón. Una suscripción que el servicio de avisos da por muerta (404 o 410) se borra sola. Si falla por otra razón, se conserva para mañana.
- Liquidez a 30 días y stock mínimo: si una cuenta no alcanza para un pago fijo que viene en el próximo mes («Nequi se queda corta el 25/10 por Internet»), o un producto bajó de su mínimo, sale como aviso en Saldos y en el resumen de la mañana. La cuenta de cada pago fijo se lee de su frase («internet 60000 nequi»); sin cuenta dicha, sale del efectivo.
- Recordatorio de la noche: en Ajustes eliges una hora entre las 7:00 y las 10:30 pm (en punto o y media). A esa hora llega «¿Anotaste los gastos de hoy?», pero solo si hoy no anotaste nada. Al tocarlo se abre el chat con el cursor en el cuadro. La hora se guarda en el ajuste `recordatorio` y se sincroniza.
- El service worker (`apps/web/sw.js`) muestra la notificación y abre la app al tocarla.

El código del servidor está en `apps/worker/src/push.ts` y quién manda qué y cuándo en `apps/worker/src/avisos.ts`. Las pruebas abren los avisos con un celular simulado hecho con el módulo crypto de Node, que es código distinto al del Worker. Lo que no se puede probar sin un celular real es que Chrome los muestre.

## Si no llega

- El permiso de notificaciones de Chrome para esa página tiene que estar en permitir.
- Con el ahorro de batería muy agresivo de algunos celulares los avisos tardan.
- Prueba primero con el botón Mandar una prueba. Si la prueba llega y los diarios no, es que ese día no había nada que avisar.
