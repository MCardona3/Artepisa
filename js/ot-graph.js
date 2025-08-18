// js/ot-graph.js – Órdenes de Trabajo con Import/Export/Clear + modos de vista
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

let ETAG = "";
let LIST = [];
let editingIndex = -1;

// ==== Helpers DOM ====
const $ = (id) => document.getElementById(id);

const elCount   = () => document.getElementById("ot-count");
const elTable   = () => document.getElementById("o-tabla");
const elBuscar  = () => document.getElementById("o-buscar");
const elLayout  = () => document.getElementById("layout");
const elCardForm= () => document.getElementById("card-form");

const btnShowForm = () => document.getElementById("btn-show-form");
const btnGuardar  = () => document.getElementById("o-guardar");
const btnNuevo    = () => document.getElementById("o-nuevo");
const btnCerrar   = () => document.getElementById("o-cerrar");
const btnImprimir = () => document.getElementById("o-imprimir");

// NUEVOS botones
const btnExport = () => document.getElementById("o-export");
const btnImport = () => document.getElementById("o-import");
const btnClear  = () => document.getElementById("o-clear");
const inputFile = () => document.getElementById("o-file");

// Campos form
const fNum     = () => document.getElementById("o-num");
const fCliente = () => document.getElementById("o-cliente");
const fDepto   = () => document.getElementById("o-depto");
const fEnc     = () => document.getElementById("o-enc");
const fEmision = () => document.getElementById("o-emision");
const fEntrega = () => document.getElementById("o-entrega");
const fOC      = () => document.getElementById("o-oc");
const fEst     = () => document.getElementById("o-est");
const fPrio    = () => document.getElementById("o-prio");
const fDesc    = () => document.getElementById("o-desc");

const itemsBox   = () => document.getElementById("items-container");
const btnAddItem = () => document.getElementById("btn-add-item");

