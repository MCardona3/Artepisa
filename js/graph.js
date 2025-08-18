// Microsoft Graph helpers para OneDrive/SharePoint
(function(){
  const G = window.GRAPH_STORAGE;

  async function gfetch(path, opts={}){
    const token = await window.MSALApp.getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...opts,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": opts.body && typeof opts.body !== "string" ? "application/json" : (opts.headers && opts.headers["Content-Type"] || "application/json"),
        ...opts.headers
      }
    });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(`Graph ${res.status}: ${txt}`);
    }
    return res;
  }

  function driveBase(){
    if(G.location === "site"){
      if(!G.siteId) throw new Error("Falta siteId en GRAPH_STORAGE");
      return `/sites/${G.siteId}/drive`;
    }
    return `/me/drive`;
  }

  async function ensureFolder(path){
    // Crea la carpeta path (ej: /ArtepisaData) si no existe (mkdir -p)
    const parts = path.split("/").filter(Boolean);
    let curr = "";
    for(const p of parts){
      curr += `/${p}`;
      const check = await gfetch(`${driveBase()}/root:${curr}` , { method: "GET" }).catch(()=>null);
      if(!check){
        await gfetch(`${driveBase()}/root/children`, {
          method: "POST",
          body: JSON.stringify({ name: p, folder: {}, "@microsoft.graph.conflictBehavior": "fail" })
        });
      }
    }
    return curr;
  }

  async function getJson(relPath){
    // Lee JSON desde folderPath + relPath, retorna objeto o []
    const full = `${driveBase()}/root:${G.folderPath}/${relPath}:/content`;
    try{
      const res = await gfetch(full, { method: "GET", headers: { "Content-Type": "text/plain" } });
      const txt = await res.text();
      return txt ? JSON.parse(txt) : [];
    }catch(e){
      // Si 404, retorna estructura vacía
      return [];
    }
  }

  async function putJson(relPath, obj){
    await ensureFolder(G.folderPath);
    const full = `${driveBase()}/root:${G.folderPath}/${relPath}:/content`;
    const body = JSON.stringify(obj, null, 2);
    await gfetch(full, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    return true;
  }

  window.GraphStore = { getJson, putJson, ensureFolder };
})();