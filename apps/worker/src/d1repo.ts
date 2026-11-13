/**
 * Repositorio sobre Cloudflare D1 (SQLite en la nube). Implementa la misma interfaz `Repo` que usa
 * el bot, así que el bot funciona igual aquí que en la app.
 *
 * Se declaran interfaces mínimas de D1 (`D1Like`) para poder probar este archivo en Node con un
 * adaptador sobre `node:sqlite` (ver tests/d1-shim.ts) sin necesitar la nube.
 */
import type {
  Aprendido, Asiento, Atajo, Compromiso, Cuenta, Datos, Movimiento, Pendiente, Repo,
} from '../../../packages/core/src/index.ts';

export interface D1Stmt {
  bind(...valores: unknown[]): D1Stmt;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(sentencias: D1Stmt[]): Promise<unknown[]>;
}

type Fila = Record<string, unknown>;
const txt = (v: unknown): string => (v == null ? '' : String(v));
const nulo = (v: unknown): string | null => (v == null ? null : String(v));

export class D1Repo implements Repo {
  private db: D1Like;
  constructor(db: D1Like) { this.db = db; }

  /** `cambiosDesde`: solo los movimientos guardados o anulados desde esa hora del servidor (el resto de las tablas va completo). */
  async cargar(cambiosDesde?: string): Promise<Datos> {
    const q = async (sql: string, ...v: unknown[]): Promise<Fila[]> => (await this.db.prepare(sql).bind(...v).all<Fila>()).results;
    const [cu, mo, asi, co, at, ap, pr, cf] = await Promise.all([
      q('SELECT * FROM cuentas'),
      cambiosDesde ? q('SELECT * FROM movimientos WHERE cambio_en >= ? ORDER BY ocurrido_en', cambiosDesde) : q('SELECT * FROM movimientos ORDER BY ocurrido_en'),
      cambiosDesde ? q('SELECT movimiento_id, cuenta_id, monto, moneda FROM asientos WHERE movimiento_id IN (SELECT id FROM movimientos WHERE cambio_en >= ?) ORDER BY id', cambiosDesde) : q('SELECT movimiento_id, cuenta_id, monto, moneda FROM asientos ORDER BY id'),
      q('SELECT * FROM compromisos'),
      q('SELECT * FROM atajos'),
      q('SELECT * FROM aprendido'),
      q('SELECT * FROM presupuestos'),
      q('SELECT * FROM config'),
    ]);

    const asientosPorMov = new Map<string, Asiento[]>();
    for (const a of asi) {
      const lista = asientosPorMov.get(txt(a.movimiento_id)) ?? [];
      lista.push({ cuentaId: txt(a.cuenta_id), monto: Number(a.monto), moneda: txt(a.moneda) as Asiento['moneda'] });
      asientosPorMov.set(txt(a.movimiento_id), lista);
    }

    const cuentas: Cuenta[] = cu.map(r => ({
      id: txt(r.id), nombre: txt(r.nombre), clave: txt(r.clave), tipo: txt(r.tipo) as Cuenta['tipo'],
      moneda: txt(r.moneda) as Cuenta['moneda'], grupo: nulo(r.grupo) as Cuenta['grupo'],
      fijo: Boolean(r.fijo), enDisponible: Boolean(r.en_disponible),
    }));
    const movimientos: Movimiento[] = mo.map(r => ({
      id: txt(r.id), ocurridoEn: txt(r.ocurrido_en), sinHora: Boolean(r.sin_hora), tipo: txt(r.tipo) as Movimiento['tipo'],
      descripcion: txt(r.descripcion), etiqueta: nulo(r.etiqueta), nota: nulo(r.nota),
      lugarDesde: nulo(r.lugar_desde), lugarHasta: nulo(r.lugar_hasta), origen: txt(r.origen) as Movimiento['origen'],
      mensajeOriginal: nulo(r.mensaje_original), propuesta: r.propuesta ? JSON.parse(txt(r.propuesta)) : undefined,
      compromisoId: nulo(r.compromiso_id), estado: txt(r.estado) as Movimiento['estado'], anuladoEn: nulo(r.anulado_en),
      creadoEn: txt(r.creado_en), asientos: asientosPorMov.get(txt(r.id)) ?? [],
    }));
    const compromisos: Compromiso[] = co.map(r => ({
      id: txt(r.id), personaId: txt(r.persona_id), direccion: txt(r.direccion) as Compromiso['direccion'],
      monto: Number(r.monto), moneda: txt(r.moneda) as Compromiso['moneda'], motivo: nulo(r.motivo),
      fechaLimite: nulo(r.fecha_limite), estado: txt(r.estado) as Compromiso['estado'], creadoEn: txt(r.creado_en),
    }));
    const atajos: Atajo[] = at.map(r => ({
      palabra: txt(r.palabra), concepto: txt(r.concepto), monto: r.monto == null ? null : Number(r.monto),
      moneda: txt(r.moneda) as Atajo['moneda'], categoriaId: nulo(r.categoria_id), cuentaId: nulo(r.cuenta_id),
    }));
    const aprendido: Record<string, Aprendido> = {};
    for (const r of ap) aprendido[txt(r.palabra)] = { categoriaId: nulo(r.categoria_id) ?? undefined, cuentaId: nulo(r.cuenta_id) ?? undefined };
    const presupuestos: Record<string, number> = {};
    for (const r of pr) presupuestos[txt(r.categoria_id)] = Number(r.monto);
    const config: Record<string, string> = {};
    // las claves que empiezan por «secreto_» (llaves de los avisos, suscripciones) nunca salen del servidor
    for (const r of cf) if (!txt(r.clave).startsWith('secreto_')) config[txt(r.clave)] = txt(r.valor);
    return { cuentas, movimientos, compromisos, atajos, aprendido, presupuestos, config };
  }

