// js/msal-config.js
/* ---------------------------------------------
   Detección de entorno y armado de redirectUri
   --------------------------------------------- */

// ¿Estás en GitHub Pages?
const IS_GITHUB_PAGES = /\.github\.io$/i.test(location.host);

// Si publicas dentro de un repositorio (https://usuario.github.io/MI_REPO/)
const REPO = "Artepisa";

/** Base para rutas:
 * - GitHub Pages en raíz: base = ""
 * - GitHub Pages dentro de repo: base = "/REPO"
 * - Localhost / file:// : base = ""
 */
function resolveBase() {
  if (!IS_GITHUB_PAGES) return "";
  const p = (location.pathname || "/").replace(/\/+$/, "");
  const repoPrefix = `/${REPO}`;
  return p === repoPrefix || p.startsWith(`${repoPrefix}/`) ? repoPrefix : "";
}

// Normaliza path destino (siempre a /index.html)
function buildRedirectUri() {
  const origin = location.origin === "null" ? "" : location.origin; // file://
  const base = resolveBase();
  return `${origin}${base}/index.html`;
}

const REDIRECT = buildRedirectUri();

/* ---------------------------------------------
   Config principal MSAL
   --------------------------------------------- */

// ✅ Tu App registrada (ArtepisaApp-Org)
const CLIENT_ID = "4882a8ea-d988-4de9-8216-f5420a81e4f7";

// ✅ Tu Tenant GUID
const TENANT_ID = "09e74d4b-149d-4c7c-a670-6d0442be52ea";

// Scopes necesarios
const DEFAULT_SCOPES = [
  "User.Read",
  "Files.ReadWrite",
  "offline_access",
  "User.ReadWrite.All",
  "User.Invite.All",
  "Group.Read.All",
  "Group.ReadWrite.All"
];

// Authority armada desde el tenant (GUID)
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

// Exponemos configuración
window.MSAL_CONFIG = {
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  redirectUri: REDIRECT,
  postLogoutRedirectUri: REDIRECT,
  scopes: DEFAULT_SCOPES,

  // ✅ Tus grupos reales
  privilegeGroups: {
    admin:  "cca1198c-cc4a-48f0-9c6c-c832ce7d9207",
    editor: "c7f7e4f6-55ef-402d-877d-5888128fae77",
    viewer: "75735ceb-f8ea-4a6d-ac48-ba5bcbc28558"
  },

  // A dónde volverá el usuario invitado al aceptar la invitación B2B
  inviteRedirectUrl: REDIRECT,

  // Opciones MSAL
  options: {
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
      redirectUri: REDIRECT,
      postLogoutRedirectUri: REDIRECT,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false
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
   --------------------------------------------- */
(function ensureGraphStorage() {
  const DEFAULT_STORAGE = {
    location: "me",
    folderPath: "/ArtepisaData"
  };
  function normalizePath(p) {
    if (!p) return DEFAULT_STORAGE.folderPath;
    return p.startsWith("/") ? p : `/${p}`;
  }
  const incoming = window.GRAPH_STORAGE || {};
  const merged = {
    location: incoming.location === "site" ? "site" : "me",
    siteId: incoming.siteId || "",
    folderPath: normalizePath(incoming.folderPath || DEFAULT_STORAGE.folderPath)
  };
  window.GRAPH_STORAGE = merged;
})();

/* ---------------------------------------------
   Tips rápidos
   ---------------------------------------------
   - Ya diste Admin consent ✅ para todos los scopes críticos.
   - En el manifest puedes usar:
     "groupMembershipClaims": "SecurityGroup"
     para que los IDs de grupos vengan en el ID token.
   - GitHub Pages:
     * En raíz:  https://<usuario>.github.io/           → REDIRECT = /index.html
     * En repo:  https://<usuario>.github.io/<REPO>/    → REDIRECT = /<REPO>/index.html
*/

