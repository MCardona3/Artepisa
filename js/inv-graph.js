// js/inv-graph.js — Inventario (OneDrive/SharePoint) — estable con "# Parte" en UI y "parte" en datos
"use strict";

// === Config / helpers ===
const CFG_INV = (window.ModuleConfig && window.ModuleConfig.inventario) || {};
function firstByIds(ids){
  for(const id of (ids||[])){
    const el=document.getElementById(id);
    if (el) return el;
  }
  return null;
}

import { gs_getCollection, gs_putCollection } from "./graph-store.js";

/* ============== Estado ============== */
let ETAG = "";
let LIST = [];          // [{parte, descripcion, unidad, stock, minimo, ubicacion, proveedor, esCliente, estado}]
let editingIndex = -1;

/* ============== Helpers DOM ============== */
const $id = id => document.getElementById(id);

// Layout / tarjetas
const elLayout   = () => $id("layout");
const elCardList = () => $id("card-list");
const elCardForm = () => $id("card-form");

// Tabla / buscador / contador
const elTable  = () => $id("inv-tabla");
const elBuscar = () => $id("inv-buscar");
const elCount  = () => $id("inv-count");

// Botones
const btnCreate  = () => $id("btn-show-form") || $id("btn-create");
const btnGuardar = () => $id("inv-guardar");
const btnNuevo   = () => $id("inv-nuevo");
const btnCerrar  = () => $id("inv-cerrar");
const btnExport  = () => $id("inv-export");
const btnImport  = () => $id("inv-import");
const btnClear   = () => $id("inv-clear");
const inputFile  = () => $id("inv-file");

// Campos (acepta tanto f-parte como f-sku por compatibilidad)
const fParte = () => $id("f-parte") || $id("f-sku") || $id("i-sku");
const fDesc = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.desc) || ["f-nombre","i-desc"])|| $id("i-desc");
const fUni = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.uni) || ["f-un","i-uni"])     || $id("i-uni");
const fStock = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.stock) || ["f-stock","i-stock"])  || $id("i-stock");
const fMin = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.min) || ["f-min","i-min"])    || $id("i-min");
const fUbi = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.ubi) || ["f-ubi","i-ubi"])    || $id("i-ubi");
const fProv = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.prov) || ["f-prov","i-prov"])   || $id("i-prov");
const fEst = () => firstByIds((CFG_INV.fieldIds && CFG_INV.fieldIds.est) || ["f-estado","i-estado"]) || $id("i-estado");
const fEsCli = () => $id("f-escliente") || $id("i-escliente"); // NUEVO

/* ============== Utiles ============== */
const S=v=>(v==null?"":String(v));
const N=v=>{ const n=Number(v); return Number.isFinite(n)?n:0; };
const toBool = (v) => { const s = String(v ?? "").trim().toLowerCase(); return ["si","sí","true","1","x","yes"].includes(s); };

/* Listado ↔ Formulario */
function showForm(show){
  const lay = elLayout();
  if (lay) lay.classList.toggle("form-only", !!show);
  if (elCardForm()) elCardForm().style.display = show ? "" : "none";
  if (elCardList()) elCardList().style.display = show ? "none" : "";
  if (show) elCardForm()?.scrollIntoView({behavior:"smooth", block:"start"});
}

/* ============== Normalización (canon: 'parte') ============== */
function unify(rec = {}){
  return {
    // lee parte, sku o "#Parte" pero normaliza a 'parte'
    parte:      S(rec.parte ?? rec.sku ?? rec["#Parte"] ?? rec["#parte"]).trim(),
    descripcion:S(rec.descripcion).trim(),
    unidad:     S(rec.unidad).trim(),
    stock:      N(rec.stock),
    minimo:     N(rec.minimo ?? rec.min),
    ubicacion:  S(rec.ubicacion).trim(),
    proveedor:  S(rec.proveedor).trim(),
    esCliente:  !!(rec.esCliente ?? rec.escliente ?? rec.materialCliente ?? rec.materialcliente), // NUEVO
    estado:     S(rec.estado || "ACTIVO").trim(),
  };
}

