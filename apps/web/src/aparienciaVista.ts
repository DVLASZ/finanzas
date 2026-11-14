/** La sección «Apariencia» de Ajustes: temas con vista previa, modo automático y tamaño de letra. */
import { actual } from './apariencia.ts';

interface Paleta { fondo: string; sup: string; elev: string; tx: string; tx2: string; a: string; b: string }
const TEMAS: { piel: string; tema: string; nombre: string; detalle: string; p: Paleta }[] = [
  { piel: 'libro', tema: 'oscuro', nombre: 'Midnight Fintech', detalle: 'Oscuro, azul y esmeralda', p: { fondo: '#090d16', sup: '#111827', elev: '#1b2538', tx: '#f1f5fb', tx2: '#9ca9bf', a: '#38bdf8', b: '#818cf8' } },
  { piel: 'libro', tema: 'claro', nombre: 'Claro', detalle: 'Blanco y azul índigo', p: { fondo: '#f3f5fa', sup: '#ffffff', elev: '#e9edf5', tx: '#0b1220', tx2: '#4b5568', a: '#4f46e5', b: '#0369a1' } },
  { piel: 'tierra', tema: 'oscuro', nombre: 'Tierra Editorial', detalle: 'Café oscuro, cálido', p: { fondo: '#17110c', sup: '#211812', elev: '#2c2118', tx: '#f5ebdd', tx2: '#bba791', a: '#f0a06a', b: '#f2c14e' } },
  { piel: 'tierra', tema: 'claro', nombre: 'Tierra clara', detalle: 'Crema y terracota', p: { fondo: '#f7f0e6', sup: '#fffbf5', elev: '#f0e4d2', tx: '#2a1d14', tx2: '#6a5546', a: '#9a3f18', b: '#8a5300' } },
];

/** Una tarjeta pequeña que muestra cómo se ve el tema: fondo, tarjeta, texto y botón. */
function vista(p: Paleta): string {
  return `<span class="tema-vista" style="background:${p.fondo}"><span class="tema-sup" style="background:${p.sup}"><i style="background:${p.tx};width:46%"></i><i style="background:${p.tx2};width:72%"></i><b style="background:linear-gradient(90deg,${p.a},${p.b})"></b></span><span class="tema-sup" style="background:${p.elev};height:.9rem"></span></span>`;
}

export function seccionApariencia(): string {
  const a = actual();
  const elegido = (piel: string, tema: string) => a.piel === piel && a.tema !== 'auto' && (a.tema === tema);
  const tarjetas = TEMAS.map(t => `<button class="tema-card" data-ap="combo" data-v="${t.piel}|${t.tema}" aria-pressed="${elegido(t.piel, t.tema)}">${vista(t.p)}<b>${t.nombre}</b><span class="sub">${t.detalle}</span></button>`).join('');
  const opciones = (clave: string, lista: [string, string][], valor: string) =>
    `<div class="opciones">${lista.map(([v, t]) => `<button data-ap="${clave}" data-v="${v}" aria-pressed="${v === valor}">${t}</button>`).join('')}</div>`;
  return `<div><div class="etiqueta">Tema</div><div class="temas">${tarjetas}</div></div>
    <div><div class="etiqueta">Modo</div>${opciones('tema', [['auto', 'Automático (como el teléfono)']], a.tema)}</div>
    <div><div class="etiqueta">Tamaño de letra</div>${opciones('letra', [['normal', 'Normal'], ['grande', 'Grande']], a.letra)}</div>`;
}
