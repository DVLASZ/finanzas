# apps/web

La app instalable (PWA). No usa frameworks: HTML generado con plantillas de texto y TypeScript, empaquetado con esbuild.

## Qué hay

| Archivo | Para qué |
|---|---|
| `index.html` | La página. El instalador le pone el nombre, los colores y la plantilla de cada instalación |
| `styles.css` | Todos los estilos. Los colores son variables que cambian según `data-piel`, `data-tema`, `data-letra` y `data-matiz` |
| `sw.js` | El service worker: guarda la app para que abra sin internet y muestra los avisos |
| `manifest.webmanifest` | El nombre y los íconos de la app instalada |
| `src/main.ts` | Arranque, barra de abajo, menú Más y botón Volver |
| `src/app.ts` | Estado: copia local, cola de cambios, sincronización, avisos y llamada a la IA |
| `src/vistas.ts` y `src/vistas/` | Las pantallas, una por archivo: chat, saldos, movimientos, resumen, deudas, ajustes. `vistas.ts` solo las junta |
| `src/catalogoVista.ts` | Lista de compras y productos y precios |
| `src/carta.ts` | Convierte la respuesta del bot en una tarjeta con datos ordenados |
| `src/apariencia.ts`, `aparienciaVista.ts` | Tema, piel y tamaño de letra |
| `src/iconos.ts` | Los íconos, dibujados en SVG |
| `src/almacen.ts` | Lo que se guarda en IndexedDB |

## Cómo correrla

```bash
npm run web:dev
```

Compila a `apps/web/dist` y la sirve en `http://localhost:5173`. Sin servidor configurado funciona en modo local.

Si cambias algo y no lo ves, el navegador probablemente guardó la versión vieja. Borra los datos del sitio o desregistra el service worker.

## Cosas a tener en cuenta

- Todo lo que viene de los datos se escapa antes de dibujarse (`esc`).
- Las pantallas de Más se registran en `src/main.ts` y llevan un botón Volver.
- Los colores se revisan con `npm run contraste`. Si agregas un par de colores nuevo, agrégalo a ese script.
