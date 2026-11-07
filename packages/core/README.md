# packages/core

El cerebro del proyecto. Entiende los mensajes, hace la contabilidad y prepara la sincronización. No depende de Cloudflare ni del navegador, así que corre igual en la app, en el servidor y en las pruebas.

## Cómo se conecta con el resto

Todo lo que necesita guardar pasa por la interfaz `Repo` (`src/repo.ts`). Hay tres implementaciones: una en memoria para las pruebas, `D1Repo` en el Worker y `RepoLocal` en la app.

La puerta de entrada es `procesar(repo, entrada, ahora)` en `src/bot.ts`. Recibe un texto o un botón y devuelve lo que hay que mostrar.

Lo que se exporta, todo junto, sale de `src/index.ts`.

## Qué hay

La lista de archivos de `src/` y qué hace cada uno está en [docs/ARQUITECTURA.md](../../docs/ARQUITECTURA.md). Las pruebas están en `test/`.

## Reglas para tocarlo

- Nada de `enum`, `namespace` ni parámetros-propiedad en constructores, y los imports llevan `.ts`. Node ejecuta el TypeScript borrando los tipos.
- Dinero en enteros: pesos para COP y centavos para USD.
- Las fechas son la hora de Colombia como texto.
- Antes de cambiar lo que el bot entiende, escribe la prueba.
- Si cambias lo que ve la persona, actualiza [docs/BOT.md](../../docs/BOT.md).

```bash
npm test
```
