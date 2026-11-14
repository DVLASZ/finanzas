/**
 * Plantillas de instalación: cada app (la personal, la de uso familiar y la de la
 * empresa) nace con sus cuentas, categorías, palabras y grupos de personas. Los datos propios de
 * cada persona (nombres de personas, precios) van en instalaciones/<nombre>.json, fuera de git.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alinearConPlantilla, calcularSaldos, MemoriaRepo, PLANTILLAS, procesar, type Salida } from '../src/index.ts';
import { AHORA, textoDe } from '../../../tests/ayudas.ts';

const bot = (plantilla: string, extra: Parameters<MemoriaRepo['aplicarPlantilla']>[1] = {}) => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla(plantilla, extra);
  return {
    repo,
    di: (texto: string): Promise<Salida[]> => procesar(repo, { texto }, AHORA),
    pulsa: (boton: string): Promise<Salida[]> => procesar(repo, { boton }, AHORA),
  };
};

test('hay tres plantillas: personal, familia y empresa', () => {
  assert.deepEqual(Object.keys(PLANTILLAS).sort(), ['empresa', 'familia', 'personal']);
});

test('cada plantilla tiene ids únicos, efectivo y monedas, y todas las palabras apuntan a una categoría que existe', () => {
  for (const [id, pl] of Object.entries(PLANTILLAS)) {
    const ids = pl.cuentas.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: ids repetidos`);
    assert.ok(ids.includes('efectivo') && ids.includes('monedas'), `${id}: faltan efectivo o monedas`);
    assert.ok(ids.includes('cat:descuadre') && ids.includes('sys:apertura'), `${id}: faltan las cuentas de sistema`);
    for (const [palabra, a] of Object.entries(pl.aprendido)) {
      assert.ok(ids.includes(a.categoriaId ?? ''), `${id}: «${palabra}» apunta a ${a.categoriaId}, que no existe`);
    }
  }
});

test('la plantilla «personal» es la semilla de siempre (no cambia nada)', async () => {
  const repo = new MemoriaRepo();
  const antes = JSON.stringify((await repo.cargar()).cuentas);
  repo.aplicarPlantilla('personal');
  assert.equal(JSON.stringify((await repo.cargar()).cuentas), antes);
});

test('aplicar una plantilla dos veces deja lo mismo (idempotente)', async () => {
  const a = bot('familia');
  a.repo.aplicarPlantilla('familia');
  const b = bot('familia');
  assert.deepEqual((await a.repo.cargar()).cuentas, (await b.repo.cargar()).cuentas);
});

// ---------------------------------------------------------------- la app de la mamá con sus notas

const FAMILIA = {
  personas: [
    { nombre: 'Felipe', grupo: 'trabajadores' }, { nombre: 'Esteban', grupo: 'casa' }, { nombre: 'Rafael', grupo: 'familiares' },
    { nombre: 'Empresa', grupo: 'empresa' },
  ],
};

test('familia: sus gastos de siempre caen en sus categorías sin preguntar', async () => {
  const casos: [string, RegExp][] = [
    ['280000 arriendo', /Gasto · Arriendo · \$280\.000/],
    ['26000 celular', /Gasto · Servicios · \$26\.000/],
    ['21000 medicamentos', /Gasto · Salud · \$21\.000/],
    ['7500 arepas', /Gasto · Comida · \$7\.500/],
    ['10000 envueltos', /Gasto · Comida · \$10\.000/],
    ['5000 pan', /Gasto · Comida · \$5\.000/],
    ['19600 frutas mamá', /Gasto · (Comida|Mercado) · \$19\.600/],
    ['15000 almuerzo', /Gasto · Comida · \$15\.000/],
    ['5000 desayuno', /Gasto · Comida · \$5\.000/],
    ['reparación moto 180000', /Gasto · Reparaciones · \$180\.000/],
    ['reparación despulpadora 120000', /Gasto · Reparaciones · \$120\.000/],
    ['20000 gasolina', /Gasto · Gasolina · \$20\.000/],
  ];
  for (const [frase, esperado] of casos) {
    const t = textoDe(await bot('familia', FAMILIA).di(frase));
    assert.match(t, esperado, frase);
    assert.doesNotMatch(t, /¿En qué categoría va/, `«${frase}» no debía preguntar categoría`);
  }
});

test('familia: el saldo inicial acepta la alcancía y el banco de Bogotá', async () => {
  const b = bot('familia');
  await b.di('saldo inicial efectivo 100000 monedas 5000 bancolombia 2500000 bogota 900000 alcancia 250000');
  await b.pulsa('ok');
  const t = textoDe(await b.di('saldo'));
  assert.match(t, /Alcancía: \$250\.000/);
  assert.match(t, /Banco de Bogotá: \$900\.000/);
  assert.match(t, /Monedas \(aparte\): \$5\.000/);
});

test('familia: los pasajes siguen preguntando el recorrido (lo pidió así)', async () => {
  const t = textoDe(await bot('familia', FAMILIA).di('14000 pasajes'));
  assert.match(t, /¿A dónde fue\?/);
});

test('familia: un nombre que ya conoce pregunta qué fue', async () => {
  for (const frase of ['30000 Felipe', '50000 Esteban', '20000 gasolina Rafael', '63000 botellas Empresa', '200000 semana Felipe lote']) {
    const t = textoDe(await bot('familia', FAMILIA).di(frase));
    assert.match(t, /Veo a (Felipe|Esteban|Rafael|Empresa) en el mensaje\. ¿Qué fue\?/, frase);
  }
});

test('familia: el préstamo a Esteban de sus notas queda como deuda a favor', async () => {
  const b = bot('familia', FAMILIA);
  const s = await b.di('50000 bono Esteban');
  await b.pulsa(s[0].botones!.find(x => x.titulo === 'Le presté')!.id);
  await b.pulsa('ok');
  const d = await b.repo.cargar();
  assert.equal(calcularSaldos(d.movimientos, d.config.fecha_apertura).get('per:esteban|COP'), 50000);
  assert.match(d.compromisos[0].motivo ?? '', /bono/i);
});

test('familia: los grupos de las personas son los de la casa, familia directa, familiares...', async () => {
  const b = bot('familia', FAMILIA);
  const s = await b.di('le regalé 50000 a Jorge');
  assert.deepEqual(
    s[0].botones?.filter(x => x.id.startsWith('resp:')).map(x => x.titulo),
    ['Los de la casa', 'Familia directa', 'Familiares', 'Compañeros de trabajo', 'Empresa', 'Amigos', 'Trabajadores', 'No es una persona'],
  );
});

// ---------------------------------------------------------------- la app de empresa

test('empresa: efectivo, monedas y «En otras cuentas», sus categorías y sus grupos (socios, clientes, proveedores, otros)', async () => {
  const b = bot('empresa', { personas: [{ nombre: 'Tomás', grupo: 'clientes' }] });
  const d = await b.repo.cargar();
  assert.deepEqual(d.cuentas.filter(c => c.tipo === 'dinero').map(c => c.id), ['efectivo', 'monedas', 'otras-cuentas']);
  const cats = d.cuentas.filter(c => c.tipo === 'categoria').map(c => c.nombre);
  for (const esperada of ['Insumos', 'Impuestos y trámites', 'Transporte a eventos']) assert.ok(cats.includes(esperada), `falta ${esperada}`);
  const t = textoDe(await b.di('63000 botellas'));
  assert.match(t, /Gasto · Insumos · \$63\.000/);
  const s = await b.di('le regalé 20000 a Rosa');
  assert.deepEqual(s[0].botones?.filter(x => x.id.startsWith('resp:')).map(x => x.titulo), ['Socios', 'Clientes', 'Proveedores', 'Otros', 'No es una persona']);
});

test('empresa: el impuesto de cámara de comercio cae en su categoría', async () => {
  const t = textoDe(await bot('empresa').di('52000 impuesto cámara de comercio'));
  assert.match(t, /Gasto · Impuestos y trámites · \$52\.000/);
});

test('cada app arranca vacía de movimientos y con sus cuentas', async () => {
  for (const id of Object.keys(PLANTILLAS)) {
    const d = await bot(id).repo.cargar();
    assert.equal(d.movimientos.length, 0);
    assert.ok(d.cuentas.length > 8);
  }
});

// ---------------------------------------------------------------- apodos de personas

test('apodos: «unidad» es la Empresa en la app familiar (config apodos_personas)', async () => {
  const b = bot('familia', { personas: [{ nombre: 'Empresa', grupo: 'empresa' }], config: { apodos_personas: JSON.stringify({ 'per:empresa': ['unidad', 'la unidad'] }) } });
  const t = textoDe(await b.di('52000 presté para cámara y comercio a la unidad'));
  assert.match(t, /Préstamo · le prestas a Empresa · \$52\.000/);
  await b.pulsa('ok');
  const d = await b.repo.cargar();
  assert.equal(d.compromisos[0].personaId, 'per:empresa');
  assert.match(d.compromisos[0].motivo ?? '', /c[áa]mara y comercio/i);
});

test('apodos: sin el apodo configurado «unidad» es otra persona nueva (no se adivina)', async () => {
  const b = bot('familia', { personas: [{ nombre: 'Empresa', grupo: 'empresa' }] });
  const t = textoDe(await b.di('52000 presté a la unidad'));
  assert.match(t, /le prestas a Unidad/);
});

// ---------------------------------------------------------------- cada app es un mundo aparte

test('la ayuda y el saldo solo hablan de las cuentas que esa app tiene', async () => {
  const familia = bot('familia');
  const ayuda = textoDe(await familia.di('ayuda'));
  assert.doesNotMatch(ayuda, /nequi|daviplata|barqb|dólares/i);
  assert.match(ayuda, /Cuéntame lo que pasó/);
  assert.doesNotMatch(textoDe(await familia.di('saldo')), /nequi|daviplata|barqb|dólares/i);

  const empresa = bot('empresa');
  assert.doesNotMatch(textoDe(await empresa.di('ayuda')), /nequi|daviplata|barqb|bancolombia/i);
  assert.match(textoDe(await empresa.di('ayuda')), /vendí/);
  assert.doesNotMatch(textoDe(await empresa.di('saldo')), /nequi|daviplata|barqb|dólares/i);

  const yo = bot('personal');
  assert.match(textoDe(await yo.di('ayuda')), /nequi/);
  assert.doesNotMatch(textoDe(await yo.di('ayuda')), /vendí/);
  assert.match(textoDe(await yo.di('saldo')), /Dólares va aparte, en dólares/);
});

test('los errores con ejemplos usan las cuentas de esa app, no las de otra', async () => {
  const t = textoDe(await bot('familia').di('cambio efectivo bancolombia banco de bogota'));
  assert.doesNotMatch(t, /nequi/i);
});

test('solo la empresa vende: lo dice su configuración', () => {
  assert.equal(PLANTILLAS.empresa.config.ventas, '1');
  assert.equal(PLANTILLAS.personal.config.ventas, undefined);
  assert.equal(PLANTILLAS.familia.config.ventas, undefined);
});

test('«moto 180000» es un arreglo (Reparaciones); «moto de casa a terminal 5000» sigue siendo transporte', async () => {
  assert.match(textoDe(await bot('familia').di('moto 180000')), /Gasto · Reparaciones · \$180\.000/);
  assert.match(textoDe(await bot('personal').di('moto 180000')), /Gasto · Reparaciones · \$180\.000/);
  assert.match(textoDe(await bot('personal').di('moto casa-terminal 5000')), /Transporte · Moto Casa → Terminal/);
  assert.match(textoDe(await bot('personal').di('taxi 80000')), /Transporte/);
});

test('«presté para cámara» no inventa una persona llamada Cámara: pregunta a quién', async () => {
  const t = textoDe(await bot('familia').di('52000 presté para cámara y comercio'));
  assert.match(t, /¿A quién le prestaste\?/);
  assert.doesNotMatch(t, /le prestas a C/);
});

// ---------------------------------------------------------------- alcancía, Cooperativa y otras cuentas

const saldoDe2 = async (b: ReturnType<typeof bot>, cuenta: string) => {
  const d = await b.repo.cargar();
  return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|COP`) ?? 0;
};

test('alcancía: «metí 5 monedas de 500 y 3 de mil» suma $5.500 y lo pasa de Monedas a la Alcancía', async () => {
  const b = bot('familia');
  const t = textoDe(await b.di('metí 5 monedas de 500 y 3 de mil a la alcancía'));
  assert.match(t, /Transferencia · \$5\.500 · Monedas → Alcancía/);
  assert.match(t, /5 × \$500 \+ 3 × \$1\.000/);
  await b.pulsa('ok');
  assert.equal(await saldoDe2(b, 'alcancia'), 5500);
  assert.equal(await saldoDe2(b, 'monedas'), -5500);
});

test('alcancía: otras formas de decirlo (una moneda, cifra suelta, sacar)', async () => {
  const b = bot('familia');
  assert.match(textoDe(await b.di('metí una moneda de mil en la alcancía')), /\$1\.000 · Monedas → Alcancía/);
  await b.pulsa('ok');
  assert.match(textoDe(await b.di('guardé 2 monedas de 1.000 y 4 de 500 en la alcancia')), /\$4\.000/);
  await b.pulsa('ok');
  assert.match(textoDe(await b.di('metí 10000 a la alcancía')), /\$10\.000 · Monedas → Alcancía/);
  await b.pulsa('ok');
  assert.equal(await saldoDe2(b, 'alcancia'), 15000);
  assert.match(textoDe(await b.di('saqué 2 monedas de 500 de la alcancía')), /Alcancía → Monedas/);
  await b.pulsa('ok');
  assert.equal(await saldoDe2(b, 'alcancia'), 14000);
});

test('alcancía: la alcancía se ve aparte y no suma al disponible; sin cifra pide cuánto', async () => {
  const b = bot('familia');
  await b.di('metí 3 monedas de 500 a la alcancía');
  await b.pulsa('ok');
  const t = textoDe(await b.di('saldo'));
  assert.match(t, /Alcancía: \$1\.500/);
  assert.match(t, /Disponible: \$0/);
  assert.match(textoDe(await b.di('metí plata a la alcancía')), /Dime cuánto/);
});

test('las apps que no tienen alcancía no la conocen', async () => {
  const t = textoDe(await bot('personal').di('metí 5 monedas de 500 a la alcancía'));
  assert.doesNotMatch(t, /Alcancía →|→ Alcancía/);
});

test('Cooperativa es un gasto mensual (categoría), no un saldo', async () => {
  const b = bot('familia');
  assert.doesNotMatch(textoDe(await b.di('saldo')), /Cooperativa/);
  assert.match(textoDe(await b.di('cooperativa 150000 bancolombia')), /Gasto · Aporte Cooperativa · \$150\.000 · Bancolombia/);
});

test('empresa: hay una cuenta «En otras cuentas» para la plata que está en cuentas personales', async () => {
  const b = bot('empresa');
  const t = textoDe(await b.di('cambio 100000 efectivo a personal'));
  assert.match(t, /Transferencia · \$100\.000 · Efectivo → En otras cuentas/);
  await b.pulsa('ok');
  assert.equal(await saldoDe2(b, 'otras-cuentas'), 100000);
  const s = textoDe(await b.di('saldo'));
  assert.match(s, /En otras cuentas: \$100\.000/);
  assert.match(s, /Disponible: \$0/); // la plata solo cambió de lugar: el efectivo bajó lo que subió la otra cuenta
  assert.match(s, /efectivo 85000 personal 150000 monedas 12000/);
});

test('el ejemplo de saldo inicial usa solo las cuentas de la app', async () => {
  assert.match(textoDe(await bot('familia').di('saldo')), /efectivo 85000 bancolombia 150000 monedas 12000/);
  assert.match(textoDe(await bot('personal').di('saldo')), /efectivo 85000 nequi 150000 monedas 12000/);
});

test('una copia local vieja se pone al día con su plantilla (sin Cooperativa, con alcancía)', async () => {
  const b = bot('familia');
  const d = (await b.repo.cargar());
  // como estaba antes: con Cooperativa y sin alcancía
  d.cuentas = d.cuentas.filter(c => c.id !== 'alcancia');
  d.cuentas.push({ id: 'cooperativa', nombre: 'Cooperativa', clave: 'cooperativa', tipo: 'dinero', moneda: 'COP', enDisponible: false });
  delete d.config.alias_cuentas;
  assert.equal(alinearConPlantilla(d, 'familia'), true);
  assert.ok(d.cuentas.some(c => c.id === 'alcancia'));
  assert.ok(!d.cuentas.some(c => c.id === 'cooperativa'));
  assert.ok(d.config.alias_cuentas);
  assert.equal(alinearConPlantilla(d, 'familia'), false, 'la segunda vez ya no hay nada que cambiar');
});

test('alinear no quita una cuenta de dinero que ya se usó, ni toca las personas', async () => {
  const b = bot('familia', { personas: [{ nombre: 'Ana', grupo: 'amigos' }] });
  const d = await b.repo.cargar();
  d.cuentas.push({ id: 'vieja', nombre: 'Vieja', clave: 'vieja', tipo: 'dinero', moneda: 'COP' });
  d.movimientos.push({ asientos: [{ cuentaId: 'vieja' }] } as never);
  alinearConPlantilla(d, 'familia');
  assert.ok(d.cuentas.some(c => c.id === 'vieja'));
  assert.ok(d.cuentas.some(c => c.id === 'per:ana'));
});

test('familia: plata al hijo queda como gasto Hijo, sin preguntar por Nequi ni por el nombre', async () => {
  // «julio» es una palabra aprendida de la instalación de la mamá (va en instalaciones/, no en la plantilla)
  const extra = { ...FAMILIA, aprendido: { julio: { categoriaId: 'cat:hijo' } } };
  for (const frase of ['Giro Julio 150k Bancolombia', 'Transferí a Nequi a Julio 150000 bancolombia', 'le giré 150k a Julio bancolombia']) {
    const t = textoDe(await bot('familia', extra).di(frase));
    assert.match(t, /Gasto · Hijo · \$150\.000 · Bancolombia/, frase);
    assert.doesNotMatch(t, /¿Quién es|¿Qué fue\?|¿En qué categoría/, frase);
  }
});

test('un medio de pago como Nequi nunca se toma por una persona', async () => {
  const t = textoDe(await bot('familia', FAMILIA).di('Transferí a Nequi 150000 bancolombia'));
  assert.doesNotMatch(t, /Nequi en el mensaje|¿Quién es Nequi/);
});

test('familia: Julio ya es persona y tiene categoría fija, así que un giro no pregunta nada', async () => {
  const extra = {
    personas: [...FAMILIA.personas, { nombre: 'Julio', grupo: 'casa' }],
    config: { categoria_persona: JSON.stringify({ 'per:julio': 'cat:hijo' }) },
  };
  for (const frase of ['Giro Julio 150k Bancolombia', 'Transferí a Nequi a Julio 150000 bancolombia', 'le giré 150k a Julio bancolombia']) {
    const b = bot('familia', extra);
    const t = textoDe(await b.di(frase));
    assert.match(t, /Gasto · Hijo · \$150\.000 · Bancolombia/, frase);
    assert.match(t, /Julio/, frase); // el concepto deja claro que fue a él
    assert.doesNotMatch(t, /¿Quién es|¿Qué fue\?|¿En qué categoría/, frase);
    assert.match(textoDe(await b.pulsa('ok')), /Guardado/, frase);
  }
  // sin la config sigue preguntando como siempre
  assert.match(textoDe(await bot('familia', { personas: extra.personas }).di('Giro Julio 150k Bancolombia')), /¿Qué fue\?/);
});

test('familia: el 4x1000 y las cuotas del banco van a Costos del banco', async () => {
  const casos: [string, RegExp][] = [
    ['4x1000 376 bancolombia', /Gasto · Costos del banco · \$376 · Bancolombia/],
    ['4 x 1000 1440 bancolombia', /Gasto · Costos del banco · \$1\.440 · Bancolombia/],
    ['me cobró 4 por mil 376 bancolombia', /Gasto · Costos del banco · \$376 · Bancolombia/],
    ['gmf 1440 bancolombia', /Gasto · Costos del banco · \$1\.440/],
    ['cuota de manejo 18900 bancolombia', /Gasto · Costos del banco · \$18\.900 · Bancolombia/],
  ];
  for (const [frase, esperado] of casos) {
    const t = textoDe(await bot('familia', FAMILIA).di(frase));
    assert.match(t, esperado, frase);
    assert.doesNotMatch(t, /¿En qué categoría|Veo varios montos/, frase);
  }
  // los dos movimientos juntos: el retiro y su 4x1000
  const b = bot('familia', FAMILIA);
  const t = textoDe(await b.di('saqué 360000 de bancolombia\n4x1000 376 bancolombia'));
  assert.match(t, /Movimiento 1 de 2/);
});

test('personal: el 4x1000 y la cuota de manejo también van a Costos del banco', async () => {
  for (const frase of ['4x1000 376 nequi', 'cuota de manejo 18900 nequi', 'gmf 1440']) {
    const t = textoDe(await bot('personal').di(frase));
    assert.match(t, /Gasto · Costos del banco/, frase);
  }
});
