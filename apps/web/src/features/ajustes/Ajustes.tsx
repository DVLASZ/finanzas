/**
 * Ajustes: apariencia, conexión con el servidor, avisos, seguridad (PIN), respaldo, Excel y la zona de peligro.
 * Es una pantalla larga hecha de secciones cortas; cada una guarda su propio mensaje de estado.
 */
import { useEffect, useState } from 'preact/hooks';
import { excelDeDatos, type Movimiento } from '../../../../../packages/core/src/index.ts';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { avisar, confirmar, pedir } from '../../components/ui/Dialogo.tsx';
import { escribir, leer, vaciar } from '../../services/almacen.ts';
import { activarAvisos, apagarAvisos, avisosActivados, probarAvisos } from '../../services/avisos.ts';
import { app, guardarAjustes, hayServidor, leerTodo, limpiarRechazados } from '../../services/estado.ts';
import { cabeceraJson, urlBase } from '../../services/http.ts';
import { hash, pinCorrecto } from '../../services/seguridad.ts';
import { leerSalud } from '../../services/servidor.ts';
import { sincronizar } from '../../services/sincronizacion.ts';
import { refrescar, datos as datosSignal, pendientes } from '../../state/store.ts';
import { editorAtajos } from '../../state/atajos.ts';
import { Apariencia } from './Apariencia.tsx';

/** Pide el PIN (o avisa que hay que crearlo). Devuelve true si se puede continuar. */
async function pedirPin(motivo: string): Promise<boolean> {
  if (!app.ajustes.pinHash) {
    await avisar({ titulo: 'Primero crea un PIN', texto: 'En Ajustes, sección Seguridad. El PIN protege las acciones que borran datos.', tono: 'peligro' });
    return false;
  }
  const pin = await pedir({ titulo: 'Escribe tu PIN', texto: motivo, tipo: 'clave', aceptar: 'Continuar' });
  if (pin === null) return false;
  if (!(await pinCorrecto(pin))) { await avisar({ titulo: 'PIN incorrecto', texto: 'No se hizo nada.', tono: 'peligro' }); return false; }
  return true;
}

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Un botón de la zona de peligro: PIN, frase escrita, cuenta regresiva de 5 segundos y una última confirmación. */
function BotonPeligro({ texto, motivo, frase, ruta, local }: { texto: string; motivo: string; frase: string; ruta: string; local: () => Promise<void> }) {
  const [espera, setEspera] = useState(0);
  const ejecutar = async () => {
    if (!(await pedirPin(motivo))) return;
    if ((await pedir({ titulo: 'Para confirmar, escribe esta frase', texto: frase, placeholder: frase, aceptar: 'Continuar' })) !== frase) { await avisar({ titulo: 'La frase no coincide', texto: 'No se borró nada.', tono: 'peligro' }); return; }
    for (let n = 5; n > 0; n--) { setEspera(n); await esperar(1000); }
    setEspera(0);
    if (!(await confirmar({ titulo: 'Última oportunidad', texto: 'Esto no se puede deshacer. ¿Continuar?', aceptar: 'Sí, borrar', peligro: true }))) return;
    if (hayServidor()) {
      const pin = (await pedir({ titulo: 'PIN del servidor', texto: 'El PIN_BORRADO, si lo configuraste. Si no, déjalo vacío.', tipo: 'clave', aceptar: 'Continuar' })) ?? '';
      const r = await fetch(`${urlBase()}${ruta}`, { method: 'POST', headers: cabeceraJson(), body: JSON.stringify({ pin, confirmacion: frase }) });
      if (!r.ok) { await avisar({ titulo: `El servidor no lo permitió (${r.status})`, texto: 'No se borró nada.', tono: 'peligro' }); return; }
    }
    await local();
    await avisar({ titulo: 'Listo', tono: 'info' });
    await refrescar();
  };
  return <button class="peligro" disabled={espera > 0} onClick={() => void ejecutar()}>{espera > 0 ? `Borrar ahora (${espera})` : texto}</button>;
}

