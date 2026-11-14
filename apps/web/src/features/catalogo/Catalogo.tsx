/**
 * Dos pantallas sencillas del menú «Más»: el catálogo de productos y la lista de compras.
 * Los datos viven en `config` (catalogo y lista_compras), así se guardan sin conexión y se sincronizan
 * como todo lo demás. Para pedir un dato se usa el cuadro del navegador (prompt), igual que el PIN.
 */
import { Package } from 'lucide-preact';
import { aLocal, conConteo, existenciasDe, formatear, leerCatalogo, presentacionDeTexto, type Catalogo as CatalogoDatos, type Producto } from '../../../../../packages/core/src/index.ts';
import { Vacio } from '../../components/ui/iconos.tsx';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

const idDe = (nombre: string): string =>
  nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto';

function pedirPresentaciones(): Producto['presentaciones'] | null {
  const t = prompt('Presentaciones y precios, separadas por coma.\nEjemplo: granel=500, paquete de 4=3000, paquete de 10=6000');
  if (t === null) return null;
  const lista = t.split(',').map(x => presentacionDeTexto(x)).filter((x): x is NonNullable<typeof x> => x !== null);
  if (!lista.length) { alert('No entendí. Escríbelas así: granel=500, paquete de 10=6000'); return null; }
  return lista;
}

export function Catalogo() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <Cargando />;
  const cat: CatalogoDatos = leerCatalogo(datos) ?? { productos: [] };
  const quedan = (p: Producto) => existenciasDe(p, datos.movimientos);
  const guardar = (c: CatalogoDatos) => guardarCambio(() => app.repo.setConfig('catalogo', JSON.stringify(c)));

  const nuevoProducto = async () => {
    const nombre = (prompt('Nombre del producto (por ejemplo: Galletas):') ?? '').trim();
    if (!nombre) return;
    const presentaciones = pedirPresentaciones();
    if (!presentaciones) return;
    const id = idDe(nombre);
    await guardar({ productos: [...cat.productos.filter(p => p.id !== id), { id, nombre, alias: [], presentaciones }] });
  };
  const quitar = async (p: Producto) => {
    if (confirm(`¿Quitar «${p.nombre}» del catálogo? Las ventas ya guardadas no cambian.`)) await guardar({ productos: cat.productos.filter(x => x !== p) });
  };
  const agregarPresentacion = async (i: number) => {
    const nuevas = pedirPresentaciones();
    if (nuevas) await guardar({ productos: cat.productos.map((p, a) => (a === i ? { ...p, presentaciones: [...p.presentaciones, ...nuevas] } : p)) });
  };
  /** Dice cuántas unidades hay (o cuántas llegaron, con `sumar`). Desde ese momento las ventas las van restando. */
  const contar = async (p: Producto, sumar: boolean) => {
    const quedan = existenciasDe(p, datos.movimientos) ?? 0;
    const t = prompt(sumar ? `¿Cuántas unidades de «${p.nombre}» llegaron?` : `¿Cuántas unidades de «${p.nombre}» tienes ahora?`, sumar ? '' : String(quedan));
    if (t === null) return;
    const n = Math.round(Number(t.replace(/\D/g, '')));
    if (!t.trim() || !Number.isFinite(n) || n < 0 || n > 1_000_000) { alert('No entendí ese número.'); return; }
    await guardar(conConteo(cat, p, sumar ? quedan + n : n, aLocal(ctx.ahora)));
  };
  const cambiarPrecio = async (i: number, j: number) => {
    const pres = cat.productos[i].presentaciones[j];
    const nuevo = presentacionDeTexto(`${pres.nombre}=${prompt(`Nuevo precio de «${pres.nombre}»:`, String(pres.precio)) ?? ''}`);
    if (nuevo) await guardar({ productos: cat.productos.map((p, a) => (a === i ? { ...p, presentaciones: p.presentaciones.map((x, b) => (b === j ? { ...x, precio: nuevo.precio } : x)) } : p)) });
  };

  return (
    <div class="pb-10">
      <Nota>Los productos que vendes, con su precio. Después escribes «vendí 3 botellas de jugo» o «15 galletas a granel» y el bot calcula el total.</Nota>
      {cat.productos.length ? cat.productos.map((p, i) => (
        <section key={p.id} class="tarjeta" style={{ marginBottom: '.6rem' }}>
          <div class="fila-tope"><b>{p.nombre}</b>{quedan(p) !== null && <span class={`insig-tope ${(quedan(p) ?? 0) > 5 ? 'con' : ''}`}>Quedan {quedan(p)}</span>}<button class="chip" onClick={() => void quitar(p)}>Quitar</button></div>
          <ul class="lista" style={{ marginTop: '.5rem' }}>
            {p.presentaciones.map((x, j) => (
              <li key={x.nombre} class="fila" onClick={() => void cambiarPrecio(i, j)}>
                <span class="titulo">{x.nombre}</span><span class="monto">{formatear(x.precio)}</span>
              </li>
            ))}
          </ul>
          <div class="acciones">
            <button class="secundario" onClick={() => void agregarPresentacion(i)}>Agregar presentación</button>
            <button class="secundario" onClick={() => void contar(p, false)}>{quedan(p) === null ? 'Llevar existencias' : 'Contar de nuevo'}</button>
            {quedan(p) !== null && <button class="secundario" onClick={() => void contar(p, true)}>Llegó mercancía</button>}
          </div>
        </section>
      )) : <Vacio Icono={Package} titulo="Todavía no hay productos" detalle="Agrégalos para poder vender desde el chat." tono="cian" />}
      <div class="acciones"><button class="primario" onClick={() => void nuevoProducto()}>Agregar producto</button></div>
      <Nota>Toca un precio para cambiarlo. Si llevas existencias, cada venta resta las unidades y el chat avisa cuando no alcanzan o quedan pocas.</Nota>
    </div>
  );
}
