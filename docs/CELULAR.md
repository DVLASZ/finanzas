# Probar en el celular

Las pruebas automáticas usan un Chrome de computador con pantalla de celular. No ven lo que solo pasa en un celular de verdad: instalar la app, trabajar sin internet, los avisos, el micrófono, la letra grande. Hay dos maneras de acercarse. Las dos necesitan el celular conectado por USB.

## Una vez: preparar el celular

1. Ajustes, Acerca del teléfono, Información de software. Toca siete veces Número de compilación hasta que diga que eres desarrollador.
2. Ajustes, Opciones de desarrollador, activa Depuración por USB.
3. Conecta el celular al PC con un cable de datos (no uno que solo carga). En el celular sale «¿Permitir depuración por USB?». Marca Permitir siempre y acepta.

## Una vez: preparar el PC

```powershell
winget install Google.PlatformTools
```

Abre una terminal nueva y comprueba que ve el celular:

```powershell
adb devices
```

Tiene que salir una fila con la palabra `device`. Si dice `unauthorized`, mira el celular y acepta.

## Manera 1: las pruebas de pantalla en el celular de verdad

```powershell
npm run e2e:celular
```

Compila la app, la sirve en el PC y hace que el celular la vea como `localhost`. Abre una pestaña en el Chrome del celular y recorre las pantallas como lo hace `npm run e2e`. Usa datos de prueba que viven solo en ese navegador: no toca la app real ni ninguna base. Es lo más parecido a que alguien use la app, con el motor real de Chrome Android.

Probado el 2026-11-07 con un celular Android: pasaban las 13 pruebas de entonces en el Chrome del celular. Hoy son 17 en el celular (18 en PC) y no se han vuelto a correr en el aparato.

Si `adb devices` no lista el celular aunque Windows lo vea, mira que la depuración USB siga activada (a veces Android la apaga) y que el modo USB sea Transferencia de archivos. Chrome Android deja varios sockets de control; el script prueba cada uno hasta que uno contesta.

## Manera 2: ver y tocar el celular desde el PC

Con scrcpy el celular aparece en una ventana del PC y se maneja con el mouse. Sirve para instalar la app, ver las notificaciones y probar sin internet, que son cosas que Chrome del PC no tiene.

```powershell
winget install Genymobile.scrcpy
scrcpy
```

Quien me ayuda puede mirar esa ventana y tocarla (con el permiso de la herramienta de control del computador) para recorrer lo que haga falta. Mejor hacerlo sobre una instalación de prueba o sin escribir datos.

## Lo que no se puede probar así

- El dictado por voz con una persona hablando de verdad. Se prueba con una frase real dicha por ti al celular. Chrome necesita internet para entender la voz.
- Los avisos con el celular guardado en el bolsillo y la pantalla apagada. Se prueba mandando uno de prueba (Más, Ajustes, Avisos, Mandar una prueba) y mirando si llega.
- El ahorro de batería de cada marca, que puede retrasar los avisos.

## Lista corta para revisar a mano cuando tengas el celular

1. Instalar la app desde Chrome (menú, Instalar app) y abrirla desde el ícono.
2. Poner el avión, anotar un gasto, confirmarlo y quitar el avión: tiene que sincronizar solo.
3. Activar los avisos y mandar la prueba.
4. Tocar el micrófono y decir «mecato cinco mil quinientos». Tiene que escribir `mecato 5500`.
5. Subir la letra al máximo en Ajustes y recorrer las cinco pestañas.
6. Tomar la foto de un recibo en un movimiento y abrir ese movimiento desde otro celular o desde el PC.
