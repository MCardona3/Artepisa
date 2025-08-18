<script>
// GraphStore: lee/escribe JSON en una carpeta compartida de OneDrive usando un link de compartir.
// Requiere: que tengas un método para obtener el token de MS Graph: window.GraphAuth.getToken()
// (si tu auth.js expone otro método, ajusta getAccessToken() abajo).

(function(){
  const GRAPH = "https://graph.microsoft.com/v1.0";
  const LS_PREFIX = "graphstore_queued_"; // cola local de escrituras

  let driveId = null;      // id del drive de OneDrive
  let folderId = null;     // id de la carpeta (driveItem.id) donde guardamos los .json
  let sharedLink = null;   // link de compartir de OneDrive

  // --- Adaptador de token (ajusta si tu auth expone otro método)
  async function getAccessToken(){
    if (window.GraphAuth && typeof window.GraphAuth.getToken === "function"){
      return await window.GraphAuth.getToken();
    }
    // Fallback: intenta con MSALApp (si lo tienes)
    if (window.MSALApp && typeof window.MSALApp.acquireToken === "function"){
      return await window.MSALApp.acquireToken();
    }
    throw new Error("No se encontró un proveedor de token (GraphAuth.getToken o MSALApp).");
  }

  // Base64url (para /shares/{id})
  function base64url(str){
    return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  // Resuelve el link compartido -> driveItem (carpeta)
  async function setSharedLink(url){
    sharedLink = url;
    const encoded = base64url("u!" + url);
    const token = await getAccessToken();
    const r = await fetch(`${GRAPH}/shares/${encoded}/driveItem?$select=id,name,parentReference`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok){
      const t = await r.text();
      throw new Error("No se pudo resolver el link compartido. " + t);
    }
    const item = await r.json();
    if (!item || !item.id || !item.parentReference || !item.parentReference.driveId){
      throw new Error("El link no apunta a una carpeta válida.");
    }
    driveId = item.parentReference.driveId;
    folderId = item.id;
  }

  // Obtiene metadatos del archivo dentro de la carpeta compartida
  async function getItemMeta(filename){
    const token = await getAccessToken();
    const url = `${GRAPH}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(filename)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    if (r.status === 404) return null;
    if (!r.ok){
      const t = await r.text();
      throw new Error("Error al obtener metadatos: " + t);
    }
    return await r.json();
  }

  // Descarga JSON (si no existe, devuelve [])
  async function getJson(filename){
    if (!driveId || !folderId) throw new Error("GraphStore no inicializado. Llama a useSharedLink primero.");
    try{
      const token = await getAccessToken();

      // ¿existe el archivo?
      const meta = await getItemMeta(filename);
      if (!meta) return []; // si no existe devolvemos lista vacía

      // ruta /content para descargar directamente
      const contentUrl = `${GRAPH}/drives/${driveId}/items/${meta.id}/content`;
      const r = await fetch(contentUrl, { headers: { Authorization: `Bearer ${token}` }});
      if (!r.ok){
        const t = await r.text();
        throw new Error("No se pudo descargar el JSON: " + t);
      }
      const text = await r.text();
      try{ return JSON.parse(text); }catch{ return []; }
    }catch(err){
      console.warn("getJson fallo, uso cola local si hubiera:", err);
      // Fallback: intenta cola local como vista eventual
      const queued = localStorage.getItem(LS_PREFIX + filename);
      if (queued){
        try{ return JSON.parse(queued); }catch{}
      }
      return [];
    }
  }

  // Sube JSON (PUT /content). Si falla, cola en localStorage para sincronizar luego.
  async function putJson(filename, data){
    if (!driveId || !folderId) throw new Error("GraphStore no inicializado. Llama a useSharedLink primero.");

    // Siempre guardamos snapshot en local como “última versión conocida”
    localStorage.setItem(LS_PREFIX + filename, JSON.stringify(data));

    try{
      const token = await getAccessToken();
      const url = `${GRAPH}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(filename)}:/content`;
      const r = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
          // Si quieres evitar pisar cambios ajenos, añade If-Match con la ETag actual
          // "If-Match": meta.eTag
        },
        body: JSON.stringify(data)
      });
      if (!r.ok){
        const t = await r.text();
        throw new Error("PUT falló: " + t);
      }
      // éxito: ya está en nube, mantenemos copia local por velocidad
      return true;
    }catch(err){
      console.warn("putJson: no se pudo subir, queda en cola local:", err);
      // Ya quedó en local, un next sync lo subirá
      return false;
    }
  }

  // Sincroniza TODO lo que está en cola local (archivos con prefijo LS_PREFIX)
  async function syncPending(){
    if (!driveId || !folderId) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX));
    if (!keys.length) return;

    for (const k of keys){
      const filename = k.replace(LS_PREFIX, "");
      try{
        const data = JSON.parse(localStorage.getItem(k) || "null");
        if (data == null) continue;
        const ok = await putJson(filename, data);
        if (ok){
          // si quieres limpiar la cola (no recomendado si quieres cache rápida), descomenta:
          // localStorage.removeItem(k);
        }
      }catch(e){
        console.warn("syncPending error con", filename, e);
      }
    }
  }

  // Inicializa a partir del LINK compartido (tu 1drv.ms)
  async function useSharedLink(url){
    await setSharedLink(url);
    // intenta subir pendientes
    try{ await syncPending(); }catch(e){ console.warn("syncPending al iniciar:", e); }
  }

  window.GraphStore = {
    useSharedLink,   // <-- LLÁMALO UNA VEZ, al arrancar, con TU LINK
    getJson,
    putJson,
    syncPending,
    // debug opcional:
    _debug: ()=>({driveId, folderId, sharedLink})
  };
})();
</script>
