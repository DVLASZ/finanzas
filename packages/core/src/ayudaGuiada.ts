/**
 * «Pregúntale cómo decirlo»: la persona escribe su duda con sus palabras («cómo anoto que presté plata») y recibe el ejemplo
 * exacto, con las cuentas de su app, listo para usar. Sin red y sin IA: cada tema es un dato (palabras y frases clave), la duda
 * se reduce a raíces y gana el tema con más coincidencias. Responde al instante y sin internet.
 */
import { ejemploDeCuenta } from './entidades.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface RespuestaDeAyuda { id: string; tema: string; explicacion: string; ejemplos: string[] }

type Ctx = Pick<Contexto, 'cuentas' | 'config'>;

/** `palabras` son raíces (hasta 5 letras, la duda se corta igual); `frases` valen doble. `{cuenta}` se cambia por una cuenta real. */
export interface TemaDeAyuda { id: string; tema: string; palabras: string[]; frases?: string[]; explicacion: string; ejemplos: string[] }

/** El orden desempata: si dos temas puntúan igual, sale primero el que está antes. */
export const TEMAS_AYUDA: TemaDeAyuda[] = [
  { id: 'custodia', tema: 'Plata de otra persona (custodia)', palabras: ['custo', 'encar', 'ajena', 'ajeno', 'tercer', 'giraro', 'girar'],
    frases: ['en custodia', 'plata ajena', 'plata de otra', 'de otra persona', 'no es mia', 'pa guardar', 'para guardar', 'guardarsela', 'guardarle', 'para entregar', 'se la pase', 'pa darle', 'tenerla mientras', 'pa tenerla', 'mientras pagan', 'asociacion me mando', 'encargada', 'como plata mia', 'de terceros', 'devuelva esa plata', 'una parte de la plata', 'mandaron plata pa pagar', 'mandaron plata para pagar', 'me mandaron plata pa', 'consignacion que me hicieron'],
    explicacion: 'La plata que te dan para guardar, entregar o pagar algo de otra persona no es tuya, así que no la anotes como ingreso. Se lleva como custodia: queda anotada como plata que le debes a quien te la dio (si te la mandó la Asociación, a nombre de la Asociación). Cuando la entregas, la devuelves o pagas con ella lo que te pidieron, lo anotas como pago de esa deuda y la custodia baja. Si usaste una parte, la deuda sigue completa y queda pendiente de devolver; lo que gastaste anótalo como un gasto tuyo. Puede ser también para pagar el recibo de otra persona: recibes la plata como custodia y, al pagarlo, lo anotas como pago de esa deuda. No hace falta fecha de entrega: queda pendiente hasta que se cierre.',
    ejemplos: ['me prestó Jorge 50000', 'pagué 50000 a Jorge', 'deudas'] },
  { id: 'cuotas', tema: 'Compras a cuotas', palabras: ['cuota', 'plazo', 'financ'],
    frases: ['a cuotas', 'cuotas con tarjeta', 'sin intereses', 'con intereses', 'tiene intereses', 'cuota inicial', 'abono inicial', 'a plazos'],
    explicacion: 'Una compra a cuotas se anota una sola vez, por el valor total, y no una vez por cada cuota, sea sin intereses o con intereses. Con tarjeta de crédito es una deuda con la persona «Tarjeta» (créala una vez: «agregar persona Tarjeta»). Las cuotas se entienden, pero la app no las lleva: la deuda queda completa y la vas pagando con abonos. Los intereses, si los hay, se anotan aparte cuando el banco los cobra, con el valor real del extracto. Si diste una cuota inicial, anótala como un gasto normal por esa parte y el resto con la tarjeta.',
    ejemplos: ['compré un celular de 1200000 con la tarjeta', 'me cobraron 120000 de intereses de la tarjeta', 'aboné 150k a la tarjeta desde {cuenta}'] },
  { id: 'reverso', tema: 'Compra devuelta o reversada', palabras: ['rever'],
    frases: ['me reverso', 'me reversaron', 'compra que devolvi', 'devolvi una compra', 'devolvi la compra', 'reverso del banco'],
    explicacion: 'Si devolviste una compra y el banco te reversó la plata, no borres la compra: anota lo que te devolvieron como plata que te entra, con el concepto de esa compra. Así el gasto queda compensado y se ve todo lo que pasó. Si la compra la anotaste mal, mejor edítala en Movimientos.',
    ejemplos: ['me reversaron 80000 de la compra de ropa {cuenta}'] },
  { id: 'verdeudas', tema: 'Ver quién te debe y a quién le debes', palabras: ['debe'],
    frases: ['cuanto me debe', 'cuanto le debo', 'cuanto debo', 'donde veo cuanto', 'miro cuanto me debe', 'todos los prestamos', 'prestamos que le he hecho', 'le he hecho'],
    explicacion: 'Escribe «deudas» y ves quién te debe y a quién le debes. Si escribes solo el nombre de la persona (por ejemplo «Jorge») ves cómo van las cuentas con ella: lo que te debe, lo que le debes y los préstamos que le has hecho, con lo que falta por devolver. También lo ves en Más, Deudas y préstamos.',
    ejemplos: ['deudas', 'Sofia'] },
  { id: 'transferencias', tema: 'Mandar o recibir plata por transferencia', palabras: ['mande', 'mando', 'envie', 'envio'],
    frases: ['le mande plata', 'mande plata a', 'me mando plata', 'que me mando', 'me mandaron plata', 'por transferencia'],
    explicacion: 'Dime para qué fue y lo anoto bien. Si le mandas plata a alguien que le debes, «pagué 50000 a Jorge por Nequi»; si se la prestas, «presté 50000 a Jorge»; si es una compra, un gasto normal. Si te mandan plata, es plata recibida: puede ser que te devuelvan algo («Laura me pagó 75000 bancolombia») o un ingreso («me pagaron 75000 de Laura bancolombia»). Sin el motivo (pago, préstamo, devolución o ingreso) no adivino y te pregunto. Si lo que mandas va a otra cuenta tuya, es un traslado y no un gasto.',
    ejemplos: ['pagué 50000 a Jorge {cuenta}', 'presté 50000 a Jorge', 'Laura me pagó 75000 {cuenta}'] },
  { id: 'casa', tema: 'Casa y asociación', palabras: ['casa', 'hogar', 'asoci'],
    frases: ['la casa', 'de la casa', 'para la casa', 'sin revolverlos', 'revolver', 'mezclar', 'mama pago', 'pago mama'],
    explicacion: 'La casa y la asociación son apps separadas, cada una con su propia base y su propio acceso: no se mezclan ni se pasan movimientos de una a otra. Lo de la casa se anota en la app de la casa y lo de la asociación en la de la asociación; para verlos por separado, abre la app que corresponde. Si en tu app llevas a la Asociación como una persona, lo que tienes con ella sale al escribir su nombre. Si alguien de la familia pagó algo de la casa, como el mercado, anótalo como deuda con esa persona («le debo 180000 a Mamá por el mercado») y, cuando se lo devuelvas, «le pagué 180000 a Mamá».',
    ejemplos: ['le debo 180000 a Mamá por el mercado', 'le pagué 180000 a Mamá'] },
  { id: 'exportar', tema: 'Sacar tus datos (Excel e informe)', palabras: ['excel', 'expor', 'infor', 'repor', 'csv', 'descar'],
    frases: ['a excel', 'un informe', 'sacar un informe', 'informe de los movimientos', 'un informe de', 'saco mis gastos', 'pa guardarlos', 'para guardarlos'],
    explicacion: 'Para exportar tus datos, ve a Más, Ajustes, «Pasar a Excel»: baja un archivo con tus movimientos, saldos, deudas y totales por mes, y funciona sin internet. Para un informe para imprimir, usa el botón del informe en Resumen. Cada app exporta solo lo suyo: los movimientos de la Asociación se sacan desde la app de la Asociación y no se mezclan con los de la casa. Esta pregunta no genera ningún archivo.',
    ejemplos: ['mes'] },
  { id: 'facturapendiente', tema: 'Una factura que todavía no pagas', palabras: ['pendi'],
    frases: ['no la he pagado', 'todavia no la he pagado', 'todavia no la pague', 'sin pagar', 'por pagar', 'me llego una factura', 'llego una factura', 'aun no la pago'],
    explicacion: 'Una factura que todavía no pagas no es un gasto: no la anotes aún, porque no ha salido plata. Si quieres que te avise cuando toque, créala como pago fijo y queda pendiente hasta su fecha; si no, anótala cuando la pagues, con la fecha en que la pagaste.',
    ejemplos: ['cada mes el 10 energía 120000'] },
  { id: 'compartido', tema: 'Compartido', palabras: ['compa', 'divid', 'vaca', 'amigo', 'mitad', 'medias', 'parte', 'igual', 'entre'],
    frases: ['entre varios', 'entre amigos', 'entre todos', 'cuenta de todos', 'partes iguales', 'entre tres', 'entre dos', 'pero era entre', 'cada uno puso', 'puso su parte', 'antes de comprar'],
    explicacion: 'Pon el total que se pagó y con quién, entre todos los que fueron (tú cuentas): yo calculo tu parte y lo que te deben los demás. Si pagaste tú y eran tres, escribe el total con los otros dos. Cuando alguien te devuelva su parte, o solo una parte, anótalo como abono. Si cada uno puso su parte antes de comprar, anota la compra completa entre todos y lo que cada uno te dio como abono de su parte, así no se cuenta doble.',
    ejemplos: ['pizza 40000 entre ana, luis y yo', 'Ana me pagó 20000'] },
  { id: 'prestamo', tema: 'Préstamo', palabras: ['prest', 'deben'], frases: ['me deben', 'me debe', 'le fie', 'fiar a', 'le presto', 'le preste'],
    explicacion: 'Anota a quién le prestaste: queda como plata que te deben (una cuenta por cobrar), no como gasto. Cuando te pague, escribe «Ana me pagó 40000».',
    ejemplos: ['presté 40000 a Ana', 'Ana me pagó 40000'] },
  { id: 'deuda', tema: 'Deuda', palabras: ['debo', 'deuda', 'fiado', 'fiaro', 'debie', 'debia'], frases: ['me fiaron', 'me prestaron', 'le debo', 'quede debiendo', 'me presto', 'que me presto'],
    explicacion: 'Anota a quién le debes y por qué. Un préstamo recibido es una deuda: la plata que te dieron no es un ingreso tuyo. Para pagarle después: «pagué 54000 a Pedro».',
    ejemplos: ['le debo 54000 a Pedro por la bici', 'pagué 54000 a Pedro', 'deudas'] },
  { id: 'abono', tema: 'Abono parcial', palabras: ['abon', 'parci', 'cuota', 'pagu'], frases: ['le pague', 'me pago', 'pago parcial', 'una parte', 'de a poco', 'poco a poco', 'poquitos', 'de a poquito', 'solo una parte'],
    explicacion: 'Pagar una parte de una deuda o cobrar solo una parte de un préstamo es un abono. La deuda baja y lo que falta queda anotado.',
    ejemplos: ['le pagué 20000 a Pedro', 'Ana me pagó 10000'] },
  { id: 'cajero', tema: 'Cajero', palabras: ['cajer', 'retir', 'saque', 'sacar', 'saco', 'comis'], frases: ['sacar plata', 'saque plata', 'sacar efectivo', 'saco plata', 'del cajero'],
    explicacion: 'Sacar del cajero es pasar plata de una cuenta a efectivo: no es gasto, solo cambia dónde está. Si el banco te cobró por usar el cajero, dilo en la misma frase y esa comisión se anota aparte, en Costos del banco. El 4x1000 no lo calculo: dime cuánto fue.',
    ejemplos: ['cambio 100000 {cuenta} a efectivo', 'saqué 100000 de {cuenta} y me cobraron 4000 por usar el cajero'] },
  { id: 'pasar', tema: 'Pasar plata', palabras: ['pasar', 'paso', 'trans', 'mover', 'consi', 'meter'], frases: ['pasar plata', 'paso plata', 'pase de', 'mover plata', 'cambio de cuenta', 'de una cuenta a otra', 'entre cuentas', 'entre mis cuentas', 'meter plata'],
    explicacion: 'Pasar plata de una cuenta a otra (de Bancolombia a Nequi, o consignar efectivo) no es gasto ni ingreso: solo cambia dónde está, y en los reportes no infla ninguno de los dos. Si no dices cuáles cuentas, te pregunto. Una transferencia pendiente o rechazada no la anoto hasta que salga.',
    ejemplos: ['cambio 50000 efectivo a {cuenta}', 'consigné 90000 en {cuenta}'] },
  { id: 'tarjeta', tema: 'Tarjeta de crédito', palabras: ['tarje', 'credi', 'cupo', 'minim'], frases: ['tarjeta de credito', 'con la tarjeta', 'pagar la tarjeta', 'pago de la tarjeta', 'abono a la tarjeta', 'debo de la tarjeta', 'pago la tarjeta', 'pague la tarjeta', 'el minimo', 'pago minimo'],
    explicacion: 'La tarjeta de crédito se lleva como una persona llamada Tarjeta: lo que compras con ella es una deuda con Tarjeta, y cuando la pagas la deuda baja. Primero créala una sola vez. Para pagarla, anota un abono a Tarjeta desde la cuenta con la que pagas (Nequi, Bancolombia...): no es un gasto nuevo, porque la compra ya la anotaste, así que no se cuenta doble. Si solo pagas el mínimo, anota solo lo que pagaste: el resto sigue pendiente como deuda. Las cuotas las entiendo, pero no las llevo: la deuda queda completa. Los intereses que te cobren se anotan como un aumento de la deuda.',
    ejemplos: ['agregar persona Tarjeta', 'compré unos audífonos de 240k con la tarjeta', 'aboné 150k a la tarjeta desde {cuenta}', 'me cobraron 18k de intereses de la tarjeta'] },
  { id: 'alertas', tema: 'Alertas del banco y recibos', palabras: ['alert', 'notif', 'tiril', 'pegar', 'pegue', 'pegarl', 'bogot', 'bance', 'davip', 'banco', 'propin', 'copiar'], frases: ['pegar alerta', 'alerta del banco', 'mensaje del banco', 'notificacion del banco', 'pegar un recibo', 'recibo pegado', 'copiar el mensaje', 'pegar una tirilla', 'mensaje que me llega', 'dos veces', 'misma notificacion', 'propina aparte', 'con propina', 'texto de una factura'],
    explicacion: 'Copia la notificación de Nequi, Bancolombia, Daviplata o Banco de Bogotá y pégala en el chat, o toca Pegar alerta: saco el monto de la operación (no los saldos), si pagaste o te llegó plata, la cuenta, la fecha y la hora, y te dejo la tarjeta para confirmar. Con un recibo o una tirilla en texto anoto un solo gasto por lo que de verdad pagaste, sin sumar subtotal, IVA ni cambio. Si pegas dos veces la misma alerta no se cuenta doble: comparo la referencia, el valor y el comercio y te aviso que ya está registrada (mientras la app esté abierta; si la cerraste, revisa en Movimientos). De un recibo con propina cuento solo la propina que de verdad pagaste, no la sugerida. Lo rechazado o pendiente no lo anoto. Nada se guarda hasta que toques Confirmar.',
    ejemplos: ['mecato 12000 {cuenta}', 'ingreso 50000 trabajo {cuenta}'] },
  { id: 'ingreso', tema: 'Ingreso', palabras: ['ingre', 'sueld', 'quinc', 'salar', 'llego', 'giraro', 'cayo', 'depos', 'entra', 'nomin', 'honor', 'chamb', 'traba', 'activ'],
    frases: ['me pagaron', 'me giraron', 'me consignaron', 'me llego', 'me cayo', 'me depositaron', 'recibi', 'me ingresa', 'me entra', 'me paguen', 'me pagan', 'me van a pagar', 'me hicieron un pago', 'me hicieron una transferencia', 'me transfirieron', 'me dieron plata', 'me regalaron', 'vendi algo', 'una venta', 'vender', 'pago de una actividad', 'pago por un trabajo', 'plata que entra', 'plata que me entra', 'plata que recibo', 'recibo plata', 'me llega plata', 'por un trabajo', 'por una actividad', 'por mi trabajo', 'que me hicieron', 'me pago', 'me entro', 'me ingreso', 'me entraron', 'me ingresaron', 'me llegaron', 'meto plata'],
    explicacion: 'Un ingreso lleva el monto, de qué es y, si quieres, la cuenta donde cayó.',
    ejemplos: ['ingreso 50000 actividad', 'me pagaron 80k congreso {cuenta}', 'ingreso 50000 trabajo {cuenta}'] },
  { id: 'meta', tema: 'Meta', palabras: ['meta', 'ahorr', 'alcan', 'apart'], frases: ['guardar plata', 'guardo plata', 'guardo plata para', 'ahorro para', 'juntar plata'],
    explicacion: 'Crea la meta con su total y después aparta de a poco.',
    ejemplos: ['meta moto 2000000', 'ahorré 50000 para moto'] },
  { id: 'fijo', tema: 'Pago fijo', palabras: ['fijo', 'recur', 'suscr', 'repit', 'mensu', 'arrie', 'inter'], frases: ['cada mes', 'cada quincena', 'se repite'],
    explicacion: 'Un pago que se repite te avisa cuando toca y queda como botón en el chat.',
    ejemplos: ['cada mes el 5 internet 60000'] },
  { id: 'pausar', tema: 'Pausar o cancelar un pago fijo', palabras: ['paus', 'cance', 'termi', 'fin', 'reanu', 'suscr', 'fijo', 'arrie', 'inter', 'netfl'],
    explicacion: 'Pausa un pago fijo para que deje de avisar, reanúdalo cuando vuelva, ponle fecha de fin o quítalo del todo. Lo ya pagado no se toca.',
    ejemplos: ['pausar recurrente claude', 'reanudar recurrente claude', 'fin recurrente claude 21/12/2026', 'quitar recurrente claude'] },
  { id: 'personas', tema: 'Personas', palabras: ['perso', 'nombr', 'conta', 'renom', 'herma', 'famil', 'primo', 'prima', 'abuel', 'novio', 'novia', 'sobri'],
    frases: ['anotar a', 'agregar a mi', 'registrar a mi', 'una persona', 'nueva persona', 'agregar persona', 'a una persona', 'registrar a', 'borrar una persona', 'borro una persona', 'elimino una persona', 'eliminar una persona', 'quitar una persona', 'quito una persona'],
    explicacion: 'Una persona es alguien a quien le prestas, le debes o con quien compartes. Agrégala con su nombre, cámbiale el nombre cuando quieras, y si escribes solo su nombre ves cómo van las cuentas con ella.',
    ejemplos: ['agregar persona Sofia', 'nueva persona Laura', 'registrar a Sofia', 'renombrar persona Sofia a Sofi', 'Sofia'] },
  { id: 'etiquetas', tema: 'Etiquetas y subcategorías', palabras: ['#', 'hasht', 'etiqu', 'subca', 'agrup'], frases: ['tag'],
    explicacion: 'Con # juntas varios gastos de un mismo plan (un cumpleaños, un viaje) y después ves cuánto costó todo. Una subcategoría parte una categoría en pedazos más finos.',
    ejemplos: ['almuerzo 12000 #cumple-ana', 'subcategoria restaurante de comida'] },
  { id: 'comprobantes', tema: 'Comprobantes', palabras: ['recib', 'foto', 'escan', 'adjun', 'image', 'subir'],
    explicacion: 'Para guardar el comprobante de un movimiento, ábrelo en Movimientos y toca Tomar foto o Subir imagen: la foto se reduce y queda guardada en el servidor. Y el botón del escáner del chat lee un comprobante con IA y deja el gasto listo para anotar.',
    ejemplos: ['mecato 4500'] },
  { id: 'topes', tema: 'Topes', palabras: ['tope', 'limit', 'presu'],
    frases: ['un tope', 'el tope', 'pausar tope', 'del presupuesto', 'me queda del presupuesto', 'presupuesto de'],
    explicacion: 'Un tope es lo máximo que quieres gastar al mes en una categoría; te aviso cuando te acercas. Para fijarlo o cambiarlo, escríbelo otra vez con el monto nuevo (reemplaza al anterior): «tope mercado 500000». Para pausarlo sin borrarlo (no avisa ni cuenta hasta que lo reanudes): «pausar tope mercado», y «reanudar tope mercado» lo activa con el mismo monto. Para quitarlo del todo: «quitar tope mercado». Para ver cuánto llevas y cuánto te queda de cada tope, escribe «mes».',
    ejemplos: ['tope mercado 500000', 'pausar tope mercado', 'quitar tope mercado', 'mes'] },
  { id: 'corregir', tema: 'Corregir o eliminar', palabras: ['arreg', 'puse', 'puso', 'deshac', 'equivo', 'corre', 'anula', 'borr', 'confu', 'edit', 'cambi', 'categ', 'elimi', 'anul', 'quita'],
    frases: ['por error', 'lo arreglo', 'la fecha de hoy', 'cambio la fecha', 'cambiar la fecha', 'pague en efectivo pero', 'me equivoque', 'puse mal', 'quitar un gasto', 'quito un gasto', 'quitar un movimiento', 'cambiar el monto', 'cambiar la categoria', 'cambio la categoria', 'me confundi', 'editar un gasto', 'edito un gasto', 'editar un movimiento', 'edito un movimiento', 'cambiar un gasto', 'cambio un gasto', 'borrar un gasto', 'borro un gasto', 'borrar un movimiento', 'borro un movimiento', 'corregir un gasto', 'corrijo un gasto'],
    explicacion: 'Nada se borra: lo que deshaces o anulas queda marcado como anulado. Para corregir algo ya guardado, ábrelo en Movimientos y toca Editar: puedes cambiar el monto, la categoría, la fecha y la cuenta o medio de pago (efectivo, Nequi...) sin crear otro movimiento. Para lo último que anotaste: «editar último». Para quitar uno anotado por error: Anular, y Restaurar si te arrepientes. Si todavía no confirmas la tarjeta, escribe solo lo que cambia: «monto 18000», «nequi», «ayer».',
    ejemplos: ['deshacer', 'editar último'] },
  { id: 'otrodia', tema: 'Otro día', palabras: ['ayer', 'antie', 'fecha', 'lunes', 'dias'], frases: ['anteayer', 'otro dia'],
    explicacion: 'Agrega cuándo fue al final de la frase.',
    ejemplos: ['almuerzo 12000 ayer'] },
  { id: 'saldos', tema: 'Saldos', palabras: ['saldo', 'resum', 'total'], frases: ['cuanto tengo', 'cuanto llevo', 'como voy', 'cuanto gaste', 'cuanto he gastado', 'total del mes', 'total de gastos', 'gastos del mes', 'resumen del mes', 'en efectivo', 'plata en efectivo', 'cuanto me queda', 'cuanto debo en total'],
    explicacion: 'Escribe «saldo» y ves lo que tienes en cada cuenta, el efectivo incluido: ya descuenta lo que sacaste y lo que pagaste, y los retiros del cajero no cuentan como gasto. Para una sola cuenta: «cuánto tengo en efectivo». Otras palabras sueltas que se contestan al instante: «semana», «mes».',
    ejemplos: ['saldo', 'cuánto tengo en efectivo', 'semana'] },
  { id: 'gasto', tema: 'Gasto', palabras: ['gasto', 'gaste', 'compr', 'almue', 'comid', 'mecat', 'taxi', 'bus', 'pague'], frases: ['un gasto', 'mi gasto'],
    explicacion: 'Un gasto es lo que compraste y cuánto. Si dices con qué pagaste, lo uso; si no, es efectivo.',
    ejemplos: ['almuerzo 12000', 'almuerzo 12000 {cuenta}', 'café 4k'] },
  { id: 'acerca', tema: 'Para qué sirve', palabras: ['sirv', 'funcion', 'app', 'aplic', 'hace', 'empez', 'comen', 'inici', 'primer'],
    frases: ['para que sirve', 'que puedo hacer', 'que puedo escribir', 'que hace', 'como funciona', 'como empiezo', 'por donde empiezo'],
    explicacion: 'Es tu cuaderno de plata. Me escribes lo que gastas o lo que te llega, como hablas, y yo lo anoto. Después ves cuánto tienes, quién te debe y en qué se va la plata.',
    ejemplos: ['almuerzo 12000', 'me pagaron 500k de nómina', 'saldo'] }
];

