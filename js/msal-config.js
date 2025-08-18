/* msal-config.js — OneDrive personal (cuentas Microsoft) */

window.MSAL_CONFIG = {
  // Tu app registrada en Azure
  clientId: "24164079-124e-4f17-a347-2b357984c44f",
  // Para cuentas personales usa "consumers". (Si luego migras a empresa/SharePoint, usa "organizations")
  tenantId: "consumers",
  // Debe coincidir con lo que agregaste en Authentication (SPA)
  redirectUri: window.location.origin + "/index.html",
  // Permisos que pedirá el token
  scopes: ["User.Read", "Files.ReadWrite", "offline_access"]
};

/* Dónde guardar los JSON en la nube
   location: "me" -> OneDrive del usuario (fácil y gratis)
   folderPath: carpeta que se crea/usa automáticamente
*/
window.GRAPH_STORAGE = {
  location: "me",
  folderPath: "/ArtepisaData"
};
