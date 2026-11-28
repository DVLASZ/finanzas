# Guía: tu propia app de finanzas, de cero a producción

Esta guía te lleva desde un computador sin nada hasta una app de finanzas que es solo tuya: corre en tu cuenta gratuita de Cloudflare, guarda tus datos en tu propia base y solo entra quien tenga tu clave. No depende de nadie más y no cuesta nada. La instalas una vez, y después la usas desde el celular como cualquier otra app.

La app es un chat. Le escribes lo que pasó con tu plata («almuerzo 12000») y ella lo anota. Funciona también sin internet y se sincroniza sola cuando vuelve la señal. El chat y la interfaz están en español.

Se escribe en una terminal con unos pocos comandos. Cada comando tiene su botón para copiarlo: tócalo, pégalo en la terminal y pulsa Enter. No tienes que saber programar. Si un paso no sale como dice aquí, ve al final del capítulo 6, a la parte "Si algo falla".

## 1. Requisitos previos

Todo lo que necesitas es gratis y no pide tarjeta.

1. Un computador con Windows, Mac o Linux. El celular lo usas al final, para instalar la app.
2. Node.js, versión 24 o más nueva (la versión recomendada, "LTS"). Bájalo de nodejs.org con el botón de descarga marcado LTS y ábrelo como cualquier programa.
3. Git. Bájalo de git-scm.com. En Mac suele venir ya instalado.
4. Una cuenta gratuita de Cloudflare. Se crea en dash.cloudflare.com/sign-up con tu correo, y confirmas el correo. No hace falta agregar un dominio ni una tarjeta.

La terminal es la ventana donde se escriben los comandos. En Windows abre "PowerShell" desde el menú de inicio. En Mac abre "Terminal". En Linux, la terminal de siempre.

Para comprobar que Node.js y Git quedaron bien, escribe estos dos comandos. El primero debe responder una versión que empiece por v24 o más, y el segundo una versión de git:

```bash
node --version
git --version
```

El plan gratuito de Cloudflare alcanza de sobra para una persona: los Workers (donde corre la app) permiten unas 100.000 peticiones al día, la base D1 guarda hasta 5 GB, y Workers AI trae una cuota diaria gratis para la ayuda del lenguaje natural. La app se frena sola en 30 ayudas de IA al día. Estas cifras son las de hoy y Cloudflare puede cambiarlas, así que si te importa mira su página de precios.

Una advertencia: las claves las escribes tú en tu terminal. No las pegues en chats, ni las subas a GitHub, ni se las mandes a nadie.

## 2. Paso 1: clonar el repositorio e instalar

Clonar es bajar el código a tu computador. Elige una carpeta donde quieras tenerlo (por ejemplo, Documentos) y abre la terminal ahí. Luego, uno por uno:

```bash
git clone https://github.com/DVLASZ/finanzas.git
cd finanzas
npm install
```

El último tarda un par de minutos: baja las piezas que usa la app. Cuando termine, estás dentro de la carpeta `finanzas`. Todos los comandos que siguen se escriben ahí.

Si quieres ver la app funcionando en tu computador antes de publicarla, sin cuentas ni nada, corre esto y abre http://localhost:5173 en el navegador. Para apagarla, vuelve a la terminal y pulsa Ctrl y C a la vez:

```bash
npm run web:dev
```

Esto es opcional. Los datos de esa prueba solo viven en tu navegador.

## 3. Paso 2: crear la base de datos y entrar a Cloudflare

Aquí conectas el proyecto con tu cuenta y creas la base donde se guardan tus movimientos.

### Iniciar sesión en Cloudflare

```bash
npx wrangler login
```

Se abre el navegador. Entra con tu cuenta de Cloudflare y pulsa "Allow" (permitir). Cuando diga que quedó conectado, vuelve a la terminal.

### Crear tu base de datos

```bash
npx wrangler d1 create finanzas
```

La terminal imprime un bloque con tres líneas parecidas a esta (los números serán distintos):

```text
database_name = "finanzas"
database_id = "11111111-2222-3333-4444-555555555555"
```

Copia el valor de `database_id`, el texto largo con guiones entre las comillas. Es solo el nombre de tu base: no es un secreto, pero lo necesitas ahora.

### Poner tu base en la configuración

El proyecto trae un archivo de configuración con un marcador donde va tu base. Para no tocar el original (y que puedas actualizar la app sin conflictos), hacemos una copia propia que Git ignora. En Mac o Linux:

```bash
cp apps/worker/wrangler.toml apps/worker/wrangler.local.toml
```

En Windows (PowerShell):

```bash
Copy-Item apps/worker/wrangler.toml apps/worker/wrangler.local.toml
```

Ahora abre `apps/worker/wrangler.local.toml` con cualquier editor de texto (el Bloc de notas sirve). Busca esta línea, casi al final:

```text
database_id = "PEGA-AQUI-EL-ID-DE-TU-BASE"
```

