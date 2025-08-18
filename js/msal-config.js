// js/msal-config.js

// Detecta si estás en GitHub Pages (dominio *.github.io) y arma bien el redirect
const IS_GITHUB_PAGES = /\.github\.io$/.test(location.host);
const REPO = "Artepisa";                 // <-- nombre EXACTO del repo
const BASE = IS_GITHUB_PAGES ? `/${REPO}` : "";
const REDIRECT = `${location.origin}${BASE}/index.html`;

window.MSAL_CONFIG = {
  // App registrada en Azure
  clientId: "24164079-124e-4f17-a347-2b357984c44f",
  // Para cuentas personales de Microsoft
  tenantId: "consumers",
  // A dónde regresar después de login/logout
  redirectUri: REDIRECT,
  // Permisos delegados que pedirá el token
  scopes: ["User.Read", "Files.ReadWrite", "offline_access"]
};

// Dónde se guardan tus JSON en la nube (OneDrive personal del usuario)
window.GRAPH_STORAGE = {
  location: "me",
  folderPath: "/ArtepisaData"
};
