[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

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

- `piel`: `obsidiana` (el de fábrica: negro puro para pantallas AMOLED con doble tarjeta y filetes dorados), `midnight` (azul noche de vidrio, con cian eléctrico), `tierra` (café y arena, mate, con terracota), `esmeralda` (verde bosque y jade), `bordeaux` (vino burdeos y coral, editorial) o `kinetix` (morado y lima, angular). Cada una existe en claro y en oscuro y trae sus propios radios, bordes y superficies. Dentro de la app se elige en Ajustes, Letra y colores, donde cada tema muestra una píldora con sus proporciones 60-30-10. Todos pasan `npm run contraste` y la revisión de letra grande. Si una instalación o un celular tenía un tema que ya no existe (por ejemplo `libro`), la app lo cambia sola por el más parecido.
- `tema`: `claro`, `oscuro` o `auto`.
- `letra`: `normal` o `grande`.
- `matiz` (opcional): `azulado` sobre la piel `tierra`.

## Catálogo, lista de compras y alcancía

Cualquier app puede tener lista de compras (Más, Lista de compras). Las que venden tienen también Productos y precios, con control opcional de existencias, y el bot calcula `vendí 3 botellas`, con fiado. Ver [BOT.md](BOT.md).

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

Para no llevarte sorpresas: `--ver` escribe el SQL y lo muestra sin tocar la base, y `--sin-config` deja fuera la `config` del `.json` (es lo único que pisa). Una palabra nueva del diccionario, como «intereses» en Costos del banco, entra sola con `INSERT OR IGNORE`: si ya existe o la enseñaste distinto, no se toca. En `personal` el diccionario va en el código, así que le llega con la publicación y no necesita `actualizar`.

```bash
npm run instalar -- actualizar familia --ver --sin-config
npm run instalar -- actualizar familia --sin-config --si
```

### Migración 0007: claves sin tildes

Las bases creadas antes guardaron claves como `dólares`, `alcancía` o `impuestos y trámites`, y las consultas por nombre (`cuanto tengo en alcancia`) no las encontraban. `db/migrations/0007_claves_sin_tilde.sql` las reescribe sin tildes. Si dos cuentas del mismo tipo chocaran, queda la más antigua y la otra recibe el sufijo `-2`. Se puede repetir sin riesgo. Las bases nuevas ya nacen bien. Se aplica a cada base publicada (`actualizar` no corre migraciones, hay que hacerlo con wrangler):

```bash
npx wrangler d1 execute <base> --remote --file db/migrations/0007_claves_sin_tilde.sql
```

Lo de la plantilla entra con `INSERT OR IGNORE`: lo que ya existe no se toca. La `config` que está en `instalaciones/<nombre>.json` sí se pone tal cual, porque ahí manda el archivo. El SQL queda en `instalaciones/<nombre>/actualizar.sql` por si quieres revisarlo.
