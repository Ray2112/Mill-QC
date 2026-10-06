const fs=require('fs');global.window={};eval(fs.readFileSync('js/i18n.js','utf8'));
const I=window.I18N;const pk=Object.keys(I.pt),ek=Object.keys(I.en);
console.log('pt-only',pk.filter(k=>!ek.includes(k)),'en-only',ek.filter(k=>!k.endsWith('_')&&!pk.includes(k)));
const src=fs.readFileSync('js/app.js','utf8');const used=new Set();
for(const m of src.matchAll(/\bt\('([a-zA-Z_]+)'/g))used.add(m[1]);
console.log('missing literal',[...used].filter(k=>!k.endsWith('_')&&!pk.includes(k)));
// dynamic prefixes
const L=require('../js/logic.js');const dyn=[];
L.PARAMS.forEach(p=>dyn.push('p_'+p));L.PHYSICAL.forEach(p=>dyn.push('ph_'+p));L.DECISIONS.forEach(d=>dyn.push('dec_'+d));
L.MILL_TYPES.forEach(m=>dyn.push('mill_'+m));L.FREQS.forEach(f=>dyn.push('fr_'+f));L.defaultProducts().forEach(p=>dyn.push('prod_'+p.id));
['hold','warn','ok','stopped','nodata'].forEach(s=>dyn.push('st_'+s));['open','action','closed'].forEach(s=>dyn.push('hs_'+s));['D','N'].forEach(s=>dyn.push('shift_'+s));
['home','sample','holds','records','report','settings'].forEach(s=>dyn.push('nav_'+s));
console.log('missing dyn',dyn.filter(k=>!k.endsWith('_')&&!pk.includes(k)));
