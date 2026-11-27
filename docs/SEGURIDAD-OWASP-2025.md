# Seguridad: OWASP Top 10:2025

Revisión del 28 de noviembre de 2026 sobre el código de `main` (la app web, el Worker de Cloudflare, el núcleo compartido y los scripts). Cada control tiene una prueba en `apps/worker/test/seguridad-owasp-2025.test.ts` (29 pruebas). Esa suite corre dentro de `npm run seguridad` y de `npm run check`.

## Cómo está armado (y qué cambia en una revisión de seguridad)

- Hay tres instalaciones (`personal`, `mama`, `asociacion`). Cada una es **un Worker y una base D1 propios, con su token propio**. No existe una base compartida con una columna «instalación»: el aislamiento es físico, no un filtro en cada consulta. Un token de una no abre otra, y un id de una no existe en la otra.
- No hay cuentas, sesiones ni cookies. La app habla con su Worker con `Authorization: Bearer <token>`. Por eso `HttpOnly`, `Secure` y `SameSite` no aplican y no hay sesiones que expiren: el token solo se cambia con `wrangler secret put`.
- El Worker no hace CORS: ninguna respuesta lleva `Access-Control-Allow-*`, así que ningún otro origen puede leerla desde un navegador. La app se sirve desde el mismo origen que la API.
- Las llamadas salientes del Worker son tres: el aviso al celular (servicio de avisos del navegador), el aviso al buzón de otra instalación y la copia de seguridad a `api.github.com`. Los datos de la IA no salen por `fetch`: van por el binding de Workers AI.

## Matriz

