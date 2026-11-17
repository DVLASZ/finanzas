const fs=require('fs');
let p=fs.readFileSync('packages/core/src/parser.ts','utf8');
const a="  if (!m || !/\d/.test(m[2])) return null;";
if(!p.includes(a))throw new Error('x');
p=p.replace(a,()=>"  if (!m || !/\d/.test(m[2])) return null;\n  // «llegaron 35 galletas» es mercancía, no plata: hace falta una cuenta, «mil» o una cifra de miles\n  const cifra = Number((/\d[\d.]*/.exec(m[2])?.[0] ?? '0').replace(/\./g, ''));\n  if (!(cifra >= 1000 || /\b(?:mil|k|lucas?|pesos)\b|nequi|daviplata|bancolombia|bogot|banco|efectivo|cuenta/i.test(m[2]))) return null;");
fs.writeFileSync('packages/core/src/parser.ts',p);
let t=fs.readFileSync('packages/core/test/varios.test.ts','utf8');
t=t.replace("  const r = await bot.pulsa('okall', AHORA);\n  const texto = textoDe(r);\n  assert.match(texto, /Guardado/);","  const r = await bot.pulsa('okall', AHORA);\n  const texto = textoDe(r);\n  console.log(texto);\n  assert.match(texto, /Guardado/);");
fs.writeFileSync('packages/core/test/varios.test.ts',t);
