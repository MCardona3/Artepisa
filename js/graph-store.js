// js/graph-store.js — versión robusta con backoff y soporte cobros
"use strict";

const STORE = {
  FOLDER_NAME: "ArtepisaData",
  FILES: {
    clientes:   "clientes.json",
    ot:         "ordenes_trabajo.json",
    oc:         "ordenes_compra.json",
    inventario: "inventario.json",
    cobros:     "cobros.json"          // 👈 NUEVO
  }
};

/* ================== Utils ================== */
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
const MAX_RETRIES = 4;
const BASE_DELAY  = 500; // ms

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}
function buildBase(driveId, itemId) {
  return driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;
}
function fileMetaUrl(base, fileName){
  return `${base}:/${fileName}`;
}
function fileContentUrl(base, fileName){
  return `${base}:/${fileName}:/content`;
}

// fetch con reintentos para 429/5xx y errores de red
async function fetchGraph(url, options, { retries = MAX_RETRIES } = {}) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      // Reintentar en 429 o 5xx
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt >= retries) return res;
        const ra = Number(res.headers.get("Retry-After")) || 0;
        const delay = ra ? ra * 1000 : (BASE_DELAY * Math.pow(2, attempt));
        await sleep(delay);
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      // red/timeout: reintenta
      if (attempt >= retries) throw err;
      const delay = BASE_DELAY * Math.pow(2, attempt);
      await sleep(delay);
      attempt++;
    }
  }
}

/* ================== Auth ================== */
async function gs_token() {
  if (window.MSALApp && typeof MSALApp.getToken === "function") {
    return await MSALApp.getToken();
  }
  if (typeof window.getToken === "function") {
    return await window.getToken();
  }
  throw new Error("No hay sesión iniciada o no se cargó auth.js. Inicia sesión primero.");
}

/* ================== Cache control ================== */
export function gs_resetCache() {
  localStorage.removeItem("GS_DRIVE_ITEM");
}
export function gs_setFolderName(name) {
  if (name && typeof name === "string") STORE.FOLDER_NAME = name;
  gs_resetCache();
}

/* ================== Ubicar carpeta ================== */
export async function gs_bootstrap() {
  const cached = JSON.parse(localStorage.getItem("GS_DRIVE_ITEM") || "null");
  if (cached?.driveId && cached?.itemId) return cached;

  const token = await gs_token();

  // 1) En mi OneDrive
  let resp = await fetchGraph(
    "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,folder",
    { headers: authHeaders(token) }
  );
  let data = await resp.json();
  let hit = data?.value?.find(x => x.name === STORE.FOLDER_NAME && x.folder);
  if (hit) {
    const res = { driveId: "me", itemId: hit.id };
    localStorage.setItem("GS_DRIVE_ITEM", JSON.stringify(res));
    return res;
  }

  // 2) Compartidos conmigo
  resp = await fetchGraph("https://graph.microsoft.com/v1.0/me/drive/sharedWithMe", {
    headers: authHeaders(token)
  });
  data = await resp.json();
  const shared = data?.value?.find(x => x.name === STORE.FOLDER_NAME);
  if (!shared) throw new Error(`No se encontró la carpeta compartida "${STORE.FOLDER_NAME}".`);

  const res = {
    driveId: shared.remoteItem.parentReference.driveId,
    itemId:  shared.remoteItem.id
  };
  localStorage.setItem("GS_DRIVE_ITEM", JSON.stringify(res));
  return res;
}

/* ================== Helpers archivo ================== */

// Crea el archivo si no existe (PUT con If-None-Match: *)
async function gs_ensureFile(kind){
  const fileName = STORE.FILES[kind] || `${kind}.json`;
  const { driveId, itemId } = await gs_bootstrap();
  const token = await gs_token();

  const base = buildBase(driveId, itemId);
  const url  = fileContentUrl(base, fileName);

  const r = await fetchGraph(url, {
    method: "PUT",
    headers: authHeaders(token, {
      "Content-Type": "application/json",
      "If-None-Match": "*"   // crea solo si NO existe
    }),
    body: "[]"
  });

  // 412 = ya existía → OK
  if (!r.ok && r.status !== 412) {
    const t = await r.text().catch(()=>r.statusText);
    throw new Error("No se pudo crear archivo " + fileName + ": " + t);
  }
}

/* ================== API pública ================== */
export async function gs_getCollection(kind) {
  const fileName = STORE.FILES[kind] || `${kind}.json`;
  const { driveId, itemId } = await gs_bootstrap();
  const token = await gs_token();

  const base = buildBase(driveId, itemId);

  // 1) Metadatos (para ETag). Si no existe, créalo y vuelve a intentar 1 vez.
  let meta = await fetchGraph(fileMetaUrl(base, fileName), { headers: authHeaders(token) });
  if (meta.status === 404) {
    await gs_ensureFile(kind);
    meta = await fetchGraph(fileMetaUrl(base, fileName), { headers: authHeaders(token) });
  }
  if (!meta.ok) throw new Error("No se pudo leer metadatos de " + fileName);
  const metaJson = await meta.json();
  const etag = metaJson.eTag || "";

  // 2) Contenido. Si aparece 404 por latencia, asegúralo y devuelve [].
  let r = await fetchGraph(fileContentUrl(base, fileName), { headers: authHeaders(token) });
  if (r.status === 404) {
    await gs_ensureFile(kind);
    return { etag, items: [] };
  }
  if (!r.ok) throw new Error("No se pudo leer " + fileName);

  const text = await r.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : []; }
  catch { parsed = []; }

  const items = Array.isArray(parsed) ? parsed
              : (Array.isArray(parsed?.items) ? parsed.items : []);
  return { etag, items };
}

export async function gs_putCollection(kind, items, etag) {
  const fileName = STORE.FILES[kind] || `${kind}.json`;
  const { driveId, itemId } = await gs_bootstrap();
  const token = await gs_token();

  const base = buildBase(driveId, itemId);
  const url  = fileContentUrl(base, fileName);

  // Primer guardado sin ETag → asegura y guarda sin If-Match
  if (!etag) {
    await gs_ensureFile(kind);
    const r0 = await fetchGraph(url, {
      method: "PUT",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(items ?? [])
    });
    if (!r0.ok) {
      const t = await r0.text().catch(()=>r0.statusText);
      throw new Error("Error al guardar " + fileName + ": " + t);
    }
    const meta0 = await r0.json().catch(()=>null);
    return meta0?.eTag || "";
  }

  // Guardado con control de concurrencia
  const r = await fetchGraph(url, {
    method: "PUT",
    headers: authHeaders(token, {
      "Content-Type": "application/json",
      "If-Match": etag
    }),
    body: JSON.stringify(items ?? [])
  });

  if (r.status === 412) throw new Error("Otro usuario guardó cambios. Recarga (412).");
  if (!r.ok) {
    const t = await r.text().catch(()=>r.statusText);
    throw new Error("Error al guardar " + fileName + ": " + t);
  }

  const meta = await r.json().catch(()=>null);
  return meta?.eTag || "";
}