| Categoría | Estado antes | Hallazgo corregido | Control que queda | Prueba |
|---|---|---|---|---|
| A01 Control de acceso | Token en toda la API, token de solo lectura, borrados con PIN y cabecera `X-Confirmar`. | Ninguno. Se agregó la prueba que lo demuestra. | Ninguna ruta de `/api/` responde sin token ni con token de otra instalación; el de solo lectura no escribe ni borra; lo escrito en una instalación no aparece en otra. | `A01/A07: ninguna ruta...`, `A01: el token de una instalación...`, `A01: el token de solo lectura...` |
| A02 Configuración | CSP sin scripts en línea, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP y CORP en toda respuesta. | Las respuestas JSON de la API no decían que no se guardaran. Ahora llevan `Cache-Control: no-store`. | CSP con `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, sin `unsafe-eval` y sin `unsafe-inline` en scripts. Sin CORS. Sin secretos en `wrangler.toml`. | `A02: toda respuesta...`, `A02: no hay CORS abierto...`, `A02: el wrangler.toml...` |
| A03 Cadena de suministro | `npm audit` dentro de `npm run seguridad`, `package-lock.json` en git. | Ninguno. Se comprueba que todo paquete viene de `registry.npmjs.org` con su hash y que el proyecto no corre scripts de instalación. | `npm audit --omit=dev` sin altas ni críticas (hoy: 2 moderadas, 0 altas). | `A03: el package-lock.json...` y el paso 1 de `npm run seguridad` |
| A04 Criptografía | Respaldo cifrado con AES-GCM, llaves VAPID con WebCrypto, tokens aleatorios del buzón con `crypto.randomUUID`. | Ninguno. | Ni claves ni variables `VITE_` con secretos en la app web; ningún secreto sale de `Math.random`. | `A04: la app web no lleva secretos...` y el paso 2 de `npm run seguridad` |
| A05 Inyección y XSS | Todas las consultas a D1 con parámetros. Nada de `innerHTML` ni `eval`. Los informes que se escriben en otra ventana pasan todo por `esc`. | `id LIKE ?` en dos consultas de compromisos tomaba `_` y `%` como comodines: ahora compara el comienzo con `substr`. En el CSV, las celdas que empiezan por tabulación o retorno de carro no se neutralizaban. | `esc` en todo HTML armado a mano, React escapa el resto. Ni `javascript:` ni `dangerouslySetInnerHTML` en la app. Los ids solo aceptan `[\w:.!-]`. | `A05 XSS` (3 pruebas), `A05 SQLi` (2), `A05 inyección de fórmulas` |
| A06 Diseño inseguro | El borrado definitivo pide PIN, frase y espera; los borrados normales son «anular». | Ninguno. | Límites de petición por conexión, tope diario de la IA, tope de fotos. | `A07: tras 8 tokens...`, pruebas de fotos y de IA |
| A07 Autenticación | Comparación en tiempo constante, bloqueo tras 8 intentos fallidos por conexión. | La clave del buzón (`BUZON_CLAVE`) se probaba sin ningún freno: ahora comparte el bloqueo del token. | Comparación sin atajos por largo o por letras; 429 con `Retry-After`. | `A07: tras 8 tokens...`, `A07: la clave del buzón...`, `A07: la comparación...` |
| A08 Integridad de datos | Se rechazaban las operaciones desconocidas, los asientos descuadrados y las claves de configuración fuera de la lista. | `validarOp` no revisaba el formato del id, la fecha, el largo de la descripción, la cantidad de asientos ni el tamaño de un monto. El cuerpo de una petición no tenía tope. | Ids `[\w:.!-]{1,80}`; fechas `AAAA-MM-DD hh:mm:ss`; descripción de hasta 200 letras; de 2 a 40 asientos; montos enteros seguros de hasta 10^13; etiqueta y nota de hasta 500; listas de hasta 50 y 500; cuerpo de hasta 2 MB (413). JPEG de hasta 300 KB. Comprobantes solo en base64. | `A08` (4 pruebas) |
| A09 Registro y alertas | Los errores del Worker se registran con su motivo y sin datos. | Un token equivocado no dejaba ninguna huella. Ahora se anota «token equivocado en MÉTODO ruta» (sin el token, sin el cuerpo, sin la conexión). Igual con la clave del buzón. | `wrangler tail` muestra los intentos fallidos y los errores. | `A09: los intentos fallidos...` |
| A10 Condiciones excepcionales | Cualquier excepción de una ruta devuelve 500 genérico; los lotes de D1 son atómicos. | Ninguno. Se agregó la prueba. | Un fallo de la base devuelve `Error del servidor. Inténtalo de nuevo.`, sin rutas, sin mensajes de SQLite y sin dejar datos a medias. Métodos y rutas raras dan 400, 404 o 405. | `A10: un fallo de la base...`, `A10: el método raro...` |
| SSRF (A01) | `suscripcionValida` solo pedía que el aviso fuera a una dirección `https`. Con el token se podía registrar cualquier sitio, también uno interno, y el Worker lo llamaba (y seguía redirecciones). La dirección del buzón (`BUZON_DESTINOS`) tampoco se revisaba. | **Los avisos solo salen hacia FCM, Mozilla, Apple y Windows**, por `https`, sin credenciales ni puertos. Las suscripciones viejas hacia otro lado se quitan sin llamarlas. Todo `fetch` saliente con clave usa `redirect: 'manual'`. El buzón exige `https` a un dominio público. El lector de comprobantes solo acepta base64. | `urlPublicaHttps` rechaza IPs (incluidas `127.0.0.1`, `169.254.169.254`, `[::1]`, `2130706433`, `0x7f.1`), `localhost`, nombres sin punto, `.local`, `.internal`, credenciales y puertos. | `SSRF` (5 pruebas) |

## Lo que no se cambió, y por qué

- `style-src 'unsafe-inline'`: la interfaz usa el atributo `style` para anchos de barras y animaciones. Los scripts no tienen `unsafe-inline`, que es lo que importa para XSS.
- El bloqueo por fuerza bruta cuenta en la memoria de cada instancia del Worker. Es un freno de mejor esfuerzo, no una garantía exacta (así lo dice `seguridad.ts`). Con un token de 256 bits adivinar no es realista; el freno evita que alguien lo intente y que un script suelto gaste la cuota de la IA.
- El token vive en el almacenamiento del navegador de la persona. Un XSS lo podría leer, por eso la defensa está en no dejar que exista (CSP sin scripts en línea, `esc`, nada de `innerHTML`) y no en esconderlo.
- `npm audit` marca 2 vulnerabilidades moderadas. Ninguna es alta ni crítica y el chequeo falla desde la primera alta.
- Una suscripción de avisos que apunte a un servicio de avisos nuevo que no esté en la lista (otro navegador) se rechaza hasta que se agregue a `SERVICIOS_PUSH` en `apps/worker/src/seguridad.ts`.

## Cómo se corre

```powershell
npm run seguridad
node --test apps/worker/test/seguridad-owasp-2025.test.ts
```