const VACIAS = new Set([
  'como', 'hago', 'puedo', 'quiero', 'un', 'una', 'el', 'la', 'los', 'las', 'de', 'del', 'que', 'para', 'mi', 'mis', 'se', 'lo', 'y', 'o', 'me', 'al',
  'en', 'es', 'por', 'con', 'a', 'ya', 'si', 'no', 'uso', 'usar', 'pongo', 'poner', 'hacer', 'hace', 'plata', 'dinero', 'lana', 'anoto', 'anotar',
  'cuando', 'donde', 'cual', 'esto', 'esta', 'voy',
]);

/** Palabras distintas que significan lo mismo, para no depender de cómo las escriba la persona. */
const SINONIMOS: Record<string, string> = {
  // «comprobante» y «compré» empiezan igual: se llevan a «recib» para no confundir el tema de comprobantes con el de gastos
  comprobante: 'recib', comprobantes: 'recib', factura: 'recib', facturas: 'recib', boleta: 'recib', fotografia: 'foto',
};

function raiz(palabra: string): string {
  if (palabra.startsWith('#')) return '#';
  return SINONIMOS[palabra] ?? palabra.slice(0, 5);
}

/** La raíz de la duda coincide con la del tema si es igual, o si empieza por ella (raíz de 4 letras o más: «pagu» cubre «pague»). */
const coincide = (deLaDuda: string, deTema: string): boolean =>
  deLaDuda === deTema || (deTema.length >= 4 && deLaDuda.startsWith(deTema));

