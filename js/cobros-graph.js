// js/cobros-graph.js — UI de Cobros (usa cobros-store.js + graph-store.js)
"use strict";
import { listCobros, upsertCobro, deleteCobro, unifyCobro } from "./cobros-store.js";
import { gs_getCollection } from "./graph-store.js";

/* ====== Estado ====== */
let LIST = [];          // cobros normalizados (unifyCobro)
let editingIndex = -1;  // índice en LIST que se está editando
let FILTER_OT = "";     // si viene ?ot=XXX

/* ====== Helpers DOM ====== */
const $id = id => document.getElementById(id);
const elLayout   = () => $id("layout");
const elCardList = () => $id("card-list");
const elCardForm = () => $id("card-form");

const elTable  = () => $id("cob-tabla");
const elBuscar = () => $id("cob-buscar");
const elCount  = () => $id("cob-count");
const elResumen= () => $id("cob-resumen");

const btnCreate  = () => $id("btn-show-form");
const btnGuardar = () => $id("cob-guardar");
const btnNuevo   = () => $id("cob-nuevo");
const btnCerrar  = () => $id("cob-cerrar");
const btnExport  = () => $id("cob-export");
const btnImport  = () => $id("cob-import");
const btnClear   = () => $id("cob-clear");
const inputFile  = () => $id("cob-file");

const fId     = () => $id("f-id"); // opcional invisible (no lo usamos en HTML)
const fOT     = () => $id("f-ot");
const fCliente= () => $id("f-cliente");
const fConcept= () => $id("f-concepto");
const fMonto  = () => $id("f-monto");
const fMoneda = () => $id("f-moneda");
const fFactura= () => $id("f-factura");
const fTipo   = () => $id("f-tipo");
const fPorc   = () => $id("f-porc");
const fEstado = () => $id("f-estado");
const fEmision= () => $id("f-emision");
const fCobro  = () => $id("f-cobro");
const fPerIni = () => $id("f-per-ini");
const fPerFin = () => $id("f-per-fin");
const fMetodo = () => $id("f-metodo");
const fRef    = () => $id("f-ref");
const fNotas  = () => $id("f-notas");

/* ====== Utils ====== */
const S=v=>(v==null?"":String(v));
const N=v=>{ const n=Number(v); return Number.isFinite(n)?n:0; };
const fmtMoney = (n, ccy="MXN") => Number(n).toLocaleString(undefined, { style:"currency", currency: ccy });
const fmtDate  = s => { if(!s) return ""; const d=new Date(s); return isNaN(d)? "": d.toLocaleDateString(); };

function showForm(show){
  const lay = elLayout();
  if (lay) lay.classList.toggle("form-only", !!show);
  if (elCardForm()) elCardForm().style.display = show ? "" : "none";
  if (elCardList()) elCardList().style.display = show ? "none" : "";
  if (show) elCardForm()?.scrollIntoView({behavior:"smooth", block:"start"});
}

function on(node, ev, fn){ node && node.addEventListener(ev, fn); }

/* ====== Carga de OTs para datalist y autofill cliente ====== */
let OT_MAP = new Map(); // num -> { cliente, ... }
async function loadOTsToDatalist(){
  try{
    const { items } = await gs_getCollection("ot");
    const arr = Array.isArray(items) ? items : [];
    OT_MAP = new Map();
    const opts = [];
    for(const raw of arr){
      const num = S(raw.num||"").trim();
      const cli = S(raw.cliente||"").trim();
      if(!num) continue;
      OT_MAP.set(num, { cliente: cli });
      opts.push(`<option value="${num}">${cli ? (" - " + cli.replace(/"/g,'&quot;')) : ""}</option>`);
    }
    const dl = document.getElementById("dl-ots");
    if (dl) dl.innerHTML = opts.join("");
  }catch(_){ /* sin OTs no pasa nada */ }
}