Cambia lo que está entre comillas por tu `database_id` y guarda. Deja `database_name = "finanzas"` como está. Si al crear la base le pusiste otro nombre, pon ese mismo nombre ahí, y en los comandos de abajo cambia `finanzas` por tu nombre. La línea `name = "finanzas"` de más arriba es el nombre de tu Worker: sale en la dirección final de tu app (`https://finanzas.<tu-subdominio>.workers.dev`). Puedes dejarlo igual.

Ese archivo ya no se sube a GitHub: `wrangler.local.toml` está en el `.gitignore`.

### Crear las tablas (las migraciones)

Las migraciones son siete archivos, del 0001 al 0007, que arman las tablas, los índices y los datos de partida: las cuentas de dinero (Efectivo, Monedas, Nequi, Daviplata y una en dólares), las categorías de todos los días y unos botones rápidos. Se aplican todas de una vez, en orden:

```bash
npx wrangler d1 migrations apply finanzas --remote --config apps/worker/wrangler.local.toml
```

Wrangler lista las siete y pregunta si sigues. Responde con la letra `y` y Enter. Al terminar, cada una debe aparecer con una marca de éxito.

Para confirmar que la base quedó llena, corre esto: debe responder un número mayor que cero.

```bash
npx wrangler d1 execute finanzas --remote --config apps/worker/wrangler.local.toml --command "select count(*) as cuentas from cuentas"
```

## 4. Paso 3: tu clave de acceso y publicar la app

### Tu clave de acceso

La clave (el "token") es lo que impide que otra persona entre a tu app. La creas tú. Este comando inventa una larga y al azar; copia lo que imprime:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Guárdala en un lugar seguro (un administrador de contraseñas o una nota privada). La vas a necesitar en el celular. Ahora entrégasela a tu Worker. El comando pide que la pegues; mientras escribes no se ve nada, es normal:

```bash
npx wrangler secret put API_TOKEN --config apps/worker/wrangler.local.toml
```

Si pregunta algo como "There doesn't seem to be a Worker called finanzas, do you want to create it?", responde `y`.

Luego el PIN de borrado. Protege las acciones que borran datos de verdad (por ejemplo, vaciar lo anulado). Escribe un número que recuerdes, de 4 a 8 cifras:

```bash
npx wrangler secret put PIN_BORRADO --config apps/worker/wrangler.local.toml
```

### Publicar

Primero se prepara la parte visual de la app, y luego se publica en Cloudflare:

```bash
npm run web:build
npx wrangler deploy --config apps/worker/wrangler.local.toml
```

Si es la primera vez que publicas en tu cuenta, Cloudflare puede pedirte que elijas un subdominio (el nombre que va antes de `.workers.dev`). Elige uno corto, en minúsculas.

Al final la terminal imprime la dirección de tu app, parecida a `https://finanzas.tu-subdominio.workers.dev`. Es tu dirección. Cópiala y guárdala junto a la clave.

Para comprobar que quedó protegida, abre la dirección en el navegador: tiene que cargar la app. La clave solo se pide al conectar el celular, en el siguiente paso.

### La ayuda de la IA (Workers AI)

La app entiende casi todo con sus propias reglas, sin internet. Para las frases muy sueltas puede pedir ayuda a una IA de Cloudflare. No hay que activar nada en el panel: la conexión ya viene en `wrangler.toml` (el bloque `[ai]`) y funciona con tu cuenta gratuita. Lo único aparte es el botón del escáner de comprobantes: usa un modelo de Meta que pide aceptar su licencia una sola vez por cuenta de Cloudflare. Sin eso, el escáner avisa que no está listo y el resto de la app funciona igual. Los detalles están en `docs/IA.md`.

### Otra forma: el instalador, con un solo comando

Si prefieres que un programa haga los pasos 2 y 3 por ti (crear la base, llenarla, inventar la clave y el PIN y publicar), el proyecto trae un instalador. Hace lo mismo que los pasos de arriba, pidiéndote confirmación en cada paso, y guarda tu clave y tu PIN en un archivo tuyo en `instalaciones/mi-app/acceso.txt`, que no se sube a GitHub. Primero inicia sesión con `npx wrangler login` si no lo hiciste. Luego:

```bash
mkdir instalaciones
cp scripts/instalacion-ejemplo.json instalaciones/mi-app.json
```

En Windows, el segundo se escribe `Copy-Item scripts/instalacion-ejemplo.json instalaciones/mi-app.json`. Abre `instalaciones/mi-app.json` y cambia por lo menos `worker` y `base` (por ejemplo, `mi-finanzas`), y `nombreApp` si quieres otro nombre. Después:

```bash
npm run instalar -- crear mi-app
```

Es una alternativa: si lo usas, salta los pasos 2 y 3 y sigue en el capítulo 5.

## 5. Paso 4: instalar la app en el celular

Ahora la app vive en tu propia dirección de internet. Instalarla en el celular es tocar un par de botones.

### Si tienes Android (Chrome)

1. Abre el navegador Chrome. Tiene que ser Chrome, no otro.
2. Escribe tu dirección (la que te dio Cloudflare, la de `workers.dev`) en la barra de arriba y entra.
3. Toca los tres puntos de la esquina de arriba a la derecha.
4. Elige "Instalar aplicación" (en algunos celulares dice "Instalar app").
5. Si solo ves "Agregar a la pantalla de inicio", también sirve, pero queda como un acceso directo y no como la app completa. Es mejor la opción de instalar.
6. Acepta lo que pregunte el celular. Aparece un ícono nuevo en tu pantalla.