function puntuar(t: TemaDeAyuda, d: string, raices: string[]): number {
  let p = 0;
  for (const r of new Set(t.palabras.map(raiz))) if (raices.some(x => coincide(x, r))) p += 1;
  for (const f of t.frases ?? []) if (d.includes(f)) p += 2;
  return p;
}

function armar(t: TemaDeAyuda, ctx?: Ctx): RespuestaDeAyuda {
  const cuenta = ctx ? ejemploDeCuenta(ctx) : 'nequi';
  return { id: t.id, tema: t.tema, explicacion: t.explicacion, ejemplos: t.ejemplos.map(e => e.replace('{cuenta}', cuenta)) };
}

/** Hasta 3 temas que responden a la duda, el mejor primero. Lista vacía si no se reconoce de qué habla. */
export function buscarAyuda(duda: string, ctx?: Ctx): RespuestaDeAyuda[] {
  const d = limpiar(duda);
  if (d.length < 3) return [];
  const raices = d.split(' ').filter(w => w && !VACIAS.has(w)).map(raiz);
  return TEMAS_AYUDA
    .map((t, i) => ({ t, i, p: puntuar(t, d, raices) }))
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, 3)
    .map(x => armar(x.t, ctx));
}

/** La respuesta de un tema por su id (para los botones que se ofrecen cuando no hubo coincidencia). */
export function ayudaDeTema(id: string, ctx?: Ctx): RespuestaDeAyuda | null {
  const t = TEMAS_AYUDA.find(x => x.id === id);
  return t ? armar(t, ctx) : null;
}

