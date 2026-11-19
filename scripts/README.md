# scripts

Herramientas que se corren con `npm run`.

| Archivo | Comando | Para qué |
|---|---|---|
| `instalar.mjs` | `npm run instalar -- <preparar, crear o publicar> <nombre>` | Crea y publica una instalación: base, servidor, clave y web |
| `instalacion-ejemplo.json` | | Un ejemplo de archivo de instalación para copiar a `instalaciones/` |
| `build-web.mjs` | `npm run web:build` | Compila la app. El instalador lo llama con el nombre, los colores y la plantilla |
| `servir-web.mjs` | `npm run web:dev` | Sirve la app compilada en el puerto 5173 |
| `contraste.mjs` | `npm run contraste` | Revisa que los pares de colores se lean bien |
| `seguridad.mjs` | `npm run seguridad` | `npm audit`, secretos, consultas a D1, funciones peligrosas de la interfaz y cabeceras del Worker |
| `capturas.mjs` | `npm run capturas` | Saca las capturas de `docs/screenshots/` con datos inventados |
| `paletas.mjs` | `npm run paletas` | Genera los colores de todos los temas con la regla 60-30-10 y los deja en `temas.css`, `auroras.css` y el selector |
| `verificar-db.mjs` | `npm run verificar` | Arma la base en memoria y revisa que todo cuadre |
| `generar-migracion.mjs` | `npm run migracion` | Regenera la migración 0001 a partir del esquema y la semilla |

El instalador pide confirmación antes de cada paso en la nube. Con `--si` las da todas por hechas. Mira [docs/DESPLIEGUE.md](../docs/DESPLIEGUE.md).
