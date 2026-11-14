# apps/web

La app instalable (PWA). TypeScript con Preact y signals, Tailwind para los estilos, íconos de Lucide, animaciones con `motion/mini`, confeti con canvas-confetti y gráficos en SVG propio. Todo se empaqueta con esbuild dentro de `scripts/build-web.mjs`, sin CDN, para que abra sin internet.

## Estructura de `src/`

| Carpeta | Qué hay |
|---|---|
| `components/ui/` | Piezas reutilizables: `iconos.tsx` (ícono y color por categoría, cuenta y movimiento; estados vacíos, barras de avance, esqueletos) y `piezas.tsx` (números que cuentan, entrada escalonada) |
| `components/charts/` | Gráficos SVG: línea del saldo, barra apilada, ritmo de gasto, barras por periodo y el arco del seguro para gastar |
| `features/chat/` | El chat, la tarjeta Entendí o Guardado (con su impacto en el tope y el saldo) y la guía de ayuda con ejemplos tocables |
| `features/saldos/`, `movimientos/`, `resumen/` | Las tres pantallas de datos. En `resumen/` también la tarjeta de gastos hormiga |
| `features/metas/`, `recurrentes/` | Alcancías y pagos fijos |
| `features/revision/` | La revisión del mes: nota de salud, puntos por mirar y gastos hormiga |
| `features/mas/` | El menú Más y el marco de las subpantallas |
| `features/ajustes/`, `cuentas/`, `catalogo/`, `buzon/`, `conciliar/`, `guia/`, `deudas/`, `trabajadores/` | Pantallas que siguen armando HTML con plantillas de texto. Se montan dentro de `VistaLegada` |
| `state/` | `store.ts` (signals que reflejan los datos, la cola y la sincronización), `nav.ts` (pantalla, cajón de detalle e historial) y `apariencia.ts` (tema, piel y letra) |
| `services/` | `app.ts` (copia local, cola, sincronización, avisos, IA, fotos), `ocr.ts` (lectura de comprobantes) y `almacen.ts` (IndexedDB) |
| `lib/` | Utilidades: `efectos.ts`, `haptico.ts`, `imagen.ts`, `tarjetaDivision.ts` (la imagen para compartir por WhatsApp), `carta.ts` (leer la respuesta del bot), `periodos.ts` |

Fuera de `src/`: `index.html`, `sw.js` (offline, avisos y recibir imágenes compartidas), `manifest.webmanifest` (accesos directos y compartir hacia la app) y `estilos/` (`tailwind.css` y `temas.css`).

## Cómo correrla

```bash
npm run web:dev
```

Compila a `apps/web/dist` y la sirve en `http://localhost:5173`. Sin servidor configurado funciona en modo local.

Si cambias algo y no lo ves, el navegador probablemente guardó la versión vieja. Borra los datos del sitio o desregistra el service worker.

## Cosas a tener en cuenta

- Una pantalla nueva: una carpeta en `features/` con su componente, su nombre en `Pantalla` de `state/nav.ts` y, si sale de Más, su entrada y su caso en `features/mas/Mas.tsx`.
- Para que un componente se vuelva a pintar solo, lee un signal de `state/store.ts` (`datos`, `ctx`, `pendientes`, `estadoSync`...). Quien cambia los datos sigue siendo `app.repo`; el store se entera por `alCambiarElEstado`.
- La navegación usa el historial del navegador: cada pantalla y cada cajón de detalle es una entrada, así el gesto atrás del teléfono vuelve dentro de la app. Para volver desde código, usa `atras()`, no `irA`. Hay también un gesto de deslizar desde el borde izquierdo.
- Los accesos directos del ícono (`?accion=gasto`, `voz`, `saldos`) y la imagen compartida (`?compartido=1`) se atienden en `main.tsx`.
- Las notas sueltas de las pantallas de HTML plano (`p.sub`) se vuelven cuadros con ícono solas (`decorarNotas` en `features/mas/Mas.tsx`).
- No hay emojis en la interfaz: se usan íconos de Lucide. Lo que el bot escribe con emojis pasa por `quitarEmojis` (`lib/carta.ts`). Las pantallas de HTML plano piden íconos con `iconoHtml`, `insigniaHtml` y `vacioHtml`.
- Los colores son variables CSS en hexadecimal. Se revisan con `npm run contraste`; si agregas un par nuevo, agrégalo a ese script. El vidrio y los brillos usan `rgba` y quedan fuera de esa revisión.
- Los títulos de sección salen en mayúsculas por estilo y `innerText` los devuelve así. Las pruebas de `npm run e2e` lo tienen en cuenta.
- El ícono lo dibuja `scripts/icono.mjs`, sin imágenes: tres barras que suben y un destello dentro de la zona segura de los íconos maskable. El acento sale de la plantilla. El build le pone al manifiesto el fondo del tema como `theme_color`.
- `react` se resuelve a `preact/compat` (en `tsconfig.json` y en el build), así que sirven librerías hechas para React.