### Si tienes iPhone (Safari)

1. Abre Safari, el navegador azul con la brújula. En iPhone tiene que ser Safari. Desde Chrome no se puede instalar.
2. Escribe tu dirección y entra.
3. Toca el botón Compartir (un cuadro con una flecha hacia arriba, abajo en el centro).
4. Baja en el menú y toca "Agregar a pantalla de inicio".
5. Toca "Agregar" arriba a la derecha.

### Abrir la app

Desde ahora abres la app con su ícono, como cualquier otra. Ya no hace falta escribir la dirección.

### Entrar con tu clave

Esto se hace una sola vez.

1. Abre la app con el ícono.
2. Abajo toca Más.
3. Toca Ajustes y baja hasta "Conexión con el servidor".
4. En "Dirección del servidor" debe aparecer sola tu dirección de workers.dev. Si está vacía, escríbela completa, con `https://` al principio.
5. En el campo "Token de acceso" escribe la clave que creaste en el paso 3.
6. Toca "Guardar y sincronizar".
7. Debajo tiene que salir un mensaje de que sincronizó. Si dice "No autorizado", la clave está mal escrita: bórrala y vuelve a escribirla. Si la perdiste, vuelve a correr el comando `secret put API_TOKEN` con una clave nueva.

### Si el celular pide permisos

- Cámara: la pide cuando vas a tomar la foto de un recibo. Acepta si quieres usar esa función.
- Micrófono: lo pide cuando tocas el micrófono del chat para dictar. Acepta si quieres hablarle en vez de escribir.
- Notificaciones: la pide al activar los avisos (más abajo).

Si por error dijiste que no, se cambia en los ajustes del celular, en la parte de permisos de la app.

### Poner un PIN (opcional)

El PIN protege las acciones que borran datos y sirve para bloquear la app.

1. Más, Ajustes, baja hasta "Seguridad".
2. Toca "Crear PIN" y escribe de 4 a 8 números. Apúntalo en un lugar seguro.
3. Si quieres que la app lo pida al abrirla, elige una opción en "Bloqueo automático": al pasar a segundo plano, o tras 2 o 5 minutos sin usarla.

### Activar los avisos

1. Más, Ajustes, baja hasta "Avisos en este celular".
2. Toca "Activar avisos" y acepta el permiso.
3. Toca "Mandar una prueba". Tiene que llegarte una notificación.
4. Para apagarlos, toca "Apagar".

En la pantalla de bloqueo los avisos no muestran montos, saldos ni nombres: solo dicen qué pasó («Una de tus cuentas quedó en negativo»). Para ver los detalles, abre la app.

Los avisos te recuerdan, por ejemplo, una deuda por vencer, un pago fijo que toca o que llevas días sin anotar nada. En "Recordatorio nocturno" puedes elegir una hora entre las 7:00 y las 10:30 de la noche para que la app te pregunte si anotaste los gastos de hoy.

En iPhone los avisos solo funcionan si la app está instalada con el ícono en la pantalla de inicio y el teléfono tiene iOS 16.4 o más nuevo. Pruébalo con "Mandar una prueba". Si no llega, abre un Issue en GitHub (ver al final del capítulo 6).

### Decirle cuánta plata tienes (un minuto)

La primera vez hay que decirle cuánto tienes en cada cuenta. Eso no cuenta como ingreso: solo marca desde dónde se calculan tus saldos.

1. Abre el Chat (la primera pestaña de abajo).
2. Escribe una frase como esta, con tus cuentas y tus montos:

```
saldo inicial efectivo 50000 nequi 120000
```

3. La app te muestra una tarjeta con lo que entendió. Revísala y toca Confirmar.
4. Si tienes monedas aparte, súmalas a la misma frase: «saldo inicial efectivo 50000 monedas 5000 nequi 120000».

Las cuentas que ves en la app son las tuyas (por ejemplo Efectivo, Monedas, Nequi, Daviplata y Dólares). Las monedas van aparte y no suman al disponible. Si te equivocas con el saldo inicial, se corrige con un arqueo (ver la parte 4).

Para un recorrido corto, toca Más y luego "Primeros pasos". Son cinco ejemplos con un botón "Probar" que deja la frase escrita en el chat.

## 6. Paso 5: manual de uso

Ya tienes la app instalada y conectada. Esta parte es el manual: cómo hablarle al chat y cómo sacarle provecho a cada pantalla. Los ejemplos se copian con un toque y se pegan en el chat de la app.

### Monedas y país

Dilo con franqueza antes de seguir: la app nació en Colombia. Maneja dos monedas, el peso (que muestra como $ y con puntos para los miles, así: $15.000) y el dólar, que va aparte y nunca se convierte solo. El chat entiende español, incluidos modismos como "lucas" (2 lucas son 2000) y "5k".

