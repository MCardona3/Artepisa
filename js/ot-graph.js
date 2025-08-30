
// js/ot-graph.js — OneDrive + form-only
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

/* Estado */
let ETAG = "";
let LIST = [];
let editingIndex = -1;

/* Helpers */
const $id=(id)=>document.getElementById(id);
const elLayout=()=>$id("layout");
const elCardForm=()=>$id("card-form");
const elTable=()=>$id("o-tabla");
const elBuscar=()=>$id("o-buscar");
const elCount=()=>$id("ot-count");
const btnShowForm=()=>$id("btn-show-form");
const btnGuardar=()=>$id("o-guardar");
const btnNuevo=()=>$id("o-nuevo");
const btnCerrar=()=>$id("o-cerrar");
const btnImprimir=()=>$id("o-imprimir");
const btnExport=()=>$id("o-export");
const btnImport=()=>$id("o-import");
const btnClear=()=>$id("o-clear");
const inputFile=()=>$id("o-file");
const fNum=()=>$id("o-num");
const fCliente=()=>$id("o-cliente");
const fDepto=()=>$id("o-depto");
const fEnc=()=>$id("o-enc");
const fEmision=()=>$id("o-emision");
const fEntrega=()=>$id("o-entrega");
const fOC=()=>$id("o-oc");
const fEst=()=>$id("o-est");
const fPrio=()=>$id("o-prio");
const fDesc=()=>$id("o-desc");
const itemsBox=()=>$id("items-container");
const btnAddItem=()=>$id("btn-add-item");

// secciones extra
const cobrosBox=()=>$id("cobros-box");
const btnAddCobro=()=>$id("btn-add-cobro");
const matBox=()=>$id("mat-box");
const btnAddMat=()=>$id("btn-add-mat");

function showForm(mode){
  const lay = elLayout(); if (!lay) return;
  lay.classList.remove("split", "form-only");
  if (mode === "split" || mode === "form-only") lay.classList.add(mode);
}

