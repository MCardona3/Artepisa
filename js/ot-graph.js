// js/ot-graph.js — versión estable con normalización, reparación,
// datalist de clientes (clienteId) y validación estricta.
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

/* ================== Estado ================== */
let ETAG = "";
let LIST = [];
let editingIndex = -1;

let CLIENTS = [];                 // cache de clientes (de clientes.json)
const STRICT_CLIENT = true;       // exige que el cliente exista en la lista

/* ================== Helpers DOM ================== */
const $id = (id) => document.getElementById(id);
const elLayout   = () => $id("layout");
const elCardForm = () => $id("card-form");
const elTable    = () => $id("o-tabla");
const elBuscar   = () => $id("o-buscar");
const elCount    = () => $id("ot-count");

const btnShowForm = () => $id("btn-show-form");
const btnGuardar  = () => $id("o-guardar");
const btnNuevo    = () => $id("o-nuevo");
const btnCerrar   = () => $id("o-cerrar");
const btnImprimir = () => $id("o-imprimir");
const btnExport   = () => $id("o-export");
const btnImport   = () => $id("o-import");
const btnClear    = () => $id("o-clear");
const inputFile   = () => $id("o-file");

const fNum     = () => $id("o-num");
const fCliente = () => $id("o-cliente");
const fDepto   = () => $id("o-depto");
const fEnc     = () => $id("o-enc");
const fEmision = () => $id("o-emision");
const fEntrega = () => $id("o-entrega");
const fOC      = () => $id("o-oc");
const fEst     = () => $id("o-est");
const fPrio    = () => $id("o-prio");
const fDesc    = () => $id("o-desc");

const itemsBox   = () => $id("items-container");
const btnAddItem = () => $id("btn-add-item");

/* ===== Mostrar/ocultar formulario por modo =====
   - null       : lista por defecto (oculta form)
   - "form-only": solo formulario (lista oculta)
   - "split"    : lista + formulario */
function showForm(mode){
  const lay = elLayout(); if (!lay) return;
  lay.classList.remove("split", "form-only");
  if (mode === "split" || mode === "form-only") lay.classList.add(mode);
}