  async guardarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[], compromisos: Compromiso[]): Promise<void> {
    // Idempotente: si el movimiento ya existe (reintento de la app o del webhook) no se repite.
    const ya = await this.db.prepare('SELECT 1 AS x FROM movimientos WHERE id = ?').bind(m.id).first();
    if (ya) return;
    const p = (sql: string, ...v: unknown[]) => this.db.prepare(sql).bind(...v);
    const s: D1Stmt[] = [];
    for (const c of cuentasNuevas) {
      s.push(p('INSERT OR IGNORE INTO cuentas (id, nombre, clave, tipo, moneda, grupo, fijo, en_disponible) VALUES (?,?,?,?,?,?,?,?)',
        c.id, c.nombre, c.clave, c.tipo, c.moneda, c.grupo ?? null, c.fijo ? 1 : 0, c.enDisponible === false ? 0 : 1));
    }
    for (const c of compromisos) {
      s.push(p('INSERT OR IGNORE INTO compromisos (id, persona_id, direccion, monto, moneda, motivo, fecha_limite, estado, creado_en) VALUES (?,?,?,?,?,?,?,?,?)',
        c.id, c.personaId, c.direccion, c.monto, c.moneda, c.motivo ?? null, c.fechaLimite ?? null, c.estado, c.creadoEn));
    }
    s.push(p(
      `INSERT INTO movimientos (id, ocurrido_en, sin_hora, tipo, descripcion, etiqueta, nota, lugar_desde, lugar_hasta, origen,
         mensaje_original, propuesta, compromiso_id, estado, anulado_en, creado_en, actualizado_en, cambio_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','-5 hours'))`,
      m.id, m.ocurridoEn, m.sinHora ? 1 : 0, m.tipo, m.descripcion, m.etiqueta ?? null, m.nota ?? null,
      m.lugarDesde ?? null, m.lugarHasta ?? null, m.origen, m.mensajeOriginal ?? null,
      m.propuesta ? JSON.stringify(m.propuesta) : null, m.compromisoId ?? null, m.estado, m.anuladoEn ?? null,
      m.creadoEn, m.creadoEn,
    ));
    for (const a of m.asientos) {
      s.push(p('INSERT INTO asientos (movimiento_id, cuenta_id, monto, moneda) VALUES (?,?,?,?)', m.id, a.cuentaId, a.monto, a.moneda));
    }
    await this.db.batch(s);
  }

  async anularMovimiento(id: string, cuando: string): Promise<void> {
    // Anula el movimiento y, en el mismo lote, las deudas que creó (ids `${id}-c1`, `-c2`...), para que
    // no queden "activas" con saldo cero y provoquen un aviso de "deuda saldada" falso.
    await this.db.batch([
      this.db.prepare("UPDATE movimientos SET estado = 'anulado', anulado_en = ?, actualizado_en = ?, cambio_en = datetime('now','-5 hours') WHERE id = ? AND estado = 'ok'")
        .bind(cuando, cuando, id),
      this.db.prepare("UPDATE compromisos SET estado = 'anulada' WHERE id LIKE ? AND estado = 'activa'")
        .bind(`${id}-c%`),
    ]);
  }

  async actualizarCompromisos(cs: Compromiso[]): Promise<void> {
    if (!cs.length) return;
    await this.db.batch(cs.map(c => this.db.prepare('UPDATE compromisos SET estado = ? WHERE id = ?').bind(c.estado, c.id)));
  }

  async guardarAprendido(palabra: string, v: Aprendido): Promise<void> {
    if (!v.categoriaId && !v.cuentaId) { await this.db.prepare('DELETE FROM aprendido WHERE palabra = ?').bind(palabra).run(); return; }
    await this.db.prepare('INSERT OR REPLACE INTO aprendido (palabra, categoria_id, cuenta_id) VALUES (?,?,?)')
      .bind(palabra, v.categoriaId ?? null, v.cuentaId ?? null).run();
  }

  async guardarCuenta(c: Cuenta): Promise<void> {
    // si existe, solo cambian el nombre y el grupo: el tipo y lo demás no
    await this.db.prepare(
      `INSERT INTO cuentas (id, nombre, clave, tipo, moneda, grupo, fijo, en_disponible) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, clave = excluded.clave, grupo = excluded.grupo`,
    ).bind(c.id, c.nombre, c.clave, c.tipo, c.moneda ?? 'COP', c.grupo ?? null, c.fijo ? 1 : 0, c.enDisponible === false ? 0 : 1).run();
  }

  async setPresupuesto(categoriaId: string, monto: number | null): Promise<void> {
    if (monto === null) await this.db.prepare('DELETE FROM presupuestos WHERE categoria_id = ?').bind(categoriaId).run();
    else await this.db.prepare('INSERT OR REPLACE INTO presupuestos (categoria_id, monto) VALUES (?,?)').bind(categoriaId, monto).run();
  }

  async setConfig(clave: string, valor: string): Promise<void> {
    await this.db.prepare('INSERT OR REPLACE INTO config (clave, valor) VALUES (?,?)').bind(clave, valor).run();
  }

  async leerPendiente(): Promise<Pendiente | null> {
    const r = await this.db.prepare('SELECT json FROM pendiente WHERE id = 1').first<{ json: string }>();
    return r ? (JSON.parse(r.json) as Pendiente) : null;
  }

  async guardarPendiente(p: Pendiente | null): Promise<void> {
    if (!p) await this.db.prepare('DELETE FROM pendiente WHERE id = 1').run();
    else await this.db.prepare("INSERT OR REPLACE INTO pendiente (id, json, actualizado_en) VALUES (1, ?, datetime('now','-5 hours'))").bind(JSON.stringify(p)).run();
  }

  // ---- Extras del servidor (no forman parte de la interfaz Repo) ----

  /** Un dato privado del servidor (clave «secreto_...»): no viaja a la app. */
  async leerSecreto<T>(clave: string): Promise<T | null> {
    const r = await this.db.prepare('SELECT valor FROM config WHERE clave = ?').bind('secreto_' + clave).first<{ valor: string }>();
    try { return r ? (JSON.parse(r.valor) as T) : null; } catch { return null; }
  }

  async guardarSecreto(clave: string, valor: unknown): Promise<void> {
    await this.setConfig('secreto_' + clave, JSON.stringify(valor));
  }

  /** Borra definitivamente los movimientos anulados. */
  async purgarAnulados(): Promise<number> {
    const r = await this.db.prepare("DELETE FROM movimientos WHERE estado = 'anulado'").run();
    await this.db.prepare('DELETE FROM fotos WHERE movimiento_id NOT IN (SELECT id FROM movimientos)').run();
    const n = r.meta?.changes ?? 0;
    if (n) await this.subirGeneracion();
    return n;
  }

  /** Borra TODOS los movimientos, deudas y personas (las cuentas y categorías base se conservan). */
  async borrarTodo(): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM asientos'),
      this.db.prepare('DELETE FROM movimientos'),
      this.db.prepare('DELETE FROM compromisos'),
      this.db.prepare("DELETE FROM cuentas WHERE tipo IN ('persona','fuente')"),
      this.db.prepare('DELETE FROM pendiente'),
      this.db.prepare('DELETE FROM fotos'),
      this.db.prepare("UPDATE config SET valor = '2000-01-01 00:00:00' WHERE clave = 'fecha_apertura'"),
    ]);
    await this.subirGeneracion();
  }

  /** Lo que ocupan las fotos de recibos, en bytes (el texto base64 es lo que pesa en la base). */
  async bytesDeFotos(): Promise<number> {
    const r = await this.db.prepare('SELECT COALESCE(SUM(LENGTH(datos)), 0) AS b FROM fotos').first<{ b: number }>();
    return Number(r?.b ?? 0);
  }

  /** Avisa a las apps que algo se borró de verdad: la próxima sincronización trae todo en vez de solo los cambios. */
  private async subirGeneracion(): Promise<void> {
    const r = await this.db.prepare("SELECT valor FROM config WHERE clave = 'generacion'").first<{ valor: string }>();
    await this.setConfig('generacion', String(Number(r?.valor ?? '0') + 1));
  }
}
