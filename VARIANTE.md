# Variante: App personal (rama `main`)

Las finanzas de una persona. Es la variante base: de aquí salen las otras dos (ver [docs/RAMAS.md](docs/RAMAS.md)).

## Qué trae

- Plantilla `personal`: cuentas de efectivo, monedas, dos medios de pago por transferencia y una cuenta en dólares aparte.
- Categorías de gasto de todos los días (mecato, comida, transporte, recargas, juegos, suscripciones, salidas, universidad, compras, regalos, salud, reparaciones, otros).
- Grupos de personas: amigos, familia y otros.
- Un atajo de ejemplo (`pasaje`) que se puede cambiar.

## Qué funciones usa

- Gastos, ingresos, préstamos, deudas, pagos y gastos compartidos.
- Cambio de moneda con la tasa de cada cambio, sin convertir nada solo.
- Topes mensuales con aviso, metas de ahorro, gastos que se repiten cada mes.
- Dictado por voz, avisos al celular, resumen semanal y mensual, Excel y respaldo cifrado.

## Cómo arrancar

```bash
npm install
npm run check
cp scripts/instalacion-ejemplo.json instalaciones/mi-app.json
```

Edita `instalaciones/mi-app.json` y sigue [docs/INICIO.md](docs/INICIO.md).
