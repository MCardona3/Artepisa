// config/usuarios.config.js
(function(){
  window.ModuleConfig = window.ModuleConfig || {};
  window.ModuleConfig.usuarios = {
    collection: "users",
    fileName: "users.json",
    ui: {
      editMinRole: "EDITOR",
      adminOnlySelectors: [
        "#ad-create", "#ad-invite",
        "#ad-add-group", "#ad-role"
      ]
    }
  };
})();
