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

// ⚠️ PON AQUÍ TU APP (SPA) REGISTRADA EN AZURE
const CLIENT_ID = "24164079-124e-4f17-a347-2b357984c44f";

// ⚠️ CAMBIA A TU TENANT (GUID) o usa "organizations" para solo cuentas de trabajo.
//   - NO uses "consumers" si quieres crear/invitar usuarios o leer grupos.
const TENANT_ID = "organizations"; // ej: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

// Scopes necesarios para:
// - Identidad básica: User.Read
// - OneDrive jsons: Files.ReadWrite (opcional, si usas tu storage actual)
// - Token de actualización: offline_access
// - Crear usuarios: User.ReadWrite.All (delegado)  *admin consent*
// - Invitar externos: User.Invite.All (delegado)    *admin consent*
// - Leer grupos: Group.Read.All (delegado)          *admin consent*
// - (Opcional para añadir a grupos): Group.ReadWrite.All (delegado) *admin consent*
const DEFAULT_SCOPES = [
  "User.Read",
  "Files.ReadWrite",
  "offline_access",
  "User.ReadWrite.All",
  "User.Invite.All",
  "Group.Read.All",
  "Group.ReadWrite.All" // necesario si usarás addUserToGroup
];

// Authority armada desde el tenant (organizations / <GUID>)
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

// Exponemos configuración (la usa auth.js y entra-admin.js)
window.MSAL_CONFIG = {
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  redirectUri: REDIRECT,
  postLogoutRedirectUri: REDIRECT,
  scopes: DEFAULT_SCOPES,

  // IDs de grupos para privilegios (⚠️ reemplaza por tus GUID reales)
  privilegeGroups: {
    admin:  "11111111-1111-1111-1111-111111111111",
    editor: "22222222-2222-2222-2222-222222222222",
    viewer: "33333333-3333-3333-3333-333333333333"
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
   - Da *Admin consent* en Azure Portal para:
     User.ReadWrite.All, User.Invite.All, Group.Read.All y (si aplicas grupos) Group.ReadWrite.All.
   - Si NO quieres depender de Graph para leer grupos, en el manifest de la app
     puedes poner: groupMembershipClaims: "SecurityGroup" (los IDs de grupos vendrán en el ID token).
   - GitHub Pages:
     * En raíz:  https://<usuario>.github.io/           → REDIRECT = /index.html
     * En repo:  https://<usuario>.github.io/<REPO>/    → REDIRECT = /<REPO>/index.html
     Registra EXACTAMENTE ese Redirect URI en App Registration.
*/