/** Cuando nada coincide: los temas que más se parecen a lo escrito (por las primeras letras), o los más usados. */
export function temasParecidos(duda: string, cuantos = 4): { id: string; tema: string }[] {
  const palabras = limpiar(duda).split(' ').filter(w => w.length >= 3 && !VACIAS.has(w));
  const puntaje = (t: TemaDeAyuda) => palabras.reduce((s, w) => s + (t.palabras.some(r => r.length >= 3 && (w.startsWith(r.slice(0, 3)) || r.startsWith(w.slice(0, 3)))) ? 1 : 0), 0);
  const ordenados = TEMAS_AYUDA.map((t, i) => ({ t, i, p: puntaje(t) })).sort((a, b) => b.p - a.p || a.i - b.i);
  const cercanos = ordenados.filter(x => x.p > 0);
  const elegidos = cercanos.length ? cercanos : ['gasto', 'prestamo', 'ingreso', 'meta'].map(id => ({ t: TEMAS_AYUDA.find(x => x.id === id)! }));
  return elegidos.slice(0, cuantos).map(x => ({ id: x.t.id, tema: x.t.tema }));
}

/**
 * ¿Es una pregunta de uso («cómo anoto un gasto», «para qué sirve esto», «cómo pauso un pago fijo»)? Solo cuenta si no trae
 * números: con un monto es un movimiento. El bot la usa antes de decir «me falta el monto».
 */
