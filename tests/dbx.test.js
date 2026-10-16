// node tests/dbx.test.js — início de sessão Dropbox (PKCE) sem rede
const assert = require('assert');
const D = require('../js/dropbox.js');
let n = 0;
function t(name, fn) { return Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FALHOU:', name); throw e; }); }
const memStore = () => { const m = {}; return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = String(v); }, del: k => { delete m[k]; }, _m: m }; };

(async () => {
  await t('PKCE: vector RFC 7636 (S256)', async () => {
    assert.strictEqual(await D.challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  await t('app key e redirect exactos', () => {
    assert.strictEqual(D.APP_KEY, 'clt6iri77fmzaxk');
    assert.strictEqual(D.REDIRECT_URI, 'https://ray2112.github.io/Mill-QC/');
  });
  await t('beginLogin: parâmetros e guarda verificador', async () => {
    const s = memStore();
    const url = new URL(await D.beginLogin(s));
    assert.strictEqual(url.origin + url.pathname, 'https://www.dropbox.com/oauth2/authorize');
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
    assert.strictEqual(url.searchParams.get('token_access_type'), 'offline');
    assert.strictEqual(url.searchParams.get('redirect_uri'), D.REDIRECT_URI);
    assert.ok(s.get('dbx_verifier').length >= 43);
    assert.strictEqual(url.searchParams.get('state'), s.get('dbx_state'));
    assert.strictEqual(url.searchParams.get('client_secret'), null);
  });
  await t('finishLogin: estado errado é recusado sem pedido de rede', async () => {
    const s = memStore(); s.set('dbx_state', 'abc');
    const r = await D.finishLogin(new URLSearchParams('code=x&state=zzz'), s);
    assert.deepStrictEqual(r, { ok: false, reason: 'state_mismatch' });
  });
  await t('finishLogin: sem código', async () => {
    const r = await D.finishLogin(new URLSearchParams(''), memStore());
    assert.deepStrictEqual(r, { ok: false, reason: 'no_code' });
  });
  await t('accessToken sem sessão lança erro', async () => {
    let threw = false; try { await D.accessToken(memStore()); } catch (e) { threw = e.message === 'not_signed_in'; }
    assert.ok(threw);
  });
  console.log('OK —', n, 'testes Dropbox');
})().catch(e => { console.error(e); process.exit(1); });