Si vives en otro país, funciona igual: los montos en "pesos" son los de tu moneda local, y lo único es que el símbolo $ y la forma de escribir los miles son los de Colombia. No hay conversión de moneda: lo que escribes es lo que se guarda. Las cuentas con las que nace la app (Efectivo, Monedas, Nequi, Daviplata y una en dólares) vienen de una plantilla. Si quieres otras cuentas, como el nombre de tu banco, se cambian en la plantilla antes de instalar o con una consulta a la base, como explica `docs/INSTALACIONES.md`. Las categorías y las personas sí se crean y se renombran desde la app, en Más, "Categorías y personas".

### Cómo hablarle al chat

Escribe como hablas. El orden no importa, ni las tildes, ni las mayúsculas, y se perdonan las faltas (`nekui` se entiende como Nequi). Lo único que no puede faltar es qué fue y cuánto.

Todo funciona igual: la app te muestra una tarjeta con lo que entendió y nada se guarda hasta que tocas Confirmar. Si no te gusta, toca Cancelar.

### Anotar un gasto

1. Escribe el gasto y envíalo.
2. Revisa la tarjeta: tipo, categoría, monto, cuenta y fecha.
3. Toca Confirmar.

```
almuerzo 12000
pizza 36k nequi
compré un trident 4500
```

- Los montos pueden ir como `5000`, `5.000`, `5k`, `5 mil` o `2 lucas`.
- Si no dices la cuenta, se toma Efectivo. Dila al final de la frase: «pizza 36k nequi».
- Si escribes solo «mecato» o solo «10k», la app no guarda nada y te dice qué falta.
- Si no conoce la palabra, te pregunta en qué categoría va y la aprende para la próxima.

### Anotar plata que entra

```
ingreso 50k chamba nequi
me pagaron 500k de nómina
+50k mamá nequi
```

El signo + al principio marca que la plata entra. Un gasto no lleva signo menos: se escribe normal («almuerzo 12000»). Si te devolvieron plata, anótala como ingreso.

### Pasar plata entre tus cuentas

Esto no es gasto ni ingreso, solo plata que cambia de lugar.

```
cambio 50k efectivo a nequi
saqué 20k de nequi
pasé 30000 de nequi a efectivo
consigné 90 mil en bancolombia
```

Sacar del cajero y consignar son lo mismo: plata que cambia de lugar. No suben tus gastos ni tus ingresos. Si el banco te cobró por usar el cajero, dilo en la misma frase y la comisión queda aparte, en Costos del banco:

```
saqué 100 mil de bancolombia y me cobraron 4 mil por usar el cajero
```

El 4x1000 no lo calcula la app: dime cuánto fue. Si no dices de cuál a cuál cuenta, la app te pregunta. Y si la transferencia está pendiente o rechazada, no la anota hasta que salga.

### Tarjeta de crédito

La tarjeta se lleva como una persona llamada Tarjeta. Créala una sola vez:

```
agregar persona Tarjeta
```

Después, lo que compras con ella es una deuda con la tarjeta, y cuando la pagas la deuda baja:

```
compré unos audífonos de 240k con la tarjeta
aboné 150k a la tarjeta desde nequi
me cobraron 18k de intereses de la tarjeta
cuánto debo de la tarjeta
```

Las cuotas las entiende, pero no las lleva: la deuda queda completa. Si todavía no creaste la persona Tarjeta, la app te pregunta con cuál cuenta pagaste y te recuerda agregarla.

### Varios movimientos en una sola frase

Puedes mandar varios a la vez. La app los separa y te los muestra uno por uno ("Movimiento 1 de 3"). Cada uno trae su tarjeta, y la primera suma un botón "Confirmar los N" para guardar todos de un toque.

Se pueden separar de estas formas:

- Cada uno en su línea. El campo del chat crece hasta cuatro líneas: Enter envía y Shift más Enter baja de línea.
- En una lista con comas y una "y": «mecato 5000, pasaje 3000 y almuerzo 12k».
- Un gasto y plata que entra: «gasté 5000 en mecato y me pagaron 20000».
- Con un día en medio: «ayer pagué 15000 de almuerzo en efectivo y hoy entraron 80000 a Nequi».

El máximo es 10 por mensaje. Si tocas Cancelar en uno, sigue con el siguiente.

### Una compra con varias cosas

Si quieres un solo gasto con el detalle adentro, usa "compra:".

```
compra: arroz 5000, sal 2000, 3 gaseosas a 2000 nequi
```

Sale un solo gasto con el total y el detalle de cada cosa en la nota.

### Cuando fue otro día

Di el día en la frase.

```
mecato 5000 ayer
mecato 5000 hace 3 días
```

También funciona «el lunes», «anteayer», «15/10» o «a las 3pm». Un movimiento se anota cuando ya pasó: con «mañana» la app no lo guarda.

### Etiquetas con #

Una etiqueta sirve para juntar gastos de un mismo tema, como un viaje o un cumpleaños. Se escribe con # pegado a la palabra, en cualquier parte de la frase.

```
#viaje almuerzo 12000 #claude
```

Para ver todo lo de una etiqueta, escribe solo la etiqueta, por ejemplo `#viaje`. También puedes filtrar por etiqueta en Movimientos.

