// js/usuarios.js
(function () {
  const $ = (s) => document.querySelector(s);
  const norm = (s) => (s || "").trim().toLowerCase();
  const S = (v) => (v == null ? "" : String(v));

  // Cache local de tu "directorio" propio (si lo usas además de Entra)
  let cache = [];        // [{email, nombre, rol, activo}]
  let editingKey = null; // email en edición (normalizado)

  // --- utils de formulario (bloque local, NO Entra) ---
  function readForm() {
    return {
      email: $("#u-email").value.trim(),
      nombre: $("#u-nombre").value.trim(),
      rol: $("#u-rol").value, // "admin" | "editor" | "viewer"
      activo: $("#u-activo").checked,
    };
  }
  function fillForm(u = {}) {
    $("#u-email").value = u.email || "";
    $("#u-nombre").value = u.nombre || "";
    $("#u-rol").value = (u.rol || "viewer").toLowerCase();
    $("#u-activo").checked = !!u.activo;
    editingKey = u.email ? norm(u.email) : null;
    $("#u-email").disabled = !!editingKey;
  }
  function render(q = "") {
    const tb = $("#u-tabla");
    tb.innerHTML = "";
    const needle = norm(q);
    const list = cache
      .filter(
        (u) =>
          !needle ||
          norm(u.email).includes(needle) ||
          norm(u.nombre).includes(needle)
      )
      .sort((a, b) => norm(a.email).localeCompare(norm(b.email)));
    list.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.email}</td>
        <td>${u.nombre || ""}</td>
        <td>${(u.rol || "").toUpperCase()}</td>
        <td>${u.activo ? "Sí" : "No"}</td>
        <td>
          <button class="btn ghost btn-edit">Editar</button>
          <button class="btn danger btn-del">Eliminar</button>
        </td>`;
      tr.querySelector(".btn-edit").onclick = () => fillForm(u);
      tr.querySelector(".btn-del").onclick = async () => {
        if (!confirm(`¿Eliminar ${u.email}?`)) return;
        cache = cache.filter((x) => norm(x.email) !== norm(u.email));
        await save();
        render($("#u-buscar").value);
        if (editingKey === norm(u.email)) fillForm({});
      };
      tb.appendChild(tr);
    });
  }

  // --- persistencia local/OneDrive (tu capa ArtepisaData) ---
  async function load() {
    try {
      cache = (await ArtepisaData.loadCollection("users")) || [];
    } catch {
      try {
        cache = JSON.parse(localStorage.getItem("users") || "[]");
      } catch {
        cache = [];
      }
    }
  }
  async function save() {
    localStorage.setItem("users", JSON.stringify(cache));
    try {
      await ArtepisaData.saveCollection("users", cache);
    } catch {}
  }

  // --- helpers de mensajes (Entra UX) ---
  function setMsg(id, text, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", !!isError);
  }

  // =========================================================
  // Init
  // =========================================================
  document.addEventListener("DOMContentLoaded", async () => {
    // 1) Asegura sesión y privilegios reales en Entra
    await MSALApp.requireAuth();
    const privs = await EntraAdmin.getPrivileges();
    const isAdmin = !!privs.isAdmin;

    if (isAdmin) {
      $("#card-admin").style.display = "block";
      const acct = JSON.parse(sessionStorage.getItem("artepisa_account") || "null");
      $("#admin-msg").textContent = `Sesión: ${acct?.name || acct?.username || ""} · Rol: ADMIN`;
    } else {
      $("#card-no-admin").style.display = "block";
      return; // no continúes si no es admin
    }

    // 2) Carga y pinta tu lista local
    await load();
    render("");

    // =======================================================
    // CRUD local (si lo usas además de Entra)
    // =======================================================
    $("#u-guardar").onclick = async () => {
      const u = readForm();

      if (!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) {
        alert("Correo inválido");
        return;
      }
      u.rol = ["admin", "editor", "viewer"].includes((u.rol || "").toLowerCase())
        ? u.rol.toLowerCase()
        : "viewer";

      const key = norm(u.email);
      const idx = cache.findIndex(
        (x) => norm(x.email) === (editingKey ?? key)
      );

      if (idx >= 0) {
        // edición
        if (editingKey !== key && cache.some((x) => norm(x.email) === key)) {
          alert("Duplicado");
          return;
        }
        cache[idx] = u;
      } else {
        // alta
        if (cache.some((x) => norm(x.email) === key)) {
          alert("Duplicado");
          return;
        }
        cache.push(u);
      }

      await save();
      render($("#u-buscar").value);
      editingKey = key;
      $("#u-email").disabled = true;
      alert("Usuario guardado");
    };

    $("#u-nuevo").onclick = () => {
      fillForm({ activo: true, rol: "viewer" });
      $("#u-email").disabled = false;
    };

    $("#u-eliminar").onclick = async () => {
      const email = $("#u-email").value.trim();
      if (!email) return;
      if (!confirm(`¿Eliminar ${email}?`)) return;
      cache = cache.filter((x) => norm(x.email) !== norm(email));
      await save();
      render($("#u-buscar").value);
      fillForm({});
    };

    $("#u-buscar").oninput = (e) => render(e.target.value);

    // =======================================================
    // ENTRA ID: Crear usuario interno + asignar grupo por rol
    // =======================================================
    $("#ad-create")?.addEventListener("click", async () => {
      try {
        setMsg("ad-create-msg", "Creando usuario…");
        if (!(await EntraAdmin.can("user.create")))
          throw new Error("No tienes privilegios para crear usuarios.");

        const userPrincipalName = $("#ad-upn").value.trim();
        const displayName = $("#ad-name").value.trim();
        const mailNickname = $("#ad-nick").value.trim();
        const initialPassword = $("#ad-pass").value;
        const role = ($("#ad-role")?.value || "editor").toLowerCase();

        if (!/^[^@]+@[^@]+$/.test(userPrincipalName))
          throw new Error("UPN inválido.");
        if (!displayName) throw new Error("Falta nombre para mostrar.");
        if (!mailNickname) throw new Error("Falta alias (mailNickname).");
        if (initialPassword.length < 8)
          throw new Error("Contraseña muy corta (mín. 8).");

        const res = await EntraAdmin.createUserAndAssignRole({
          userPrincipalName,
          displayName,
          mailNickname,
          initialPassword,
          role,
        });

        setMsg(
          "ad-create-msg",
          `✅ Creado: ${res.userPrincipalName} · Rol: ${role.toUpperCase()}`
        );
      } catch (e) {
        setMsg("ad-create-msg", `❌ ${e.message || e}`, true);
      }
    });

    // =======================================================
    // ENTRA ID: Invitar usuario externo + (opcional) asignar
    // =======================================================
    $("#ad-invite")?.addEventListener("click", async () => {
      try {
        setMsg("ad-invite-msg", "Enviando invitación…");
        if (!(await EntraAdmin.can("user.invite")))
          throw new Error("No tienes privilegios para invitar.");

        const email = $("#ad-inv-email").value.trim();
        const displayName = $("#ad-inv-name").value.trim() || undefined;
        const role = ($("#ad-invite-role")?.value || "").toLowerCase();

        if (!/^[^@]+@[^@]+$/.test(email)) throw new Error("Email inválido.");

        const res = await EntraAdmin.inviteUserAndAssignRole({
          email,
          displayName,
          role,
        });
        const mail = res?.invitedUser?.email || email;

        if (role && EntraAdmin.roleToGroupId(role)) {
          setMsg(
            "ad-invite-msg",
            `✅ Invitación enviada a ${mail} · Grupo: ${role.toUpperCase()}`
          );
        } else {
          setMsg("ad-invite-msg", `✅ Invitación enviada a ${mail}`);
        }
      } catch (e) {
        setMsg("ad-invite-msg", `❌ ${e.message || e}`, true);
      }
    });
  });
})();
