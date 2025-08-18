// Capa de datos: colecciones en JSON dentro de la carpeta de OneDrive/SharePoint
(function(){
  const files = {
    clients: "clients.json",
    ots: "ots.json",
    ocs: "ocs.json",
    users: "users.json"
  };

  async function loadCollection(name){
    return await window.GraphStore.getJson(files[name] || `${name}.json`);
  }
  async function saveCollection(name, data){
    return await window.GraphStore.putJson(files[name] || `${name}.json`, data);
  }

  // helpers de conteo
  async function counts(){
    const [c, o, oc] = await Promise.all([
      loadCollection("clients"), loadCollection("ots"), loadCollection("ocs")
    ]);
    return { clients: (c||[]).length, ots: (o||[]).length, ocs: (oc||[]).length };
  }

  window.ArtepisaData = { loadCollection, saveCollection, counts };
})();