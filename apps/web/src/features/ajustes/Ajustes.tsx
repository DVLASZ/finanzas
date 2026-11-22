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
import { crearHashPin, intentarPin, textoDeFallo } from '../../services/seguridad.ts';
import { modoBloqueo, ponerModoBloqueo, type ModoBloqueo } from '../../state/bloqueo.ts';
import { leerSalud } from '../../services/servidor.ts';
import { reenviarRechazado, sincronizar } from '../../services/sincronizacion.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { refrescar, datos as datosSignal, pendientes } from '../../state/store.ts';
import { editorAtajos } from '../../state/atajos.ts';
import { actividad, anotarActividad, cargarActividad, ETIQUETA } from '../../services/actividad.ts';
import { cifrarRespaldo, descifrarRespaldo, estaCifrado } from '../../services/cifrado.ts';
import { Selector } from '../../components/ui/Selector.tsx';
import { ponerSonidos, sonidos } from '../../lib/sonido.ts';
import { Apariencia } from './Apariencia.tsx';
import { Reglas } from './Reglas.tsx';
import { EstadoSync } from '../../components/ui/EstadoSync.tsx';
import { alternarPrivacidad, montosOcultos } from '../../state/privacidad.ts';

/** Pide el PIN (o avisa que hay que crearlo). Devuelve true si se puede continuar. */
async function pedirPin(motivo: string): Promise<boolean> {
  if (!app.ajustes.pinHash) {
    await avisar({ titulo: 'Primero crea un PIN', texto: 'En Ajustes, sección Seguridad. El PIN protege las acciones que borran datos.', tono: 'peligro' });
    return false;
  }
  const pin = await pedir({ titulo: 'Escribe tu PIN', texto: motivo, tipo: 'clave', aceptar: 'Continuar' });
  if (pin === null) return false;
  const r = await intentarPin(pin);
  if (!r.ok) { await avisar({ titulo: textoDeFallo(r), texto: 'No se hizo nada.', tono: 'peligro' }); return false; }
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

/** Las horas del recordatorio: en punto y y media, de 7 a 10 de la noche. */
const HORAS_RECORDATORIO = [{ valor: '', etiqueta: 'Apagado' }, ...[19, 20, 21, 22].flatMap(h => ['00', '30'].map(m => ({
  valor: `${h}:${m}`, etiqueta: `${h - 12}:${m} pm`,
})))];

const MODOS_BLOQUEO = [
  { valor: 'nunca', etiqueta: 'Apagado' }, { valor: 'fondo', etiqueta: 'Al pasar a segundo plano' },
  { valor: '2', etiqueta: 'Tras 2 minutos sin usarla' }, { valor: '5', etiqueta: 'Tras 5 minutos sin usarla' },
];

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
    void cargarActividad();
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
    await guardarAjustes({ ...app.ajustes, pinHash: await crearHashPin(nuevo) });
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
        anotarActividad('respaldo', 'Respaldo actualizado');
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
    anotarActividad('respaldo', 'Respaldo descargado');
    setMsgRespaldo('Respaldo descargado.');
  };
  /** Respaldo cifrado en el navegador (PBKDF2 + AES-GCM): sin la contraseña el archivo no se puede abrir, y la app no la guarda. */
  const respaldoConContrasena = async () => {
    const c1 = await pedir({ titulo: 'Contraseña del respaldo', texto: 'Mínimo 8 caracteres. Si la pierdes, el respaldo no se puede abrir: no hay forma de recuperarla.', tipo: 'clave', aceptar: 'Siguiente' });
    if (c1 === null) return;
    if (c1.length < 8) { await avisar({ titulo: 'La contraseña es muy corta', texto: 'Usa al menos 8 caracteres.', tono: 'peligro' }); return; }
    const c2 = await pedir({ titulo: 'Repite la contraseña', tipo: 'clave', aceptar: 'Crear respaldo' });
    if (c2 === null) return;
    if (c1 !== c2) { await avisar({ titulo: 'No coinciden', texto: 'Las dos contraseñas tienen que ser iguales.', tono: 'peligro' }); return; }
    setMsgRespaldo('Cifrando...');
    const { datos: d } = await leerTodo();
    const archivo = await cifrarRespaldo(JSON.stringify({ version: 1, creadoEn: new Date().toISOString(), datos: d, cola: app.repo.cola }), c1);
    const url = URL.createObjectURL(new Blob([archivo], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'respaldo-finanzas-cifrado.json' }).click();
    URL.revokeObjectURL(url);
    anotarActividad('respaldo', 'Respaldo cifrado con contraseña');
    setMsgRespaldo('Respaldo cifrado descargado. Guarda bien la contraseña.');
  };
  const restaurar = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!(await pedirPin('Restaurar reemplaza los datos de este dispositivo'))) return;
    try {
      let texto = await f.text();
      if (estaCifrado(texto)) {
        const clave = await pedir({ titulo: 'Contraseña del respaldo', texto: 'Este respaldo está cifrado.', tipo: 'clave', aceptar: 'Abrir' });
        if (clave === null) return;
        texto = await descifrarRespaldo(texto, clave);
      }
      const j = JSON.parse(texto);
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

      <h2>Privacidad de los montos</h2>
      <label class="fila-interruptor">
        <span>Ocultar los montos en pantalla<span class="sub block">Los cambia por puntos, para mirar la app en la calle.</span></span>
        <input type="checkbox" id="ojo-ajustes" role="switch" class="interruptor" checked={montosOcultos.value} onChange={alternarPrivacidad} />
      </label>

      <h2>Botones rápidos del chat</h2>
      <p class="sub">Los botones de arriba del cuadro de escribir los armas tú: plantillas para completar o frases listas. También puedes ocultar la barra.</p>
      <div class="acciones"><button class="secundario" id="editar-atajos" onClick={() => { editorAtajos.value = true; }}>Editar mis botones</button></div>

      <h2>Reglas aprendidas</h2>
      <Reglas />

      <h2>Conexión con el servidor</h2>
      <div class="mb-2"><EstadoSync /></div>
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
        <ul class="lista">{app.rechazados.map((x, i) => <li key={`${x.cuando}${x.que}${i}`} class="fila"><div><div class="titulo">{x.que}</div><div class="sub">{x.motivo}</div></div>{x.op && <button class="secundario" onClick={() => void reenviarRechazado(i).then(otra)}>Reenviar</button>}</li>)}</ul>
        <div class="acciones"><button class="secundario" onClick={() => void limpiarRechazados().then(otra)}>Borrar esta lista</button></div>
      </>}

      <h2>Sonido y recordatorio</h2>
      <label class="check-chip check !my-2"><input type="checkbox" id="sonidos" checked={sonidos.value} onChange={e => ponerSonidos((e.target as HTMLInputElement).checked)} />Sonido suave al confirmar y al leer un comprobante</label>
      <p class="sub">Va apagado. No suena si tu teléfono pidió menos movimiento. La vibración corta es aparte y sigue igual.</p>
      <div class="mt-2 max-w-sm">
        <Selector id="recordatorio" etiqueta="Recordatorio nocturno" valor={datos.config.recordatorio ?? ''} opciones={HORAS_RECORDATORIO}
          alCambiar={v => void guardarCambio(() => app.repo.setConfig('recordatorio', v))} />
      </div>
      <p class="sub">Un aviso a esa hora que pregunta «¿Anotaste los gastos de hoy?» y abre el chat. Solo llega si hoy no anotaste nada y si activaste los avisos aquí abajo.</p>

      <h2>Avisos en este celular</h2>
      <Nota>Te aviso cada mañana si una deuda está por vencer o si llevas varios días sin anotar nada.</Nota>
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
      <div class="mt-2 max-w-sm">
        <Selector id="bloqueo-modo" etiqueta="Bloqueo automático" valor={modoBloqueo.value} opciones={MODOS_BLOQUEO} alCambiar={v => {
          if (v !== 'nunca' && !app.ajustes.pinHash) { void avisar({ titulo: 'Primero crea un PIN', texto: 'El bloqueo usa tu PIN para volver a entrar.', tono: 'peligro' }); return; }
          ponerModoBloqueo(v as ModoBloqueo);
        }} />
      </div>
      <Nota>Con un PIN puedes pedirlo al abrir la app y cada vez que pase a segundo plano o pasen 2 o 5 minutos sin tocarla. Si te equivocas varias veces, la app te hace esperar más cada vez. Es una barrera para quien agarre tu teléfono desbloqueado.</Nota>

      <h2>Respaldo</h2>
      <Nota>{soportaArchivo ? 'En este navegador, «Actualizar respaldo» sobrescribe siempre el mismo archivo (eliges dónde la primera vez; el navegador puede pedirte permiso).' : 'Este navegador descargará un archivo nuevo cada vez (en el PC con Chrome o Edge se puede sobrescribir el mismo).'}</Nota>
      <div class="acciones">
        <button class="primario" onClick={() => void actualizarRespaldo()}>Actualizar respaldo</button>
        <button class="secundario" id="respaldo-cifrado" onClick={() => void respaldoConContrasena()}>Respaldo con contraseña</button>
        <label class="secundario archivo">Restaurar respaldo<input type="file" accept="application/json" hidden onChange={restaurar} /></label>
      </div>
      <p class="sub" aria-live="polite">{msgRespaldo}</p>

      <h2>Actividad reciente</h2>
      <Nota>Lo que pasó con la app en este celular: sincronizaciones con cambios, ediciones, respaldos, PIN y bloqueos. No guarda montos ni conceptos.</Nota>
      <ul class="lista" id="actividad">
        {actividad.value.length === 0 && <li class="vacio">Todavía no hay actividad.</li>}
        {actividad.value.slice(0, 15).map(x => (
          <li key={x.t + x.detalle} class="fila" style={{ cursor: 'default' }}><div class="min-w-0"><div class="titulo">{ETIQUETA[x.tipo]}</div><div class="sub">{x.detalle}</div></div><span class="sub shrink-0">{new Date(x.t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></li>
        ))}
      </ul>

      <h2>Pasar a Excel</h2>
      <Nota>Baja un archivo de Excel con todos tus movimientos, saldos, deudas y un resumen por mes.</Nota>
      <div class="acciones"><button class="secundario" onClick={() => void descargarExcel()}>Descargar Excel</button></div>

      <h2>Historial del Excel</h2>
      <Nota>Carga el archivo <code>importacion/<wbr />historial.<wbr />json</code> que genera el importador. Es seguro repetirlo: no duplica.</Nota>
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