export function esPreguntaDeAyuda(texto: string): boolean {
  const d = limpiar(texto);
  if (/\d/.test(d)) return false;
  const palabras = d.split(' ').filter(Boolean);
  if (palabras.length < 2) return false;
  if (/^(como|que puedo|que se puede|se puede|puedo|para que|por que|que es|que hace|que significa|que hago|donde|cuando|cual es|explicame|explica|ayudame|ayuda con|ayuda para|necesito ayuda|no entiendo|no se como|dime como|quiero saber|quisiera saber|me ayudas|me puedes ayudar|como funciona)\b/.test(d)) return true;
  if (/\bcomo (hago|anoto|registro|agrego|pauso|borro|edito|elimino|cancelo|cambio|uso|pongo|creo|guardo|veo|saco|miro|funciona|se|paso|meto|quito|corrijo|muevo)\b/.test(d)) return true;
  // «ayuda no sé cómo borrar», «me puedes decir cómo...», «no sé cómo...» en cualquier parte
  if (/^ayuda\b|\bno se como\b|\bme (puedes|podrias) (decir|explicar|ensenar)\b|\bpuedes decirme\b/.test(d)) return true;
  // querer o necesitar hacer algo, sin monto: «quiero anotar a mi hermana», «necesito quitar un gasto»
  if (/^(?:yo )?(?:quiero|quisiera|necesito|me gustaria|tengo que|debo) (?:anotar|agregar|registrar|mirar|ver|saber|quitar|borrar|eliminar|crear|poner|pasar|cambiar|editar|corregir|sacar|guardar|mover|meter|deshacer|anular)\b/.test(d)) return true;
  return texto.includes('?') && palabras.length >= 3;
}

