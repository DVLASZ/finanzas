# Modelo de datos

El esquema está en `db/schema.sql`, comentado, y los datos iniciales en `db/seed.sql`. Los tipos de TypeScript equivalentes están en `packages/core/src/tipos.ts`.

## La idea: cuentas y partida doble

Todo movimiento mueve plata entre cuentas, y sus asientos suman cero por moneda. Una cuenta puede ser de varios tipos:

| Tipo | Ejemplos | Qué dice su saldo |
|---|---|---|
| `dinero` | Efectivo, Monedas, Nequi, Alcancía, Dólares | Lo que tienes |
| `persona` | Ivan, Sergio | Positivo: te debe. Negativo: le debes |
| `categoria` | Mecato, Transporte, Descuadre | Lo gastado, siempre positivo |
| `fuente` | Chamba, Galletas | Lo recibido, en negativo porque es el origen del ingreso |
| `sistema` | Apertura, Cambio de moneda | Cuentas técnicas para que todo cuadre |

Con esto, gasto, préstamo o transferencia no son casos especiales. Solo cambia entre qué cuentas se mueve la plata.

## Los movimientos y sus asientos

| Tipo | Asientos |
|---|---|
| `gasto` | dinero -X, categoría +X |
| `ingreso` | fuente -X, dinero +X |
| `transferencia` | dinero A -X, dinero B +X |
| `prestamo` (tú prestas) | dinero -X, persona +X |
| `deuda` (gasto sin pagar) | categoría +X, persona -X |
| `deuda` (te prestan plata) | dinero +X, persona -X |
| `pago` (pagas tú) | dinero -X, persona +X |
| `pago` (te pagan) | dinero +X, persona -X |
| `compartido` (tú pagas) | dinero -total, categoría +tu parte, persona +su parte (una por cada uno) |
| `compartido` (pagó otro) | categoría +X, persona -X |
| `apertura` | cuenta +X, Apertura -X para los saldos. Persona y Apertura en sentido contrario para las deudas iniciales |
| `ajuste` (arqueo) | dinero más o menos la diferencia, Descuadre al revés |
| `cambio_moneda` | origen -A, Cambio(A) +A, Cambio(B) -B, destino +B |

Una venta es un ingreso: la fuente es el producto y la plata entra a efectivo. Si se fía, la plata no entra a ninguna cuenta de dinero, queda como deuda del cliente. No hace falta un tipo nuevo.

Ejemplo con vuelto: `trident 4500 con billete de 10k, vuelto 5k y 500 en monedas` deja Efectivo -5.000 (los diez mil menos los cinco mil de vuelto), Monedas +500 y Mecato +4.500. Suma cero.

## Reglas que importan

- Los montos son enteros en la unidad mínima de la moneda: pesos para COP, centavos para USD. Nunca decimales flotantes.
- Las fechas son la hora de Colombia (UTC-5, sin horario de verano) como texto `YYYY-MM-DD HH:MM:SS`, así se ordenan sin convertir. Los movimientos importados solo tienen día (`sin_hora = 1`).
- El saldo inicial no es un ingreso. El movimiento `apertura` fija `config.fecha_apertura` y los saldos solo se calculan desde esa fecha. Lo anterior es historial: cuenta en los reportes de gasto pero no en los saldos.
- Las deudas se guardan en su moneda. Lo que debes en dólares sigue siendo en dólares aunque el dólar cambie. El sistema nunca convierte el ARQ a pesos.
- Monedas y Alcancía son cuentas con `en_disponible = 0`: no suman al disponible.
- Anular no es borrar: el movimiento queda con `estado = 'anulado'` y las consultas lo ignoran. El borrado definitivo es aparte, con PIN.
- Una persona es un nombre completo. El grupo se elige al crearla.
- La vista `v_movimientos_desbalanceados` tiene que estar siempre vacía, y el código lanza un error antes de guardar asientos que no sumen cero.

## Tablas

| Tabla | Contenido |
|---|---|
| `cuentas` | Todas las cuentas de arriba. |
| `movimientos` | Fecha, tipo, descripción, evento, lugar de salida y llegada, de dónde vino (`bot`, `app`, `excel`), el mensaje original y la tarjeta confirmada para poder editarlo, y el estado. |
| `asientos` | Las líneas de cada movimiento: cuenta, monto con signo y moneda. |
| `compromisos` | Deudas y préstamos: persona, dirección, monto, motivo, fecha límite y estado. |
| `atajos` | Palabras con monto y categoría fijos, como `pasaje`. |
| `aprendido` | Lo que el bot aprendió: palabra y categoría. |
| `presupuestos` | El tope mensual de cada categoría. |
| `config` | Ajustes. Claves usadas: `fecha_apertura`, `moneda_base`, `meta_ahorro_pct`, `grupos`, `alias_cuentas`, `apodos_personas`, `catalogo`, `lista_compras`, `ventas`, `ia`, `ia_uso`. Las que empiezan por `secreto_` son del servidor y no viajan a la app. |
| `pendiente` | La tarjeta sin confirmar, una sola fila. Guarda también los movimientos que faltan de un mensaje con varios. |

Vistas: `v_saldos`, `v_gasto_mensual` y `v_movimientos_desbalanceados`.

## Cambiar el esquema

1. Crea una migración nueva y numerada en `db/migrations/` (`0002_...sql`). La `0001` no se toca una vez aplicada en producción.
2. Actualiza `db/schema.sql`, `db/seed.sql` y `packages/core/src/semilla.ts`. Una prueba comprueba que coincidan.
3. Corre `npm run check`.
4. Aplica la migración a cada base: `npx wrangler d1 migrations apply <base> --remote`. Son una por instalación.
