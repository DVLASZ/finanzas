# apps/web

La app instalable (PWA). TypeScript con Preact y signals para los componentes, Tailwind para los estilos nuevos, iconos de Lucide, animaciones con Motion y confeti con canvas-confetti. Todo se empaqueta con esbuild dentro de `scripts/build-web.mjs`, sin CDN, para que abra sin internet. Las pantallas que todavía no pasaron a componentes siguen armando HTML con plantillas de texto.

## Qué hay

| Archivo | Para qué |
|---|---|
| `index.html` | La página. El instalador le pone el nombre, los colores y la plantilla de cada instalación |
| `styles.css` | Todos los estilos. Los colores son variables que cambian según `data-piel`, `data-tema`, `data-letra` y `data-matiz` |
| `sw.js` | El service worker: guarda la app para que abra sin internet y muestra los avisos |
| `manifest.webmanifest` | El nombre y los íconos de la app instalada |
| `src/main.tsx` | Arranque, barra de abajo, menú Más, botón Volver y montaje de los componentes |
| `src/estado/store.ts` | La capa reactiva: signals que reflejan los datos, la cola de cambios y la sincronización. No guarda nada por su cuenta |
| `src/componentes/` | Los componentes de Preact. Hoy solo `Raiz.tsx`, el punto de montaje |
| `src/efectos.ts` | Entrada animada de elementos y confeti de celebración. Respeta `prefers-reduced-motion` |
| `estilos/tailwind.css` | La entrada de Tailwind. El build la compila y la une a `styles.css` |
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
- Las pantallas de Más se registran en `src/main.tsx` y llevan un botón Volver.
- Para que un componente se vuelva a pintar solo, lee un signal de `estado/store.ts` (`datos`, `ctx`, `pendientes`, `estadoSync`...). Quien cambia los datos sigue siendo `app.repo`; el store se entera por `alCambiarElEstado`.
- `react` se resuelve a `preact/compat` (en `tsconfig.json` y en el build), así que sirven librerías hechas para React.
- Tailwind por ahora carga solo el tema y las utilidades, sin el reinicio de estilos (`preflight`), para no cambiar lo que todavía usa `styles.css`.
- Los colores se revisan con `npm run contraste`. Si agregas un par de colores nuevo, agrégalo a ese script.