### Corregir antes de confirmar

Si la tarjeta salió mal, no empieces de cero. Escribe solo lo que cambia, o toca Editar:

```
nequi
ayer
monto 6000
categoría comida
#cumple
```

Cada mensaje cambia solo esa parte de la tarjeta. Cuando esté bien, toca Confirmar.

### Deshacer (ocho segundos)

Cuando guardas, editas, duplicas o anulas algo, sale arriba un aviso con el botón "Deshacer". Dura ocho segundos. Si lo tocas, todo vuelve a como estaba. También puedes escribir:

```
deshacer
```

Eso anula el último movimiento. No lo borra: queda marcado como anulado.

### Editar un movimiento que ya guardaste

1. Toca Movimientos (abajo).
2. Toca el movimiento que quieres cambiar. Se abre su detalle.
3. Toca Editar.
4. Cambia lo que haga falta (monto, cuenta, categoría, fecha o concepto).
5. La app te muestra qué va a cambiar. Confirma.

Junto a Editar hay otros botones: Duplicar (crea uno igual con la fecha de hoy) y Anular. Los préstamos, las deudas y los gastos compartidos solo dejan cambiar el concepto y la fecha; para cambiar el monto, anula y vuelve a anotar.

### Anular y restaurar

- Anular: en el detalle del movimiento, toca Anular. No se borra nada, solo queda marcado y deja de contar.
- Restaurar: los anulados se ven en Más, Revisión del mes, "Ver anulados". Toca uno y luego Restaurar. Vuelve a contar como antes.

El borrado de verdad existe solo en Más, Ajustes, "Zona de peligro", y pide tu PIN. No lo uses si no estás seguro.

### Comprobantes y fotos

Hay dos maneras de guardar la foto de un recibo.

Foto en un movimiento que ya existe:

1. Movimientos, toca el movimiento.
2. Toca "Tomar foto" (abre la cámara) o "Subir imagen" (elige una de la galería).
3. La foto aparece en el detalle. Para quitarla, toca "Quitar la foto".

Escáner del chat, para anotar a partir de un comprobante:

1. En el Chat, toca el botón del escáner (junto al micrófono, dice "Leer comprobante").
2. Toma la foto o elige una de la galería.
3. La app lee el monto y deja una tarjeta lista para que la confirmes. Si lee mal, corrígela como cualquier tarjeta.

Dónde queda la foto, con honestidad: la app la reduce de tamaño y guarda una copia en tu celular y otra en tu propia base de Cloudflare. No se publica en ningún lado. Como la app guarda su propia copia, puedes borrar la foto de tu galería si quieres liberar espacio.

### Pegar alertas del banco y recibos

En vez de escribir, copia la notificación del banco y pégala en el chat (o toca "Pegar alerta"). Sirve con Nequi, Bancolombia, Daviplata y Banco de Bogotá, aunque venga en varias líneas.

1. Copia el mensaje del banco tal cual.
2. Pégalo en el chat y envíalo.
3. La app saca el monto de la operación (no los saldos), si pagaste o te llegó plata, la cuenta, la fecha y la hora. Revisa la tarjeta y toca Confirmar.

Si la alerta dice que la operación fue rechazada o sigue pendiente, no se anota y la app te avisa. Cuando llegue la confirmación se anota una sola vez.

Con un recibo o una tirilla pegada como texto pasa algo parecido: se anota un solo gasto por lo que de verdad pagaste. El subtotal, el IVA, el descuento y el cambio no se suman. Si hay dos totales distintos, la app te pregunta cuál fue.

### Hablarle por voz

En el chat, junto a Enviar, hay un micrófono. Tócalo, di la frase («mecato cinco mil quinientos») y el texto queda escrito para que lo revises. Nunca se envía solo. Necesita internet y funciona en Chrome del celular.

### Personas, deudas, préstamos y gastos compartidos

Es mejor registrar a las personas antes de usarlas. Para los ejemplos de esta guía usamos a Ana, Luis, Marta y Pedro.

### Agregar una persona

Por el chat:

```
agregar persona Marta
```

Desde la app:

1. Más, "Categorías y personas".
2. Baja hasta "Personas".
3. Escribe el nombre en "Nueva persona" y toca Agregar.

Ahí mismo puedes cambiarles el nombre o archivarlas. Si escribes un nombre nuevo en una frase, la app te pregunta de qué grupo es y qué fue el movimiento.

### Ver cómo vas con una persona

Escribe solo su nombre:

```
Luis
```

La app responde algo como «Luis: te debe $30.000» o «sin pendientes», y trae botones para anotar un préstamo, un gasto compartido o un abono.

### Préstamos: tú le prestas a alguien

```
presté 40k a Luis nequi
```

Luis queda debiéndote 40.000. Cuando te paga, un abono parcial es cualquier monto menor:

```
Luis me pagó 10000 nequi
```

Cuando te paga lo que falta, la deuda se cierra sola. Si pagó de más, la tarjeta te avisa y te deja elegir entre registrar solo lo justo o guardar igual.

### Deudas: tú le debes a alguien

