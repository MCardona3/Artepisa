// js/msal-config.js

/* ---------------------------------------------
   Detección de entorno y armado de redirectUri
   --------------------------------------------- */
const IS_GITHUB_PAGES = /\.github\.io$/i.test(location.host);
// ⚠️ Cambia esto si el repo NO se llama "Artepisa"
const REPO = "Artepisa";

// BASE correcto para GitHub Pages (https://tuusuario.github.io/REPO/)
const BASE = IS_GITHUB_PAGES ? `/${REPO}` : "";

// Normaliza path destino (siempre a /index.html)
function buildRedirectUri() {
  // Soporta file://, http(s)://, localhost y GitHub Pages
  const origin = location.origin === "null" ? "" : location.origin; // p/ file://
  const base = BASE || "";
  return `${origin}${base}/index.html`;
}

const REDIRECT = buildRedirectUri();

/* ---------------------------------------------
   Config principal MSAL (mantiene tus valores)
   --------------------------------------------- */
const CLIENT_ID = "24164079-124e-4f17-a347-2b357984c44f";
// Para OneDrive personal: usar "consumers" (cuentas Microsoft personales)
const TENANT_ID = "consumers";

// Scopes mínimos para:
// - Identidad básica       => User.Read
// - Leer/escribir archivos => Files.ReadWrite (en OneDrive personal basta con este)
// - Token de actualización => offline_access
const DEFAULT_SCOPES = ["User.Read", "Files.ReadWrite", "offline_access"];

// Authority armada desde el tenant (consumers / organizations / <GUID>)
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

// Exponemos una configuración simple (retrocompatible) que tu auth.js ya usa
window.MSAL_CONFIG = {
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  redirectUri: REDIRECT,
  // (opcional pero recomendado)
  postLogoutRedirectUri: REDIRECT,
  // Scopes que pediremos en login/silent
  scopes: DEFAULT_SCOPES,

  // Extras útiles para cuando crees la instancia de MSAL (si lo haces aquí o en auth.js)
  options: {
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
      redirectUri: REDIRECT,
      postLogoutRedirectUri: REDIRECT,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation: "sessionStorage", // mantiene el comportamiento actual
      storeAuthStateInCookie: false    // true solo si tienes problemas con ITP/Safari antiguos
    },
    system: {
      // Evita logs ruidosos en producción
      loggerOptions: {
        loggerCallback: () => {},
        logLevel: 0, // LogLevel.Error
        piiLoggingEnabled: false
      },
      // Permite login en iframe si en algún flujo lo requieres
      allowNativeBroker: false
    }
  },

  // Requests predefinidos que puede reusar auth.js
  requests: {
    loginRequest: { scopes: DEFAULT_SCOPES },
    tokenRequest: { scopes: DEFAULT_SCOPES }
  }
};

/* ---------------------------------------------
   Almacenamiento en OneDrive personal compartido
   --------------------------------------------- */
/*
  Modo recomendado (gratis):
  1) Crea en tu OneDrive la carpeta /ArtepisaData
  2) COMPÁRTELA con "Puede editar" a todos los usuarios
  3) Pide a cada usuario que haga "Agregar acceso directo a Mi OneDrive"
  4) Todos verán/editarán los mismos JSON en esa carpeta
*/
(function ensureGraphStorage() {
  const DEFAULT_STORAGE = {
    location: "me",         // "me" => OneDrive personal del usuario
    folderPath: "/ArtepisaData"
  };

  // Normaliza el path (debe iniciar con /)
  function normalizePath(p) {
    if (!p) return "/ArtepisaData";
    return p.startsWith("/") ? p : `/${p}`;
  }

  const incoming = window.GRAPH_STORAGE || {};
  const merged = {
    location: incoming.location === "site" ? "site" : "me",
    siteId: incoming.siteId || "", // solo si usas SharePoint (no necesario en OneDrive personal)
    folderPath: normalizePath(incoming.folderPath || DEFAULT_STORAGE.folderPath)
  };

  window.GRAPH_STORAGE = merged;
})();

/* ---------------------------------------------
   Tips de configuración (informativos)
   ---------------------------------------------
   - Para usar SharePoint en vez de OneDrive:
     window.GRAPH_STORAGE = {
       location: "site",
       siteId: "<TU_SITE_ID>",
       folderPath: "/Shared Documents/ArtepisaData"
     };

   - Si hospedas en GitHub Pages:
     Asegúrate que la app esté disponible en
     https://<usuario>.github.io/<REPO>/index.html

   - Si cambias la página de inicio, mantén el redirectUri apuntando
     a una ruta pública que esté en "Authentication > Redirect URIs"
     de tu App Registration (Azure Portal).
*/