/* ====== Form ====== */
function fillForm(data=null){
  const u = data ? unifyCobro(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  fOT().value       = u?.ot || FILTER_OT || "";
  fCliente().value  = u?.cliente || (OT_MAP.get(S(fOT().value))?.cliente || "");
  fConcept().value  = u?.concepto || "";
  fMonto().value    = u?.monto ?? "";
  fMoneda().value   = u?.moneda || "MXN";
  fFactura().value  = u?.factura || "";
  fTipo().value     = u?.tipo || "PARCIAL";
  fPorc().value     = u?.porcentaje ?? "";
  fEstado().value   = u?.estado || "PENDIENTE";
  fEmision().value  = u?.fechaEmision || "";
  fCobro().value    = u?.fechaCobro || "";
  fPerIni().value   = u?.periodo?.ini || "";
  fPerFin().value   = u?.periodo?.fin || "";
  fMetodo().value   = u?.metodo || "";
  fRef().value      = u?.referencia || "";
  fNotas().value    = u?.notas || "";
}

function readForm(){
  const rec = unifyCobro({
    id:        editingIndex >= 0 ? LIST[editingIndex]?.id : undefined,
    ot:        fOT().value,
    cliente:   fCliente().value || (OT_MAP.get(S(fOT().value))?.cliente || ""),
    concepto:  fConcept().value,
    monto:     N(fMonto().value),
    moneda:    fMoneda().value,
    factura:   fFactura().value,
    tipo:      fTipo().value,
    porcentaje:fPorc().value ? N(fPorc().value) : null,
    estado:    fEstado().value,
    fechaEmision:fEmision().value,
    fechaCobro:  fCobro().value,
    periodo:   { ini: fPerIni().value, fin: fPerFin().value },
    metodo:    fMetodo().value,
    referencia:fRef().value,
    notas:     fNotas().value
  });
  return rec;
}

/* ====== Render ====== */
function renderCount(){ if(elCount()) elCount().textContent = LIST.length; }

function renderResumen(){
  const box = elResumen();
  if(!box) return;
  const arr = LIST;
  if(!arr.length){ box.style.display="none"; box.textContent=""; return; }
  const total = arr.reduce((s,x)=> s + N(x.monto), 0);
  const cobrados = arr.filter(x=>x.estado==="COBRADO").reduce((s,x)=> s + N(x.monto), 0);
  const pendientes = arr.filter(x=>x.estado!=="COBRADO" && x.estado!=="CANCELADO").reduce((s,x)=> s + N(x.monto), 0);
  const ccy = arr[0]?.moneda || "MXN";
  box.style.display = "";
  box.innerHTML = `Total: <b>${fmtMoney(total, ccy)}</b> · Cobrados: <b>${fmtMoney(cobrados, ccy)}</b> · Pendientes: <b>${fmtMoney(pendientes, ccy)}</b>`;
}

function renderList(){
  if(!elTable()) return;
  const q = (elBuscar()?.value || "").toLowerCase().trim();
  elTable().innerHTML = "";

  const list = (LIST || []).filter(x=>{
    if(!q) return true;
    const hay = [x.id,x.ot,x.cliente,x.concepto,x.factura,x.estado,x.tipo].join(" ").toLowerCase();
    return hay.includes(q);
  });

  list.forEach((x,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${S(x.id)}</td>
      <td>${S(x.ot)}</td>
      <td class="clamp-2">${S(x.cliente)}</td>
      <td class="clamp-2">${S(x.concepto)}</td>
      <td style="text-align:right">${fmtMoney(N(x.monto), x.moneda||"MXN")}</td>
      <td>${S(x.factura)}</td>
      <td><span class="badge">${S(x.tipo)}</span></td>
      <td><span class="badge">${S(x.estado)}</span></td>
      <td>${fmtDate(x.fechaEmision)}</td>
      <td>${fmtDate(x.fechaCobro)}</td>
      <td>
        <div class="table-actions">
          <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
          <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
        </div>
      </td>`;
    elTable().appendChild(tr);
  });

  renderCount();
  renderResumen();
}

/* ====== Import / Export ====== */
function parseCSV(text){
  const sep = text.includes("\t") ? "\t" : (text.includes(";") && !text.includes(",") ? ";" : ",");
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const head = lines.shift().split(sep).map(s=>s.trim().toLowerCase());
  return lines.map(line=>{
    const cells=line.split(sep).map(s=>s.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    const o={}; head.forEach((h,i)=>o[h]=cells[i]??""); return o;
  });
}
const take=(o,...ks)=>{ for(const k of ks){ if(o[k]!=null && o[k]!="") return o[k]; } return ""; };

function normalizeImported(o){
  // llaves tolerantes
  const norm={};
  for(const [k,v] of Object.entries(o||{})){
    const kk=k.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+|_/g,"");
    norm[kk]=v;
  }
  return unifyCobro({
    id:         take(norm,"id"),
    ot:         take(norm,"ot","orden","numot","otnum"),
    cliente:    take(norm,"cliente"),
    concepto:   take(norm,"concepto","desc","descripcion"),
    monto:      take(norm,"monto","importe","total"),
    moneda:     take(norm,"moneda","currency"),
    factura:    take(norm,"factura","foliofactura"),
    tipo:       take(norm,"tipo"),
    porcentaje: take(norm,"porcentaje","pct"),
    estado:     take(norm,"estado","estatus"),
    fechaEmision: take(norm,"fechaemision","emision","fechaemi"),
    fechaCobro:   take(norm,"fechacobro","cobro"),
    periodo:    { ini: take(norm,"periodoini","ini"), fin: take(norm,"periodofin","fin") },
    metodo:     take(norm,"metodo","forma"),
    referencia: take(norm,"referencia","ref"),
    notas:      take(norm,"notas","obs","observaciones")
  });
}

function download(name,text){
  const b=new Blob([text],{type:"application/octet-stream"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}
function exportJSON(){ download("cobros.json", JSON.stringify(LIST,null,2)); }
function exportCSV(){
  const cols=["id","ot","cliente","concepto","monto","moneda","factura","tipo","porcentaje","estado","fechaEmision","fechaCobro","perIni","perFin","metodo","referencia","notas"];
  const rows=[cols.join(",")].concat(LIST.map(x=>{
    const vals = [
      x.id,x.ot,x.cliente,x.concepto,x.monto,x.moneda,x.factura,x.tipo,(x.porcentaje??""),x.estado,x.fechaEmision,x.fechaCobro,(x.periodo?.ini||""),(x.periodo?.fin||""),x.metodo,x.referencia,x.notas
    ].map(v=> String(v??"").replace(/"/g,'""'));
    return `"${vals.join('","')}"`;
  }));
  download("cobros.csv", rows.join("\n"));
}

/* ====== Eventos ====== */
function mountEvents(){
  on(btnCreate(),"click",()=>{ fillForm(null); showForm(true); fOT()?.focus(); });
  on(btnCerrar(),"click",()=>{ showForm(false); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNuevo(),"click",()=>{ fillForm(null); showForm(true); });

  // Guardar
  on(btnGuardar(),"click", async ()=>{
    const rec = readForm();
    if(!rec.ot){ alert("La OT es obligatoria."); fOT()?.focus(); return; }
    if(!rec.concepto){ alert("El CONCEPTO es obligatorio."); fConcept()?.focus(); return; }
    if(!rec.monto || rec.monto<=0){ alert("El MONTO debe ser mayor a 0."); fMonto()?.focus(); return; }

    try{
      const saved = await upsertCobro(rec);
      // refrescar LIST en memoria
      if (editingIndex>=0) LIST[editingIndex]=saved;
      else LIST.push(saved);

      alert("Guardado");
      showForm(false);
      window.scrollTo({top:0,behavior:"smooth"});
      renderList();
    }catch(e){
      alert("Error al guardar: " + e.message);
    }
  });

  // Buscar
  on(elBuscar(),"input", renderList);

  // Editar / Eliminar desde la tabla
  on(elTable(),"click",(e)=>{
    const btn = e.target.closest("button"); if(!btn) return;
    const i = Number(btn.getAttribute("data-i"));
    const act = btn.getAttribute("data-act");
    if(act==="edit"){ fillForm(LIST[i]); showForm(true); editingIndex=i; }
    else if(act==="del"){
      const row = LIST[i];
      if(!row) return;
      if(confirm("¿Eliminar este cobro?")){
        deleteCobro(row.id).then(()=>{
          LIST.splice(i,1);
          renderList();
        }).catch(err=>alert("No se pudo eliminar: "+err.message));
      }
    }
  });

  // Importar / Exportar / Limpiar
  on(btnImport(),"click",()=> inputFile()?.click());
  on(inputFile(),"change", async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const buf = await file.arrayBuffer();
    const encs = (window.AppConfig?.csvEncodings) || ["utf-8","iso-8859-1","windows-1252"];
    let text;
    for (const e of encs){
      try{ text = new TextDecoder(e).decode(buf); if (text) break; } catch{}
    }
    if(!text) text = await file.text();
    let arr=[];
    try{
      if(file.name.toLowerCase().endsWith(".json")){
        const j=JSON.parse(text);
        arr = Array.isArray(j) ? j : (Array.isArray(j?.items)? j.items : []);
      }else{
        arr = parseCSV(text);
      }
    }catch(ex){ alert("Archivo inválido: "+ex.message); e.target.value=""; return; }

    const recs = arr.map(normalizeImported).filter(x=> x.ot && x.concepto && x.monto>0);
    if(!recs.length){ alert("No se encontraron cobros válidos."); e.target.value=""; return; }

    // Insertar/actualizar uno por uno
    try{
      for(const r of recs){ await upsertCobro(r); }
      await loadData(); // refresca LIST desde servidor
      alert(`Importados/actualizados ${recs.length} cobro(s).`);
    }catch(ex){ alert("Error al importar: "+ex.message); }
    e.target.value="";
  });

  on(btnExport(),"click",()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });

  on(btnClear(),"click", async ()=>{
    if(!confirm("¿Vaciar TODOS los cobros? Esto no se puede deshacer.")) return;
    try{
      // Borrar rápido: reescribir colección vacía
      const { etag } = await gs_getCollection("cobros");
      await gs_putCollection("cobros", [], etag);
      LIST = [];
      renderList();
    }catch(ex){ alert("No se pudo vaciar: "+ex.message); }
  });

  // Autofill de cliente al elegir OT
  on(fOT(),"input", ()=>{
    const o = OT_MAP.get(S(fOT().value));
    fCliente().value = o?.cliente || "";
  });

  // Quitar filtro ?ot=...
  on($id("btn-clear-filter"), "click", ()=>{
    const url = new URL(location.href);
    url.searchParams.delete("ot");
    location.href = url.toString();
  });
}

/* ====== Carga inicial ====== */
async function loadData(){
  LIST = await listCobros(FILTER_OT);
  LIST = Array.isArray(LIST) ? LIST.map(unifyCobro) : [];
  renderList();
}

(function readFilterFromURL(){
  const p = new URLSearchParams(location.search);
  FILTER_OT = S(p.get("ot"));
  const wrap = document.getElementById("filter-ot");
  const val  = document.getElementById("filter-ot-value");
  if(FILTER_OT && wrap && val){
    wrap.style.display = "";
    val.textContent = FILTER_OT;
  }
})();

(async function bootstrap(){
  try{
    mountEvents();
    await loadOTsToDatalist();
    await loadData();
  }catch(e){
    console.error("Init Cobros falló:", e);
    mountEvents();
  }
})();
