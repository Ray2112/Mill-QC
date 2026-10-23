// Configuração do Dropbox para o ficheiro de saldos das bins (bins-status.json).
// A app key é um identificador público (não é segredo). Não colocar aqui nenhum app secret.
(function (root) {
  const DROPBOX = {
    appKey: '0fvmydayvnknuu2',           // App key da app "Moagem-Carrinho" (escopo: pasta da app)
    binsStatusPath: '/Carrinho/Moagem/bins-status.json',   // P3 aprovado (ajustar se a pasta da app for outra)
    freshnessHours: 2                    // P1 aprovado
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DROPBOX;
  else root.DropboxConfig = DROPBOX;
})(typeof window !== 'undefined' ? window : this);