/* ============== Form ============== */
function fillForm(data=null){
  const u = data ? unify(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  fParte() && (fParte().value = u?.parte || "");
  fDesc()  && (fDesc().value  = u?.descripcion || "");
  fUni()   && (fUni().value   = u?.unidad || "pza");
  fStock() && (fStock().value = u?.stock ?? 0);
  fMin()   && (fMin().value   = u?.minimo ?? 0);
  fUbi()   && (fUbi().value   = u?.ubicacion || "");
  fProv()  && (fProv().value  = u?.proveedor || "");
  fEst()   && (fEst().value   = u?.estado || "ACTIVO");
  if (fEsCli()) fEsCli().checked = !!u?.esCliente; // NUEVO
}

function readForm(){
  return unify({
    parte:      fParte()?.value,
    descripcion:fDesc()?.value,
    unidad:     fUni()?.value,
    stock:      fStock()?.value,
    minimo:     fMin()?.value,
    ubicacion:  fUbi()?.value,
    proveedor:  fProv()?.value,
    esCliente:  fEsCli()?.checked,     // NUEVO
    estado:     fEst()?.value,
  });
}

/* ============== Render ============== */
function renderCount(){ if(elCount()) elCount().textContent = LIST.length; }

function renderList(){
  if(!elTable()) return;
  const q = (elBuscar()?.value || "").toLowerCase().trim();
  elTable().innerHTML = "";

  const list = (LIST || [])
    .map(unify)
    .filter(x=>{
      if(!q) return true;
      const hay = [
        x.parte, x.descripcion, x.unidad, x.ubicacion, x.proveedor, x.estado,
        (x.esCliente ? "cliente si" : "cliente no")
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });

  list.forEach((x,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${S(x.parte)}</td>
      <td class="clamp-2">${S(x.descripcion)}</td>
      <td>${S(x.unidad)}</td>
      <td style="text-align:right">${N(x.stock)}</td>
      <td style="text-align:right">${N(x.minimo)}</td>
      <td>${S(x.ubicacion)}</td>
      <td>${S(x.proveedor)}</td>
      <td style="text-align:center">${x.esCliente ? "Sí" : "No"}</td>  <!-- NUEVA -->
      <td>${S(x.estado) || "ACTIVO"}</td>
      <td>
        <div class="table-actions">
          <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
          <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
        </div>
      </td>`;
    elTable().appendChild(tr);
  });

  renderCount();
}

/* ============== Import / Export ============== */
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

function normalizeItem(o){
  const norm={};
  for(const [k,v] of Object.entries(o||{})){
    const kk=k.toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g,"");
    norm[kk]=v;
  }
  return unify({
    parte:       take(norm,"parte","#parte","sku","codigo","clave"),
    descripcion: take(norm,"descripcion","description","desc"),
    unidad:      take(norm,"unidad","uni"),
    stock:       take(norm,"stock","existencia","qty","cantidad"),
    minimo:      take(norm,"minimo","min","minimos","minstock"),
    ubicacion:   take(norm,"ubicacion","location","almacen"),
    proveedor:   take(norm,"proveedor","supplier"),
    esCliente:   toBool(take(norm,"escliente","materialcliente","materialdecliente")), // NUEVO
    estado:      take(norm,"estado","status"),
  });
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
      arr = Array.isArray(j) ? j : (Array.isArray(j?.items)? j.items : []);
    }else{
      arr = parseCSV(text);
    }
  }catch(e){
    alert("Archivo inválido: "+e.message); return;
  }

  const recs = arr.map(normalizeItem).filter(x=> x.parte || x.descripcion);
  if(!recs.length){ alert("No se encontraron registros válidos."); return; }

  // merge por 'parte'
  const idx = new Map();
  LIST.forEach((x,i)=>{ const key=S(unify(x).parte); if(key) idx.set(key,i); });
  recs.forEach(r=>{
    const key = S(r.parte);
    if(key && idx.has(key)) LIST[idx.get(key)] = r;
    else LIST.push(r);
  });

  try{
    await save();
    alert(`Importados ${recs.length} registro(s).`);
  }catch(e){
    if(String(e).includes("412")){ await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: "+e.message);
  }
}

function download(name,text){
  const b=new Blob([text],{type:"application/octet-stream"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}
function exportJSON(){ download("inventario.json", JSON.stringify(LIST.map(unify),null,2)); }
function exportCSV(){
  const header = ["#Parte","Descripción","Unidad","Stock","Mín.","Ubicación","Proveedor","Cliente","Estado"];
  const rows = LIST.map(unify).map(x => [
    x.parte, x.descripcion, x.unidad, x.stock, x.minimo, x.ubicacion, x.proveedor, (x.esCliente ? "Sí" : "No"), x.estado
  ].map(v => String(v ?? "").replace(/"/g,'""')).map(s => `"${s}"`).join(","));
  download("inventario.csv", ["sep=,", header.join(","), ...rows].join("\n"));
}
async function clearAll(){ if(!confirm("¿Vaciar todos los ítems de inventario?")) return; LIST=[]; await save(); }

/* ============== Persistencia ============== */
async function load(){
  try{
    const { etag, items } = await gs_getCollection("inventario");
    ETAG = etag;
    LIST = Array.isArray(items) ? items : [];
  }catch(e){
    console.error("Carga inventario falló:", e);
    ETAG=""; LIST=[];
  }
  showForm(false);
  renderList();
}
async function save(){
  ETAG = await gs_putCollection("inventario", LIST.map(unify), ETAG);
  renderList();
}

/* ============== Eventos ============== */
function on(node, ev, fn){ node && node.addEventListener(ev, fn); }
function mountEvents(){
  on(btnCreate(),"click",()=>{ fillForm(null); showForm(true); fParte()?.focus(); });

  on(btnGuardar(),"click", async ()=>{
    const rec = readForm();
    if(!rec.parte || !rec.parte.trim()){
      alert("El campo # PARTE es obligatorio."); fParte()?.focus(); return;
    }
    if(!rec.descripcion || !rec.descripcion.trim()){
      alert("La DESCRIPCIÓN es obligatoria."); fDesc()?.focus(); return;
    }

    const i = editingIndex >= 0
      ? editingIndex
      : LIST.findIndex(x => S(unify(x).parte) === S(rec.parte));

    if(i >= 0) LIST[i] = rec; else LIST.push(rec);

    try{
      await save();
      alert("Guardado");
      showForm(false);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){
      alert("Error al guardar: " + e.message);
    }
  });

  on(btnNuevo(),"click",()=>{ fillForm(null); showForm(true); fParte()?.focus(); });
  on(btnCerrar(),"click",()=>{ showForm(false); window.scrollTo({top:0,behavior:"smooth"}); });
  on(elBuscar(),"input",renderList);

  on(elTable(),"click",(e)=>{
    const btn=e.target.closest("button"); if(!btn) return;
    const i=Number(btn.getAttribute("data-i"));
    const act=btn.getAttribute("data-act");
    if(act==="edit"){ fillForm(LIST[i]); showForm(true); }
    else if(act==="del"){
      if(confirm("¿Eliminar el ítem seleccionado?")){
        LIST.splice(i,1); save().catch(err=>alert(err.message));
      }
    }
  });

  on(btnImport(),"click",()=> inputFile()?.click());
  on(inputFile(),"change", e=>{
    const file=e.target.files?.[0]; if(!file) return;
    importFile(file);
    e.target.value="";
  });
  on(btnExport(),"click",()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click", clearAll);
}

/* ============== Init ============== */
(async function bootstrap(){
  try{ mountEvents(); await load(); }
  catch(e){ console.error("Init inventario falló:", e); mountEvents(); }
})();
