# Pasar los datos a Excel

En Más, Ajustes, Pasar a Excel, el botón Descargar Excel baja un archivo `finanzas-AAAA-MM-DD.xlsx` con cuatro hojas:

| Hoja | Qué trae |
|---|---|
| Movimientos | Cada movimiento con fecha, tipo, qué fue, categoría, cuenta, persona, gasto, ingreso, cuánto se movió, moneda y si está vigente o anulado |
| Saldos | El saldo de cada cuenta de dinero |
| Deudas | Quién te debe y a quién le debes, con el motivo |
| Por mes | Gastos, ingresos y balance de cada mes, en pesos, solo con lo vigente |

Los dólares salen en dólares, no en centavos. Lo anulado aparece en Movimientos, marcado, pero no cuenta en Por mes.

Funciona sin internet, porque el archivo se arma en el celular con los datos que ya tiene.

## Cómo está hecho

El archivo se arma sin librerías, en `packages/core/src/exportar.ts`. Un .xlsx es un zip de archivos XML, y para esto basta guardar el zip sin comprimir. La función `crearXlsx` recibe hojas de filas y devuelve los bytes, y `excelDeDatos` arma las hojas a partir de los datos de la app.

Las pruebas lo abren con ExcelJS, que es una librería de verdad, y comprueban nombres de hoja, montos, anulados y deudas.

## Lo que no hace

Es solo para sacar datos.
