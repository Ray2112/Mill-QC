// Importação de resultados do CQ colados do WhatsApp (v2.3.0). Regras puras: não lê a base de dados.
// Formato das mensagens (grupo "Controlo de Qualidade", 24-10-2026):
//   9h / Milho Seco- / Milho Húmido-16.8% / Fuba Amarela / Humidade -13.16% / Proteínas -9.12% /
//   Cinzas-1.07% / Gorduras- 2.84% / Fibras -0.48% / Equipamento em uso: PFEUFFER e perten
// Aceita também o cabeçalho que o WhatsApp acrescenta ao copiar várias mensagens:
//   "[09:39, 24/10/2026] Abel LC: 9h"
// Nada é adivinhado: valor vazio = não medido; linha não reconhecida = assinalada; produto desconhecido = erro.
(function (root) {
  // Rótulos → parâmetro da app (sem acentos, minúsculas, singular ou plural)
  const PARAM_ALIASES = {
    humidade: 'moisture', proteina: 'protein', proteinas: 'protein', cinza: 'ash', cinzas: 'ash',
    gordura: 'fat', gorduras: 'fat', fibra: 'fibre', fibras: 'fibre', amido: 'starch'
  };
  const MAIZE_ALIASES = { 'milho seco': 'dry', 'milho humido': 'wet' };
  // Produto nas mensagens → id do produto na app. Fuba Amarela = Fuba 2 (Zhax, 24-10-2026, D11).
  const PRODUCT_ALIASES = { 'fuba amarela': 'fuba2' };

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const HEADER_RE = /^\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*([^:]+):\s*(.*)$/;
  const HOUR_RE = /^(\d{1,2})\s*h(?:\s*(\d{2}))?$/i;
  const PAIR_RE = /^(.+?)\s*[-–—:]\s*(.*)$/;
  const VALUE_RE = /^([0-9]+(?:[.,][0-9]+)?)\s*%?$/;
  const EQUIP_RE = /^equipamento(?:s)? em uso\s*:?\s*(.*)$/i;

  // Separa o texto colado em mensagens. Cada mensagem começa numa linha de hora ("9h", "10 h", "9h30").
  function parse(text, opts) {
    const o = opts || {};
    const pAlias = Object.assign({}, PRODUCT_ALIASES, o.productAliases || {});
    const msgs = [];
    let cur = null, header = null;
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const start = (hour, minute, raw) => {
      cur = { hour, minute, header, maize: {}, samples: [], equipment: null, ignored: [], errors: [], raw: [raw] };
      header = null;
      msgs.push(cur);
    };
    lines.forEach(rawLine => {
      let line = rawLine.trim();
      if (!line) { if (cur) cur.raw.push(''); return; }
      const h = line.match(HEADER_RE);
      if (h) {
        header = { time: h[1].padStart(2, '0') + ':' + h[2], date: h[5] + '-' + h[4].padStart(2, '0') + '-' + h[3].padStart(2, '0'), sender: h[6].trim() };
        line = h[7].trim();
        if (!line) return;
      }
      const hm = line.match(HOUR_RE);
      if (hm && +hm[1] <= 23 && (!hm[2] || +hm[2] <= 59)) { start(+hm[1], hm[2] ? +hm[2] : 0, rawLine); return; }
      if (!cur) return;                                   // texto antes da primeira hora (ex.: "Abaixo vão os resultados…") é ignorado
      cur.raw.push(rawLine);
      const eq = line.match(EQUIP_RE);
      if (eq) { cur.equipment = eq[1].trim() || null; return; }
      const key = norm(line);
      if (pAlias[key]) { cur.samples.push({ productId: pAlias[key], productLabel: line, values: {} }); return; }
      const pr = line.match(PAIR_RE);
      if (!pr) {
        if (/^fuba\b|^farinha\b|^semea\b/.test(key)) cur.errors.push({ code: 'wa_product_unknown', text: line });
        else cur.ignored.push(line);
        return;
      }
      const label = norm(pr[1]), valTxt = pr[2].trim();
      let value = null;
      if (valTxt !== '') {
        const vm = valTxt.match(VALUE_RE);
        if (!vm) { cur.errors.push({ code: 'wa_value_bad', text: line }); return; }
        value = valTxt.replace('%', '').trim();
      }
      if (MAIZE_ALIASES[label]) {
        const k = MAIZE_ALIASES[label];
        if (cur.maize[k] !== undefined && cur.maize[k] !== null && value !== null) cur.errors.push({ code: 'wa_duplicate', text: line });
        else cur.maize[k] = value;
        return;
      }
      const param = PARAM_ALIASES[label];
      if (!param) { cur.errors.push({ code: 'wa_label_unknown', text: line }); return; }
      const s = cur.samples[cur.samples.length - 1];
      if (!s) { cur.errors.push({ code: 'wa_no_product', text: line }); return; }
      if (s.values[param] !== undefined && value !== null) { cur.errors.push({ code: 'wa_duplicate', text: line }); return; }
      if (value !== null) s.values[param] = value;
    });
    msgs.forEach(m => {
      m.raw = m.raw.join('\n').trim();
      const empty = m.samples.filter(s => !Object.keys(s.values).length);
      empty.forEach(s => m.errors.push({ code: 'wa_product_empty', text: s.productLabel }));
      m.samples = m.samples.filter(s => Object.keys(s.values).length);
      if (!m.samples.length && m.maize.dry == null && m.maize.wet == null && !m.errors.length) m.errors.push({ code: 'wa_empty', text: m.raw.split('\n')[0] });
    });
    return msgs;
  }

  // Hora da mensagem → instante no dia de produção escolhido (07:00–07:00): 0h–6h pertencem à madrugada seguinte.
  function timeOf(prodDay, hour, minute) {
    const [y, mo, d] = String(prodDay).split('-').map(Number);
    const dt = new Date(y, mo - 1, d + (hour < 7 ? 1 : 0), hour, minute || 0, 0, 0);
    return dt.getTime();
  }

  const api = { PARAM_ALIASES, MAIZE_ALIASES, PRODUCT_ALIASES, parse, timeOf, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WaImport = api;
})(typeof window !== 'undefined' ? window : this);
