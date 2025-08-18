<!-- js/msal-config.js -->
<script>
(() => {
  // Si está en *.github.io, añade el nombre del repo al path
  const IS_GITHUB_PAGES = /github\.io$/.test(location.hostname);
  const REPO = "Artepisa";              // 👈 cambia si tu repo se llama distinto
  const BASE = IS_GITHUB_PAGES ? `/${REPO}` : "";
  const REDIRECT = `${location.origin}${BASE}/index.html`;

  window.MSAL_CONFIG = {
    // App (cliente) de Azure
    clientId: "24164079-124e-4f17-a347-2b357984c44f",
    // 'consumers' = cuentas personales Microsoft
    authority: "https://login.microsoftonline.com/consumers",
    // Donde volver después de login / logout
    redirectUri: REDIRECT,
    postLogoutRedirectUri: REDIRECT,

    // Permisos mínimos para OneDrive personal
    scopes: ["User.Read", "Files.ReadWrite", "offline_access"],

    // Recomendado para SPA
    cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false }
  };

  // Dónde se guardan tus JSON en la nube
  window.GRAPH_STORAGE = {
    location: "me",          // OneDrive del usuario
    folderPath: "/ArtepisaData"
  };
})();
</script>
