// config/base.config.js
(function(){
  window.AppConfig = {
    defaultPageSize: 10,
    // Roles efectivos
    roles: {
      admin: ["ADMIN","Administrador","ADMINISTRADOR"],
      editor: ["EDITOR","Editor"]
    },
    // Encodings en orden de prueba para CSV/TSV
    csvEncodings: ["utf-8", "iso-8859-1", "windows-1252"],
    // Separadores soportados por defecto
    csvDelimiters: [",", ";", "\t"]
  };
})();
