// Escribe docs/BATERIA-RED-TEAM.md a partir de packages/core/test/red-team-casos.ts: la misma lista que corre la prueba.
//   npm run bateria            (o: node scripts/bateria-red-team.mjs)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASOS } from '../packages/core/test/red-team-casos.ts';
import { PENDIENTES } from '../packages/core/test/red-team-pendientes.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = n => (Array.isArray(n) ? n.map(x => '$' + x.toLocaleString('es-CO')).join(' o ') : '$' + Number(n).toLocaleString('es-CO'));
const TIPOS = { gasto: 'Gasto', ingreso: 'Ingreso', prestamo: 'Préstamo', deuda: 'Deuda', compartido: 'Gasto compartido', cambio: 'Cambio de moneda', transferencia: 'Transferencia' };

function descItem(i) {
  return [i.tipo ? TIPOS[i.tipo] ?? i.tipo : '', i.monto !== undefined ? M(i.monto) : '', i.cuenta ? `en ${i.cuenta}` : '', i.cat ? `categoría ${i.cat}` : '', i.catNo ? `no ${i.catNo}` : '', i.concepto ? `«${i.concepto}»` : '', i.fecha ? `el ${i.fecha}` : '', i.etiqueta === null ? 'sin etiqueta' : i.etiqueta ? `etiqueta ${i.etiqueta}` : '', i.personas ? i.personas.map(p => `${p.nombre} ${M(p.monto)}`).join(', ') : '', i.pregunta ? `pregunta por «${i.pregunta}»` : ''].filter(Boolean).join(' ') || 'un movimiento';
}

function describir(e) {
  switch (e.t) {
    case 'gasto': case 'ingreso': case 'prestamo': case 'deuda': case 'compartido': case 'cambio':
      return [TIPOS[e.t], e.monto !== undefined ? M(e.monto) : '', e.cuenta ? `en ${e.cuenta}` : '', e.cat ? `categoría ${e.cat}` : '', e.persona ? `con ${e.persona}` : ''].filter(Boolean).join(', ');
    case 'transferencia': return ['Transferencia', e.monto ? M(e.monto) : '', e.de && e.a ? `${e.de} a ${e.a}` : ''].filter(Boolean).join(', ');
    case 'varios': return `${e.montos.length} movimientos: ${e.montos.map(M).join(', ')}${e.cuentas ? ` (${e.cuentas.join(', ')})` : ''}`;
    case 'ayuda': return 'Responde con ayuda y ejemplos tocables';
    case 'nada': return 'Sin tarjeta: no anota nada';
    case 'preg': return 'Pregunta antes de inventar';
    case 'util': return e.re ? `Responde con datos (menciona «${e.re}»), sin tarjeta` : 'Respuesta útil (consulta o ayuda), sin tarjeta';
    case 'sin': return `Nunca ${e.tipos.map(x => x.toLowerCase()).join(' ni ')}: si no hay tarjeta, pregunta o explica`;
    case 'alto': return 'Monto sospechoso: pide confirmar la cifra o pregunta';
    case 'nogasto': return 'Nunca un gasto';
    case 'sinfusion': return 'Ana y Luis por separado, nunca «Ana Luis»';
    case 'o': return e.alt.map(describir).join(' o ');
    case 'flujo': return `Flujo de estado (${e.id})`;
    case 'estado': return [e.pend ? (e.pend.length ? `Quedan pendientes: ${e.pend.map(i => descItem(i)).join('; ')}` : 'Sin tarjetas pendientes') : '', e.guard ? (e.guard.length ? `Guardado: ${e.guard.map(i => descItem(i)).join('; ')}` : 'Nada guardado') : '', e.preg ? 'Pregunta' : ''].filter(Boolean).join('. ');
    case 'sinregla': return `No aprende «${e.palabra}»: explica por qué y no guarda ninguna regla`;
    default: return '';
  }
}

