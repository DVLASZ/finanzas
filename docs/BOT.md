# Cómo hablarle al bot

El bot es el chat de la app. Escribes como hablas: el orden no importa, las tildes y las mayúsculas tampoco, y las faltas de ortografía se perdonan (`nekui` se entiende como Nequi).

La regla de oro: el mensaje tiene que traer en qué y cuánto. Con solo `mecato` o solo `10k` no guarda nada y te dice qué falta. La fecha y la hora son las de ahora (hora de Colombia), salvo que digas otra.

## Cómo funciona

1. Escribes un mensaje.
2. El bot te muestra una tarjeta con lo que entendió y tres botones: Confirmar, Editar y Cancelar.
3. Nada se guarda hasta que pulsas Confirmar.
4. Ya guardado, salen los botones Editar y Deshacer por si te equivocaste.

El bot nunca borra, solo anula. Lo anulado queda marcado y se puede ver en la app. El borrado de verdad existe únicamente en Ajustes, con PIN.

Si no entiende una frase y el servidor tiene la ayuda de la IA, la reescribe y te muestra la tarjeta igual (ver [IA.md](IA.md)).

## Cuentas

Cada app tiene sus cuentas (ver [INSTALACIONES.md](INSTALACIONES.md)). Estas son las de la plantilla personal:

| Cuenta | Cómo la nombras | Nota |
|---|---|---|
| Efectivo | `efectivo`, `cash`, `billetera`, o nada | Es la cuenta por defecto |
| Monedas | `monedas`, `sueltos` | Va aparte, no suma al disponible |
| Nequi | `nequi`, `nq`, `nekui` | |
| Daviplata | `daviplata`, `davi` | |
| ARQ | `arq`, `dollarapp` | Guarda dólares |

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

El dictado entiende los números en palabras: «cinco mil quinientos» es 5500, «ciento veinte mil trescientos» es 150000, «dos millones quinientos mil», «treinta y cinco mil». También arregla cómo suenan las cuentas («banco colombia» pasa a Bancolombia, «davi plata» a Daviplata, «neki» a Nequi). El reconocedor da varias versiones de lo que oyó y se elige la primera que el bot entiende. Si ninguna se entiende, deja la primera para que la corrijas.

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

Después de las 6 de la tarde, si hubo movimientos en la billetera y nadie la ha contado, la app pregunta: «según la app tienes X en efectivo y Y en monedas, ¿es lo que hay?». El botón «Sí, cuadra» manda el arqueo con esas cifras (queda una tarjeta por confirmar) y «No cuadra» deja escrito `arqueo efectivo ` para que pongas lo real. Aparece arriba del chat y en Saldos, no como aviso al celular.

Los botones de abajo del chat traen Ayuda, y según la app, Ventas (donde se vende) y Jornales (donde hay trabajadores). Además incluyen los mensajes que repetiste dos veces o más en los últimos 90 días (por ejemplo `mecato 2000`). Tocar uno lo manda al chat y hay que confirmarlo como siempre.

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
cambio 32000 nequi a arq 8 usd
```

El último es un cambio de moneda: la tarjeta muestra a cuánto salió el dólar esa vez.

## Personas, préstamos y deudas

```
presté 40k a ivan nequi
ivan me pagó 40k nequi
le debo 54k a sergio por la bicicleta antes del 31 de octubre
pagué 54k a sergio nequi
sergio me prestó 20k
```

Cada persona tiene un saldo neto contigo. Si te debía y luego paga algo por ti, se compensa. `deudas` muestra lo que debes (con motivo y fecha límite) y lo que te deben.

Las personas se identifican por el nombre completo que uses. Si escribes un nombre suelto que se parece a varios, el bot pregunta cuál. Si lo escribes con un error de tipeo ("danyel" cuando existe Daniel), también pregunta y no adivina.

Cuando aparece un nombre nuevo, el bot pregunta de qué grupo es (en la app familiar: los de la casa, familia, trabajadores, etc.) y después qué fue el movimiento: le pagué, le presté, le vendí, me pagó, me prestó, le regalé o fue gasto mío.

Si dices para qué fue un préstamo (`presté 52000 para cámara`), lo que sigue a "para" es el motivo, no una persona. El bot pregunta a quién se lo prestaste.

Los regalos van como gasto en Regalos: `le regalé 50000 a Jorge`.

Una persona puede tener una categoría fija (config `categoria_persona`, JSON `{"per:julio": "cat:hijo"}`). Con ella, `Giro Julio 150k Bancolombia` queda directo como gasto en esa categoría, con el nombre en el concepto y sin preguntar nada. Nequi, Daviplata y otros medios de pago nunca se toman por una persona, aunque la app no tenga esa cuenta.

## Plata que te mandan para pagar algo de otra persona

Si un familiar te consigna para pagar algo suyo, eso no es ingreso tuyo ni gasto tuyo. Se dice con estas frases y usa la deuda de siempre:

```
plata de mamá para cooperativa 150000 nequi
cooperativa 149984 con plata de mamá nequi
```

La primera anota lo que ella te mandó (en Deudas sale con el motivo). La segunda anota el pago como un pago a ella. Si sobran unos pesos, quedan como lo que le debes. Si la cantidad es pequeña y no se va a devolver, se cuadra con un arqueo de la cuenta.

## Gastos compartidos

```
pizza 9000 pagué por ivan 3000 y daniel 2500
pizza 9000 pagué por ivan y daniel
pizza 9000 entre ivan, daniel y yo
ivan me pagó el almuerzo 6000
```

En el primero tu parte es $3.500 y ellos te deben las suyas. En el segundo se divide en partes iguales entre los tres. El tercero dice lo mismo con otras palabras: funciona cuando tú estás en la lista («yo»).

## Eventos

Agrega `#cumple-daniel` a cualquier mensaje. Para ver todo lo de ese evento, escribe solo `#cumple-daniel`.

