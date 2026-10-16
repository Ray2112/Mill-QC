/* Dropbox — início de sessão PKCE e chamadas à API (sem segredo da app).
   Dropbox sign-in with PKCE (no app secret). Only the app folder is accessed (scoped app). */
(function (root) {
  'use strict';
  const APP_KEY = 'clt6iri77fmzaxk';                       // App key (não é segredo)
  const REDIRECT_URI = 'https://ray2112.github.io/Mill-QC/'; // tem de coincidir exactamente com a App Console
  const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
  const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
  const API = 'https://api.dropboxapi.com/2';
  const CONTENT = 'https://content.dropboxapi.com/2';
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

  function randomString(len) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < len; i++) s += CHARS[bytes[i] % CHARS.length];
    return s;
  }
  function b64url(buf) {
    let s = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // code_challenge = BASE64URL(SHA256(verifier)) — RFC 7636 (método S256)
  async function challengeOf(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(digest);
  }
  // Passo 1: criar verificador e estado; guardar até ao regresso
  async function beginLogin(store) {
    const verifier = randomString(64);
    const state = randomString(24);
    store.set('dbx_verifier', verifier);
    store.set('dbx_state', state);
    const challenge = await challengeOf(verifier);
    const p = new URLSearchParams({ client_id: APP_KEY, redirect_uri: REDIRECT_URI, response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline', state: state });
    return AUTH_URL + '?' + p.toString();
  }
  // Passo 2: no regresso (?code=…&state=…) trocar o código por tokens
  async function finishLogin(query, store) {
    const code = query.get('code'), state = query.get('state');
    if (!code) return { ok: false, reason: 'no_code' };
    if (state !== store.get('dbx_state')) return { ok: false, reason: 'state_mismatch' };
    const body = new URLSearchParams({ code: code, grant_type: 'authorization_code', client_id: APP_KEY,
      redirect_uri: REDIRECT_URI, code_verifier: store.get('dbx_verifier') || '' });
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body });
    if (!r.ok) return { ok: false, reason: 'token_' + r.status };
    const j = await r.json();
    store.set('dbx_refresh', j.refresh_token || '');
    store.del('dbx_verifier'); store.del('dbx_state');
    return { ok: true, refresh: !!j.refresh_token };
  }
  // Access token de curta duração a partir do refresh token guardado
  async function accessToken(store) {
    const cached = store.get('dbx_access'), exp = Number(store.get('dbx_access_exp') || 0);
    if (cached && exp > Date.now() + 60000) return cached;
    const refresh = store.get('dbx_refresh');
    if (!refresh) throw new Error('not_signed_in');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: APP_KEY });
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body });
    if (!r.ok) throw new Error('refresh_' + r.status);
    const j = await r.json();
    store.set('dbx_access', j.access_token);
    store.set('dbx_access_exp', String(Date.now() + j.expires_in * 1000));
    return j.access_token;
  }
  // Listar pasta (caminho relativo à pasta da app; '' = raiz da app)
  async function listFolder(store, path) {
    const tok = await accessToken(store);
    const r = await fetch(API + '/files/list_folder', { method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path || '', recursive: false }) });
    if (!r.ok) throw new Error('list_' + r.status);
    return (await r.json()).entries;
  }
  // Descarregar ficheiro como ArrayBuffer
  async function download(store, path) {
    const tok = await accessToken(store);
    const r = await fetch(CONTENT + '/files/download', { method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Dropbox-API-Arg': JSON.stringify({ path: path }) } });
    if (!r.ok) throw new Error('download_' + r.status);
    return r.arrayBuffer();
  }
  // Escrever ficheiro (overwrite) — usado pelo sync por dispositivo
  async function upload(store, path, text) {
    const tok = await accessToken(store);
    const r = await fetch(CONTENT + '/files/upload', { method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: path, mode: 'overwrite', mute: true }) }, body: text });
    if (!r.ok) throw new Error('upload_' + r.status);
    return r.json();
  }
  function signOut(store) { ['dbx_refresh', 'dbx_access', 'dbx_access_exp'].forEach(k => store.del(k)); }

  const api = { APP_KEY, REDIRECT_URI, AUTH_URL, TOKEN_URL, randomString, challengeOf, beginLogin, finishLogin,
    accessToken, listFolder, download, upload, signOut };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dropbox = api;
})(typeof window !== 'undefined' ? window : this);
