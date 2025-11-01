// config/clientes.config.js
(function(){
  window.ModuleConfig = window.ModuleConfig || {};
  window.ModuleConfig.clientes = {
    collection: "clients",       // nombre lógico de la colección
    fileName: "clients.json",    // archivo físico (Graph)
    lsKey: "clients",            // clave de respaldo en localStorage
    pageSize: 10,
    pageSizes: [10,20,50],
    // columnas visibles y su etiqueta
    columns: [
      { key: "id", label: "ID" },
      { key: "nombre", label: "Nombre" },
      { key: "telefono", label: "Teléfono" },
      { key: "direccion", label: "Dirección" },
      { key: "rfc", label: "RFC" },
      { key: "contacto", label: "Contacto" }
    ],
    // Reglas de permisos de UI
    ui: {
      editMinRole: "EDITOR",
      adminOnlySelectors: [
        "#c-reset",
        "#c-exportar",
        'label[for="c-importar"]'
      ]
    },
    // Importación CSV
    importCSV: {
      delimiter: ",",
      hasHeader: true,
      normalizeKeys: {
        "nombre": "nombre",
        "tel": "telefono",
        "telefono": "telefono",
        "dirección": "direccion",
        "direccion": "direccion",
        "rfc": "rfc",
        "contacto": "contacto",
        "id": "id"
      }
    }
  };
})();
