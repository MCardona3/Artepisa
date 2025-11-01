// config/cobros.config.js
(function(){
  window.ModuleConfig = window.ModuleConfig || {};
  window.ModuleConfig.cobros = {
    collection: "cobros",
    fileName: "cobros.json",
    ui: {
      editMinRole: "EDITOR",
      adminOnlySelectors: ["#cob-export", "#cob-import", "#cob-clear", "#cob-file"]
    }
  };
})();
