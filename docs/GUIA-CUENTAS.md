[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Crear la cuenta de Cloudflare

Es lo único que necesitas para publicar la app. El plan gratuito alcanza de sobra para una persona o un negocio pequeño.

## Pasos

1. Entra a https://dash.cloudflare.com/sign-up y crea la cuenta con tu correo. Confirma el correo.
2. No hace falta agregar un dominio ni una tarjeta.
3. En Compute, Workers & Pages, verás tu subdominio de `workers.dev`, que sale de tu correo. Lo puedes cambiar desde ahí. Tus apps quedarán en `https://<nombre-del-worker>.<tu-subdominio>.workers.dev`.
4. En la terminal del proyecto corre `npx wrangler login`. Se abre el navegador, pulsa Allow. Para salir, `npx wrangler logout`.

## Qué guarda cada cosa

| Dato | Es secreto | Dónde vive |
|---|---|---|
| La clave de la app (`API_TOKEN`) | Sí | Secreto del Worker y `instalaciones/<n>/acceso.txt` |
| El PIN de borrado (`PIN_BORRADO`) | Sí | Igual |
| Las llaves de los avisos | Sí | La base, en claves `secreto_`. Se crean solas |
| El subdominio de workers.dev | No | Es público |
| El id de la base D1 | No | Solo dice cuál base es |

> [!NOTE]
> Los secretos los escribe el instalador por ti, sin mostrarlos. Si los pones a mano, escríbelos tú en tu terminal.

## Límites del plan gratuito

Para una persona sobran:

- Workers: unas 100.000 peticiones al día.
- D1: 5 GB y millones de lecturas al día.
- Workers AI: una cuota diaria gratis. La app se frena sola en 30 ayudas al día por instalación.
- Tareas programadas: las usa solo el aviso diario.

Mientras no actives nada de pago en Cloudflare, no cuesta nada.
