// js/inv-graph.js — Inventario (CRUD, import/export, ajustes, OneDrive Graph)
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

/* ===== Estado ===== */
let ETAG = "";
let LIST = [];        // inventario
let editingIndex = -1;

/* ===== Helpers DOM ===== */
const $id = (id)=>document.getElementById(id);
const elLayout = ()=>$id("layout");
const elCardForm = ()=>$id("card-form");
const elTable = ()=>$id("inv-tabla");
const elBuscar = ()=>$id("inv-buscar");
const elCount  = ()=>$id("inv-count");

const btnShowForm = ()=>$id("btn-show-form");
const btnGuardar  = ()=>$id("inv-guardar");
const btnNuevo    = ()=>$id("inv-nuevo");
const btnCerrar   = ()=>$id("inv-cerrar");

const btnExport = ()=>$id("inv-export");
const btnImport = ()=>$id("inv-import");
const btnClear  = ()=>$id("inv-clear");
const inputFile = ()=>$id("inv-file");

const fSKU   = ()=>$id("f-sku");
const fNom   = ()=>$id("f-nombre");
const fCat   = ()=>$id("f-cat");
const fUn    = ()=>$id("f-un");
const fStock = ()=>$id("f-stock");
const fMin   = ()=>$id("f-min");
const fUbi   = ()=>$id("f-ubi");
const fProv  = ()=>$id("f-prov");
const fCosto = ()=>$id("f-costo");
const fEsCli = ()=>$id("f-escliente");
const fOT    = ()=>$id("f-ot");
const fNotas = ()=>$id("f-notas");

const lotesBox   = ()=>$id("lotes-container");
const btnAddLote = ()=>$id("btn-add-lote");

