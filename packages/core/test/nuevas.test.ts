import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INSTRUCCIONES_OCR, montoDeTexto, aLocal, conSubcategorias, deLocal, leerSubcategorias, normalizarDictado, quitarEnviadas, type Op, repartoEntre, revisarMes, diasParaMeta, fraseDeOCR, gastosHormiga, leerMetas, leerRespuestaOCR, rangoPeriodo, seguroParaGastar } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string) {
  await bot.di(texto, AHORA);
  await bot.pulsa('ok', AHORA);
}

test('seguro para gastar: resta pagos fijos y metas, y reparte entre los días que quedan', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 300000');
  await bot.di('meta bici 500000', AHORA);
  await bot.di('ahorré 50000 para bici', AHORA);
  await bot.di('cada mes el 28 internet 60000', AHORA);
  await bot.pulsa('ok', AHORA);
  const s = seguroParaGastar(await bot.repo.cargar(), AHORA);
  assert.equal(s.disponible, 300000);
  assert.equal(s.apartado, 50000);
  assert.equal(s.fijos, 60000);
  assert.equal(s.libre, 190000);
  assert.equal(s.porDia, Math.floor(190000 / s.dias));
});

test('seguro para gastar: nunca da negativo', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 10000');
  await bot.di('cada mes el 28 arriendo 500000', AHORA);
  await bot.pulsa('ok', AHORA);
  const s = seguroParaGastar(await bot.repo.cargar(), AHORA);
  assert.equal(s.libre, 0);
  assert.equal(s.porDia, 0);
  assert.equal(s.enRojo, true);
});

test('gastos hormiga: agrupa compras chicas que se repiten y proyecta al año', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000');
  for (const t of ['mecato 2000', 'mecato 2000', 'mecato 2500', 'transporte 3000', 'almuerzo 40000']) await guardar(bot, t);
  const { desde, hasta } = rangoPeriodo('mes', AHORA);
  const h = gastosHormiga((await bot.repo.cargar()).movimientos, (await bot.repo.cargar()).cuentas, desde, hasta, 31);
  assert.equal(h.top.length, 1);
  assert.equal(h.top[0].veces, 3);
  assert.equal(h.total, 6500);
  assert.equal(h.proyeccionAnual, Math.round((6500 / 31) * 365));
});

test('meta: los aportes quedan con fecha y dan una estimación de días', async () => {
  const bot = nuevoBot();
  await bot.di('meta moto 1000000', AHORA);
  await bot.di('ahorré 100000 para moto', AHORA);
  const m = leerMetas((await bot.repo.cargar()).config)[0];
  assert.equal(m.aportes?.length, 1);
  // 100000 en 60 días de ritmo: faltan 900000, o sea 9 veces más
  assert.equal(diasParaMeta(m, AHORA.toISOString().slice(0, 10)), 540);
  assert.equal(diasParaMeta({ ...m, apartado: m.meta }, '2026-10-27'), null);
});

test('ocr: lee el JSON aunque venga rodeado de texto y arma la frase', () => {
  const l = leerRespuestaOCR('Claro, aquí está: {"monto": "45.000", "fecha": "2026-10-20", "comercio": "Tienda Don Pepe", "categoria": "Mercado"}');
  assert.deepEqual(l, { monto: 45000, fecha: '2026-10-20', comercio: 'Tienda Don Pepe', categoria: 'mercado' });
  assert.equal(fraseDeOCR(l!, '2026-10-27'), 'tienda don pepe 45000 20/10');
  assert.equal(fraseDeOCR(l!, '2026-10-20'), 'tienda don pepe 45000');
  assert.equal(leerRespuestaOCR('no se ve nada'), null);
  assert.equal(leerRespuestaOCR({ monto: 0 }), null);
});

test('revisión: un tope superado y los anulados salen con su tipo para poder actuar', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000');
  await guardar(bot, 'mecato 5000');
  await bot.repo.setPresupuesto('cat:mecato', 3000);
  const puntos = revisarMes(await bot.repo.cargar(), AHORA);
  const tope = puntos.find(p => p.tipo === 'tope');
  assert.ok(tope, JSON.stringify(puntos));
  assert.equal(tope.categoriaId, 'cat:mecato');
  assert.match(tope.texto, /Superaste el tope de Mecato/);
  assert.ok(puntos.every(p => p.titulo && p.tipo));
});

