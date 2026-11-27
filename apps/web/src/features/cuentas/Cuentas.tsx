/**
 * «Categorías y personas»: crear y renombrar categorías, ponerles un tope mensual, renombrar personas,
 * cambiarlas de grupo y darles una categoría fija (lo que se le da a esa persona va siempre ahí).
 * Todo sale por el repositorio de la app, así funciona sin conexión y se sincroniza solo.
 * Para pedir un dato se usa el cuadro del navegador (prompt), igual que el PIN.
 */
import { Users } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { aMinor, pasarMovimientosDeCategoria, topesPausados, cambiarArchivada, leerArchivadas, formatear, gruposDe, hallarMontos, leerSubcategorias, limpiar, MAX_NIVELES, profundidad, puedeIrDentro, rutaDe, type Cuenta } from '../../../../../packages/core/src/index.ts';
import { abrirFichaPersona, archivarPersona } from '../deudas/fichaPersona.tsx';
import { abrirOpciones, Selector } from '../../components/ui/Selector.tsx';
import { Insignia, Vacio, visualDeNombre } from '../../components/ui/iconos.tsx';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { avisar, confirmar, pedir } from '../../components/ui/Dialogo.tsx';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

const CATEGORIAS_DEL_SISTEMA = ['cat:descuadre'];