// ==== Utils ====
const fmtDate = (s) => { if(!s) return ""; const d=new Date(s); return isNaN(d)?"":d.toISOString().slice(0,10); };
const download = (name, text) => {
  const blob = new Blob([text], {type:"application/octet-stream"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
};

// Cambiador de modo de layout: '', 'form-only', 'split'
function setMode(mode){
  const lay = elLayout();
  if (!lay) return;
  lay.classList.remove('form-only','split');
  if (mode) lay.classList.add(mode);
}

function renderCount(){ if (elCount()) elCount().textContent = LIST.length; }

function renderList(){
  if (!elTable()) return;
  const q = (elBuscar()?.value || "").toLowerCase().trim();
  elTable().innerHTML = "";
  LIST.forEach((x,i)=>{
    const hay = [
      x.num??"", x.cliente??"", x.depto??"", x.enc??"",
      fmtDate(x.emision), fmtDate(x.entrega), x.oc??"", x.est??"", x.prio??"", x.desc??""
    ].join(" ").toLowerCase();
    if (q && !hay.includes(q)) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${x.num ?? ""}</td>
      <td>${x.cliente ?? ""}</td>
      <td>${x.depto ?? ""}</td>
      <td>${x.enc ?? ""}</td>
      <td>${fmtDate(x.emision)}</td>
      <td>${fmtDate(x.entrega)}</td>
      <td>${x.oc ?? ""}</td>
      <td>${x.est ?? ""}</td>
      <td>${x.prio ?? ""}</td>
      <td>${x.desc ?? ""}</td>
      <td class="right table-actions">
        <button class="btn small" data-i="${i}" data-act="edit">Editar</button>
        <button class="btn small danger" data-i="${i}" data-act="del">Borrar</button>
      </td>`;
    elTable().appendChild(tr);
  });
}

function clearItemsUI(){ if (itemsBox()) itemsBox().innerHTML = ""; }
function addItemRow(item={cantidad:"", descripcion:"", plano:"", adjunto:""}){
  if (!itemsBox()) return;
  const row = document.createElement("div");
  row.className = "items-row";
  row.innerHTML = `
    <input type="number" min="0" step="1" placeholder="0" value="${item.cantidad ?? ""}">
    <input placeholder="Descripción" value="${item.descripcion ?? ""}">
    <input placeholder="Plano" value="${item.plano ?? ""}">
    <input placeholder="Adjunto (base64)" value="${item.adjunto ?? ""}">
    <button class="btn small danger" type="button">Quitar</button>`;
  row.querySelector("button").addEventListener("click", ()=> row.remove());
  itemsBox().appendChild(row);
}
function readItemsFromUI(){
  return Array.from(itemsBox()?.querySelectorAll(".items-row") || []).map(r=>{
    const [q,d,p,a] = r.querySelectorAll("input");
    return { cantidad:q.value, descripcion:d.value, plano:p.value, adjunto:a.value };
  });
}

function fillForm(data=null){
  editingIndex = data ? LIST.indexOf(data) : -1;
  (fNum()||{}).value     = data?.num ?? "";
  (fCliente()||{}).value = data?.cliente ?? "";
  (fDepto()||{}).value   = data?.depto ?? "";
  (fEnc()||{}).value     = data?.enc ?? "";
  (fEmision()||{}).value = fmtDate(data?.emision);
  (fEntrega()||{}).value = fmtDate(data?.entrega);
  (fOC()||{}).value      = data?.oc ?? "";
  (fEst()||{}).value     = data?.est ?? "ABIERTA";
  (fPrio()||{}).value    = data?.prio ?? "NORMAL";
  (fDesc()||{}).value    = data?.desc ?? "";
  clearItemsUI();
  (data?.items || []).forEach(addItemRow);
}
function readForm(){
  return {
    num: fNum()?.value || undefined,
    cliente: fCliente()?.value || "",
    depto: fDepto()?.value || "",
    enc: fEnc()?.value || "",
    emision: fEmision()?.value || "",
    entrega: fEntrega()?.value || "",
    oc: fOC()?.value || "",
    est: fEst()?.value || "ABIERTA",
    prio: fPrio()?.value || "NORMAL",
    desc: fDesc()?.value || "",
    items: readItemsFromUI()
  };
}

// ==== Graph IO ====
async function load(){
  const { etag, items } = await gs_getCollection("ot"); // ordenes_trabajo.json
  ETAG = etag; LIST = Array.isArray(items) ? items : [];
  renderCount(); renderList();
}
async function save(){
  ETAG = await gs_putCollection("ot", LIST, ETAG);
  renderCount(); renderList();
}

// ==== Import (.json / .csv) ====
function parseCSV(text){
  const sep = text.includes(";") && !text.includes(",") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  const head = lines.shift()?.split(sep).map(s=>s.trim().toLowerCase()) || [];
  return lines.map(line=>{
    const cells = line.split(sep).map(s=>s.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    const o={}; head.forEach((h,i)=> o[h] = cells[i] ?? ""); return o;
  });
}
const take = (o, ...ks)=> ks.find(k=> o[k]!==undefined) ? o[ks.find(k=>o[k]!==undefined)] : "";
function normalizeOT(o){
  return {
    num:     take(o,"num","#","ot","folio","numero"),
    cliente: take(o,"cliente","nombre","cliente_nombre"),
    depto:   take(o,"depto","departamento"),
    enc:     take(o,"enc","encargado","responsable","jefe"),
    emision: take(o,"emision","fecha_emision","fechaemision","fecha"),
    entrega: take(o,"entrega","fecha_entrega","fechaentrega"),
    oc:      take(o,"oc","ordencompra","orden_compra"),
    est:     take(o,"est","estatus","estado"),
    prio:    take(o,"prio","prioridad"),
    desc:    take(o,"desc","descripcion","descripción"),
    items:   Array.isArray(o.items) ? o.items : []
  };
}
async function importFile(file){
  const text = await file.text();
  let arr = [];
  try{
    if (file.name.toLowerCase().endsWith(".json")) {
      const j = JSON.parse(text);
      arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
    } else {
      arr = parseCSV(text);
    }
  }catch(e){ alert("Archivo inválido: " + e.message); return; }

  const recs = arr.map(normalizeOT).filter(x=> (x.cliente || x.desc));
  if (!recs.length) { alert("No se encontraron registros válidos."); return; }

  const idxByNum = new Map();
  LIST.forEach((x,i)=> { if (x.num) idxByNum.set(String(x.num), i); });
  recs.forEach(r=>{
    const key = r.num ? String(r.num) : null;
    if (key && idxByNum.has(key)) LIST[idxByNum.get(key)] = r;
    else LIST.push(r);
  });

  try { await save(); alert(`Importados ${recs.length} registro(s).`); }
  catch(e){
    if (String(e).includes("412")) { await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: " + e.message);
  }
}

// ==== Export / Clear ====
function exportJSON(){ download("ordenes_trabajo.json", JSON.stringify(LIST, null, 2)); }
function exportCSV(){
  const cols = ["num","cliente","depto","enc","emision","entrega","oc","est","prio","desc"];
  const rows = [cols.join(",")].concat(
    LIST.map(x => cols.map(k => (x[k] ?? "").toString().replace(/"/g,'""'))
                     .map(s=>`"${s}"`).join(","))
  );
  download("ordenes_trabajo.csv", rows.join("\n"));
}
async function clearAll(){
  if (!confirm("¿Vaciar todas las Órdenes de Trabajo?")) return;
  LIST = []; await save();
}

// ==== Eventos UI ====
function mountEvents(){
  // CREAR / AGREGAR → solo formulario
  btnShowForm()?.addEventListener("click", ()=>{
    fillForm(null);
    setMode('form-only');
    elCardForm()?.scrollIntoView({behavior:"smooth", block:"start"});
  });

  // CERRAR → volver a lista
  btnCerrar()?.addEventListener("click", ()=>{
    setMode('');
    window.scrollTo({top:0, behavior:"smooth"});
  });

  // NUEVO (si lo usas) → solo formulario
  btnNuevo()?.addEventListener("click", ()=>{
    fillForm(null);
    setMode('form-only');
  });

  btnAddItem()?.addEventListener("click", ()=> addItemRow());

  // GUARDAR → guardar y volver a lista
  btnGuardar()?.addEventListener("click", async ()=>{
    const rec = readForm();
    if (editingIndex >= 0) LIST[editingIndex] = rec; else LIST.push(rec);
    try {
      await save();
      alert("Guardado");
      setMode('');
      window.scrollTo({top:0, behavior:"smooth"});
    } catch(e){ alert("Error al guardar: " + e.message); }
  });

  elBuscar()?.addEventListener("input", renderList);

  // EDITAR → modo split (lista + form)
  elTable()?.addEventListener("click", (e)=>{
    const btn = e.target.closest("button"); if (!btn) return;
    const i = Number(btn.getAttribute("data-i"));
    const act = btn.getAttribute("data-act");
    if (act === "edit") {
      fillForm(LIST[i]);
      setMode('split');
      elCardForm()?.scrollIntoView({behavior:"smooth"});
    } else if (act === "del") {
      if (confirm("¿Eliminar la OT seleccionada?")) {
        LIST.splice(i,1);
        save().catch(err=>alert(err.message));
      }
    }
  });

  // Importar
  btnImport()?.addEventListener("click", ()=> inputFile()?.click());
  inputFile()?.addEventListener("change", (e)=>{
    const file = e.target.files?.[0]; if (!file) return;
    importFile(file); e.target.value = "";
  });

  // Exportar
  btnExport()?.addEventListener("click", ()=>{
    const pick = confirm("Aceptar = JSON  |  Cancelar = CSV");
    if (pick) exportJSON(); else exportCSV();
  });

  // Limpiar
  btnClear()?.addEventListener("click", clearAll);
}

// ==== Bootstrap ====
document.addEventListener("DOMContentLoaded", ()=>{
  const hasGetter = (window.MSALApp && typeof MSALApp?.getToken === "function") || (typeof window.getToken === "function");
  if (!hasGetter) { setTimeout(()=> location.href="login.html", 200); return; }
  mountEvents();
  load().catch(err => { console.error(err); alert("Error cargando OT: " + err.message); });
});
