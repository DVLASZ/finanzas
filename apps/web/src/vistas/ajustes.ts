import { actualizarEstado } from './estado.ts';
import { $ } from './dom.ts';
import { excelDeDatos, type Movimiento } from '../../../../packages/core/src/index.ts';
import { elegir as elegirApariencia } from '../apariencia.ts';
import { seccionApariencia } from '../aparienciaVista.ts';
import { activarAvisos, apagarAvisos, app, avisosActivados, guardarAjustes, probarAvisos, hash, hayServidor, leerSalud, leerTodo, limpiarRechazados, pendientesDeEnviar, pinCorrecto, sincronizar } from '../app.ts';
import { escribir, leer, vaciar } from '../almacen.ts';
import { esc } from '../carta.ts';


/** Pide el PIN (o lo crea si aún no hay uno). Devuelve true si se puede continuar. */
async function pedirPin(motivo: string): Promise<boolean> {
  if (!app.ajustes.pinHash) {
    alert('Primero crea un PIN en Ajustes → Seguridad. Protege las acciones que borran datos.');
    return false;
  }
  const pin = prompt(`${motivo}\nEscribe tu PIN:`);
  if (pin === null) return false;
  if (!(await pinCorrecto(pin))) { alert('PIN incorrecto.'); return false; }
  return true;
}

/** Espera N segundos mostrando una cuenta regresiva en un botón (capa extra contra borrados por error). */
function cuentaRegresiva(boton: HTMLButtonElement, segundos: number, texto: string): Promise<void> {
  return new Promise(resolver => {
    let n = segundos;
    boton.disabled = true;
    const t = setInterval(() => {
      n--;
      boton.textContent = n > 0 ? `${texto} (${n})` : texto;
      if (n <= 0) { clearInterval(t); boton.disabled = false; resolver(); }
    }, 1000);
    boton.textContent = `${texto} (${n})`;
  });
}

