/**
 * Plata que no alcanza: una cuenta de dinero no puede quedar en negativo sin que la persona lo
 * sepa. El caso que lo motivó: pagar con billete, recibir vuelto en monedas sin anotarlo y luego
 * meter esas monedas a la alcancía. Monedas quedaba en negativo y nadie avisaba.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atajosFrecuentes, calcularAlertas, calcularSaldos, hayTrabajadores, hojasDeDatos, leerSubcategorias, puedeIrDentro, MemoriaRepo, pagosATrabajadores, procesar, revisarMes, type Salida } from '../src/index.ts';
import { AHORA, textoDe } from '../../../tests/ayudas.ts';

function bot(plantilla = 'familia', extra: Parameters<MemoriaRepo['aplicarPlantilla']>[1] = {}) {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla(plantilla, extra);
  return {
    repo,
    di: (texto: string): Promise<Salida[]> => procesar(repo, { texto }, AHORA),
    pulsa: (boton: string): Promise<Salida[]> => procesar(repo, { boton }, AHORA),
    async saldo(cuenta: string): Promise<number> {
      const d = await repo.cargar();
      return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|COP`) ?? 0;
    },
  };
}
const ids = (s: Salida[]): string[] => (s.at(-1)?.botones ?? []).map(b => b.id);

test('metí monedas a la alcancía sin tenerlas: avisa con los números y ofrece pasarlas del efectivo', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  const s = await b.di('metí 21000 a la alcancía');
  assert.match(textoDe(s), /Falta plata en Monedas: hay \$0 y esto saca \$21\.000 \(quedaría en -\$21\.000\)/);
  assert.deepEqual(ids(s), ['cubrir', 'edit', 'ok', 'no']);
  assert.match(s.at(-1)!.botones!.find(x => x.id === 'cubrir')!.titulo, /Pasar \$21\.000 de Efectivo a Monedas/);
  assert.match(s.at(-1)!.botones!.find(x => x.id === 'ok')!.titulo, /Guardar igual/);
});

test('el botón «pasar» anota la transferencia que faltaba y deja todo cuadrado', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('metí 21000 a la alcancía');
  const s = await b.pulsa('cubrir');
  assert.match(textoDe(s), /Pasé \$21\.000 de Efectivo a Monedas/);
  assert.doesNotMatch(s.at(-1)!.texto, /Falta plata/); // la tarjeta vuelve sin aviso
  assert.deepEqual(ids(s).slice(0, 3), ['ok', 'edit', 'no']); // vuelve el Confirmar normal
  await b.pulsa('ok');
  assert.equal(await b.saldo('efectivo'), 79000);
  assert.equal(await b.saldo('monedas'), 0);
  assert.equal(await b.saldo('alcancia'), 21000);
});

test('si en el efectivo tampoco alcanza, no ofrece pasar nada, pero se puede guardar igual', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 5000'); await b.pulsa('ok');
  const s = await b.di('metí 21000 a la alcancía');
  assert.deepEqual(ids(s), ['edit', 'ok', 'no']);
  await b.pulsa('ok');
  assert.equal(await b.saldo('monedas'), -21000); // fue decisión de la persona
});

test('un gasto con Nequi que no alcanza avisa y ofrece pasar del efectivo', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 100000 nequi 10000'); await b.pulsa('ok');
  const s = await b.di('mecato 30000 nequi');
  assert.match(textoDe(s), /Falta plata en Nequi: hay \$10\.000 y esto saca \$30\.000 \(quedaría en -\$20\.000\)/);
  assert.match(s.at(-1)!.botones!.find(x => x.id === 'cubrir')!.titulo, /Pasar \$20\.000 de Efectivo a Nequi/);
});

test('un gasto en efectivo mayor que lo que hay también avisa', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 10000'); await b.pulsa('ok');
  const t = textoDe(await b.di('mecato 15000'));
  assert.match(t, /Falta plata en Efectivo/);
});

test('sin saldo inicial no se avisa nada: no hay saldos de verdad contra qué medir', async () => {
  const b = bot('personal');
  const s = await b.di('mecato 5000');
  assert.doesNotMatch(textoDe(s), /Falta plata/);
  assert.deepEqual(ids(s).slice(0, 3), ['ok', 'edit', 'no']);
});

test('editar un movimiento guardado no se cuenta a sí mismo', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 10000'); await b.pulsa('ok');
  await b.di('mecato 10000'); const g = await b.pulsa('ok');
  const id = g[0].botones!.find(x => x.id.startsWith('edit:'))!.id;
  await b.pulsa(id);
  const t = textoDe(await b.di('monto 9000'));
  assert.doesNotMatch(t, /Falta plata/);
});

test('una cuenta que ya estaba en negativo no se vuelve a regañar si el movimiento no la empeora', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('metí 21000 a la alcancía'); await b.pulsa('ok'); // Guardar igual: Monedas en -21000
  const t = textoDe(await b.di('pasé 5000 de efectivo a monedas'));
  assert.doesNotMatch(t, /Falta plata/);
});

test('un movimiento de antes del saldo inicial no mueve saldos y no avisa', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 1000'); await b.pulsa('ok');
  const t = textoDe(await b.di('ayer mecato 50000'));
  assert.doesNotMatch(t, /Falta plata/);
});

test('varios movimientos en un mensaje: el aviso aparece en el que lo necesita', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 20000'); await b.pulsa('ok');
  const s = await b.di('mecato 5000\nmecato 30000');
  assert.doesNotMatch(textoDe(s), /Falta plata/);
  const s2 = await b.pulsa('ok');
  assert.match(textoDe(s2), /Falta plata en Efectivo/);
});

// ---------------------------------------------------------------- por todos lados: ninguna ruta empeora un negativo en silencio

function azar(semilla: number) {
  let x = semilla;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

test('estrés: ninguna frase deja una cuenta de dinero más negativa sin haber avisado', async () => {
  const frases = [
    'mecato 5000', 'mecato 7800 con 10000', 'taxi 15000', 'almuerzo 12000 nequi', 'metí 3000 a la alcancía',
    'metí 2 monedas de 500 y 3 de mil a la alcancía', 'saqué 4000 de la alcancía', 'pasé 20000 de efectivo a nequi',
    'pasé 8000 de nequi a efectivo', 'saqué 50000 de nequi', 'cambio 30000 efectivo a nequi', '+mamá 40000',
    '+sueldo 100000 nequi', 'le presté 10000 a sergio', 'le pago 5000 a sergio', 'sergio me pagó 20000',
    'compra: arroz 5000, sal 2000', 'regalo 60000 nequi', 'internet 80000 nequi', 'mecato 1800 en monedas',
    'ayer mecato 9000', 'recarga 10000 nequi',
  ];
  for (const semilla of [1, 2, 3, 4, 5, 6]) {
    const rnd = azar(semilla);
    const b = bot('personal');
    await b.di('saldo inicial efectivo 60000 monedas 3000 nequi 25000'); await b.pulsa('ok');
    for (let i = 0; i < 120; i++) {
      const antes = await saldosDeDinero(b.repo);
      const s = await b.di(frases[Math.floor(rnd() * frases.length)]);
      const sale = s.at(-1);
      const puedeGuardar = sale?.botones?.some(x => x.id === 'ok');
      if (!puedeGuardar) { await b.pulsa('no'); continue; }
      const avisoPrevio = /Falta plata/.test(textoDe(s));
      await b.pulsa('ok');
      const despues = await saldosDeDinero(b.repo);
      for (const [cuenta, saldo] of despues) {
        const era = antes.get(cuenta) ?? 0;
        if (saldo < 0 && saldo < era && !avisoPrevio) {
          assert.fail(`semilla ${semilla}, paso ${i}: «${s[0].texto.split('\n')[1]}» dejó ${cuenta} en ${saldo} (antes ${era}) sin avisar`);
        }
      }
      if (rnd() < 0.2) await b.di('deshacer'); // movimiento de por medio para variar los saldos
    }
  }
});

async function saldosDeDinero(repo: MemoriaRepo): Promise<Map<string, number>> {
  const d = await repo.cargar();
  const s = calcularSaldos(d.movimientos, d.config.fecha_apertura);
  const r = new Map<string, number>();
  for (const c of d.cuentas.filter(c => c.tipo === 'dinero')) r.set(`${c.id}|${c.moneda}`, s.get(`${c.id}|${c.moneda}`) ?? 0);
  return r;
}

// ---------------------------------------------------------------- otras formas de dejar un saldo torcido

test('anular algo de lo que dependen otros movimientos avisa, y se puede anular igual', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('pasé 21000 de efectivo a monedas');
  const g = await b.pulsa('ok');
  const undo = g[0].botones!.find(x => x.id.startsWith('undo:'))!.id;
  await b.di('metí 21000 a la alcancía'); await b.pulsa('ok');
  const s = await b.pulsa(undo);
  assert.match(textoDe(s), /Monedas quedaría en -\$21\.000/);
  assert.deepEqual(ids(s), [undo.replace('undo:', 'undo!:'), 'nada']);
  assert.equal(await b.saldo('monedas'), 0); // todavía no se anuló nada
  assert.match(textoDe(await b.pulsa(ids(s)[0])), /Anulado/);
  assert.equal(await b.saldo('monedas'), -21000);
});

test('anular un movimiento sin dependientes sigue siendo directo', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('mecato 5000');
  const g = await b.pulsa('ok');
  assert.match(textoDe(await b.pulsa(g[0].botones!.find(x => x.id.startsWith('undo:'))!.id)), /Anulado/);
});

test('un segundo «saldo inicial» avisa que lo anterior dejaría de contar y pide una confirmación distinta', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('mecato 5000'); await b.pulsa('ok');
  const s = await b.di('saldo inicial efectivo 50000');
  assert.match(textoDe(s), /Ya hay un saldo inicial: si sigues, el movimiento que anotaste desde entonces deja de contar/);
  assert.match(textoDe(s), /arqueo efectivo 80000 monedas 11500/);
  assert.match(s.at(-1)!.botones!.find(x => x.id === 'ok')!.titulo, /empezar de nuevo/);
});

test('el primer saldo inicial, o uno sin nada anotado después, no lleva aviso', async () => {
  const b = bot();
  assert.doesNotMatch(textoDe(await b.di('saldo inicial efectivo 100000')), /Ya hay un saldo inicial/);
  await b.pulsa('ok');
  assert.doesNotMatch(textoDe(await b.di('saldo inicial efectivo 90000')), /Ya hay un saldo inicial/);
});

test('«deshacer» nunca anula el saldo inicial, aunque sea lo único que hay', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  assert.match(textoDe(await b.di('deshacer')), /No hay nada que deshacer/);
  assert.match(textoDe(await b.di('deshacer 3')), /No hay nada que deshacer/);
  assert.equal(await b.saldo('efectivo'), 100000);
});

test('«me dieron vuelto 26000 en monedas» pasa esa plata del efectivo a las monedas', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('pagué lo de la finca 74000'); await b.pulsa('ok');
  const t = textoDe(await b.di('me dieron vuelto 26000 en monedas'));
  assert.match(t, /Transferencia · \$26\.000 · Efectivo → Monedas/);
  await b.pulsa('ok');
  assert.equal(await b.saldo('monedas'), 26000);
  assert.equal(await b.saldo('efectivo'), 0);
});

test('el vuelto suelto no se confunde con un gasto que menciona el vuelto', async () => {
  const b = bot('personal');
  const t = textoDe(await b.di('mecato 2800 con 5000 vuelto 2200 en monedas'));
  assert.match(t, /Gasto · Mecato/);
  assert.doesNotMatch(t, /Vuelto en monedas/);
});

test('una cuenta en negativo sale como alerta urgente en la app, pero no como aviso al celular', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 5000'); await b.pulsa('ok');
  await b.di('metí 21000 a la alcancía'); await b.pulsa('ok'); // Guardar igual
  const d = await b.repo.cargar();
  const a = calcularAlertas(d, AHORA).find(x => x.id === 'saldo-negativo');
  assert.equal(a?.nivel, 'urgente');
  assert.match(a!.texto, /Monedas está en -\$21\.000/);
  assert.match(textoDe(await b.di('saldo')), /Monedas \(aparte\): -\$21\.000 ⚠️/);
});

// ---------------------------------------------------------------- mensaje enviado dos veces y vuelto sin decir

test('el mismo gasto dos veces seguidas avisa que se parece al anterior', async () => {
  const b = bot('personal');
  await b.di('mecato 5000'); await b.pulsa('ok');
  const t = textoDe(await b.di('mecato 5000'));
  assert.match(t, /Se parece a uno que anotaste hace \d+ min \(.*\$5\.000\)/);
});

test('gastos distintos o de otro monto no llevan el aviso de repetido', async () => {
  const b = bot('personal');
  await b.di('mecato 5000'); await b.pulsa('ok');
  assert.doesNotMatch(textoDe(await b.di('mecato 5500')), /Se parece/);
  await b.pulsa('no');
  assert.doesNotMatch(textoDe(await b.di('almuerzo 5000')), /Se parece/);
});

test('editar un movimiento no lo toma por repetido de sí mismo', async () => {
  const b = bot('personal');
  await b.di('mecato 5000');
  const g = await b.pulsa('ok');
  await b.pulsa(g[0].botones!.find(x => x.id.startsWith('edit:'))!.id);
  assert.doesNotMatch(textoDe(await b.di('monto 5000')), /Se parece/);
});

test('un gasto en efectivo sin vuelto dicho pregunta si le dieron vuelto', async () => {
  const b = bot('personal');
  assert.match(textoDe(await b.di('mecato 5000')), /¿Te dieron vuelto\? Toca abajo con cuánto pagaste\./);
  await b.pulsa('no');
  assert.doesNotMatch(textoDe(await b.di('mecato 4500 con billete de 10k')), /¿Te dieron vuelto\?/);
});

// ---------------------------------------------------------------- cuadrar sobrantes con una persona, cierre del día, atajos

test('unos pesos que sobran con una persona se ofrecen para cuadrar y quedan en Descuadre', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000 nequi 500000'); await b.pulsa('ok');
  await b.di('plata de mamá para cooperativa 150000 nequi'); await b.pulsa('ok');
  const g = await b.di('cooperativa 149984 con plata de mamá nequi');
  assert.match(textoDe(g), /Cooperativa|Mamá|mamá/i);
  const s = await b.pulsa('ok');
  const cuad = s[0].botones?.find(x => x.id.startsWith('cuad:'));
  assert.ok(cuad, `esperaba el botón de cuadrar: ${textoDe(s)}`);
  assert.match(textoDe(s), /Quedaron \$16 sin cuadrar/);
  const c = await b.pulsa(cuad!.id);
  assert.match(textoDe(c), /Cuadrar con .* · \$16/);
  await b.pulsa('ok');
  const d = await b.repo.cargar();
  const saldos = calcularSaldos(d.movimientos, d.config.fecha_apertura);
  assert.equal([...saldos].filter(([k, v]) => k.startsWith('persona:') && v !== 0).length, 0, 'nadie queda debiendo');
  assert.equal(saldos.get('cat:descuadre|COP'), -16); // le debías $16 y se perdonan: ganancia de 16, no gasto
});

test('cuadrar con alguien que debe mucho se niega, y con quien no debe nada lo dice', async () => {
  const b = bot();
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('le presté 50000 a sergio'); await b.pulsa('ok');
  assert.match(textoDe(await b.di('cuadrar con sergio')), /es mucho para cuadrarlo/);
  assert.match(textoDe(await b.di('cuadrar con fulano')), /No conozco a/);
});

test('cierre del día: de tarde, con movimientos de la billetera y sin conteo, ofrece contar', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  await b.di('mecato 5000'); await b.pulsa('ok');
  const d = await b.repo.cargar();
  const tarde = new Date(AHORA.getTime() + 4 * 3600000); // 7:42 pm en Colombia
  const a = calcularAlertas(d, tarde).find(x => x.id === 'cierre-dia');
  assert.ok(a, 'debía haber cierre del día');
  assert.match(a!.texto, /tienes \$95\.000 en efectivo/);
  assert.equal(a!.acciones![0].texto, 'arqueo efectivo 95000 monedas 0');
  assert.equal(calcularAlertas(d, AHORA).some(x => x.id === 'cierre-dia'), false, 'a las 3:42 pm todavía no');
  // la acción «Sí, cuadra» es una frase que el bot entiende y, una vez guardada, el aviso desaparece
  await b.di(a!.acciones![0].texto); await b.pulsa('ok');
  assert.equal(calcularAlertas(await b.repo.cargar(), tarde).some(x => x.id === 'cierre-dia'), false);
});

test('atajos del chat: salen los mensajes que se repiten tal cual, no los de una sola vez', async () => {
  const b = bot('personal');
  for (const t of ['mecato 2000', 'mecato 2000', 'mecato 2000', 'almuerzo 12000', 'almuerzo 12000', 'taxi 8000']) {
    await b.di(t); await b.pulsa('ok');
  }
  const d = await b.repo.cargar();
  assert.deepEqual(atajosFrecuentes(d.movimientos, AHORA), ['mecato 2000', 'almuerzo 12000']);
});

// ---------------------------------------------------------------- jornales y revisión del mes

test('jornales: suma lo pagado a cada trabajador en la semana, y no cuenta lo anulado ni a otras personas', async () => {
  const b = bot('familia', { personas: [{ nombre: 'Felipe', grupo: 'trabajadores' }] });
  await b.di('saldo inicial efectivo 500000'); await b.pulsa('ok');
  await b.di('jornal 50000 felipe'); await b.pulsa('ok');
  await b.di('jornal 40000 felipe'); await b.pulsa('ok');
  const x = await b.di('jornal 30000 felipe'); const g = await b.pulsa('ok');
  await b.pulsa(g[0].botones!.find(y => y.id.startsWith('undo:'))!.id); // el tercero se anula
  const t = textoDe(await b.di('jornales'));
  assert.match(t, /Pagos a trabajadores esta semana: \$90\.000/);
  assert.match(t, /Felipe: \$90\.000 \(2 pagos/);
  void x;
  assert.match(textoDe(await b.di('jornales la semana pasada')), /No hay pagos a trabajadores la semana pasada/);
});

test('revisión del mes: sin saldo inicial lo pide; con todo en orden lo dice; con un arqueo viejo lo señala', async () => {
  const b = bot('personal');
  assert.match(textoDe(await b.di('revisión')), /cuánta plata tenías al empezar/);
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  assert.match(textoDe(await b.di('revisar el mes')), /todo está en orden/);
  const mes = new Date(AHORA.getTime() + 20 * 86400000); // 20 días después, sin haber contado nada
  const t = textoDe(await procesar(b.repo, { texto: 'revisar' }, mes));
  assert.match(t, /Nunca has contado la plata de verdad desde el saldo inicial \(hace 20 días\)/);
});

test('movimientos importados del Excel (sin propuesta) no rompen trabajadores, revisión ni atajos', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 100000'); await b.pulsa('ok');
  const d = await b.repo.cargar();
  const importado = { id: 'xl:1', ocurridoEn: '2026-10-19 10:00:00', sinHora: true, tipo: 'gasto' as const, descripcion: 'Antiguo', etiqueta: null, nota: null, lugarDesde: null, lugarHasta: null, origen: 'excel' as const, mensajeOriginal: null, compromisoId: null, estado: 'ok' as const, creadoEn: '2026-10-19 10:00:00', asientos: [{ cuentaId: 'efectivo', monto: -5000, moneda: 'COP' as const }, { cuentaId: 'cat:mecato', monto: 5000, moneda: 'COP' as const }] };
  b.repo.datos.movimientos.push(importado);
  const d2 = await b.repo.cargar();
  assert.equal(hayTrabajadores(d2.cuentas, d2.movimientos), false);
  assert.deepEqual(pagosATrabajadores(d2.movimientos, d2.cuentas, '2026-10-01 00:00:00', '2026-11-01 00:00:00'), []);
  assert.ok(Array.isArray(revisarMes(d2, AHORA)));
  assert.ok(Array.isArray(atajosFrecuentes(d2.movimientos, AHORA)));
  assert.match(textoDe(await b.di('jornales')), /No hay pagos/);
  assert.match(textoDe(await b.di('revisar')), /Revisión|todo está en orden/);
  void d;
});

// ---------------------------------------------------------------- plata de otros (custodia)

test('plata de otros: se ve como plata ajena, no como deuda, y no cuenta como ingreso ni gasto tuyo', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 40000 nequi 100000'); await b.pulsa('ok');
  const recibida = textoDe(await b.di('plata de hugo para juego 31000 nequi'));
  assert.match(recibida, /Plata de Hugo para juego · \$31\.000 · Nequi/);
  assert.doesNotMatch(recibida, /te presta/);
  await b.pulsa('ok');
  const saldo = textoDe(await b.di('saldo'));
  assert.match(saldo, /Plata de otros: \$31\.000 \(está dentro de lo de arriba, pero no es tuya\)/);
  assert.doesNotMatch(saldo, /Debes: \$31\.000/);
  assert.match(textoDe(await b.di('deudas')), /Plata de otros que tienes[\s\S]*Hugo: \$31\.000/);
  assert.doesNotMatch(textoDe(await b.di('deudas')), /Debes:/);
  const gasto = textoDe(await b.di('juego 31000 con plata de hugo nequi'));
  assert.match(gasto, /Gasto con plata de Hugo.*\$31\.000 · Nequi/);
  await b.pulsa('ok');
  assert.doesNotMatch(textoDe(await b.di('saldo')), /Plata de otros/);
  assert.match(textoDe(await b.di('deudas')), /No hay deudas ni préstamos/);
});

test('plata de otros: gastar solo una parte deja el resto como plata de ellos; una deuda de verdad con la misma persona sigue siendo deuda', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 40000 nequi 100000'); await b.pulsa('ok');
  await b.di('plata de hugo para juego 31000 nequi'); await b.pulsa('ok');
  await b.di('juego 20000 con plata de hugo nequi'); await b.pulsa('ok');
  assert.match(textoDe(await b.di('saldo')), /Plata de otros: \$11\.000/);
  await b.di('le debo 5000 a hugo por una pizza'); await b.pulsa('ok');
  const t = textoDe(await b.di('deudas'));
  assert.match(t, /Hugo: \$11\.000/);   // lo que sigue siendo plata suya
  assert.match(t, /Debes:\n• Hugo: \$5\.000/); // la deuda de la pizza, aparte
});

test('plata de otros: lo de siempre (plata de mamá para cooperativa) sigue funcionando', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 40000 nequi 500000'); await b.pulsa('ok');
  await b.di('plata de mamá para cooperativa 150000 nequi'); await b.pulsa('ok');
  await b.di('cooperativa 149984 con plata de mamá nequi'); await b.pulsa('ok');
  assert.match(textoDe(await b.di('saldo')), /Plata de otros: \$16/);
});

test('una sola frase: «pollo 8000 para luis puso 6000 nequi» son el gasto por él y lo que él pagó', async () => {
  const b = bot('personal');
  await b.di('saldo inicial efectivo 40000 nequi 100000'); await b.pulsa('ok');
  const s = await b.di('pollo 8000 para luis puso 6000 nequi');
  assert.match(textoDe(s), /Movimiento 1 de 2/);
  assert.match(textoDe(s), /Tu parte: \$0/);
  assert.match(textoDe(s), /Luis te debe \$8\.000/);
  await b.di('compras'); // «pollo» no tiene categoría: se la dice
  const s2 = await b.pulsa('ok');
  assert.match(textoDe(s2), /Movimiento 2 de 2/);
  assert.match(textoDe(s2), /Pago · Luis te paga · \$6\.000 · Nequi/);
  await b.pulsa('ok');
  assert.equal(await b.saldo('efectivo'), 32000);
  assert.equal(await b.saldo('nequi'), 106000);
  assert.match(textoDe(await b.di('deudas')), /Te deben:\n• Luis: \$2\.000/);
});

test('Excel: con trabajadores hay una hoja de pagos por semana; la plata de otros no sale como deuda', async () => {
  const b = bot('familia', { personas: [{ nombre: 'Felipe', grupo: 'trabajadores' }] });
  await b.di('saldo inicial efectivo 500000 bancolombia 100000'); await b.pulsa('ok');
  await b.di('jornal 50000 felipe'); await b.pulsa('ok');
  await b.di('jornal 40000 felipe'); await b.pulsa('ok');
  await b.di('plata de sergio para repuesto 30000 bancolombia'); await b.pulsa('ok');
  const hojas = hojasDeDatos(await b.repo.cargar());
  const tr = hojas.find(h => h.nombre === 'Trabajadores');
  assert.ok(tr, 'falta la hoja Trabajadores');
  assert.deepEqual(tr!.filas[1].slice(1), ['Felipe', 2, 90000]);
  const deudas = hojas.find(h => h.nombre === 'Deudas')!;
  assert.deepEqual(deudas.filas[1].slice(0, 3), ['Sergio', 'Plata de otros', 30000]);
  assert.equal(deudas.filas.some(f => f[1] === 'Le debes'), false);
  // sin trabajadores no hay hoja de más
  assert.equal(hojasDeDatos(await bot('personal').repo.cargar()).some(h => h.nombre === 'Trabajadores'), false);
});

// ---------------------------------------------------------------- subcategorías de varios niveles

test('subcategorías: hasta tres niveles, suman hacia arriba y se ven con sangría', async () => {
  const b = bot('personal');
  await b.di('subcategoria restaurante de comida');
  assert.match(textoDe(await b.di('subcategoria banquetes de restaurante')), /Creé la subcategoría Banquetes dentro de Restaurante/);
  assert.match(textoDe(await b.di('subcategoria catering de banquetes')), /pasaría de 3 niveles/);
  await b.di('banquetes 20000');
  await b.pulsa('ok');
  await b.di('restaurante 30000'); await b.pulsa('ok');
  await b.di('almuerzo 12000'); await b.pulsa('ok');
  const mes = textoDe(await b.di('mes'));
  assert.match(mes, /• Comida: \$62\.000/);
  assert.match(mes, /\n {3}· Restaurante: \$30\.000/);
  assert.match(mes, /\n {6}· Banquetes: \$20\.000/);
  assert.match(textoDe(await b.di('cuánto llevo en comida')), /\$62\.000/);
  assert.match(textoDe(await b.di('cuánto llevo en restaurante')), /\$50\.000/);
});

test('subcategorías: no se puede hacer un ciclo ni poner una categoría dentro de sí misma o de lo suyo', async () => {
  const b = bot('personal');
  await b.di('subcategoria restaurante de comida');
  assert.match(textoDe(await b.di('subcategoria comida de restaurante')), /ya está dentro de Comida/);
  assert.match(textoDe(await b.di('subcategoria comida de comida')), /sí misma/);
  // si la config trae un ciclo (alguien la tocó), se ignora en vez de colgarse
  const d = await b.repo.cargar();
  assert.deepEqual(leerSubcategorias({ ...d.config, subcategorias: JSON.stringify({ a: 'b', b: 'a', c: 'comida' }) }), { c: 'comida' });
  assert.deepEqual(leerSubcategorias({ subcategorias: JSON.stringify({ a: 'b', b: 'c', c: 'd', d: 'e' }) }), { c: 'd', d: 'e' }); // las que se pasan de tres niveles se descartan
});

test('subcategorías: puedeIrDentro respeta los niveles de lo que ya cuelga de la categoría', () => {
  const mapa = { b: 'a', c: 'b' }; // a > b > c
  assert.equal(puedeIrDentro(mapa, 'x', 'c'), false, 'cuarto nivel');
  assert.equal(puedeIrDentro(mapa, 'x', 'b'), true);
  assert.equal(puedeIrDentro(mapa, 'b', 'x'), true, 'b con su hija cabe bajo una principal');
  assert.equal(puedeIrDentro({ ...mapa, x: 'y' }, 'b', 'x'), false, 'b con su hija bajo una subcategoría serían cuatro niveles');
  assert.equal(puedeIrDentro(mapa, 'a', 'c'), false, 'no dentro de lo suyo');
});
