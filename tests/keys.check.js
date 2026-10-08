// node tests/keys.check.js — todas as chaves de texto existem em PT e EN (sai com erro se faltar alguma)
const fs = require('fs'); global.window = {};
eval(fs.readFileSync('js/i18n.js', 'utf8')); eval(fs.readFileSync('js/i18n-prod.js', 'utf8'));
const I = window.I18N; const pk = Object.keys(I.pt), ek = Object.keys(I.en);
const problems = [];
const ptOnly = pk.filter(k => !ek.includes(k)), enOnly = ek.filter(k => !pk.includes(k));
if (ptOnly.length || enOnly.length) problems.push('pt-only ' + ptOnly + ' en-only ' + enOnly);
const used = new Set();
['js/app.js', 'js/prod-ui.js'].forEach(f => { for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z_]+)'/g)) used.add(m[1]); });
const miss = [...used].filter(k => !k.endsWith('_') && !pk.includes(k));
if (miss.length) problems.push('missing literal ' + miss);
// prefixos dinâmicos
const L = require('../js/logic.js'), P = require('../js/prod.js'); const dyn = [];
L.PARAMS.forEach(p => dyn.push('p_' + p)); L.PHYSICAL.forEach(p => dyn.push('ph_' + p)); L.DECISIONS.forEach(d => dyn.push('dec_' + d));
L.MILL_TYPES.forEach(m => dyn.push('mill_' + m)); L.FREQS.forEach(f => dyn.push('fr_' + f)); L.defaultProducts().forEach(p => dyn.push('prod_' + p.id));
['hold', 'warn', 'ok', 'stopped', 'nodata'].forEach(s => dyn.push('st_' + s)); ['open', 'action', 'closed'].forEach(s => dyn.push('hs_' + s)); ['D', 'N'].forEach(s => dyn.push('shift_' + s));
['home', 'sample', 'holds', 'prod', 'records', 'report', 'settings'].forEach(s => dyn.push('nav_' + s));
['jobs', 'log', 'bins'].forEach(s => dyn.push('ptab_' + s)); P.JOB_STATUS.forEach(s => dyn.push('js_' + s));
P.ISSUE_CATS.forEach(c => dyn.push('ic_' + c)); P.ACT_TYPES.forEach(c => dyn.push('at_' + c)); P.SILO_GRADES.concat(['none']).forEach(g => dyn.push('g_' + g));
// códigos de erro/aviso: extrair de js/prod.js
const src = fs.readFileSync('js/prod.js', 'utf8');
for (const m of src.matchAll(/E\.push\(\{ code: '([a-z_]+)'/g)) dyn.push('je_' + m[1]);
for (const m of src.matchAll(/E\.push\(\{ code: r\.why/g)) ['bin_unknown', 'bin_line', 'bin_other_product'].forEach(c => dyn.push('je_' + c));
for (const m of src.matchAll(/W\.push\(\{ code: '([a-z_]+)'/g)) dyn.push('jw_' + m[1]);
for (const m of src.matchAll(/why: '([a-z_]+)'/g)) if (!m[1].startsWith('bin_')) dyn.push('why_' + m[1]);
for (const m of src.matchAll(/field: '([a-zA-Z]+)'/g)) dyn.push('f_' + m[1]);
for (const m of src.matchAll(/e\.push\('([a-zA-Z]+)'\)/g)) if (!/^(bins|dampenerMaxLh)$/.test(m[1])) dyn.push('f_' + m[1]);
const missDyn = [...new Set(dyn)].filter(k => !pk.includes(k));
if (missDyn.length) problems.push('missing dyn ' + missDyn);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('keys.check: OK (' + used.size + ' literais, ' + new Set(dyn).size + ' dinâmicas)');
