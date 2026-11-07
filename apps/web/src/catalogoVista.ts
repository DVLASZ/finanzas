/**
 * Dos pantallas sencillas del menú «Más»: la lista de compras y el catálogo de productos.
 * Los datos viven en `config` (lista_compras y catalogo), así se guardan sin conexión y se sincronizan
 * como todo lo demás. Para pedir un dato se usa el cuadro del navegador (prompt), igual que el PIN.
 */
import { formatear, leerCatalogo, leerLista, presentacionDeTexto, type Catalogo, type Producto } from '../../../packages/core/src/index.ts';
import { app, leerTodo, sincronizar } from './app.ts';
import { esc } from './carta.ts';
import { actualizarEstado } from './vistas.ts';

const guardarConfig = async (clave: string, valor: string): Promise<void> => {
  await app.repo.setConfig(clave, valor);
  void sincronizar().then(() => actualizarEstado());
};

// ---------------------------------------------------------------------------------------
// Lista de compras
// ---------------------------------------------------------------------------------------

export async function vistaLista(cont: HTMLElement): Promise<void> {
  const { datos } = await leerTodo();
  const lista = leerLista(datos.config);
  cont.innerHTML = `
    <h2 style="margin-top:0">Lista de compras</h2>
    <form class="entrada" id="formLista" style="padding:0 0 .8rem">
      <input id="nuevo" type="text" autocomplete="off" placeholder="Agregar: arroz" aria-label="Agregar a la lista" />
      <button class="primario" type="submit">Agregar</button>
    </form>
    <ul class="lista">${lista.map((x, i) => `<li class="fila" style="cursor:default"><span class="titulo">${esc(x)}</span>
      <button class="chip" data-comprado="${i}">Ya lo compré</button></li>`).join('') || '<li class="vacio">La lista está vacía.</li>'}</ul>
    <p class="sub">También puedes escribirle al chat: «falta arroz y sal». Al comprar, anota el gasto con su precio: «arroz 8000».</p>`;
  cont.querySelector('#formLista')!.addEventListener('submit', async e => {
    e.preventDefault();
    const entrada = cont.querySelector<HTMLInputElement>('#nuevo')!;
    const t = entrada.value.trim();
    if (!t) return;
    const nuevas = t.split(/\s*,\s*|\s+y\s+/).map(x => x.trim()).filter(Boolean).slice(0, 20);
    await guardarConfig('lista_compras', JSON.stringify([...lista, ...nuevas.filter(n => !lista.some(x => x.toLowerCase() === n.toLowerCase()))]));
    await vistaLista(cont);
  });
  cont.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-comprado]');
    if (!b) return;
    await guardarConfig('lista_compras', JSON.stringify(lista.filter((_, i) => i !== Number(b.dataset.comprado))));
    await vistaLista(cont);
  });
}

// ---------------------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------------------

export async function vistaCatalogo(cont: HTMLElement): Promise<void> {
  const { datos } = await leerTodo();
  const cat: Catalogo = leerCatalogo(datos) ?? { productos: [] };
  cont.innerHTML = `
    <h2 style="margin-top:0">Catálogo</h2>
    <p class="sub">Los productos que vendes, con su precio. Después escribes «vendí 3 botellas de jugo» o «15 galletas a granel» y el bot calcula el total.</p>
    ${cat.productos.map((p, i) => `<section class="tarjeta" style="margin-bottom:.6rem">
      <div class="fila-tope"><b>${esc(p.nombre)}</b><button class="chip" data-quitar="${i}">Quitar</button></div>
      <ul class="lista" style="margin-top:.5rem">${p.presentaciones.map((x, j) => `<li class="fila" data-precio="${i}:${j}">
        <span class="titulo">${esc(x.nombre)}</span><span class="monto">${formatear(x.precio)}</span></li>`).join('')}</ul>
      <div class="acciones"><button class="secundario" data-mas="${i}">Agregar presentación</button></div></section>`).join('') || '<p class="vacio">Todavía no hay productos.</p>'}
    <div class="acciones"><button class="primario" id="nuevoProducto">Agregar producto</button></div>
    <p class="sub">Toca un precio para cambiarlo.</p>`;

  const guardar = async (c: Catalogo) => { await guardarConfig('catalogo', JSON.stringify(c)); await vistaCatalogo(cont); };
  const pedirPresentaciones = (): Producto['presentaciones'] | null => {
    const t = prompt('Presentaciones y precios, separadas por coma.\nEjemplo: granel=500, paquete de 4=3000, paquete de 10=6000');
    if (t === null) return null;
    const lista = t.split(',').map(x => presentacionDeTexto(x)).filter((x): x is NonNullable<typeof x> => x !== null);
    if (!lista.length) { alert('No entendí. Escríbelas así: granel=500, paquete de 10=6000'); return null; }
    return lista;
  };

  cont.querySelector('#nuevoProducto')!.addEventListener('click', async () => {
    const nombre = (prompt('Nombre del producto (por ejemplo: Galletas):') ?? '').trim();
    if (!nombre) return;
    const presentaciones = pedirPresentaciones();
    if (!presentaciones) return;
    const id = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto';
    await guardar({ productos: [...cat.productos.filter(p => p.id !== id), { id, nombre, alias: [], presentaciones }] });
  });
  cont.addEventListener('click', async e => {
    const el = e.target as HTMLElement;
    const quitar = el.closest<HTMLElement>('[data-quitar]');
    const mas = el.closest<HTMLElement>('[data-mas]');
    const precio = el.closest<HTMLElement>('[data-precio]');
    if (quitar) {
      const p = cat.productos[Number(quitar.dataset.quitar)];
      if (confirm(`¿Quitar «${p.nombre}» del catálogo? Las ventas ya guardadas no cambian.`)) await guardar({ productos: cat.productos.filter(x => x !== p) });
    } else if (mas) {
      const nuevas = pedirPresentaciones();
      if (nuevas) await guardar({ productos: cat.productos.map((p, i) => (i === Number(mas.dataset.mas) ? { ...p, presentaciones: [...p.presentaciones, ...nuevas] } : p)) });
    } else if (precio) {
      const [i, j] = precio.dataset.precio!.split(':').map(Number);
      const pres = cat.productos[i].presentaciones[j];
      const nuevo = presentacionDeTexto(`${pres.nombre}=${prompt(`Nuevo precio de «${pres.nombre}»:`, String(pres.precio)) ?? ''}`);
      if (nuevo) await guardar({ productos: cat.productos.map((p, a) => (a === i ? { ...p, presentaciones: p.presentaciones.map((x, b) => (b === j ? { ...x, precio: nuevo.precio } : x)) } : p)) });
    }
  });
}
