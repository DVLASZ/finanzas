# db

Todo lo de la base de datos (SQLite, en D1).

| Archivo | Para qué |
|---|---|
| `schema.sql` | El esquema completo, con comentarios |
| `seed.sql` | Los datos iniciales de la plantilla personal: cuentas, categorías, atajos |
| `diccionario.json` | Las palabras que llevan a cada categoría. Gana la primera que coincide |
| `decisiones-importacion.json` | Excepciones para el importador de Excel |
| `migrations/` | Los cambios de esquema, numerados |

La plantilla personal sale de `seed.sql`, y su copia en TypeScript está en `packages/core/src/semilla.ts`. Una prueba comprueba que coincidan. Las otras plantillas (`mama`, `empresa`) viven solo en `packages/core/src/plantillas.ts`, y el instalador las convierte en SQL.

`db/importacion.sql` lo genera el importador y no se sube a git.

Para cambiar el esquema, mira [docs/MODELO-DATOS.md](../docs/MODELO-DATOS.md).