test('«entre ana, luis y yo» reparte en partes iguales, igual que «pagué por»', async () => {
  assert.equal(repartoEntre('almuerzo 60000 entre ana, luis y yo'), 'almuerzo 60000 pagué por ana y luis');
  assert.equal(repartoEntre('almuerzo 60000 entre ana y luis'), 'almuerzo 60000 entre ana y luis');
  const bot = nuevoBot();
  bot.repo.aplicarPlantilla('personal', { personas: ['Ana', 'Luis'].map(nombre => ({ nombre, grupo: 'amigos' })) });
  await guardar(bot, 'saldo inicial efectivo 500000');
  await guardar(bot, 'almuerzo 60000 entre Ana, Luis y yo');
  const d = await bot.repo.cargar();
  const m = d.movimientos.filter(x => x.tipo === 'compartido').at(-1)!;
  assert.deepEqual(m.asientos.map(a => a.monto).sort((x, y) => x - y), [-60000, 20000, 20000, 20000]);
});

// ---------------------------------------------------------------- fechas en hora Colombia

test('fechas: después de las 7 pm en Colombia el día sigue siendo el de Colombia, no el de UTC', () => {
  // 8:30 pm del 19 de octubre en Colombia = 01:30 UTC del 20
  const noche = new Date('2026-10-20T01:30:00Z');
  assert.equal(noche.toISOString().slice(0, 10), '2026-10-20', 'en UTC ya es el día siguiente');
  assert.equal(aLocal(noche).slice(0, 10), '2026-10-19');
  assert.equal(aLocal(noche), '2026-10-19 20:30:00');
  // la frontera: 7:00 pm en Colombia es medianoche UTC
  assert.equal(aLocal(new Date('2026-10-20T00:00:00Z')), '2026-10-19 19:00:00');
  assert.equal(aLocal(new Date('2026-10-20T04:59:59Z')).slice(0, 10), '2026-10-19');
  assert.equal(aLocal(new Date('2026-10-20T05:00:00Z')).slice(0, 10), '2026-10-20');
});

test('fechas: anular de noche deja la fecha de Colombia en el movimiento', async () => {
  const noche = new Date('2026-10-20T02:10:00Z'); // 9:10 pm del 19 en Colombia
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await bot.di('mecato 5000', noche);
  await bot.pulsa('ok', noche);
  const id = (await bot.repo.cargar()).movimientos.at(-1)!.id;
  await bot.repo.anularMovimiento(id, aLocal(noche));
  const m = (await bot.repo.cargar()).movimientos.find(x => x.id === id)!;
  assert.equal(m.estado, 'anulado');
  assert.equal(m.ocurridoEn.slice(0, 10), '2026-10-19');
});

test('seguro para gastar: los días del mes no dependen de la zona del navegador ni del año bisiesto', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  const datos = await bot.repo.cargar();
  assert.equal(seguroParaGastar(datos, deLocal('2028-02-28 10:00:00')).dias, 2);   // 2028 es bisiesto: 28 y 29
  assert.equal(seguroParaGastar(datos, deLocal('2027-02-28 10:00:00')).dias, 1);
  assert.equal(seguroParaGastar(datos, deLocal('2026-10-31 23:00:00')).dias, 1);
  assert.equal(seguroParaGastar(datos, deLocal('2026-10-01 00:30:00')).dias, 31);
});

// ---------------------------------------------------------------- cola de sincronización

const op = (id: string): Op => ({ op: 'anular', id, cuando: '2026-10-19 10:00:00' });

test('cola: solo se quitan las operaciones enviadas y lo anotado mientras viajaba se queda', () => {
  const a = op('a'), b = op('b'), c = op('c');
  const cola = [a, b];
  const enviadas = [...cola];            // lo que sincronizar() manda
  cola.push(c);                          // se anota algo durante el fetch
  assert.equal(quitarEnviadas(cola, enviadas), 2);
  assert.deepEqual(cola, [c]);
});

