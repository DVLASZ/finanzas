# Finanzas por mensajes

Una app para llevar la plata escribiendo mensajes, como se lo contarías a alguien: `mecato 5000`, `presté 40000 a Ana`, `vendí 3 botellas`. El bot muestra lo que entendió, tú confirmas y queda guardado. Funciona sin internet y se sincroniza cuando vuelve.

Es gratis: corre en el plan gratuito de Cloudflare. Cada persona o negocio tiene su propia instalación, con su servidor, su base de datos y su clave, así que nada se mezcla.

## Qué hace

- Gastos, ingresos, préstamos, deudas, pagos y gastos compartidos, con partida doble (todo cuadra siempre).
- Efectivo al estilo colombiano: billetes, monedas y vuelto.
- Varios movimientos en un mismo mensaje.
- Saldos, deudas, resumen por semana, mes y año (con periodos anteriores) y topes de gasto.
- Ventas con catálogo y fiado, lista de compras y alcancía de monedas, según la app.
- Ayuda de una IA para frases que el bot no entiende.
- Avisos en el celular y exportar todo a Excel.
- Letra grande, tema claro u oscuro y dos pieles de color.

## Empezar

Necesitas Node 24 o superior.

```bash
npm install
npm run check
npm run web:dev
```

`npm run check` revisa tipos, pruebas y base de datos. `npm run web:dev` abre la app en modo local, sin cuentas ni servidor.

Para publicar tu propia instalación en Cloudflare, sigue [docs/INICIO.md](docs/INICIO.md).

## Cómo está organizado

```
apps/
  web/        la app instalable (PWA) que corre en el celular
  worker/     el servidor en Cloudflare (API, base de datos, avisos, IA)
packages/
  core/       el cerebro: entiende los mensajes, hace la contabilidad, sincroniza
db/           esquema, datos iniciales, diccionario de palabras y migraciones
scripts/      instalador, compilación de la web y herramientas
tests/        ayudas compartidas por las pruebas
docs/         documentación
```

Cada carpeta tiene su propio README con más detalle. El índice de la documentación está en [docs/README.md](docs/README.md).

## Tres variantes, tres ramas

| Rama | Variante |
|---|---|
| `main` | App personal |
| `app-2` | App familiar: casa, campo y trabajadores |
| `empresa` | Negocio u organización: ventas, insumos, socios |

Son la misma app con distinta plantilla de cuentas y categorías. Cada rama tiene un archivo `VARIANTE.md` que cuenta lo suyo. Cómo se organizan y cómo se mantienen: [docs/RAMAS.md](docs/RAMAS.md). Las plantillas están en [docs/INSTALACIONES.md](docs/INSTALACIONES.md).

## Privacidad

Este repositorio es solo código. Los datos personales, los respaldos, las claves y las instalaciones de cada persona están en `.gitignore` y no se suben.
