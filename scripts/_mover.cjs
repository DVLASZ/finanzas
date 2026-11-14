// Reordena apps/web/src por capas y reescribe los imports relativos. Se usa una sola vez.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const raiz = path.resolve('apps/web/src');
const MAPA = {
  'almacen.ts': 'services/almacen.ts',
  'app.ts': 'services/app.ts',
  'apariencia.ts': 'state/apariencia.ts',
  'aparienciaVista.ts': 'features/ajustes/aparienciaVista.ts',
  'buzonVista.ts': 'features/buzon/buzonVista.ts',
  'carta.ts': 'lib/carta.ts',
  'catalogoVista.ts': 'features/catalogo/catalogoVista.ts',
  'conciliarVista.ts': 'features/conciliar/conciliarVista.ts',
  'cuentasVista.ts': 'features/cuentas/cuentasVista.ts',
  'efectos.ts': 'lib/efectos.ts',
  'guiaVista.ts': 'features/guia/guiaVista.ts',
  'haptico.ts': 'lib/haptico.ts',
  'periodos.ts': 'lib/periodos.ts',
  'vistas.ts': 'lib/puenteLegado.ts',
  'estado/store.ts': 'state/store.ts',
  'estado/nav.ts': 'state/nav.ts',
  'ui/Carta.tsx': 'features/chat/Carta.tsx',
  'ui/Ayuda.tsx': 'features/chat/Ayuda.tsx',
  'ui/iconos.tsx': 'components/ui/iconos.tsx',
  'ui/piezas.tsx': 'components/ui/piezas.tsx',
  'ui/graficos.tsx': 'components/charts/graficos.tsx',
  'vistas/Chat.tsx': 'features/chat/Chat.tsx',
  'vistas/Saldos.tsx': 'features/saldos/Saldos.tsx',
  'vistas/Movimientos.tsx': 'features/movimientos/Movimientos.tsx',
  'vistas/Resumen.tsx': 'features/resumen/Resumen.tsx',
  'vistas/Mas.tsx': 'features/mas/Mas.tsx',
  'vistas/ajustes.ts': 'features/ajustes/ajustes.ts',
  'vistas/deudas.ts': 'features/deudas/deudas.ts',
  'vistas/revision.ts': 'features/revision/revision.ts',
  'vistas/trabajadores.ts': 'features/trabajadores/trabajadores.ts',
  'vistas/estado.ts': 'lib/actualizarEstado.ts',
  'vistas/dom.ts': 'lib/dom.ts',
};

const todos = [];
(function recorrer(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) recorrer(p); else if (/\.tsx?$/.test(f.name)) todos.push(p); } })(raiz);

const nuevoDe = ruta => {
  const rel = path.relative(raiz, ruta).split(path.sep).join('/');
  return MAPA[rel] ? path.join(raiz, MAPA[rel]) : ruta;
};

// 1) reescribe los imports de cada archivo con su ubicación nueva
const contenidos = new Map();
for (const viejo of todos) {
  const nuevo = nuevoDe(viejo);
  let s = fs.readFileSync(viejo, 'utf8');
  s = s.replace(/(from\s+|import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, pre, q, esp) => {
    const destinoViejo = path.resolve(path.dirname(viejo), esp);
    const destinoNuevo = nuevoDe(destinoViejo);
    let rel = path.relative(path.dirname(nuevo), destinoNuevo).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `${pre}${q}${rel}${q}`;
  });
  contenidos.set(nuevo, { viejo, s });
}

// 2) mueve (con git, para conservar el historial) y escribe
for (const [nuevo, { viejo, s }] of contenidos) {
  if (nuevo !== viejo) {
    fs.mkdirSync(path.dirname(nuevo), { recursive: true });
    execSync(`git mv "${viejo}" "${nuevo}"`, { stdio: 'pipe' });
  }
  fs.writeFileSync(nuevo, s);
}
console.log('movidos:', [...contenidos].filter(([n, { viejo }]) => n !== viejo).length);
