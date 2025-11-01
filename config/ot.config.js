// config/ot.config.js
(function(){
  window.ModuleConfig = window.ModuleConfig || {};
  window.ModuleConfig.ot = {
    collection: "ot",
    fileName: "ordenes_trabajo.json",
    ui: {
      editMinRole: "EDITOR",
      adminOnlySelectors: ["#o-export", "#o-import", "#o-reset", "#o-file"]
    }
  };
})();
