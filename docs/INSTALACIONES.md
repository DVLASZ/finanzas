# Instalaciones

El mismo código sirve para varias apps. Cada persona o negocio tiene su instalación: su Worker, su base D1 y su clave. Nada se mezcla. Para crear una, mira [INICIO.md](INICIO.md).

## Plantillas

Una plantilla (`packages/core/src/plantillas.ts`) define con qué nace una app: cuentas de dinero, categorías, grupos de personas y palabras que ya conoce.

| Plantilla | Para quién | Cuentas de dinero | Grupos de personas |
|---|---|---|---|
| `personal` | Finanzas de una persona | Efectivo, monedas, Nequi, Daviplata y una cuenta en dólares | Amigos, familia, otros |
| `familia` | Uso personal con letra grande y más grupos | Efectivo, monedas, Bancolombia, Banco de Bogotá y una alcancía de monedas | Casa, familia directa, familiares, compañeros de trabajo, empresa, amigos, trabajadores |
| `empresa` | Un negocio pequeño entre varias personas | Efectivo, monedas y En otras cuentas (plata del negocio en cuentas personales) | Socios, clientes, proveedores, otros |

Son un punto de partida. Los nombres de las cuentas, categorías y grupos se cambian en el archivo de la plantilla y, en las bases ya publicadas, con SQL (ver [DESPLIEGUE.md](DESPLIEGUE.md)).

La plantilla `familia` trae un gasto "Aporte Cooperativa" para un pago mensual que no es un saldo.

## Cada app muestra solo lo suyo

- La ayuda, los saldos y los mensajes de error usan las cuentas de esa app. En la que no tiene Nequi, los ejemplos hablan de Bancolombia. Si no hay cuenta en dólares, no se habla de dólares.
- Más, Productos y precios solo aparece donde se vende: cuando la configuración trae `ventas = 1` (la plantilla `empresa` lo pone) o ya hay un catálogo guardado.
- La alcancía solo existe en la app que la tiene. En las demás, `metí monedas a la alcancía` se trata como una frase cualquiera.
- La app nace con las cuentas de su plantilla aunque todavía no esté conectada al servidor. El instalador guarda la plantilla dentro de la web. Al conectarse, los datos del servidor reemplazan a los locales.

## Aspecto

Cada instalación trae un aspecto por defecto y cada persona lo cambia en Más, Ajustes, Letra y colores.

- `piel`: `libro` (la paleta Midnight Fintech, o su versión clara) o `tierra` (café cálido, con más aire). Dentro de la app se elige entre cuatro temas con vista previa en Ajustes.
- `tema`: `claro`, `oscuro` o `auto`.
- `letra`: `normal` o `grande`.
- `matiz` (opcional): `azulado` sobre la piel `tierra`.

## Catálogo, lista de compras y alcancía

Cualquier app puede tener lista de compras (Más, Lista de compras). Las que venden tienen además Productos y precios, y el bot calcula `vendí 3 botellas`, con fiado. Ver [BOT.md](BOT.md).

## Operación

```bash
npm run instalar -- publicar <nombre>
```

Los datos de cada instalación (personas, precios) se cambian desde la app o con SQL remoto: `npx wrangler d1 execute <base> --remote`. Un cambio de esquema es una migración nueva aplicada a todas las bases.

## Actualizar una base ya publicada

Si cambias una plantilla (categorías o palabras nuevas) o el `.json` de una instalación, la base ya publicada no se entera sola. Este comando agrega lo nuevo sin borrar ni pisar nada, y pide confirmación:

```bash
npm run instalar -- actualizar familia
```

Lo de la plantilla entra con `INSERT OR IGNORE`: lo que ya existe no se toca. La `config` que está en `instalaciones/<nombre>.json` sí se pone tal cual, porque ahí manda el archivo. El SQL queda en `instalaciones/<nombre>/actualizar.sql` por si quieres revisarlo.
