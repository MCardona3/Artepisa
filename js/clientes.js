
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";
import { parseCSVSmart, normKey } from "./csv-helpers.js";

let ETAG=""; let LIST=[]; let editingIndex=-1;
const $=(id)=>document.getElementById(id);
const elCount=()=>$("c-count"), elTable=()=>$("c-tabla"), elBuscar=()=>$("c-buscar"), elLayout=()=>$("layout"), elCardForm=()=>$("card-form");
const btnNew=()=>$("c-new"), btnGuardar=()=>$("c-guardar"), btnCerrar=()=>$("c-cerrar"), btnNuevo=()=>$("c-nuevo");
const btnExport=()=>$("c-export"), btnImport=()=>$("c-import"), btnClear=()=>$("c-clear"), inputFile=()=>$("c-file");

const fNombre=()=>$("c-nombre"), fTel=()=>$("c-tel"), fDir=()=>$("c-dir"), fRFC=()=>$("c-rfc"), fEdo=()=>$("c-edo"), fCto=()=>$("c-cto"), fCtoTel=()=>$("c-ctotel");

function setMode(mode){ const lay=elLayout(); if(!lay) return; lay.classList.remove("form-only","split"); if(mode) lay.classList.add(mode); }
function renderCount(){ if(elCount()) elCount().textContent=LIST.length; }

function renderList(){
  if(!elTable()) return;
  const q=(elBuscar()?.value||"").toLowerCase().trim();
  elTable().innerHTML="";
  LIST.forEach((x,i)=>{
    const hay=[x.nombre??"", x.rfc??"", x.direccion??"", x.telefono??"", x.estado??"", x.contacto??"", x.cto_tel??""].join(" ").toLowerCase();
    if(q && !hay.includes(q)) return;
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${i+1}</td>
      <td class="clamp-2">${x.nombre??""}</td>
      <td>${x.telefono??""}</td>
      <td class="clamp-2">${x.direccion??""}</td>
      <td>${x.rfc??""}</td>
      <td>${x.estado??""}</td>
      <td class="clamp-2">${x.contacto??""}</td>
      <td>${x.cto_tel??""}</td>
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
  fNombre().value = d?.nombre || "";
  fTel().value    = d?.telefono || "";
  fDir().value    = d?.direccion || "";
  fRFC().value    = d?.rfc || "";
  fEdo().value    = d?.estado || "";
  fCto().value    = d?.contacto || "";
  fCtoTel().value = d?.cto_tel || "";
}
function readForm(){
  return {
    nombre: fNombre().value || "",
    telefono: fTel().value || "",
    direccion: fDir().value || "",
    rfc: fRFC().value || "",
    estado: fEdo().value || "",
    contacto: fCto().value || "",
    cto_tel: fCtoTel().value || ""
  };
}

async function load(){
  const { etag, items } = await gs_getCollection("clientes");
  ETAG = etag; LIST = Array.isArray(items) ? items : [];
  renderCount(); renderList();
}
async function save(){
  ETAG = await gs_putCollection("clientes", LIST, ETAG);
  renderCount(); renderList();
}

function mapRowToCliente(row){
  const k = Object.fromEntries(Object.entries(row).map(([kk,v])=>[normKey(kk), v]));
  return {
    nombre: k["nombre"] || k["cliente"] || "",
    telefono: k["telefono"] || k["tel"] || "",
    direccion: k["direccion"] || k["dir"] || "",
    rfc: k["rfc"] || "",
    estado: k["estado"] || "",
    contacto: k["contacto"] || k["nombre_contacto"] || "",
    cto_tel: k["telefono_contacto"] || k["tel_cto"] || k["cto_tel"] || ""
  };
}
function parseCSV(text){
  const {headers, rows} = parseCSVSmart(text);
  return rows.map(mapRowToCliente);
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
  try{ await save(); alert(`Importados ${arr.length} cliente(s).`); }
  catch(e){
    if (String(e).includes("412")) { await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: " + e.message);
  }
}
function exportJSON(){ download("clientes.json", JSON.stringify(LIST, null, 2)); }
function exportCSV(){
  const cols=["nombre","telefono","direccion","rfc","estado","contacto","cto_tel"];
  const rows=[cols.join(",")].concat(
    LIST.map(x=> cols.map(k => (x[k] ?? "").toString().replace(/"/g,'""')).map(s=>`"${s}"`).join(","))
  );
  download("clientes.csv", rows.join("\n"));
}
async function clearAll(){
  if(!confirm("¿Vaciar todos los clientes?")) return;
  LIST=[]; await save();
}

function on(n,ev,fn){ n && n.addEventListener(ev,fn); }

(function bootstrap(){
  on(btnNew(),"click", ()=>{ fillForm(null); elLayout().classList.add("form-only"); });
  on(btnCerrar(),"click", ()=>{ elLayout().classList.remove("form-only"); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNuevo(),"click", ()=>{ fillForm(null); elLayout().classList.add("form-only"); });
  on(btnGuardar(),"click", async ()=>{
    const rec = readForm();
    if (!rec.nombre.trim()){ alert("El nombre es obligatorio."); fNombre().focus(); return; }
    if (editingIndex>=0) LIST[editingIndex]=rec; else LIST.push(rec);
    try{ await save(); alert("Guardado"); elLayout().classList.remove("form-only"); }
    catch(e){ alert("Error: "+e.message); }
  });
  on(elBuscar(),"input", renderList);
  on(elTable(),"click",(e)=>{
    const btn=e.target.closest("button"); if(!btn) return;
    const i=Number(btn.getAttribute("data-i"));
    const act=btn.getAttribute("data-act");
  });
  // delegate edit/del
  elTable().addEventListener("click", (e)=>{
    const b=e.target.closest("button"); if(!b) return;
    const i=Number(b.getAttribute("data-i"));
    const ac=b.getAttribute("data-act");
    if(ac==="edit"){ fillForm(LIST[i]); elLayout().classList.add("form-only"); }
    else if(ac==="del"){ if(confirm("¿Eliminar cliente?")) { LIST.splice(i,1); save().catch(err=>alert(err.message)); } }
  });

  on(btnImport(),"click", ()=> $("c-file").click());
  on(inputFile(),"change", (e)=>{ const f=e.target.files?.[0]; if(!f) return; importFile(f); e.target.value=""; });

  on(btnExport(),"click", ()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if (pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click", clearAll);

  load().catch(console.error);
})();