/* ===== Utils ===== */
const S = (v)=> v==null? "" : String(v);
const N = (v)=> { const n = Number(v); return Number.isFinite(n)? n : 0; };
const download=(name,text)=>{ const b=new Blob([text],{type:"application/octet-stream"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); };

function showForm(only){
  // usa regla .form-only de ordenes.css
  const lay = elLayout(); if(!lay) return;
  lay.classList.toggle("form-only", !!only);
}

/* ===== Modelo ===== */
function unify(rec={}){
  return {
    sku: S(rec.sku),
    nombre: S(rec.nombre ?? rec.descripcion),
    categoria: S(rec.categoria ?? rec.cat),
    unidad: S(rec.unidad ?? rec.un ?? "pza"),
    stock: N(rec.stock),
    min: N(rec.min),
    ubicacion: S(rec.ubicacion ?? rec.ubi),
    proveedor: S(rec.proveedor ?? rec.prov),
    costo: N(rec.costo),
    esCliente: !!rec.esCliente,
    ot: S(rec.ot),
    notas: S(rec.notas),
    lotes: Array.isArray(rec.lotes) ? rec.lotes.map(l=>({
      serie: S(l.serie),
      caduca: S(l.caduca),
      cant: N(l.cant)
    })) : []
  };
}

function estado(x){
  if (x.stock <= 0) return {txt:"AGOTADO", cls:"danger"};
  if (x.stock <= x.min) return {txt:"BAJO", cls:"warn"};
  return {txt:"OK", cls:"green"};
}

/* ===== Lotes UI ===== */
function clearLotesUI(){ if(lotesBox()) lotesBox().innerHTML=""; }
function addLoteRow(lote={serie:"",caduca:"",cant:0}){
  const row=document.createElement("div");
  row.className="items-row-lote";
  row.innerHTML=`
    <input class="l-serie"  placeholder="Serie / Lote" value="${S(lote.serie)}">
    <input class="l-caduca" type="date" value="${S(lote.caduca)}">
    <input class="l-cant"   type="number" step="0.01" value="${S(lote.cant)}">
    <button class="btn danger" type="button">Eliminar</button>`;
  row.querySelector("button")?.addEventListener("click",()=>row.remove());
  lotesBox().appendChild(row);
}
function readLotesFromUI(){
  return Array.from(lotesBox()?.querySelectorAll(".items-row-lote")||[]).map(r=>{
    return {
      serie:  r.querySelector(".l-serie").value.trim(),
      caduca: r.querySelector(".l-caduca").value,
      cant:   N(r.querySelector(".l-cant").value)
    };
  });
}

/* ===== Form ===== */
function fillForm(data=null){
  const u = data ? unify(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  fSKU().value   = u?.sku ?? "";
  fNom().value   = u?.nombre ?? "";
  fCat().value   = u?.categoria ?? "";
  fUn().value    = u?.unidad ?? "pza";
  fStock().value = u?.stock ?? 0;
  fMin().value   = u?.min ?? 0;
  fUbi().value   = u?.ubicacion ?? "";
  fProv().value  = u?.proveedor ?? "";
  fCosto().value = u?.costo ?? 0;
  fEsCli().checked = !!u?.esCliente;
  fOT().value    = u?.ot ?? "";
  fNotas().value = u?.notas ?? "";

  clearLotesUI();
  const lotes = (u?.lotes && u.lotes.length) ? u.lotes : [];
  if (lotes.length) lotes.forEach(addLoteRow);
}

function readForm(){
  return unify({
    sku: fSKU().value.trim(),
    nombre: fNom().value.trim(),
    categoria: fCat().value.trim(),
    unidad: fUn().value,
    stock: N(fStock().value),
    min: N(fMin().value),
    ubicacion: fUbi().value.trim(),
    proveedor: fProv().value.trim(),
    costo: N(fCosto().value),
    esCliente: !!fEsCli().checked,
    ot: fOT().value.trim(),
    notas: fNotas().value.trim(),
    lotes: readLotesFromUI()
  });
}

/* ===== Tabla ===== */
function renderCount(){ if(elCount()) elCount().textContent = LIST.length; }

function renderList(){
  const tb = elTable(); if(!tb) return;
  const needle = (elBuscar()?.value||"").toLowerCase().trim();
  tb.innerHTML = "";

  LIST.forEach((raw,i)=>{
    const x = unify(raw);
    const hay = [
      x.sku,x.nombre,x.proveedor,x.ubicacion,x.categoria,x.unidad
    ].map(S).join(" ").toLowerCase();

    if(needle && !hay.includes(needle)) return;

    const st = estado(x);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${S(x.sku)}</td>
      <td class="clamp-2">${S(x.nombre)}</td>
      <td>${S(x.unidad)}</td>
      <td style="text-align:right">${x.stock.toFixed(2)}</td>
      <td style="text-align:right">${x.min.toFixed(2)}</td>
      <td class="clip">${S(x.ubicacion)}</td>
      <td class="clip">${S(x.proveedor)}</td>
      <td><span class="badge ${st.cls}">${st.txt}</span></td>
      <td>
        <div class="table-actions">
          <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
          <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">
          <button class="btn ghost small" data-i="${i}" data-act="in">➕ Entrada</button>
          <button class="btn ghost small" data-i="${i}" data-act="out">➖ Salida</button>
        </div>
      </td>`;
    tb.appendChild(tr);
  });
}

/* ===== Persistencia (OneDrive/SharePoint) ===== */
async function load(){
  try{
    const {etag, items} = await gs_getCollection("inventario");
    ETAG = etag; LIST = Array.isArray(items)? items.map(unify) : [];
  }catch(e){
    console.error("Carga inventario falló:", e);
    ETAG=""; LIST=[];
  }
  renderCount(); renderList(); loadProveedoresDatalist();
}
async function save(){
  ETAG = await gs_putCollection("inventario", LIST.map(unify), ETAG);
  renderCount(); renderList();
}

/* ===== Import / Export ===== */
function parseCSV(text){
  const sep = text.includes(";") && !text.includes(",") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
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
    const kk=k.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"");
    norm[kk]=v;
  }
  return unify({
    sku:        take(norm,"sku","codigo","clave"),
    nombre:     take(norm,"nombre","descripcion","producto"),
    categoria:  take(norm,"categoria","cat","familia"),
    unidad:     take(norm,"unidad","un","udm"),
    stock:      Number(take(norm,"stock","existencia","qty"))||0,
    min:        Number(take(norm,"min","minimo"))||0,
    ubicacion:  take(norm,"ubicacion","ubi","rack"),
    proveedor:  take(norm,"proveedor","prov","supplier"),
    costo:      Number(take(norm,"costo","precio"))||0,
    esCliente:  /^(true|1|si|sí)$/i.test(String(norm.escliente||"")),
    ot:         take(norm,"ot","orden"),
    notas:      take(norm,"notas","obs")
  });
}

async function importFile(file){
  const text=await file.text(); let arr=[];
  try{
    if(file.name.toLowerCase().endsWith(".json")){
      const j=JSON.parse(text);
      arr=Array.isArray(j)?j:(Array.isArray(j?.items)?j.items:[]);
    } else {
      arr=parseCSV(text);
    }
  }catch(e){ alert("Archivo inválido: "+e.message); return; }

  const recs = arr.map(normalizeItem).filter(x=> x.sku || x.nombre);
  if(!recs.length){ alert("No se encontraron registros válidos."); return; }

  const idxBySKU=new Map();
  LIST.forEach((x,i)=>{ if(x.sku) idxBySKU.set(String(x.sku).toLowerCase(), i); });

  recs.forEach(r=>{
    const key = r.sku ? String(r.sku).toLowerCase() : null;
    if(key && idxBySKU.has(key)) LIST[idxBySKU.get(key)] = r;
    else LIST.push(r);
  });

  try{ await save(); alert(`Importados ${recs.length} registro(s).`); }
  catch(e){
    if(String(e).includes("412")){ await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: "+e.message);
  }
}

function exportJSON(){ download("inventario.json", JSON.stringify(LIST.map(unify),null,2)); }
function exportCSV(){
  const cols=["sku","nombre","categoria","unidad","stock","min","ubicacion","proveedor","costo","esCliente","ot","notas"];
  const rows=[cols.join(",")].concat(LIST.map(unify).map(x=> cols.map(k=>S(x[k]).replace(/"/g,'""')).map(s=>`"${s}"`).join(",")));
  download("inventario.csv", rows.join("\n"));
}
async function clearAll(){ if(!confirm("¿Vaciar TODO el inventario?")) return; LIST=[]; await save(); }

/* ===== Datalist proveedores ===== */
async function loadProveedoresDatalist(){
  try{
    const {items}=await gs_getCollection("proveedores");
    const lista=Array.isArray(items)?items:[];
    const dl=$id("dl-proveedores"); if(!dl) return;
    dl.innerHTML=lista
      .filter(p=>p && (p.nombre || p.name))
      .map(p=>`<option value="${S(p.nombre||p.name).replace(/"/g,'&quot;')}"></option>`)
      .join("");
  }catch(_){ /* si no existe proveedores.json, ignorar */ }
}

/* ===== Ajustes rápidos ===== */
async function ajuste(i, tipo){
  const rec = unify(LIST[i]||{});
  const q = Number(prompt(`Cantidad para ${tipo==="in"?"entrada":"salida"} de "${rec.nombre}" (Unidad: ${rec.unidad})`,"1"));
  if(!Number.isFinite(q) || q<=0) return;

  rec.stock = N(rec.stock) + (tipo==="in" ? q : -q);
  if(rec.stock < 0) rec.stock = 0;
  LIST[i] = rec;
  await save();
}

/* ===== Eventos ===== */
function on(node, ev, fn){ node && node.addEventListener(ev, fn); }

function mountEvents(){
  on(btnShowForm(),"click",()=>{ fillForm(null); showForm(true); elCardForm()?.scrollIntoView({behavior:"smooth",block:"start"}); });
  on(btnCerrar(),"click",()=>{ showForm(false); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNuevo(),"click",()=>{ fillForm(null); showForm(true); });

  on(btnAddLote(),"click",()=> addLoteRow({}));

  on(btnGuardar(),"click", async ()=>{
    const rec = readForm();
    if(!rec.nombre){ alert("Descripción requerida"); $id("f-nombre").focus(); return; }

    // clave base: SKU (si hay), si no, crea/edita por índice
    if (editingIndex>=0){
      LIST[editingIndex] = rec;
    } else {
      // evitar duplicados por SKU
      const idx = rec.sku ? LIST.findIndex(x=> String(x.sku).toLowerCase() === String(rec.sku).toLowerCase()) : -1;
      if (idx >= 0) LIST[idx] = rec; else LIST.push(rec);
    }

    try{ await save(); alert("Guardado"); showForm(false); window.scrollTo({top:0,behavior:"smooth"}); }
    catch(e){ alert("Error al guardar: "+e.message); }
  });

  on(elBuscar(),"input",renderList);

  on(elTable(),"click", async (e)=>{
    const b = e.target.closest("button"); if(!b) return;
    const i = Number(b.getAttribute("data-i"));
    const act = b.getAttribute("data-act");

    if (act==="edit"){
      fillForm(LIST[i]); showForm(true); elCardForm()?.scrollIntoView({behavior:"smooth"});
    } else if (act==="del"){
      if (confirm("¿Eliminar este ítem de inventario?")){ LIST.splice(i,1); await save(); }
    } else if (act==="in" || act==="out"){
      await ajuste(i, act);
    }
  });

  on(btnImport(),"click",()=> inputFile()?.click());
  on(inputFile(),"change",(e)=>{ const file=e.target.files?.[0]; if(!file) return; importFile(file); e.target.value=""; });
  on(btnExport(),"click",()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click",clearAll);
}

/* ===== Init ===== */
(async function bootstrap(){ try{ mountEvents(); await load(); }catch(e){ console.error("Init Inventario falló:",e); mountEvents(); } })();
