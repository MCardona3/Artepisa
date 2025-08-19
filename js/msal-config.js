
// Rellena con tu app registration si quieres usar Microsoft Login real
window.__MSAL_CONFIG__ = {
  clientId: "REEMPLAZA-CON-TU-CLIENT-ID",
  authority: "https://login.microsoftonline.com/common",
  redirectUri: (location.origin + location.pathname).replace(/\/[^/]*$/, "/login.html"),
  scopes: ["User.Read", "Files.ReadWrite.All"]
};
