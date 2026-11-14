# Ramas: una app, tres variantes

Este repositorio tiene tres ramas. Las tres son la misma app (mismo código, mismas pruebas, mismo servidor), pero cada una está preparada para un tipo de uso distinto.

| Rama | Variante | Para qué sirve | Plantilla |
|---|---|---|---|
| `main` | App personal | Las finanzas de una persona: gastos, ingresos, deudas, ahorro y dólares | `personal` |
| `familiar` | App familiar | Una casa con campo y trabajadores: jornales, reparaciones, alcancía de monedas, dos bancos | `familia` |
| `empresa` | Negocio u organización | Un negocio pequeño entre varias personas: ventas con catálogo, insumos, impuestos, socios | `empresa` |

El repositorio es solo la estructura vacía de cada variante. No trae datos, nombres, direcciones ni claves de nadie: cada instalación guarda lo suyo fuera de git (ver más abajo).

## Qué cambia entre ramas

Casi nada del código. Lo que distingue una variante es:

- La plantilla con la que nace la app (`packages/core/src/plantillas.ts`): cuentas de dinero, categorías, palabras que ya conoce y grupos de personas.
- El archivo `VARIANTE.md`, que cuenta qué trae esa variante y qué funciones usa.
- El archivo `variante.json`, que dice qué plantilla usa el instalador por defecto.
- `scripts/instalacion-ejemplo.json`, un ejemplo de instalación de esa variante.

Todo lo demás es idéntico en las tres ramas, y las tres traen las tres plantillas: se puede crear una instalación de cualquier variante desde cualquier rama. Cada rama es el punto de partida cómodo de la suya.

Funciones por variante:

| Función | personal | familia | empresa |
|---|---|---|---|
| Gastos, ingresos, deudas, préstamos, pagos | sí | sí | sí |
| Efectivo con billetes, monedas y vuelto | sí | sí | sí |
| Dólares en una cuenta aparte | sí | no | no |
| Alcancía de monedas | no | sí | no |
| Pagos a trabajadores (jornales) | no | sí | no |
| Catálogo de productos y ventas, fiado | no | no | sí |
| Plata en cuentas personales de los socios | no | no | sí |
| Topes, metas, recurrentes, avisos, dictado, Excel, respaldo | sí | sí | sí |

## Cómo se mantiene

El código común se escribe en `main` y se pasa a las otras dos ramas. Así no hay que repetir ningún arreglo.

```bash
git checkout familiar
git merge main
git checkout empresa
git merge main
git checkout main
```

Los archivos propios de cada variante (`VARIANTE.md`, `variante.json`, `scripts/instalacion-ejemplo.json`) no se mezclan: cada rama conserva los suyos. Para que git lo haga solo, una vez en cada copia del repositorio:

```bash
git config merge.ours.driver true
```

Las reglas están en `.gitattributes`. Si alguna vez un cambio es propio de una variante (una categoría nueva solo para la familiar, por ejemplo), se hace en su rama y no se pasa a las demás.

Antes de pasar cambios, las pruebas tienen que pasar: `npm run check`.

## Qué no va en el repositorio

Tampoco en ninguna rama. Está en `.gitignore`:

- `instalaciones/`: la configuración de cada instalación (direcciones, ids de bases, nombres de personas, precios, claves).
- `importacion/` y los Excel: los datos que se cargan a una instalación.
- `docs-privado/`: notas con datos reales.
- `.env`, `.dev.vars` y cualquier secreto. Los de producción se guardan con `wrangler secret put`.

Si trabajas con una instalación real, guarda lo suyo ahí y deja el repositorio tal cual: solo estructura.

## Crear una instalación de cada variante

Con cualquier rama:

```bash
npm install
cp scripts/instalacion-ejemplo.json instalaciones/mi-app.json
# edita instalaciones/mi-app.json: nombre del Worker, de la base, personas
npm run instalar -- crear mi-app
npm run instalar -- publicar mi-app
```

El detalle está en [INICIO.md](INICIO.md) y en [INSTALACIONES.md](INSTALACIONES.md).
