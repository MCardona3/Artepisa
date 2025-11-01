// Capa de datos: colecciones en JSON dentro de la carpeta de OneDrive/SharePoint
(function(){
  const files = (window.AppFiles) || {
    clients: "clients.json",
    users: "users.json",
    inventario: "inventario.json",
    ot: "ordenes_trabajo.json",
    oc: "ordenes_compra.json",
    cobros: "cobros.json"
  };

  function fileFor(name){
    return files[name] || files[(name||"").toLowerCase()] || `${name}.json`;
  }

  async function loadCollection(name){
    return await window.GraphStore.getJson(fileFor(name));
  }
  async function saveCollection(name, data){
    return await window.GraphStore.putJson(fileFor(name), data);
  }

  // helpers de conteo
  async function counts(){
    const [c, o, oc] = await Promise.all([
      loadCollection("clients"), loadCollection("ot"), loadCollection("oc")
    ]);
    return { clients: (c||[]).length, ots: (o||[]).length, ocs: (oc||[]).length };
  }

  window.ArtepisaData = { loadCollection, saveCollection, counts };
})();
