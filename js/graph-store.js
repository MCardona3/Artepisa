// js/graph-store.js
const STORE = {
  FOLDER_NAME: "ArtepisaData",
  // ← AÑADIDO: inventario.json
  FILES: {
    clientes: "clientes.json",
    ot: "ordenes_trabajo.json",
    oc: "ordenes_compra.json",
    inventario: "inventario.json"
  }
};

/* ================== Auth ================== */
async function gs_token() {
  if (window.MSALApp && typeof MSALApp.getToken === "function") {
    return await MSALApp.getToken();
  }
  if (typeof window.getToken === "function") {
    return await window.getToken();
  }
  throw new Error("No hay sesión iniciada o no se cargó auth.js. Abre primero login.html e inicia sesión.");
}

/* ================== Ubicar carpeta ================== */
export async function gs_bootstrap() {
  const cached = JSON.parse(localStorage.getItem("GS_DRIVE_ITEM") || "null");
  if (cached?.driveId && cached?.itemId) return cached;

  const token = await gs_token();

  // 1) Mi OneDrive
  let resp = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,folder", {
    headers: { Authorization: `Bearer ${token}` }
  });
  let data = await resp.json();
  let hit = data?.value?.find(x => x.name === STORE.FOLDER_NAME && x.folder);
  if (hit) {
    const res = { driveId: "me", itemId: hit.id };
    localStorage.setItem("GS_DRIVE_ITEM", JSON.stringify(res));
    return res;
  }

  // 2) Compartidos conmigo
  resp = await fetch("https://graph.microsoft.com/v1.0/me/drive/sharedWithMe", {
    headers: { Authorization: `Bearer ${token}` }
  });
  data = await resp.json();
  const shared = data?.value?.find(x => x.name === STORE.FOLDER_NAME);
  if (!shared) throw new Error(`No se encontró la carpeta compartida "${STORE.FOLDER_NAME}".`);

  const res = { driveId: shared.remoteItem.parentReference.driveId, itemId: shared.remoteItem.id };
  localStorage.setItem("GS_DRIVE_ITEM", JSON.stringify(res));
  return res;
}

/* ================== Helpers archivo ================== */

// Crea el archivo si no existe (PUT con If-None-Match: *)
async function gs_ensureFile(kind){
  const fileName = STORE.FILES[kind] || `${kind}.json`;
  const { driveId, itemId } = await gs_bootstrap();
  const token = await gs_token();

  const url = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}:/${fileName}:/content`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}:/${fileName}:/content`;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-None-Match": "*"    // solo crea si no existe
    },
    body: "[]"
  });

  // 412 = ya existía → ok
  if (!r.ok && r.status !== 412) {
    const t = await r.text().catch(()=>r.statusText);
    throw new Error("No se pudo crear archivo " + fileName + ": " + t);
  }
}

/* ================== API pública ================== */

export async function gs_getCollection(kind) {
  const fileName = STORE.FILES[kind] || `${kind}.json`;
  // Asegura que el archivo exista (si no, lo crea como [])
  await gs_ensureFile(kind);

  const { driveId, itemId } = await gs_bootstrap();
  const token = await gs_token();

  const baseA = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;

  // Metadatos (para obtener eTag)
  const meta = await fetch(`${baseA}:/${fileName}`, { headers: { Authorization: `Bearer ${token}` }});
  if (!meta.ok) throw new Error("No se pudo leer metadatos de " + fileName);
  const metaJson = await meta.json();
  const etag = metaJson.eTag;

  // Contenido
  const r = await fetch(`${baseA}:/${fileName}:/content`, { headers: { Authorization: `Bearer ${token}` }});
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

  const url = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}:/${fileName}:/content`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}:/${fileName}:/content`;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Si no hay etag (primer guardado), usa '*' para permitir la subida.
      "If-Match": etag || "*"
    },
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
