# Cómo contribuir

Este es un proyecto de una sola persona y lo mantengo en ratos libres, así que respondo cuando puedo. Si algo te sirve o lo ves roto, cuéntame.

## Antes de escribir código

Abre un issue con lo que quieres cambiar, sobre todo si es grande. Me ahorra revisar algo que no encaja con las reglas del proyecto. Las que más pesan:

- Cero costo. No entra nada que obligue a pagar un servicio.
- Simplicidad. Una función que casi nadie usa se queda fuera.
- Los dólares y las deudas en dólares nunca se convierten solos a pesos.
- Borrar es anular. El borrado definitivo solo existe en la app, con PIN.

Si encuentras una falla de seguridad, no abras un issue. Sigue los pasos de [SECURITY.md](SECURITY.md).

## Poner el proyecto a andar

Necesitas Node 24 o más nuevo.

```bash
npm install
npm run check
```

`npm run check` revisa tipos, pruebas, base de datos, contraste, privacidad y seguridad. Tiene que terminar en verde antes de cualquier pull request. Para probar la app en el navegador, `npm run web:dev`; el resto está en [docs/DESARROLLO.md](docs/DESARROLLO.md).

## Reglas del código

- El núcleo (`packages/core`) no depende de ninguna plataforma. Lo usan el Worker y la app.
- Node ejecuta TypeScript borrando tipos: nada de `enum`, `namespace` ni parámetros-propiedad en constructores, y los imports llevan la extensión `.ts`.
- Si cambias lo que el bot entiende, escribe primero la prueba en `packages/core/test/`.
- Si cambias el esquema, agrega una migración nueva en `db/migrations/` y actualiza `db/schema.sql`, `db/seed.sql` y `packages/core/src/semilla.ts`. Una prueba comprueba que coincidan.
- Comentarios en español, y solo donde la lógica no se ve a primera vista.
- Si cambias cómo se comporta algo, actualiza el documento que lo explica en `docs/`.

## Datos personales

Nunca subas nombres reales, saldos, tokens, respaldos ni archivos de `importacion/`. En pruebas y ejemplos usa nombres inventados (Ana, Luis, Marta, Pedro). `npm run privacidad` revisa que no se cuele nada.

## Las tres ramas

`main` es la app personal, `familiar` y `empresa` son variantes con las mismas bases. Haz tu pull request contra `main`. Los cambios comunes los paso yo a las otras dos con un merge; [docs/RAMAS.md](docs/RAMAS.md) explica cómo.

## Pull requests

Que sean pequeños y de una sola cosa. Di en la descripción qué cambia y cómo lo probaste. Los commits van en una línea corta, en minúscula, como los que ya hay en el historial.