const GRUPOS = { typos: 'Errores de escritura', jerga: 'Jerga, autocorrecciones e incertidumbre', historias: 'Historias largas y números en letras', negaciones: 'Negaciones e hipotéticos', deudas: 'Deudas, préstamos y abonos', numeros: 'Números, fechas y unidades', transferencias: 'Transferencias y monedas', personas: 'Personas y compartidos', ayuda: 'Preguntas de ayuda disfrazadas', pendiente: 'Con una tarjeta pendiente', varios: 'Varios movimientos, IA y límites', conversacion: 'Ronda 2: conversaciones de varios mensajes y colas', modismos: 'Ronda 2: modismos colombianos', finalidad: 'Ronda 2: el para qué manda sobre el dónde', calculos: 'Ronda 2: cuentas compuestas', aprendizaje: 'Ronda 2: aprender sin contaminar', etiquetas: 'Ronda 2: etiquetas', programacion: 'Ronda 2: pagos fijos y alcancías con fechas relativas', banco: 'Ronda 2: notificaciones del banco pegadas', dictado: 'Ronda 3: dictado por voz, números en letras y homófonos', cruzados: 'Ronda 3: préstamos cruzados, compensaciones y condonaciones', analiticas: 'Ronda 3: consultas sobre el historial', fechas: 'Ronda 3: fechas relativas, madrugada y obligaciones futuras', narrativas: 'Ronda 3: narrativas largas de varios eventos', limites: 'Ronda 3: montos límite, nombres que chocan y emojis', deben: 'Ronda 4: compras compartidas que pagó otro (yo debo mi parte)', cobros: 'Ronda 4: yo pagué y los demás me deben su parte', universidad: 'Ronda 4: universidad, roomies y salidas', compuestos: 'Ronda 4: conceptos compuestos (manda lo que se compró)', liquidar: 'Ronda 4: liquidaciones habladas, cuadres y perdones', correccion: 'Ronda 5: corregir lo que se acaba de decir', anulacion: 'Ronda 5: anulaciones, borrados y arrepentimientos', turnos: 'Ronda 5: varios turnos con interrupciones', edicion: 'Ronda 5: editar movimientos ya guardados', cola: 'Ronda 5: confirmaciones parciales y cola de pendientes', traslados: 'Ronda 6: traslados entre cuentas propias y retiros', comisiones: 'Ronda 6: comisiones bancarias y 4x1000', tarjeta: 'Ronda 6: tarjeta de crédito, cuotas, abonos e intereses', topes: 'Ronda 6: topes de presupuesto', metas: 'Ronda 6: metas de ahorro y apartados', hogar: 'Ronda 6: el hogar (instalación de la familia)', asociacion: 'Ronda 6: la asociación y su fondo', voz: 'Ronda 7: dictado por voz ruidoso', alertas: 'Ronda 7: alertas del banco pegadas' };

let md = `# Batería adversarial del bot (RED-001 a RED-${CASOS.length})

Estas son las ${CASOS.length} frases difíciles con las que se prueba el intérprete de lenguaje natural, y lo que el bot debe hacer con cada una. La misma lista (\`packages/core/test/red-team-casos.ts\`) corre como prueba automática contra el bot real.

\`\`\`bash
node --test packages/core/test/red-team.test.ts
RED_INFORME=1 node --test packages/core/test/red-team.test.ts   # solo cuenta y lista los que fallan
node --test packages/core/test/red-team-integridad.test.ts      # los cinco puntos de integridad
\`\`\`

Cómo leer la columna "Debe hacer": «Sin tarjeta» es que el bot no propone ningún movimiento (el bot nunca guarda sin mostrar antes la tarjeta). «Pregunta» es que pide aclarar antes de inventar un dato. Cuando el enunciado deja dos salidas razonables, la tabla dice «o» y la columna "Decisión" explica por qué.

Este archivo se genera con \`npm run bateria\`: no lo edites a mano.
`;
for (const [g, titulo] of Object.entries(GRUPOS)) {
  const casos = CASOS.filter(c => c.grupo === g);
  if (!casos.length) continue;
  md += `\n## ${titulo}\n\n| Caso | Frase | Debe hacer | Decisión |\n|---|---|---|---|\n`;
  for (const c of casos) {
    const frase = c.texto.length > 90 ? c.texto.slice(0, 87).replace(/\n/g, ' / ') + '...' : c.texto.replace(/\n/g, ' / ');
    const pre = c.antes?.length ? ` (antes: ${c.antes.join('; ')})` : '';
    const marca = PENDIENTES.has(Number(c.id.slice(4))) ? ' (PENDIENTE)' : '';
    md += `| ${c.id}${marca} | \`${frase.replace(/\|/g, '/').replace(/3\d{9}/g, '3XXXXXXXXX')}\`${pre} | ${describir(c.esp)} | ${c.nota ?? ''} |\n`;
  }
}
writeFileSync(join(raiz, 'docs', 'BATERIA-RED-TEAM.md'), md);
console.log(`docs/BATERIA-RED-TEAM.md: ${CASOS.length} casos`);
