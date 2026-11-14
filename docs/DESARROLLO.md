# Guía de desarrollo

## Lo que necesitas

Node 24 o superior. Ejecuta TypeScript directo, sin compilar.

| Comando | Qué hace |
|---|---|
| `npm run check` | Tipos, pruebas, base de datos y contraste de colores. Tiene que pasar antes de cada commit |
| `npm run typecheck` | Solo los tipos |
| `npm test` | Las pruebas del núcleo y del Worker |
| `npm run verificar` | Arma la base en memoria y revisa que todo cuadre |
| `npm run contraste` | Revisa que los colores se lean bien |
| `npm run web:build` | Compila la app a `apps/web/dist` |
| `npm run web:dev` | Compila y sirve la app en `http://localhost:5173` |
| `npm run instalar -- <orden> <nombre>` | Crea o publica una instalación (ver [DESPLIEGUE.md](DESPLIEGUE.md)) |
| `npm run guia -- <plantilla>` | Arma la guía de usuario de una app con sus cuentas y categorías (queda en `docs-privado/`) |
| `npm run abrir-respaldo -- <archivo>` | Abre un respaldo cifrado de la nube (ver [RESPALDO.md](RESPALDO.md)) |
| `npm run e2e` | Abre la app en tu Chrome y recorre las pantallas como una persona (10 pruebas en tamaño de celular). No va en `check` porque necesita Chrome |
| `npm run salud` | Pregunta a cada instalación publicada cómo va: movimientos, último movimiento, avisos, IA |

## Convenciones

- Todo en español: el código de dominio, los comentarios y la documentación.
- Los comentarios explican el porqué, con un ejemplo cuando ayuda.
- Node borra los tipos sin compilar, así que no se usan `enum`, `namespace` ni parámetros-propiedad en constructores, y los imports llevan la extensión `.ts`. `tsconfig.json` lo vigila con `erasableSyntaxOnly`.
- `packages/core` no importa nada de Cloudflare ni del navegador. Cada plataforma se conecta por la interfaz `Repo`.
- El dinero va en enteros y las fechas son la hora de Colombia como texto.
- Los commits van a nombre de quien los hace, en español, cortos y en minúscula.
- Nada de datos personales ni secretos en git. Mira `.gitignore`.
- Los textos de la documentación se escriben como habla una persona: sin emojis, sin flechas, sin frases de folleto.

## Pruebas

Las pruebas viven junto a lo que prueban. Se corren con `node --test`, sin librerías.

| Dónde | Qué cubre |
|---|---|
| `packages/core/test/basicos` | Montos, fechas, periodos y formatos |
| `packages/core/test/bot` | El bot de punta a punta: gastos, vuelto, transporte, ingresos, personas, deudas, compartidos, saldos, topes |
| `packages/core/test/efectivo` | Billetes, monedas y vuelto |
| `packages/core/test/personas` | Grupos, roles, regalos y apodos |
| `packages/core/test/docs` | Que cada ejemplo de `docs/BOT.md` se entienda |
| `packages/core/test/plantillas` | Cada app con sus cuentas, alcancía, otras cuentas |
| `packages/core/test/ventas` | Catálogo, fiado y lista de compras |
| `packages/core/test/lineas` | Varios movimientos en un mensaje |
| `packages/core/test/ia` | Instrucciones, limpieza de respuestas y tope diario |
| `packages/core/test/exportar` | El Excel, abierto con ExcelJS |
| `packages/core/test/alertas` | Deudas por vencer, topes y días sin anotar |
| `packages/core/test/robustez`, `estres` | Entradas raras y mensajes al azar con semilla fija |
| `packages/core/test/datos` | La semilla coincide con `seed.sql` y el diccionario |
| `apps/worker/test/worker` | La API: sincronización, rechazos, borrados con PIN, ayuda de la IA |
| `apps/worker/test/push` | Avisos: cifrado, firma, rutas y tarea diaria |
| `apps/worker/test/estres-d1` | Estrés contra una D1 simulada |

El Worker se prueba contra una D1 simulada sobre SQLite (`tests/d1-shim.ts`), sin red ni cuentas. La IA se prueba con una falsa. Lo que ninguna prueba cubre es cómo se ve y se siente en un celular real. Eso se prueba a mano.

## Cómo agregar cosas

Que el bot entienda algo nuevo:
1. Escribe primero la prueba en `packages/core/test/bot.test.ts` (o en el archivo del tema): qué escribe la persona y qué debe responder o guardar.
2. Hazla pasar en el módulo de `packages/core/src/parser/` que corresponda al tema (`parser.ts` solo decide a cuál llamar). Si es un tipo de movimiento nuevo, también `asientos.ts`, `mensajes.ts` y la tabla de [MODELO-DATOS.md](MODELO-DATOS.md).
3. Actualiza [BOT.md](BOT.md).

Una categoría nueva: `db/seed.sql`, `packages/core/src/semilla.ts` y las palabras en `db/diccionario.json`. Si ya está en producción, una migración o un INSERT en cada base.

Una cuenta o grupo nuevo para una plantilla: `packages/core/src/plantillas.ts`. Las bases ya publicadas no se enteran solas, hay que insertarlo con SQL.

Una pantalla nueva: una carpeta en `apps/web/src/features/` con su componente, que lee sus datos de `apps/web/src/state/store.ts`; su nombre en `Pantalla` (`state/nav.ts`) y, si se abre desde Más, su entrada y su caso en `features/mas/Mas.tsx`. Las piezas que se repiten van en `apps/web/src/components/ui/` y los gráficos en `components/charts/`.

Un cambio de esquema: [MODELO-DATOS.md](MODELO-DATOS.md#cambiar-el-esquema).

## Probar la app en el navegador

`npm run web:dev` y abre `http://localhost:5173`. Sin servidor, la app trabaja en modo local con las cuentas de su plantilla.

El service worker, que es lo que da el modo sin internet, solo se registra en HTTPS o en localhost. Cuando pruebes un cambio y no lo veas, es casi seguro que el navegador guardó la versión vieja: borra los datos del sitio o desregistra el service worker.

## Tropiezos que ya pasaron

- Un cambio en una plantilla no llega solo a las bases ya publicadas. Se aplica con `npm run instalar -- actualizar <nombre>` (ver [INSTALACIONES.md](INSTALACIONES.md)).
- Un cambio de esquema es una migración nueva y numerada. `npm run verificar` comprueba que las migraciones dejen el mismo esquema que `db/schema.sql`.
- Si el navegador sigue mostrando una versión vieja de la app, es el service worker. Se desregistra desde las herramientas del navegador, o se cierra y abre la app con internet.
- Los datos de una instalación (personas, apodos, categoría fija de una persona) van por SQL o por `instalaciones/<nombre>.json`, nunca en la plantilla: la plantilla es del código y no lleva nombres de nadie.
- Al escribir expresiones regulares por línea de comandos se pueden perder las barras invertidas. Si una regla del parser no responde, mira que la expresión haya quedado bien en el archivo.