test('cola: si la cola se vació o se reemplazó durante el envío (restaurar un respaldo), no se pierde lo nuevo', () => {
  const a = op('a'), b = op('b');
  const enviadas = [a, b];
  // se limpió y quedó una operación nueva
  const cola = [op('nueva')];
  assert.equal(quitarEnviadas(cola, enviadas), 0);
  assert.equal(cola.length, 1);
  // se vació por completo
  const vacia: Op[] = [];
  assert.equal(quitarEnviadas(vacia, enviadas), 0);
  // se mezcló: una de las enviadas sigue y otra nueva llegó antes
  const mezcla = [op('x'), b, op('y')];
  assert.equal(quitarEnviadas(mezcla, enviadas), 1);
  assert.deepEqual(mezcla.map(o => (o as { id: string }).id), ['x', 'y']);
});

test('cola: dos operaciones iguales pero distintas en memoria se tratan por separado', () => {
  const uno = op('mismo'), otro = op('mismo');
  const cola = [uno, otro];
  quitarEnviadas(cola, [uno]);
  assert.deepEqual(cola, [otro]);
  assert.equal(cola[0], otro);
});

// ---------------------------------------------------------------- ejemplos de docs/BOT.md

test('subcategorías: hasta tres niveles, el cuarto se rechaza y lo del nivel hondo suma en los de arriba', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('subcategoria restaurante de comida')), /Creé la subcategoría Restaurante dentro de Comida/);
  assert.match(textoDe(await bot.di('subcategoria domicilios de restaurante')), /Domicilios dentro de Restaurante/);
  assert.match(textoDe(await bot.di('subcategoria postres de domicilios')), /pasaría de 3 niveles/);
  const config = (await bot.repo.cargar()).config;
  assert.deepEqual(leerSubcategorias(config), { 'cat:restaurante': 'cat:comida', 'cat:domicilios': 'cat:restaurante' });
  assert.deepEqual(conSubcategorias(config, 'cat:comida'), ['cat:comida', 'cat:restaurante', 'cat:domicilios']);
});

test('voz: los números en palabras (docs/BOT.md, «Dictar por voz»)', () => {
  assert.equal(normalizarDictado('mecato ciento veinte mil trescientos'), 'mecato 120300');
  assert.equal(normalizarDictado('cinco mil quinientos'), '5500');
  assert.equal(normalizarDictado('dos millones quinientos mil'), '2500000');
});

test('plata de otra persona: se anota, se paga con ella y los pesos que sobran se cuadran sin contar como gasto', async () => {
  const bot = nuevoBot();
  bot.repo.aplicarPlantilla('personal', { personas: [{ nombre: 'Mamá', grupo: 'familia' }] });
  await guardar(bot, 'saldo inicial efectivo 500000 nequi 0');
  await guardar(bot, 'plata de mamá para cooperativa 150000 nequi');
  await guardar(bot, 'cooperativa 149984 con plata de mamá nequi');
  assert.match(textoDe(await bot.di('cuadrar con mamá')), /Queda en cero con Mamá.*Descuadre/s);
  await bot.pulsa('ok');
  const m = (await bot.repo.cargar()).movimientos.at(-1)!;
  assert.equal(m.tipo, 'ajuste');
  assert.deepEqual(m.asientos.map(a => a.monto).sort((x, y) => x - y), [-16, 16]);
});

// ---------------------------------------------------------------- lectura de comprobantes: lo que falló con una tirilla real

test('ocr: una fecha imposible (la resolución de la DIAN) se descarta y no se inventa el día', () => {
  const hoy = '2026-11-14';
  const dian = leerRespuestaOCR({ monto: 50060, fecha: '2016-12-26', comercio: 'D1 SAS' }, hoy);
  assert.equal(dian?.fecha, null);
  assert.equal(fraseDeOCR(dian!, hoy), 'd1 sas 50060');
  assert.equal(leerRespuestaOCR({ monto: 50060, fecha: '2026-11-07', comercio: 'D1' }, hoy)?.fecha, '2026-11-07');
  assert.equal(leerRespuestaOCR({ monto: 1000, fecha: '2027-03-01' }, hoy)?.fecha, null, 'una compra del futuro no existe');
  assert.equal(leerRespuestaOCR({ monto: 1000, fecha: '2026-11-15' }, hoy)?.fecha, '2026-11-15', 'un día de margen por la zona horaria');
  // sin «hoy» no se juzga la fecha
  assert.equal(leerRespuestaOCR({ monto: 1000, fecha: '2016-12-26' })?.fecha, '2016-12-26');
});

