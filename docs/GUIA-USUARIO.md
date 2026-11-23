# Guía de usuario: instalar y probar la app de finanzas

Esta guía es para probar la app paso a paso, sin saber nada de tecnología. Léela con el celular en la mano. Si algo no sale como dice aquí, ve al final, a la parte "Si algo falla".

La app es un chat. Le escribes lo que pasó con tu plata («almuerzo 12000») y ella lo anota. Funciona también sin internet y se sincroniza sola cuando vuelve la señal.

## 1. Instalar la app

Te enviaron un enlace y una clave de acceso. Los vas a necesitar los dos. No los compartas con nadie.

### Si tienes Android (Chrome)

1. Abre el navegador Chrome. Tiene que ser Chrome, no otro.
2. Pega [el enlace que te enviaron] en la barra de arriba y entra.
3. Toca los tres puntos de la esquina de arriba a la derecha.
4. Elige "Instalar aplicación" (en algunos celulares dice "Instalar app").
5. Si solo ves "Agregar a la pantalla de inicio", también sirve, pero queda como un acceso directo y no como la app completa. Es mejor la opción de instalar.
6. Acepta lo que pregunte el celular. Aparece un ícono nuevo en tu pantalla.

### Si tienes iPhone (Safari)

1. Abre Safari, el navegador azul con la brújula. En iPhone tiene que ser Safari. Desde Chrome no se puede instalar.
2. Pega [el enlace que te enviaron] y entra.
3. Toca el botón Compartir (un cuadro con una flecha hacia arriba, abajo en el centro).
4. Baja en el menú y toca "Agregar a pantalla de inicio".
5. Toca "Agregar" arriba a la derecha.

### Abrir la app

Desde ahora abres la app con su ícono, como cualquier otra. Ya no hace falta el enlace.

### Conectar la app con tu clave

Esto se hace una sola vez.

1. Abre la app con el ícono.
2. Abajo toca Más.
3. Toca Ajustes y baja hasta "Conexión con el servidor".
4. En "Dirección del servidor" debe estar escrita la dirección. Si está vacía, pega [el enlace que te enviaron].
5. En el campo de la clave (se llama "Token de acceso") escribe [tu clave de acceso].
6. Toca "Guardar y sincronizar".
7. Debajo tiene que salir un mensaje de que sincronizó. Si dice "No autorizado", la clave está mal escrita: bórrala y vuelve a escribirla.

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

Los avisos te recuerdan, por ejemplo, una deuda por vencer, un pago fijo que toca o que llevas días sin anotar nada. En "Recordatorio nocturno" puedes elegir una hora entre las 7:00 y las 10:30 de la noche para que la app te pregunte si anotaste los gastos de hoy.

En iPhone los avisos solo funcionan si la app está instalada con el ícono en la pantalla de inicio y el teléfono tiene iOS 16.4 o más nuevo. Pruébalo con "Mandar una prueba". Si no llega, avísanos.

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

## 2. Cómo hablarle al chat

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
```

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

Dónde queda la foto, con honestidad: la app la reduce de tamaño y guarda una copia en tu celular y otra en tu servidor (el que te dieron con la clave). No se publica en ningún lado. Como la app guarda su propia copia, puedes borrar la foto de tu galería si quieres liberar espacio.

### Hablarle por voz

En el chat, junto a Enviar, hay un micrófono. Tócalo, di la frase («mecato cinco mil quinientos») y el texto queda escrito para que lo revises. Nunca se envía solo. Necesita internet y funciona en Chrome del celular.

## 3. Personas, deudas, préstamos y gastos compartidos

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

## 4. Control del dinero

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

También se ven y se cambian en Más, "Categorías y personas": cada categoría muestra su tope o dice "Sin tope".

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

## 5. Revisar y entender lo que pasó

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
3. Elige el tamaño de la letra: Compacta (85 %), Normal (100 %), Grande (115 %) o Extra grande (130 %).

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

## 6. Si algo falla

Pasa a veces, y lo que más ayuda es poder repetirlo. Haz esto:

1. Anota la frase exacta que escribiste, tal cual, con todo y errores. Es lo más importante.
2. Anota qué esperabas que pasara y qué pasó en cambio.
3. Toma una captura de pantalla de la tarjeta o del mensaje:
   - Android: presiona a la vez el botón de encendido y el de bajar volumen.
   - iPhone: presiona a la vez el botón lateral y el de subir volumen.
4. Si la app dice que no entendió, no borres el mensaje antes de la captura.
5. Envía la frase y la captura a [a quién avisar].

Antes de avisar, mira dos cosas:

- Si dice "No autorizado", la clave de Más, Ajustes, "Conexión con el servidor" está mal escrita.
- Si la app se ve vieja o no cambia, ciérrala del todo y ábrela otra vez con internet. Se actualiza sola.
