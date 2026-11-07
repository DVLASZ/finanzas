/**
 * Pantallas de la app. Cada una recibe el contenedor donde dibujarse. No usan librerías: HTML
 * plano generado con plantillas y eventos. Todo texto que viene de los datos se escapa (`esc`).
 */
export { esc } from './carta.ts';
export { prellenarChat, vistaChat } from './vistas/chat.ts';
export { vistaSaldos } from './vistas/saldos.ts';
export { vistaMovimientos } from './vistas/movimientos.ts';
export { vistaResumen } from './vistas/resumen.ts';
export { vistaDeudas } from './vistas/deudas.ts';
export { vistaAjustes } from './vistas/ajustes.ts';
export { actualizarEstado } from './vistas/estado.ts';
export { vistaCatalogo, vistaLista } from './catalogoVista.ts';
export { vistaCuentas } from './cuentasVista.ts';
export { vistaGuia } from './guiaVista.ts';
export { vistaConciliar } from './conciliarVista.ts';
export { vistaBuzon } from './buzonVista.ts';
export { vistaTrabajadores } from './vistas/trabajadores.ts';
export { vistaRevision } from './vistas/revision.ts';