/* ================== Utilidades ================== */
const S = (v) => (v == null ? "" : String(v));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = (s) => { if(!s) return ""; const d = new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0,10); };
const fmtDateHuman = (s) => { if(!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString(undefined,{day:"2-digit",month:"2-digit",year:"numeric"}); };
const download = (name,text) => { const b=new Blob([text],{type:"application/octet-stream"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); };

/* ================== Normalización (llaves unificadas) ================== */
function unify(rec = {}) {
  return {
    num:         rec.num ?? "",
    // nombre visible del cliente y su id (si existe en clientes.json)
    cliente:     rec.cliente ?? "",
    clienteId:   rec.clienteId ?? rec.cliente_id ?? rec.idCliente ?? rec.IDCliente ?? "",
    depto:       rec.depto ?? "",
    encargado:   (rec.encargado ?? rec.enc ?? ""),
    emision:     rec.emision ?? "",
    entrega:     rec.entrega ?? "",
    oc:          rec.oc ?? "",
    estatus:     (rec.estatus ?? rec.est ?? ""),
    prioridad:   (rec.prioridad ?? rec.prio ?? ""),
    descripcion: (rec.descripcion ?? rec.desc ?? ""),
    items:       Array.isArray(rec.items) ? rec.items : []
  };
}

/* ---- Detectores simples ---- */
const isISO      = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const isOC       = (v) => /^\d{1,}$/.test(String(v || "")); // número simple
const isStatus   = (v) => ["ABIERTA","EN PROCESO","EN ESPERA","CERRADA"].includes(String(v || "").toUpperCase());
const isPriority = (v) => ["NORMAL","ALTA","URGENTE"].includes(String(v || "").toUpperCase());

/* ---- Repara registros “corridos” por versiones previas ---- */
function repairMisplaced(u) {
  let x = { ...u };
  let touched = false;

  // depto y encargado con fechas => mover a emision/entrega
  if (isISO(x.depto) && !isISO(x.emision))    { x.emision   = x.depto;      x.depto = "";      touched = true; }
  if (isISO(x.encargado) && !isISO(x.entrega)) { x.entrega   = x.encargado;  x.encargado = "";  touched = true; }

  // emision con OC / estatus / prioridad
  if (!x.oc && x.emision && !isISO(x.emision) && isOC(x.emision)) { x.oc        = x.emision;  x.emision = ""; touched = true; }
  if (!x.estatus   && isStatus(x.emision))                        { x.estatus   = x.emision;  x.emision = ""; touched = true; }
  if (!x.prioridad && isPriority(x.emision))                      { x.prioridad = x.emision;  x.emision = ""; touched = true; }

  // entrega con estatus / prioridad
  if (!x.estatus   && isStatus(x.entrega))                        { x.estatus   = x.entrega;  x.entrega = ""; touched = true; }
  if (!x.prioridad && isPriority(x.entrega))                      { x.prioridad = x.entrega;  x.entrega = ""; touched = true; }

  // oc con prioridad
  if (!x.prioridad && isPriority(x.oc))                           { x.prioridad = x.oc;       x.oc      = ""; touched = true; }

  return { fixed: touched, rec: x };
}

/* ================== CLIENTES (datalist + validación) ================== */
function unifyClient(c = {}) {
  return {
    id:     (c.id ?? c.ID ?? c.idCliente ?? c.IDCliente ?? "").toString(),
    nombre: (c.nombre ?? c.name ?? c.razon ?? c.razon_social ?? "").toString().trim(),
    rfc:    (c.rfc ?? "").toString(),
  };
}
function matchClientByName(txt){
  const q = (txt||"").toLowerCase().trim();
  if(!q) return null;
  return CLIENTS.find(c => c.nombre.toLowerCase() === q)
      || CLIENTS.find(c => c.nombre.toLowerCase().includes(q))
      || null;
}
async function loadClientesDatalist(){
  try{
    const { items } = await gs_getCollection("clients");
    CLIENTS = (Array.isArray(items) ? items : [])
      .map(unifyClient)
      .filter(c => c.nombre);
    const dl = document.getElementById("dl-clientes");
    if(!dl) return;
    dl.innerHTML = CLIENTS
      .map(c => `<option value="${c.nombre.replace(/"/g,'&quot;')}" label="${c.rfc ? `RFC: ${c.rfc}` : ""}"></option>`)
      .join("");
  }catch(_){
    // si no existe clientes.json, ignorar
  }
}
function enforceClientSelection(){
  const inp = fCliente();
  if(!inp) return;
  const hit = matchClientByName(inp.value);
  if(!hit){
    if (STRICT_CLIENT){
      alert("Selecciona un cliente de la lista guardada.");
      inp.value = "";
      inp.dataset.clientId = "";
      inp.focus();
    } else {
      inp.dataset.clientId = "";
    }
    return;
  }
  // normaliza nombre y guarda id en data-attr
  inp.value = hit.nombre;
  inp.dataset.clientId = hit.id || "";
}

/* ================== PARTIDAS ================== */
function clearItemsUI(){ if(itemsBox()) itemsBox().innerHTML=""; }
function addItemRow(item={cantidad:"",descripcion:"",plano:"",adjunto:""}){
  if(!itemsBox()) return;
  const row=document.createElement("div");
  row.className="items-row";
  row.innerHTML=`
    <input type="number" min="0" step="1" placeholder="0" value="${S(item.cantidad)}">
    <input placeholder="Descripción" value="${S(item.descripcion)}">
    <input placeholder="Plano" value="${S(item.plano)}">
    <input placeholder="Adjunto (base64)" value="${S(item.adjunto)}">
    <button class="btn small danger" type="button">Quitar</button>`;
  row.querySelector("button")?.addEventListener("click",()=>row.remove());
  itemsBox().appendChild(row);
}
function readItemsFromUI(){
  return Array.from(itemsBox()?.querySelectorAll(".items-row")||[]).map(r=>{
    const [q,d,p,a]=r.querySelectorAll("input");
    return { cantidad:q.value, descripcion:d.value, plano:p.value, adjunto:a.value };
  });
}

/* ================== FORM ================== */
function fillForm(data=null){
  const u = data ? unify(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  fNum()     && (fNum().value = u?.num ?? "");
  if (fCliente()){
    fCliente().value = u?.cliente ?? "";
    fCliente().dataset.clientId = u?.clienteId || "";
  }
  fDepto()   && (fDepto().value = u?.depto ?? "");
  fEnc()     && (fEnc().value = u?.encargado ?? "");
  fEmision() && (fEmision().value = fmtDate(u?.emision) || todayISO());
  fEntrega() && (fEntrega().value = fmtDate(u?.entrega) || todayISO());
  fOC()      && (fOC().value = u?.oc ?? "");
  fEst()     && (fEst().value = u?.estatus ?? "ABIERTA");
  fPrio()    && (fPrio().value = u?.prioridad ?? "NORMAL");
  fDesc()    && (fDesc().value = u?.descripcion ?? "");

  clearItemsUI();
  const items = (u?.items && u.items.length) ? u.items : [{}];
  items.forEach(addItemRow);
}

function readForm(){
  const inp = fCliente();
  const hit = matchClientByName(inp?.value || "");
  return {
    num:         fNum()?.value || undefined,
    clienteId:   hit?.id || (inp?.dataset.clientId || ""),
    cliente:     hit?.nombre || (inp?.value || "").trim(),
    depto:       fDepto()?.value || "",
    encargado:   fEnc()?.value || "",
    emision:     fEmision()?.value || "",
    entrega:     fEntrega()?.value || "",
    oc:          fOC()?.value || "",
    estatus:     fEst()?.value || "ABIERTA",
    prioridad:   fPrio()?.value || "NORMAL",
    descripcion: fDesc()?.value || "",
    items:       readItemsFromUI()
  };
}

/* ================== TABLA ================== */
function renderCount(){ if(elCount()) elCount().textContent = LIST.length; }

function renderList(){
  if(!elTable()) return;
  const q = (elBuscar()?.value || "").toLowerCase().trim();
  elTable().innerHTML = "";

  LIST.forEach((raw,i)=>{
    const x = unify(raw);

    const hay = [
      x.num, x.cliente, x.depto, x.encargado,
      fmtDate(x.emision), fmtDate(x.entrega),
      x.oc, x.estatus, x.prioridad, x.descripcion
    ].map(S).join(" ").toLowerCase();
    if(q && !hay.includes(q)) return;

    const tr = document.createElement("tr");
    // clamp-2 se aplica a un DIV interno, no al TD
    tr.innerHTML = `
      <td class="clip">${S(x.num)}</td>
      <td><div class="clamp-2">${S(x.cliente)}</div></td>
      <td><div class="clamp-2">${S(x.depto)}</div></td>
      <td><div class="clamp-2">${S(x.encargado)}</div></td>
      <td>${fmtDate(x.emision) || "—"}</td>
      <td>${fmtDate(x.entrega) || "—"}</td>
      <td>${S(x.oc)}</td>
      <td><span class="badge">${S(x.estatus) || "—"}</span></td>
      <td><span class="badge green">${S(x.prioridad) || "—"}</span></td>
      <td>
        <div class="table-actions">
          <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
          <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
        </div>
      </td>`;
    elTable().appendChild(tr);
  });
}

/* ================== Import / Export ================== */
function parseCSV(text){
  const sep = text.includes(";") && !text.includes(",") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const head = lines.shift().split(sep).map(s=>s.trim().toLowerCase());
  return lines.map(line=>{
    const cells=line.split(sep).map(s=>s.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    const o={}; head.forEach((h,i)=>o[h]=cells[i]??""); return o;
  });
}
const take=(o,...ks)=>{ for(const k of ks){ if(o[k]!=null && o[k]!="") return o[k]; } return ""; };

function normalizeOT(o){
  // normaliza claves a minúsculas sin acentos/espacios
  const norm={};
  for(const [k,v] of Object.entries(o||{})){
    const kk=k.toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g,"");
    norm[kk]=v;
  }
  // salida con llaves unificadas (incluye clienteId si viene)
  return {
    num:         take(norm,"num","numot","ot","folio","numero","#"),
    cliente:     take(norm,"cliente","nombre","name"),
    clienteId:   take(norm,"clienteid","idcliente","id","id_client","cliente_id"),
    depto:       take(norm,"depto","departamento","departamen"),
    encargado:   take(norm,"encargado","enc","responsable","jefe"),
    emision:     take(norm,"emision","fechaemision","fechaemi","fecha"),
    entrega:     take(norm,"entrega","fechaentrega","fechaentre"),
    oc:          take(norm,"oc","ordencompra","ordencompr","ordendecompra","ocnum"),
    estatus:     take(norm,"estatus","estado","est"),
    prioridad:   take(norm,"prioridad","prio"),
    descripcion: take(norm,"descripcion","desc","descripción"),
    items:       Array.isArray(o.items) ? o.items : []
  };
}

async function importFile(file){
  const buf = await file.arrayBuffer();
      const encs = (window.AppConfig?.csvEncodings) || ["utf-8","iso-8859-1","windows-1252"];
      let text;
      for (const e of encs){
        try{ text = new TextDecoder(e).decode(buf); if (text) break; } catch{}
      }
      if(!text) text = await file.text(); let arr=[];
  try{
    if(file.name.toLowerCase().endsWith(".json")){
      const j=JSON.parse(text);
      arr=Array.isArray(j)?j:(Array.isArray(j?.items)?j.items:[]);
    } else {
      arr=parseCSV(text);
    }
  }catch(e){ alert("Archivo inválido: "+e.message); return; }

  const recs=arr.map(normalizeOT).filter(x=> (x.cliente || x.descripcion));
  if(!recs.length){ alert("No se encontraron registros válidos."); return; }

  const idxByNum=new Map();
  LIST.forEach((x,i)=>{ if(x.num) idxByNum.set(String(x.num),i); });
  recs.forEach(r=>{
    const key=r.num?String(r.num):null;
    const fixed = repairMisplaced(unify(r)).rec;
    if(key && idxByNum.has(key)) LIST[idxByNum.get(key)]=fixed; else LIST.push(fixed);
  });

  try{ await save(); alert(`Importados ${recs.length} registro(s).`); }
  catch(e){
    if(String(e).includes("412")){ await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: "+e.message);
  }
}

function exportJSON(){ download("ordenes_trabajo.json", JSON.stringify(LIST.map(unify),null,2)); }
function exportCSV(){
  const cols=["num","cliente","clienteId","depto","encargado","emision","entrega","oc","estatus","prioridad","descripcion"];
  const rows=[cols.join(",")].concat(LIST.map(unify).map(x=>
    cols.map(k=>S(x[k]).replace(/"/g,'""')).map(s=>`"${s}"`).join(",")
  ));
  download("ordenes_trabajo.csv", rows.join("\n"));
}
async function clearAll(){ if(!confirm("¿Vaciar todas las Órdenes de Trabajo?")) return; LIST=[]; await save(); }

/* ================== Print ================== */
function buildPrintHTML(rec){
  const x = unify(rec);
  const logoURL = new URL("./img/arte.png?v=1", location.href).href;
  const items = Array.isArray(x.items) ? x.items : [];

  const rows = items.length
    ? items.map((it,i)=>`
        <tr>
          <td>${i+1}</td>
          <td style="text-align:right">${S(it.cantidad)}</td>
          <td>${S(it.descripcion)}</td>
          <td>${S(it.plano)}</td>
          <td>${it.adjunto ? "Sí" : ""}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#6b7280">Sin partidas</td></tr>`;

  // 👇 Evitamos template literal anidado
  const subtitulo = x.num ? ("· #" + S(x.num)) : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>OT ${S(x.num)} - Artepisa</title><style>
    @page { size: A4; margin: 16mm; } *{box-sizing:border-box}
    body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;color:#111827}
    .header{display:flex;align-items:center;gap:16px;margin-bottom:6px}.header img{height:56px}
    .brand{font-weight:800;font-size:20px;line-height:1.1}.muted{color:#6b7280}
    h1{font-size:18px;margin:6px 0 14px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12.5px;vertical-align:top}
    th{background:#f3f4f6;text-align:left}
  </style></head><body onload="window.print()">
    <div class="header">
      <img src="${logoURL}" alt="ARTEPISA SLP">
      <div>
        <div class="brand">ARTEPISA SLP</div>
        <div class="muted">Orden de Trabajo ${subtitulo}</div>
      </div>
    </div>
    <table>
      <tbody>
        <tr><th>Cliente</th><td>${S(x.cliente)}</td><th>Departamento</th><td>${S(x.depto)}</td></tr>
        <tr><th>Encargado</th><td>${S(x.encargado)}</td><th>Orden de Compra</th><td>${S(x.oc)}</td></tr>
        <tr><th>Emisión</th><td>${fmtDateHuman(x.emision)}</td><th>Entrega</th><td>${fmtDateHuman(x.entrega)}</td></tr>
        <tr><th>Estatus</th><td>${S(x.estatus)}</td><th>Prioridad</th><td>${S(x.prioridad)}</td></tr>
        <tr><th>Descripción</th><td colspan="3">${S(x.descripcion)}</td></tr>
      </tbody>
    </table>
    <h3>Partidas</h3>
    <table>
      <thead><tr><th>#</th><th style="text-align:right">Cant.</th><th>Descripción</th><th>Plano</th><th>Adjunto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
}
function printOT(rec){
  const html=buildPrintHTML(rec);
  const w=window.open("", "_blank", "width=900,height=900");
  w.document.open(); w.document.write(html); w.document.close();
}

/* ================== Persistencia ================== */
async function load(){
  try {
    const { etag, items } = await gs_getCollection("ot");
    ETAG = etag;
    LIST = Array.isArray(items) ? items : [];
  } catch(e) {
    console.error("Carga OT falló:", e);
    ETAG = ""; LIST = [];
  }

  // Reparar todo lo que venga “corrido” y persistir si cambió
  let changed = false;
  LIST = LIST.map(r => {
    const { fixed, rec } = repairMisplaced(unify(r));
    if (fixed) changed = true;
    return rec;
  });
  if (changed) {
    try { ETAG = await gs_putCollection("ot", LIST, ETAG); }
    catch(e){ console.warn("No se pudo guardar la reparación inicial:", e); }
  }

  renderCount();
  renderList();
  loadClientesDatalist(); // llena el datalist de clientes
}
async function save(){
  ETAG = await gs_putCollection("ot", LIST, ETAG);
  renderCount();
  renderList();
}

/* ================== Eventos ================== */
function on(node, ev, fn){ node && node.addEventListener(ev, fn); }
function mountEvents(){
  // Crear / Agregar -> SOLO formulario (lista oculta)
  on(btnShowForm(),"click",()=>{ fillForm(null); showForm("form-only"); elCardForm()?.scrollIntoView({behavior:"smooth",block:"start"}); });

  // Cerrar -> vuelve al listado
  on(btnCerrar(),"click",()=>{ showForm(null); window.scrollTo({top:0,behavior:"smooth"}); });

  // Nuevo -> SOLO formulario
  on(btnNuevo(),"click",()=>{ fillForm(null); showForm("form-only"); });

  // Cargar clientes al enfocar y validar selección
  on(fCliente(),"focus", ()=>{ if(!CLIENTS.length) loadClientesDatalist(); });
  on(fCliente(),"change", enforceClientSelection);
  on(fCliente(),"blur",   enforceClientSelection);

  // Partidas
  on(btnAddItem(),"click",()=> addItemRow());

  // Guardar (normaliza + repara antes de persistir)
  on(btnGuardar(),"click",async ()=>{
    // fuerza cliente válido si STRICT_CLIENT
    if(STRICT_CLIENT && !matchClientByName(fCliente()?.value||"")){
      alert("El cliente debe ser uno de la lista guardada.");
      fCliente()?.focus();
      return;
    }

    const raw = readForm();
    const normalized     = unify(raw);
    const { rec: fixed } = repairMisplaced(normalized);

    if(editingIndex >= 0) LIST[editingIndex] = fixed;
    else LIST.push(fixed);

    try{
      await save();
      alert("Guardado");
      showForm(null);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){
      alert("Error al guardar: " + e.message);
    }
  });

  // Buscar
  on(elBuscar(),"input",renderList);

  // Editar / Eliminar
  on(elTable(),"click",(e)=>{
    const btn=e.target.closest("button"); if(!btn) return;
    const i=Number(btn.getAttribute("data-i"));
    const act=btn.getAttribute("data-act");
    if(act==="edit"){
      fillForm(LIST[i]); showForm("form-only"); elCardForm()?.scrollIntoView({behavior:"smooth"});
    } else if(act==="del"){
      if(confirm("¿Eliminar la OT seleccionada?")){ LIST.splice(i,1); save().catch(err=>alert(err.message)); }
    }
  });

  // Imprimir, Importar/Exportar, Limpiar
  on(btnImprimir(),"click",()=>printOT(readForm()));
  on(btnImport(),"click",()=> inputFile()?.click());
  on(inputFile(),"change",(e)=>{ const file=e.target.files?.[0]; if(!file) return; importFile(file); e.target.value=""; });
  on(btnExport(),"click",()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click",clearAll);

  // Utilidad para reparar todo desde consola
  window.repararOTs = async function(){
    LIST = (Array.isArray(LIST) ? LIST : []).map(r => repairMisplaced(unify(r)).rec);
    await save();
    renderList();
    alert("Registros reparados.");
  };
}

/* ================== Init ================== */
(async function bootstrap(){
  try{ mountEvents(); await load(); }
  catch(e){ console.error("Init OT falló:",e); mountEvents(); }
})();