/**
 * Una duda de uso dicha sin rodeos («cómo lo anoto», «dónde veo cuánto le debo», «puedo pegar el mensaje del banco»). Esta sí
 * se reconoce aunque traiga montos («anoté 80 mil pero eran 18, cómo lo arreglo»): nunca es un movimiento, así que el bot
 * explica y no saca tarjeta. Pide el verbo de uso después de «cómo» o «dónde» para no confundir «lo pagué como siempre».
 */
export function esDudaDeUso(texto: string): boolean {
  const d = limpiar(texto);
  if (d.length > 220) return false;
  if (/\bcomo (?:(?:lo|la|los|las|le|les|me|se|te|le) )?(?:hago|anoto|registro|pongo|arreglo|cambio|corrijo|meto|saco|miro|veo|paso|pauso|subo|bajo|borro|elimino|edito|escribo|quito|anulo|devuelvo|cuento|apunto|guardo|agrego|marco|separo|muevo|reviso|consulto|calculo|reflejo|manejo|declaro)\b/.test(d)) return true;
  if (/\b(?:donde|en donde|por donde) (?:veo|miro|reviso|consulto|lo pongo|la pongo|los pongo|se ve|queda|encuentro|lo anoto|se anota)\b/.test(d)) return true;
  if (/^(?:y )?(?:puedo|se puede|puedes|podria) (?:copiar|pegar|mandar|enviar|subir|exportar|sacar|importar|bajar|descargar)\b/.test(d)) return true;
  if (/^si\b.*\b(?:la|lo|los|las) (?:registro|anoto|pongo|meto)\b/.test(d)) return true;
  if (/\bque hago\b|\b(?:quiero|necesito|quisiera) (?:cambiar|arreglar|corregir|borrar|quitar|editar|anular|deshacer)(?:lo|la|los|las)?\b|\bcuenta doble\b|\bsale doble\b/.test(d)) return true;
  return false;
}

/**
 * Una consulta dicha con otras palabras: «quiero mirar quién me debe plata» es «deudas» y «cuánto me queda después de
 * pagar todo» es «saldo». Devuelve la palabra de la consulta o null. Solo sin números: con un monto es un movimiento.
 */
export function consultaDisfrazada(texto: string): string | null {
  const d = limpiar(texto);
  if (/\d/.test(d)) return null;
  if (/\b(?:quien(?:es)? me debe(?:n)?|cuanto me deben|a quien(?:es)? le debo|cuanto debo|quien me falta por pagar)\b/.test(d)) return 'deudas';
  if (/\b(?:cuanto me queda|cuanta plata (?:me queda|tengo)|cuanto tengo|cuanta plata hay)\b/.test(d)) return 'saldo';
  return null;
}
