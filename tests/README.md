# tests

Ayudas que usan varias pruebas. Las pruebas en sí viven junto al código: `packages/core/test` y `apps/worker/test`.

| Archivo | Para qué |
|---|---|
| `ayudas.ts` | Un bot en memoria con un reloj fijo (lunes 19 de octubre de 2026, 3:42 pm), y una función para leer el texto de las respuestas |
| `d1-shim.ts` | Una base D1 de mentira armada sobre SQLite, con las llaves foráneas activas |
| `generador.ts` | Mensajes al azar con semilla fija, para las pruebas de estrés |

Se corren con `npm test`.
