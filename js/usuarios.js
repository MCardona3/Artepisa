// js/usuarios.js
(function(){
  const $ = s => document.querySelector(s);
  const norm = s => (s||"").trim().toLowerCase();
  let cache = [];        // users
  let editingKey = null; // email en edición

  const S = v => (v == null ? "" : String(v));

  function readForm(){
    return {
      email: $("#u-email").value.trim(),
      nombre: $("#u-nombre").value.trim(),
      rol: $("#u-rol").value,
      activo: $("#u-activo").checked
    };
  }
  function fillForm(u={}){
    $("#u-email").value = u.email || "";
    $("#u-nombre").value = u.nombre || "";
    $("#u-rol").value = u.rol || "LECTOR";
    $("#u-activo").checked = !!u.activo;
    editingKey = u.email ? norm(u.email) : null;
    $("#u-email").disabled = !!editingKey;
  }
  function render(q=""){
    const tb = $("#u-tabla"); tb.innerHTML = "";
    const needle = norm(q);
    const list = cache
      .filter(u => !needle || norm(u.email).includes(needle) || norm(u.nombre).includes(needle))
      .sort((a,b)=> norm(a.email).localeCompare(norm(b.email)));
    list.forEach(u=>{
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${u.email}</td><td>${u.nombre||""}</td><td>${u.rol}</td><td>${u.activo?"Sí":"No"}</td>
         <td><button class="btn ghost btn-edit">Editar</button>
             <button class="btn danger btn-del">Eliminar</button></td>`;
      tr.querySelector(".btn-edit").onclick = ()=> fillForm(u);
      tr.querySelector(".btn-del").onclick = async ()=>{
        if(!confirm(`¿Eliminar ${u.email}?`)) return;
        cache = cache.filter(x => norm(x.email) !== norm(u.email));
        await save(); render($("#u-buscar").value);
        if (editingKey === norm(u.email)) fillForm({});
      };
      tb.appendChild(tr);
    });
  }

  async function load(){
    try { cache = await ArtepisaData.loadCollection("users") || []; }
    catch { try{ cache = JSON.parse(localStorage.getItem("users")||"[]"); } catch{ cache=[]; } }
  }
  async function save(){
    localStorage.setItem("users", JSON.stringify(cache));
    try { await ArtepisaData.saveCollection("users", cache); } catch {}
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    const role = await Roles.init();

    // Mostrar/ocultar según rol
    if (Roles.meets("ADMIN")){
      $("#card-admin").style.display = "block";
      $("#admin-msg").textContent = `Sesión: ${Roles.current?.email} · Rol: ADMIN`;
    } else {
      $("#card-no-admin").style.display = "block";
      return;
    }

    await load(); render("");

    $("#u-guardar").onclick = async ()=>{
      const u = readForm();
      if(!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) { alert("Correo inválido"); return; }
      if(!["ADMIN","EDITOR","LECTOR"].includes(u.rol)) u.rol = "LECTOR";
      const key = norm(u.email);
      const idx = cache.findIndex(x => norm(x.email) === (editingKey ?? key));
      if (idx >= 0){
        if (editingKey !== key && cache.some(x => norm(x.email) === key)) { alert("Duplicado"); return; }
        cache[idx] = u;
      } else {
        if (cache.some(x => norm(x.email) === key)) { alert("Duplicado"); return; }
        cache.push(u);
      }
      await save(); render($("#u-buscar").value);
      editingKey = key; $("#u-email").disabled = true;
      alert("Usuario guardado");
    };

    $("#u-nuevo").onclick = ()=>{ fillForm({activo:true, rol:"LECTOR"}); $("#u-email").disabled=false; };

    $("#u-eliminar").onclick = async ()=>{
      const email = $("#u-email").value.trim(); if(!email) return;
      if(!confirm(`¿Eliminar ${email}?`)) return;
      cache = cache.filter(x => norm(x.email) !== norm(email));
      await save(); render($("#u-buscar").value); fillForm({});
    };

    $("#u-buscar").oninput = e => render(e.target.value);
  });
})();
