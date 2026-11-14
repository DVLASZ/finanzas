/**
 * La respuesta de «ayuda» como una guía visual: un bloque por tema, un ícono por cada tipo de ejemplo y los
 * ejemplos como botones. Al tocar uno, se escribe en el cuadro del chat; las consultas («saldo», «deudas»)
 * se envían directo.
 */
import {
  ArrowLeftRight, ArrowUpRight, Banknote, BarChart3, Bus, CalendarDays, DollarSign, HandCoins, Info, Receipt, Scale, ShoppingBasket, Sparkles,
  Store, Tag, TrendingUp, Users, Undo2,
} from 'lucide-preact';
import { quitarEmojis } from '../../lib/carta.ts';
import { Insignia, T, type Icono, type Visual } from '../../components/ui/iconos.tsx';

/** El texto que devuelve el bot para «ayuda» (empieza siempre igual). */
export const esAyuda = (t: string): boolean => t.startsWith('👋 Cuéntame');

/** Estos ejemplos no llevan monto: se envían al tocarlos. Los demás se escriben en el cuadro para completarlos. */
const CONSULTAS = new Set(['saldo', 'deudas', 'semana', 'mes', 'últimos', 'ultimos', 'lista', 'deshacer', 'ayuda']);
export const seEnvia = (ejemplo: string): boolean => CONSULTAS.has(ejemplo.trim().toLowerCase());

type Parte = { texto: string } | { ejemplo: string };

function partir(linea: string): Parte[] {
  const partes: Parte[] = [];
  let resto = linea.replace(/^•\s*/, '');
  for (let m = /«([^»]+)»/.exec(resto); m; m = /«([^»]+)»/.exec(resto)) {
    const antes = resto.slice(0, m.index).replace(/^[\s:·]+|[\s:·]+$/g, '');
    if (antes) partes.push({ texto: antes });
    partes.push({ ejemplo: m[1] });
    resto = resto.slice(m.index + m[0].length);
  }
  const fin = resto.replace(/^[\s:·]+|[\s:·]+$/g, '');
  if (fin) partes.push({ texto: fin });
  return partes;
}

/** Ícono y color según de qué trata el ejemplo. */
function visualDe(linea: string): Visual {
  const t = linea.toLowerCase();
  const v = (Icono: Icono, tema: keyof typeof T): Visual => ({ Icono, ...T[tema] });
  if (/vendí/.test(t)) return v(Store, 'cian');
  if (/gasto entre varios|por ivan/.test(t)) return v(Users, 'violeta');
  if (/agrupar|#/.test(t)) return v(Tag, 'rosa');
  if (/taxi|bus/.test(t)) return v(Bus, 'cian');
  if (/billete|vuelto/.test(t)) return v(Banknote, 'esmeralda');
  if (/dólares|usd/.test(t)) return v(DollarSign, 'lima');
  if (/arqueo|cuadre/.test(t)) return v(Scale, 'azul');
  if (/pasar plata|cambio \d/.test(t)) return v(ArrowLeftRight, 'azul');
  if (/otro día|ayer/.test(t)) return v(CalendarDays, 'ambar');
  if (/deshacer|equivoc/.test(t)) return v(Undo2, 'coral');
  if (/presté|prestaron|pagué|pagaron|debía|le debo/.test(t)) return v(HandCoins, 'ambar');
  if (/me llegó|ingreso/.test(t)) return v(TrendingUp, 'esmeralda');
  if (/comprar|lista/.test(t)) return v(ShoppingBasket, 'rosa');
  if (/saldo|deudas|semana|mes|últimos/.test(t)) return v(BarChart3, 'azul');
  return v(Receipt, 'coral');
}

interface Bloque { titulo: string; lineas: string[]; notas: string[] }

function leer(texto: string): { intro: string; bloques: Bloque[] } {
  const grupos = quitarEmojis(texto).split(/\n\s*\n/).map(g => g.split('\n'));
  const intro = grupos[0][0];
  const bloques: Bloque[] = [];
  grupos.forEach((g, i) => {
    const lineas = g.filter(l => l.startsWith('•'));
    const otras = g.filter(l => !l.startsWith('•') && !(i === 0 && l === intro));
    if (lineas.length) bloques.push({ titulo: i === 0 ? 'Anotar' : otras[0]?.replace(/:$/, '') ?? '', lineas, notas: [] });
    else if (otras.length) bloques.push({ titulo: '', lineas: [], notas: otras });
  });
  return { intro, bloques };
}

export function Ayuda({ texto, alElegir }: { texto: string; alElegir: (ejemplo: string) => void }) {
  const { intro, bloques } = leer(texto);
  return (
    <div class="ayuda">
      <div class="ayuda-cab"><Sparkles size={18} /><b>Guía rápida</b></div>
      <p class="sub !m-0 px-0.5">{intro.replace(/:$/, '.')} Toca un ejemplo para usarlo.</p>
      {bloques.map((b, i) => b.lineas.length ? (
        <section key={i} class="ayuda-bloque">
          {b.titulo && <h4>{b.titulo}</h4>}
          {b.lineas.map(l => (
            <div key={l} class="ayuda-fila">
              <Insignia v={visualDe(l)} tam={34} />
              <div class="ayuda-partes">
                {partir(l).map((p, j) => 'ejemplo' in p
                  ? <button key={j} type="button" class="ejemplo" data-ejemplo={p.ejemplo} onClick={() => alElegir(p.ejemplo)}>{p.ejemplo}<ArrowUpRight size={14} aria-hidden="true" /></button>
                  : <span key={j} class="ayuda-texto">{p.texto}</span>)}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <div key={i} class="callout"><span class="callout-ico"><Info size={16} /></span><span class="callout-txt">{b.notas.join(' ')}</span></div>
      ))}
    </div>
  );
}
