# Cambios

Lo publicado, de lo más nuevo a lo más viejo. Las fechas son las de la publicación.

## 2026-11-13

- Aviso al celular, una vez por semana, cuando las fotos de recibos ocupan 3 GB o más de la base.
- Atajos fijos del chat según la app: Ventas donde se vende y Jornales donde hay trabajadores.

## 2026-11-08

- El repositorio se ordena en tres ramas, una por variante de la app: `main` (personal), `app-2` (familia) y `empresa`. Ver [RAMAS.md](RAMAS.md). Las plantillas se llaman ahora `personal`, `familia` y `empresa`.
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
