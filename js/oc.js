
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";
import { parseCSVSmart, normKey } from "./csv-helpers.js";

let ETAG=""; let LIST=[]; let editingIndex=-1;
const $=(id)=>document.getElementById(id);
const elCount=()=>$("oc-count"), elTable=()=>$("oc-tabla"), elBuscar=()=>$("oc-buscar"), elLayout=()=>$("layout"), elCardForm=()=>$("card-form");
const btnNew=()=>$("oc-new"), btnGuardar=()=>$("oc-guardar"), btnCerrar=()=>$("oc-cerrar"), btnNuevo=()=>$("oc-nuevo");
const btnExport=()=>$("oc-export"), btnImport=()=>$("oc-import"), btnClear=()=>$("oc-clear"), inputFile=()=>$("oc-file");

const fNum=()=>$("oc-num"), fProv=()=>$("oc-prov"), fFecha=()=>$("oc-fecha"), fEst=()=>$("oc-est"), fDesc=()=>$("oc-desc");

function setMode(mode){ const lay=elLayout(); if(!lay) return; lay.classList.remove("form-only","split"); if(mode) lay.classList.add(mode); }
function renderCount(){ if(elCount()) elCount().textContent=LIST.length; }

function renderList(){
  if(!elTable()) return;
  const q=(elBuscar()?.value||"").toLowerCase().trim();
  elTable().innerHTML="";
  LIST.forEach((x,i)=>{
    const hay=[x.num??"", x.proveedor??"", x.est??"", x.desc??""].join(" ").toLowerCase();
    if(q && !hay.includes(q)) return;
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${x.num??""}</td>
      <td class="clamp-2">${x.proveedor??""}</td>
      <td>${x.fecha??""}</td>
      <td>${x.est??""}</td>
      <td class="clamp-2">${x.desc??""}</td>
      <td>
        <div class="table-actions">
          <button class="btn sm" data-i="${i}" data-act="edit">Editar</button>
          <button class="btn sm danger" data-i="${i}" data-act="del">Borrar</button>
        </div>
      </td>`;
    elTable().appendChild(tr);
  });
}

function fillForm(d=null){
  editingIndex = d ? LIST.indexOf(d) : -1;
  fNum().value   = d?.num || "";
  fProv().value  = d?.proveedor || "";
  fFecha().value = d?.fecha || "";
  fEst().value   = d?.est || "";
  fDesc().value  = d?.desc || "";
}
function readForm(){
  return {
    num: fNum().value || "",
    proveedor: fProv().value || "",
    fecha: fFecha().value || "",
    est: fEst().value || "",
    desc: fDesc().value || ""
  };
}

async function load(){
  const { etag, items } = await gs_getCollection("oc");
  ETAG = etag; LIST = Array.isArray(items) ? items : [];
  renderCount(); renderList();
}
async function save(){
  ETAG = await gs_putCollection("oc", LIST, ETAG);
  renderCount(); renderList();
}

function mapRow(row){
  const k = Object.fromEntries(Object.entries(row).map(([kk,v])=>[normKey(kk), v]));
  return {
    num: k["num"] || k["oc"] || k["orden_compra"] || "",
    proveedor: k["proveedor"] || k["vendor"] || "",
    fecha: k["fecha"] || "",
    est: k["estatus"] || k["estado"] || "",
    desc: k["descripcion"] || k["descripción"] || ""
  };
}
function parseCSV(text){
  const {headers, rows} = parseCSVSmart(text);
  return rows.map(mapRow);
}

async function importFile(file){
  const text = await file.text();
  let arr = [];
  try{
    if(file.name.toLowerCase().endsWith(".json")){
      const j = JSON.parse(text);
      arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
    } else {
      arr = parseCSV(text);
    }
  }catch(e){ alert("Archivo inválido: "+e.message); return; }

  if(!arr.length){ alert("No se encontraron registros válidos."); return; }
  LIST = LIST.concat(arr);
  try{ await save(); alert(`Importados ${arr.length} registro(s).`); }
  catch(e){
    if (String(e).includes("412")) { await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: " + e.message);
  }
}
function exportJSON(){ download("ordenes_compra.json", JSON.stringify(LIST, null, 2)); }
function exportCSV(){
  const cols=["num","proveedor","fecha","est","desc"];
  const rows=[cols.join(",")].concat(
    LIST.map(x=> cols.map(k => (x[k] ?? "").toString().replace(/"/g,'""')).map(s=>`"${s}"`).join(","))
  );
  download("ordenes_compra.csv", rows.join("\n"));
}
async function clearAll(){
  if(!confirm("¿Vaciar todas las OC?")) return;
  LIST=[]; await save();
}

function on(n,ev,fn){ n && n.addEventListener(ev,fn); }
(function bootstrap(){
  on(btnNew(),"click", ()=>{ fillForm(null); elLayout().classList.add("form-only"); });
  on(btnCerrar(),"click", ()=>{ elLayout().classList.remove("form-only"); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNuevo(),"click", ()=>{ fillForm(null); elLayout().classList.add("form-only"); });
  on(btnGuardar(),"click", async ()=>{
    const rec = readForm();
    if (!rec.proveedor.trim()){ alert("El proveedor es obligatorio."); fProv().focus(); return; }
    if (editingIndex>=0) LIST[editingIndex]=rec; else LIST.push(rec);
    try{ await save(); alert("Guardado"); elLayout().classList.remove("form-only"); }
    catch(e){ alert("Error: "+e.message); }
  });
  on(elBuscar(),"input", renderList);
  elTable().addEventListener("click", (e)=>{
    const b=e.target.closest("button"); if(!b) return;
    const i=Number(b.getAttribute("data-i"));
    const ac=b.getAttribute("data-act");
    if(ac==="edit"){ fillForm(LIST[i]); elLayout().classList.add("form-only"); }
    else if(ac==="del"){ if(confirm("¿Eliminar OC?")) { LIST.splice(i,1); save().catch(err=>alert(err.message)); } }
  });

  on(btnImport(),"click", ()=> $("oc-file").click());
  on(inputFile(),"change", (e)=>{ const f=e.target.files?.[0]; if(!f) return; importFile(f); e.target.value=""; });

  on(btnExport(),"click", ()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if (pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click", clearAll);

  load().catch(console.error);
})();
