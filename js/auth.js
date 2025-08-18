// js/auth.js
// Autenticación con MSAL (SPA) + utilidades listas para producción.
// Copia/pega tal cual. Requiere js/msal-config.js cargado antes.

(function () {
  if (!window.msal || !window.MSAL_CONFIG) {
    console.error("MSAL o MSAL_CONFIG no están disponibles. Revisa el orden de los <script>.");
    return;
  }

  const CFG = window.MSAL_CONFIG;

  // ----- 1) Construcción robusta de configuración -----
  const options = CFG.options || {
    auth: {
      clientId: CFG.clientId,
      authority: `https://login.microsoftonline.com/${CFG.tenantId}`,
      redirectUri: CFG.redirectUri,
      postLogoutRedirectUri: CFG.redirectUri,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: "sessionStorage", // seguro en SPA
      storeAuthStateInCookie: false
    },
    system: {
      loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false }
    }
  };

  const LOGIN_REQUEST = (CFG.requests && CFG.requests.loginRequest) || { scopes: CFG.scopes || ["User.Read"] };
  const TOKEN_REQUEST = (CFG.requests && CFG.requests.tokenRequest) || { scopes: CFG.scopes || ["User.Read"] };

  const pca = new msal.PublicClientApplication(options);

  // ----- 2) Helpers internos -----
  const LS_SESSION_KEY = "artepisa_account";
  const SILENT_ERR_CODES = new Set([
    "interaction_required",
    "consent_required",
    "login_required"
  ]);

  function setSessionAccount(account) {
    if (!account) return sessionStorage.removeItem(LS_SESSION_KEY);
    const snapshot = {
      homeAccountId: account.homeAccountId,
      username: account.username,
      name: account.name,
      env: account.environment,
      ts: Date.now()
    };
    sessionStorage.setItem(LS_SESSION_KEY, JSON.stringify(snapshot));
  }

  function getStoredAccount() {
    try { return JSON.parse(sessionStorage.getItem(LS_SESSION_KEY) || "null"); }
    catch { return null; }
  }

  function ensureActiveAccount() {
    let acct = pca.getActiveAccount();
    if (!acct) {
      const all = pca.getAllAccounts();
      if (all && all.length) {
        acct = all[0];
        pca.setActiveAccount(acct);
        setSessionAccount(acct);
      }
    }
    return acct;
  }

  function uiMsg(text, isError = false) {
    const el = document.getElementById("login-msg");
    if (!el) return;
    el.textContent = text || "";
    if (isError) el.setAttribute("role", "alert"); else el.removeAttribute("role");
  }

  // ----- 3) Flujo de login / logout / token -----
  async function login() {
    try {
      // Intento silencioso si ya hay cuenta en el navegador (SSO)
      const hint = getStoredAccount()?.username;
      if (hint) {
        try {
          const silent = await pca.ssoSilent({ ...LOGIN_REQUEST, loginHint: hint });
          pca.setActiveAccount(silent.account);
          setSessionAccount(silent.account);
          return silent.account;
        } catch {}
      }

      // Interactivo (popup) como fallback
      const res = await pca.loginPopup(LOGIN_REQUEST);
      pca.setActiveAccount(res.account);
      setSessionAccount(res.account);
      uiMsg(`Conectado como ${res.account?.name || res.account?.username || ""}`);
      return res.account;
    } catch (e) {
      console.error("Error de login:", e);
      uiMsg(`Error de login: ${e?.message || e}`, true);
      throw e;
    }
  }

  async function getToken(customScopes) {
    const acct = ensureActiveAccount();
    if (!acct) throw new Error("No hay sesión activa");

    const req = { ...(customScopes ? { scopes: customScopes } : TOKEN_REQUEST), account: acct };

    try {
      const s = await pca.acquireTokenSilent(req);
      return s.accessToken;
    } catch (e) {
      if (SILENT_ERR_CODES.has(e?.errorCode)) {
        // Pedir interacción (popup)
        const i = await pca.acquireTokenPopup(req);
        return i.accessToken;
      }
      console.error("getToken error:", e);
      throw e;
    }
  }

  async function logout() {
    try {
      const account = ensureActiveAccount();
      await pca.logoutPopup({ account, postLogoutRedirectUri: options.auth.postLogoutRedirectUri });
    } finally {
      sessionStorage.removeItem(LS_SESSION_KEY);
      uiMsg("Sesión cerrada.");
      // Redirige a la página de inicio
      const back = options.auth.postLogoutRedirectUri || CFG.redirectUri || "index.html";
      if (location.href !== back) location.href = back;
    }
  }

  // Requiere sesión antes de continuar (llámalo al cargar páginas privadas)
  async function requireAuth() {
    let acct = ensureActiveAccount();
    if (acct) return acct;

    // Intento SSO silencioso con domainHint/loginHint si hay snapshot previo
    const snapshot = getStoredAccount();
    if (snapshot?.username) {
      try {
        const sso = await pca.ssoSilent({ ...LOGIN_REQUEST, loginHint: snapshot.username });
        pca.setActiveAccount(sso.account);
        setSessionAccount(sso.account);
        return sso.account;
      } catch {}
    }

    // Si no hay manera, abrir login interactivo
    acct = await login();
    return acct;
  }

  // ----- 4) Inicialización al cargar la página -----
  // Procesa redirecciones pendientes si las hubiese (si usas loginRedirect en el futuro)
  pca.handleRedirectPromise?.().catch((e) => {
    console.warn("handleRedirectPromise error:", e);
  }).finally(() => {
    ensureActiveAccount();
  });

  // ----- 5) Exponer API pública -----
  function getAccount() {
    const acct = ensureActiveAccount();
    if (!acct) return null;
    return { name: acct.name, username: acct.username, homeAccountId: acct.homeAccountId };
  }

  window.MSALApp = {
    instance: pca,
    login,
    logout,
    getToken,
    requireAuth,
    getAccount
  };

  // ----- 6) Enlazar botón si existe -----
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-login");
    if (btn) btn.addEventListener("click", async () => {
      const acc = await login();
      if (acc) {
        // Si la página es login, redirige al panel
        const maybeDashboard = "dashboard.html";
        if (!/dashboard\.html$/i.test(location.pathname)) {
          location.href = maybeDashboard;
        }
      }
    });
  });
})();