test('ocr: «Cambio», «Total» y demás palabras de la factura no son un comercio', () => {
  for (const p of ['Cambio', 'TOTAL', 'Subtotal', 'Gracias', 'IVA', 'null']) {
    assert.equal(leerRespuestaOCR({ monto: 50060, comercio: p, categoria: 'mercado' })?.comercio, '', p);
  }
  assert.equal(fraseDeOCR(leerRespuestaOCR({ monto: 50060, comercio: 'Cambio', categoria: 'mercado' })!, '2026-11-14'), 'mercado 50060');
  assert.equal(leerRespuestaOCR({ monto: 50060, comercio: 'D1 SAS' })?.comercio, 'D1 SAS');
});

test('ocr: fechas con barras y montos escritos como total', () => {
  const l = leerRespuestaOCR('{"total": "$ 50.060", "fecha": "07/11/2026", "comercio": "Ara"}', '2026-11-14');
  assert.deepEqual(l, { monto: 50060, fecha: '2026-11-07', comercio: 'Ara', categoria: null });
});

test('ocr: las instrucciones traen las reglas que corrigen los errores vistos', () => {
  for (const regla of [/RESUMEN DE IMPUESTOS/, /BASE/, /justo debajo de la lista de artículos/, /DIAN/, /TOTAL/, /CAMBIO/, /VUELTO/, /encabezado/, /D1/, /Nequi/, /Daviplata/, /Bancolombia/, /null/]) assert.match(INSTRUCCIONES_OCR, regla);
});

// ---------------------------------------------------------------- lectura de comprobantes: el monto sale del texto transcrito

const TIRILLA_D1 = [
  'D1 SAS NIT900276962-1', 'FECHA 2026-11-07 18:42', 'ARROZ 1KG 4,200', 'ACEITE 8,900', 'SUBTOTAL 47,324', 'IVA 2,736',
  'TOTAL 50,060', 'TARJ CRE 50,060', 'CAMBIO 0', 'RESUMEN DE IMPUESTOS', 'TARIFA BASE IVA TOTAL', 'EXCLUIDO 47,324 0 47,324', 'TOTAL 47,324',
].join('\n');

test('ocr: con el texto transcrito, el total de la tirilla manda sobre el monto que eligió el modelo', () => {
  assert.equal(montoDeTexto(TIRILLA_D1), 50060);
  const l = leerRespuestaOCR({ monto: 47724, fecha: '2026-11-07', comercio: 'D1 SAS NIT900276962-1', categoria: 'comida', texto: TIRILLA_D1 }, '2026-11-14');
  assert.deepEqual(l, { monto: 50060, fecha: '2026-11-07', comercio: 'D1 SAS', categoria: 'comida' });
});

test('ocr: la tabla de impuestos nunca cuenta, aunque su TOTAL salga primero que el de la compra', () => {
  assert.equal(montoDeTexto('RESUMEN DE IMPUESTOS\nTOTAL 47,324\nVALOR PAGADO 50,060'), 50060, 'si lo pagado está solo ahí, se acepta');
  assert.equal(montoDeTexto('EXCLUIDO\nTOTAL 47,324'), 0, 'un TOTAL que solo está en la tabla no se acepta');
  assert.equal(montoDeTexto('TOTAL 50,060\nEXENTO\nTOTAL 1,000'), 50060);
});

test('ocr: prioridad entre valor pagado, total y forma de pago, y líneas que no son el total', () => {
  assert.equal(montoDeTexto('TOTAL 50,060\nVALOR PAGADO 50.100'), 50100, 'lo pagado va primero');
  assert.equal(montoDeTexto('TOTAL ITEMS 5\nTOTAL 12.500'), 12500, 'el número de ítems no es plata');
  assert.equal(montoDeTexto('SUBTOTAL 47,324\nTOTAL IVA 2,736\nTARJ DEB 50,060'), 50060, 'sin TOTAL, la forma de pago');
  assert.equal(montoDeTexto('TOTAL $ 1.250.500,00'), 1250500);
  assert.equal(montoDeTexto('gracias por su compra'), 0);
});

