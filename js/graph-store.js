
/**
 * Graph store con fallback localStorage.
 * Estructura: carpeta "ArtepisaData" en AppRoot. Archivos JSON por colección.
 */
const BASE_FOLDER = "ArtepisaData";

async function _getToken(){
  if (window.MSALApp && typeof MSALApp.getToken === "function") {
    try { return await MSALApp.getToken(); } catch(_) { return null; }
  }
  if (typeof window.getToken === "function") {
    try { return await window.getToken(); } catch(_) { return null; }
  }
  return null;
}

function _localKey(name){ return "artepisa_"+name; }

function _etagFrom(data){
  try{
    const s = JSON.stringify(data);
    let h = 0;
    for (let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
    return '"'+h.toString(16)+'"';
  }catch(_){ return '"0"'; }
}

async function local_get(name){
  const raw = localStorage.getItem(_localKey(name));
  const items = raw ? JSON.parse(raw) : [];
  return { etag: _etagFrom(items), items };
}
async function local_put(name, items, etag){
  const cur = localStorage.getItem(_localKey(name));
  let now = [];
  try{ now = cur? JSON.parse(cur):[]; }catch(_){}
  const currentEtag = _etagFrom(now);
  if (etag && etag !== currentEtag) {
    const e = new Error("412 Precondition Failed (local)");
    e.status = 412;
    throw e;
  }
  localStorage.setItem(_localKey(name), JSON.stringify(items||[]));
  return _etagFrom(items||[]);
}

async function graph_get(name){
  const token = await _getToken();
  if (!token) throw new Error("No access token");
  const headers = { Authorization: "Bearer "+token, "Content-Type":"application/json" };

  // Asegura carpeta AppRoot/ArtepisaData
  const ensureUrl = "https://graph.microsoft.com/v1.0/me/drive/special/approot/children";
  const listRes = await fetch(ensureUrl, { headers });
  if (!listRes.ok) throw new Error("Graph error (listing approot): "+listRes.status);
  const listing = await listRes.json();
  let folder = listing.value.find(x => x.name === BASE_FOLDER);
  if (!folder){
    const createRes = await fetch(ensureUrl, {
      method: "POST", headers,
      body: JSON.stringify({ name: BASE_FOLDER, folder: {}, "@microsoft.graph.conflictBehavior": "replace" })
    });
    if (!createRes.ok) throw new Error("Graph error creating folder: "+createRes.status);
  }

  const fileUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/`+encodeURIComponent(BASE_FOLDER)+`/`+encodeURIComponent(name)+`.json`;
  const metaRes = await fetch(fileUrl, { headers });
  if (metaRes.status === 404){
    return { etag: "", items: [] };
  }
  if (!metaRes.ok) throw new Error("Graph error getting file: "+metaRes.status);
  const etag = metaRes.headers.get("ETag") || metaRes.headers.get("etag") || "";
  const meta = await metaRes.json();
  const downloadUrl = meta["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) return { etag, items: [] };
  const fileRes = await fetch(downloadUrl);
  const text = await fileRes.text();
  let items = [];
  try{
    const j = JSON.parse(text);
    items = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
  }catch(_){ items = []; }
  return { etag, items };
}

async function graph_put(name, items, etag){
  const token = await _getToken();
  if (!token) throw new Error("No access token");
  const headers = { Authorization: "Bearer "+token, "Content-Type":"application/json" };
  const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/`+encodeURIComponent(BASE_FOLDER)+`/`+encodeURIComponent(name)+`.json:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, ...(etag ? {"If-Match": etag}: {}) },
    body: JSON.stringify(items||[])
  });
  if (res.status === 412){
    const e = new Error("412 Precondition Failed");
    e.status = 412;
    throw e;
  }
  if (!res.ok) throw new Error("Graph put error: "+res.status);
  const et = res.headers.get("ETag") || res.headers.get("etag") || "";
  return et;
}

export async function gs_getCollection(name){
  try{
    return await graph_get(name);
  }catch(_){
    // fallback local
    return await local_get(name);
  }
}

export async function gs_putCollection(name, items, etag){
  try{
    return await graph_put(name, items, etag);
  }catch(e){
    if (e && e.status === 412) throw e;
    return await local_put(name, items, etag);
  }
}
