# Seguridad

Este repositorio es solo código. Los datos de cada persona viven en su propio Worker y su propia base D1, y las claves están en secretos de Cloudflare, nunca en git.

## Cómo reportar una vulnerabilidad

Usa la pestaña Security del repositorio y pulsa "Report a vulnerability". Eso abre un aviso privado que solo ven los dueños del repo. No abras un issue público con el detalle de la falla.

Cuéntame qué encontraste, cómo se reproduce y qué podría hacer alguien con eso. Si tienes una idea de cómo arreglarlo, mejor. Es un proyecto de una sola persona, así que respondo cuando puedo, normalmente en unos días.

## Cómo está protegido

Lo que hace cada capa, para que se pueda revisar y para saber qué no cubre.

- **Cabeceras del Worker.** Todas las respuestas (la página, la API y los errores) salen con una política de contenido que solo deja cargar scripts de la propia app, sin scripts en línea; con `frame-ancestors 'none'` y `X-Frame-Options: DENY` para que ninguna otra página meta la app en un marco; con `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS y permisos cerrados salvo cámara y micrófono de la propia app. El script que ponía el tema antes de pintar salió de `index.html` a `tema.js` justamente para poder prohibir los scripts en línea. Los estilos en línea sí se permiten, porque la interfaz usa el atributo `style` para anchos y animaciones.
- **Token y límites.** El token se compara en tiempo constante, sin revelar su largo. Tras 8 tokens equivocados en 10 minutos esa conexión espera. Hay un tope de 300 peticiones por minuto y de 12 por minuto para lo que gasta cuota de Workers AI. La cuenta está en la memoria de cada instancia del Worker: es un freno de mejor esfuerzo, no una garantía exacta. Con un token de 256 bits adivinar no es realista; esto evita el intento y el abuso de la cuota.
- **PIN y bloqueo.** El PIN se guarda con PBKDF2 (SHA-256, 210.000 vueltas, sal propia); los PIN de antes se pasan solos al formato nuevo. Equivocarse hace esperar 5 segundos, 15, 45... hasta 15 minutos, y la espera sobrevive a cerrar la app. La app puede pedir el PIN al abrirla, al pasar a segundo plano o tras 2 o 5 minutos sin usarla. Es una barrera para quien agarre el teléfono desbloqueado: los datos siguen en el dispositivo, sin cifrar.
- **Respaldo con contraseña.** Se cifra en el navegador con PBKDF2 (SHA-256, 600.000 vueltas) y AES-GCM de 256 bits, con sal y vector propios; AES-GCM además detecta si el archivo se tocó. La contraseña no se guarda: si se pierde, el respaldo no se abre. Los respaldos de antes, sin cifrar, se siguen restaurando.
- **Base de datos y pantalla.** Todas las consultas a D1 son textos fijos con parámetros. La interfaz no usa `innerHTML`, `eval` ni nada parecido; el informe que se escribe en otra ventana escapa todo lo que lleva. Conceptos, apodos y notas se pintan como texto.
- **Registro de actividad.** En Ajustes hay una lista de lo que pasó en ese celular (sincronizaciones con cambios, ediciones, anulaciones, respaldos, PIN y bloqueos). No guarda montos ni conceptos y no es una auditoría del servidor.
- **Revisión automática.** `npm run seguridad` (también dentro de `npm run check`) corre `npm audit` sobre lo que se publica, busca formas de secretos en lo que sigue git, comprueba que las consultas a D1 no armen texto a mano, que la interfaz no use las funciones peligrosas y que el Worker en marcha ponga las cabeceras. Sin internet avisa del `npm audit` pero no falla.

Lo que esto no cubre: alguien con el token, con el teléfono y el PIN, o con acceso a tu cuenta de Cloudflare. Y `npm audit` hoy muestra dos avisos moderados en una dependencia de la exportación a Excel (`uuid` dentro de `exceljs`) que no se usa con entradas de otras personas.

## Qué cuenta

- Poder leer o cambiar datos de una instalación sin tener su clave.
- Saltarse el PIN o la espera del borrado definitivo.
- Una forma de hacer que el servidor guarde algo sin que la persona confirme la tarjeta.
- Claves, tokens o datos personales dentro del código o del historial.

## Qué no cuenta

- Que alguien con la clave de una instalación pueda usarla. Esa clave es la contraseña.
- Fallos de Cloudflare, de Chrome o de las librerías que usa el proyecto. Esos van con sus equipos.

## Si encuentras una clave o un dato personal

Avísame por el mismo canal antes de usarlos o compartirlos. No pegues claves en ningún chat ni issue.
