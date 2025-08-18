// js/graph-store.js
const STORE = {
  FOLDER_NAME: "ArtepisaData",
  FILES: { clientes: "clientes.json", ot: "ordenes_trabajo.json", oc: "ordenes_compra.json" }
};

async function gs_token() {
  // Compatibilidad: usa MSALApp.getToken() o getToken() global de auth.js
  if (window.MSALApp && typeof MSALApp.getToken === "function") {
    return await MSALApp.getToken();
  }
  if (typeof window.getToken === "function") {
    return await window.getToken();
  }
  throw new Error("No hay sesión iniciada o no se cargó auth.js. Abre primero login.html e inicia sesión.");
}

export async function gs_bootstrap() {
  const cached = JSON.parse(localStorage.getItem("GS_DRIVE_ITEM") || "null");
  if (cached?.driveId && cached?.itemId) return cached;

  const token = await gs_token();

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

export async function gs_getCollection(kind) {
  const { driveId, itemId } = await gs_bootstrap();
  const fileName = STORE.FILES[kind];
  if (!fileName) throw new Error("Tipo no válido");

  const token = await gs_token();
  const baseA = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;

  const meta = await fetch(`${baseA}:/${fileName}`, { headers: { Authorization: `Bearer ${token}` }});
  if (!meta.ok) throw new Error("No se pudo leer metadatos de " + fileName);
  const metaJson = await meta.json();
  const etag = metaJson.eTag;

  const r = await fetch(`${baseA}:/${fileName}:/content`, { headers: { Authorization: `Bearer ${token}` }});
  if (!r.ok) throw new Error("No se pudo leer " + fileName);
  const text = await r.text();
  const items = text ? JSON.parse(text) : [];

  return { etag, items };
}

export async function gs_putCollection(kind, items, etag) {
  const { driveId, itemId } = await gs_bootstrap();
  const fileName = STORE.FILES[kind];
  const token = await gs_token();

  const url = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}:/${fileName}:/content`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}:/${fileName}:/content`;

  const r = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify(items ?? [])
  });

  if (r.status === 412) throw new Error("Otro usuario guardó cambios. Recarga (412).");
  if (!r.ok) throw new Error("Error al guardar " + fileName);

  const meta = await r.json().catch(()=>null);
  return meta?.eTag || "";
}