## Saldo inicial y cuadre

```
saldo inicial efectivo 85000 nequi 150000 monedas 12000
arqueo efectivo 80000 nequi 150000 monedas 11500
```

En la app que tiene alcancía también se puede decir su saldo (`alcancia 250000`). El saldo inicial fija desde cuándo se calculan los saldos. No es un ingreso. Lo que haya antes (el historial del Excel, por ejemplo) cuenta para los reportes de gasto pero no toca los saldos.

El arqueo es contar lo que tienes de verdad. El bot compara con lo que calcula y guarda la diferencia como Descuadre.

## Varias cosas en un mensaje

Puedes escribir varios movimientos juntos. Se separan con un salto de línea, un punto y coma, o un + o un - con espacios entre dos cantidades.

```
mecato 5000
almuerzo 12000

150000 Ana + 500000 Ana - 75000 llanta
```

El bot los muestra uno por uno, cada uno con su tarjeta ("Movimiento 2 de 3"). Lo que sigue a un + se toma como plata que entra. Si pulsas Cancelar en uno, sigue con el siguiente. Una parte que no entiende la avisa y pasa a la que sigue. El máximo es 10 por mensaje.

## Ventas

Solo en las apps con catálogo (la de empresa). El bot calcula el total con los precios del catálogo.

```
vendí 3 botellas de jugo
15 galletas a granel Marta
vendí 2 paquetes de 10 a 7 mil
```

Con un cliente conocido pregunta si pagó o se lo fiaste. Fiado deja la deuda del cliente y no entra plata a la caja. El precio dicho (`a 7 mil`) gana sobre el del catálogo. El catálogo se edita en Más, Productos y precios.

Para ver lo vendido por producto: `ventas` (del mes), `ventas semana` o `ventas del año`. Muestra el total y cuánto aportó cada producto; en el año, además, lo vendido mes por mes.

## Gastos que se repiten

Para lo que pagas todos los meses (arriendo, internet, Cooperativa). No lo registra solo: te avisa y tú lo anotas.

```
cada mes el 5 internet 60000
recurrentes
```

El día va de 1 a 28. Desde dos días antes del día, y hasta que escribas ese gasto en el mes, la app te muestra el aviso y el celular te avisa por la mañana. Cuando lo anotas (`internet 60000`), el aviso se va hasta el mes siguiente. Para quitar uno: `quitar recurrente internet`.

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

Crea la categoría Restaurante dentro de Comida. Lo que anotes en Restaurante suma también en Comida: el resumen muestra Comida con lo de adentro desglosado, y `cuánto llevo en comida` cuenta todo. Solo hay un nivel. También se crean y se mueven en Más, Categorías y personas.

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

La plata pasa de Monedas a Alcancía (o al revés al sacar). La alcancía sale aparte en Saldos y no suma al disponible.

## Plata en otras cuentas

Solo en la empresa. Es la plata del negocio que está en cuentas personales de los socios. Se le pasa con `cambio 100000 efectivo a personal` y sí suma al disponible.

## Consultas y comandos

| Escribes | Muestra |
|---|---|
| `saldo` | Saldos por cuenta, disponible, monedas aparte, lo que te deben y debes |
| `semana`, `mes`, `año` | Gastos por categoría, ingresos y balance, y topes |
| `deudas` | Lo que debes y lo que te deben |
| `ventas`, `ventas semana`, `ventas del año` | Lo vendido por producto (apps con catálogo) |
| `últimos` | Los últimos movimientos |
| `cuánto llevo en mecato` | Lo de la semana y el mes en esa categoría |
| `tope mecato 60000` | Fija un tope mensual. El bot avisa al 80 % y al 100 % |
| `quitar tope mecato` | Quita el tope |

Para que lo que sobró de un tope el mes pasado se sume al de este mes, se pone la config `tope_arrastra` en `1` (en el `.json` de la instalación y `npm run instalar -- actualizar <nombre>`).

| Escribes | Muestra |
|---|---|
| `deshacer` | Anula el último movimiento |
| `deshacer 3` | Anula los últimos 3 movimientos (hasta 10) |
| `editar último` | Reabre el último movimiento para corregirlo |
| `ayuda` | Ejemplos sencillos con las cuentas de esa app |

Saldos, deudas y resúmenes también tienen su pantalla en la app. Desde el chat solo hace falta el botón Ayuda.

## Fechas

`ayer`, `anteayer`, `hoy`, `el lunes`, `el lunes pasado`, `hace 3 días`, `15/10`, `el 2 de octubre`, `a las 3pm`, `4 pm`, `4:30pm`. Un pago mixto sin total (`taxi 6000 billete y 1800 monedas`) cuesta la suma, $7.800. La hora puede ir sola (`almuerzo 12000 1 pm`) o con el día (`ayer 4 pm`). Con `a las 4` sin am ni pm toma la tarde. Una fecha que no existe se rechaza.

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

## Lo que el bot no hace

- No borra nada, solo anula.
- No convierte dólares a pesos por su cuenta, porque el dólar cambia y una tasa vieja engaña.
- No adivina nombres parecidos: pregunta.
- No guarda sin que confirmes, tampoco cuando la IA reescribe la frase.
