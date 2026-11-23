/**
 * La sección «Letra y colores» de Ajustes: el tema (con una píldora 60-30-10 que muestra de qué colores está hecho), el modo (claro,
 * oscuro o automático) y el tamaño de letra.
 *
 * La píldora enseña las proporciones reales de la regla 60-30-10: el 60 % es el fondo, el 30 % las tarjetas y la estructura, y el 10 %
 * el acento, que solo se usa en lo clave (botón principal, pestaña activa, progreso y cifras destacadas). Los colores salen de
 * scripts/paletas.mjs, así que lo que se ve aquí es lo que tiene la app.
 */
import { useEffect, useState } from 'preact/hooks';
import { actual, elegir, type Letra, type Piel, type Tema } from '../../state/apariencia.ts';
import { PIELES, PILDORAS } from './temas.generated.ts';

/** Las tres franjas de un tema: 60 % fondo, 30 % estructura, 10 % acento. */
function Pildora({ piel, tema }: { piel: Piel; tema: 'claro' | 'oscuro' }) {
  const p = PILDORAS.find(x => x.piel === piel && x.tema === tema);
  if (!p) return null;
  return (
    <span class="pildora-6030" role="img" aria-label="Proporción de colores: 60 % fondo, 30 % estructura, 10 % acento">
      <i style={{ flex: 60, background: p.f }} /><i style={{ flex: 30, background: p.e30 }} /><i style={{ flex: 10, background: p.a }} />
    </span>
  );
}

/** El radio de esquina de cada tema (el mismo de temas.css, a escala), para que la vista previa ya tenga su silueta. */
const ESQUINA: Record<Piel, string> = { obsidiana: '.4rem', midnight: '.7rem', tierra: '.9rem', esmeralda: '.8rem', bordeaux: '.3rem', kinetix: '.2rem' };

/** Una tarjeta pequeña que muestra cómo se ve el tema: fondo, tarjeta, texto y botón. */
function Vista({ piel, tema }: { piel: Piel; tema: 'claro' | 'oscuro' }) {
  const p = PILDORAS.find(x => x.piel === piel && x.tema === tema);
  if (!p) return null;
  return (
    <span class="tema-vista" style={{ background: p.f, borderRadius: ESQUINA[piel] }}>
      <span class="tema-sup" style={{ background: p.e30 === p.f ? '#888' : p.e30, opacity: 0.9, borderRadius: ESQUINA[piel] }}>
        <i style={{ background: p.a, width: '46%' }} /><i style={{ background: p.a, opacity: 0.45, width: '72%' }} />
      </span>
      <span class="tema-sup" style={{ background: p.a, height: '.9rem', width: '40%', borderRadius: ESQUINA[piel] }} />
    </span>
  );
}

function Opciones<T extends string>({ lista, valor, alElegir }: { lista: [T, string][]; valor: T; alElegir: (v: T) => void }) {
  return (
    <div class="opciones">
      {lista.map(([v, t]) => <button key={v} aria-pressed={v === valor} data-valor={v} onClick={() => alElegir(v)}>{t}</button>)}
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
  const modo: 'claro' | 'oscuro' = a.oscuro ? 'oscuro' : 'claro';
  return (
    <div class="apariencia">
      <div>
        <div class="etiqueta">Tema</div>
        <p class="sub !mt-0">La barra de color es la regla 60-30-10: el fondo, las tarjetas y el acento.</p>
        <div class="temas" id="temas">
          {PIELES.map(t => (
            <button key={t.piel} class="tema-card" data-piel={t.piel} aria-pressed={a.piel === t.piel} onClick={() => elegir({ piel: t.piel })}>
              <Vista piel={t.piel} tema={modo} /><Pildora piel={t.piel} tema={modo} /><b>{t.nombre}</b><span class="sub">{t.detalle}</span>
            </button>
          ))}
        </div>
      </div>
      <div><div class="etiqueta">Modo</div><Opciones<Tema> lista={[['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Automático (como el teléfono)']]} valor={a.tema} alElegir={v => elegir({ tema: v })} /></div>
      <div data-sin-mascara><div class="etiqueta">Tamaño de letra</div><Opciones<Letra> lista={[['compacta', 'Compacta 85 %'], ['normal', 'Normal 100 %'], ['grande', 'Grande 115 %'], ['extra', 'Extra grande 130 %']]} valor={a.letra} alElegir={v => elegir({ letra: v })} /></div>
    </div>
  );
}
