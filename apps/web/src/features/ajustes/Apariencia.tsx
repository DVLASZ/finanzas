/** La sección «Letra y colores» de Ajustes: temas con vista previa, modo automático y tamaño de letra. */
import { useEffect, useState } from 'preact/hooks';
import { actual, elegir, type Letra, type Piel, type Tema } from '../../state/apariencia.ts';

interface Paleta { fondo: string; sup: string; elev: string; tx: string; tx2: string; a: string; b: string }
const TEMAS: { piel: Piel; tema: Tema; nombre: string; detalle: string; p: Paleta }[] = [
  { piel: 'libro', tema: 'oscuro', nombre: 'Midnight Fintech', detalle: 'Oscuro, azul y esmeralda', p: { fondo: '#090d16', sup: '#111827', elev: '#1b2538', tx: '#f1f5fb', tx2: '#9ca9bf', a: '#38bdf8', b: '#818cf8' } },
  { piel: 'libro', tema: 'claro', nombre: 'Claro', detalle: 'Blanco y azul índigo', p: { fondo: '#f3f5fa', sup: '#ffffff', elev: '#e9edf5', tx: '#0b1220', tx2: '#4b5568', a: '#4f46e5', b: '#0369a1' } },
  { piel: 'tierra', tema: 'oscuro', nombre: 'Tierra Editorial', detalle: 'Café oscuro, cálido', p: { fondo: '#17110c', sup: '#211812', elev: '#2c2118', tx: '#f5ebdd', tx2: '#bba791', a: '#f0a06a', b: '#f2c14e' } },
  { piel: 'tierra', tema: 'claro', nombre: 'Tierra clara', detalle: 'Crema y terracota', p: { fondo: '#f7f0e6', sup: '#fffbf5', elev: '#f0e4d2', tx: '#2a1d14', tx2: '#6a5546', a: '#9a3f18', b: '#8a5300' } },
];

/** Una tarjeta pequeña que muestra cómo se ve el tema: fondo, tarjeta, texto y botón. */
function Vista({ p }: { p: Paleta }) {
  return (
    <span class="tema-vista" style={{ background: p.fondo }}>
      <span class="tema-sup" style={{ background: p.sup }}>
        <i style={{ background: p.tx, width: '46%' }} /><i style={{ background: p.tx2, width: '72%' }} />
        <b style={{ background: `linear-gradient(90deg,${p.a},${p.b})` }} />
      </span>
      <span class="tema-sup" style={{ background: p.elev, height: '.9rem' }} />
    </span>
  );
}

function Opciones<T extends string>({ lista, valor, alElegir }: { lista: [T, string][]; valor: T; alElegir: (v: T) => void }) {
  return (
    <div class="opciones">
      {lista.map(([v, t]) => <button key={v} aria-pressed={v === valor} onClick={() => alElegir(v)}>{t}</button>)}
    </div>
  );
}

export function Apariencia() {
  const [a, setA] = useState(actual());
  // la apariencia puede cambiar desde la cabecera (el botón de tema): se vuelve a leer
  useEffect(() => {
    const alCambiar = () => setA(actual());
    window.addEventListener('apariencia', alCambiar);
    return () => window.removeEventListener('apariencia', alCambiar);
  }, []);
  const elegido = (piel: Piel, tema: Tema) => a.piel === piel && a.tema === tema;
  return (
    <div class="apariencia">
      <div>
        <div class="etiqueta">Tema</div>
        <div class="temas">
          {TEMAS.map(t => (
            <button key={`${t.piel}${t.tema}`} class="tema-card" aria-pressed={elegido(t.piel, t.tema)} onClick={() => elegir({ piel: t.piel, tema: t.tema })}>
              <Vista p={t.p} /><b>{t.nombre}</b><span class="sub">{t.detalle}</span>
            </button>
          ))}
        </div>
      </div>
      <div><div class="etiqueta">Modo</div><Opciones<Tema> lista={[['auto', 'Automático (como el teléfono)']]} valor={a.tema} alElegir={v => elegir({ tema: v })} /></div>
      <div><div class="etiqueta">Tamaño de letra</div><Opciones<Letra> lista={[['normal', 'Normal'], ['grande', 'Grande']]} valor={a.letra} alElegir={v => elegir({ letra: v })} /></div>
    </div>
  );
}
