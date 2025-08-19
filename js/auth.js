
(function(){
  const cfg = window.__MSAL_CONFIG__ || {};
  const msal = window.msal;
  function noop(){}
  if (!msal || !cfg.clientId) {
    // Fallback "fake" app for local mode
    window.MSALApp = {
      signIn: async ()=>({ local:true, at: null, ts: Date.now()}),
      getToken: async ()=> null
    };
    // Convenience getter for modules that expect getToken global
    window.getToken = async ()=> null;
    return;
  }

  const client = new msal.PublicClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: cfg.authority,
      redirectUri: cfg.redirectUri
    },
    cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false }
  });

  async function loginPopup(){
    const res = await client.loginPopup({ scopes: cfg.scopes });
    return res.account;
  }

  async function acquireToken(){
    const accts = client.getAllAccounts();
    if (!accts.length) return null;
    const silent = await client.acquireTokenSilent({ account: accts[0], scopes: cfg.scopes }).catch(()=>null);
    if (silent && silent.accessToken) return silent.accessToken;
    const pop = await client.acquireTokenPopup({ scopes: cfg.scopes }).catch(()=>null);
    return pop ? pop.accessToken : null;
  }

  window.MSALApp = {
    signIn: loginPopup,
    getToken: acquireToken
  };
  window.getToken = acquireToken;
})();
