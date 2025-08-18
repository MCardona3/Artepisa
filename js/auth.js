// Autenticación con MSAL (SPA) y helper para obtener tokens
(function(){
  const conf = window.MSAL_CONFIG;
  const msalConfig = {
    auth: {
      clientId: conf.clientId,
      authority: `https://login.microsoftonline.com/${conf.tenantId}`,
      redirectUri: conf.redirectUri
    },
    cache: { cacheLocation: "localStorage" }
  };
  const loginRequest = { scopes: conf.scopes };
  const pca = new msal.PublicClientApplication(msalConfig);

  async function login(){
    try {
      const acc = await pca.loginPopup(loginRequest);
      pca.setActiveAccount(acc.account);
      sessionStorage.setItem("artepisa_account", JSON.stringify({username: acc.account.username, name: acc.account.name}));
      window.location.href = "dashboard.html";
    } catch (e) {
      const el = document.getElementById("login-msg");
      if(el) el.textContent = "Error de login: " + e.message;
      console.error(e);
    }
  }

  async function getToken(){
    const account = pca.getActiveAccount() || pca.getAllAccounts()[0];
    if(!account){ throw new Error("No hay sesión activa"); }
    try {
      const res = await pca.acquireTokenSilent({ ...loginRequest, account });
      return res.accessToken;
    } catch {
      const res = await pca.acquireTokenPopup({ ...loginRequest, account });
      return res.accessToken;
    }
  }

  async function logout(){
    const account = pca.getActiveAccount() || pca.getAllAccounts()[0];
    await pca.logoutPopup({ account });
    sessionStorage.removeItem("artepisa_account");
    window.location.href = "index.html";
  }

  // expose
  window.MSALApp = { login, getToken, logout, instance: pca };
  document.addEventListener("DOMContentLoaded", ()=>{
    const btn = document.getElementById("btn-login");
    if(btn) btn.addEventListener("click", login);
  });
})();