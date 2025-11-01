// config/inventario.config.js
(function(){
  window.ModuleConfig = window.ModuleConfig || {};
  window.ModuleConfig.inventario = {
    collection: "inventario",
    fileName: "inventario.json",
    pageSize: 10,
    pageSizes: [10,20,50,100],
    ui: {
      editMinRole: "EDITOR",
      adminOnlySelectors: ["#inv-export", "#inv-import", "#inv-clear", "#inv-file"]
    },
    fieldIds: {
      desc: ["f-nombre","i-desc"],
      uni:  ["f-un","i-uni"],
      stock:["f-stock","i-stock"],
      min:  ["f-min","i-min"],
      ubi:  ["f-ubi","i-ubi"],
      prov: ["f-prov","i-prov"],
      est:  ["f-estado","i-estado"]
    }
  };
})();
