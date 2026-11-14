# apps/web

La app instalable (PWA). TypeScript con Preact y signals para los componentes, Tailwind para los estilos, iconos de Lucide, animaciones con `motion/mini` y confeti con canvas-confetti. Todo se empaqueta con esbuild dentro de `scripts/build-web.mjs`, sin CDN, para que abra sin internet.

Cinco pantallas son componentes (Chat, Saldos, Movimientos, Resumen y el menú Más). Las pantallas largas de configuración (Ajustes, Categorías y personas, Lista de compras, Productos, Buzón, Conciliar, Primeros pasos, Deudas, Revisión, Trabajadores) siguen armando HTML con plantillas de texto y se montan dentro de `VistaLegada`. Cambió su aspecto, no su lógica.

## Qué hay

| Archivo | Para qué |
|---|---|
| `index.html` | La página. El instalador le pone el nombre, los colores y la plantilla de cada instalación |
| `estilos/tailwind.css` | La entrada de Tailwind y los componentes de estilo (`tarjeta`, `chip`, `fila`, `burbuja`...). El build la compila a `styles.css` |
| `estilos/temas.css` | Las paletas: Midnight (libro oscuro), libro claro y Tierra. Cambian según `data-piel`, `data-tema`, `data-letra` y `data-matiz` |
| `sw.js` | El service worker: guarda la app para que abra sin internet y muestra los avisos |
| `manifest.webmanifest` | El nombre y los íconos de la app instalada. El build le pone como `theme_color` y `background_color` el fondo del tema de fábrica, para que la barra del sistema no muestre otro color |
| `src/main.tsx` | Arranque: carga los datos, monta `App` y sincroniza |
| `src/App.tsx` | Cabecera de vidrio, pantalla actual y barra de abajo flotante con indicador |
| `src/estado/store.ts` | La capa reactiva: signals que reflejan los datos, la cola de cambios y la sincronización. No guarda nada por su cuenta |
| `src/estado/nav.ts` | Qué pantalla se ve y el texto que otra pantalla deja escrito en el chat |
| `src/vistas/*.tsx` | Chat, Saldos, Movimientos, Resumen y Más (con el marco de las subpantallas) |
| `src/vistas/*.ts`, `src/*Vista.ts` | Las pantallas hechas con HTML plano. `src/vistas.ts` les da lo que necesitan de la interfaz |
| `src/ui/` | Piezas compartidas: `Carta.tsx` (la tarjeta Entendí o Guardado), `iconos.tsx` (ícono y color por categoría, cuenta y movimiento, estados vacíos, barras de avance, esqueletos), números que cuentan, entrada escalonada |
| `src/ui/graficos.tsx` | Gráficos en SVG: línea del saldo, barra apilada y ritmo de gasto |
| `src/ui/Ayuda.tsx` | La respuesta de «ayuda» como guía con ejemplos tocables |
| `src/haptico.ts` | Vibración corta al confirmar |
| `src/efectos.ts` | Animaciones y confeti. Respetan `prefers-reduced-motion` |
| `src/app.ts` | Estado: copia local, cola de cambios, sincronización, avisos y llamada a la IA |
| `src/carta.ts` | Lee la respuesta del bot y la separa en monto, pastillas y notas |
| `src/periodos.ts` | Fechas de referencia para ver semanas, meses y años anteriores |
| `src/apariencia.ts`, `aparienciaVista.ts` | Tema, piel y tamaño de letra |
| `src/almacen.ts` | Lo que se guarda en IndexedDB |

## Cómo correrla

```bash
npm run web:dev
```

Compila a `apps/web/dist` y la sirve en `http://localhost:5173`. Sin servidor configurado funciona en modo local.

Si cambias algo y no lo ves, el navegador probablemente guardó la versión vieja. Borra los datos del sitio o desregistra el service worker.

## Cosas a tener en cuenta

- La navegación usa el historial del navegador (`estado/nav.ts`): cada pantalla y cada cajón de detalle es una entrada, así el gesto «atrás» del teléfono vuelve dentro de la app. Para volver desde código, usa `atras()`, no `irA`.
- Las notas sueltas de las pantallas de HTML plano (`p.sub`) se convierten solas en cuadros con ícono (`decorarNotas` en `vistas/Mas.tsx`).
- El ícono lo dibuja `scripts/icono.mjs` (sin imágenes): tres barras que suben y un destello dentro de la zona segura de los íconos maskable. El acento sale de la plantilla: personal en esmeralda y cian, familia en violeta e índigo, empresa en ámbar y dorado.
- No hay emojis en la interfaz: se usan íconos de Lucide. Lo que el bot escribe con emojis pasa por `quitarEmojis` (`carta.ts`) antes de mostrarse. Las pantallas de HTML plano piden íconos con `iconoHtml`, `insigniaHtml` y `vacioHtml`.
- Todo lo que viene de los datos y se arma como texto HTML se escapa antes (`esc`). En JSX Preact ya escapa.
- Una pantalla nueva de Más: su entrada en `ENTRADAS` y su caso en `Subvista`, ambos en `src/vistas/Mas.tsx`, y el nombre en `Pantalla` de `estado/nav.ts`.
- Para que un componente se vuelva a pintar solo, lee un signal de `estado/store.ts` (`datos`, `ctx`, `pendientes`, `estadoSync`...). Quien cambia los datos sigue siendo `app.repo`; el store se entera por `alCambiarElEstado`.
- Los colores son variables CSS en hexadecimal. Se revisan con `npm run contraste`; si agregas un par nuevo, agrégalo a ese script. El vidrio y los brillos usan `rgba` y quedan fuera de esa revisión.
- Los textos de sección salen en mayúsculas por estilo, y `innerText` los devuelve así. Las pruebas de `npm run e2e` lo tienen en cuenta.
- `react` se resuelve a `preact/compat` (en `tsconfig.json` y en el build), así que sirven librerías hechas para React.
