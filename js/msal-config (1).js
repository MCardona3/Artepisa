// js/msal-config.js
/* ---------------------------------------------
   Detección de entorno y armado de redirectUri
   --------------------------------------------- */

// ¿Estás en GitHub Pages?
const IS_GITHUB_PAGES = /\.github\.io$/i.test(location.host);

// ⚠️ Si publicas dentro de un repositorio (https://usuario.github.io/MI_REPO/)
// pon aquí el nombre EXACTO del repo (tal como aparece en GitHub).
const REPO = "Artepisa";

/** Determina el "base" correcto:
 * - GitHub Pages en raíz: base = ""
 * - GitHub Pages dentro de repo: base = "/REPO"
 * - Localhost / file:// : base = ""
 */
function resolveBase() {
  if (!IS_GITHUB_PAGES) return "";
  const p = (location.pathname || "/").replace(/\/+$/, ""); // sin trailing slash
  const repoPrefix = `/${REPO}`;
  // Si ya estamos bajo /REPO, úsalo; si no, asumimos raíz de usuario/org
  return p === repoPrefix || p.startsWith(`${repoPrefix}/`) ? repoPrefix : "";
}

// Normaliza path destino (usa login.html porque tu app redirige allí al no tener sesión)
function buildRedirectUri() {
  const origin = location.origin === "null" ? "" : location.origin; // p/ file://
  const base = resolveBase();
  return `${origin}${base}/login.html`;
}

const REDIRECT = buildRedirectUri();

/* ---------------------------------------------
   Config principal MSAL
   --------------------------------------------- */
const CLIENT_ID = "24164079-124e-4f17-a347-2b357984c44f";
// Para OneDrive personal: usar "consumers" (cuentas Microsoft personales)
const TENANT_ID = "consumers";

// Scopes mínimos para OneDrive personal (+ refresh token)
const DEFAULT_SCOPES = ["User.Read", "Files.ReadWrite", "offline_access"];

// Authority armada desde el tenant (consumers / organizations / <GUID>)
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

// Exponemos una configuración simple (la usa auth.js)
window.MSAL_CONFIG = {
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  redirectUri: REDIRECT,
  postLogoutRedirectUri: REDIRECT,
  scopes: DEFAULT_SCOPES,

  // Opciones MSAL (idénticas a las de auth.js)
  options: {
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
      redirectUri: REDIRECT,
      postLogoutRedirectUri: REDIRECT,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: "sessionStorage",   // seguro para SPA
      storeAuthStateInCookie: false      // pon true sólo si Safari viejo da problemas
    },
    system: {
      loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false },
      allowNativeBroker: false
    }
  },

  // Requests reutilizables
  requests: {
    loginRequest: { scopes: DEFAULT_SCOPES },
    tokenRequest: { scopes: DEFAULT_SCOPES }
  }
};

/* ---------------------------------------------
   Almacenamiento en OneDrive personal compartido
   ---------------------------------------------
   Recomendado (gratis):
   1) Crea en tu OneDrive la carpeta /ArtepisaData
   2) COMPÁRTELA con "Puede editar" a todos los usuarios
   3) Cada usuario hace "Agregar acceso directo a Mi OneDrive"
   4) Todos verán/editarán los mismos JSON en esa carpeta
*/
(function ensureGraphStorage() {
  const DEFAULT_STORAGE = {
    location: "me",                 // "me" => OneDrive personal del usuario
    folderPath: "/ArtepisaData"     // carpeta compartida (o acceso directo)
  };

  // Normaliza el path (debe iniciar con /)
  function normalizePath(p) {
    if (!p) return DEFAULT_STORAGE.folderPath;
    return p.startsWith("/") ? p : `/${p}`;
  }

  const incoming = window.GRAPH_STORAGE || {};
  const merged = {
    location: incoming.location === "site" ? "site" : "me",
    siteId: incoming.siteId || "", // sólo para SharePoint (no necesario en OneDrive personal)
    folderPath: normalizePath(incoming.folderPath || DEFAULT_STORAGE.folderPath)
  };

  window.GRAPH_STORAGE = merged;
})();

/* ---------------------------------------------
   Tips rápidos
   ---------------------------------------------
   - Si usas SharePoint en vez de OneDrive:
     window.GRAPH_STORAGE = {
       location: "site",
       siteId: "<TU_SITE_ID>",
       folderPath: "/ArtepisaData"
     };
     ➜ Recuerda agregar el scope "Sites.ReadWrite.All" en DEFAULT_SCOPES
        y volver a consentir.

   - GitHub Pages:
     * En raíz:  https://<usuario>.github.io/           → REDIRECT será /login.html
     * En repo:  https://<usuario>.github.io/<REPO>/    → REDIRECT será /<REPO>/login.html
     Registra EXACTAMENTE ese Redirect URI en Azure Portal (App Registration).
*/