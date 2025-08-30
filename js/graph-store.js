// js/graph-store.js — versión robusta (OneDrive/SharePoint)
const STORE = {
  FOLDER_NAME: "ArtepisaData",
  FILES: {
    clientes:   "clientes.json",
    ot:         "ordenes_trabajo.json",
    oc:         "ordenes_compra.json",
    inventario: "inventario.json"   // 👈 necesario para inventario
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
  throw new Error("No hay sesión iniciada o no se cargó auth.js. Inicia sesión primero.");
}

/* ================== Ubicar carpeta ================== */
export async function gs_bootstrap() {
  const cached = JSON.parse(localStorage.getItem("GS_DRIVE_ITEM") || "null");
  if (cached?.driveId && cached?.itemId) return cached;

  const token = await gs_token();

  // 1) En mi OneDrive
  let resp = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,folder",
    { headers: { Authorization: `Bearer ${token}` } }
  );
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
      "If-None-Match": "*"   // crea solo si NO existe
    },
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

  const base = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`;

  // 1) Metadatos (para ETag). Si no existe, créalo y devuelve vacío.
  let meta = await fetch(`${base}:/${fileName}`, { headers: { Authorization: `Bearer ${token}` } });
  if (meta.status === 404) {
    await gs_ensureFile(kind);
    return { etag: "", items: [] };
  }
  if (!meta.ok) throw new Error("No se pudo leer metadatos de " + fileName);
  const metaJson = await meta.json();
  const etag = metaJson.eTag || "";

  // 2) Contenido. Si aparece 404 por latencia, asegúralo y devuelve [].
  let r = await fetch(`${base}:/${fileName}:/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) {
    await gs_ensureFile(kind);
    return { etag: etag, items: [] };
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

  const url = driveId === "me"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}:/${fileName}:/content`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}:/${fileName}:/content`;

  // Si no tenemos etag (primer guardado), aseguramos existencia y guardamos SIN If-Match.
  if (!etag) {
    await gs_ensureFile(kind);
    const r0 = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(items ?? [])
    });
    if (!r0.ok) {
      const t = await r0.text().catch(()=>r0.statusText);
      throw new Error("Error al guardar " + fileName + ": " + t);
    }
    const meta0 = await r0.json().catch(()=>null);
    return meta0?.eTag || "";
  }

  // Con ETag → control de concurrencia
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-Match": etag
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
