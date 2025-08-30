// js/inv-graph.js — Inventario (OneDrive/SharePoint) — versión con toggle listado/formulario
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

/* ============== Estado ============== */
let ETAG = "";
let LIST = [];          // [{#Parte, descripcion, unidad, stock, minimo, ubicacion, proveedor, estado}]
let editingIndex = -1;  // índice en edición

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

// Campos de formulario (compat f-* o i-*)
const fSKU   = () => $id("f-#Parte")     || $id("i-#Parte");
const fDesc  = () => $id("f-nombre")  || $id("i-desc");
const fUni   = () => $id("f-un")      || $id("i-uni");
const fStock = () => $id("f-stock")   || $id("i-stock");
const fMin   = () => $id("f-min")     || $id("i-min");
const fUbi   = () => $id("f-ubi")     || $id("i-ubi");
const fProv  = () => $id("f-prov")    || $id("i-prov");
const fEst   = () => $id("f-estado")  || $id("i-estado");

/* ============== Utilidades ============== */
const S = v => (v == null ? "" : String(v));
const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const download=(name,text)=>{
  const b=new Blob([text],{type:"application/octet-stream"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
};

/* ===== Toggle listado ↔ formulario =====
   show=true  -> muestra formulario (oculta listado)
   show=false -> muestra listado (oculta formulario) */
function showForm(show){
  const lay = elLayout();
  if (lay) lay.classList.toggle("form-only", !!show);
  // Forzar visibilidad aunque haya inline styles
  if (elCardForm()) elCardForm().style.display = show ? "" : "none";
  if (elCardList()) elCardList().style.display = show ? "none" : "";
  // si abrimos el form, desplazamos el viewport
  if (show) elCardForm()?.scrollIntoView({behavior:"smooth", block:"start"});
}

/* ============== Normalización ============== */
function unify(rec = {}){
  return {
    sku:        S(rec.#Parte).trim(),
    descripcion:S(rec.descripcion).trim(),
    unidad:     S(rec.unidad).trim(),
    stock:      N(rec.stock),
    minimo:     N(rec.minimo ?? rec.min),
    ubicacion:  S(rec.ubicacion).trim(),
    proveedor:  S(rec.proveedor).trim(),
    estado:     S(rec.estado).trim(),   // ACTIVO/INACTIVO
  };
}

/* ============== Form ============== */
function fillForm(data=null){
  const u = data ? unify(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  if(f#Parte())   f#Parte().value   = u?.#Parte || "";
  if(fDesc())  fDesc().value  = u?.descripcion || "";
  if(fUni())   fUni().value   = u?.unidad || "pza";
  if(fStock()) fStock().value = (u?.stock ?? 0);
  if(fMin())   fMin().value   = (u?.minimo ?? 0);
  if(fUbi())   fUbi().value   = u?.ubicacion || "";
  if(fProv())  fProv().value  = u?.proveedor || "";
  if(fEst())   fEst().value   = u?.estado || "ACTIVO";
}

function readForm(){
  return unify({
    sku:        f#Parte()?.value,
    descripcion:fDesc()?.value,
    unidad:     fUni()?.value,
    stock:      fStock()?.value,
    minimo:     fMin()?.value,
    ubicacion:  fUbi()?.value,
    proveedor:  fProv()?.value,
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
        x.#Parte, x.descripcion, x.unidad, x.ubicacion, x.proveedor, x.estado
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });

  list.forEach((x,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${S(x.#Parte)}</td>
      <td class="clamp-2">${S(x.descripcion)}</td>
      <td>${S(x.unidad)}</td>
      <td style="text-align:right">${N(x.stock)}</td>
      <td style="text-align:right">${N(x.minimo)}</td>
      <td>${S(x.ubicacion)}</td>
      <td>${S(x.proveedor)}</td>
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
    #Parte:         take(norm,"sku","codigo","clave"),
    descripcion: take(norm,"descripcion","description","desc"),
    unidad:      take(norm,"unidad","uni"),
    stock:       take(norm,"stock","existencia","qty","cantidad"),
    minimo:      take(norm,"minimo","min","minimos","minstock"),
    ubicacion:   take(norm,"ubicacion","location","almacen"),
    proveedor:   take(norm,"proveedor","supplier"),
    estado:      take(norm,"estado","status"),
  });
}

async function importFile(file){
  const text=await file.text(); let arr=[];
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

  const recs = arr.map(normalizeItem).filter(x=> x.sku || x.descripcion);
  if(!recs.length){ alert("No se encontraron registros válidos."); return; }

  // merge por SKU
  const idx = new Map();
  LIST.forEach((x,i)=>{ const key=S(x.sku); if(key) idx.set(key,i); });
  recs.forEach(r=>{
    const key = S(r.sku);
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

function exportJSON(){ download("inventario.json", JSON.stringify(LIST.map(unify),null,2)); }
function exportCSV(){
  const cols=["sku","descripcion","unidad","stock","minimo","ubicacion","proveedor","estado"];
  const rows=[cols.join(",")].concat(LIST.map(unify).map(x=> cols
    .map(k=>S(x[k]).replace(/"/g,'""')).map(s=>`"${s}"`).join(",")));
  download("inventario.csv", rows.join("\n"));
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
  // Modo por defecto: listado
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
  // Crear / Agregar -> SOLO formulario
  on(btnCreate(), "click", ()=>{
    fillForm(null);
    showForm(true);
    fSKU()?.focus();
  });

  // Guardar
  on(btnGuardar(), "click", async ()=>{
    const rec = readForm();
    if(!rec.sku){ alert("El campo SKU es obligatorio."); fSKU()?.focus(); return; }
    if(!rec.descripcion){ alert("La DESCRIPCIÓN es obligatoria."); fDesc()?.focus(); return; }

    const i = editingIndex >= 0
      ? editingIndex
      : LIST.findIndex(x => S(x.sku) === S(rec.sku));

    if(i >= 0) LIST[i] = rec; else LIST.push(rec);

    try{
      await save();
      alert("Guardado");
      showForm(false);                    // ← volver al listado
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){
      alert("Error al guardar: " + e.message);
    }
  });

  // Nuevo (limpia y deja abierto)
  on(btnNuevo(), "click", ()=>{
    fillForm(null);
    showForm(true);
    fSKU()?.focus();
  });

  // Cerrar (volver a lista)
  on(btnCerrar(), "click", ()=>{
    showForm(false);
    window.scrollTo({top:0,behavior:"smooth"});
  });

  // Buscar
  on(elBuscar(), "input", renderList);

  // Editar / Eliminar desde la tabla
  on(elTable(), "click", (e)=>{
    const btn = e.target.closest("button"); if(!btn) return;
    const i = Number(btn.getAttribute("data-i"));
    const act = btn.getAttribute("data-act");
    if(act === "edit"){
      fillForm(LIST[i]);
      showForm(true);                     // ← abrir formulario
    }else if(act === "del"){
      if(confirm("¿Eliminar el ítem seleccionado?")){
        LIST.splice(i,1); save().catch(err=>alert(err.message));
      }
    }
  });

  // Importar / Exportar / Limpiar
  on(btnImport(), "click", ()=> inputFile()?.click());
  on(inputFile(), "change", e=>{
    const file = e.target.files?.[0]; if(!file) return;
    importFile(file);
    e.target.value = "";
  });
  on(btnExport(), "click", ()=>{
    const pick = confirm("Aceptar = JSON  |  Cancelar = CSV");
    if(pick) exportJSON(); else exportCSV();
  });
  on(btnClear(), "click", clearAll);
}

/* ============== Init ============== */
(async function bootstrap(){
  try{ mountEvents(); await load(); }
  catch(e){ console.error("Init inventario falló:", e); mountEvents(); }
})();

