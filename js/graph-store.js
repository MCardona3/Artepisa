<script>
// Microsoft Graph helpers mejorados (OneDrive/SharePoint) con:
// - Retries 429/5xx
// - ETag (If-Match) para evitar sobrescrituras
// - Cola offline en localStorage (syncPending)
// - mkdir -p para carpetas
//
// Requiere que exista window.GRAPH_STORAGE y un método de token:
//   window.MSALApp.getToken()  -> string Bearer token
//
// Config esperada (ejemplos):
// window.GRAPH_STORAGE = {
//   location: "me",                // "me" (OneDrive personal) o "site" (SharePoint)
//   siteId:  "...",                // si location === "site"
//   folderPath: "/ArtepisaData"    // carpeta compartida donde viven los .json
// }

(function(){
  const CFG = window.GRAPH_STORAGE || {};
  const GRAPH = "https://graph.microsoft.com/v1.0";

  // --- Cola offline en localStorage ---
  const LS_PREFIX = "GraphStore_queue_";    // por archivo: GraphStore_queue_clients.json
  const LS_META   = "GraphStore_meta";      // etags y metadatos cacheados

  // Cache de ETag por archivo (en memoria + localStorage)
  let metaCache = loadMetaCache();

  function loadMetaCache(){
    try { return JSON.parse(localStorage.getItem(LS_META) || "{}"); } catch { return {}; }
  }
  function saveMetaCache(){
    try { localStorage.setItem(LS_META, JSON.stringify(metaCache)); } catch {}
  }

  // --- Token ---
  async function getAccessToken(){
    if (!window.MSALApp || typeof window.MSALApp.getToken !== "function"){
      throw new Error("MSALApp.getToken no disponible.");
    }
    return await window.MSALApp.getToken();
  }

  // --- Base del Drive (OneDrive o SharePoint) ---
  function driveBase(){
    if (CFG.location === "site"){
      if (!CFG.siteId) throw new Error("Falta siteId en GRAPH_STORAGE");
      return `/sites/${CFG.siteId}/drive`;
    }
    return `/me/drive`;
  }

  // --- Fetch con reintentos gentiles ---
  async function gfetch(path, opts = {}, tryNo = 0){
    const token = await getAccessToken();
    const headers = {
      "Authorization": `Bearer ${token}`,
      ...(opts.body && typeof opts.body === "string"
          ? { "Content-Type": opts.headers?.["Content-Type"] || "application/json" }
          : (opts.body && typeof opts.body === "object" ? { "Content-Type": "application/json" } : {})),
      ...opts.headers
    };

    const res = await fetch(`${GRAPH}${path}`, { ...opts, headers });

    if (res.ok) return res;

    // 404: devolvemos tal cual (lo maneja el caller)
    if (res.status === 404) return res;

    // Retries para 429/5xx
    if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && tryNo < 3){
      const ra = parseInt(res.headers.get("Retry-After") || "0", 10);
      const backoff = ra > 0 ? ra * 1000 : (200 * Math.pow(2, tryNo)); // 200ms, 400ms, 800ms
      await new Promise(r => setTimeout(r, backoff));
      return gfetch(path, opts, tryNo + 1);
    }

    // Otros errores: lanza con info
    const txt = await res.text().catch(()=> "");
    throw new Error(`Graph ${res.status}: ${txt || res.statusText}`);
  }

  // --- mkdir -p (crea cada segmento si no existe) ---
  async function ensureFolder(path){
    const parts = String(path || "").split("/").filter(Boolean);
    if (!parts.length) return "/";

    let currId = "root";
    let currPath = "";

    for (const p of parts){
      currPath += `/${p}`;

      // Intenta GET por ruta
      let itemRes = await gfetch(`${driveBase()}/root:${currPath}`, { method: "GET" }).catch(()=>null);

      if (!itemRes || itemRes.status === 404){
        // Crear siguiente segmento
        const createRes = await gfetch(`${driveBase()}/items/${currId}/children`, {
          method: "POST",
          body: JSON.stringify({
            name: p, folder: {}, "@microsoft.graph.conflictBehavior": "fail"
          })
        });
        const created = await createRes.json();
        currId = created.id;
      } else {
        const item = await itemRes.json();
        currId = item.id;
      }
    }
    return currPath;
  }

  // --- Helpers archivos ---
  async function getItemByPath(relPath){
    const fullPath = `${CFG.folderPath}/${relPath}`.replace(/\/+/g, "/");
    const res = await gfetch(`${driveBase()}/root:${fullPath}`, { method: "GET" });
    if (res.status === 404) return null;
    return await res.json();
  }

  async function downloadContentById(itemId){
    const res = await gfetch(`${driveBase()}/items/${itemId}/content`, { method: "GET", headers: { "Content-Type": "text/plain" }});
    if (res.status === 404) return null;
    return await res.text();
  }

  async function uploadContentByPath(relPath, body, etag){
    const fullPath = `${CFG.folderPath}/${relPath}`.replace(/\/+/g, "/");
    const headers = etag ? { "If-Match": etag, "Content-Type":"application/json" } : { "Content-Type":"application/json" };
    const res = await gfetch(`${driveBase()}/root:${fullPath}:/content`, {
      method: "PUT",
      headers,
      body
    });
    return await res.json();
  }

  // --- API pública: getJson / putJson / syncPending ---
  async function getJson(relPath){
    try{
      // Intenta asegurar carpeta (una sola vez por sesión está bien)
      await ensureFolder(CFG.folderPath);

      // 1) Obtiene metadatos (para captar ETag)
      const item = await getItemByPath(relPath).catch(()=>null);
      if (!item || !item.id){
        // No existe: devuelve []
        // Limpia ETag local
        delete metaCache[relPath];
        saveMetaCache();
        return [];
      }

      // 2) Baja contenido y guarda ETag
      const text = await downloadContentById(item.id);
      let data = [];
      try { data = text ? JSON.parse(text) : []; } catch { data = []; }

      metaCache[relPath] = { etag: item.eTag || item.@microsoft_graph_downloadUrl || null, id: item.id, lastRead: Date.now() };
      saveMetaCache();

      return data;
    }catch(err){
      console.warn("getJson fallo, uso copia local si existe:", err);

      // Fallback: regresa última versión guardada en cola si existe
      const queued = localStorage.getItem(LS_PREFIX + relPath);
      if (queued){
        try { return JSON.parse(queued); } catch{}
      }
      return [];
    }
  }

  async function putJson(relPath, obj){
    // Guarda snapshot en local primero (para offline y para tener 'última vista')
    try { localStorage.setItem(LS_PREFIX + relPath, JSON.stringify(obj)); } catch {}

    try{
      await ensureFolder(CFG.folderPath);

      // Si tenemos ETag, úsalo (evita pisar cambios ajenos)
      const etag = metaCache[relPath]?.etag || "*"; // si no hay, sube siempre (o usa "*" para forzar PUT)
      const body = JSON.stringify(obj, null, 2);

      try{
        const result = await uploadContentByPath(relPath, body, etag);
        // Guarda nueva ETag e id si vienen
        if (result && result.eTag){
          metaCache[relPath] = { etag: result.eTag, id: result.id, lastWrite: Date.now() };
          saveMetaCache();
        }
        return true;
      }catch(e){
        // Si es precondition failed (412) o 409 => conflicto ETag
        const msg = (e.message || "").toLowerCase();
        if (msg.includes("412") || msg.includes("precondition") || msg.includes("conflict") || msg.includes("409")){
          // Vuelve a leer la versión remota para no perder cambios
          const remote = await getJson(relPath);
          // Estrategia simple: preferimos último write local => sobrescribir con ETag fresca
          // (Si prefieres mergear, aplica aquí tu merge)
          const freshEtag = metaCache[relPath]?.etag;
          const result = await uploadContentByPath(relPath, body, freshEtag);
          if (result && result.eTag){
            metaCache[relPath] = { etag: result.eTag, id: result.id, lastWrite: Date.now() };
            saveMetaCache();
          }
          return true;
        }
        throw e;
      }
    }catch(err){
      console.warn("putJson: no se pudo subir ahora, queda en cola local:", err);
      // Queda en cola; syncPending lo intentará luego
      return false;
    }
  }

  // Sube todo lo que esté en cola local (por archivo)
  async function syncPending(){
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX));
    if (!keys.length) return;

    for (const k of keys){
      const relPath = k.replace(LS_PREFIX, "");
      let data;
      try{ data = JSON.parse(localStorage.getItem(k) || "null"); } catch { data = null; }
      if (data == null) continue;

      try{
        await putJson(relPath, data);
        // si quieres limpiar la cola tras subir con éxito, descomenta:
        // localStorage.removeItem(k);
      }catch(e){
        console.warn("syncPending no pudo subir", relPath, e);
      }
    }
  }

  // Exponer API
  window.GraphStore = { getJson, putJson, ensureFolder, syncPending };

})();
</script>
