// js/clientes.js (versión mejorada + fix crear cliente)
(function () {
  const CFG = (window.ModuleConfig && window.ModuleConfig.clientes) || {};

  const $ = (s) => document.querySelector(s);
  let cache = [];
  let editingKey = null;
  const LS_KEY = (window.ModuleConfig?.clientes?.lsKey) || "clients";
  const mqlMobile = window.matchMedia("(max-width: 820px)");
  let paginaActual = 1;
  let filasPorPagina = (window.ModuleConfig?.clientes?.pageSize) || (window.AppConfig?.defaultPageSize) || 10;

  // --- Campos del formulario ---
  const fId = () => $("#c-id");
  const fNombre = () => $("#c-nombre");
  const fTelefono = () => $("#c-telefono");
  const fDir = () => $("#c-direccion");
  const fRFC = () => $("#c-rfc");
  const fEstado = () => $("#c-estado");
  const fCtoNom = () => $("#c-contacto");
  const fCtoTel = () => $("#c-contacto-tel");

  function setEditable(on = true) {
    [fId(), fNombre(), fTelefono(), fDir(), fRFC(), fEstado(), fCtoNom(), fCtoTel()].forEach((el) => {
      if (!el) return;
      el.readOnly = !on;
      el.disabled = false;
      el.classList.toggle("is-readonly", !on);
    });
  }

  // --- Contador global ---
  function broadcastCount() {
    try {
      const ev = new CustomEvent("clientes:count", { detail: { count: sanitizeCache(cache).length } });
      document.dispatchEvent(ev);
    } catch {}
  }

  // --- Vista móvil ---
  function showForm(show) {
    const layout = $("#layout");
    if (!layout) return;
    if (show) {
      layout.classList.add("form-only");
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } else {
      layout.classList.remove("form-only");
      updateMobileListVisibility();
      $("#c-buscar")?.focus();
    }
  }

  function updateMobileListVisibility() {
    const layout = $("#layout");
    if (!layout) return;
    const q = ($("#c-buscar")?.value || "").trim();
    if (mqlMobile.matches) {
      if (!q) layout.classList.add("mobile-hide-list");
      else layout.classList.remove("mobile-hide-list");
    } else layout.classList.remove("mobile-hide-list");
  }

  // --- Helpers ---
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }
  const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const S = (v) => (v == null ? "" : String(v));
  const onlyDigits = (s) => String(s ?? "").replace(/\D+/g, "");

  // --- Formateadores de teléfono ---
  const formatTen = (d) =>
    onlyDigits(d).length === 10 ? onlyDigits(d).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : onlyDigits(d);
  const formatPhonePair = (v) => {
    const d = onlyDigits(v);
    if (d.length === 10) return formatTen(d);
    if (d.length === 20) return `${formatTen(d.slice(0, 10))} / ${formatTen(d.slice(10))}`;
    return d;
  };

  // --- Sanitización ---
  function sanitizeCache(arr) {
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && typeof x === "object")
      .map((c) => ({
        IDCliente: S(c.IDCliente || c.idCliente || c.id || ""),
        Nombre: S(c.Nombre || c.nombre || ""),
        Telefono: S(c.Telefono || c.telefono || ""),
        Direccion: S(c.Direccion || c.direccion || ""),
        RFC: S(c.RFC || c.rfc || "").toUpperCase(),
        Estado: S(c.Estado || c.estado || ""),
        NombreCont: S(c.NombreCont || c.NombreContacto || c.contacto || ""),
        TelefonoCon: S(c.TelefonoCon || c.TelefonoContacto || c.contactoTel || "")
      }));
  }

  // --- Ordenamiento ---
  function idNumericValue(id) {
    const s = (id ?? "").toString().trim();
    if (!s) return Number.POSITIVE_INFINITY;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const m = s.match(/^C(\d+)$/i);
    if (m) return parseInt(m[1], 10);
    const digits = s.replace(/\D+/g, "");
    return digits ? parseInt(digits, 10) : Number.POSITIVE_INFINITY;
  }
  const compareByIdAsc = (a, b) =>
    idNumericValue(a.IDCliente) - idNumericValue(b.IDCliente) ||
    (a.Nombre ?? "").localeCompare(b.Nombre ?? "", "es", { sensitivity: "base" });

  // --- Columnas ---
  const COLUMNS = [
    { key: "IDCliente", label: "ID" },
    { key: "Nombre", label: "Nombre" },
    { key: "Telefono", label: "Teléfono", formatter: (v) => formatPhonePair(v) },
    { key: "Direccion", label: "Dirección" },
    { key: "RFC", label: "RFC" },
    { key: "Estado", label: "Estado" },
    { key: "NombreCont", label: "Contacto" },
    { key: "TelefonoCon", label: "Tel. Contacto", formatter: (v) => formatPhonePair(v) }
  ];

  // --- Paginación ---
  function renderPaginacion(list) {
    const pagDiv = $("#paginacion");
    if (!pagDiv) return;
    pagDiv.innerHTML = "";
    const totalPaginas = Math.ceil(list.length / filasPorPagina);
    if (totalPaginas <= 1) return;

    const mkBtn = (txt, p, dis) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.className = "page-btn";
      b.disabled = dis;
      if (!dis) b.onclick = () => ((paginaActual = p), render($("#c-buscar").value));
      if (p === paginaActual) b.classList.add("active");
      return b;
    };

    pagDiv.append(mkBtn("⟨", paginaActual - 1, paginaActual === 1));
    for (let i = 1; i <= totalPaginas; i++) pagDiv.append(mkBtn(i, i, false));
    pagDiv.append(mkBtn("⟩", paginaActual + 1, paginaActual === totalPaginas));
  }

  // --- Render tabla ---
  function render(q = "") {
    const tb = $("#c-tabla");
    tb.innerHTML = "";
    const needle = norm(q);
    const list = sanitizeCache(cache)
      .filter((c) =>
        !needle ||
        [c.Nombre, c.Direccion, c.RFC, c.Estado, c.NombreCont, c.IDCliente, c.Telefono, c.TelefonoCon]
          .some((v) => norm(v).includes(needle))
      )
      .sort(compareByIdAsc);

    const totalPag = Math.ceil(list.length / filasPorPagina);
    if (paginaActual > totalPag) paginaActual = totalPag || 1;
    const inicio = (paginaActual - 1) * filasPorPagina;
    const pageList = list.slice(inicio, inicio + filasPorPagina);

    if (!pageList.length) {
      tb.innerHTML = `<tr><td colspan="${COLUMNS.length + 1}" style="text-align:center;padding:18px;color:#666;">Sin clientes.</td></tr>`;
      renderPaginacion(list);
      broadcastCount();
      return;
    }

    for (const c of pageList) {
      const tr = document.createElement("tr");
      for (const col of COLUMNS) {
        const td = document.createElement("td");
        td.setAttribute("data-label", col.label);
        const val = col.formatter ? col.formatter(S(c[col.key])) : S(c[col.key]);
        td.textContent = val;
        td.title = val;
        tr.appendChild(td);
      }
      const tdAcc = document.createElement("td");
      tdAcc.innerHTML = `<button type="button" class="btn ghost btn-edit">Editar</button>`;
      tdAcc.querySelector("button").onclick = () => fillForm(c);
      tr.appendChild(tdAcc);
      tb.appendChild(tr);
    }
    renderPaginacion(list);
    broadcastCount();
  }

  // --- Función: llenar formulario (editar/crear) ---
  function fillForm(c) {
    editingKey = c?.IDCliente || null;
    fId().value = c?.IDCliente || "";
    fNombre().value = c?.Nombre || "";
    fTelefono().value = c?.Telefono || "";
    fDir().value = c?.Direccion || "";
    fRFC().value = c?.RFC || "";
    fEstado().value = c?.Estado || "";
    fCtoNom().value = c?.NombreCont || "";
    fCtoTel().value = c?.TelefonoCon || "";
    setEditable(true);
    showForm(true);
  }

  // --- Crear nuevo cliente ---
  function nuevoCliente() {
    editingKey = null;
    [fId(), fNombre(), fTelefono(), fDir(), fRFC(), fEstado(), fCtoNom(), fCtoTel()].forEach((el) => (el.value = ""));
    setEditable(true);
    showForm(true);
    fId().focus();
  }

  // --- Guardar cliente ---
  async function guardarCliente() {
    const c = {
      IDCliente: fId().value.trim(),
      Nombre: fNombre().value.trim(),
      Telefono: fTelefono().value.trim(),
      Direccion: fDir().value.trim(),
      RFC: fRFC().value.trim(),
      Estado: fEstado().value.trim(),
      NombreCont: fCtoNom().value.trim(),
      TelefonoCon: fCtoTel().value.trim()
    };
    const idx = cache.findIndex((x) => x.IDCliente === editingKey);
    if (idx >= 0) cache[idx] = c;
    else cache.push(c);
    await save();
    showForm(false);
    render("");
  }

  // --- Persistencia ---
  async function load() {
    try {
      const data = (window.ArtepisaData?.loadCollection)
        ? await ArtepisaData.loadCollection(CFG.collection || "clients")
        : null;
      cache = sanitizeCache(data);
      if (!cache.length)
        cache = sanitizeCache(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
      else localStorage.setItem(LS_KEY, JSON.stringify(cache));
    } catch {
      cache = sanitizeCache(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
    }
    render("");
    showForm(false);
    broadcastCount();
  }

  async function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(sanitizeCache(cache)));
    try {
      if (window.ArtepisaData?.saveCollection)
        await ArtepisaData.saveCollection("clients", sanitizeCache(cache));
    } catch (e) {
      console.warn("saveCollection falló (guardado local OK):", e);
    }
  }

  // --- Inicio ---
  
  // === Exportar / Importar / Limpiar ===
  function download(filename, text){
    const blob = new Blob([text], {type:"application/json;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function toJsonExport(arr){
    return JSON.stringify(arr, null, 2);
  }

  function detectEncodingAndDecode(buf){
    const encs = (window.AppConfig?.csvEncodings) || ["utf-8","iso-8859-1","windows-1252"];
    for (const enc of encs){
      try {
        const dec = new TextDecoder(enc, {fatal:false});
        const t = dec.decode(buf);
        // Heurística: preferir el que menos � contiene
        const rep = (t.match(/\uFFFD/g)||[]).length;
        if (rep < 2 || enc!=="utf-8") return t;
      } catch {}
    }
    return new TextDecoder("utf-8").decode(buf);
  }

  function parseCSV(text, delimiter){
    delimiter = delimiter || (CFG.importCSV?.delimiter) || ",";
    const rows = [];
    let i=0, field="", inQuotes=false, row=[];
    while(i<text.length){
      const c = text[i];
      if (c === '"'){
        if (inQuotes && text[i+1] === '"'){ field+='"'; i+=2; continue; }
        inQuotes = !inQuotes; i++; continue;
      }
      if (!inQuotes && (c === delimiter || c === "\n" || c === "\r")){
        if (c !== delimiter){ // end of row
          rows.push(row.concat(field)); row=[]; field=""; 
          // consume \r\n or \n
          if (c === "\r" && text[i+1]==="\n") i++;
          i++; continue;
        } else {
          row.push(field); field=""; i++; continue;
        }
      }
      field += c; i++;
    }
    if (field.length || row.length) rows.push(row.concat(field));
    return rows;
  }

  function rowsToObjects(rows, hasHeader){
    if (!rows.length) return [];
    let headers;
    if (hasHeader){
      headers = rows.shift().map(h => (h||"").trim().toLowerCase());
    } else {
      headers = rows[0].map((_,i)=>"col"+(i+1));
    }
    // normalización de claves
    const normalize = (CFG.importCSV?.normalizeKeys) || {};
    headers = headers.map(h => normalize[h] || h);
    return rows.filter(r => r.some(v => (v||"").trim()!==""))
      .map(r => Object.fromEntries(headers.map((h,idx)=>[h, (r[idx]||"").trim()])));
  }

  function attachImportExport(){
    const btnExp = document.getElementById("c-exportar");
    if (btnExp) btnExp.addEventListener("click", ()=>{
      download((CFG.fileName||"clients.json"), toJsonExport(cache));
    });
    const inputImp = document.getElementById("c-importar");
    if (inputImp) inputImp.addEventListener("change", async (e)=>{
      const f = e.target.files?.[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      const text = detectEncodingAndDecode(buf);
      let arr = [];
      if (/\.(csv|tsv)$/i.test(f.name) || /[,;\t]/.test(text.slice(0,200))){
        const delim = (CFG.importCSV?.delimiter) || ",";
        const rows = parseCSV(text, delim);
        arr = rowsToObjects(rows, (CFG.importCSV?.hasHeader)!==false);
      } else {
        try { arr = JSON.parse(text); } catch { alert("Archivo no reconocido. Usa JSON o CSV."); return; }
      }
      // fusionar con cache y guardar
      cache = sanitizeCache((cache||[]).concat(arr));
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
      try {
        await (window.ArtepisaData?.saveCollection?.(CFG.collection || "clients", cache));
        alert("Datos importados y guardados.");
      } catch {
        alert("Datos importados (guardados localmente). Conéctate para sincronizar.");
      }
      // refrescar vista
      render($("#c-buscar")?.value || "");
      document.dispatchEvent(new CustomEvent("clientes:count", {detail:{count: cache.length}}));
      e.target.value = "";
    });

    const btnReset = document.getElementById("c-reset");
    if (btnReset) btnReset.addEventListener("click", async ()=>{
      if (!confirm("¿Seguro que deseas borrar TODOS los clientes?")) return;
      cache = [];
      localStorage.setItem(LS_KEY, "[]");
      try { await (window.ArtepisaData?.saveCollection?.(CFG.collection || "clients", cache)); } catch {}
      render($("#c-buscar")?.value || "");
      document.dispatchEvent(new CustomEvent("clientes:count", {detail:{count: 0}}));
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await load();
    $("#c-buscar")?.addEventListener("input", debounce((e) => {
      paginaActual = 1;
      render(e.target.value);
    }, 200));
    $("#btn-nuevo")?.addEventListener("click", nuevoCliente);
    $("#btn-guardar")?.addEventListener("click", guardarCliente);
    attachImportExport();
  });
})();
