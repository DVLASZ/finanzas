/**
 * «Categorías y personas»: crear y renombrar categorías, ponerles un tope mensual, renombrar personas,
 * cambiarlas de grupo y darles una categoría fija (lo que se le da a esa persona va siempre ahí).
 * Todo sale por el repositorio de la app, así funciona sin conexión y se sincroniza solo.
 * Para pedir un dato se usa el cuadro del navegador (prompt), igual que el PIN.
 */
import { aMinor, formatear, gruposDe, hallarMontos, leerSubcategorias, limpiar, profundidad, puedeIrDentro, rutaDe, MAX_NIVELES, type Cuenta } from '../../../packages/core/src/index.ts';
import { app, leerTodo, sincronizar } from './app.ts';
import { esc } from './carta.ts';
import { Users } from 'lucide-preact';
import { insigniaHtml, vacioHtml, visualDeNombre } from './ui/iconos.tsx';
import { actualizarEstado } from './vistas.ts';

const CATEGORIAS_DEL_SISTEMA = ['cat:descuadre'];

const guardar = async (hacer: () => Promise<void>): Promise<void> => {
  await hacer();
  void sincronizar().then(() => actualizarEstado());
};

/** Un id que no choque con los que ya hay: cat:viajes, cat:viajes-2... */
function idLibre(prefijo: 'cat:' | 'per:', nombre: string, cuentas: Cuenta[]): string {
  const base = prefijo + (limpiar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nueva');
  let id = base;
  for (let n = 2; cuentas.some(c => c.id === id); n++) id = `${base}-${n}`;
  return id.slice(0, 60);
}

export async function vistaCuentas(cont: HTMLElement): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const categorias = datos.cuentas.filter(c => c.tipo === 'categoria' && !CATEGORIAS_DEL_SISTEMA.includes(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const personas = datos.cuentas.filter(c => c.tipo === 'persona').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const grupos = gruposDe(ctx);
  const palabras = Object.entries(datos.aprendido).sort(([a], [b]) => a.localeCompare(b, 'es')).slice(0, 200);
  const padres = leerSubcategorias(datos.config);
  let apodos: Record<string, string[]> = {};
  try { apodos = JSON.parse(datos.config.apodos_personas ?? '{}') ?? {}; } catch { /* JSON mal escrito: sin apodos */ }
  // dónde se puede poner una categoría nueva (queda a un nivel más abajo)
  const sitiosParaNueva = categorias.filter(c => profundidad(padres, c.id) + 1 < MAX_NIVELES);
  let fijas: Record<string, string> = {};
  try { fijas = JSON.parse(datos.config.categoria_persona ?? '{}') ?? {}; } catch { /* JSON mal escrito: sin categorías fijas */ }

  cont.innerHTML = `
    
    <form class="form-nueva" id="formCat">
      <input id="nuevaCat" type="text" autocomplete="off" placeholder="Nueva categoría: Viajes" aria-label="Nueva categoría" />
      <div class="fila2">
        <select id="dentroDe" aria-label="Dentro de"><option value="">Categoría principal</option>${sitiosParaNueva.map(c => `<option value="${esc(c.id)}">Dentro de ${esc(rutaDe(padres, c.id, datos.cuentas))}</option>`).join('')}</select>
        <button class="primario" type="submit">Agregar</button>
      </div>
    </form>
    <ul class="lista">${categorias.map(c => {
      const tope = datos.presupuestos[c.id];
      return `<li class="ficha"><div class="ficha-cab">${insigniaHtml(visualDeNombre(c.nombre), 42)}<div class="cuerpo"><div class="titulo">${esc(c.nombre)}</div>
        <div class="sub">${padres[c.id] ? `Dentro de ${esc(rutaDe(padres, padres[c.id], datos.cuentas))}` : 'Categoría principal'}</div></div>
        <span class="insig-tope ${tope ? 'con' : ''}">${tope ? esc(formatear(tope)) : 'Sin tope'}</span></div>
        <div class="ficha-acc"><button class="chip" data-renombrar="${esc(c.id)}">Renombrar</button><button class="chip" data-tope="${esc(c.id)}">Tope</button>
        <select data-padre="${esc(c.id)}" aria-label="Dentro de, para ${esc(c.nombre)}"><option value="">Principal</option>${categorias.filter(x => puedeIrDentro(padres, c.id, x.id) || padres[c.id] === x.id).map(x => `<option value="${esc(x.id)}"${padres[c.id] === x.id ? ' selected' : ''}>Dentro de ${esc(rutaDe(padres, x.id, datos.cuentas))}</option>`).join('')}</select></div></li>`;
    }).join('')}</ul>

    <h2>Personas</h2>
    <ul class="lista">${personas.map(p => `<li class="fila" style="cursor:default"><div><div class="titulo">${esc(p.nombre)}</div>
      <div class="sub">${esc(grupos.find(g => g.id === p.grupo)?.nombre ?? 'Sin grupo')}${fijas[p.id] ? ` · lo que se le da va a ${esc(datos.cuentas.find(c => c.id === fijas[p.id])?.nombre ?? '?')}` : ''}</div></div>
      <div class="acciones"><button class="chip" data-persona="${esc(p.id)}">Cambiar nombre</button><button class="chip" data-apodos="${esc(p.id)}">Apodos${apodos[p.id]?.length ? ` (${apodos[p.id].length})` : ''}</button>
      <select data-grupo="${esc(p.id)}" aria-label="Grupo de ${esc(p.nombre)}"><option value="">Grupo...</option>${grupos.map(g => `<option value="${esc(g.id)}"${g.id === p.grupo ? ' selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select>
      <select data-fija="${esc(p.id)}" aria-label="Categoría fija de ${esc(p.nombre)}"><option value="">Sin categoría fija</option>${categorias.map(c => `<option value="${esc(c.id)}"${c.id === fijas[p.id] ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div></li>`).join('') || `<li>${vacioHtml(Users, 'Todavía no hay personas', 'Aparecen cuando las nombras en el chat.', 'violeta')}</li>`}</ul>
    <h2>Palabras que aprendí</h2>
    <p class="sub">Cuando me dices en qué categoría va una palabra, la recuerdo. Si una quedó mal, olvídala y te vuelvo a preguntar.</p>
    <ul class="lista">${palabras.map(([w, a]) => `<li class="fila" style="cursor:default"><div><div class="titulo">${esc(w)}</div><div class="sub">${esc(datos.cuentas.find(x => x.id === (a.categoriaId ?? a.cuentaId))?.nombre ?? '?')}</div></div><button class="chip" data-olvidar="${esc(w)}">Olvidar</button></li>`).join('') || `<li>${vacioHtml(Users, 'Sin palabras aprendidas', 'Cuando me digas en qué categoría va una palabra, la recordaré.', 'cian')}</li>`}</ul>
    <p class="sub">Un tope mensual avisa cuando llevas el 80 % y el 100 % de lo que le pusiste. La categoría fija de una persona hace que lo que le das vaya siempre ahí, sin preguntar qué fue.</p>`;

  cont.querySelector('#formCat')!.addEventListener('submit', async e => {
    e.preventDefault();
    const entrada = cont.querySelector<HTMLInputElement>('#nuevaCat')!;
    const nombre = entrada.value.trim().slice(0, 40);
    if (!nombre) return;
    if (categorias.some(c => limpiar(c.nombre) === limpiar(nombre))) { alert('Ya tienes una categoría con ese nombre.'); return; }
    const id = idLibre('cat:', nombre, datos.cuentas);
    const padre = cont.querySelector<HTMLSelectElement>('#dentroDe')!.value;
    await guardar(async () => {
      await app.repo.guardarCuenta({ id, nombre, clave: limpiar(nombre), tipo: 'categoria', moneda: 'COP' });
      if (padre) await app.repo.setConfig('subcategorias', JSON.stringify({ ...padres, [id]: padre }));
    });
    await vistaCuentas(cont);
  });

  cont.addEventListener('click', async e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-renombrar],[data-tope],[data-persona],[data-apodos],[data-olvidar]');
    if (!el) return;
    if (el.dataset.olvidar) {
      await guardar(() => app.repo.guardarAprendido(el.dataset.olvidar!, {}));
      await vistaCuentas(cont);
      return;
    }
    if (el.dataset.apodos) {
      const p = datos.cuentas.find(x => x.id === el.dataset.apodos);
      if (!p) return;
      const t = prompt(`Cómo le dices a ${p.nombre}, aparte de su nombre. Separa con comas (déjalo vacío para quitarlos):`, (apodos[p.id] ?? []).join(', '));
      if (t === null) return;
      const lista = t.split(',').map(x => limpiar(x)).filter(Boolean).slice(0, 10);
      const nuevos = { ...apodos };
      if (lista.length) nuevos[p.id] = lista; else delete nuevos[p.id];
      await guardar(() => app.repo.setConfig('apodos_personas', JSON.stringify(nuevos)));
      await vistaCuentas(cont);
      return;
    }
    if (el.dataset.renombrar || el.dataset.persona) {
      const c = datos.cuentas.find(x => x.id === (el.dataset.renombrar ?? el.dataset.persona));
      const nombre = c ? prompt(`Nuevo nombre para «${c.nombre}»:`, c.nombre)?.trim().slice(0, 40) : '';
      if (!c || !nombre || nombre === c.nombre) return;
      if (datos.cuentas.some(x => x.id !== c.id && x.tipo === c.tipo && limpiar(x.nombre) === limpiar(nombre))) { alert('Ya hay uno con ese nombre.'); return; }
      await guardar(() => app.repo.guardarCuenta({ ...c, nombre, clave: limpiar(nombre) }));
    } else if (el.dataset.tope) {
      const c = datos.cuentas.find(x => x.id === el.dataset.tope);
      if (!c) return;
      const t = prompt(`Tope mensual para ${c.nombre} (déjalo vacío para quitarlo):`, datos.presupuestos[c.id] ? String(datos.presupuestos[c.id]) : '');
      if (t === null) return;
      const m = hallarMontos(t)[0];
      if (t.trim() && (!m || !(m.valor > 0) || m.valor > 2_000_000_000)) { alert('No entendí ese monto. Ejemplo: 60000'); return; }
      await guardar(() => app.repo.setPresupuesto(c.id, t.trim() ? aMinor(m.valor, 'COP') : null));
    }
    await vistaCuentas(cont);
  });

  cont.addEventListener('change', async e => {
    const s = e.target as HTMLSelectElement;
    if (s.dataset.padre !== undefined) {
      const nuevo = { ...padres };
      if (s.value) nuevo[s.dataset.padre] = s.value; else delete nuevo[s.dataset.padre];
      await guardar(() => app.repo.setConfig('subcategorias', JSON.stringify(nuevo)));
    } else if (s.dataset.grupo !== undefined) {
      const p = datos.cuentas.find(x => x.id === s.dataset.grupo);
      if (!p || !s.value) return;
      await guardar(() => app.repo.guardarCuenta({ ...p, grupo: s.value }));
    } else if (s.dataset.fija !== undefined) {
      const nuevas = { ...fijas };
      if (s.value) nuevas[s.dataset.fija] = s.value; else delete nuevas[s.dataset.fija];
      await guardar(() => app.repo.setConfig('categoria_persona', JSON.stringify(nuevas)));
    } else return;
    await vistaCuentas(cont);
  });
}
