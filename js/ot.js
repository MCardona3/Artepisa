// js/ot.js
(function(){
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const LS_KEY = "ots";
  let cache = [];           // OTs
  let clients = [];         // nombres para datalist
  let editingNum = null;    // #OT en edición (para detectar cambios)

  const today = () => new Date().toISOString().slice(0,10);
  const S = v => (v==null ? "" : String(v));

  // ---------- UI helpers ----------
  function showForm(show){
    const layout = $("#layout");
    if (!layout) return;
    if (show) {
      layout.classList.add("split"); // coincide con tu CSS (.split .card-form {display:block})
      setTimeout(()=> window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } else {
      layout.classList.remove("split");
    }
  }

  function updateCount(){
    const el = $("#ot-count");
    if (el) el.textContent = (cache || []).length;
  }

  // ---------- Datalist de clientes ----------
  function renderDatalist(){
    const dl = $("#dl-clientes"); if(!dl) return;
    dl.innerHTML = "";
    (clients || [])
      .map(c => S(c.Nombre ?? c.nombre ?? c.name))   // tolerante a claves
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,"es"))
      .forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        dl.appendChild(opt);
      });
  }

  // ---------- PARTIDAS ----------
  function newItemRow(item = {}){
    const row = document.createElement("div");
    row.className = "items-row";
    row.innerHTML = `
      <input class="i-cant" type="number" min="0" step="1" value="${S(item.cantidad || "")}" placeholder="0">
      <input class="i-desc" type="text" value="${S(item.descripcion || "")}" placeholder="Descripción de la pieza/servicio">
      <input class="i-plano" type="text" value="${S(item.plano || "")}" placeholder="Plano / ref.">
      <div>
        <input class="i-file" type="file" style="display:none" />
        <button class="btn ghost btn-file" type="button">📎 Adjuntar</button>
        <div class="muted-sm i-fn"></div>
      </div>
      <button class="btn danger btn-del" type="button">Eliminar</button>
    `;

    // Si venía adjunto, recupéralo
    if (item.adjunto && item.adjunto.data) {
      row.dataset.fileData = item.adjunto.data;
      row.dataset.fileName = item.adjunto.name || "adjunto";
      row.dataset.fileType = item.adjunto.type || "application/octet-stream";
      row.querySelector(".i-fn").textContent = row.dataset.fileName;
    }

    // Handlers
    const fileInput = row.querySelector(".i-file");
    row.querySelector(".btn-file")?.addEventListener("click", ()=> fileInput.click());
    fileInput?.addEventListener("change", async (e)=>{
      const f = e.target.files?.[0]; if(!f) return;
      if (f.size > 5 * 1024 * 1024) {
        if (!confirm("El archivo pesa más de 5MB. ¿Seguro que deseas incrustarlo en la OT?")) {
          e.target.value = ""; return;
        }
      }
      const reader = new FileReader();
      reader.onload = () => {
        row.dataset.fileData = reader.result;   // DataURL
        row.dataset.fileName = f.name;
        row.dataset.fileType = f.type || "application/octet-stream";
        row.querySelector(".i-fn").textContent = f.name;
      };
      reader.readAsDataURL(f);
    });

    row.querySelector(".btn-del")?.addEventListener("click", ()=> row.remove());
    return row;
  }
  function clearItems(){ const c = $("#items-container"); if (c) c.innerHTML = ""; }
  function addItem(item){ $("#items-container")?.appendChild(newItemRow(item)); }

  // ---------- Formulario ----------
  function toISO(d){ return (d || "").slice(0,10); }

  function readForm(){
    const items = $$("#items-container .items-row").map(row => {
      const cantidad = Number(row.querySelector(".i-cant").value) || 0;
      const descripcion = row.querySelector(".i-desc").value.trim();
      const plano = row.querySelector(".i-plano").value.trim();
      const data = row.dataset.fileData;
      const name = row.dataset.fileName;
      const type = row.dataset.fileType;
      const adjunto = data ? { name, type, data } : null;
      return { cantidad, descripcion, plano, adjunto };
    });

    return {
      num: Number($("#o-num").value) || null,
      cliente: $("#o-cliente").value.trim(),
      depto: $("#o-depto").value.trim() || "MAQUINADOS",
      encargado: $("#o-enc").value.trim(),
      emision: toISO($("#o-emision").value || today()),
      entrega: toISO($("#o-entrega").value || today()),
      oc: $("#o-oc").value.trim(),
      estatus: $("#o-est").value || "ABIERTA",
      prioridad: $("#o-prio").value || "NORMAL",
      descripcion: $("#o-desc").value.trim(),
      items
    };
  }

  function fillForm(o = {}){
    $("#o-num")?.value = o.num ?? "";
    $("#o-cliente")?.value = o.cliente ?? "";
    $("#o-depto")?.value = o.depto ?? "MAQUINADOS";
    $("#o-enc")?.value = o.encargado ?? "";
    $("#o-emision")?.value = toISO(o.emision || today());
    $("#o-entrega")?.value = toISO(o.entrega || today());
    $("#o-oc")?.value = o.oc ?? "";
    $("#o-est")?.value = o.estatus ?? "ABIERTA";
    $("#o-prio")?.value = o.prioridad ?? "NORMAL";
    $("#o-desc")?.value = o.descripcion ?? "";
    editingNum = o.num ?? null;

    clearItems();
    (o.items || []).forEach(addItem);
    if (!(o.items || []).length) addItem({});
    showForm(true);
  }

  function nextNum(){
    const nums = (cache || []).map(x => Number(x.num) || 0);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    return Number.isFinite(n) ? n : 1;
  }

  // ---------- Tabla ----------
  function compareByNumAsc(a,b){
    const av = Number(a.num) || 0, bv = Number(b.num) || 0;
    return av - bv || S(a.cliente).localeCompare(S(b.cliente),"es");
  }

  function render(q = ""){
    const tb = $("#o-tabla"); if (!tb) return;
    tb.innerHTML = "";
    const needle = (q || "").toLowerCase();
    const list = (cache || [])
      .filter(ot =>
        !needle ||
        String(ot.num ?? "").includes(needle) ||
        S(ot.cliente).toLowerCase().includes(needle)
      )
      .sort(compareByNumAsc);

    list.forEach(ot=>{
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${S(ot.num)}</td>` +
        `<td>${S(ot.cliente)}</td>` +
        `<td>${S(ot.depto)}</td>` +
        `<td>${S(ot.encargado)}</td>` +
        `<td>${S(ot.emision)}</td>` +
        `<td>${S(ot.entrega)}</td>` +
        `<td>${S(ot.oc)}</td>` +
        `<td>${S(ot.estatus)}</td>` +
        `<td>${S(ot.prioridad)}</td>` +
        `<td>
           <button class="btn ghost btn-edit">Editar</button>
           <button class="btn ghost btn-print">Imprimir</button>
           <button class="btn danger btn-del">Eliminar</button>
         </td>`;

      tr.querySelector(".btn-edit")?.addEventListener("click", ()=> fillForm(ot));
      tr.querySelector(".btn-print")?.addEventListener("click", ()=> openPrint(ot));
      tr.querySelector(".btn-del")?.addEventListener("click", async ()=>{
        if (!confirm(`¿Eliminar OT #${ot.num}?`)) return;
        cache = cache.filter(x => x.num !== ot.num);
        await save();
        render($("#o-buscar")?.value);
      });
      tb.appendChild(tr);
    });

    updateCount();
  }

  // ---------- Migración de llaves antiguas ----------
  function migrateKeys(x){
    if (!x) return x;
    if (x.enc !== undefined && x.encargado === undefined) x.encargado = x.enc;
    if (x.est !== undefined && x.estatus   === undefined) x.estatus   = x.est;
    if (x.prio!== undefined && x.prioridad === undefined) x.prioridad = x.prio;
    if (x.desc!== undefined && x.descripcion=== undefined) x.descripcion = x.desc;
    return x;
  }

  // ---------- Persistencia ----------
  async function load(){
    // Auth opcional (MSAL)
    try { if (window.MSALApp?.requireAuth) await MSALApp.requireAuth(); }
    catch(e){ console.warn("MSAL auth falló:", e); }

    // Clients (para datalist)
    try {
      const c = await ArtepisaData.loadCollection("clients");
      clients = Array.isArray(c) ? c : [];
    } catch(e) { clients = []; }
    renderDatalist();

    // OTs
    try {
      const data = await ArtepisaData.loadCollection("ots");
      cache = Array.isArray(data) ? data : [];

      // Fallback a localStorage si está vacío
      if (!cache.length) {
        cache = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      }

      // Migrar llaves antiguas → nuevas y persistir
      cache = cache.map(migrateKeys);
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
      try { await ArtepisaData.saveCollection("ots", cache); } catch(e){ /* ok si falla */ }

    } catch(e) {
      console.warn("load OTs (Graph) falló, uso localStorage:", e);
      cache = JSON.parse(localStorage.getItem(LS_KEY) || "[]").map(migrateKeys);
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
      try { await ArtepisaData.saveCollection("ots", cache); } catch(_) {}
    }

    render("");
    // Al entrar: SOLO LISTA
    showForm(false);
  }

  async function save(){
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
    updateCount();
    try { await ArtepisaData.saveCollection("ots", cache); }
    catch(e){ console.warn("save OTs (Graph) falló (local OK):", e); }
  }

  // ---------- Impresión ----------
  const escapeHTML = s => S(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  function buildPrintHTML(o){
    const rows = (o.items||[]).map((it)=>{
      const adj = it.adjunto?.data
        ? (it.adjunto.type?.startsWith("image/")
            ? `<div><img src="${it.adjunto.data}" style="max-width:160px;max-height:160px"></div>`
            : `<div>${escapeHTML(it.adjunto.name||"adjunto")}</div>`)
        : "";
      return `<tr>
        <td style="text-align:right">${escapeHTML(it.cantidad ?? "")}</td>
        <td>${escapeHTML(it.descripcion ?? "")}</td>
        <td>${escapeHTML(it.plano ?? "")}</td>
        <td>${adj}</td>
      </tr>`;
    }).join("");

    const logoURL = new URL("./img/arte.png?v=1", window.location.href).href;

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>OT #${escapeHTML(o.num)}</title>
      <style>
        body{font-family:Arial, sans-serif; padding:24px}
        h2{margin:0 0 8px}
        p{margin:6px 0}
        hr{margin:14px 0}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc;padding:6px;font-size:12px}
        th{background:#f3f4f6}
        .brand{display:flex;align-items:center;gap:12px;margin-bottom:12px}
        .brand img{width:56px;height:56px;object-fit:contain;border-radius:12px}
        .brand .title{font-weight:800;font-size:18px;letter-spacing:.2px}
        .brand .muted{color:#6b7280;font-size:13px}
      </style>
    </head>
    <body onload="window.print()">
      <div class="brand">
        <img src="${logoURL}" alt="ARTEPISA SLP">
        <div>
          <div class="title">ARTEPISA SLP</div>
          <div class="muted">Orden de Trabajo #${escapeHTML(o.num)}</div>
        </div>
      </div>

      <p><b>Cliente:</b> ${escapeHTML(o.cliente)} &nbsp; <b>Depto:</b> ${escapeHTML(o.depto)}</p>
      <p><b>Encargado:</b> ${escapeHTML(o.encargado)}</p>
      <p><b>Emisión:</b> ${escapeHTML(o.emision)} &nbsp; <b>Entrega:</b> ${escapeHTML(o.entrega)}</p>
      <p><b>Estatus:</b> ${escapeHTML(o.estatus)} &nbsp; <b>Prioridad:</b> ${escapeHTML(o.prioridad)}</p>
      <p><b>OC:</b> ${escapeHTML(o.oc || "")}</p>
      <p><b>Descripción:</b><br>${escapeHTML(o.descripcion || "")}</p>

      <h3>Partidas</h3>
      <table>
        <thead><tr><th>Cantidad</th><th>Descripción</th><th>Plano</th><th>Adjunto</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;opacity:.7">Sin partidas</td></tr>'}</tbody>
      </table>

      <hr><small>ARTEPISA SLP · Generado desde la aplicación de Órdenes de Trabajo</small>
    </body></html>`;
  }

  function openPrint(o){
    const html = buildPrintHTML(o);
    const w = window.open("", "_blank", "width=900,height=900");
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", async ()=>{
    await load();

    // Crear / Agregar (muestra form vacío)
    $("#btn-show-form")?.addEventListener("click", ()=>{
      fillForm({ items:[{}] });
      $("#o-cliente")?.focus();
    });

    // Cerrar formulario
    $("#o-cerrar")?.addEventListener("click", ()=> showForm(false));

    // Buscar
    $("#o-buscar")?.addEventListener("input", e=> render(e.target.value));

    // Partidas: agregar
    $("#btn-add-item")?.addEventListener("click", ()=> addItem({}));

    // Nuevo (limpia pero mantiene abierto)
    $("#o-nuevo")?.addEventListener("click", ()=> fillForm({ items:[{}] }));

    // Guardar
    $("#o-guardar")?.addEventListener("click", async ()=>{
      const o = readForm();
      if (!o.cliente) { alert("Cliente requerido"); $("#o-cliente")?.focus(); return; }

      // #OT autogenera
      if (!o.num) o.num = nextNum();

      // Si estoy editando y cambiaron el # a uno existente -> bloquear
      if (editingNum !== null && editingNum !== o.num) {
        if (cache.some(x => Number(x.num) === Number(o.num))) {
          alert(`El #OT ${o.num} ya existe. Usa otro número o deja el original (${editingNum}).`);
          $("#o-num")?.focus(); return;
        }
      }

      const idx = cache.findIndex(x => Number(x.num) === Number(o.num));
      if (idx >= 0) cache[idx] = o; else cache.push(o);

      await save();
      render($("#o-buscar")?.value);

      // Cierra panel y enfoca buscador
      showForm(false);
      $("#o-buscar")?.focus();

      alert(`OT guardada (#${o.num})`);
    });

    // Imprimir directo desde el formulario
    $("#o-imprimir")?.addEventListener("click", ()=>{
      const o = readForm();
      if (!o.num) { alert("Guarda la OT para imprimir."); return; }
      openPrint(o);
    });
  });
})();
