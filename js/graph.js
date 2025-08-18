(function(){
  const G = window.GRAPH_STORAGE = {
    location: "drive", // "drive" para OneDrive personal
    folderPath: "/Documents/ArtepisaData" // Carpeta donde están los JSON
  };

  async function gfetch(path, opts = {}) {
    const token = await window.MSALApp.getToken();
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": opts.body && typeof opts.body !== "string"
        ? "application/json"
        : (opts.headers && opts.headers["Content-Type"]) || "application/json",
      ...opts.headers
    };

    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...opts,
      headers
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Graph ${res.status}: ${txt}`);
    }

    return res;
  }

  function driveBase() {
    return `/me/drive`; // Accede al OneDrive personal del usuario autenticado
  }

  async function ensureFolder(path) {
    const parts = path.split("/").filter(Boolean);
    let curr = "";
    for (const p of parts) {
      curr += `/${p}`;
      const check = await gfetch(`${driveBase()}/root:${curr}`, { method: "GET" }).catch(() => null);
      if (!check) {
        await gfetch(`${driveBase()}/root/children`, {
          method: "POST",
          body: JSON.stringify({
            name: p,
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail"
          })
        });
      }
    }
    return curr;
  }

  async function getJson(relPath) {
    const full = `${driveBase()}/root:${G.folderPath}/${relPath}:/content`;
    try {
      const res = await gfetch(full, {
        method: "GET",
        headers: { "Content-Type": "text/plain" }
      });
      const txt = await res.text();
      return txt ? JSON.parse(txt) : [];
    } catch (e) {
      console.warn("Archivo no encontrado o error de lectura:", e.message);
      return [];
    }
  }

  async function putJson(relPath, obj) {
    await ensureFolder(G.folderPath);
    const full = `${driveBase()}/root:${G.folderPath}/${relPath}:/content`;
    const body = JSON.stringify(obj, null, 2);
    await gfetch(full, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body
    });
    return true;
  }

  window.GraphStore = { getJson, putJson, ensureFolder };
})();
