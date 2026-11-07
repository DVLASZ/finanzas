# Variante: App familiar (rama `app-2`)

Los gastos de una casa con campo y trabajadores. Es la misma app que `main` con la plantilla `familia` (ver [docs/RAMAS.md](docs/RAMAS.md)).

## Qué trae

- Plantilla `familia`: efectivo, monedas, dos bancos y una alcancía de monedas que se ve aparte.
- Categorías de una casa: arriendo, servicios, mercado y aseo, comida, transporte, gasolina, salud, reparaciones, jornales, finca, insumos, hijos, regalos, aportes y rifas, mascotas, estudio, contador e impuestos, costos del banco.
- Grupos de personas: los de la casa, familia directa, familiares, compañeros de trabajo, empresa, amigos y trabajadores.
- Letra grande y colores cálidos por defecto en el ejemplo de instalación.

## Qué funciones usa

- Alcancía: `metí 5 monedas de 500 y 3 de mil a la alcancía` pasa las monedas de la billetera a la alcancía.
- Pagos a trabajadores: `jornal 50000 felipe`, `jornales` (por semana o por mes) y la pantalla Pagos a trabajadores.
- Plata de otros: lo que un familiar te manda para pagar algo suyo no cuenta como deuda ni como ingreso (`plata de mamá para la cooperativa 150000 nequi`).
- Gastos que se repiten cada mes (arriendo, internet) con aviso, cierre del día para contar la billetera, avisos al celular, dictado por voz y respaldo cifrado.
- Buzón entre apps: una persona avisa un giro y a la otra le aparece para anotarlo.

## Cómo arrancar

```bash
npm install
npm run check
cp scripts/instalacion-ejemplo.json instalaciones/mi-app.json
```

Edita `instalaciones/mi-app.json` (nombre del Worker, de la base y las personas) y sigue [docs/INICIO.md](docs/INICIO.md).