```
le debo 54k a Pedro por la bicicleta antes del 31 de diciembre
```

La frase guarda el motivo y la fecha límite. Para pagar una parte o todo:

```
pagué 20k a Pedro nequi
pagué 34k a Pedro nequi
```

Ojo: «pagué 20k a Pedro» es un abono solo si le debes algo a Pedro. Si no le debes nada, es un gasto normal.

### Desde Deudas y préstamos

1. Más, "Deudas y préstamos".
2. Arriba ves "Por cobrar" y "Por pagar". Más abajo, las listas "Debes" y "Te deben".
3. Cada persona trae un botón: "Registrar pago ahora" si le debes o "Registrar abono ahora" si te debe.
4. Se abre una hoja con el monto (viene el saldo completo, lo puedes bajar) y la cuenta. Confirma.

Para anotar una deuda o un préstamo nuevo, usa el chat.

### Gastos compartidos

Pagaste una cuenta y otros te deben su parte. Hay varias formas de decirlo, y todas dejan el mismo resultado.

```
pizza 9000 entre ana, luis y yo
pizza 9000 pagué por ana y luis
pizza 9000 pagué por ana 3000 y luis 2500
fui a comer con Ana y Luis, pagué 60k por los 3
```

- La primera y la segunda dividen en partes iguales (3.000 cada uno).
- La tercera pone el monto de cada uno: tu parte sale de lo que sobra ($3.500).
- La cuarta dice «por los 3» y también reparte en partes iguales.

La tarjeta muestra tu parte y lo que te debe cada persona. Si la frase puede significar dos cosas, la app no adivina: te muestra botones para elegir.

Al compartir, en el detalle del movimiento hay "Ver cómo se reparte" y "Compartir cuentas".

### Control del dinero

### Saldos

La pestaña Saldos (abajo) es el resumen de tu plata hoy. Tres textos importantes:

- **Disponible**: la suma de tus cuentas de dinero en pesos. No incluye las monedas ni los dólares, que van aparte. Si tocas la tarjeta, ves qué cuentas suma.
- **Seguro para gastar hoy**: lo que puedes gastar hoy sin quedarte corto. La cuenta es el Disponible, menos los pagos fijos que todavía faltan, menos lo apartado en alcancías. Eso es lo "Libre este mes", que se reparte entre los días que quedan, y de ahí se resta lo que ya gastaste hoy. Si los compromisos ya cubren todo, la tarjeta dice que hoy no hay margen.
- **Próximos 30 días**: cómo queda cada cuenta si solo salen los pagos fijos que vienen en el próximo mes. Te avisa antes de que una cuenta no alcance para un pago.

Casi todo lo que tiene una cifra se puede tocar para ver de dónde sale. Para saber cuánto puedes gastar en la semana, también sirve preguntar al chat: `cuánto puedo gastar esta semana`.

### Pagos fijos (arriendo, internet, cuotas)

Son los gastos que se repiten. La app no los anota sola: te avisa dos días antes del cobro y tú lo anotas.

Crear uno:

1. Más, "Pagos fijos".
2. Abajo, en "Nuevo pago fijo", escribe el concepto (por ejemplo Internet), el monto y el día.
3. Elige la cuenta y la categoría. Si quieres, pon una fecha de fin.
4. Toca Agregar.

También se crean por el chat: `cada mes el 5 internet 60000`.

Al tocar un pago fijo se abre su detalle, con estos botones:

- Editar: cambia el monto, la frecuencia, el día, la cuenta o la categoría.
- Pausar y Reanudar: un pago pausado no cuenta en lo que falta, ni en Próximos 30 días, ni en los avisos. Se ve en "Pausados y terminados".
- Programar fin (o "Cambiar fecha de fin"): el pago deja de contar desde esa fecha.
- Eliminar: lo quita. Los movimientos que ya anotaste se conservan.

Por chat también se puede: «pausar recurrente internet», «reanudar recurrente internet», «fin recurrente internet 21/12/2026» y «quitar recurrente internet». Para ver la lista, escribe `recurrentes`.

Cuando llega el cobro, anótalo como un gasto normal («internet 60000»). Ese gasto cubre el pago fijo del mes.

### Alcancías y metas de ahorro

Una alcancía es una meta: por ejemplo, juntar para una moto. Apartar plata para una meta no la mueve de tu cuenta: solo anota cuánto de lo que ya tienes es para esa meta.

Crear una:

1. Más, "Alcancías".
2. Escribe el nombre en "Nueva alcancía" y la meta de dinero. Si quieres, una fecha.
3. Toca Agregar.

En cada alcancía:

- Escribe un monto y toca Apartar para sumar o el botón de menos (Sacar) para restar. "Sacar todo" devuelve todo lo apartado.
- Con el lápiz editas el nombre, el monto y la fecha. Con el botón de pausa la dejas quieta sin borrarla.
- Si pusiste fecha, la app sugiere cuánto apartar cada semana.

Por chat:

```
meta moto 2000000
ahorré 50000 para moto
saqué 20000 de la meta moto
metas
```

Aviso: lo apartado baja el "Seguro para gastar hoy", porque esa plata ya tiene dueño.

