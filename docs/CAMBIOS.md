[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Cambios

Lo publicado, de lo más nuevo a lo más viejo. Las fechas son las de la publicación.

## 2026-11-27

- Cierre del día: `npm run e2e` y `npm run e2e:celular` pasan completos en el Galaxy conectado (incluye la prueba de topes y categorías); `salud` en bien en las tres apps; personal y mama revisadas en Chrome con la ayuda nueva y sin errores en consola. La base de la asociación sigue sin movimientos.
- Ronda 8, parte 2: la batería llega a 1.100 casos. Nueva capa `typosMovil.ts` para el teclado del celular: palabras pegadas («gaste15mil»), autocorrector («neki», «targeta», «resivo»), dudas que se preguntan («mkl», «mecsto», «quitas», «una playa de 50k») y plata en custodia como deuda. «Playa» nunca se cambia por «plata».

- Ronda 8, parte 1: la batería llega a 1.050 casos. Las dudas de uso («cómo lo anoto», «dónde veo», «puedo pegar...») se explican sin anotar nada, aunque traigan montos; hay temas nuevos de ayuda para custodia, cuotas, reversos, deudas, transferencias, casa y asociación, exportar y facturas sin pagar.

- `instalar actualizar --con-tarjeta` agrega la persona «Tarjeta» sin duplicar ni pisar nada.

- La prueba de pantalla cubre pausar y reanudar un tope, pasar movimientos de categoría y archivarla (también en el celular).
- La ayuda guiada explica traslados y retiros con comisión, la tarjeta de crédito y el pegado de alertas y recibos; la guía de usuario lo recoge con ejemplos.
- `instalar actualizar` acepta `--ver` (muestra el SQL sin tocar la base) y `--sin-config` (no pone la config del `.json`).
- La batería llega a 1.000 casos y todos pasan (ronda 7, parte 3).
- Varias operaciones enredadas en una frase se proponen por separado con un botón; una cuenta seguida de una pregunta pregunta si anota primero lo que pasó.
- Cola: corregir por monto o concepto («los 15 de gasolina eran 12»); las preguntas de totales avisan lo que está sin confirmar.

- Recibos y tirillas pegados como texto: un solo gasto por lo pagado, con la fecha del recibo; cotizaciones, facturas a crédito y compras anuladas no se anotan.
- Entradas hostiles: se quitan invisibles, HTML, SQL, JSON y órdenes al bot antes de leer el mensaje (`sanitizar.ts`); un permiso inventado no cambia nada.
- Alertas del banco: pago mínimo de tarjeta, abono de nómina, pago de factura, avisos de cupo y comprobantes de envío y recepción.

- Alertas del banco con renglones rotulados (Bancolombia, Nequi, Daviplata, Banco de Bogotá): se ignoran saldos, referencias y dígitos de tarjeta; lo rechazado o pendiente no se anota; la misma referencia no se anota dos veces.
- Dictado por voz: «cinco mil coma cincuenta» pregunta, «diez mil en la cena y cinco en el parqueadero» son dos, «a Karla, perdón, a Diana» se queda con Diana.


- Topes que se pausan y se reanudan (`pausar tope comida`, botón «Pausar tope»): el monto queda guardado y mientras está en pausa no avisa ni cuenta.
- Categorías con movimientos: «Pasar movimientos» a otra categoría y «Archivar categoría» con el conteo de lo que tiene.
- Se actualizaron las dependencias con `npm audit fix` (quedan dos avisos moderados de `uuid` dentro de `exceljs`) y se quitó un script suelto de desarrollo.

- Cierre de la auditoría 8.x: «me dieron 2000 de cambio», «llegaron 1000 galletas», «Marta me debe 10000» (sin sacar plata), «pero no en mecato», «con tarjeta», «del cajero», «2 cafés de 3000», «5.000,50», «12 000», «5ooo», «cuánto es 5000 + 3000», nombres en minúscula, «con Ana y Luis», «10/15», «tope comida 1» y los temas de ayuda de vender y guardar plata.
- La IA ya no puede repetir frases ni partir un monto.

- La casa y la asociación con palabras de todos los días (`hogarAsociacion.ts`): deudas entre familia, anticipos, multas y cuotas como cuentas por cobrar, préstamos del fondo, intereses aparte del capital.
- Un pago fijo dicho sin el día del mes pregunta el día.

- Topes y metas con palabras de todos los días (`topesHablados.ts`): fijar, subir, bajar, quitar, consultar, simular y cambiar el objetivo de una meta. Lo que no existe (topes por quincena o año, metas compartidas) se explica.
- `125 mil quinientos` y `8 mil 500` se leen como un solo monto.
- Los rendimientos de una cuenta de ahorros entran como ingreso.

- Traslados entre cuentas propias, retiros y consignaciones con sus comisiones y el 4x1000 (`traslados.ts`).
- Tarjeta de crédito con la persona `Tarjeta`: compra, abono, intereses, avance y saldo.
- `cuánta plata he movido entre mis cuentas` suma los traslados aparte de gastos e ingresos.
- La batería llega a 730 casos y todos pasan.

- `Laura me debe 15k y Sofía me debe 20k` y `debo 10k a Faber y 15k a Jorge` se parten en un movimiento por persona.
- `A Daniel` completa el préstamo de la cola que no tenía nombre.
- Varias órdenes sobre la cola (`Laura sí, Sofía sí`, `Comida y pan sí`) guardan de arriba hacia abajo hasta la primera tarjeta con una pregunta abierta.
- La batería de seguridad y de conversación llega a 670 casos y todos pasan; no queda ninguno pendiente.


- Corregir lo ya guardado con palabras: `cambia el almuerzo de ayer de 15k a 17k`, `el mercado del viernes pasado fue por Nequi`, `corrige la deuda con Karla, ya no son 20k sino 15k` (la deuda cambia, no se anota ningún abono).
- `borra el de 20k` con dos iguales pregunta cuál; `borra los dos últimos`, `borra lo del aseo` y `todavía no me ha pagado` anulan solo lo que dices.
- `la devolví y me devolvieron toda la plata` propone la devolución como ingreso del mismo monto.


- Con una tarjeta pendiente puedes decir `no fue un regalo, fue un préstamo que me hizo`, `David fue el que pagó mi comida`, `era Laura`, `éramos cuatro, no tres`, `mi parte era 25` o `al revés` y cambia la misma tarjeta.
- Con dos movimientos pendientes, `ese taxi fue por Nequi` o `corrige el almuerzo: fueron 22k` tocan solo ese.
- `aunque mejor déjalo` restaura lo que acabas de borrar con palabras.
- `David` ya no se confunde con la cuenta Daviplata, y `me pagó Jorge los 50k` es un ingreso.

## 2026-11-26


- Con varios movimientos pendientes puedes decir `el primero sí, el segundo no`, `sí al café, la comida no`, `Faber sí, Jorge no` o `bus en efectivo, comida en Nequi`.


- Una corrección con varias cosas se aplica por trozos: `eran 54k y salieron de Nequi`, `déjalo en 10, que ella me descontó dos`, `ponlo como Salidas, fue comiendo con los parceros`.
- `no lo guardes, me equivoqué antes de confirmar` y `ahora sí, borra ese gasto` cancelan la tarjeta pendiente.


- Revisión de seguridad OWASP Top 10:2025 (docs/SEGURIDAD-OWASP-2025.md).
- Los avisos al celular solo salen hacia los servicios de avisos de los navegadores; el buzón solo llama a https públicos; ningún `fetch` con clave sigue redirecciones.
- La clave del buzón tiene el mismo freno de fuerza bruta que el token y los intentos fallidos quedan en el registro.
- El servidor revisa ids, fechas, montos, largos y cantidad de asientos, y rechaza cuerpos de más de 2 MB.
- Las respuestas de la API llevan `Cache-Control: no-store`; el CSV neutraliza también las celdas que empiezan por tabulación.


- Las correcciones dichas con más palabras cambian la tarjeta pendiente: `perdón, eran 18k, no 15k`, `ponle 9.500 mejor`, `eso fue ayer, no hoy`.
- `no lo guardes`, `olvídalo, al final no compré nada` y `mejor cancela eso` cancelan la tarjeta pendiente.
- `borra ese último movimiento`, `elimina esa deuda` o `borra el almuerzo` anulan lo ya guardado; si hay dos iguales, pregunta cuál.


- Cuentas entre amigos dichas como se hablan: `lo pagó Faber y yo le debo la mitad`, `pagué el uber de 14k y Esteban me pasa la mitad`, `voy con 20`, `nos toca de a 12k`.
- Perdonar, cuadrar o pagar de más una deuda no se anota como gasto: el bot explica y ofrece solo lo que sí se pasó.
- `me faltan 3k, se los pido a Pipe` no anota nada.


- El bot entiende dictado por voz con muletillas, números en letras y correcciones («ah no mentiras fue en efectivo»).
- El préstamo guarda su vencimiento (`le presté 90k a Pipe hasta el viernes`).
- Condonaciones, compensaciones y pagos de terceros no inventan gastos ni ingresos.
- Preguntas sobre el historial se responden con datos (último gasto, promedio, comparar meses).
- Fechas como `anteanoche` o `el último día del mes pasado`; las obligaciones futuras no se anotan como gasto.
- Los párrafos largos se parten en un movimiento por evento.
- Montos con decimales raros o enormes preguntan; 👍 confirma y ❌ cancela.

## 2026-11-24


- Segunda ronda de pruebas difíciles del bot (123 casos nuevos, 272 en total, ver [BATERIA-RED-TEAM.md](BATERIA-RED-TEAM.md)). Con una tarjeta pendiente puedes aclarar como hablas («mentiras fue en nequi», «eran 21 mil», «era con Paula, no Laura», «no, fue un regalo») y la tarjeta se corrige en el sitio. En una lista de movimientos puedes decir «el segundo fue 8000», «quita el del taxi» o «confirma los otros». «Corrige, fueron 87000» edita lo último que guardaste.
- Entiende más jerga colombiana («poner la liga», «me fían», «apúnteme», «le solté», «180 barras») y pregunta cuando una frase no dice quién pagó a quién. La categoría la decide el para qué y no el lugar: un regalo comprado en el supermercado va a Regalos y el uber a la universidad a Transporte.
- Hace cuentas compuestas: propina, IVA, descuentos sucesivos, 3x2, precio por kilo o litro y repartos. Una notificación pegada de Nequi, Daviplata o Bancolombia se anota con el monto de la operación, no con el saldo, y cualquier instrucción escondida en el texto se ignora.
- Los pagos fijos se pueden pausar para más adelante («pausa claude desde el próximo mes»). Con «aprende que "pastilla" es salud» le enseñas una categoría; rechaza palabras genéricas como «pago» o «hoy». Una etiqueta con comando (#deshacer) nunca lo ejecuta.
- «Almuerzo 12000 nequi daviplata» y «mercado 50k efectivo nequi» ya no se toman como una transferencia: el bot pregunta «¿Pagaste con Nequi o con Daviplata?» con un botón por cuenta. Con verbo («pasé 12000 de nequi a daviplata») o sin concepto («nequi a daviplata 12000») sigue siendo transferencia. La batería de pruebas del bot pasó a 149 casos.
- El bot aguanta mucho mejor la letra torpe y la forma de hablar de todos los días, probado con una batería de 147 frases difíciles ([BATERIA-RED-TEAM.md](BATERIA-RED-TEAM.md)). Corrige errores de escritura (gsate, almurzo, neqi, trnsferensia), entiende «3 polas a 4500 cada una», «dos millones y medio» y «12 barras», no anota lo que no pasó («no gasté», «iba a gastar», «todavía no llegan»), pregunta cuando hay dos montos dudosos o un rango, y no confunde un ingreso con un gasto («Recibiste 20.000 de ANA MARIA», «vendí la bici»).
- Con una tarjeta pendiente, «ok» la confirma, «no» y «borra» la cancelan sin tocar lo ya guardado, «gracias» la deja como está, y un gasto nuevo no la reemplaza en silencio: el bot pregunta si se guarda o se descarta. Un mensaje con más de 10 movimientos ya no pierde los sobrantes sin avisar. «Pagué 20k con nequi y 10k en efectivo» son dos gastos, y la IA no puede inventar préstamos, deudas ni transferencias que no dijiste.
- Chat: el hilo ya no se arrastra hacia los lados. Se corrigieron dos casos con letra extra grande que cortaban el borde de una tarjeta: el botón largo de "Pasar ... de Efectivo a Nequi" (ahora baja de línea) y la fila "Quedó en ..." del aviso de guardado.
- La ayuda del chat también entiende «como meto plata que me entro» y «donde anoto un pago que me hicieron por un trabajo», y ofrece ejemplos de ingreso que se tocan: «ingreso 50000 actividad» y «me pagaron 80k congreso nequi».
- La ayuda del chat entiende mejor las preguntas de todos los días sobre plata que entra: «como registro una plata que me ingresa como pago de una actividad», «cuando me paguen la quincena como lo anoto» o «como registro un pago que me hicieron» responden con el tema de ingresos. «Como saco el total del mes» lleva a los saldos y no al cajero.
- Radiografía técnica del intérprete de lenguaje natural, con el orden real de las reglas y una lista de puntos débiles para pruebas de estrés: [ARQUITECTURA-BOT.md](ARQUITECTURA-BOT.md).
- La guía de usuario también existe como página interactiva de un solo archivo, [GUIA-USUARIO.html](GUIA-USUARIO.html): tiene índice, botón para volver arriba, un espacio para el enlace y la clave de acceso, botones para copiar cada frase del chat y 15 capturas reales incrustadas (hechas con datos inventados). Se genera con `npm run capturas:guia` y `npm run guia:html`.
- El chat responde las preguntas de uso en la conversación: «cómo anoto un gasto», «cómo agrego una persona», «cómo pauso un pago fijo», «para qué sirve esto» ya no se cobran como un gasto sin monto ni se ofrecen para la lista de compras. Traen una explicación corta y botones con ejemplos que dejan la frase escrita. Cuando falta el monto de un gasto, el mensaje ahora empieza con «¡Casi!» y pregunta cuánto fue.
- Guía de usuario paso a paso para quien va a instalar y probar la app: [GUIA-USUARIO.md](GUIA-USUARIO.md).
- Pagos fijos con ciclo completo: al abrir uno se puede editar (monto, frecuencia, día, cuenta, categoría), pausar y reanudar, programar una fecha de fin y eliminar (los movimientos anotados se conservan). Un pago pausado o terminado deja de contar en Falta por pagar, Próximos 30 días, el seguro y los avisos, y sale en la sección Pausados y terminados. Por chat: «pausar recurrente claude», «reanudar recurrente claude», «fin recurrente claude 21/12/2026».
- Personas: se crean con «agregar persona Sofia» (o desde Más, Categorías y personas, o con «+ Nueva persona» en el filtro de Movimientos). Cada persona tiene una ficha con su saldo, sus deudas y su historial, y se archiva si no debe nada (la lista de archivadas se guarda en la clave de config «archivadas»; también vale para categorías). Escribir solo su nombre en el chat muestra su estado con botones para préstamo, compartido y abono.
- Alcancías: editar nombre, monto y fecha, pausar y reanudar, deshacer un aporte concreto y sacar todo. Una meta pausada no cuenta en lo apartado.
- Etiquetas: renombrar, fusionar y quitar de todos los movimientos, y una lista con todas. Reglas aprendidas: pausar y cambiar la palabra. Botones rápidos: ocultar uno sin borrarlo.
- Movimientos: un anulado se puede restaurar desde su detalle, y la ventana de Ver anulados se actualiza sola.
- Resumen y Saldos: el calor del mes, las barras de meses, el flujo del mes, la curva de saldo y las barras de Movimientos abren la ventana con los movimientos del día o del mes que tocas.
- La guía «Pregúntale cómo decirlo» entiende preguntas completas («cómo pauso un pago fijo», «cómo hago un abono parcial») por raíces de palabras y trae temas nuevos: personas, pausar o cancelar un pago fijo, abono parcial, etiquetas y subcategorías, comprobantes, topes y corregir o eliminar. Cada ejemplo se toca y queda escrito en el chat.
- Resumen tiene los mismos filtros que Movimientos: Todo, Semana, Mes, Año y Fechas. Las gráficas siguen el periodo que miras: en Semana salen los siete días y la comparación con la semana anterior, en Mes el flujo, el calor del mes y los topes, en Año la evolución de enero a diciembre con los topes del año, y en Todo el histórico. Un periodo sin movimientos muestra un aviso en vez de gráficas de otros meses.
- Resumen ya no repite la tarjeta Por categoría (están la dona, que ahora abre los movimientos de cada categoría al tocarla, y Metas y topes). El comparador de dos fechas pasó a un botón que abre una ventana flotante.
- Movimientos: cada día tiene un encabezado marcado con lo gastado o ingresado ese día, las etiquetas son un desplegable con su contador y ya no existe Mostrar anulados. Los anulados se ven en Más, Revisión del mes, Ver anulados, en una ventana flotante.
- Privacidad: la escala de letra (85, 100, 115 y 130 %) ya no se vuelve puntos. Los controles de la interfaz quedan fuera de la máscara con el atributo data-sin-mascara. En el chat, el ojo hace el mismo barrido sobre las burbujas y las tarjetas.
- Pagos fijos: un movimiento cubre el pago fijo si nombra su palabra distintiva («claude» para «Suscripción Claude»), sin importar el monto. Próximos 30 días cuenta hoy y los 29 siguientes, y si un solo pago fijo pesa en una cuenta dice cuál es y qué día cae.

- Etiquetas: puedes escribir uno o varios #hashtags en cualquier frase del chat (#viaje, #claude, #universidad) sin que cambie la categoría ni el concepto. En Movimientos se filtran por etiqueta y cada fila las muestra como chips, y Resumen tiene una tarjeta con lo gastado por etiqueta que abre sus movimientos. Hasta 5 por movimiento.
- Reglas aprendidas: si cambias la cuenta o la categoría de un movimiento de hoy, la app ofrece guardarlo como regla («la próxima vez que escriba Laura, usar Nequi»). Las reglas se editan y se borran en Ajustes, y una cuenta o categoría escrita en la frase siempre gana.
- Dos gráficas nuevas en Resumen: gasto por día de la semana (cada barra abre sus movimientos) y un comparador de dos rangos de fechas elegidos por ti. El reporte PDF del periodo sale por el diálogo de impresión del teléfono, con una hoja limpia en blanco y negro.
- Obsidiana: las tarjetas del chat y las alertas tienen la misma doble tarjeta dorada y el destello diagonal que Saldos y Resumen.
- Los periodos tienen una píldora que se desliza hasta la opción activa, bordes con el color del tema y un destello al activar. El contenido entra por el lado según vayas a Siguiente o a Anterior.
- Saldos, Movimientos, Resumen y Más entran en cascada, una tarjeta tras otra.
- El botón del ojo gira al tocarlo y las cifras se aclaran con un barrido de color. Se vuelve translúcido mientras haces scroll para no tapar montos.
- El campo del chat crece hasta cuatro líneas, para dictados largos y alertas pegadas. Enter envía y Shift más Enter baja de línea.
- Los porcentajes de variación ya no se parten con letra extra grande, y se corrigieron dos desbordes del comparador y del día de la semana.

## 2026-11-23


- Obsidiana es ahora el tema de una instalación nueva (quien ya eligió otro lo conserva). Sus tarjetas llevan detrás una segunda tarjeta corrida en dorado champán, como la de Kinetix pero en oro, con un filete de 1 px, botones y cifras clave en dorado luminoso y un destello que pasa una vez cuando una tarjeta aparece. Los íconos de categoría siguen con su brillo de color.
- El tamaño de letra tiene cuatro niveles en Ajustes: Compacta 85 %, Normal 100 %, Grande 115 % y Extra grande 130 %. Se revisaron los seis temas, claro y oscuro, a 393 y a 360 px.
- Ya no se parten palabras en las tarjetas pequeñas (Ingresos, Gastos, Balance). Las barras de Dónde se concentra, Por categoría y el ranking pasaron a dos filas: el nombre y el monto arriba y la barra debajo, a todo el ancho, así que no se aplastan al subir la letra.
- Se puede tocar casi todo lo informativo. Gastos, Ingresos, Balance, Disponible, Seguro para hoy, Salud patrimonial, Por cobrar y Por pagar, cada alerta, las alcancías, los pagos fijos y las deudas abren una ventana con lo que los compone. En "Contra el periodo anterior", tocar una categoría compara sus movimientos de este periodo con los del anterior.
- Tres gráficas nuevas en Resumen: el ritmo de gasto del mes contra los topes o contra el mes anterior (con proyección y zona segura o de alerta, tocable día por día), las últimas seis semanas de ingresos contra gastos, y el avance de las metas y de los topes. Las barras crecen al aparecer y la línea se dibuja.
- Arreglos de la revisión: la zona del ritmo compara solo las categorías con tope, las tarjetas tocables ya no esconden su cifra a los lectores de pantalla y la ventana de una alerta sigue la privacidad.

## 2026-11-22


- Arreglo: en "Editar movimiento", los selectores de cuenta (Entró a, Sale de, Pagado con) abrían por debajo de la hoja de edición y no dejaban guardar. Ahora cualquier selector que se abre desde una hoja queda por encima de ella. Hay una prueba que cambia la cuenta de un gasto y guarda.
- El ojo de privacidad ahora es un botón flotante, fijo encima de la barra de abajo, en Saldos, Movimientos y Resumen. Ya no ocupa una fila arriba. La app arranca siempre con los montos escondidos, y vuelven a esconderse solos cuando se minimiza, se cambia de pestaña o se apaga la pantalla. Al alternar sale una onda desde el botón y las tarjetas se enfocan una tras otra. La elección ya no se recuerda.
- Cada tema tiene su trama de fondo, en la capa que antes solo usaba Kinetix: Obsidiana micropuntos champán casi invisibles, Midnight puntos finos de cian, Tierra un tejido de papel, Esmeralda curvas de nivel, Bordeaux líneas de cuaderno con margen y Kinetix su retícula, ahora con el color del tema. En Obsidiana los íconos de categoría vuelven a tener color, como joyas luminosas con un filete y un resplandor del mismo tono.
- Casi todo lo que muestra una cifra se puede tocar y abre una ventana flotante con lo que hay detrás. En Resumen: las filas de gastos hormiga, del ranking de conceptos, de Por categoría y de Con qué pagas abren los movimientos que las forman, y las dos tarjetas "contra el periodo anterior" abren la comparación categoría por categoría. En Saldos: cada cuenta muestra sus últimos movimientos y atajos para cuadrar el saldo o pasar plata desde o hacia ella, y Próximos 30 días lista los pagos fijos que entraron en la cuenta. En Deudas: cada persona abre sus movimientos y el botón para registrar el pago. Tocar un movimiento dentro de una ventana abre su detalle encima, con Editar, Duplicar y Anular. Las ventanas se cierran con atrás, de a una.
- Más movimiento: las alertas urgentes y de aviso laten con un anillo, las hojas apiladas se encogen con resorte cuando se abre otra encima y todo lo que se toca rebota al presionar.

## 2026-11-21


- Se quitó la barra de arriba ("Mis finanzas"). Todas las pantallas ganan alto, sobre todo el Chat con letra grande. El claro y oscuro queda solo en Ajustes, junto a los temas. El ojo de privacidad está en Saldos y en Resumen, y en Ajustes hay un interruptor con lo mismo. El estado de sincronización pasó a Ajustes; arriba solo sale una píldora cuando pasa algo real (sin internet, cambios sin enviar, sincronizando).
- El aviso de "Movimiento guardado / Deshacer" ya no tapa la caja de escribir: sale arriba, como una píldora que baja con rebote, respeta la muesca del celular y se cierra con la equis o deslizándola hacia arriba.
- Movimiento en toda la app, solo con `transform` y `opacity` y apagado con "reducir movimiento": la píldora de la barra de abajo ya viajaba con resorte y ahora el ícono activo da un salto; las pantallas entran deslizándose hacia el lado al que vas; el micrófono lanza dos ondas mientras escucha; los botones, chips, tarjetas y filas se comprimen al tocarlos y vuelven con rebote; los botones principales sueltan un destello al pulsar; las barras de progreso tienen un brillo al llenarse; el mapa de calor aparece en ola diagonal; el marcador de la gráfica de flujo sigue al dedo sin saltos; los dígitos del contador de billetes saltan; las hojas y diálogos suben con resorte y el fondo se difumina; el interruptor se estira al tocarlo; la tarjeta del tema elegido hace un pulso; y al cambiar de tema o de privacidad los colores y las cifras pasan con un fundido corto.
- Quedó fuera el campo de texto de varias líneas del Chat: sigue siendo de una línea, para que Enter envíe como siempre.

## 2026-11-20


- Los temas bajan de catorce a seis, porque muchos se veían casi iguales (cuatro azules, cuatro cafés, dos negros). Quedan Obsidiana, Midnight, Tierra, Esmeralda, Bordeaux y Kinetix, cada uno en claro y en oscuro.
- Cada tema tiene ahora su propia forma, no solo su color. Obsidiana es negro puro sin adorno, con filetes de 1 px y radios de 14 px. Midnight es vidrio con más desenfoque y una aurora azul e índigo (18 px). Tierra es papel: superficies mate, sombras cálidas y esquinas de 22 px. Esmeralda lleva una tira de acento en el borde de cada tarjeta. Bordeaux es editorial, con titulares en serifa y superficies contrastadas. Kinetix es angular, con radios de 10 px, bordes de 2 px, sombras duras y una rejilla de fondo.
- Quien tenía guardado un tema que se fue pasa solo al más parecido: Libro, Océano, Zafiro Real y Abyss a Midnight; Mocha Silk a Tierra; Veltro a Esmeralda; Aether a Kinetix; Onyx Solar a Obsidiana; Atardecer a Bordeaux. La instalación personal pasó de `libro` a `midnight` como tema de fábrica.
- El selector de Ajustes queda en 2 columnas y 3 filas, y la vista previa de cada tema ya trae el radio de esquina del tema.
- `npm run e2e:letra` revisa por defecto los seis temas, en claro y en oscuro, al 130 %. `npm run e2e` comprueba la migración de los temas que se fueron.

## 2026-11-19


- El bot entiende mucho más cómo habla la gente. Una capa de lenguaje natural (`packages/core/src/lenguaje.ts`, sin internet) lee gastos compartidos («fui a comer con Ana y Luis, pagué 60k por los 3», «a medias», «hicimos vaca», «pagué 50k, 30k míos y 20k de Ana», «éramos 3»), dinero dicho de otras formas («sesenta mil», «quince quinientos», «30 lucas», «un palo») y verbos como «me giraron», «me fiaron», «quedé debiendo», «Luis me debe», «saqué del cajero» y «pasé de Nequi a efectivo». Lo que puede significar dos cosas ahora pregunta con botones en vez de adivinar. Detalle en BOT.md.
- La Ayuda tiene «Pregúntale cómo decirlo»: escribes tu duda y te da el ejemplo exacto con tus cuentas y un botón que lo deja escrito en el chat.
- La IA recibe instrucciones más completas y prefiere no responder antes que inventar un reparto o una cuenta.
- Tema 14, Zafiro Real: cobalto, azul real y cian eléctrico (60-30-10), en oscuro y claro. El selector de Ajustes queda en 2 columnas y 7 filas.
- Resumen con tres gráficas nuevas: el flujo del mes (línea suave con el balance acumulado, que se toca para ver cada día), el ranking de los conceptos que más plata se llevan y un anillo de con qué pagas (efectivo contra digital). Con la privacidad activa las cifras salen ocultas y sin animaciones si el sistema las pide apagadas.
- En el detalle de un gasto compartido, «Ver cómo se reparte» despliega tu gasto real y lo que debe cada persona.
- Pruebas nuevas: `frases-naturales.test.ts` (43 frases difíciles), `ayuda-guiada.test.ts`, `graficas.test.ts` y cinco recorridos más en `e2e`.

- Los temas se rehicieron con la regla 60-30-10 (60 % fondo, 30 % tarjetas y estructura, 10 % acento). El modo claro ya no es el mismo blanco en todos: Tierra claro es arena con terracota, Fintech claro es gris hielo con pizarra, Esmeralda, Océano y Atardecer tienen su propio ambiente, y Obsidiana conserva el negro puro también en Saldos, sin degradado pálido.
- Siete temas nuevos, cada uno en oscuro y en claro: Veltro (crema, abeto y rojo tomate), Aether (ciruela, titanio y ámbar), Kinetix (índigo, lavanda y verde voltio), Abyss (azul abisal, cian y rosa neón), Mocha Silk (crema seda, mocha y azul cielo), Onyx Solar (negro esmeralda, oro e índigo) y Bordeaux Sage (burdeos, rosa polvo y salvia).
- El selector de Ajustes muestra en cada tema una píldora con sus proporciones reales 60-30-10, y el modo (claro, oscuro o automático) se elige aparte.
- Los colores salen de `scripts/paletas.mjs` (`npm run paletas`), que ajusta solo lo necesario para llegar a AA. El acento tiene ahora dos versiones: el relleno (`--marca`) y el que sirve como texto (`--marca-tx`). La tarjeta grande de Saldos pasó de un degradado de acento a una superficie con un tinte suave; el acento queda para el gráfico y la pestaña de días.
- `npm run contraste` lee todos los temas del CSS (ya no hay una lista aparte) y revisa también la tarjeta grande de Saldos.

## 2026-11-18


- Tema nuevo, Obsidiana, pensado para pantallas AMOLED: fondo negro puro sin aurora ni brillos, tarjetas en negro carbón con un filete de 1 px, texto marfil y platino, y color solo en las cifras y los estados (esmeralda para lo que entra, coral sobrio para lo que sale, champán en las acciones principales). Los íconos de categoría pierden el color. Tiene su versión clara en marfil. El texto principal llega a contraste AAA en el oscuro, y pasa `npm run contraste` y la revisión de letra grande en las tres variantes.
- Revisión completa de la documentación: arquitectura (módulos y operaciones nuevas), modelo de datos (claves de configuración, metas con fecha, stock mínimo), despliegue (cabeceras en `_headers`), celular, pendientes y límites conocidos, `SECURITY.md` y los índices.

## 2026-11-17


Seguridad (detalle en `SECURITY.md`):
- El Worker pone cabeceras de seguridad en todas las respuestas, con una política de contenido sin scripts en línea (el tema inicial pasó a `tema.js`). El servidor de pruebas usa las mismas cabeceras y `e2e` falla si la política bloquea algo.
- Comparación de tokens que no revela el largo, bloqueo tras 8 tokens equivocados y topes de peticiones por minuto (con un tope aparte para la IA).
- PIN con PBKDF2 y espera creciente tras equivocarse; bloqueo automático opcional (al pasar a segundo plano o tras 2 o 5 minutos).
- Respaldo con contraseña (PBKDF2 + AES-GCM) y restauración de ambos formatos.
- Actividad reciente en Ajustes. `npm run seguridad` dentro de `npm run check`.

Registro sin fricción:
- Una frase con varios movimientos («ayer pagué 15 mil de almuerzo y hoy entraron 80 mil a Nequi») se corta sola y trae «Confirmar los N». «Entraron» y «llegaron» con plata se leen como ingreso.
- «Pegar alerta»: lee notificaciones de Nequi, Bancolombia y Banco de Bogotá con reglas, sin IA.
- Mini-contador de billetes en el cuadre rápido del efectivo.
- Barra de «Deshacer» de ocho segundos al guardar, editar, duplicar o anular. Para deshacer una anulación nació la operación `restaurar`.

Inteligencia y control:
- Proyección de liquidez a 30 días con aviso si una cuenta no alcanza para un pago fijo.
- Metas con fecha objetivo: cuota semanal sugerida y botón para apartarla. Los gastos hormiga muestran también su equivalente por mes.
- Apps que venden: stock mínimo por producto (alerta y corte), y corte de turno del día o la semana para compartir o imprimir; en el chat, `corte`.

## 2026-11-16 (segunda tanda)


- Revisé el retiro de modelos de Workers AI del 20 de noviembre: la app usa Llama 3.3 70B para el texto y Llama 3.2 11B Vision para los comprobantes, y ninguno está en la lista. Los probé contra el Worker publicado y respondieron bien. El detalle y los reemplazos recomendados quedaron en `docs/IA.md`.
- El Chat gana espacio: se fue la cabecera viva, la barra de arriba es más baja y el cuadro de escribir es una sola línea con el escáner, el micrófono y Enviar alineados.
- Modo privacidad: la app arranca con los montos escondidos (`••••••`) y el ojo de la cabecera los muestra o los oculta. Se recuerda la elección. Los textos de alertas también esconden sus montos. Las tarjetas del chat sí los muestran, porque ahí hay que confirmar.
- Preguntas habladas: «¿cuánto hay en Nequi?», «¿cuánto llevo en comida este mes?», «¿quién me debe plata?» y «¿cuánto puedo gastar esta semana?» se responden en el chat.
- «Esta semana» en Saldos y Resumen: lo libre del mes entre los días que quedan, por siete.
- Cuadre rápido en Saldos («Actualizar efectivo que tengo hoy»): si falta plata ofrece anotar «Otros gastos varios sin anotar»; si sobra, un arqueo.
- Nombres con trato («Don Carlos») se preguntan aun en un préstamo, con la opción «Es un apodo de...». Los atajos del chat ahora viajan al servidor como un ajuste más, junto con los apodos.
- Recordatorio de la noche opcional (Ajustes). El cron del Worker pasó a correr cada media hora.
- Gráficas nuevas: mapa de calor del mes y barras de ingresos contra gastos de seis meses en Resumen, y la barra de salud patrimonial (liquidez, por cobrar, por pagar) en Saldos.
- Tres atmósferas nuevas, cada una en oscuro y claro: Esmeralda, Océano y Atardecer, todas con la prueba de contraste.
- Sonido suave opcional (apagado por defecto) al confirmar y al leer un comprobante, y vibración al leerlo.
- Etiquetas EDITADO, FIJO y COMPARTIDO en las filas de Movimientos.
- La ayuda suma un recorrido de cuatro pasos con una cuenta real de la app y un botón «Probar en el chat» en cada ejemplo.

## 2026-11-16


- Los botones rápidos del chat los armas tú. Se fueron los que salían solos con montos y medios de pago inventados («Pasaje», «Recarga»). Ahora la barra trae Ayuda, los pagos fijos que ya tocan y un + para crear los tuyos desde el chat o desde Ajustes. Cada uno es una plantilla (deja el texto escrito para ponerle el monto y la cuenta) o una frase completa (arma la tarjeta para confirmar). Se pueden editar, subir, bajar, quitar y ocultar toda la barra. Se guardan en el celular, no en el servidor.
- Ayuda por temas: al tocar Ayuda el bot pregunta de qué quieres saber y muestra botones (anotar, préstamos y deudas, compartidos, pagos fijos y metas, escanear recibos, editar o anular, saldos y cuadres). Los ejemplos de un tema salen solo al tocarlo, y hay un botón para volver a los temas.
- Cabecera viva en el Chat: lo disponible, las barras del gasto de los últimos 7 días y el ritmo del día (verde, ámbar o coral). Se pliega y se acuerda de cómo la dejaste. Las cuentas están en `packages/core/src/pulso.ts`.
- Más movimiento en el chat: las burbujas entran una tras otra, la tarjeta que espera tu confirmación late con un halo, el monto cuenta hasta su valor y el escáner muestra una línea de luz mientras lee.
- Saldos y Movimientos con más gráficas: la barra de dónde está tu plata y una barrita en cada cuenta, y la barra de ingresos contra gastos de lo que se ve.
- El fondo ahora es una aurora que se mueve despacio (respeta «reducir movimiento»), con colores más profundos y más fuertes. Tarjetas, burbujas y hojas son de vidrio: superficie semiopaca con desenfoque, así el texto se lee aunque el fondo tenga color. `npm run contraste` ahora mide el texto sobre ese vidrio con el peor de los brillos.

- Se acabaron los cuadros del navegador («...workers.dev dice»): anular, borrar, pedir el PIN, renombrar y todo lo demás sale ahora en un cuadro de la app, con el tema, un ícono de advertencia, animación y botones que se acomodan con letra grande.
- Fondo con más vida: una malla de brillos de color y una trama de puntos. El brillo de arriba cambia de color con la sección, y los otros tres dependen de la variante (azul y esmeralda en la personal, violeta en la familiar, ámbar en la de empresa). `npm run contraste` ahora revisa también el texto sobre esos brillos.

## 2026-11-15


- Botones rápidos en el chat, sobre el cuadro de texto: los pagos fijos que ya tocan, lo que más se repite, los atajos de la app (el pasaje con su monto) y lo último que anotaste. Un toque deja la tarjeta lista para confirmar.
- Resumen: cada categoría contra el mismo tramo del mes pasado (+15 %, -20 %) y una proyección de cómo cierra el mes. Si a ese ritmo se gasta 15 % o más que el mes pasado, hay una alerta pasados diez días.
- Duplicar un movimiento desde su detalle, y el detalle dice cuándo se anotó y cuándo se editó. Ver [EDITAR.md](EDITAR.md).
- Pagos fijos y Deudas: «Registrar pago ahora» o «Registrar abono ahora» deja la tarjeta lista para confirmar, sin escribir la frase.
- Diseño: degradados suaves en las tarjetas, brillos en lo activo, hojas que suben con difuminado, pasos de la edición que entran uno tras otro y una palomita que se dibuja al guardar. Todo se apaga con «reducir movimiento».
- Letra grande: la fila «Anterior, mes, Siguiente» baja a dos líneas cuando no cabe, también con letra normal y texto del sistema grande. Nuevo `npm run e2e:variantes`.

- Editar un movimiento ya guardado desde Movimientos, con dos confirmaciones y una comparación de antes y después. Ver [EDITAR.md](EDITAR.md). El movimiento se reemplaza (no queda uno anulado) y guarda `editado_en`. Migración nueva: `0006_editado_en.sql`.

- Letra grande en celulares angostos: las filas bajan la cifra a la línea siguiente en vez de partir las palabras, las pestañas y los filtros de Movimientos se acomodan en varias líneas, el cuadro de texto del chat deja los botones debajo, las cifras grandes (el disponible, los totales) se achican para caber enteras y la barra de abajo usa «Movim.» cuando «Movimientos» no cabe. Nuevo `npm run e2e:letra`.

## 2026-11-14


- Pagos fijos que ya no son solo mensuales: cada quincena, cada semana y cada año. «cada lunes mecato 12000», «cada año el 15 de marzo salud 300000». El seguro para gastar cuenta todas las veces que faltan del mes.
- Anular un arqueo ya no deja rastro: sale de los listados, incluso con «anulados», y no cuenta entre los movimientos anulados de la revisión del mes.
- Existencias en las ventas: `inventario galletas 200`, `llegaron 50 galletas` y `existencias`. Cada venta resta, anular devuelve y la tarjeta avisa si no alcanza.
- Buzón entre apps: un aviso puede traer una frase para que la otra app la anote, siempre con confirmación.
- Movimientos: rango de fechas, etiquetas como botones, y exportar lo que se ve a CSV o JSON. Resumen: compartir el resumen y bajar los movimientos del periodo en CSV.
- Gráficos: tocar la curva de saldo muestra el día y el valor; la curva del ritmo y la dona tienen letra más grande.
- Por dentro: todas las pantallas de Más son componentes de Preact, y los servicios de la app se partieron por tema (`estado`, `sincronizacion`, `avisos`, `ia`, `servidor`, `fotos`, `seguridad`).

## 2026-11-13


- Aviso al celular, una vez por semana, cuando las fotos de recibos ocupan 3 GB o más de la base.
- Atajos fijos del chat según la app: Ventas donde se vende y Jornales donde hay trabajadores.

## 2026-11-08


- El repositorio se ordena en tres ramas, una por variante de la app: `main` (personal), `familiar` (familia) y `empresa`. Ver [RAMAS.md](RAMAS.md). Las plantillas se llaman ahora `personal`, `familia` y `empresa`.
- Subcategorías de hasta tres niveles (categoría, subcategoría y sub-subcategoría).
- Sincronización parcial: una app que ya tiene todo pide solo los movimientos que cambiaron (migración 0004).

## 2026-11-07


- Plata de otros: lo que te mandan para comprar o pagar algo suyo (`plata de hugo para juego 31000 nequi`) ya no se ve como deuda tuya. Tiene su línea en Saldos, su sección en Deudas y su fila en el Excel, y sus tarjetas dicen «Plata de Hugo» y «Gasto con plata de Hugo».
- Una frase para el gasto que paga otro en parte: `pollo 8000 para luis puso 6000 nequi`.
- Aviso al celular cuando una meta de ahorro llega a su valor.
- El Excel trae una hoja de pagos a trabajadores por semana (donde hay trabajadores).
- Ajustes y `npm run salud` muestran cuántas fotos de recibos hay y cuánto pesan.
- Arreglo: el menú Más se quedaba en blanco con movimientos importados del Excel.

## 2026-11-06


- Plata que no alcanza: si un movimiento deja una cuenta de dinero en negativo, la tarjeta lo dice con los números, ofrece pasar lo que falta de otra cuenta y el botón pasa a Guardar igual. Nació de unas monedas que se metieron a la alcancía sin haber anotado el vuelto.
- Anular algo de lo que otros dependen avisa antes. `deshacer` ya no puede anular el saldo inicial y `deshacer N` respeta los meses cerrados.
- Un segundo `saldo inicial` avisa que lo anotado desde el primero deja de contar.
- `me dieron vuelto 26000 en monedas` pasa esa plata del efectivo a las monedas.
- Una cuenta en negativo sale como alerta urgente en Saldos y marcada en `saldo`.
- Respaldo en la nube: arreglados dos fallos (base64 con datos grandes y el máximo de vueltas de Cloudflare). Los tres respaldos ya suben.

- Si anotas lo mismo dos veces en menos de diez minutos, la tarjeta avisa que se parece al anterior.
- Al pagar en efectivo sin decir el vuelto, la tarjeta pregunta si te dieron vuelto.

- Cierre del día: de tarde, la app pregunta si la billetera tiene lo que dice y ofrece contarla con un toque.
- Las alertas de Saldos traen botón: una cuenta en negativo lleva al chat con `arqueo monedas ` listo.
- Atajos del chat con los mensajes que más repites.
- `cuadrar con mamá` (y un botón al guardar un pago con diferencia pequeña): manda hasta $1.000 de sobrante a Descuadre y cierra la deuda.
- La foto del recibo viaja al servidor (tabla `fotos`, migración 0003): se ve desde otro celular. Reducida a 1000 px, unos 100 KB, tope de 300 KB y 3.000 fotos por instalación. No entra al respaldo.

- Avisos nuevos al celular: cierre del día y cuentas en negativo a las 6 pm; topes al 80 % y 100 % al momento; giros del buzón; fallo del respaldo. El cron pasó a `0 13,23 * * *` (uno solo, por el límite de 5 de Cloudflare gratis).
- Dictado por voz en el chat, con números en palabras y cuentas mal oídas corregidas.
- Pagos a trabajadores (`jornales`) y revisión del mes (`revisar`), con pantallas en Más.
- `jornal 50000 felipe` ya no pregunta qué fue si Felipe es trabajador.
- Restaurar un respaldo en una base nueva (`npm run restaurar`), probado de punta a punta.
- `npm run e2e:celular` corre las pruebas de pantalla en el Chrome de un celular conectado por USB.

## 2026-11-04


- Gastos que se repiten cada mes con aviso: `cada mes el 5 internet 60000`.
- Plata que te mandan para pagar algo de otra persona: `plata de mamá para cooperativa 150000 nequi` y `cooperativa 149984 con plata de mamá nequi`.

- Metas de ahorro: `meta moto 2000000`, `ahorré 50000 para moto`, `metas`.

- Compras con varias líneas y unidades: `compra: arroz 5000, 3 gaseosas a 2000`.

- La ayuda de la IA funciona sin internet: guarda la frase y la piensa cuando vuelve la conexión.

- Costos del banco también en la app personal.

- Movimientos con filtros: periodo (todo, semana, mes, año, con anterior y siguiente), tipo, categoría, cuenta y persona, con totales y desglose por categoría. Recuerda lo último que elegiste.
- El resumen compara con el periodo anterior, y la tarjeta avisa de un gasto mucho mayor a lo usual en su categoría.

- Más, Categorías y personas: crear y renombrar categorías, ponerles tope mensual, renombrar personas, cambiarlas de grupo y darles una categoría fija. Funciona sin conexión y se sincroniza.

- Copia de seguridad semanal en un repositorio privado de GitHub, cifrada. Apagada hasta que pongas las claves (ver RESPALDO.md).

- Resumen: botón para imprimir o guardar el informe en PDF.
- `npm run guia -- <plantilla>` arma la guía de usuario de cada app con sus cuentas y categorías.

- Más, Primeros pasos: cinco ejemplos que se escriben solos en el chat.
- Ajustes, Estado del servidor: movimientos, último movimiento, avisos e IA.
- Foto del recibo en el detalle de cada movimiento (queda en el aparato).

- Más, Conciliar con el banco: sube el CSV del extracto, marca lo ya anotado y propone lo que falta (el 4x1000, cuotas, lo olvidado).

- `deshacer 3` anula varios movimientos de una vez. `ventas del año` agrega lo vendido por mes.

- Subcategorías: `subcategoria restaurante de comida`, o en Más, Categorías y personas. Suman en la de arriba.
- Cerrar meses: `cerrar mes octubre` bloquea anotar, corregir y anular lo de ese tiempo.

- Los lunes, aviso con el resumen de la semana pasada.
- Topes que arrastran lo que sobró del mes anterior (config `tope_arrastra`).
- El Resumen muestra lo apartado en metas.

- Más, Buzón: avisos entre tus apps (una persona avisa un giro y a la otra le aparece para anotarlo), con una clave que solo sirve para dejar avisos.
- Token de solo lectura (`API_TOKEN_LECTURA`) para compartir los saldos sin dejar cambiar nada.

- `npm run e2e`: pruebas de pantalla con tu Chrome.
- Categorías y personas: apodos de las personas y olvidar palabras que el bot aprendió.

## 2026-11-03


- Los cobros del banco (4x1000, cuota de manejo) se anotan en Costos del banco: `4x1000 376 bancolombia`.
- Una persona puede tener categoría fija: lo que se le da a una persona va directo a la categoría que le pongas.
- Nequi, Daviplata y otros medios de pago nunca se toman por una persona.
- `+mesada 100k` entiende la mesada como fuente.
- La plantilla familiar separa Otros en Aportes y rifas, Mascotas, Estudio y Contador e impuestos.
- Se quitó la tabla `mensajes_procesados` (migración 0002).

## 2026-11-01


- La hora se entiende sin "a las": `ayer 4 pm`.
- El saldo inicial acepta la alcancía.
- Un pago con billete y monedas sin total (`6000 billete y 1800 monedas`) cuesta la suma.
- Las tres apps (personal, mamá y asociación) quedaron en uso.
