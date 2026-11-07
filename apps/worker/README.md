# apps/worker

El servidor de cada instalación, en un Cloudflare Worker. Tiene poca lógica: el cerebro está en la app.

## Qué hay

| Archivo | Para qué |
|---|---|
| `src/index.ts` | Las rutas de la API, la tarea diaria de avisos y la ruta de la IA |
| `src/d1repo.ts` | El repositorio sobre la base D1: lee y guarda todo |
| `src/push.ts` | Avisos al celular: llaves VAPID, cifrado y envío |
| `wrangler.toml` | La configuración para publicar a mano una sola app |
| `.dev.vars.example` | Las variables para probar en tu computador |

Las rutas están en [docs/ARQUITECTURA.md](../../docs/ARQUITECTURA.md). Los avisos en [docs/AVISOS.md](../../docs/AVISOS.md) y la IA en [docs/IA.md](../../docs/IA.md).

## Secretos

`API_TOKEN` es la clave de la app y `PIN_BORRADO` el PIN de los borrados. Se guardan con `wrangler secret put`, nunca en el código. El instalador los crea solo.

## Pruebas

```bash
npm test
```

Corren contra una D1 simulada (`tests/d1-shim.ts`), sin red ni cuentas. La IA y el servicio de avisos se reemplazan por falsos.

## Publicar

Con el instalador (`npm run instalar -- publicar <nombre>`), que genera su propio `wrangler.toml` por instalación. El de esta carpeta es para publicar una sola app a mano. Mira [docs/DESPLIEGUE.md](../../docs/DESPLIEGUE.md).
