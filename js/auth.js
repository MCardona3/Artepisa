// js/auth.js
// Autenticación con MSAL (SPA) + utilidades listas para producción.
// Requiere que js/msal-config.js esté cargado antes.

(function () {
  if (!window.msal || !window.MSAL_CONFIG) {
    console.error("MSAL o MSAL_CONFIG no están disponibles. Revisa el orden de los <script>.");
    return;
  }

  const CFG = window.MSAL_CONFIG;

  // ===== 1) Configuración robusta =====
  const options = {
    auth: {
      clientId: CFG.clientId,
      authority: `https://login.microsoftonline.com/${CFG.tenantId}`,
      redirectUri: CFG.redirectUri,
      postLogoutRedirectUri: CFG.postLogoutRedirectUri || CFG.redirectUri,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: "sessionStorage",     // seguro para SPA
      storeAuthStateInCookie: false        // true solo si Safari ITP molesta
    },
    system: {
      loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false }
    }
  };

  const LOGIN_REQUEST = { scopes: CFG.scopes || ["User.Read"] };
  const TOKEN_REQUEST = { scopes: CFG.scopes || ["User.Read"] };
  const pca = new msal.PublicClientApplication(options);

  // ===== 2) Utilidades =====
  const LS_SESSION_KEY = "artepisa_account";
  const INTERACTION_FLAG = "artepisa_interaction_lock"; // propio (no usamos la clave interna de MSAL)

  const inIframe = () => window !== window.parent;
  const inPopup  = () => !!window.opener && window.opener !== window;
  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isGithubPages = /\.github\.io$/i.test(location.host);

  // Forzamos redirect si: móvil, o ya estamos en popup/iframe, o algunos navegadores en GitHub Pages
  const SHOULD_USE_REDIRECT = isMobile() || inPopup() || inIframe() || isGithubPages;

  function setSessionAccount(account) {
    if (!account) {
      sessionStorage.removeItem(LS_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(
      LS_SESSION_KEY,
      JSON.stringify({
        homeAccountId: account.homeAccountId,
        username: account.username,
        name: account.name,
        env: account.environment,
        ts: Date.now()
      })
    );
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

  function disableLogin(disabled = true, label) {
    const btn = document.getElementById("btn-login");
    if (!btn) return;
    btn.disabled = disabled;
    if (label) btn.textContent = label;
  }

  function goDashboardIfLoginPage() {
    const target = "dashboard.html";
    if (!/dashboard\.html$/i.test(location.pathname)) {
      location.href = target;
    }
  }

  // ===== 3) Flujo de login =====
  async function login() {
    // Evita doble interacción
    if (sessionStorage.getItem(INTERACTION_FLAG) === "1") return;
    sessionStorage.setItem(INTERACTION_FLAG, "1");
    disableLogin(true, "Abriendo Microsoft…");

    try {
      // 3.1 Intento SSO silencioso si ya conocemos el usuario
      const hint = getStoredAccount()?.username;
      if (hint) {
        try {
          const res = await pca.ssoSilent({ ...LOGIN_REQUEST, loginHint: hint });
          if (res?.account) {
            pca.setActiveAccount(res.account);
            setSessionAccount(res.account);
            uiMsg(`Conectado como ${res.account.name || res.account.username || ""}`);
            goDashboardIfLoginPage();
            return res.account;
          }
        } catch (_) { /* continúa a interactivo */ }
      }

      // 3.2 Interactivo: redirect o popup según el entorno
      if (SHOULD_USE_REDIRECT) {
        await pca.loginRedirect(LOGIN_REQUEST); // vuelta por redirect a index.html
        return null;
      } else {
        const res = await pca.loginPopup(LOGIN_REQUEST);
        pca.setActiveAccount(res.account);
        setSessionAccount(res.account);
        uiMsg(`Conectado como ${res.account?.name || res.account?.username || ""}`);
        goDashboardIfLoginPage();
        return res.account;
      }
    } catch (e) {
      // Si detecta nested popup, forzamos redirect
      if (String(e?.errorCode || e?.message || "").includes("block_nested_popups")) {
        try {
          await pca.loginRedirect(LOGIN_REQUEST);
          return null;
        } catch (er) {
          console.error("loginRedirect fallback error:", er);
        }
      }
      console.error("Error de login:", e);
      uiMsg(`Error de login: ${e?.message || e}`, true);
      throw e;
    } finally {
      sessionStorage.removeItem(INTERACTION_FLAG);
      disableLogin(false, "Entrar con Microsoft");
    }
  }

  // ===== 4) Tokens =====
  async function getToken(customScopes) {
    const acct = ensureActiveAccount();
    if (!acct) throw new Error("No hay sesión activa");

    const req = { ...(customScopes ? { scopes: customScopes } : TOKEN_REQUEST), account: acct };
    try {
      const s = await pca.acquireTokenSilent(req);
      return s.accessToken;
    } catch (e) {
      // Si no se puede en silencio, escoger modo de interacción seguro
      if (SHOULD_USE_REDIRECT) {
        sessionStorage.setItem(INTERACTION_FLAG, "1");
        await pca.acquireTokenRedirect(req);
        return ""; // volverá por redirect
      } else {
        const i = await pca.acquireTokenPopup(req);
        return i.accessToken;
      }
    }
  }

  // ===== 5) Logout =====
  async function logout() {
    try {
      const account = ensureActiveAccount();
      if (SHOULD_USE_REDIRECT) {
        await pca.logoutRedirect({ account, postLogoutRedirectUri: options.auth.postLogoutRedirectUri });
      } else {
        await pca.logoutPopup({ account, postLogoutRedirectUri: options.auth.postLogoutRedirectUri });
      }
    } finally {
      sessionStorage.removeItem(LS_SESSION_KEY);
      uiMsg("Sesión cerrada.");
      const back = options.auth.postLogoutRedirectUri || CFG.redirectUri || "index.html";
      if (location.href !== back) location.href = back;
    }
  }

  // ===== 6) Requerir sesión en páginas privadas =====
  async function requireAuth() {
    let acct = ensureActiveAccount();
    if (acct) return acct;

    const snapshot = getStoredAccount();
    if (snapshot?.username) {
      try {
        const sso = await pca.ssoSilent({ ...LOGIN_REQUEST, loginHint: snapshot.username });
        if (sso?.account) {
          pca.setActiveAccount(sso.account);
          setSessionAccount(sso.account);
          return sso.account;
        }
      } catch (_) { /* sigue */ }
    }
    return await login();
  }

  // ===== 7) Inicialización: manejar respuesta de redirect =====
  pca.handleRedirectPromise()
    .then((res) => {
      if (res && res.account) {
        pca.setActiveAccount(res.account);
        setSessionAccount(res.account);
        uiMsg(`Conectado como ${res.account.name || res.account.username || ""}`);
        sessionStorage.removeItem(INTERACTION_FLAG);
        goDashboardIfLoginPage();
      } else {
        ensureActiveAccount();
      }
    })
    .catch((e) => {
      console.warn("handleRedirectPromise error:", e);
      sessionStorage.removeItem(INTERACTION_FLAG);
    });

  // ===== 8) API pública =====
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

  // ===== 9) Botón de login (si existe en la página) =====
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-login");
    if (btn) {
      btn.addEventListener("click", () => {
        // Evita doble clics
        if (sessionStorage.getItem(INTERACTION_FLAG) === "1") return;
        login();
      });
    }
  });
})();

// === Shim global getToken (por compatibilidad) ===
if (!window.getToken) {
  window.getToken = async function () {
    if (window.MSALApp && typeof MSALApp.getToken === "function") {
      return await MSALApp.getToken();
    }
    throw new Error("No hay sesión iniciada. Abre login.html e inicia sesión.");
  };
}

