// js/inventario-graph.js — Inventario con OneDrive/SharePoint (Graph)
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

/* ========= Estado ========= */
let ETAG = "";
let LIST = [];
let editingIndex = -1;

/* ========= Helpers DOM ========= */
const $id = (id) => document.getElementById(id);

const elLayout  = () => $id("layout");
const elTable   = () => $id("inv-table");
const elSearch  = () => $id("inv-search");
const elCount   = () => $id("inv-count");

const btnShow   = () => $id("btn-show-form");
const btnSave   = () => $id("btn-save");
const btnNew    = () => $id("btn-new");
const btnClose  = () => $id("btn-close");
const btnExport = () => $id("btn-export");
const btnImport = () => $id("btn-import");
const btnClear  = () => $id("btn-clear");
const fileInput = () => $id("inv-file");

const fSku = () => $id("f-sku");
const fDes = () => $id("f-des");
const fUni = () => $id("f-uni");
const fStk = () => $id("f-stk");
const fMin = () => $id("f-min");
const fUbi = () => $id("f-ubi");
const fPro = () => $id("f-pro");
const fEst = () => $id("f-est");
const fNot = () => $id("f-not");

/* ========= UI helpers ========= */
function showForm(mode){
  const lay = elLayout(); if(!lay) return;
  lay.classList.remove("split","form-only");
  if(mode === "form-only" || mode === "split") lay.classList.add(mode);
  // asegura que la tarjeta del formulario sea visible
  if(mode) document.getElementById("card-form")?.scrollIntoView({behavior:"smooth", block:"start"});
}

