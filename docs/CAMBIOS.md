[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Cambios

Lo publicado, de lo más nuevo a lo más viejo. Las fechas son las de la publicación.

## 2026-11-24

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
