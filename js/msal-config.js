
// Rellena con tu app registration si quieres usar Microsoft Login real
window.__MSAL_CONFIG__ = {
  clientId: "24164079-124e-4f17-a347-2b357984c44f",
  authority: "https://login.microsoftonline.com/common",
  redirectUri: (location.origin + location.pathname).replace(/\/[^/]*$/, "/login.html"),
  scopes: ["User.Read", "Files.ReadWrite.All"]
};
