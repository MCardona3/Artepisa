// js/msal-config.js — MSAL v2 (SPA) for Artepisa
// Requiere haber agregado login.html como Redirect URI en Azure AD (SPA)

export const msalConfig = {
  auth: {
    clientId: "24164079-124e-4f17-a347-2b357984c44f",
    // 'common' permite cuentas corporativas y personales. Si quieres solo personales, usa 'consumers'.
    authority: "https://login.microsoftonline.com/common",
    // Detecta la ruta base y usa login.html como redirect en local y GitHub Pages.
    redirectUri: (() => {
      const base = location.origin + location.pathname.replace(/\/[^/]*$/, "/");
      return base + "login.html";
    })()
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level <= 2) console.warn(message);
      }
    }
  }
};

// Scopes mínimos para Graph + OpenID
export const loginRequest = {
  scopes: [
    "openid", "profile", "offline_access",
    "User.Read",
    "Files.ReadWrite.All",
    "Sites.ReadWrite.All"
  ]
};