### Topes por categoría

Un tope es lo máximo que quieres gastar al mes en una categoría. La app avisa cuando llegas al 80 % y al 100 %.

```
tope mecato 60000
quitar tope mecato
```

También se ven y se cambian en Más, "Categorías y personas": cada categoría muestra su tope o dice "Sin tope". Ahí mismo tienes tres botones más:

- Pausar tope: el tope deja de avisar y de contar, pero no se borra. Con "Reanudar tope" vuelve con el mismo monto.
- Pasar movimientos: eliges otra categoría y todos los movimientos de esta se pasan allá. Los de un mes cerrado no se tocan.
- Archivar categoría: deja de salir en listas y selectores. Sus movimientos no cambian y siguen contando en los reportes. Si tiene subcategorías, archiva primero esas.

### Subcategorías

Sirven para ordenar una categoría grande. Lo que anotes en la subcategoría también suma en la categoría madre.

```
subcategoria restaurante de comida
```

También se crean en Más, "Categorías y personas".

### Arqueo y cuadre del efectivo

El arqueo es contar la plata que tienes de verdad y decírselo a la app. Ella compara con lo que calcula y guarda la diferencia como "Descuadre". El Descuadre no cuenta como gasto.

```
arqueo efectivo 80000 nequi 150000
```

La tarjeta muestra, por cada cuenta, lo que tenías, lo que tienes y la diferencia. Confirma si es lo correcto.

Hay un camino más fácil para el efectivo:

1. En Saldos, toca "Actualizar efectivo que tengo hoy".
2. Se abre un contador de billetes. Toca el más por cada billete que tengas y la app suma. Escribe el total de las monedas sueltas.
3. Toca "Usar este total".
4. Si falta plata, la app ofrece anotar "Otros gastos varios sin anotar" por la diferencia. Si sobra, ofrece un arqueo.

Después de las 6 de la tarde, si hubo movimientos en la billetera, la app te pregunta si lo que tienes es lo que ella dice. "Sí, cuadra" hace el arqueo con esas cifras.

### Revisar y entender lo que pasó

### Movimientos y filtros

La pestaña Movimientos lista todo lo anotado, con un encabezado por cada día.

1. Arriba elige el periodo: Todo, Semana, Mes, Año o Fechas (para escoger tú el desde y el hasta).
2. Elige el tipo: Todos, Gastos, Ingresos, Transferencias o Deudas.
3. Afina con los filtros de categoría, cuenta, persona y etiqueta. Se pueden combinar.
4. Toca un movimiento para ver su detalle.

### Revisión del mes y Ver anulados

Más, "Revisión del mes" junta lo que conviene mirar: cuentas en negativo, deudas por vencer, descuadres del mes, demasiado en Otros y cobros viejos. Cada cosa trae un botón para ir a arreglarla ("Ver movimientos", "Ver descuadres", "Ver anulados").

Si todo está bien, dice que el mes está en orden. En el chat se obtiene lo mismo con `revisar`.

### Exportar tus datos

- En Movimientos, "Exportar CSV" y "Exportar JSON" bajan lo que estás viendo, con los filtros puestos.
- En Más, Ajustes, "Pasar a Excel", el botón "Descargar Excel" baja un archivo con todos los movimientos, los saldos, las deudas y un resumen por mes.
- En Ajustes, "Respaldo": "Actualizar respaldo" guarda un archivo con todo y "Respaldo con contraseña" lo guarda cifrado. Si usas la contraseña, apúntala: sin ella no se puede abrir. "Restaurar respaldo" devuelve los datos desde un archivo.

Guarda esos archivos fuera del celular (en tu correo o en otra carpeta) de vez en cuando.

### Resumen

La pestaña Resumen cuenta cómo te fue. Cambia el periodo con Todo, Semana, Mes, Año o Fechas. Las gráficas siguen el periodo que miras.

- En Mes, el "Calor del mes: día por día" pinta cada día según lo que gastaste. Toca un día para ver sus movimientos.
- "Comparar dos fechas" abre una ventana para comparar dos rangos que elijas.
- "Reporte PDF" arma una hoja limpia del periodo para imprimir o guardar como PDF desde el celular.
- Casi todas las barras, la dona de categorías y las tarjetas se pueden tocar para ver los movimientos que las forman.

### Esconder los montos

El botón del ojo (flotante, abajo a la derecha en Saldos, Movimientos y Resumen) esconde o muestra las cifras. La app arranca con los montos escondidos y vuelven a esconderse solos cuando minimizas la app o apagas la pantalla. Es útil para mirarla en la calle. También se cambia en Ajustes, "Privacidad de los montos".

### Temas y tamaño de letra

1. Más, Ajustes, "Letra y colores".
2. Elige un tema: Obsidiana, Midnight, Tierra, Esmeralda, Bordeaux o Kinetix. Cada uno tiene versión clara y oscura, y se puede dejar en automático.
3. En la piel Tierra con tema claro, el texto principal y los montos se leen con contraste AAA (7 a 1 o más) sobre los tres fondos, y el texto secundario con 4,5 a 1 o más. La calidez café y arena se mantiene.
4. Elige el tamaño de la letra: Compacta (85 %), Normal (100 %), Grande (115 %) o Extra grande (130 %).

