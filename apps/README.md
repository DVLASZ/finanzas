# apps

Las dos aplicaciones que se publican.

- [web](web/README.md) es la app que se instala en el celular. Tiene el chat, los saldos, las deudas y el resto de pantallas. Funciona sin internet.
- [worker](worker/README.md) es el servidor en Cloudflare. Guarda los datos, sincroniza, manda los avisos y pide ayuda a la IA.

Las dos usan el mismo cerebro, que está en [packages/core](../packages/core/README.md).
