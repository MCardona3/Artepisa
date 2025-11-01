// js/graph-store-lite.js — robusto con fallback local
(function () {
  const LS_PREFIX = "GraphStore:";
  const G = (window.GRAPH_STORAGE = {
    folderPath: "/Documents/ArtepisaData" // Carpeta raíz para los JSON
  });

  /* ============== Helpers ============== */
  function lsGet(key, def) {
    try { return JSON.parse(localStorage.getItem(LS_PREFIX + key) || "null") ?? def; }
    catch { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
  }

  function driveBase() {
    return `/me/drive`; // OneDrive personal del usuario autenticado
  }

  async function getTokenSafe() {
    try {
      if (!window.MSALApp || typeof MSALApp.getToken !== "function") throw new Error("MSAL no disponible");
      return await MSALApp.getToken();
    } catch (e) {
      throw new Error("NO_TOKEN: " + (e?.message || e));
    }
  }

  async function gfetch(path, opts = {}) {
    const token = await getTokenSafe();
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {})
    };
    let res;
    try {
      res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...opts, headers });
    } catch (netErr) {
      throw new Error("NET_ERROR:" + (netErr?.message || netErr));
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      // No romper si el tenant no tiene OneDrive/SPO o no hay permisos
      const msg = (txt || res.statusText || "").toLowerCase();
      if (
        res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 ||
        msg.includes("spo license") || msg.includes("access denied")
      ) {
        throw new Error(`GRAPH_UNAVAILABLE:${res.status}:${txt}`);
      }
      throw new Error(`GRAPH_${res.status}:${txt}`);
    }
    return res;
  }

  /* ============== Carpetas anidadas ============== */
  async function ensureFolder(path) {
    // Crea /a/b/c asegurando cada nivel: /root:/a:/children -> /root:/a/b:/children ...
    const parts = (path || "").split("/").filter(Boolean);
    let parent = ""; // ruta acumulada (sin /content)
    for (const p of parts) {
      const curr = parent + "/" + p;
      // ¿Existe el nivel actual?
      const exists = await gfetch(`${driveBase()}/root:${curr}`, { method: "GET" })
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        // Crear dentro del padre actual
        const childrenUrl = parent
          ? `${driveBase()}/root:${parent}:/children`
          : `${driveBase()}/root/children`;
        await gfetch(childrenUrl, {
          method: "POST",
          body: JSON.stringify({
            name: p,
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail"
          })
        });
      }
      parent = curr;
    }
    return parent; // ruta absoluta construida (ej. "/Documents/ArtepisaData")
  }

  /* ============== Lectura/Escritura con fallback ============== */
  async function getJson(relPath) {
    const lsKey = relPath;
    try {
      const full = `${driveBase()}/root:${G.folderPath}/${relPath}:/content`;
      const res = await gfetch(full, { method: "GET" });
      const txt = await res.text();
      const parsed = txt ? JSON.parse(txt) : [];
      lsSet(lsKey, parsed); // espejo local
      return Array.isArray(parsed) ? parsed : (parsed?.items || []);
    } catch (e) {
      console.warn("[GraphStore.getJson] Fallback local:", e.message || e);
      return lsGet(lsKey, []); // ← NO lanza
    }
  }

  async function putJson(relPath, obj) {
    const lsKey = relPath;
    // Primero guardamos local para no perder datos si Graph falla
    lsSet(lsKey, obj);

    try {
      await ensureFolder(G.folderPath);
      const full = `${driveBase()}/root:${G.folderPath}/${relPath}:/content`;
      await gfetch(full, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(obj ?? [], null, 2)
      });
      return true;
    } catch (e) {
      console.warn("[GraphStore.putJson] No se pudo guardar en Graph, datos quedan en localStorage:", e.message || e);
      return false; // ← NO lanza
    }
  }

  window.GraphStore = { getJson, putJson, ensureFolder };
})();