/* Utilidades */
const S=(v)=> (v==null ? "" : String(v));
const todayISO=()=> new Date().toISOString().slice(0,10);
const fmtDate=(s)=>{ if(!s) return ""; const d=new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0,10); };
const fmtDateHuman=(s)=>{ if(!s) return ""; const d=new Date(s); return isNaN(d) ? s : d.toLocaleDateString(undefined,{day:"2-digit",month:"2-digit",year:"numeric"}); };
const download=(name,text)=>{ const b=new Blob([text],{type:"application/octet-stream"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); };

/* Normalización */
function unify(rec = {}) {
  return {
    num:         rec.num ?? "",
    cliente:     rec.cliente ?? "",
    depto:       rec.depto ?? "",
    encargado:   (rec.encargado ?? rec.enc ?? ""),
    emision:     rec.emision ?? "",
    entrega:     rec.entrega ?? "",
    oc:          rec.oc ?? "",
    estatus:     (rec.estatus ?? rec.est ?? ""),
    prioridad:   (rec.prioridad ?? rec.prio ?? ""),
    descripcion: (rec.descripcion ?? rec.desc ?? ""),
    cobros:      Array.isArray(rec.cobros) ? rec.cobros : [],
    material:    Array.isArray(rec.material) ? rec.material : [],
    items:       Array.isArray(rec.items) ? rec.items : []
  };
}

const isISO      = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const isOC       = (v) => /^\d{1,}$/.test(String(v || ""));
const isStatus   = (v) => ["ABIERTA","PENDIENTE","EN PROCESO","EN ESPERA","CERRADA"].includes(String(v || "").toUpperCase());
const isPriority = (v) => ["NORMAL","ALTA","URGENTE"].includes(String(v || "").toUpperCase());

function repairMisplaced(u) {
  let x = { ...u };
  let touched = false;
  if (isISO(x.depto) && !isISO(x.emision))    { x.emision = x.depto; x.depto = ""; touched = true; }
  if (isISO(x.encargado) && !isISO(x.entrega)) { x.entrega = x.encargado; x.encargado = ""; touched = true; }
  if (!x.oc && x.emision && !isISO(x.emision) && isOC(x.emision)) { x.oc = x.emision; x.emision = ""; touched = true; }
  if (!x.estatus && isStatus(x.emision))   { x.estatus = x.emision; x.emision = ""; touched = true; }
  if (!x.prioridad && isPriority(x.emision)) { x.prioridad = x.emision; x.emision = ""; touched = true; }
  if (!x.estatus && isStatus(x.entrega))   { x.estatus = x.entrega; x.entrega = ""; touched = true; }
  if (!x.prioridad && isPriority(x.entrega)) { x.prioridad = x.entrega; x.entrega = ""; touched = true; }
  if (!x.prioridad && isPriority(x.oc)) { x.prioridad = x.oc; x.oc = ""; touched = true; }
  return { fixed: touched, rec: x };
}

/* PARTIDAS */
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

/* COBROS */
function addCobroRow(c={periodo:"", factura:"", fecha:"", monto:"", parcial_de:""}){
  const box = cobrosBox(); if(!box) return;
  const row = document.createElement("div");
  row.className = "items-row";
  row.style.gridTemplateColumns = "1fr 1fr 160px 120px 120px";
  row.innerHTML = `
    <input placeholder="Periodo (Ene 2025)" value="${S(c.periodo)}">
    <input placeholder="No. Factura" value="${S(c.factura)}">
    <input type="date" value="${fmtDate(c.fecha)}">
    <input type="number" step="0.01" placeholder="Monto" value="${S(c.monto)}">
    <input placeholder="Parcialidad n/de" value="${S(c.parcial_de)}">
  `;
  box.appendChild(row);
}
function readCobrosFromUI(){
  return Array.from(cobrosBox()?.querySelectorAll(".items-row")||[]).map(r=>{
    const [p, f, fe, m, pa] = r.querySelectorAll("input");
    return { periodo:p.value, factura:f.value, fecha:fe.value, monto:m.value, parcial_de:pa.value };
  });
}

/* MATERIAL CLIENTE */
function addMatRow(m={descripcion:"",unidad:"",cantidad:"",almacen:"",ubicacion:""}){
  const box = matBox(); if(!box) return;
  const row = document.createElement("div");
  row.className = "items-row";
  row.style.gridTemplateColumns = "2fr 1fr 120px 1fr 1fr";
  row.innerHTML = `
    <input placeholder="Descripción" value="${S(m.descripcion)}">
    <input placeholder="Unidad" value="${S(m.unidad)}">
    <input type="number" placeholder="Cantidad" value="${S(m.cantidad)}">
    <input placeholder="En almacén (sí/no)" value="${S(m.almacen)}">
    <input placeholder="Ubicación" value="${S(m.ubicacion)}">
  `;
  box.appendChild(row);
}
function readMatFromUI(){
  return Array.from(matBox()?.querySelectorAll(".items-row")||[]).map(r=>{
    const [d,u,c,a,ub] = r.querySelectorAll("input");
    return { descripcion:d.value, unidad:u.value, cantidad:c.value, almacen:a.value, ubicacion:ub.value };
  });
}

/* FORM */
function fillForm(data=null){
  const u = data ? unify(data) : null;
  editingIndex = data ? LIST.indexOf(data) : -1;

  fNum()     && (fNum().value = u?.num ?? "");
  fCliente() && (fCliente().value = u?.cliente ?? "");
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

  cobrosBox().innerHTML = "";
  (u?.cobros || []).forEach(addCobroRow);
  if (!(u?.cobros || []).length) addCobroRow({});

  matBox().innerHTML = "";
  (u?.material || []).forEach(addMatRow);
  if (!(u?.material || []).length) addMatRow({});
}

function readForm(){
  return {
    num: fNum()?.value || undefined,
    cliente: fCliente()?.value || "",
    depto: fDepto()?.value || "",
    encargado: fEnc()?.value || "",
    emision: fEmision()?.value || "",
    entrega: fEntrega()?.value || "",
    oc: fOC()?.value || "",
    estatus: fEst()?.value || "ABIERTA",
    prioridad: fPrio()?.value || "NORMAL",
    descripcion: fDesc()?.value || "",
    items: readItemsFromUI(),
    cobros: readCobrosFromUI(),
    material: readMatFromUI()
  };
}

/* TABLA */
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

    const semaforo = (x.estatus||"").toUpperCase();
    const semaBadge = semaforo === "CERRADA" ? '<span class="badge">🟢</span>' :
                      semaforo === "PENDIENTE" ? '<span class="badge">🟡</span>' :
                      '<span class="badge">🔵</span>';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${S(x.num)}</td>
      <td class="clamp-2">${S(x.cliente)}</td>
      <td class="clamp-2">${S(x.depto)}</td>
      <td class="clamp-2">${S(x.encargado)}</td>
      <td>${fmtDate(x.emision)}</td>
      <td>${fmtDate(x.entrega)}</td>
      <td>${S(x.oc)}</td>
      <td><span class="badge">${S(x.estatus)}</span></td>
      <td><span class="badge green">${S(x.prioridad)}</span></td>
      <td>${semaBadge}</td>
      <td>
        <div class="table-actions">
          <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
          <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
        </div>
      </td>`;
    elTable().appendChild(tr);
  });
}

/* Import / Export */
function parseCSV(text){
  const sep=text.includes(";")&&!text.includes(",")?";":",";
  const lines=text.split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const head=lines.shift().split(sep).map(s=>s.trim().toLowerCase());
  return lines.map(line=>{
    const cells=line.split(sep).map(s=>s.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    const o={}; head.forEach((h,i)=>o[h]=cells[i]??""); return o;
  });
}
const take=(o,...ks)=>{ for(const k of ks){ if(o[k]!=null && o[k]!="") return o[k]; } return ""; };

function normalizeOT(o){
  const norm={};
  for(const [k,v] of Object.entries(o||{})){
    const kk=k.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"");
    norm[kk]=v;
  }
  return {
    num:         take(norm,"num","numot","ot","folio","numero","#"),
    cliente:     take(norm,"cliente","nombre","name"),
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
  const text=await file.text(); let arr=[];
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
    if(key && idxByNum.has(key)) LIST[idxByNum.get(key)]=r; else LIST.push(r);
  });

  try{ await save(); alert(`Importados ${recs.length} registro(s).`); }
  catch(e){
    if(String(e).includes("412")){ await load(); await importFile(file); return; }
    alert("Error al guardar tras importar: "+e.message);
  }
}

function exportJSON(){ download("ordenes_trabajo.json", JSON.stringify(LIST.map(unify),null,2)); }
function exportCSV(){
  const cols=["num","cliente","depto","encargado","emision","entrega","oc","estatus","prioridad","descripcion"];
  const rows=[cols.join(",")].concat(LIST.map(unify).map(x=> cols.map(k=>S(x[k]).replace(/"/g,'""')).map(s=>`"${s}"`).join(",")));
  download("ordenes_trabajo.csv", rows.join("\n"));
}
async function clearAll(){ if(!confirm("¿Vaciar todas las Órdenes de Trabajo?")) return; LIST=[]; await save(); }

/* Clientes datalist (opcional) */
async function loadClientesDatalist(){
  try{
    const {items}=await gs_getCollection("clientes");
    const lista=Array.isArray(items)?items:[];
    const dl=$id("dl-clientes"); if(!dl) return;
    dl.innerHTML=lista
      .filter(c=>c && (c.nombre || c.name))
      .map(c=>`<option value="${S(c.nombre||c.name).replace(/"/g,'&quot;')}"></option>`)
      .join("");
  }catch(_){}
}

