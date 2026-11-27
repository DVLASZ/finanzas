[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Cómo hablarle al bot

El bot es el chat de la app. Escribes como hablas: el orden no importa, las tildes y las mayúsculas tampoco, y las faltas de ortografía se perdonan (`nekui` se entiende como Nequi).

> [!IMPORTANT]
> La regla de oro: el mensaje tiene que traer en qué y cuánto. Con solo `mecato` o solo `10k` no guarda nada y te dice qué falta. La fecha y la hora son las de ahora (hora de Colombia), salvo que digas otra.

## Cómo funciona

1. Escribes un mensaje.
2. El bot te muestra una tarjeta con lo que entendió y tres botones: Confirmar, Editar y Cancelar.
3. Nada se guarda hasta que pulsas Confirmar.
4. Ya guardado, salen los botones Editar y Deshacer por si te equivocaste.

> [!NOTE]
> El bot nunca borra, solo anula. Lo anulado queda marcado y se puede ver en la app. El borrado de verdad existe únicamente en Ajustes, con PIN.

> [!TIP]
> Escribe `ayuda` en el chat y el bot te da ejemplos con las cuentas de tu app. El camino de un mensaje, con diagrama, está en [MOTOR-CONTABLE.md](MOTOR-CONTABLE.md).

Si no entiende una frase y el servidor tiene la ayuda de la IA, la reescribe y te muestra la tarjeta igual (ver [IA.md](IA.md)).

## Cuentas

Cada app tiene sus cuentas (ver [INSTALACIONES.md](INSTALACIONES.md)). Estas son las de la plantilla personal:

| Cuenta | Cómo la nombras | Nota |
|---|---|---|
| Efectivo | `efectivo`, `cash`, `billetera`, o nada | Es la cuenta por defecto |
| Monedas | `monedas`, `sueltos` | Va aparte, no suma al disponible |
| Nequi | `nequi`, `nq`, `nekui` | |
| Daviplata | `daviplata`, `davi` | |
| Dólares | `dolares`, `dolar`, `arq` | Guarda dólares |

Un ingreso en dólares (`ingreso 20 usd sueldo en dolares`) sube el saldo de Dólares en USD y no cuenta en "Entró este mes". Si dices usd sin la cuenta de Dólares, el bot no guarda nada y te explica cómo anotarlo; los dólares nunca se pasan a pesos solos.

La ayuda de cada app (`ayuda`) solo muestra ejemplos con las cuentas que esa app tiene.

## Gastos

```
mecato 5000
5000 mecato
pizza 36k nequi
pizza 36 mil ayer
compré un trident 4500
```

Los montos pueden venir como `5000`, `5.000`, `$5.000`, `5k`, `5 mil`, `1.5k` o `2 lucas`.

También se entienden montos dichos en palabras o con jerga:

- `1'200.000`: el apóstrofo separa los millones y vale 1.200.000. Solo cuando une una cifra con un grupo de tres y sus miles; en texto normal no pasa nada.
- `doscientas mil`, `quinientas lucas`: las centenas valen también en femenino (hasta novecientas).
- `veinte y cinco mil`, `diez y seis mil`, `treinta y un mil`, `treinta y una lucas`, `veintiún mil`: la «y» une una decena con su unidad.
- `dos millones y medio`, `1 millón y medio`, `millón y medio`: suman medio millón. `4 mil y medio` vale 4.500 y `3 lucas y media`, 3.500.
- `medio millón` vale 500.000, `media luca` 500 y `un cuarto de millón` 250.000.
- `mil millones` vale 1.000.000.000 y `dos mil millones`, 2.000.000.000. Lo que pasa de 2.000 millones se rechaza como demasiado grande.
- En dólares, una coma sola con tres cifras es decimal: `1,005 usd` son 1,005 dólares y se guarda como US$1,01 (no mil cinco). Los centavos se redondean bien: 1,005 queda en 101, 0,29 en 29 y 8,285 en 829.

La categoría sale del diccionario (`db/diccionario.json`). Si no conoce la palabra, pregunta en qué categoría va y aprende la respuesta para la próxima.

El atajo `pasaje` vale $7.000 en Viaje semanal. Con `pasaje 7500` cambias el monto.

### Una compra con varias cosas

```
compra: arroz 5000, sal 2000, 3 gaseosas a 2000 nequi
compra pan 3000, leche 4500 ayer
```

Sale un solo gasto con el total ($13.000 en el primero) y el detalle de cada línea en la nota. Con `a` el precio es de cada unidad: `3 gaseosas a 2000` son $6.000. La cuenta, la fecha y el #evento van al final, como siempre. Hacen falta al menos dos cosas con precio; con una sola es un gasto normal.

### Billetes, monedas y vuelto

En Colombia el efectivo son billetes de $2.000 para arriba, y lo menor a $1.000 más la moneda de $1.000 van a la cuenta Monedas. El bot respeta eso.

```
trident 4500 con billete de 10k, me dieron 5k y 500 en monedas
mecato 2800 vuelto 200 monedas
almuerzo 20000 vuelto 500 monedas
```

En el primero, el efectivo baja $5.000 y las monedas suben $500. En el segundo, como $2.800 no es un billete, el bot supone que entregaste $3.000 ($2.000 en billete y $1.000 en monedas) y te devolvieron $200. En el tercero, si el monto es justo un billete y dices el vuelto, entiende que pagaste con ese billete y el almuerzo costó $19.500.

La tarjeta trae los botones Pagué justo y Pagué con $X para cambiar con qué pagaste. Si falta el vuelto o no cuadra, avisa y no deja guardar hasta que lo corrijas.

Si pagaste y se te olvidó decir el vuelto, no hay que rehacer el pago. Escribe el vuelto solo y el bot lo pasa del efectivo a las monedas:

```
me dieron vuelto 26000 en monedas
```

Cuando pagas en efectivo y no dices cómo, la tarjeta supone que pagaste justo y pregunta: «¿Te dieron vuelto? Toca abajo con cuánto pagaste.» Si anotas lo mismo dos veces en menos de diez minutos (por ejemplo, el mensaje se envió doble), avisa que se parece al anterior antes de guardar.

### Cuando la plata no alcanza

Después del saldo inicial, ninguna cuenta de dinero (efectivo, monedas, alcancía, bancos) puede bajar de cero. Si lo que escribes la dejaría en negativo, la tarjeta dice cuánto hay y cuánto falta, y el botón Confirmar pasa a ser Guardar igual. Si en otra cuenta alcanza, aparece también un botón para pasar lo que falta (por ejemplo, de Efectivo a Monedas) y seguir con la tarjeta. Sin saldo inicial no avisa nada, porque todavía no hay saldos de verdad.

Lo mismo pasa al anular: si deshaces un movimiento del que dependen otros (unas monedas que ya fueron a la alcancía), avisa y deja anularlo igual. `deshacer` nunca toca el saldo inicial. Y un segundo `saldo inicial` avisa que lo anotado desde el primero dejaría de contar, y sugiere el arqueo para corregir lo que tienes.

En Saldos, una cuenta en negativo sale como alerta urgente (en la app, no como aviso al celular).

### Plata de otros

Cuando alguien te manda plata para que compres o pagues algo suyo, no es una deuda tuya, ni un ingreso, ni un gasto tuyo: es plata ajena que pasa por tus manos.

```
plata de hugo para juego 31000 nequi
juego 31000 con plata de hugo nequi
```

La primera sube Nequi y la deja como «Plata de Hugo para juego». La segunda la gasta: sale como «Gasto con plata de Hugo» y la deja en cero. Mientras sobre algo, Saldos dice «Plata de otros: $X (está dentro de lo de arriba, pero no es tuya)» y Deudas la muestra en su propia sección, aparte de lo que debes de verdad. Si gastas menos de lo que mandó, el resto sigue siendo suyo; si le debías algo más a la misma persona, esa deuda se queda aparte. Para devolverle lo que sobra, `pagué 11000 a Hugo`.

Si un gasto es todo de otra persona y ella ya mandó una parte, una sola frase hace los dos movimientos (el gasto que pagaste por ella y lo que te pagó):

```
pollo 8000 para luis puso 6000 nequi
```

El primero deja a Luis debiéndote 8.000 con tu parte en cero; el segundo le descuenta los 6.000. Si él mandó la plata antes o después da igual.

### Cuadrar unos pesos con una persona

Si un familiar te manda 150.000 para pagar algo y pagas 149.984, quedan $16 pendientes con ella. Al guardar el pago, el bot lo avisa y ofrece un botón para cuadrarlo. También puedes escribir:

```
cuadrar con mamá
```

Solo sirve para diferencias de hasta $1.000 en pesos. Lo que sobra va a Descuadre (si le debías, cuenta a tu favor) y la deuda se cierra. Con dólares o con más plata no lo hace: ahí se anota el pago de verdad.

### Dictar por voz

En el chat, junto a Enviar, hay un micrófono (en Chrome del celular; necesita internet). Se toca, se habla como se escribiría y el texto queda en el cuadro para revisarlo y pulsar Enviar. Nunca se envía solo.

El dictado entiende los números en palabras: «cinco mil quinientos» es 5500, «ciento veinte mil trescientos» es 120300, «dos millones quinientos mil», «treinta y cinco mil». También arregla cómo suenan las cuentas («banco colombia» pasa a Bancolombia, «davi plata» a Daviplata, «neki» a Nequi). El reconocedor da varias versiones de lo que oyó y se elige la primera que el bot entiende. Si ninguna se entiende, deja la primera para que la corrijas.

### Pagos a trabajadores y revisión del mes

```
jornales
jornales la semana pasada
jornales mes
revisar
```

`jornales` suma lo pagado a cada trabajador (personas del grupo Trabajadores, o gastos de Jornales con nombre). También hay una pantalla en Más, Pagos a trabajadores, donde hay trabajadores. Si dices `jornal 50000 felipe` y Felipe ya es trabajador, no pregunta qué fue: es un pago.

`revisar` junta lo que conviene mirar: cuentas en negativo, deudas por vencer, hace cuánto no cuentas la plata, descuadres del mes, demasiado en Otros y cobros viejos. También está en Más, Revisión del mes, con un botón por cada cosa que se pueda arreglar.

### Cierre del día y atajos

Al guardar, editar, duplicar o anular algo, una barra abajo ofrece «Deshacer» durante ocho segundos. Deshacer una anulación vuelve a contar el movimiento y reactiva sus deudas (es una operación propia, `restaurar`, que se sincroniza como las demás).

Los botones rápidos del chat (los de arriba del cuadro de escribir) los arma cada persona con el + o desde Ajustes. La app no inventa ninguno, salvo los pagos fijos que ya tocan.

Después de las 6 de la tarde, si hubo movimientos en la billetera y nadie la ha contado, la app pregunta: «según la app tienes X en efectivo y Y en monedas, ¿es lo que hay?». El botón «Sí, cuadra» manda el arqueo con esas cifras (queda una tarjeta por confirmar) y «No cuadra» deja escrito `arqueo efectivo ` para que pongas lo real. Aparece arriba del chat y en Saldos, no como aviso al celular.

Los botones de abajo del chat traen Ayuda, y según la app, Ventas (donde se vende) y Jornales (donde hay trabajadores), más los pagos fijos que ya tocan. Los demás los armas tú con el `+`: una plantilla deja el texto escrito en el cuadro para ponerle el monto y la cuenta, y una frase completa arma la tarjeta para confirmar. La app ya no inventa botones con montos. Se pueden ordenar, quitar y ocultar, y se sincronizan con el servidor junto con los apodos.

«Actualizar efectivo que tengo hoy», en Saldos, es un cuadre rápido: cuentas la billetera, la app compara con lo anotado y, si falta plata, ofrece anotar «Otros gastos varios sin anotar» por la diferencia (queda una tarjeta por confirmar). Si sobra, ofrece un arqueo.

### Transporte

```
taxi de terminal a casa 8000
moto casa al terminal 5000
taxi terminal-casa 8000
```

Si falta el origen o el destino, lo pregunta. Viaje semanal no pide recorrido.

Una moto, carro o camioneta con una cifra grande y sin recorrido (`moto 180000`, desde $50.000) se entiende como un arreglo y va a Reparaciones, si esa app tiene la categoría.

## Ingresos

```
+mesada 100k -30k
mamá me dio 100k y le devolví 30k
ingreso 50k chamba nequi
```

El primero guarda un ingreso neto de $70.000. Un ingreso nunca se mezcla con el saldo inicial.

### Plata que entra dicha de otras formas

Estas frases son ingreso, y la fuente es la palabra que dices:

```
salario 2 millones          nómina 2.500.000        sueldo 2500000 nequi
devolución 20k              reembolso 15k           cobro 50k
me reembolsaron 15k         me regalaron 30k        me pagan 50k
me van a pagar 50k          me cayó 50000 de mamá
```

`me pagan` y `me van a pagar` sin más caen en la fuente Otros. `regalo 30k` suelto sigue siendo un gasto, y `pago de luz 50k` también.

`me pagaron 50k de la chamba`, `me pagaron la quincena 800k` y `Ana me pagó 50k` son ingreso si esa persona no te debe nada. Si Ana te debe, la misma frase es el cobro de la deuda. «Me pagó el almuerzo» sigue siendo un gasto que cubrió otro.

También son ingreso, nunca gasto: `me encontré 50 mil en el parque`, `mi tía me regaló 10 mil`, `vendí la bici 200000` (en las apps sin catálogo), `te transfirieron 30000 a nequi` y los avisos del banco como `Recibiste 20.000 de ANA MARIA en tu Nequi`. En `le presté mi juguete a Tomás y me dio 2 mil`, la única plata es la que entra: ingreso de Tomás.

Tras `me pagaron` o `me devolvieron`, lo que va con artículo es una cosa y no una persona: `me pagaron 120 mil de una actividad en Popayán` y `me devolvieron 15.500 de una compra` son ingreso, y no crean a «Actividad» ni a «Compra». Un pariente o alguien que ya tienes sí es persona (`me pagaron 30k de mi mamá`). `me devolvieron 20k que me debían` sin decir quién es ingreso; si alguien te debe, el bot pregunta con un botón por cada deudor y uno de «solo el ingreso».

`pago de ana 50k` es plata de Ana si ya la tienes registrada. Si el nombre es nuevo, el bot pregunta si te pagó o si pagaste tú. `le pagaron 50k` pide aclarar a quién.

### Lo que no pasó

Una frase con el «no» pegado a un verbo de plata no registra nada (si hay otra cláusula afirmativa, esa sí se guarda; ver más abajo): `Ana no me pagó 50000`, `no compré 5000`, `todavía no me paga Pedro`, `nunca me pagó 5000 Pedro`. El bot responde que eso suena a que no pasó y no crea personas (antes «No» o «Nunca» quedaban como una). Las preguntas, como «¿cuánto no he pagado?», siguen su camino.

## Cobros del banco

El banco descuenta cosas solo: el 4x1000 de los retiros y pagos, la cuota de manejo de la tarjeta. Se anotan como gasto en Costos del banco (en las apps que tienen esa categoría).

```
4x1000 376 bancolombia
4 por mil 1440 bancolombia
cuota de manejo 18900 bancolombia
```

Lo del 4x1000 no se calcula solo porque el banco exonera una parte, y el valor real casi nunca es el 0,4 % exacto. Se escribe el que muestra el extracto.

## Mover plata entre tus cuentas

No es gasto ni ingreso.

```
cambio 50k efectivo a nequi
saqué 50k de nequi
cambio 32000 nequi a dolares 8 usd
```

El último es un cambio de moneda: la tarjeta muestra a cuánto salió el dólar esa vez. Si falta una de las dos cifras (`pasé 100 dólares a nequi`), el bot pregunta cuántos pesos llegaron; nunca inventa la tasa. Si dices las dos cifras pero no la cuenta de pesos (`mandé 20 dólares a mi cuenta de pesos y llegaron 78 mil`), ofrece un botón por cuenta.

Dos montos con dos cuentas en la misma frase no son una transferencia. `pagué 20k con nequi y 10k en efectivo` son dos gastos; si el bot no logra separarlos, pregunta. Tampoco se adivina cuando la plata no llegó a donde parece: `retiré 40k de nequi pero los dejé en el cajero` pregunta si se recuperó, se perdió o el cajero no la entregó, y `le pasé 30 mil a mi hermana para que me la guarde` pregunta si es un préstamo, un regalo u otra cuenta tuya.

## Personas, préstamos y deudas

```
presté 40k a ivan nequi
ivan me pagó 40k nequi
le debo 54k a sergio por la bicicleta antes del 31 de octubre
pagué 54k a sergio nequi
sergio me prestó 20k
```

`pagué 54k a sergio` es un abono solo si le debes a Sergio. Si no le debes nada (`pagué 20k a netflix`, `pagué 30k a la universidad`), es un gasto normal, con la categoría que le toque al nombre.

Cada persona tiene un saldo neto contigo. Si te debía y luego paga algo por ti, se compensa. `deudas` muestra lo que debes (con motivo y fecha límite) y lo que te deben.

Las personas se identifican por el nombre completo que uses. Si escribes un nombre suelto que se parece a varios, el bot pregunta cuál. Si lo escribes con un error de tipeo ("danyel" cuando existe Daniel), también pregunta y no adivina: «¿Es Daniel o alguien nuevo?».

Frases donde no se sabe hacia dónde fue la plata, y lo que hace el bot:

- `le mandé 25k a juan` pregunta si se lo prestaste, le pagaste algo o se lo regalaste.
- `le di 20k a carlos para el bus y no me los devuelve` es un préstamo a Carlos (lo que se espera de vuelta es préstamo).
- `presté 10000 a Ana y Luis` son dos personas: pregunta si fueron 10.000 a cada una o 5.000 a cada una, y anota dos préstamos.
- `presté 5k a juan no a jose` presta a Juan: el «no a jose» corrige, no es parte del nombre.
- `faber me devolvió 20k de los 40 que le presté` es el abono de Faber, no otro préstamo.
- `quedamos a mano con maría por 15k` no anota nada solo: pregunta si María te pagó, si le pagaste tú o si se cierra la cuenta sin mover plata.
- `pagué 60k por mí y por ana y luis` es un gasto compartido entre los tres.

Cuando aparece un nombre nuevo, el bot pregunta de qué grupo es (en la app familiar: los de la casa, familia, trabajadores, etc.) y después qué fue el movimiento: le pagué, le presté, le vendí, me pagó, me prestó, le regalé o fue gasto mío. Si el nombre viene con trato («Don Carlos», «la seño»), también lo pregunta en un préstamo o una deuda, y ofrece «Es un apodo de...»: elige a quién y, al confirmar, ese nombre queda como apodo de esa persona y la próxima vez no pregunta. Los apodos se ven y se cambian en Más, Categorías y personas. Un nombre simple en un préstamo («presté 20000 a Ana») no pregunta, para no sumar un paso a cada uno.

Si dices para qué fue un préstamo (`presté 52000 para cámara`), lo que sigue a "para" es el motivo, no una persona. El bot pregunta a quién se lo prestaste.

Los regalos van como gasto en Regalos: `le regalé 50000 a Jorge`.

También puedes crear y cambiar personas sin anotar plata. Hace falta la palabra persona o contacto (o `registrar a`), porque `agregar arroz` es la lista de compras. La persona nueva queda en el grupo que le toca por el nombre (familia si dices mamá o tía, amigos si no) y se cambia en Más, Categorías y personas.

```
agregar persona Sofia
nueva persona Laura
registrar a Faber
guardar contacto Laura
crear persona Faber
añadir contacto Ana
renombrar persona Ana a Ani
```

Si ya existe, responde «Ya tengo a Sofia.». Al renombrar, el nombre nuevo no puede ser el de otra persona; los movimientos viejos quedan con el nombre nuevo.

Escribir solo el nombre de alguien que ya tienes (`Ivan`) muestra cómo van las cuentas con él: «Ivan: te debe $50.000.», «le debes...» o «sin pendientes». Trae tres botones (Le presté, Gasto compartido, Abono) que preguntan cuánto. Si hay dos con el mismo primer nombre, pregunta cuál.

```
Ivan
daniel
```

Una persona puede tener una categoría fija (config `categoria_persona`, JSON `{"per:julio": "cat:hijo"}`). Con ella, `Giro Julio 150k Bancolombia` queda directo como gasto en esa categoría, con el nombre en el concepto y sin preguntar nada. Nequi, Daviplata y otros medios de pago nunca se toman por una persona, aunque la app no tenga esa cuenta.

## Plata que te mandan para pagar algo de otra persona

Si un familiar te consigna para pagar algo suyo, eso no es ingreso tuyo ni gasto tuyo. Se dice con estas frases y usa la deuda de siempre:

```
plata de mamá para cooperativa 150000 nequi
cooperativa 149984 con plata de mamá nequi
```

La primera anota lo que ella te mandó (en Deudas sale con el motivo). La segunda anota el pago como un pago a ella. Si sobran unos pesos, quedan como lo que le debes. Cuando son pocos y no se van a devolver, se cuadran con `cuadrar con mamá` (ver más arriba, «Cuadrar unos pesos con una persona»): la deuda queda en cero y la diferencia va a Descuadre, que no cuenta como gasto de verdad.

## Gastos compartidos

```
pizza 9000 pagué por ivan 3000 y daniel 2500
pizza 9000 pagué por ivan y daniel
pizza 9000 entre ivan, daniel y yo
pizza 9000 pagué 3000 por ivan
pizza 9000 por ivan 3000
pizza 9000 3000 de ivan
pizza 9000 ivan 3000
ivan me pagó el almuerzo 6000
```

En el primero tu parte es $3.500 y ellos te deben las suyas. En el segundo se divide en partes iguales entre los tres. El tercero dice lo mismo con otras palabras: funciona cuando tú estás en la lista («yo»). Las cuatro siguientes son el primero dicho en otro orden, como sale al hablar: el gasto total y luego la parte de Ivan, con o sin «pagué», con «por» o con «de», o solo el nombre. Todas dejan el mismo resultado. Las formas sin «pagué ... por» solo se leen así si Ivan ya existe en tus personas. El dictado de Android escribe «25,000» con coma: se lee como 25000.

### Como lo dice la gente

Antes de leer la frase, el bot la pasa por una capa de lenguaje natural que entiende modismos sin que tengas que aprender la sintaxis. Funciona sin internet.

```
fui a comer con Ana y Luis, pagué 60k por los 3
hicimos vaca de 60k con Ana y Luis para el almuerzo
mitad y mitad con Ana el almuerzo de 40k
cine con Ana 30k a medias
cada quien pone su parte, almuerzo 45k con Pedro y Marta
pagué 50k, 30k míos y 20k de Ana en el almuerzo
pagué 90 mil de la cuenta, éramos 3
```

Las que dicen el reparto con claridad (por los 3, a medias, mitad y mitad, cada quien pone su parte) quedan como gasto compartido en partes iguales. Cuando la frase puede querer decir dos cosas, el bot no adivina: te muestra botones. Con «hicimos vaca» o «pagué lo de Ana y lo mío» ofrece dividir entre todos, anotar solo tu parte o dar otro reparto. Con «éramos 3, pagué 90 mil» pregunta si anota tu parte o todo lo que pagaste.

El dinero se puede decir como sale al hablar: «sesenta mil», «quince quinientos» (15.500), «30 lucas», «2 barras», «un palo» (un millón). El dictado que oye «neki» o «banco colombia» se corrige solo.

Verbos de todos los días que el bot ya lee:

- Entra plata: «me giraron 80 mil a nequi», «me consignaron 200k», «me soltaron 30 lucas», «Ana me giró 50k».
- Deudas: «me fiaron 20k donde doña Rosa» y «quedé debiendo 15 mil a Pedro» son deudas; «Luis me debe 20k» es un préstamo tuyo.
- Gastos: «me tocó poner 30k para el taxi».
- Mover plata: «saqué 100k del cajero» y «pasé 50k de nequi a efectivo».
- Sacar de una meta sigue siendo «saqué 80000 de la meta moto», no un retiro del cajero.

Formas de la segunda ronda de lenguaje:

- Cobros: «Faber me pagó los 23k que me debía», «me abonó 10k Ana», «me devolvió 20k Pedro», «me consignó 50k Luis», «cobré 30k a Ana», «Ana me debía 23k y ya me pagó». Con deuda abierta con esa persona son un abono recibido; sin ella, un ingreso con la persona como fuente. Nunca un gasto ni una deuda tuya. «ya me pagó Ana» o «cobré a Ana» sin monto preguntan cuánto.
- Negaciones por cláusula: se separan por coma, «y», «pero», punto y coma, salto de línea o «/». `gasté 5000, no pagué propina` guarda los 5.000 y la tarjeta dice «Ignoré «no pagué propina», porque dice que no pasó». Si lo único con plata está negado, no se anota nada. `gasté 5000` sin decir en qué se anota como «Gasto» y pregunta la categoría.
- Medidas: `botella 500 ml 2500`, `compré 500 gramos de queso 5000`. ml, cc, l, g, gr, kg, kilos, libras, cm, mm y metros no son plata.
- Precio por unidad: `2 empanadas 4500 c/u` y `compré 3 gaseosas 2000 cada una` multiplican (9.000 y 6.000) y la tarjeta dice «3 × $2.000 = $6.000». Sin cantidad pregunta cuántas.
- Repartos con número: `almuerzo 60k entre 3` anota solo tu parte (20k) y avisa el total, sin crear personas. `pizza 60k entre 3 con ana y luis` es un gasto compartido; si el número no cuadra con los nombres pregunta. `dividimos el almuerzo 30000 con ana y luis` y `repartimos...` reparten en partes iguales.
- Mover plata: `pasé 50000 a nequi` pregunta de dónde sale. `saqué 100000` y `retiré 100000` sin cuenta preguntan de cuál (con una sola cuenta de banco la usan; «del cajero» sigue tomando la cuenta del banco). `saqué plata del cajero` sin monto pregunta cuánto.
- Jerga de deudas: `me fié 20000` y `quedé debiendo 15000` preguntan a quién le debes. `me quedó debiendo Pedro 15000`, `me debe ivan 20k` y `me deben 20k Ana` son un préstamo tuyo (igual que `ivan me debe 20k`); `me deben 20k` pregunta quién. `me tocó pagar 20000 a Pedro` y `cancelé la deuda con Pedro 20000` se leen como «pagué 20000 a Pedro» (abono si le debes). `me rebajó Pedro 5000` pregunta qué fue. `cancelar el pago` pregunta si quieres deshacer lo último.
- `le puse 5000 a la moto` es un gasto en moto. `puse yo 20000` pregunta en qué fue.
- Dólares: `presté 12.50 usd a ana` (y las deudas y regalos en usd) usan la cuenta de dólares si existe.
- Líneas: `mecato 5000` y debajo `nequi` (o `ayer`) son un solo movimiento; `mecato` y debajo `5000` también.
- Prioridad de categoría: la que dicen las palabras de la frase gana al atajo y a las reglas aprendidas. `mecato ana 3000` es Mecato aunque exista la regla ana a Transporte; `pasaje taxi 8000` es Transporte y `pasaje 8000` sigue siendo el atajo. La regla solo rellena cuando la frase no dice categoría.
- Editar lo último hablando: `anula el último`, `borra`, `borrar el último`, `elimina el ultimo` y `quita el último` deshacen. `cambia el monto a 7000`, `corrige a 7000`, `era 7000` y `mejor 7000` abren el último movimiento con el monto nuevo. Sin movimientos propios responden «No hay nada que deshacer» o «No hay nada que editar».

Si no sabes cómo decir algo, en la Ayuda escribe tu duda en «Pregúntale cómo decirlo» («cómo anoto que presté plata»). Te da el ejemplo con tus cuentas y el botón «Usar este ejemplo» lo deja escrito en el chat.

## Eventos

Agrega `#cumple-daniel` a cualquier mensaje. Para ver todo lo de ese evento, escribe solo `#cumple-daniel`.

Puedes poner una o varias etiquetas (hasta 5) en cualquier frase y en cualquier posición: gasto, ingreso, deuda, pago, compartido o transferencia.

```
#viaje almuerzo 12000 #claude
pizza 30000 con ivan #universidad
```

El hashtag no cambia el concepto, la categoría ni el monto: se quita del texto y se guarda aparte. Cada etiqueta lleva letras, números, guion o guion bajo, hasta 24 caracteres. Se guardan en minúscula y sin tildes, separadas por un espacio (`viaje claude`), en el mismo campo que ya existía, así que no hace falta migrar nada. Con `#viaje #claude` solo ves lo que lleva las dos. En la tarjeta de confirmación otra etiqueta escrita («#proyecto») reemplaza las que traía.

En Movimientos, los chips de etiquetas filtran (se pueden juntar varias) y cada fila las muestra tocables. Al editar un movimiento puedes cambiarlas o quitarlas. El Resumen suma lo gastado por etiqueta en el periodo y cada fila abre sus movimientos.

## Saldo inicial y cuadre

```
saldo inicial efectivo 85000 nequi 150000 monedas 12000
arqueo efectivo 80000 nequi 150000 monedas 11500
```

En la app que tiene alcancía también se puede decir su saldo (`alcancia 250000`). El saldo inicial fija desde cuándo se calculan los saldos. No es un ingreso. Lo que haya antes (el historial del Excel, por ejemplo) cuenta para los reportes de gasto pero no toca los saldos.

El arqueo es contar lo que tienes de verdad. El bot compara con lo que calcula y guarda la diferencia como Descuadre.

## Varias cosas en un mensaje

Puedes escribir varios movimientos juntos. Se separan con un salto de línea, un punto y coma, o un + o un - con espacios entre dos cantidades.

También se parten, en una sola línea:

- Un gasto seguido de plata que entra: `gasté 5000 en mecato y me pagaron 20000`, `... y recibí 20000`, `... y cobré 20000 de ana`.
- Una lista de «concepto monto» con coma, ` y ` o `/`: `mecato 5000, pasaje 3000 y almuerzo 12k`. Cada trozo debe tener un solo monto y un concepto. `almuerzo con ana y luis 30000`, `arroz, sal y papa 12000` o `cena 60000 entre ana y luis` no se parten.
- `+` y `-` pegados a la cantidad: `+50000 nomina -12000 mecato` son un ingreso y un gasto. `-12000 mecato` solo es un gasto de 12.000. Un `+` entre dos gastos (`mecato 5000 + pasaje 3000`) solo los separa; es ingreso cuando va pegado (`+5000 ana`) o cuando el trozo empieza por la cantidad (`+ 500000 Ana`).
- `pasaje 3000 - 500 descuento` no se parte: ese 500 resta del pasaje y el bot no lo adivina, te pregunta.

```
mecato 5000
almuerzo 12000

150000 Ana + 500000 Ana - 75000 llanta
```

También se cortan donde empieza otra cosa dentro de la misma frase: un «y» o una coma seguidos de un día, de «luego» o de un verbo de plata, siempre que cada trozo traiga una cantidad. Por ejemplo, dictar «ayer pagué 15 mil de almuerzo en efectivo y hoy entraron 80 mil a Nequi» deja dos movimientos. «Entraron», «llegaron» y «consignaron» con una cantidad de plata se leen como ingreso (sin decir de dónde viene, cae en Otros); «llegaron 35 galletas» sigue siendo mercancía.

```
ayer pagué 15000 de almuerzo en efectivo y hoy entraron 80000 a Nequi
mecato 2000, luego gasté 5000 en pasaje
me llegaron 50000 por nequi de trabajo
```

Cada tarjeta trae su botón, y la primera suma «Confirmar los N»: guarda todas de un toque mientras se entiendan del todo. Se detiene en la primera que tenga una pregunta, un aviso o plata que no alcanza y la deja como tarjeta.

El bot los muestra uno por uno, cada uno con su tarjeta ("Movimiento 2 de 3"). Lo que sigue a un + se toma como plata que entra. Si pulsas Cancelar en uno, sigue con el siguiente. Una parte que no entiende la avisa y pasa a la que sigue. El máximo es 10 por mensaje.

Mientras tanto la lista se arregla escribiendo: `el segundo fue 8000`, `el del taxi fue en nequi`, `quita el de mecato`, `quita el primero`, `los tres fueron en efectivo`, `todo fue para la reunión del trabajo` (les pone el evento), `confirma los otros` y `mejor cancela todo`. «Ese fue con tarjeta» con varios en la lista no dice cuál: el bot pregunta y no cambia ninguno. A los que esperan en la lista solo se les cambia el monto, la cuenta o el evento; lo demás se dice cuando aparezca su tarjeta.

## Ventas

Solo en las apps con catálogo (la de empresa). El bot calcula el total con los precios del catálogo.

```
vendí 3 botellas de jugo
15 galletas a granel Marta
vendí 2 paquetes de 10 a 7 mil
```

Con un cliente conocido pregunta si pagó o se lo fiaste. Fiado deja la deuda del cliente y no entra plata a la caja. El precio dicho (`a 7 mil`) gana sobre el del catálogo. El catálogo se edita en Más, Productos y precios.

Para llevar la cuenta de las unidades de un producto:

```
existencias
inventario galletas 200
llegaron 50 galletas
```

Con `inventario galletas 200` dices cuántas hay. Desde ese momento cada venta las resta (un «paquete de 10» resta 10) y, si una venta no alcanza o deja pocas, la tarjeta lo avisa. Cuando llega mercancía, `llegaron 50 galletas` la suma. Si anulas una venta, las unidades vuelven solas. Es opcional: un producto sin conteo no avisa nada. También se maneja desde Más, Productos y precios.

Para ver lo vendido por producto: `ventas` (del mes), `ventas semana` o `ventas del año`. Muestra el total y cuánto aportó cada producto; en el año, también, lo vendido mes por mes.

## Gastos que se repiten

Para lo que pagas todos los meses (arriendo, internet, Cooperativa). No lo registra solo: te avisa y tú lo anotas.

```
cada mes el 5 internet 60000
cada quincena el 5 mecato 20000
cada lunes mecato 12000
cada año el 15 de marzo salud 300000
recurrentes
```

Hay cuatro frecuencias. En «cada mes» el día va de 1 a 28. En «cada quincena» va de 1 a 13 y cae ese día y 15 días después (el 5 y el 20). «Cada lunes» (o martes, y así) es semanal, y «cada año el 15 de marzo» es anual.

Desde dos días antes de la fecha, y hasta que escribas ese gasto, la app te muestra el aviso y el celular te avisa por la mañana. Cuando lo anotas (`mecato 12000`), el aviso se va hasta la próxima vez. Un pago anual sigue avisando hasta un mes después de la fecha. Para quitar uno: `quitar recurrente mecato`.

Los que ya existen se pausan, se reanudan o se terminan con una fecha. El bot busca por el nombre; si coinciden varios, te pide que precises. Un fijo en pausa no cuenta en lo que falta, en Próximos 30 días ni en los avisos, y el listado lo marca «(en pausa)». Con fecha de fin, el listado dice «(hasta 21/12/2026)». Sin fecha, `fin` es hoy. La fecha va como `21/12/2026` o `21 de diciembre de 2026`.

```
pausar recurrente internet
pausar pago fijo internet
pausar pago internet
reanudar recurrente internet
fin recurrente internet 21/12/2026
terminar pago fijo internet 21/12/2026
cancelar pago internet el 21 de diciembre de 2026
```

La pausa también se puede programar: `pausa claude desde el próximo mes` (sigue activo hasta el día 1 del mes siguiente) o `pausa el arriendo por dos meses y vuelve a cobrar en febrero`. El bot pregunta con Confirmar y Cancelar antes de cambiar nada. `pausaHasta` es el día en que vuelve a contar; si «dos meses» y «febrero» no coinciden, manda la fecha que dijiste y el bot lo avisa. `reanudar recurrente` borra la pausa programada.

## Metas de ahorro

```
meta moto 2000000
ahorré 50000 para moto
saqué 20000 de la meta moto
metas
```

La plata no cambia de cuenta: la meta solo la aparta, como una etiqueta, y los saldos quedan igual. En `saldo` aparece cuánto está apartado. Para borrar una: `quitar meta moto`. La plata que estaba apartada sigue en tus cuentas.

## Subcategorías

```
subcategoria restaurante de comida
```

Crea la categoría Restaurante dentro de Comida. Lo que anotes en Restaurante suma también en Comida: el resumen muestra Comida con lo de adentro desglosado, y `cuánto llevo en comida` cuenta todo. Pueden anidarse hasta tres niveles (categoría, subcategoría y sub-subcategoría): por ejemplo Comida, dentro Restaurante y dentro Domicilios. Lo anotado en el nivel más hondo suma en los dos de arriba. Un cuarto nivel no se acepta. También se crean y se mueven en Más, Categorías y personas.

## Cerrar meses

```
cerrar mes octubre
meses cerrados
abrir meses
```

Un mes cerrado no deja anotar, corregir ni anular nada de esas fechas, para no mover por error cuentas que ya revisaste. Solo se cierran meses que ya pasaron. Cerrar octubre cierra también todo lo anterior. Con `abrir meses` se puede volver a tocar.

## Lista de compras

```
falta arroz y sal
lista
compré arroz
```

La primera agrega, la segunda muestra y la tercera tacha. `compré arroz 8000` sigue siendo un gasto. Una línea sin monto, como `jabón baño`, ofrece agregarla a la lista. También se maneja en Más, Lista de compras.

## Alcancía

Solo en la app que la tiene. Las monedas que metes se cuentan por tipo y el bot suma.

```
metí 5 monedas de 500 y 3 de mil a la alcancía
metí 10000 a la alcancía
saqué 2 monedas de 500 de la alcancía
```

La plata pasa de Monedas a Alcancía (o al revés al sacar, y también al romperla: `rompí la alcancía y salieron 35 mil`). La alcancía sale aparte en Saldos y no suma al disponible.

En una app sin cuenta Alcancía esa plata nunca estuvo en los saldos, así que `rompí la alcancía y salieron 35 mil` pregunta si ya estaba anotada (no se anota nada) o si entra ahora al efectivo.

## Plata en otras cuentas

Solo en la empresa. Es la plata del negocio que está en cuentas personales de los socios. Se le pasa con `cambio 100000 efectivo a personal` y sí suma al disponible.

## Alertas del banco

El botón «Pegar alerta» del chat lee una notificación copiada de Nequi, Bancolombia o Banco de Bogotá (si el navegador no deja leer el portapapeles, la pegas en un cuadro). Saca el monto (el primero, no el saldo), si fue pago o plata que llegó, el comercio o la persona, la cuenta, la fecha y la hora, y arma la frase que ya entiende el bot. Todo con reglas: no usa IA ni gasta cuota. La frase pasa por la tarjeta de confirmación como cualquier mensaje, así que nada se guarda sin que pulses Confirmar. Si la app no tiene la cuenta de ese banco, la tarjeta lo dice y hay que cambiar la cuenta. La lectura está en `packages/core/src/notificaciones.ts`.

Si pegas la notificación directamente en el chat (Nequi, Daviplata o Bancolombia, una o varias operaciones), `banco.ts` la convierte en una frase por operación, con cuenta, fecha y hora, antes de dividir el mensaje. Solo cuenta el monto de la operación: saldos, puntos, dígitos de tarjeta, referencias y códigos se ignoran, y cualquier texto que parezca una orden se descarta. Si la instalación no tiene la cuenta del banco, la frase queda sin cuenta y la tarjeta usa la de siempre.

## Consultas y comandos

| Escribes | Muestra |
|---|---|
| `saldo` | Saldos por cuenta, disponible, monedas aparte, lo que te deben y debes |
| `semana`, `mes`, `año` | Gastos por categoría, ingresos y balance, y topes |
| `deudas` | Lo que debes y lo que te deben |
| `ventas`, `ventas semana`, `ventas del año` | Lo vendido por producto (apps con catálogo) |
| `existencias` | Cuántas unidades quedan de cada producto que lleva cuenta (apps con catálogo) |
| `últimos` | Los últimos movimientos |
| `cuánto llevo en mecato` | Lo de la semana y el mes en esa categoría |
| `cuánto hay en nequi` | El saldo de esa cuenta, nada más |
| `quién me debe plata` | Lo mismo que `deudas` |
| `cuánto puedo gastar esta semana` | Lo que queda libre para la semana (ver abajo) |
| `corte`, `corte de la semana` | Ventas e ingresos, gastos, utilidad neta, ingresos por fuente y lo que se está acabando (en Resumen, las apps que venden tienen botones para compartirlo o imprimirlo) |
| `tope mecato 60000` | Fija un tope mensual. El bot avisa al 80 % y al 100 % |
| `quitar tope mecato` | Quita el tope |
| `pausar tope mecato`, `reanudar tope mecato` | Pausa el tope sin borrarlo (no avisa ni cuenta) y lo reactiva con el mismo monto |

Las preguntas se entienden como se dicen, con o sin signos y con o sin tilde, también dictadas: `¿cuánto llevo en comida este mes?`, `¿cuánto hay en Nequi?`, `¿quién me debe plata?`.

```
cuánto llevo en mecato este mes
cuánto hay en efectivo
quién me debe plata
cuánto puedo gastar esta semana
```

Lo de la semana sale de lo libre del mes (lo disponible menos los pagos fijos que faltan y lo apartado para metas), repartido entre los días que quedan y multiplicado por siete. Es la misma cuenta de «Seguro para gastar hoy». También sale en Saldos y en Resumen.

Para que lo que sobró de un tope el mes pasado se sume al de este mes, se pone la config `tope_arrastra` en `1` (en el `.json` de la instalación y `npm run instalar -- actualizar <nombre>`). El arrastre solo se aplica a un mes completo.

El tope de una categoría cuenta también lo anotado en sus subcategorías (con `tope comida 100000`, un `almuerzo 40000 restaurante` ya lleva el 40 %). El tope es mensual: en la vista Año se multiplica por doce y en la vista Semana se prorratea por los días (el tope por siete sobre los días del mes). Si una categoría y una de sus subcategorías tienen tope a la vez, el de la hija ya está dentro del de la madre y no se suma dos veces en el ritmo del mes.

Gasto tiene una sola definición: los movimientos de tipo gasto y compartido (tu parte) y la compra a crédito (`debo 30000 a juan por mercado`), que cuenta al anotarla. El Descuadre de un arqueo no cuenta como gasto, así el total, las listas y las gráficas siempre coinciden.

| Escribes | Muestra |
|---|---|
| `deshacer` | Anula el último movimiento |
| `deshacer 3` | Anula los últimos 3 movimientos (hasta 10) |
| `editar último` | Reabre el último movimiento para corregirlo |
| `ayuda` | Ejemplos sencillos con las cuentas de esa app |

Saldos, deudas y resúmenes también tienen su pantalla en la app. Desde el chat solo hace falta el botón Ayuda.

## Fechas

`ayer`, `anteayer`, `hoy`, `el lunes`, `el lunes pasado`, `hace 3 días`, `15/10`, `el 2 de octubre`, `a las 3pm`, `4 pm`, `4:30pm`. Un pago mixto sin total (`taxi 6000 billete y 1800 monedas`) cuesta la suma, $7.800. La hora puede ir sola (`almuerzo 12000 1 pm`) o con el día (`ayer 4 pm`). Con `a las 4` sin am ni pm toma la tarde. Una fecha que no existe se rechaza.

También entiende: `el 15` o `dia 15` (ese día de este mes, o del anterior si todavía no llega), `el primero`, `el martes 13`, `el pasado lunes`, `hace una semana`, `hace 2 semanas`, `la semana pasada`, `anoche`, `esta mañana`, `esta tarde`, `ayer por la noche`, `15 nov`, `nov 15`, `2 de marzo de 2025`, `2026-10-15`, `15-10`, `en la quincena` y `a fin de mes` (la fecha que ya pasó más reciente). Horas: `12:30`, `15:30`, `a las 3 y media`, `a las 8 de la noche`; con `cena` y `a las 8` son las 8 de la noche, y en `a las 12 15 mil` el 15 mil es plata, no minutos. Una hora imposible (`a las 25`) se rechaza.

Una fecha sin año que caería a más de 10 días en el futuro se toma del año pasado (`28/12` escrito el 2 de enero es el 28 de diciembre anterior). Con año en el futuro, o con `mañana` y `pasado mañana`, el bot no anota: explica que un movimiento se anota cuando ya pasó. En una deuda, la fecha límite sin año es la próxima que llegue (`antes del 15 de enero` escrito en diciembre es enero del año que viene) y `para el 20` es el próximo día 20.

## Reglas aprendidas

Si corriges la cuenta o la categoría de un gasto o ingreso que acabas de anotar (guardado hace menos de diez minutos, o de hoy), la app pregunta: «La próxima vez que escriba Laura, ¿usar Nequi?». Con «Guardar regla» queda una regla; con «No» no pasa nada. No pregunta si esa regla ya existe igual.

La regla se toma de la persona del movimiento o, si no hay, del concepto (en un ingreso, de la fuente). Al escribir un gasto o ingreso cuya frase contenga esa palabra y no diga cuenta, el bot usa la de la regla y lo avisa en la tarjeta: «Usé tu regla: Laura va a Nequi». Lo que se escribe en la frase siempre gana: una cuenta dicha («con efectivo»), el atajo que ya trae cuenta o categoría, y la categoría fija de una persona. Una regla cuya cuenta ya no existe se ignora.

Las reglas se ven, se cambian y se borran en Ajustes, en «Reglas aprendidas». Se guardan en la config (`reglas_aprendidas`, un JSON de `{ id, clave, cuentaId?, categoriaId?, creada }`), así que sincronizan y entran en el respaldo sin migración. Código en `core/src/reglas.ts`.

## Corregir una tarjeta

Pulsa Editar (o escribe la corrección directo) y di solo lo que cambia:

```
monto 6000
nequi
categoría comida
vuelto 5k y 500 monedas
ayer
#cumple-daniel
de terminal a casa
```

Si escribes un mensaje completo nuevo, reemplaza la tarjeta. Si estás editando un movimiento ya guardado, el original solo se anula cuando confirmas el nuevo. Si cancelas, queda como estaba.

Al confirmar, primero se guarda el nuevo y después se anula el original: si algo falla en medio, no se pierde nada. El nuevo recuerda a quién reemplazó, así que Deshacer anula la edición y devuelve el original.

En un compartido, cambiar el monto reparte de nuevo si las partes eran iguales («Repartí de nuevo: cada uno $4.000»). Si las partes eran distintas no se tocan y la tarjeta avisa.

### Aclarar como se habla

Con una tarjeta pendiente también vale decirlo con tus palabras. La tarjeta cambia en su sitio (no nace otro movimiento) y el bot dice qué cambió en una línea. Si la tarjeta tenía una pregunta (por ejemplo de qué grupo es una persona nueva), la pregunta sigue ahí.

```
mentiras, fue en nequi          la cuenta
eran 21 mil                     el monto (también «era 4500», «fueron 47000 con el domicilio»)
no, fue antier                  la fecha
no era comida, era una recarga  el concepto y su categoría
era con Paula, no Laura         la persona
y ponle mitad y mitad           gasto compartido con la persona de la tarjeta
Ana me da 30 y Luis 30          compartido con lo que pone cada uno (30 en una cena de 90.000 son 30 mil)
no, fue un regalo               de préstamo a gasto en Regalos, sin deuda
espera, me los devuelve         de regalo a préstamo
eso fue un préstamo de mi mamá  de ingreso a deuda con tu mamá
ya le había abonado 20          la deuda queda en lo que falta
```

Una cuenta que no tienes («con la tarjeta de crédito») no cambia nada: el bot dice cuáles hay. Con una pregunta con botones abierta, escribir la respuesta también sirve: después de «saqué 200000», «de nequi para efectivo» elige esa opción, y «era a Andrés Felipe, no Andrés Gómez» repite la pregunta con el nombre bien.

`guarda`, `sí, guarda` y `confirma` guardan como «ok». Si lo único que falta es la categoría, `guarda` la deja en Otros y lo dice; un «sí» con preguntas sin responder no guarda.

Lo recién guardado se corrige empezando por «corrige» o «me equivoqué»: `corrige, fueron 87000` anula el original (queda marcado, no se borra) y guarda el nuevo; Deshacer lo devuelve. Si el cambio trae una pregunta o un aviso, queda como tarjeta para revisarla.

## Categorías por palabra, pagos fijos y etiquetas sugeridas

Las palabras del diccionario (`db/diccionario.json`) valen como palabra completa, en singular o plural: `bus` y `buses` son Transporte, pero `busqueda` no; `cena` es Comida y `escena` no; `ropa` es Personal y `europa` no. Solo `droguer` y `peluque` se aceptan como inicio de palabra (droguería, peluquería). El nombre de una categoría también vale en singular o plural y sin tilde: «suscripción», «reparaciones», «salida», «comidas». Nuevas palabras: `tinto` en Mecato, `cerveza` en Salidas, `restaurante` en Comida. «Otros» solo se reconoce tal cual, porque «otro» aparece en demasiadas frases.

Una frase que nombra un pago fijo («claude 65000», «suscripción claude») hereda la cuenta y la categoría con que se guardó ese pago (`core/src/fijosHeredar.ts`). Se reconoce por las palabras distintivas de su concepto, enteras; lo genérico («suscripción», «pago», «cuota») no cuenta. Lo escrito en la frase siempre gana: «claude 65000 efectivo» sale en efectivo.

Al tocar el botón de un pago fijo en el chat se abre una hoja con el monto precargado para ajustarlo (un cobro en dólares cambia con la TRM). Si su cuenta es de dólares, el monto se queda en dólares. Al confirmar sale la tarjeta de siempre, con el concepto del pago fijo, y por eso cuenta como pagado del mes.

La tarjeta por confirmar trae siempre una fila de etiquetas: las puestas (con una equis para quitarlas), una o dos sugeridas y «Etiqueta» para escribir otra. Las sugeridas salen de los movimientos parecidos (mismo concepto, persona o categoría) y, si no alcanzan, de las más usadas del último mes (`sugerirEtiquetas`, en `core/src/etiquetas.ts`). Tocar una manda a la tarjeta el conjunto completo, por ejemplo `#viaje #claude`, igual que si lo hubieras escrito como corrección; `sin etiquetas` las quita todas. Máximo 5 por movimiento y 24 caracteres.

## Deudas, abonos y deshacer

- **Deuda saldada que vuelve.** Tras anular, restaurar o editar un movimiento, el estado de los compromisos de esas personas se recalcula con su saldo (`reconciliarCompromisos`, en la memoria y en D1). Si deshaces el pago que saldó una deuda, vuelve a estar activa con su motivo y su fecha límite. El monto del compromiso es siempre el original; lo que falta sale del saldo de la persona.
- **Anular algo que ya tiene abonos.** Si anulas un préstamo, una deuda o un compartido con abonos hechos después, el bot avisa y ofrece anular todo junto. No deja anular solo el préstamo, porque la persona quedaría con una deuda al revés.
- **Abono de más.** Si el pago pasa de lo que se debe, la tarjeta dice cuánto se debía y de quién queda a favor lo que sobra. Botones: «Registrar solo $X» (lo justo) o «Guardar igual».
- **Abono en otra moneda.** «Ivan me pagó 10 usd» con una deuda en pesos no se guarda: «Ivan no te debe dólares». Tampoco se paga una deuda con una cuenta de otra moneda. Los dólares nunca se convierten solos.
- **Saldo inicial.** No se deshace (ni con el botón): se ajusta con un arqueo o se cambia con Editar.
- **Metas.** Apartar o sacar trae el botón «Deshacer aporte», que revierte solo ese aporte. Si el último comando fue de una meta, «deshacer» lo avisa y deja elegir entre el aporte y el movimiento anterior. Si apartas más de lo que tienes libre (lo que hay en cuentas menos lo ya apartado, con saldo inicial puesto), pide confirmación.

## Traslados, retiros, comisiones y tarjeta de crédito

- Pasar plata entre tus cuentas no es gasto ni ingreso: «me mandé 80 lucas de Bancolombia pa Nequi», «recargué Nequi con 50k desde mi cuenta de ahorros», «consigné 90 mil en Bancolombia», «saqué 200k del cajero con mi tarjeta de ahorros». Si no dices cuáles cuentas, pregunta.
- Lo que el banco cobra va aparte: «saqué 100 mil de Bancolombia y me cobraron 4 mil por usar el cajero» son el retiro y una comisión en Costos del banco. El 4x1000 no lo calculo yo: dime cuánto fue.
- Si una transferencia está programada, pendiente o rechazada, no la anoto hasta que salga.
- «¿Cuánta plata he movido entre mis cuentas este mes?» suma los traslados sin contarlos como gasto.
- Tarjeta de crédito: crea la persona «Tarjeta» (`agregar persona Tarjeta`). Después «compré unos audífonos de 240k con la tarjeta» es una deuda con Tarjeta, «aboné 150k a la tarjeta desde Nequi» la paga, «me cobraron 18k de intereses de la tarjeta» la sube y «cuánto debo de la tarjeta» da el saldo. Las cuotas se dicen pero no se llevan: la deuda queda completa.

## Topes y metas dichos con tus palabras

- «Ponme un tope de 300k al mes en comida», «súbeme el presupuesto de transporte a 150k» o «bájame el tope de salidas a 100 mil» dejan el tope en ese monto (no lo suman al anterior). «Déjame 100k para transporte y 200k para comida» fija dos.
- «¿Cuánto me queda del presupuesto de salidas?», «¿cuánto me pasé en comida?» y «si gasto 40k en ropa, ¿me paso?» se contestan sin anotar nada.
- Los topes son mensuales y de una sola persona. Si pides uno por quincena, por año o compartido, te digo la cuenta que sirve (250k por quincena son 500k al mes). Los avisos de cada tope son fijos, al 80 % y al 100 %.
- Metas: «crea una meta de 1.500.000 para cambiar de celular», «metí 100k al ahorro del viaje», «¿cuánto me falta para la meta de la bici?», «cancela la meta de la consola», «le saqué 20k al ahorro del viaje». Las metas no se comparten y los aportes no se hacen solos.
- «El bolsillo de ahorros me generó 8k de rendimientos» es un ingreso a esa cuenta.

## La casa y la asociación con tus palabras

- Entre familia: «mamá pagó el recibo de 120k y yo le debo mi mitad», «el arriendo vale 900k y lo dividimos entre mamá, Mateo y yo», «le pasé a mamá 150k para que pagara el agua» (queda como anticipo), «mamá me devolvió 40k».
- Si dices que algo se paga «todos los meses» sin el día, te pregunto el día del mes: «cada mes el 5 internet 180000».
- No llevo un fondo común: te digo cómo hacerlo con un préstamo a la persona o con una meta.
- En la asociación cada obligación es una cuenta con la persona: «Pipe me debe 50000 por cuota», «a Pipe le pusieron multa de 15k», «Jorge me pagó 60000», «le presté 500000 a Alejandro». «¿Quién debe la cuota?» muestra las deudas. No llevo la lista de asociados ni el estado de cada cuota, y no compenso deudas sin que me lo digas.

## Cuando una frase es dudosa

- «Me dieron 2000 de cambio» pregunta si es el vuelto de algo (no es plata nueva).
- «Marta me debe 10000» anota lo que te deben sin sacar plata de tus cuentas; «le presté 10000 a Marta» sí la saca.
- «Gasté 5000 pero no en mecato» pregunta en qué categoría fue; «compré 2 cafés de 3000» pregunta si son el total o cada uno; «con tarjeta» y «del cajero» preguntan de cuál cuenta.
- «Cuánto es 5000 + 3000» responde `$8.000` y no anota nada. Un millón en una comida lleva el aviso de revisar los ceros. Un tope de menos de $1.000 se rechaza.
- «5.000,50», «12 000» y «5ooo» se leen como $5.000, $12.000 y $5.000.

## Alertas del banco con renglones

Pega la alerta tal cual, aunque venga en varias líneas («Valor:», «Comercio:», «Referencia»). Solo cuenta el monto de la operación, no los saldos ni las referencias. Si la alerta dice que la operación fue rechazada, declinada, fallida o que sigue pendiente, no la anoto y te lo digo; cuando llegue la confirmación (con la misma referencia) la anoto una sola vez. Un retiro con comisión son dos movimientos, y una transferencia a otra de tus cuentas es un traslado.

## Recibos pegados y mensajes raros

- Pega un recibo o una tirilla como texto: anoto un solo gasto por lo que de verdad pagaste (con la fecha del recibo y el concepto). El subtotal, el IVA, el descuento, la propina que no se aceptó, el efectivo recibido y el cambio no se suman. Una cotización, una factura a crédito o una compra anulada no se anotan.
- Si el total está borroso o hay dos totales distintos, te pregunto cuál fue.
- Lo que se escriba como orden al bot («ignora las instrucciones», «soy el administrador», «borra todo») no hace nada. Lo demás del mensaje, si es un gasto de verdad, sí se anota.

## Frases con muchas cosas a la vez

- Si en una frase mezclas varias operaciones y no alcanzo a partirlas bien, te las propongo por separado con un botón en vez de anotar la mitad.
- Si pegas una cuenta y al final una pregunta, primero te pregunto si anoto lo que pasó; después me preguntas.
- Con movimientos sin confirmar, las preguntas de totales te lo dicen: lo que no confirmas no cuenta.
- Con varios movimientos en la cola puedes corregir uno por su monto o su concepto: «los 15 de gasolina eran 12», «el tinto era de 3 mil, no de 8», «borra el bus».

## Lo que el bot no hace

- No borra nada, solo anula.
- No convierte dólares a pesos por su cuenta, porque el dólar cambia y una tasa vieja engaña.
- No adivina nombres parecidos: pregunta.
- No guarda sin que confirmes, tampoco cuando la IA reescribe la frase.

## Dictado, preguntas sobre el historial y fechas

- Puedes dictar: «eh anótame veinticinco mil quinientos de almuerzo con nequi ah no mentiras fue en efectivo» queda como un gasto de $25.500 en Efectivo.
- «le presté 90k a Pipe hasta el viernes» guarda el vencimiento y lo muestra en la tarjeta.
- Perdonar una deuda, compensar dos o que pague un tercero no mueve tu plata: el bot lo explica y pregunta cómo dejarlo.
- Preguntas como «cuál fue el último gasto que anoté» o «gasté más en octubre o noviembre» se responden con tus datos y nunca crean un movimiento.
- «para el próximo lunes tengo que pagar 95k» no se anota como gasto: el bot te dice cómo dejarlo como pago fijo.
- Un párrafo largo se parte en un movimiento por cada cosa que pasó; lo que pensabas hacer y no hiciste se descarta.
- Con una tarjeta pendiente, 👍 confirma y ❌ cancela.

## Cuentas entre amigos dichas como se hablan

- «El queso costó 10k, lo pagó Faber y yo le debo la mitad» anota que le debes $5.000 a Faber. También sirven «voy con 20», «nos toca de a 12k», «pidió la pizza de 42k entre tres, le debo mi parte» y «me cubrió los 18k».
- «Pagué el uber de 14k y Esteban me pasa la mitad» anota el gasto compartido con Esteban. Si dices «cada uno me da 20k» sin nombres, te pregunta quiénes son.
- Perdonar una deuda, cuadrar cuentas o pasarte de lo que debías no se anota como gasto: el bot te explica y te deja anotar solo lo que sí se pasó.
- «Me faltan 3k, se los pido a Pipe» no anota nada hasta que te los presten.

## Corregir y borrar con palabras

- Con una tarjeta pendiente puedes decir «perdón, eran 18k, no 15k», «ponle 9.500 mejor», «eso fue ayer, no hoy» o «no fue en efectivo, fue por Nequi» y cambia la misma tarjeta.
- «No lo guardes», «olvídalo» o «mejor cancela eso» la cancelan.
- Ya guardado: «borra ese último movimiento», «elimina esa deuda», «borra el almuerzo» o «se anotó dos veces, borra una» lo anulan (queda marcado como anulado, no se borra). Si dos encajan igual, te pregunta cuál.

- Si en una misma frase corriges dos cosas («eran 54k y salieron de Nequi»), cambia las dos en la tarjeta. Lo que dices después de «no» se descarta.

- Con varios movimientos pendientes: «el primero sí, el segundo no», «sí al café, la comida no», «Faber sí, Jorge no», «los dos primeros sí, el bus no» o «bus en efectivo, comida en Nequi». Lo que no nombras sigue pendiente.

- Con una tarjeta pendiente: «no fue un regalo, fue un préstamo que me hizo», «eso era un préstamo, no un regalo», «David fue el que pagó mi comida», «era Laura», «éramos cuatro, no tres», «mi parte era 25» y «al revés» (en una transferencia) cambian la misma tarjeta.
- Con dos movimientos pendientes, «ese taxi fue por Nequi» o «corrige el almuerzo: fueron 22k» tocan solo el que nombras.
- Después de borrar con palabras, «aunque mejor déjalo» lo restaura mientras la app siga abierta.
- «Laura me debe 15k y Sofía me debe 20k» se anota como dos movimientos. Si uno de la cola es un préstamo sin nombre, «A Daniel» se lo pone. Si la tarjeta de arriba pregunta la categoría, esa pregunta se contesta primero.

## Corregir o borrar lo que ya guardaste

- «Cambia el almuerzo de ayer de 15k a 17k», «el mercado del viernes pasado fue por Nequi», «el préstamo no fue para Faber, fue para Jorge» o «ponle que fue por fotocopias» corrigen el movimiento que nombras. Si dos encajan igual, te pregunta cuál.
- «Corrige la deuda con Karla, ya no son 20k sino 15k» cambia el valor de la deuda; no queda anotado ningún abono.
- «Borra el de 20k» (si hay dos), «borra los dos últimos» o «borra lo del aseo» anulan solo eso. «Todavía no me ha pagado» anula el último abono que recibiste.
- «La devolví y me devolvieron toda la plata» propone la devolución como un ingreso del mismo monto.