test('ocr: sin texto, o si el texto no trae un total seguro, se queda el monto del modelo', () => {
  assert.equal(leerRespuestaOCR({ monto: 9000, comercio: 'Tienda' })?.monto, 9000);
  assert.equal(leerRespuestaOCR({ monto: 9000, texto: 'TIENDA DON PEPE\nGRACIAS' })?.monto, 9000);
  assert.equal(leerRespuestaOCR({ texto: 'TOTAL 50,060' })?.monto, 50060, 'el texto basta aunque el modelo no dé monto');
});

test('ocr: el nombre del comercio se corta en el NIT', () => {
  for (const [dado, queda] of [['D1 SAS NIT900276962-1', 'D1 SAS'], ['Ara NIT 800.000.000-1', 'Ara'], ['Tiendas Ara N.I.T. 12345', 'Tiendas Ara'], ['Éxito 890900608', 'Éxito'], ['Nequi', 'Nequi']]) {
    assert.equal(leerRespuestaOCR({ monto: 1000, comercio: dado })?.comercio, queda, dado);
  }
});

test('ocr: las instrucciones piden transcribir las líneas clave', () => {
  assert.match(INSTRUCCIONES_OCR, /TEXTO:/);
  assert.match(INSTRUCCIONES_OCR, /sin JSON/);
  assert.match(INSTRUCCIONES_OCR, /No copies la tabla de impuestos/);
});

// ---------------------------------------------------------------- lectura de comprobantes: la forma de la respuesta

const RESPUESTA_LINEAS = ['MONTO: 47724', 'FECHA: 2026-11-07', 'COMERCIO: D1 SAS NIT900276962-1', 'CATEGORIA: Comida', 'TEXTO:', ...TIRILLA_D1.split('\n')].join('\n');

test('ocr: la respuesta en líneas CLAVE: valor se lee entera, con el texto de varias líneas', () => {
  const l = leerRespuestaOCR(RESPUESTA_LINEAS, '2026-11-14');
  assert.deepEqual(l, { monto: 50060, fecha: '2026-11-07', comercio: 'D1 SAS', categoria: 'comida' });
});

test('ocr: en líneas, una FECHA dentro del texto transcrito no pisa la de arriba, y vienen bien las vallas y los asteriscos', () => {
  const r = '```\n**MONTO:** $ 50.060\n**FECHA:** 2026-11-07\nCOMERCIO: Ara\nCATEGORIA: mercado\nTEXTO:\nFECHA 2016-12-26\nTOTAL 50,060\n```';
  const l = leerRespuestaOCR(r, '2026-11-14');
  assert.deepEqual(l, { monto: 50060, fecha: '2026-11-07', comercio: 'Ara', categoria: 'mercado' });
});

test('ocr: un JSON con saltos de línea sueltos dentro de «texto» (lo que rompía JSON.parse) se repara y se lee', () => {
  const roto = '{"monto": 47724, "fecha": "2026-11-07", "comercio": "D1 SAS NIT900276962-1", "categoria": "comida", "texto": "' + TIRILLA_D1 + '"}';
  assert.throws(() => JSON.parse(roto), 'el JSON con saltos de línea sueltos no es válido');
  assert.deepEqual(leerRespuestaOCR(roto, '2026-11-14'), { monto: 50060, fecha: '2026-11-07', comercio: 'D1 SAS', categoria: 'comida' });
  // rodeado de palabras y con comillas escapadas dentro
  const con = 'Aquí va:\n{"monto": "50.060", "comercio": "Tienda \\"El Sol\\"", "texto": "TOTAL 50,060\nGRACIAS"}\nListo.';
  assert.equal(leerRespuestaOCR(con)?.comercio, 'Tienda "El Sol"');
  assert.equal(leerRespuestaOCR(con)?.monto, 50060);
});

test('ocr: una respuesta sin nada útil no da lectura', () => {
  for (const r of ['', 'no veo nada', 'MONTO: null\nFECHA: null', '{"monto": null}', '{roto']) assert.equal(leerRespuestaOCR(r), null, r);
});
