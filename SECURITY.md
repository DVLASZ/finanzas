# Seguridad

Este repositorio es solo código. Los datos de cada persona viven en su propio Worker y su propia base D1, y las claves están en secretos de Cloudflare, nunca en git.

## Cómo reportar una vulnerabilidad

Usa la pestaña Security del repositorio y pulsa "Report a vulnerability". Eso abre un aviso privado que solo ven los dueños del repo. No abras un issue público con el detalle de la falla.

Cuéntame qué encontraste, cómo se reproduce y qué podría hacer alguien con eso. Si tienes una idea de cómo arreglarlo, mejor. Es un proyecto de una sola persona, así que respondo cuando puedo, normalmente en unos días.

## Qué cuenta

- Poder leer o cambiar datos de una instalación sin tener su clave.
- Saltarse el PIN o la espera del borrado definitivo.
- Una forma de hacer que el servidor guarde algo sin que la persona confirme la tarjeta.
- Claves, tokens o datos personales dentro del código o del historial.

## Qué no cuenta

- Que alguien con la clave de una instalación pueda usarla. Esa clave es la contraseña.
- Fallos de Cloudflare, de Chrome o de las librerías que usa el proyecto. Esos van con sus equipos.

## Si encuentras una clave o un dato personal

Avísame por el mismo canal antes de usarlos o compartirlos. No pegues claves en ningún chat ni issue.