export async function vistaAjustes(cont: HTMLElement): Promise<void> {
  const { datos } = await leerTodo();
  const a = app.ajustes;
  const soportaArchivo = typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
  cont.innerHTML = `
    <h2 style="margin-top:0">Letra y colores</h2>
    <div class="apariencia" id="apariencia">${seccionApariencia()}</div>

    <h2>Conexión con el servidor</h2>
    <p class="sub">${hayServidor() ? 'Conectado a tu servidor.' : 'Modo local: todo se guarda en este dispositivo. Cuando tengas el servidor, agrégalo aquí.'}
       Cambios por enviar: <b>${pendientesDeEnviar()}</b>${app.ultimoSync ? ` · última sincronización: ${esc(app.ultimoSync)}` : ''}</p>
    <label>Dirección del servidor<input id="url" type="url" placeholder="https://finanzas.tu-subdominio.workers.dev" value="${esc(a.url)}" /></label>
    <label>Token de acceso<input id="token" type="password" autocomplete="off" placeholder="(el API_TOKEN que definiste)" value="${esc(a.token)}" /></label>
    <div class="acciones"><button class="primario" id="sync">Guardar y sincronizar</button></div>
    <p class="sub" id="msgSync">${app.ultimoError ? 'Último error: ' + esc(app.ultimoError) : ''}</p>

    ${app.rechazados.length ? `<h2>Cambios que el servidor no aceptó</h2>
    <p class="sub">Estos cambios no se pudieron guardar en el servidor. Anótalos de nuevo si hacen falta.</p>
    <ul class="lista">${app.rechazados.map(x => `<li class="fila"><div><div class="titulo">${esc(x.que)}</div><div class="sub">${esc(x.motivo)}</div></div></li>`).join('')}</ul>
    <div class="acciones"><button class="secundario" id="limpiarRech">Borrar esta lista</button></div>` : ''}

    <h2>Avisos en este celular</h2>
    <p class="sub">Te aviso cada mañana si una deuda está por vencer, si pasas un tope de gasto o si llevas varios días sin anotar nada.</p>
    <div class="acciones">
      <button class="primario" id="avisosOn">Activar avisos</button>
      <button class="secundario" id="avisosProbar">Mandar una prueba</button>
      <button class="secundario" id="avisosOff">Apagar</button>
    </div>
    <p class="sub" id="msgAvisos"></p>

    <h2>Estado del servidor</h2>
    <div class="acciones"><button class="secundario" id="salud" ${hayServidor() ? '' : 'disabled'}>Ver cómo va el servidor</button></div>
    <p class="sub" id="msgSalud">${hayServidor() ? '' : 'Conecta primero el servidor arriba.'}</p>

    <h2>Seguridad</h2>
    <p class="sub">El PIN protege las acciones que borran datos. ${a.pinHash ? 'Ya tienes un PIN.' : 'Aún no tienes PIN.'}</p>
    <div class="acciones"><button class="secundario" id="pin">${a.pinHash ? 'Cambiar PIN' : 'Crear PIN'}</button></div>

    <h2>Respaldo</h2>
    <p class="sub">${soportaArchivo ? 'En este navegador, "Actualizar respaldo" sobrescribe siempre el mismo archivo (eliges dónde la primera vez; el navegador puede pedirte permiso).' : 'Este navegador descargará un archivo nuevo cada vez (en el PC con Chrome o Edge se puede sobrescribir el mismo).'}</p>
    <div class="acciones">
      <button class="primario" id="respaldo">Actualizar respaldo</button>
      <label class="secundario archivo">Restaurar respaldo<input type="file" id="restaurar" accept="application/json" hidden /></label>
    </div>
    <p class="sub" id="msgRespaldo"></p>

    <h2>Pasar a Excel</h2>
    <p class="sub">Baja un archivo de Excel con todos tus movimientos, saldos, deudas y un resumen por mes.</p>
    <div class="acciones"><button class="secundario" id="excel">Descargar Excel</button></div>

    <h2>Historial del Excel</h2>
    <p class="sub">Carga el archivo <code>importacion/historial.json</code> que genera el importador. Es seguro repetirlo: no duplica.</p>
    <div class="acciones"><label class="secundario archivo">Importar historial<input type="file" id="historial" accept="application/json" hidden /></label></div>
    <p class="sub" id="msgHistorial"></p>

    <h2>Instalar la app</h2>
    <div class="acciones"><button class="secundario" id="instalar" hidden>Instalar en este dispositivo</button></div>
    <p class="sub">En el celular: menú del navegador → «Instalar app» / «Añadir a pantalla de inicio».</p>

    <h2 class="peligro-titulo">Zona de peligro</h2>
    <p class="sub">Estas acciones borran datos de verdad. Piden tu PIN, que escribas una frase y esperan unos segundos. Lo normal es <b>anular</b>, no borrar.</p>
    <div class="acciones">
      <button class="peligro" id="purgar">Borrar definitivamente lo anulado</button>
      <button class="peligro" id="borrarTodo">Borrar TODO</button>
    </div>
    <p class="sub">${datos.movimientos.length} movimientos en este dispositivo.</p>`;

  const msg = (id: string, t: string) => { $<HTMLElement>(cont, id).textContent = t; };

  $<HTMLElement>(cont, '#sync').addEventListener('click', async () => {
    await guardarAjustes({ ...app.ajustes, url: $<HTMLInputElement>(cont, '#url').value.trim(), token: $<HTMLInputElement>(cont, '#token').value.trim() });
    msg('#msgSync', 'Sincronizando…');
    msg('#msgSync', await sincronizar());
    actualizarEstado();
  });

  cont.querySelector('#limpiarRech')?.addEventListener('click', async () => { await limpiarRechazados(); await vistaAjustes(cont); });

  cont.querySelector('#apariencia')?.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ap]');
    if (!b) return;
    elegirApariencia({ [b.dataset.ap!]: b.dataset.v } as never);
    $<HTMLElement>(cont, '#apariencia').innerHTML = seccionApariencia();
  });

  $<HTMLElement>(cont, '#pin').addEventListener('click', async () => {
    if (app.ajustes.pinHash && !(await pedirPin('Para cambiar el PIN'))) return;
    const nuevo = prompt('Nuevo PIN (4 a 8 dígitos):') ?? '';
    if (!/^\d{4,8}$/.test(nuevo)) { alert('El PIN debe tener entre 4 y 8 dígitos.'); return; }
    await guardarAjustes({ ...app.ajustes, pinHash: await hash(nuevo) });
    await vistaAjustes(cont);
  });

  // --- Avisos
  const msgAvisos = $<HTMLElement>(cont, '#msgAvisos');
  void avisosActivados().then(si => { msgAvisos.textContent = si ? 'Los avisos están activados en este celular.' : 'Los avisos están apagados.'; });
  $<HTMLElement>(cont, '#salud').addEventListener('click', async () => {
    const msg = $<HTMLElement>(cont, '#msgSalud');
    msg.textContent = 'Preguntando...';
    const s = await leerSalud();
    msg.textContent = typeof s === 'string' ? s
      : `Movimientos: ${s.movimientos}. Último: ${s.ultimoMovimiento ? s.ultimoMovimiento.slice(0, 16) : 'ninguno'}. Saldos desde: ${s.desdeCuando ? s.desdeCuando.slice(0, 10) : 'falta el saldo inicial'}. Celulares con avisos: ${s.celularesConAvisos}. Fotos de recibos: ${s.fotos?.cantidad ?? 0} (${s.fotos ? Math.round(s.fotos.kb / 1024 * 10) / 10 : 0} MB, el tope gratis de la base es 5.000 MB). Ayuda de la IA: ${s.ia.encendida ? 'encendida' : 'apagada'}.`;
  });
  $<HTMLElement>(cont, '#avisosOn').addEventListener('click', async () => { msgAvisos.textContent = 'Un momento...'; msgAvisos.textContent = await activarAvisos(); });
  $<HTMLElement>(cont, '#avisosOff').addEventListener('click', async () => { msgAvisos.textContent = await apagarAvisos(); });
  $<HTMLElement>(cont, '#avisosProbar').addEventListener('click', async () => { msgAvisos.textContent = 'Mandando...'; msgAvisos.textContent = await probarAvisos(); });

  // --- Excel
  $<HTMLElement>(cont, '#excel').addEventListener('click', async () => {
    const { datos: d } = await leerTodo();
    const archivo = new Blob([excelDeDatos(d) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = `finanzas-${new Date().toISOString().slice(0, 10)}.xlsx`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
  });

  // --- Respaldo
  const exportar = async () => {
    const { datos: d } = await leerTodo();
    return JSON.stringify({ version: 1, creadoEn: new Date().toISOString(), datos: d, cola: app.repo.cola }, null, 1);
  };
  $<HTMLElement>(cont, '#respaldo').addEventListener('click', async () => {
    const contenido = await exportar();
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
        msg('#msgRespaldo', `Respaldo actualizado (${new Date().toLocaleString('es-CO')}).`);
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.warn('No se pudo sobrescribir el archivo; se descarga uno nuevo.', e);
    }
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
    const enlace = Object.assign(document.createElement('a'), { href: url, download: 'respaldo-finanzas.json' });
    enlace.click();
    URL.revokeObjectURL(url);
    msg('#msgRespaldo', 'Respaldo descargado.');
  });
  $<HTMLInputElement>(cont, '#restaurar').addEventListener('change', async e => {
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
      msg('#msgRespaldo', `Restaurado: ${j.datos.movimientos.length} movimientos.`);
    } catch (err) { msg('#msgRespaldo', 'No se pudo restaurar: ' + (err as Error).message); }
  });

  // --- Historial del Excel
  $<HTMLInputElement>(cont, '#historial').addEventListener('change', async e => {
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
      msg('#msgHistorial', `Importados ${nuevos} movimientos (${lista.length - nuevos} ya estaban).`);
      void sincronizar();
    } catch (err) { msg('#msgHistorial', 'No se pudo importar: ' + (err as Error).message); }
  });

  // --- Instalación
  const pi = (window as unknown as { __instalar?: { prompt(): Promise<void> } }).__instalar;
  if (pi) {
    const b = $<HTMLButtonElement>(cont, '#instalar');
    b.hidden = false;
    b.addEventListener('click', () => void pi.prompt());
  }

  // --- Zona de peligro: PIN + frase + cuenta regresiva
  const borrado = async (boton: HTMLButtonElement, motivo: string, frase: string, ruta: string, local: () => Promise<void>) => {
    if (!(await pedirPin(motivo))) return;
    const escrita = prompt(`Para confirmar escribe exactamente:\n${frase}`);
    if (escrita !== frase) { alert('La frase no coincide. No se borró nada.'); return; }
    const original = boton.textContent ?? '';
    await cuentaRegresiva(boton, 5, 'Borrar ahora');
    if (!confirm('Última oportunidad: esto no se puede deshacer. ¿Continuar?')) { boton.textContent = original; return; }
    if (hayServidor()) {
      const pin = prompt('PIN del servidor (PIN_BORRADO) si lo configuraste, o deja vacío:') ?? '';
      const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}${ruta}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${app.ajustes.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, confirmacion: frase }),
      });
      if (!r.ok) { alert(`El servidor no lo permitió (${r.status}). No se borró nada.`); boton.textContent = original; return; }
    }
    await local();
    alert('Listo.');
    await vistaAjustes(cont);
  };
  $<HTMLButtonElement>(cont, '#purgar').addEventListener('click', e => void borrado(
    e.currentTarget as HTMLButtonElement, 'Borrar lo anulado', 'PURGAR ANULADOS', '/api/purgar',
    async () => { app.local.datos.movimientos = app.local.datos.movimientos.filter(m => m.estado === 'ok'); await app.local.persistir(); },
  ));
  $<HTMLButtonElement>(cont, '#borrarTodo').addEventListener('click', e => void borrado(
    e.currentTarget as HTMLButtonElement, 'Borrar TODO', 'BORRAR TODO MIS DATOS', '/api/borrar-todo',
    async () => {
      const ajustes = app.ajustes; // se conservan servidor, token y PIN: solo se borran los datos
      await vaciar();
      await escribir('ajustes', ajustes);
      location.reload();
    },
  ));
}
