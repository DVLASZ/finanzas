[README](../README.md) · [Empezar](INICIO.md) · [El bot](BOT.md) · [Arquitectura](ARQUITECTURA.md) · [IA](IA.md) · [Desarrollo](DESARROLLO.md) · [Ramas](RAMAS.md) · [Todas las guías](README.md)

# Buzón entre apps y acceso de solo lectura

## Avisos entre tus apps

> [!NOTE]
> Sirve para casos como este: otra persona te gira plata desde su app y a ti te aparece un aviso para anotar el ingreso. No pasan claves de acceso entre las apps. Cada Worker tiene una clave de buzón que solo sirve para dejar un aviso: con ella nadie puede leer ni cambiar datos.

Cómo funciona:

1. La app de tu mamá avisa (Más, Buzón, Avisar a otra app, eliges "julio", el monto y el concepto).
2. Su Worker llama al Worker de Julio con la clave de buzón de Julio y deja el aviso.
3. En la app de Julio, Más, Buzón muestra el aviso. Con Anotar queda escrito en el chat `ingreso 150000 Mamá` para confirmar. Con Descartar se va.

Para activarlo hacen falta dos valores por cada app, que se ponen con wrangler (te los pide y no se muestran; no los pegues en ningún chat):

| Dónde | Variable | Qué es |
|---|---|---|
| Worker que recibe | `BUZON_CLAVE` | Una frase larga que inventas. Es la clave para dejarle avisos |
| Worker que envía | `BUZON_DESTINOS` | JSON con la dirección y la clave del destino: `{"julio": {"url": "https://finanzas.ejemplo.workers.dev", "clave": "la BUZON_CLAVE de Julio"}}` |
| Worker que envía | `BUZON_NOMBRE` | Cómo se presenta: `Mamá` |

```bash
npx wrangler secret put BUZON_CLAVE --config instalaciones/personal/wrangler.toml
npx wrangler secret put BUZON_DESTINOS --config instalaciones/familia/wrangler.toml
npx wrangler secret put BUZON_NOMBRE --config instalaciones/familia/wrangler.toml
```

Si un Worker no tiene `BUZON_CLAVE`, el buzón no existe en él (responde 404). Un aviso lleva quién lo manda (hasta 40 letras), el monto (entero mayor que cero) y un concepto (hasta 80 letras). Se guardan los últimos 50.

## Acceso de solo lectura

Para dejarle ver sus números a alguien (la contadora, un socio) sin que pueda cambiar nada: se define `API_TOKEN_LECTURA`, un segundo token.

```bash
npx wrangler secret put API_TOKEN_LECTURA --config instalaciones/empresa/wrangler.toml
```

Quien use ese token puede abrir la app y ver saldos, movimientos y resúmenes (lee `/api/datos` y `/api/salud`). Cualquier intento de escribir o borrar recibe 403 "Este acceso es de solo lectura". En la app de esa persona se pone ese token en Ajustes, en lugar del principal. Si cambia algo localmente en su aparato, no se sincroniza.