/** Un id que no choque con los que ya hay: cat:viajes, cat:viajes-2... */
function idLibre(prefijo: 'cat:' | 'per:', nombre: string, cuentas: Cuenta[]): string {
  const base = prefijo + (limpiar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nueva');
  let id = base;
  for (let n = 2; cuentas.some(c => c.id === id); n++) id = `${base}-${n}`;
  return id.slice(0, 60);
}

const leerJson = <T,>(texto: string | undefined, defecto: T): T => {
  try { return (JSON.parse(texto ?? '') as T) ?? defecto; } catch { return defecto; }
};

export function Cuentas() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [nueva, setNueva] = useState('');
  const [dentroDe, setDentroDe] = useState('');
  const [personaNueva, setPersonaNueva] = useState('');
  const [grupoNueva, setGrupoNueva] = useState('');
  const [verArchivadas, setVerArchivadas] = useState(false);
  if (!datos || !ctx) return <Cargando />;

  const archivadas = leerArchivadas(datos.config);
  const porNombre = (a: Cuenta, b: Cuenta) => a.nombre.localeCompare(b.nombre, 'es');
  const todasCategorias = datos.cuentas.filter(c => c.tipo === 'categoria' && !CATEGORIAS_DEL_SISTEMA.includes(c.id)).sort(porNombre);
  const categorias = todasCategorias.filter(c => !archivadas.includes(c.id));
  const todasPersonas = datos.cuentas.filter(c => c.tipo === 'persona').sort(porNombre);
  const personas = todasPersonas.filter(p => !archivadas.includes(p.id));
  const guardadas = [...todasCategorias, ...todasPersonas].filter(c => archivadas.includes(c.id));
  const grupos = gruposDe(ctx);
  const palabras = Object.entries(datos.aprendido).sort(([a], [b]) => a.localeCompare(b, 'es')).slice(0, 200);
  const padres = leerSubcategorias(datos.config);
  const apodos = leerJson<Record<string, string[]>>(datos.config.apodos_personas, {});
  const fijas = leerJson<Record<string, string>>(datos.config.categoria_persona, {});
  // dónde se puede poner una categoría nueva (queda a un nivel más abajo)
  const sitiosParaNueva = categorias.filter(c => profundidad(padres, c.id) + 1 < MAX_NIVELES);

  const crear = async (e: Event) => {
    e.preventDefault();
    const nombre = nueva.trim().slice(0, 40);
    if (!nombre) return;
    if (categorias.some(c => limpiar(c.nombre) === limpiar(nombre))) { await avisar({ titulo: 'Ya tienes una categoría con ese nombre', tono: 'peligro' }); return; }
    const id = idLibre('cat:', nombre, datos.cuentas);
    await guardarCambio(async () => {
      await app.repo.guardarCuenta({ id, nombre, clave: limpiar(nombre), tipo: 'categoria', moneda: 'COP' });
      if (dentroDe) await app.repo.setConfig('subcategorias', JSON.stringify({ ...padres, [id]: dentroDe }));
    });
    setNueva('');
  };

  const renombrar = async (c: Cuenta) => {
    const nombre = (await pedir({ titulo: `Nuevo nombre para «${c.nombre}»`, valor: c.nombre, aceptar: 'Guardar' }))?.trim().slice(0, 40);
    if (!nombre || nombre === c.nombre) return;
    if (datos.cuentas.some(x => x.id !== c.id && x.tipo === c.tipo && limpiar(x.nombre) === limpiar(nombre))) { await avisar({ titulo: 'Ya hay uno con ese nombre', tono: 'peligro' }); return; }
    await guardarCambio(() => app.repo.guardarCuenta({ ...c, nombre, clave: limpiar(nombre) }));
  };
  const ponerTope = async (c: Cuenta) => {
    const t = await pedir({ titulo: `Tope mensual para ${c.nombre}`, texto: 'Déjalo vacío para quitarlo.', valor: datos.presupuestos[c.id] ? String(datos.presupuestos[c.id]) : '', tipo: 'numero', aceptar: 'Guardar' });
    if (t === null) return;
    const m = hallarMontos(t)[0];
    if (t.trim() && (!m || !(m.valor > 0) || m.valor > 2_000_000_000)) { await avisar({ titulo: 'No entendí ese monto', texto: 'Ejemplo: 60000', tono: 'peligro' }); return; }
    await guardarCambio(() => app.repo.setPresupuesto(c.id, t.trim() ? aMinor(m.valor, 'COP') : null));
  };
  const editarApodos = async (p: Cuenta) => {
    const t = await pedir({ titulo: `Apodos de ${p.nombre}`, texto: 'Cómo le dices, aparte de su nombre. Sepáralos con comas; vacío los quita.', valor: (apodos[p.id] ?? []).join(', '), aceptar: 'Guardar' });
    if (t === null) return;
    const lista = t.split(',').map(x => limpiar(x)).filter(Boolean).slice(0, 10);
    const nuevos = { ...apodos };
    if (lista.length) nuevos[p.id] = lista; else delete nuevos[p.id];
    await guardarCambio(() => app.repo.setConfig('apodos_personas', JSON.stringify(nuevos)));
  };
  const crearPersona = async (e: Event) => {
    e.preventDefault();
    const nombre = personaNueva.trim().slice(0, 40);
    if (!nombre) return;
    if (todasPersonas.some(x => limpiar(x.nombre) === limpiar(nombre))) { await avisar({ titulo: 'Ya hay una persona con ese nombre', texto: 'Si la archivaste, restáurala en «Ver archivadas».', tono: 'peligro' }); return; }
    const id = idLibre('per:', nombre, datos.cuentas);
    await guardarCambio(() => app.repo.guardarCuenta({ id, nombre, clave: limpiar(nombre), tipo: 'persona', moneda: 'COP', grupo: grupoNueva || grupos[0]?.id }));
    setPersonaNueva('');
  };
  const pausados = topesPausados(datos.config);
  const alternarPausa = (c: Cuenta) => guardarCambio(() => app.repo.setConfig('topes_pausados', JSON.stringify(pausados.includes(c.id) ? pausados.filter(x => x !== c.id) : [...pausados, c.id])));
  const movimientosDe = (id: string) => datos.movimientos.filter(m => m.estado === 'ok' && m.asientos.some(a => a.cuentaId === id)).length;
  /** Vacía una categoría pasando sus movimientos a otra, para poder archivarla sin dejar nada colgando. */
  const pasarMovimientos = (c: Cuenta, ancla: HTMLElement) => {
    const n = movimientosDe(c.id);
    if (!n) { void avisar({ titulo: 'No tiene movimientos', texto: 'Ya se puede archivar.' }); return; }
    abrirOpciones(`Pasar los ${n} movimientos de ${c.nombre} a…`, categorias.filter(x => x.id !== c.id).map(x => ({ valor: x.id, etiqueta: rutaDe(padres, x.id, datos.cuentas) })), async destino => {
      const x = datos.cuentas.find(y => y.id === destino);
      if (!x || !(await confirmar({ titulo: `¿Pasar ${n} movimientos a «${x.nombre}»?`, texto: 'Cambia la categoría de cada uno. Los de un mes cerrado no se tocan.', aceptar: 'Sí, pasarlos', cancelar: 'Cancelar' }))) return;
      let r = { hechos: 0, fallaron: 0 };
      await guardarCambio(async () => { r = await pasarMovimientosDeCategoria(app.repo, new Date(), c.id, destino); });
      await avisar({ titulo: `Pasé ${r.hechos} movimientos`, texto: r.fallaron ? `${r.fallaron} no se pudieron cambiar (mes cerrado o no editables) y siguen en ${c.nombre}.` : `Ya se puede archivar ${c.nombre}.` });
    }, ancla);
  };
  const archivarCategoria = async (c: Cuenta) => {
    if (Object.entries(padres).some(([id, padre]) => padre === c.id && !archivadas.includes(id))) {
      await avisar({ titulo: 'Tiene subcategorías', texto: 'Archiva primero las de adentro.', tono: 'peligro' }); return;
    }
    const tope = datos.presupuestos[c.id];
    const quiere = await confirmar({
      titulo: `¿Archivar «${c.nombre}»?`,
      texto: `Deja de salir en selectores y listas. ${movimientosDe(c.id) ? `Sus ${movimientosDe(c.id)} movimientos no cambian y siguen contando en los reportes; si prefieres, pásalos antes a otra categoría.` : 'No tiene movimientos.'}${tope ? ' Su tope mensual se quita.' : ''}`,
      aceptar: 'Sí, archivar', cancelar: 'Cancelar',
    });
    if (!quiere) return;
    await guardarCambio(async () => {
      if (tope) await app.repo.setPresupuesto(c.id, null);
      await app.repo.setConfig('archivadas', cambiarArchivada(datos.config, c.id, true));
    });
  };
  const restaurar = (id: string) => guardarCambio(() => app.repo.setConfig('archivadas', cambiarArchivada(datos.config, id, false)));
  const cambiarPadre = (id: string, padre: string) => {
    const nuevo = { ...padres };
    if (padre) nuevo[id] = padre; else delete nuevo[id];
    return guardarCambio(() => app.repo.setConfig('subcategorias', JSON.stringify(nuevo)));
  };
  const cambiarFija = (id: string, categoria: string) => {
    const nuevas = { ...fijas };
    if (categoria) nuevas[id] = categoria; else delete nuevas[id];
    return guardarCambio(() => app.repo.setConfig('categoria_persona', JSON.stringify(nuevas)));
  };

  return (
    <div class="pb-10">
      <form class="form-nueva" onSubmit={crear}>
        <input type="text" autocomplete="off" placeholder="Nueva categoría: Viajes" aria-label="Nueva categoría" value={nueva} onInput={e => setNueva((e.target as HTMLInputElement).value)} />
        <div class="fila2">
          <Selector etiqueta="Dentro de" valor={dentroDe} alCambiar={setDentroDe}
            opciones={[{ valor: '', etiqueta: 'Categoría principal' }, ...sitiosParaNueva.map(c => ({ valor: c.id, etiqueta: `Dentro de ${rutaDe(padres, c.id, datos.cuentas)}` }))]} />
          <button class="primario" type="submit">Agregar</button>
        </div>
      </form>

      <ul class="lista">
        {categorias.map(c => {
          const tope = datos.presupuestos[c.id];
          const posibles = categorias.filter(x => puedeIrDentro(padres, c.id, x.id) || padres[c.id] === x.id);
          return (
            <li key={c.id} class="ficha">
              <div class="ficha-cab">
                <Insignia v={visualDeNombre(c.nombre)} tam={42} />
                <div class="cuerpo">
                  <div class="titulo">{c.nombre}</div>
                  <div class="sub">{padres[c.id] ? `Dentro de ${rutaDe(padres, padres[c.id], datos.cuentas)}` : 'Categoría principal'}</div>
                </div>
                <span class={`insig-tope ${tope && !pausados.includes(c.id) ? 'con' : ''}`}>{tope ? (pausados.includes(c.id) ? `En pausa · ${formatear(tope)}` : formatear(tope)) : 'Sin tope'}</span>
              </div>
              <div class="ficha-acc">
                <button class="chip" onClick={() => void renombrar(c)}>Renombrar</button>
                <button class="chip" onClick={() => void ponerTope(c)}>Tope</button>
                {tope ? <button class="chip" data-pausar-tope={c.id} onClick={() => void alternarPausa(c)}>{pausados.includes(c.id) ? 'Reanudar tope' : 'Pausar tope'}</button> : null}
                {movimientosDe(c.id) ? <button class="chip" data-pasar-movimientos={c.id} onClick={e => pasarMovimientos(c, e.currentTarget)}>Pasar movimientos</button> : null}
                <button class="chip" data-archivar-categoria={c.id} onClick={() => void archivarCategoria(c)}>Archivar categoría</button>
                <Selector etiqueta={`Dentro de, para ${c.nombre}`} valor={padres[c.id] ?? ''} alCambiar={v => void cambiarPadre(c.id, v)}
                  opciones={[{ valor: '', etiqueta: 'Principal' }, ...posibles.map(x => ({ valor: x.id, etiqueta: `Dentro de ${rutaDe(padres, x.id, datos.cuentas)}` }))]} />
              </div>
            </li>
          );
        })}
      </ul>

      <h2>Personas</h2>
      <form class="form-nueva" id="nueva-persona" onSubmit={crearPersona}>
        <input type="text" id="nueva-persona-nombre" autocomplete="off" placeholder="Nueva persona: Sofia" aria-label="Nombre de la nueva persona" value={personaNueva} onInput={e => setPersonaNueva((e.target as HTMLInputElement).value)} />
        <div class="fila2">
          <Selector etiqueta="Grupo de la nueva persona" valor={grupoNueva || grupos[0]?.id || ''} alCambiar={setGrupoNueva}
            opciones={grupos.map(g => ({ valor: g.id, etiqueta: g.nombre }))} />
          <button class="primario" type="submit">Agregar</button>
        </div>
      </form>
      <ul class="lista">
        {personas.length ? personas.map(p => (
          <li key={p.id} class="fila persona-fila" style={{ cursor: 'default' }} data-persona={p.id}>
            <div class="persona-toque" role="button" tabIndex={0} aria-label={`Ver la ficha de ${p.nombre}`} onClick={() => abrirFichaPersona(datos, p.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirFichaPersona(datos, p.id); } }}>
              <div class="titulo">{p.nombre}</div>
              <div class="sub">{grupos.find(g => g.id === p.grupo)?.nombre ?? 'Sin grupo'}{fijas[p.id] ? ` · lo que se le da va a ${datos.cuentas.find(c => c.id === fijas[p.id])?.nombre ?? '?'}` : ''}</div>
            </div>
            <div class="acciones">
              <button class="chip" onClick={() => void renombrar(p)}>Cambiar nombre</button>
              <button class="chip" onClick={() => void editarApodos(p)}>Apodos{apodos[p.id]?.length ? ` (${apodos[p.id].length})` : ''}</button>
              <Selector etiqueta={`Grupo de ${p.nombre}`} valor={p.grupo ?? ''} alCambiar={v => { if (v) void guardarCambio(() => app.repo.guardarCuenta({ ...p, grupo: v })); }}
                opciones={[{ valor: '', etiqueta: 'Grupo...' }, ...grupos.map(g => ({ valor: g.id, etiqueta: g.nombre }))]} />
              <Selector etiqueta={`Categoría fija de ${p.nombre}`} valor={fijas[p.id] ?? ''} alCambiar={v => void cambiarFija(p.id, v)}
                opciones={[{ valor: '', etiqueta: 'Sin categoría fija' }, ...categorias.map(c => ({ valor: c.id, etiqueta: c.nombre }))]} />
              <button class="chip" data-archivar-persona={p.id} onClick={() => void archivarPersona(datos, p.id)}>Archivar</button>
            </div>
          </li>
        )) : <li><Vacio Icono={Users} titulo="Todavía no hay personas" detalle="Agrega una con el botón o nómbrala en el chat." tono="violeta" /></li>}
      </ul>

      {guardadas.length > 0 && (
        <div class="archivadas-caja">
          <button class="chip" id="ver-archivadas" aria-pressed={verArchivadas} onClick={() => setVerArchivadas(v => !v)}>{verArchivadas ? 'Ocultar archivadas' : `Ver archivadas (${guardadas.length})`}</button>
          {verArchivadas && (
            <ul class="lista" id="lista-archivadas">
              {guardadas.map(c => (
                <li key={c.id} class="fila" style={{ cursor: 'default' }}>
                  <div class="min-w-0"><div class="titulo">{c.nombre}</div><div class="sub">{c.tipo === 'persona' ? 'Persona' : 'Categoría'}</div></div>
                  <button class="chip" data-restaurar={c.id} onClick={() => void restaurar(c.id)}>Restaurar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h2>Palabras que aprendí</h2>
      <Nota>Cuando me dices en qué categoría va una palabra, la recuerdo. Si una quedó mal, olvídala y te vuelvo a preguntar.</Nota>
      <ul class="lista">
        {palabras.length ? palabras.map(([w, a]) => (
          <li key={w} class="fila" style={{ cursor: 'default' }}>
            <div><div class="titulo">{w}</div><div class="sub">{datos.cuentas.find(x => x.id === (a.categoriaId ?? a.cuentaId))?.nombre ?? '?'}</div></div>
            <button class="chip" onClick={() => void guardarCambio(() => app.repo.guardarAprendido(w, {}))}>Olvidar</button>
          </li>
        )) : <li><Vacio Icono={Users} titulo="Sin palabras aprendidas" detalle="Cuando me digas en qué categoría va una palabra, la recordaré." tono="cian" /></li>}
      </ul>
      <Nota>Un tope mensual avisa cuando llevas el 80 % y el 100 % de lo que le pusiste. La categoría fija de una persona hace que lo que le das vaya siempre ahí, sin preguntar qué fue.</Nota>
    </div>
  );
}
