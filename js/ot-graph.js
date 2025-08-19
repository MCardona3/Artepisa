// js/ot-graph.js — HARDENED v4
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";
let ETAG = ""; let LIST = []; let editingIndex = -1;
const $id=(id)=>document.getElementById(id);
const elCount=()=>$id("ot-count"), elTable=()=>$id("o-tabla"), elBuscar=()=>$id("o-buscar"), elLayout=()=>$id("layout"), elCardForm=()=>$id("card-form");
const btnShowForm=()=>$id("btn-show-form"), btnGuardar=()=>$id("o-guardar"), btnNuevo=()=>$id("o-nuevo"), btnCerrar=()=>$id("o-cerrar"), btnImprimir=()=>$id("o-imprimir");
const btnExport=()=>$id("o-export"), btnImport=()=>$id("o-import"), btnClear=()=>$id("o-clear"), inputFile=()=>$id("o-file");
const fNum=()=>$id("o-num"), fCliente=()=>$id("o-cliente"), fDepto=()=>$id("o-depto"), fEnc=()=>$id("o-enc"), fEmision=()=>$id("o-emision"), fEntrega=()=>$id("o-entrega"), fOC=()=>$id("o-oc"), fEst=()=>$id("o-est"), fPrio=()=>$id("o-prio"), fDesc=()=>$id("o-desc");
const itemsBox=()=>$id("items-container"), btnAddItem=()=>$id("btn-add-item"), dlClientes=()=>$id("dl-clientes");
const fmtDate=(s)=>{ if(!s) return ""; const d=new Date(s); return isNaN(d)?"":d.toISOString().slice(0,10); };
const fmtDateHuman=(s)=>{ if(!s) return ""; const d=new Date(s); if(isNaN(d)) return s; return d.toLocaleDateString(undefined,{day:"2-digit",month:"2-digit",year:"numeric"}); };
const download=(name,text)=>{ const b=new Blob([text],{type:"application/octet-stream"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); };
function setMode(mode){ const lay=elLayout(); if(!lay) return; lay.classList.remove("form-only","split"); if(mode) lay.classList.add(mode); }
function renderCount(){ if(elCount()) elCount().textContent=LIST.length; }
function renderList(){
  if (!elTable()) return;
  const q = (elBuscar()?.value || "").toLowerCase().trim();
  elTable().innerHTML = "";

  const dash = (v) => (v == null || String(v).trim() === "") ? "—" : v;

  LIST.forEach((x,i)=>{
    const hay = [
      x.num??"", x.cliente??"", x.depto??"", x.enc??"",
      fmtDate(x.emision), fmtDate(x.entrega), x.oc??"", x.est??"", x.prio??"", x.desc??""
    ].join(" ").toLowerCase();
    if (q && !hay.includes(q)) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="# OT" class="clip td--num">${dash(x.num ?? "")}</td>
      <td data-label="Cliente" class="clamp-2">${dash(x.cliente || "")}</td>
      <td data-label="Departamento" class="clamp-2">${dash(x.depto || "")}</td>
      <td data-label="Encargado" class="clamp-2">${dash(x.enc || "")}</td>
      <td data-label="Fecha Emisión" class="td--date">${dash(fmtDate(x.emision))}</td>
      <td data-label="Fecha Entrega" class="td--date">${dash(fmtDate(x.entrega))}</td>
      <td data-label="Orden Compra" class="td--oc">${dash(x.oc || "")}</td>
      <td data-label="Estatus">${x.est ? `<span class="badge">${x.est}</span>` : "—"}</td>
      <td data-label="Prioridad">${x.prio ? `<span class="badge green">${x.prio}</span>` : "—"}</td>
      <td data-label="Acciones" class="right table-actions">
        <button class="iconbtn success" title="Editar" data-i="${i}" data-act="edit"></button>
        <button class="iconbtn danger"  title="Borrar" data-i="${i}" data-act="del"></button>
      </td>`;
    elTable().appendChild(tr);
  });
}

function clearItemsUI(){ if(itemsBox()) itemsBox().innerHTML=""; }
function addItemRow(item={cantidad:"",descripcion:"",plano:"",adjunto:""}){ if(!itemsBox()) return; const row=document.createElement("div"); row.className="items-row"; row.innerHTML=`
    <input type="number" min="0" step="1" placeholder="0" value="${item.cantidad??""}">
    <input placeholder="Descripción" value="${item.descripcion??""}">
    <input placeholder="Plano" value="${item.plano??""}">
    <input placeholder="Adjunto (base64)" value="${item.adjunto??""}">
    <button class="btn small danger" type="button">Quitar</button>`; row.querySelector("button")?.addEventListener("click",()=>row.remove()); itemsBox().appendChild(row); }
function readItemsFromUI(){ return Array.from(itemsBox()?.querySelectorAll(".items-row")||[]).map(r=>{ const [q,d,p,a]=r.querySelectorAll("input"); return {cantidad:q.value,descripcion:d.value,plano:p.value,adjunto:a.value}; }); }
function fillForm(data=null){ editingIndex=data?LIST.indexOf(data):-1; if(fNum())fNum().value=data?.num??""; if(fCliente())fCliente().value=data?.cliente??""; if(fDepto())fDepto().value=data?.depto??""; if(fEnc())fEnc().value=data?.enc??""; if(fEmision())fEmision().value=fmtDate(data?.emision); if(fEntrega())fEntrega().value=fmtDate(data?.entrega); if(fOC())fOC().value=data?.oc??""; if(fEst())fEst().value=data?.est??"ABIERTA"; if(fPrio())fPrio().value=data?.prio??"NORMAL"; if(fDesc())fDesc().value=data?.desc??""; clearItemsUI(); (data?.items||[]).forEach(addItemRow); }
function readForm(){ return { num:fNum()?.value||undefined, cliente:fCliente()?.value||"", depto:fDepto()?.value||"", enc:fEnc()?.value||"", emision:fEmision()?.value||"", entrega:fEntrega()?.value||"", oc:fOC()?.value||"", est:fEst()?.value||"ABIERTA", prio:fPrio()?.value||"NORMAL", desc:fDesc()?.value||"", items:readItemsFromUI() };}
async function load(){ try{ const {etag,items}=await gs_getCollection("ot"); ETAG=etag; LIST=Array.isArray(items)?items:[]; }catch(e){ console.error("Carga OT falló:",e); ETAG=""; LIST=[]; } renderCount(); renderList(); loadClientesDatalist(); }
async function save(){ ETAG=await gs_putCollection("ot",LIST,ETAG); renderCount(); renderList(); }
function parseCSV(text){ const sep=text.includes(";")&&!text.includes(",")?";":","; const lines=text.split(/\r?\n/).filter(l=>l.trim().length); if(!lines.length) return []; const head=lines.shift().split(sep).map(s=>s.trim().toLowerCase()); return lines.map(line=>{ const cells=line.split(sep).map(s=>s.replace(/^"|"$/g,"").replace(/""/g,'"').trim()); const o={}; head.forEach((h,i)=>o[h]=cells[i]??""); return o; }); }
const take=(o,...ks)=>{ for(const k of ks) if(o[k]!==undefined) return o[k]; return ""; };
function normalizeOT(o){ return { num:take(o,"num","#","ot","folio","numero"), cliente:take(o,"cliente","nombre","cliente_nombre"), depto:take(o,"depto","departamento"), enc:take(o,"enc","encargado","responsable","jefe"), emision:take(o,"emision","fecha_emision","fechaemision","fecha"), entrega:take(o,"entrega","fecha_entrega","fechaentrega"), oc:take(o,"oc","ordencompra","orden_compra"), est:take(o,"est","estatus","estado"), prio:take(o,"prio","prioridad"), desc:take(o,"desc","descripcion","descripción"), items:Array.isArray(o.items)?o.items:[] }; }
async function importFile(file){ const text=await file.text(); let arr=[]; try{ if(file.name.toLowerCase().endsWith(".json")){ const j=JSON.parse(text); arr=Array.isArray(j)?j:(Array.isArray(j?.items)?j.items:[]);} else { arr=parseCSV(text);} }catch(e){ alert("Archivo inválido: "+e.message); return; } const recs=arr.map(normalizeOT).filter(x=> (x.cliente||x.desc)); if(!recs.length){ alert("No se encontraron registros válidos."); return; } const idxByNum=new Map(); LIST.forEach((x,i)=>{ if(x.num) idxByNum.set(String(x.num),i); }); recs.forEach(r=>{ const key=r.num?String(r.num):null; if(key && idxByNum.has(key)) LIST[idxByNum.get(key)]=r; else LIST.push(r); }); try{ await save(); alert(`Importados ${recs.length} registro(s).`);} catch(e){ if(String(e).includes("412")){ await load(); await importFile(file); return; } alert("Error al guardar tras importar: "+e.message); } }
function exportJSON(){ download("ordenes_trabajo.json", JSON.stringify(LIST,null,2)); }
function exportCSV(){ const cols=["num","cliente","depto","enc","emision","entrega","oc","est","prio","desc"]; const rows=[cols.join(",")].concat(LIST.map(x=> cols.map(k=> (x[k]??"").toString().replace(/"/g,'""')).map(s=>`"${s}"`).join(","))); download("ordenes_trabajo.csv", rows.join("\n")); }
async function clearAll(){ if(!confirm("¿Vaciar todas las Órdenes de Trabajo?")) return; LIST=[]; await save(); }
async function loadClientesDatalist(){ try{ const {items}=await gs_getCollection("clientes"); const dl=dlClientes(); if(!dl) return; const lista=Array.isArray(items)?items:[]; dl.innerHTML=lista.filter(c=>c&&(c.nombre||c.name)).map(c=> `<option value="${(c.nombre||c.name).toString().replace(/"/g,'&quot;')}"></option>`).join(""); }catch(_){ } }
function buildPrintHTML(rec){ const logoURL=new URL("./img/arte.png?v=1", location.href).href; const items=Array.isArray(rec.items)?rec.items:[]; const rows=items.length? items.map((it,i)=>`
        <tr>
          <td>${i+1}</td>
          <td style="text-align:right">${it.cantidad??""}</td>
          <td>${(it.descripcion??"").toString()}</td>
          <td>${it.plano??""}</td>
          <td>${it.adjunto?"Sí":""}</td>
        </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;color:#6b7280">Sin partidas</td></tr>`; const dir="Calle 61 #232 Col. Villa Jardín, San Luis Potosí, S. L. P."; const tel="+52 444 829 5859"; const mail="luis.moreno@artepisa.com"; return `<!doctype html>
<html><head><meta charset="utf-8"><title>OT ${rec.num||""} - Artepisa</title><style>
  @page { size: A4; margin: 16mm; } *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;color:#111827}
  .header{display:flex;align-items:center;gap:16px;margin-bottom:6px}.header img{height:56px}
  .brand{font-weight:800;font-size:20px;line-height:1.1}.muted{color:#6b7280}
  .contact{margin:4px 0 12px;font-size:12.5px;color:#111827}
  h1{font-size:18px;margin:6px 0 14px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-bottom:14px}
  .field{display:flex;gap:8px}.label{width:145px;font-weight:700}.value{flex:1;border-bottom:1px solid #e5e7eb;padding-bottom:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12.5px;vertical-align:top}
  th{background:#f3f4f6;text-align:left}.footer{margin-top:16px;display:flex;gap:16px}.sign{flex:1;text-align:center;margin-top:32px}.sign .line{border-top:1px solid #9ca3af;margin-top:48px}
  .badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px;border:1px solid #bbf7d0;background:#ecfdf5;color:#166534;font-weight:700}
  .chip{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px;border:1px solid #dbeafe;background:#eff6ff;color:#1e40af;font-weight:700}
</style></head><body>
  <div class="header"><img src="${logoURL}" alt="ARTEPISA SLP"><div><div class="brand">ARTEPISA SLP</div><div class="muted">Orden de Trabajo ${rec.num?`· #${rec.num}`:""}</div><div class="contact">Dirección: ${dir}<br>Teléfono: ${tel} · Correo: ${mail}</div></div></div>
  <h1>Ficha de Orden de Trabajo</h1>
  <div class="grid">
    <div class="field"><div class="label">Cliente</div><div class="value">${rec.cliente||"&nbsp;"}</div></div>
    <div class="field"><div class="label">Departamento</div><div class="value">${rec.depto||"&nbsp;"}</div></div>
    <div class="field"><div class="label">Encargado</div><div class="value">${rec.enc||"&nbsp;"}</div></div>
    <div class="field"><div class="label">Orden de Compra</div><div class="value">${rec.oc||"&nbsp;"}</div></div>
    <div class="field"><div class="label">Fecha Emisión</div><div class="value">${fmtDateHuman(rec.emision)||"&nbsp;"}</div></div>
    <div class="field"><div class="label">Fecha Entrega</div><div class="value">${fmtDateHuman(rec.entrega)||"&nbsp;"}</div></div>
    <div class="field"><div class="label">Estatus</div><div class="value">${rec.est?`<span class="chip">${rec.est}</span>`:"&nbsp;"}</div></div>
    <div class="field"><div class="label">Prioridad</div><div class="value">${rec.prio?`<span class="badge">${rec.prio}</span>`:"&nbsp;"}</div></div>
    <div class="field" style="grid-column:1 / -1"><div class="label">Descripción</div><div class="value">${rec.desc||"&nbsp;"}</div></div>
  </div>
  <table><thead><tr><th>#</th><th style="text-align:right">Cant.</th><th>Descripción</th><th>Plano</th><th>Adjunto</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`; }
function printOT(rec){ if(!rec||!rec.cliente){ alert("Completa al menos el CLIENTE antes de imprimir."); fCliente()?.focus(); return; } const html=buildPrintHTML(rec); const frame=document.createElement("iframe"); Object.assign(frame.style,{position:"fixed",right:"0",bottom:"0",width:"0",height:"0",border:"0"}); document.body.appendChild(frame); const win=frame.contentWindow; win.document.open(); win.document.write(html); win.document.close(); setTimeout(()=>{ try{ win.focus(); win.print(); }catch(_){} setTimeout(()=>frame.remove(),800); },300); }
function on(node, ev, fn){ node && node.addEventListener(ev, fn); }
function mountEvents(){ on(btnShowForm(),"click",()=>{ fillForm(null); setMode("form-only"); elCardForm()?.scrollIntoView({behavior:"smooth",block:"start"}); });
  on(btnCerrar(),"click",()=>{ setMode(""); window.scrollTo({top:0,behavior:"smooth"}); });
  on(btnNuevo(),"click",()=>{ fillForm(null); setMode("form-only"); });
  on(btnAddItem(),"click",()=>addItemRow());
  on(btnGuardar(),"click",async ()=>{ const rec=readForm(); if(!rec.cliente||!rec.cliente.trim()){ alert("El campo CLIENTE es obligatorio."); fCliente()?.focus(); return; } if(editingIndex>=0) LIST[editingIndex]=rec; else LIST.push(rec); try{ await save(); alert("Guardado"); setMode(""); window.scrollTo({top:0,behavior:"smooth"}); }catch(e){ alert("Error al guardar: "+e.message); } });
  on(elBuscar(),"input",renderList);
  on(elTable(),"click",(e)=>{ const btn=e.target.closest("button"); if(!btn) return; const i=Number(btn.getAttribute("data-i")); const act=btn.getAttribute("data-act"); if(act==="edit"){ fillForm(LIST[i]); setMode("form-only"); elCardForm()?.scrollIntoView({behavior:"smooth"}); } else if(act==="del"){ if(confirm("¿Eliminar la OT seleccionada?")){ LIST.splice(i,1); save().catch(err=>alert(err.message)); } } });
  on(btnImprimir(),"click",()=>printOT(readForm()));
  on(btnImport(),"click",()=> inputFile()?.click()); on(inputFile(),"change",(e)=>{ const file=e.target.files?.[0]; if(!file) return; importFile(file); e.target.value=""; });
  on(btnExport(),"click",()=>{ const pick=confirm("Aceptar = JSON  |  Cancelar = CSV"); if(pick) exportJSON(); else exportCSV(); });
  on(btnClear(),"click",clearAll);
}
(async function bootstrap(){ try{ mountEvents(); await load(); }catch(e){ console.error("Init OT falló:",e); mountEvents(); } })();