const S = (v)=> (v==null ? "" : String(v));
const N = (v)=> { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function unify(r = {}){
  return {
    sku:        S(r.sku).trim(),
    descripcion:S(r.descripcion).trim(),
    unidad:     S(r.unidad).trim(),
    stock:      Number(r.stock ?? 0),
    minimo:     Number(r.minimo ?? r.min ?? 0),
    ubicacion:  S(r.ubicacion).trim(),
    proveedor:  S(r.proveedor).trim(),
    estado:     (S(r.estado).trim() || "ACTIVO").toUpperCase(),
    notas:      S(r.notas).trim()
  };
}

/* ========= Form ========= */
function fillForm(data=null){
  const x = data ? unify(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  fSku().value = x?.sku ?? "";
  fDes().value = x?.descripcion ?? "";
  fUni().value = x?.unidad ?? "";
  fStk().value = x?.stock ?? 0;
  fMin().value = x?.minimo ?? 0;
  fUbi().value = x?.ubicacion ?? "";
  fPro().value = x?.proveedor ?? "";
  fEst().value = x?.estado ?? "ACTIVO";
  fNot().value = x?.notas ?? "";
}

function readForm(){
  return unify({
    sku:        fSku().value,
    descripcion:fDes().value,
    unidad:     fUni().value,
    stock:      N(fStk().value),
    minimo:     N(fMin().value),
    ubicacion:  fUbi().value,
    proveedor:  fPro().value,
    estado:     fEst().value,
    notas:      fNot().value
  });
}

/* ========= Tabla ========= */
function renderCount(){ elCount().textContent = LIST.length; }

function renderList(){
  const tb = elTable(); if(!tb) return;
  const q = (elSearch()?.value || "").toLowerCase().trim();
  tb.innerHTML = "";

  LIST.forEach((raw, i)=>{
    const x = unify(raw);
    const hay = [x.sku,x.descripcion,x.unidad,x.ubicacion,x.proveedor,x.estado].join(" ").toLowerCase();
    if(q && !hay.includes(q)) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${S(x.sku)}</td>
      <td class="clamp-2">${S(x.descripcion)}</td>
      <td>${S(x.unidad)}</td>
      <td style="text-align:right">${x.stock}</td>
      <td style="text-align:right">${x.minimo}</td>
      <td>${S(x.ubicacion)}</td>
      <td>${S(x.proveedor)}</td>
      <td><span class="badge ${x.stock <= x.minimo ? "danger" : "green"}">${S(x.estado)}</span></td>
      <td>
        <div class="table-actions">
          <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
          <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
        </div>
      </td>`;
    tb.appendChild(tr);
  });
}

/* ========= Import / Export ========= */
function download(name,text){
  const b = new Blob([text],{type:"application/octet-stream"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function parseCSV(text){
  const sep = text.includes(";") && !text.includes(",") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const head = lines.shift().split(sep).map(s=>s.trim().toLowerCase());
  return lines.map(line=>{
    const cells = line.split(sep).map(s=>s.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    const o={}; head.forEach((h,i)=>o[h]=cells[i]??""); return o;
  });
}

function normalizeRow(o){
  const k={};
  for(const [kk,v] of Object.entries(o||{})){
    const key = kk.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"");
    k[key]=v;
  }
  return unify({
    sku:        k.sku || k.codigo || k.code || "",
    descripcion:k.descripcion || k.desc || "",
    unidad:     k.unidad || k.und || "",
    stock:      k.stock,
    minimo:     k.minimo || k.min || 0,
    ubicacion:  k.ubicacion || k.ubic || "",
    proveedor:  k.proveedor || k.vendor || "",
    estado:     k.estado || "ACTIVO",
    notas:      k.notas || k.observaciones || ""
  });
}

async function importFile(file){
  const text = await file.text();
  let arr=[];
  try{
    if(file.name.toLowerCase().endsWith(".json")){
      const j = JSON.parse(text);
      arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
    } else {
      arr = parseCSV(text);
    }
  }catch(e){ alert("Archivo inválido: "+e.message); return; }

  const recs = arr.map(normalizeRow).filter(x=> x.sku || x.descripcion);
  if(!recs.length){ alert("No se encontraron registros válidos."); return; }

  const idxBySku = new Map();
  LIST.forEach((x,i)=>{ if(x.sku) idxBySku.set(String(x.sku), i); });

  recs.forEach(r=>{
    const key = r.sku ? String(r.sku) : null;
    if(key && idxBySku.has(key)) LIST[idxBySku.get(key)] = r;
    else LIST.push(r);
  });

  try{ await save(); alert(`Importados ${recs.length} registro(s).`); }
  catch(e){ alert("Error al guardar tras importar: "+e.message); }
}

function exportJSON(){ download("inventario.json", JSON.stringify(LIST.map(unify), null, 2)); }
function exportCSV(){
  const cols = ["sku","descripcion","unidad","stock","minimo","ubicacion","proveedor","estado","notas"];
  const rows = [cols.join(",")].concat(
    LIST.map(unify).map(x=> cols.map(k=>S(x[k]).replace(/"/g,'""')).map(s=>`"${s}"`).join(","))
  );
  download("inventario.csv", rows.join("\n"));
}

/* ========= Persistencia ========= */
async function load(){
  try{
    const { etag, items } = await gs_getCollection("inventario");
    ETAG = etag;
    LIST = Array.isArray(items) ? items : [];
  }catch(e){
    console.error("Carga inventario falló:", e);
    ETAG=""; LIST=[];
  }
  renderCount(); renderList();
}

async function save(){
  ETAG = await gs_putCollection("inventario", LIST, ETAG);
  renderCount(); renderList();
}

/* ========= Eventos ========= */
function on(n,ev,fn){ n && n.addEventListener(ev,fn); }

function mount(){
  on(btnShow(),"click", ()=>{ fillForm(null); showForm("form-only"); });
  on(btnClose(),"click",()=>{ showForm(null); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNew(),"click",  ()=>{ fillForm(null); showForm("form-only"); });

  on(btnSave(),"click", async ()=>{
    const rec = readForm();
    if(!rec.sku && !rec.descripcion){
      alert("SKU o Descripción son requeridos."); fSku().focus(); return;
    }
    if(editingIndex >= 0) LIST[editingIndex] = rec; else LIST.push(rec);
    try{ await save(); alert("Guardado"); showForm(null); }
    catch(e){ alert("Error al guardar: "+e.message); }
  });

  on(elSearch(),"input", renderList);

  on(elTable(),"click",(e)=>{
    const btn = e.target.closest("button"); if(!btn) return;
    const i = Number(btn.getAttribute("data-i"));
    const act = btn.getAttribute("data-act");
    if(act==="edit"){ fillForm(LIST[i]); showForm("form-only"); }
    else if(act==="del"){
      if(confirm("¿Eliminar el ítem seleccionado?")){ LIST.splice(i,1); save().catch(err=>alert(err.message)); }
    }
  });

  on(btnExport(),"click", ()=>{ const pick = confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });
  on(btnImport(),"click", ()=> fileInput()?.click());
  on(fileInput(),"change", (e)=>{ const f=e.target.files?.[0]; if(!f) return; importFile(f); e.target.value=""; });
  on(btnClear(),"click", async ()=>{ if(!confirm("¿Vaciar TODO el inventario?")) return; LIST=[]; await save(); });
}

/* ========= Init ========= */
(async function bootstrap(){
  try{ mount(); await load(); }
  catch(e){ console.error("Init inventario falló:", e); mount(); }
})();
