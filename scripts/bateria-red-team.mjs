// Escribe docs/BATERIA-RED-TEAM.md a partir de packages/core/test/red-team-casos.ts: la misma lista que corre la prueba.
//   npm run bateria            (o: node scripts/bateria-red-team.mjs)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASOS } from '../packages/core/test/red-team-casos.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = n => (Array.isArray(n) ? n.map(x => '$' + x.toLocaleString('es-CO')).join(' o ') : '$' + Number(n).toLocaleString('es-CO'));
const TIPOS = { gasto: 'Gasto', ingreso: 'Ingreso', prestamo: 'Préstamo', deuda: 'Deuda', compartido: 'Gasto compartido', cambio: 'Cambio de moneda', transferencia: 'Transferencia' };

function describir(e) {
  switch (e.t) {
    case 'gasto': case 'ingreso': case 'prestamo': case 'deuda': case 'compartido': case 'cambio':
      return [TIPOS[e.t], e.monto !== undefined ? M(e.monto) : '', e.cuenta ? `en ${e.cuenta}` : '', e.cat ? `categoría ${e.cat}` : '', e.persona ? `con ${e.persona}` : ''].filter(Boolean).join(', ');
    case 'transferencia': return ['Transferencia', e.monto ? M(e.monto) : '', e.de && e.a ? `${e.de} a ${e.a}` : ''].filter(Boolean).join(', ');
    case 'varios': return `${e.montos.length} movimientos: ${e.montos.map(M).join(', ')}${e.cuentas ? ` (${e.cuentas.join(', ')})` : ''}`;
    case 'ayuda': return 'Responde con ayuda y ejemplos tocables';
    case 'nada': return 'Sin tarjeta: no anota nada';
    case 'preg': return 'Pregunta antes de inventar';
    case 'util': return 'Respuesta útil (consulta o ayuda), sin tarjeta';
    case 'nogasto': return 'Nunca un gasto';
    case 'sinfusion': return 'Ana y Luis por separado, nunca «Ana Luis»';
    case 'o': return e.alt.map(describir).join(' o ');
    case 'flujo': return `Flujo de estado (${e.id})`;
    default: return '';
  }
}

const GRUPOS = { typos: 'Errores de escritura', jerga: 'Jerga, autocorrecciones e incertidumbre', historias: 'Historias largas y números en letras', negaciones: 'Negaciones e hipotéticos', deudas: 'Deudas, préstamos y abonos', numeros: 'Números, fechas y unidades', transferencias: 'Transferencias y monedas', personas: 'Personas y compartidos', ayuda: 'Preguntas de ayuda disfrazadas', pendiente: 'Con una tarjeta pendiente', varios: 'Varios movimientos, IA y límites' };

let md = `# Batería adversarial del bot (RED-001 a RED-147)

Estas son las 147 frases difíciles con las que se prueba el intérprete de lenguaje natural, y lo que el bot debe hacer con cada una. La misma lista (\`packages/core/test/red-team-casos.ts\`) corre como prueba automática contra el bot real.

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
    md += `| ${c.id} | \`${frase.replace(/\|/g, '/')}\`${pre} | ${describir(c.esp)} | ${c.nota ?? ''} |\n`;
  }
}
writeFileSync(join(raiz, 'docs', 'BATERIA-RED-TEAM.md'), md);
console.log(`docs/BATERIA-RED-TEAM.md: ${CASOS.length} casos`);
