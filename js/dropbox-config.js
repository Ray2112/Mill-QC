// Configuração do Dropbox para o ficheiro de saldos das bins (bins-status.json).
// A app key é um identificador público (não é segredo). Não colocar aqui nenhum app secret.
(function (root) {
  const DROPBOX = {
    appKey: '0fvmydayvnknuu2',           // App key da app Mill-CD (Scoped App, App Folder). Estado: Development; só o titular.
    binsStatusPath: '/bins-status.json',   // relativo à pasta da app: /Apps/Mill-CD/ (app de escopo App Folder, nome Mill-CD)
    freshnessHours: 2                    // P1 aprovado
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DROPBOX;
  else root.DropboxConfig = DROPBOX;
})(typeof window !== 'undefined' ? window : this);