### Reglas aprendidas

Si corriges la cuenta o la categoría de un movimiento que acabas de anotar, la app puede preguntar: «La próxima vez que escriba Ana, ¿usar Nequi?». Si tocas "Guardar regla", lo recuerda. Las reglas se ven, se pausan y se borran en Más, Ajustes, "Reglas aprendidas". Lo que escribas en la frase siempre gana sobre la regla.

### Botones rápidos del chat

Arriba del cuadro de escribir están los botones rápidos. Se arman a tu gusto: toca el "+" o ve a Más, Ajustes, "Editar mis botones". Una plantilla deja el texto escrito para completar el monto, y una frase completa arma la tarjeta para confirmar. Se pueden ordenar, ocultar y quitar.

### Pedir ayuda a la app

Si no sabes cómo decir algo, pregúntaselo al chat con tus palabras:

```
cómo anoto un gasto
cómo agrego una persona
cómo pauso un pago fijo
para qué sirve esto
```

Te responde ahí mismo, en la conversación, con una explicación corta y botones con ejemplos. Toca un ejemplo y queda escrito en el cuadro: cámbiale lo que haga falta y envíalo. También puedes escribir `ayuda` para ver los temas, o ir a Más y luego "Ayuda", donde está el cuadro "Pregúntale cómo decirlo".

Las dudas sobre qué hacer en casos de todos los días también se contestan, sin anotar nada aunque menciones montos:

```
si me giraron plata que no es mía cómo la registro
cómo registro un celular que compré a 12 cuotas con tarjeta
cómo pago la tarjeta sin que me cuente doble
anoté 80 mil pero eran 18 mil, cómo lo arreglo
dónde veo cuánto le debo a Laura
puedo pegar el mensaje del banco
cómo pauso un tope sin borrarlo
cómo saco mis gastos a Excel
```

Un ejemplo de lo que explica: la plata que te dan para guardar o entregar a otra persona no es tuya. Se anota como plata que le debes a quien te la dejó, para que no suba tus ingresos, y cuando la entregas o la devuelves lo anotas como pago de esa deuda.

### Si algo falla

Pasa a veces, y lo que más ayuda es poder repetirlo. Cuando encuentres un error, o algo que el bot no entendió, abre un Issue en GitHub: entra a la página del repositorio, toca "Issues" y luego "New issue". Escribe esto:

1. La frase exacta que escribiste, tal cual, con todo y errores. Es lo más importante.
2. Qué esperabas que pasara y qué pasó en cambio.
3. Una captura de pantalla de la tarjeta o del mensaje. Antes de tomarla, toca el botón del ojo para esconder los montos, y no pongas nombres reales de otras personas.
   - Android: presiona a la vez el botón de encendido y el de bajar volumen.
   - iPhone: presiona a la vez el botón lateral y el de subir volumen.
4. Si la app dice que no entendió, no borres el mensaje antes de la captura.
5. Si el error salió al instalar, copia el texto del error de la terminal. No incluyas tu clave ni tu PIN.

Antes de abrir el Issue, mira dos cosas:

- Si la app dice "No autorizado", la clave de Más, Ajustes, "Conexión con el servidor" está mal escrita.
- Si la app se ve vieja o no cambia, ciérrala del todo y ábrela otra vez con internet. Se actualiza sola.

## 7. Paso 6: actualizar la app en el futuro

Después de publicar, la app instalada toma la versión nueva la segunda vez que la abres: si ves algo viejo, ciérrala y ábrela de nuevo.

El código se mejora con el tiempo. Para tener tu app al día sin perder nada, repite estos pasos en la carpeta `finanzas`. Tus datos no se tocan: viven en tu base de Cloudflare.

1. Antes de empezar, haz un respaldo: en la app, Más, Ajustes, "Respaldo", "Actualizar respaldo". Guarda el archivo fuera del celular.
2. Baja los cambios y las piezas nuevas:

```bash
git pull
npm install
```

3. Aplica las migraciones nuevas, si las hay. El comando solo aplica las que tu base todavía no tiene. Si no hay ninguna, responde "No migrations to apply" y no pasa nada:

```bash
npx wrangler d1 migrations apply finanzas --remote --config apps/worker/wrangler.local.toml
```

4. Vuelve a preparar y publicar:

```bash
npm run web:build
npx wrangler deploy --config apps/worker/wrangler.local.toml
```

5. En el celular, cierra la app del todo y ábrela con internet. Se actualiza sola.

Tu clave, tu PIN y tu `wrangler.local.toml` se quedan como estaban: no hay que volver a crearlos. Si instalaste con el instalador, en vez de los pasos 3 y 4 corre `npm run instalar -- publicar mi-app`, y `npm run instalar -- actualizar mi-app` si el cambio trae categorías o palabras nuevas de la plantilla.

Si `git pull` se queja de que cambiaste archivos, no toques nada del proyecto: tu configuración propia está en archivos que Git ignora. Ábrenos un Issue con el mensaje exacto.