/* Print */
function buildPrintHTML(rec){
  const x = unify(rec);
  const logoURL=new URL("./img/arte.png", location.href).href;
  const items=Array.isArray(x.items)?x.items:[];
  const rows=items.length? items.map((it,i)=>`
        <tr>
          <td>${i+1}</td>
          <td style="text-align:right">${S(it.cantidad)}</td>
          <td>${S(it.descripcion)}</td>
          <td>${S(it.plano)}</td>
          <td>${it.adjunto?"Sí":""}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#6b7280">Sin partidas</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>OT ${S(x.num)} - Artepisa</title><style>
    @page { size: A4; margin: 16mm; } *{box-sizing:border-box}
    body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;color:#111827}
    .header{display:flex;align-items:center;gap:16px;margin-bottom:6px}.header img{height:56px}
    .brand{font-weight:800;font-size:20px;line-height:1.1}.muted{color:#6b7280}
    h1{font-size:18px;margin:6px 0 14px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12.5px;vertical-align:top}
    th{background:#f3f4f6;text-align:left}
  </style></head><body onload="window.print()">
    <div class="header"><img src="${logoURL}" alt="ARTEPISA SLP"><div><div class="brand">ARTEPISA SLP</div><div class="muted">Orden de Trabajo ${x.num?`· #${S(x.num)}`:""}</div></div></div>
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
    <table><thead><tr><th>#</th><th style="text-align:right">Cant.</th><th>Descripción</th><th>Plano</th><th>Adjunto</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}
function printOT(rec){
  const html=buildPrintHTML(rec);
  const w=window.open("", "_blank", "width=900,height=900");
  w.document.open(); w.document.write(html); w.document.close();
}

/* Persistencia */
async function load(){
  try {
    const { etag, items } = await gs_getCollection("ot");
    ETAG = etag;
    LIST = Array.isArray(items) ? items : [];
  } catch(e) {
    console.error("Carga OT falló:", e);
    ETAG = ""; LIST = [];
  }

  let changed = false;
  LIST = LIST.map(r => {
    const { fixed, rec } = repairMisplaced(unify(r));
    if (fixed) changed = true;
    return rec;
  });
  if (changed) {
    try { ETAG = await gs_putCollection("ot", LIST, ETAG); }
    catch(e){ console.warn("No se pudo guardar la reparación:", e); }
  }

  renderCount();
  renderList();
  loadClientesDatalist();
}
async function save(){ ETAG=await gs_putCollection("ot",LIST,ETAG); renderCount(); renderList(); }

/* Eventos */
function on(node, ev, fn){ node && node.addEventListener(ev, fn); }
function mountEvents(){
  on(btnShowForm(),"click",()=>{ fillForm(null); showForm("form-only"); elCardForm()?.scrollIntoView({behavior:"smooth",block:"start"}); });
  on(btnCerrar(),"click",()=>{ showForm(null); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNuevo(),"click",()=>{ fillForm(null); showForm("form-only"); });
  on(btnAddItem(),"click",()=> addItemRow());
  on(btnAddCobro(),"click",()=> addCobroRow({}));
  on(btnAddMat(),"click",()=> addMatRow({}));

  on(btnGuardar(),"click",async ()=>{
    const rec=readForm();
    if(!rec.cliente || !rec.cliente.trim()){ alert("El campo CLIENTE es obligatorio."); fCliente()?.focus(); return; }

    // autogenera #
    if (!rec.num){
      const nums = LIST.map(x => Number(x.num)||0);
      rec.num = (nums.length ? Math.max(...nums) : 0) + 1;
    }

    if(editingIndex>=0) LIST[editingIndex]=rec; else LIST.push(rec);
    try{ await save(); alert("Guardado"); showForm(null); window.scrollTo({top:0,behavior:"smooth"}); }
    catch(e){ alert("Error al guardar: "+e.message); }
  });

  on(elBuscar(),"input",renderList);
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
  on(btnImprimir(),"click",()=>printOT(readForm()));
  on(btnImport(),"click",()=> inputFile()?.click());
  on(inputFile(),"change",(e)=>{ const file=e.target.files?.[0]; if(!file) return; importFile(file); e.target.value=""; });
  on(btnExport(),"click",()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click",clearAll);
}

(async function bootstrap(){ try{ mountEvents(); await load(); }catch(e){ console.error("Init OT falló:",e); mountEvents(); } })();