export function Ajustes() {
  const datos = datosSignal.value;
  const [, repintar] = useState(0);
  const otra = () => repintar(n => n + 1);
  const [url, setUrl] = useState(app.ajustes.url);
  const [token, setToken] = useState(app.ajustes.token);
  const [msgSync, setMsgSync] = useState(app.ultimoError ? `Último error: ${app.ultimoError}` : '');
  const [msgAvisos, setMsgAvisos] = useState('');
  const [msgSalud, setMsgSalud] = useState(hayServidor() ? '' : 'Conecta primero el servidor arriba.');
  const [msgRespaldo, setMsgRespaldo] = useState('');
  const [msgHistorial, setMsgHistorial] = useState('');
  const [instalador, setInstalador] = useState<{ prompt(): Promise<void> } | undefined>(undefined);
  useEffect(() => {
    void avisosActivados().then(si => setMsgAvisos(si ? 'Los avisos están activados en este celular.' : 'Los avisos están apagados.'));
    setInstalador((window as unknown as { __instalar?: { prompt(): Promise<void> } }).__instalar);
  }, []);
  if (!datos) return <Cargando />;

  const a = app.ajustes;
  const soportaArchivo = typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';

  const guardarYSincronizar = async () => {
    await guardarAjustes({ ...app.ajustes, url: url.trim(), token: token.trim() });
    setMsgSync('Sincronizando…');
    setMsgSync(await sincronizar());
    await refrescar();
    otra();
  };
  const cambiarPin = async () => {
    if (app.ajustes.pinHash && !(await pedirPin('Para cambiar el PIN'))) return;
    const nuevo = (await pedir({ titulo: 'Nuevo PIN', texto: 'De 4 a 8 dígitos.', tipo: 'clave', aceptar: 'Guardar PIN' })) ?? '';
    if (!nuevo) return;
    if (!/^\d{4,8}$/.test(nuevo)) { await avisar({ titulo: 'El PIN debe tener entre 4 y 8 dígitos', tono: 'peligro' }); return; }
    await guardarAjustes({ ...app.ajustes, pinHash: await hash(nuevo) });
    otra();
  };
  const verSalud = async () => {
    setMsgSalud('Preguntando...');
    const s = await leerSalud();
    setMsgSalud(typeof s === 'string' ? s
      : `Movimientos: ${s.movimientos}. Último: ${s.ultimoMovimiento ? s.ultimoMovimiento.slice(0, 16) : 'ninguno'}. Saldos desde: ${s.desdeCuando ? s.desdeCuando.slice(0, 10) : 'falta el saldo inicial'}. Celulares con avisos: ${s.celularesConAvisos}. Fotos de recibos: ${s.fotos?.cantidad ?? 0} (${s.fotos ? Math.round(s.fotos.kb / 1024 * 10) / 10 : 0} MB, el tope gratis de la base es 5.000 MB). Ayuda de la IA: ${s.ia.encendida ? 'encendida' : 'apagada'}.`);
  };
  const descargarExcel = async () => {
    const { datos: d } = await leerTodo();
    const archivo = new Blob([excelDeDatos(d) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = `finanzas-${new Date().toISOString().slice(0, 10)}.xlsx`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
  };

  const actualizarRespaldo = async () => {
    const { datos: d } = await leerTodo();
    const contenido = JSON.stringify({ version: 1, creadoEn: new Date().toISOString(), datos: d, cola: app.repo.cola }, null, 1);
    try {
      if (soportaArchivo) {
        const w = window as unknown as { showSaveFilePicker(o: unknown): Promise<FileSystemFileHandle> };
        let h = await leer<FileSystemFileHandle>('respaldoHandle');
        if (h) {
          const permiso = await (h as unknown as { requestPermission(o: unknown): Promise<string> }).requestPermission({ mode: 'readwrite' });
          if (permiso !== 'granted') h = undefined;
        }
        if (!h) {
          h = await w.showSaveFilePicker({ suggestedName: 'respaldo-finanzas.json', types: [{ description: 'Respaldo JSON', accept: { 'application/json': ['.json'] } }] });
          await escribir('respaldoHandle', h);
        }
        const flujo = await h.createWritable();
        await flujo.write(contenido);
        await flujo.close();
        setMsgRespaldo(`Respaldo actualizado (${new Date().toLocaleString('es-CO')}).`);
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.warn('No se pudo sobrescribir el archivo; se descarga uno nuevo.', e);
    }
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'respaldo-finanzas.json' }).click();
    URL.revokeObjectURL(url);
    setMsgRespaldo('Respaldo descargado.');
  };
  const restaurar = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!(await pedirPin('Restaurar reemplaza los datos de este dispositivo'))) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.datos?.movimientos) throw new Error('El archivo no parece un respaldo.');
      app.local.datos = j.datos;
      await app.local.persistir();
      app.repo.cola.splice(0, app.repo.cola.length, ...(j.cola ?? []));
      await escribir('cola', app.repo.cola);
      setMsgRespaldo(`Restaurado: ${j.datos.movimientos.length} movimientos.`);
    } catch (err) { setMsgRespaldo('No se pudo restaurar: ' + (err as Error).message); }
  };
  const importarHistorial = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const lista = JSON.parse(await f.text()) as Movimiento[];
      const existentes = new Set((await app.local.cargar()).movimientos.map(m => m.id));
      let nuevos = 0;
      for (const m of lista) {
        if (existentes.has(m.id)) continue;
        await app.repo.guardarMovimiento(m, [], []);
        nuevos++;
      }
      setMsgHistorial(`Importados ${nuevos} movimientos (${lista.length - nuevos} ya estaban).`);
      void sincronizar();
    } catch (err) { setMsgHistorial('No se pudo importar: ' + (err as Error).message); }
  };

  return (
    <div class="pb-10">
      <h2 style={{ marginTop: 0 }}>Letra y colores</h2>
      <Apariencia />

      <h2>Botones rápidos del chat</h2>
      <p class="sub">Los botones de arriba del cuadro de escribir los armas tú: plantillas para completar o frases listas. También puedes ocultar la barra.</p>
      <div class="acciones"><button class="secundario" id="editar-atajos" onClick={() => { editorAtajos.value = true; }}>Editar mis botones</button></div>

      <h2>Conexión con el servidor</h2>
      <Nota>
        {hayServidor() ? 'Conectado a tu servidor.' : 'Modo local: todo se guarda en este dispositivo. Cuando tengas el servidor, agrégalo aquí.'}{' '}
        Cambios por enviar: <b>{pendientes.value}</b>{app.ultimoSync ? ` · última sincronización: ${app.ultimoSync}` : ''}
      </Nota>
      <label>Dirección del servidor<input type="url" placeholder="https://finanzas.tu-subdominio.workers.dev" value={url} onInput={e => setUrl((e.target as HTMLInputElement).value)} /></label>
      <label>Token de acceso<input type="password" autocomplete="off" placeholder="(el API_TOKEN que definiste)" value={token} onInput={e => setToken((e.target as HTMLInputElement).value)} /></label>
      <div class="acciones"><button class="primario" onClick={() => void guardarYSincronizar()}>Guardar y sincronizar</button></div>
      <p class="sub" aria-live="polite">{msgSync}</p>

      {app.rechazados.length > 0 && <>
        <h2>Cambios que el servidor no aceptó</h2>
        <Nota>Estos cambios no se pudieron guardar en el servidor. Anótalos de nuevo si hacen falta.</Nota>
        <ul class="lista">{app.rechazados.map(x => <li key={`${x.cuando}${x.que}`} class="fila"><div><div class="titulo">{x.que}</div><div class="sub">{x.motivo}</div></div></li>)}</ul>
        <div class="acciones"><button class="secundario" onClick={() => void limpiarRechazados().then(otra)}>Borrar esta lista</button></div>
      </>}

      <h2>Avisos en este celular</h2>
      <Nota>Te aviso cada mañana si una deuda está por vencer, si pasas un tope de gasto o si llevas varios días sin anotar nada.</Nota>
      <div class="acciones">
        <button class="primario" onClick={async () => { setMsgAvisos('Un momento...'); setMsgAvisos(await activarAvisos()); }}>Activar avisos</button>
        <button class="secundario" onClick={async () => { setMsgAvisos('Mandando...'); setMsgAvisos(await probarAvisos()); }}>Mandar una prueba</button>
        <button class="secundario" onClick={async () => setMsgAvisos(await apagarAvisos())}>Apagar</button>
      </div>
      <p class="sub" aria-live="polite">{msgAvisos}</p>

      <h2>Estado del servidor</h2>
      <div class="acciones"><button class="secundario" disabled={!hayServidor()} onClick={() => void verSalud()}>Ver cómo va el servidor</button></div>
      <p class="sub" aria-live="polite">{msgSalud}</p>

      <h2>Seguridad</h2>
      <Nota>El PIN protege las acciones que borran datos. {a.pinHash ? 'Ya tienes un PIN.' : 'Aún no tienes PIN.'}</Nota>
      <div class="acciones"><button class="secundario" onClick={() => void cambiarPin()}>{a.pinHash ? 'Cambiar PIN' : 'Crear PIN'}</button></div>

      <h2>Respaldo</h2>
      <Nota>{soportaArchivo ? 'En este navegador, «Actualizar respaldo» sobrescribe siempre el mismo archivo (eliges dónde la primera vez; el navegador puede pedirte permiso).' : 'Este navegador descargará un archivo nuevo cada vez (en el PC con Chrome o Edge se puede sobrescribir el mismo).'}</Nota>
      <div class="acciones">
        <button class="primario" onClick={() => void actualizarRespaldo()}>Actualizar respaldo</button>
        <label class="secundario archivo">Restaurar respaldo<input type="file" accept="application/json" hidden onChange={restaurar} /></label>
      </div>
      <p class="sub" aria-live="polite">{msgRespaldo}</p>

      <h2>Pasar a Excel</h2>
      <Nota>Baja un archivo de Excel con todos tus movimientos, saldos, deudas y un resumen por mes.</Nota>
      <div class="acciones"><button class="secundario" onClick={() => void descargarExcel()}>Descargar Excel</button></div>

      <h2>Historial del Excel</h2>
      <Nota>Carga el archivo <code>importacion/historial.json</code> que genera el importador. Es seguro repetirlo: no duplica.</Nota>
      <div class="acciones"><label class="secundario archivo">Importar historial<input type="file" accept="application/json" hidden onChange={importarHistorial} /></label></div>
      <p class="sub" aria-live="polite">{msgHistorial}</p>

      <h2>Instalar la app</h2>
      {instalador && <div class="acciones"><button class="secundario" onClick={() => void instalador.prompt()}>Instalar en este dispositivo</button></div>}
      <Nota>En el celular: menú del navegador, «Instalar app» o «Añadir a pantalla de inicio».</Nota>

      <h2 class="peligro-titulo">Zona de peligro</h2>
      <Nota>Estas acciones borran datos de verdad. Piden tu PIN, que escribas una frase y esperan unos segundos. Lo normal es <b>anular</b>, no borrar.</Nota>
      <div class="acciones">
        <BotonPeligro texto="Borrar definitivamente lo anulado" motivo="Borrar lo anulado" frase="PURGAR ANULADOS" ruta="/api/purgar"
          local={async () => { app.local.datos.movimientos = app.local.datos.movimientos.filter(m => m.estado === 'ok'); await app.local.persistir(); }} />
        <BotonPeligro texto="Borrar TODO" motivo="Borrar TODO" frase="BORRAR TODO MIS DATOS" ruta="/api/borrar-todo"
          local={async () => {
            const ajustes = app.ajustes; // se conservan servidor, token y PIN: solo se borran los datos
            await vaciar();
            await escribir('ajustes', ajustes);
            location.reload();
          }} />
      </div>
      <p class="sub">{datos.movimientos.length} movimientos en este dispositivo.</p>
    </div>
  );
}
