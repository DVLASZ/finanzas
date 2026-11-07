# Variante: Negocio u organización (rama `empresa`)

Un negocio pequeño o una organización con varios socios. Es la misma app que `main` con la plantilla `empresa` (ver [docs/RAMAS.md](docs/RAMAS.md)).

## Qué trae

- Plantilla `empresa`: efectivo, monedas y una cuenta «En otras cuentas» para la plata del negocio que está en cuentas personales de los socios.
- Categorías de un negocio: insumos, materia prima, impuestos y trámites, transporte, servicios, publicidad, costos del banco, retiros de los socios.
- Grupos de personas: socios, clientes, proveedores y otros.
- Catálogo de productos y ventas encendido (`ventas = 1`).

## Qué funciones usa

- Ventas con catálogo: `vendí 3 botellas de jugo` calcula el total con los precios del catálogo; `15 galletas a granel Marta` para ventas por unidad.
- Fiado: la venta a crédito deja al cliente debiendo y no entra plata a la caja.
- Más, Productos y precios: el catálogo se edita desde la app. `ventas del año` suma lo vendido por mes.
- Plata en cuentas personales: `cambio 100000 efectivo a personal` pasa plata a la cuenta personal de un socio.
- Resumen por semana, mes y año, informe para imprimir, Excel con ventas y gastos, avisos al celular, dictado por voz y respaldo cifrado.

## Cómo arrancar

```bash
npm install
npm run check
cp scripts/instalacion-ejemplo.json instalaciones/mi-negocio.json
```

Edita `instalaciones/mi-negocio.json` (nombre del Worker, de la base, los socios y el catálogo en `config`) y sigue [docs/INICIO.md](docs/INICIO.md).
