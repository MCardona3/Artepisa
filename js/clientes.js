// js/clientes.js (versión mejorada con modo form-only)
(function () {
  const $ = (s) => document.querySelector(s);
  let cache = [];
  let editingKey = null; // clave de edición = nombre normalizado
  const LS_KEY = "clients"; // espejo localStorage

  // ---------- Helpers UI ----------
  function showForm(show) {
    const layout = $("#layout");
    if (!layout) return;
    if (show) {
      // Modo SOLO formulario: oculta #card-list y centra #card-form
      layout.classList.add("form-only");
      // Lleva el scroll arriba para que se vea el form completo
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } else {
      layout.classList.remove("form-only"); // vuelve a solo lista
      // focus al buscador si existe
      $("#c-buscar")?.focus();
    }
  }

  // Debounce utilitario
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  // ---------- Helpers de datos ----------
  const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const S = (v) => (v == null ? "" : String(v));

  // --- Teléfonos: solo dígitos, máscara 1 ó 2 números (10 ó 20), formateo y normalización ---
  const onlyDigits = (s) => String(s ?? "").replace(/\D+/g, "");

  // Formato progresivo para 10 dígitos: 3-3-4
  function maskLiveTen(d) {
    d = onlyDigits(d).slice(0, 10);
    const n = d.length;
    if (n <= 3) return d;
    if (n <= 6) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 6) + (n > 6 ? "-" + d.slice(6) : "");
  }

  // 10 dígitos exactos a 3-3-4
  function formatTen(d) {
    d = onlyDigits(d);
    if (d.length !== 10) return d;
    return d.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  // En vivo: 1 ó 2 teléfonos. Inserta " / " al pasar de 10 dígitos.
  function maskLiveMxMulti(v) {
    let d = onlyDigits(v).slice(0, 20); // máx 20 (dos números)
    if (d.length <= 10) return maskLiveTen(d);
    const left = d.slice(0, 10);
    const right = d.slice(10);
    return formatTen(left) + " / " + maskLiveTen(right);
  }

  // En blur: formato final bonito
  function formatPhonePair(v) {
    const d = onlyDigits(v);
    if (d.length === 10) return formatTen(d);
    if (d.length === 20) return formatTen(d.slice(0, 10)) + " / " + formatTen(d.slice(10));
    return d; // otros largos -> sólo dígitos
  }

  // Normaliza para GUARDAR: "" | "dddddddddd" | "dddddddddd/dddddddddd"
  // Devuelve "" si vacío, y null si inválido (≠10 y ≠20 dígitos)
  function normalizePhones(val) {
    const d = onlyDigits(val);
    if (d.length === 0) return "";
    if (d.length === 10) return d;
    if (d.length === 20) return d.slice(0, 10) + "/" + d.slice(10);
    return null;
  }

  // Adjunta máscara y validación de teclado/pegado
  function attachPhoneMaskMulti(el) {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      const allow = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter", "Home", "End"];
      if (allow.includes(e.key)) return;
      if (/^\d$/.test(e.key)) return; // dígitos
      if (e.key === "/") return; // permitir "/"
      e.preventDefault();
    });
    const applyMask = () => {
      el.value = maskLiveMxMulti(el.value);
      const pos = el.value.length;
      el.setSelectionRange?.(pos, pos);
    };
    el.addEventListener("input", applyMask);
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      el.value = onlyDigits(text).slice(0, 20);
      applyMask();
    });
    el.addEventListener("focus", () => {
      const d = onlyDigits(el.value).slice(0, 20);
      el.value = d.length <= 10 ? d : d.slice(0, 10) + "/" + d.slice(10);
    });
    el.addEventListener("blur", () => {
      el.value = formatPhonePair(el.value);
    });
  }

  // Normaliza/tipea objetos cliente
  function sanitizeCache(arr) {
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && typeof x === "object")
      .map((c) => ({
        IDCliente: S(c.IDCliente || c.idCliente || c.IDcliente || c.id || ""),
        Nombre: S(c.Nombre || c.nombre || ""),
        Telefono: S(c.Telefono || c.telefono || ""),
        Direccion: S(c.Direccion || c.direccion || ""),
        RFC: S(c.RFC || c.rfc || "").toUpperCase(),
        Estado: S(c.Estado || c.estado || ""),
        NombreCont: S(c.NombreCont || c.NombreContacto || c.contacto || c.contactName || ""),
        TelefonoCon: S(c.TelefonoCon || c.TelefonoContacto || c.contactoTel || c.contactPhone || "")
      }));
  }

  // ---------- Esquema de ID y generación ----------
  function detectIdScheme(list) {
    const ids = sanitizeCache(list).map((c) => c.IDCliente).filter(Boolean);
    const num = ids.filter((x) => /^\d+$/.test(x)).length;
    const cst = ids.filter((x) => /^C\d+$/i.test(x)).length;
    if (cst > 0 && cst >= num) return "C";
    if (num > 0) return "NUM";
    return "C";
  }
  function nextClientId() {
    const scheme = detectIdScheme(cache);
    const ids = sanitizeCache(cache).map((c) => c.IDCliente).filter(Boolean);
    if (scheme === "NUM") {
      const nums = ids.filter((x) => /^\d+$/.test(x)).map((x) => parseInt(x, 10));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      return String(next);
    } else {
      const nums = ids.map((x) => (x.match(/^C(\d+)$/i) || [])[1]).filter(Boolean).map((n) => parseInt(n, 10));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      return "C" + String(next).padStart(4, "0");
    }
  }

  // --- Orden por ID ascendente (soporta "123" y "C0123") ---
  function idNumericValue(id) {
    const s = (id ?? "").toString().trim();
    if (!s) return Number.POSITIVE_INFINITY; // vacíos al final
    if (/^\d+$/.test(s)) return parseInt(s, 10); // "123"
    const m = s.match(/^C(\d+)$/i); // "C0123"
    if (m) return parseInt(m[1], 10);
    const digits = s.replace(/\D+/g, ""); // rescate: toma dígitos
    return digits ? parseInt(digits, 10) : Number.POSITIVE_INFINITY;
  }
  function compareByIdAsc(a, b) {
    const av = idNumericValue(a.IDCliente);
    const bv = idNumericValue(b.IDCliente);
    if (av !== bv) return av - bv;
    const aID = (a.IDCliente ?? "").toString();
    const bID = (b.IDCliente ?? "").toString();
    const byID = aID.localeCompare(bID, "es", { sensitivity: "base" });
    if (byID !== 0) return byID;
    return (a.Nombre ?? "").localeCompare(b.Nombre ?? "", "es", { sensitivity: "base" });
  }

  // ---------- Lectura/llenado del formulario ----------
  function readForm() {
    return {
      IDCliente: $("#c-id").value.trim(),
      Nombre: $("#c-nombre").value.trim(),
      Telefono: $("#c-telefono").value.trim(),
      Direccion: $("#c-direccion").value.trim(),
      RFC: $("#c-rfc").value.trim().toUpperCase(),
      Estado: $("#c-estado").value.trim(),
      NombreCont: $("#c-contacto").value.trim(),
      TelefonoCon: $("#c-contacto-tel").value.trim()
    };
  }
  function fillForm(c = {}) {
    $("#c-id").value = S(c.IDCliente);
    $("#c-nombre").value = S(c.Nombre);
    $("#c-telefono").value = formatPhonePair(S(c.Telefono));
    $("#c-direccion").value = S(c.Direccion);
    $("#c-rfc").value = S(c.RFC);
    $("#c-estado").value = S(c.Estado);
    $("#c-contacto").value = S(c.NombreCont);
    $("#c-contacto-tel").value = formatPhonePair(S(c.TelefonoCon));

    editingKey = c.Nombre ? norm(c.Nombre) : null;
    $("#c-nombre").disabled = !!editingKey;

    showForm(true);           // ← activa modo form-only
    $("#c-nombre")?.focus();
  }

  // ---------- Esquema de columnas (un solo lugar) ----------
  const COLUMNS = [
    { key: "IDCliente", label: "ID" },
    { key: "Nombre", label: "Nombre" },
    { key: "Telefono", label: "Teléfono", formatter: (v) => formatPhonePair(v) },
    { key: "Direccion", label: "Dirección" },
    { key: "RFC", label: "RFC" },
    { key: "Estado", label: "Estado" },
    { key: "NombreCont", label: "Nombre de Contacto" },
    { key: "TelefonoCon", label: "Teléfono de Contacto", formatter: (v) => formatPhonePair(v) }
  ];

  // ---------- Render de tabla (pro + responsivo) ----------
  function render(q = "") {
    const tb = $("#c-tabla");
    tb.innerHTML = "";

    const needle = norm(q);
    const list = sanitizeCache(cache)
      .filter((c) => {
        if (!needle) return true;
        return (
          norm(c.Nombre).includes(needle) ||
          norm(c.Direccion).includes(needle) ||
          norm(c.RFC).includes(needle) ||
          norm(c.Estado).includes(needle) ||
          norm(c.NombreCont).includes(needle) ||
          norm(c.IDCliente).includes(needle) ||
          norm(c.Telefono).includes(needle) ||
          norm(c.TelefonoCon).includes(needle)
        );
      })
      .sort(compareByIdAsc);

    if (!list.length) {
      const tr = document.createElement("tr");
      const tdEmpty = document.createElement("td");
      tdEmpty.colSpan = COLUMNS.length + 1;
      tdEmpty.style.textAlign = "center";
      tdEmpty.style.padding = "18px";
      tdEmpty.style.color = "#5b6577";
      tdEmpty.textContent = "No se encontraron clientes.";
      tr.appendChild(tdEmpty);
      tb.appendChild(tr);
      return;
    }

    list.forEach((c) => {
      const tr = document.createElement("tr");

      COLUMNS.forEach((col) => {
        const cell = document.createElement("td");
        cell.setAttribute("data-label", col.label);
        const raw = c[col.key];
        const value = col.formatter ? col.formatter(S(raw)) : S(raw);
        cell.textContent = value;
        cell.title = value; // tooltip en desktop
        tr.appendChild(cell);
      });

      const acc = document.createElement("td");
      acc.className = "table-actions";
      acc.setAttribute("data-label", "Acciones");
      const btn = document.createElement("button");
      btn.className = "btn ghost btn-edit";
      btn.type = "button";
      btn.textContent = "Editar";
      btn.addEventListener("click", () => fillForm(c));
      acc.appendChild(btn);
      tr.appendChild(acc);

      // Doble click = editar
      tr.addEventListener("dblclick", () => fillForm(c));

      tb.appendChild(tr);
    });
  }

  // ---------- Persistencia con fallback (Graph -> localStorage) ----------
  async function load() {
    try {
      if (window.MSALApp && MSALApp.requireAuth) {
        try {
          await MSALApp.requireAuth();
        } catch (e) {
          console.warn("MSAL auth falló:", e);
        }
      }
      const data = await ArtepisaData.loadCollection("clients");
      cache = sanitizeCache(data);
      if (!cache.length) {
        const local = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
        cache = sanitizeCache(local);
      } else {
        localStorage.setItem(LS_KEY, JSON.stringify(cache));
      }
      render("");
      showForm(false); // entra solo lista
    } catch (e) {
      console.warn("loadCollection falló -> uso localStorage:", e);
      cache = sanitizeCache(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
      render("");
      showForm(false);
    }
  }
  async function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(sanitizeCache(cache)));
    try {
      await ArtepisaData.saveCollection("clients", sanitizeCache(cache));
    } catch (e) {
      console.warn("saveCollection falló (guardado local OK):", e);
    }
  }

  // ---------- Importación robusta (CSV/TSV/JSON, multilínea) ----------
  const stripBOM = (txt) => (txt && txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt);
  const normHeader = (h) =>
    (h || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Localiza fin del primer registro respetando comillas
  function findFirstRecordEnd(text) {
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQ && text[i + 1] === '"') {
          i++;
          continue;
        }
        inQ = !inQ;
        continue;
      }
      if (!inQ && (ch === "\n" || ch === "\r")) return i;
    }
    return text.length;
  }
  // Delimitador más probable (coma, ; o tab) en el primer registro
  function detectDelimiter(text) {
    const end = findFirstRecordEnd(text);
    const first = text.slice(0, end);
    const counts = {
      ";": (first.match(/;/g) || []).length,
      ",": (first.match(/,/g) || []).length,
      "\t": (first.match(/\t/g) || []).length
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
  }
  // Parser de tabla con comillas y MULTILÍNEA
  function parseTable(text, delim) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
          continue;
        }
        if (ch === '"') {
          inQ = false;
          continue;
        }
        cell += ch;
        continue;
      }
      if (ch === '"') {
        inQ = true;
        continue;
      }
      if (ch === delim) {
        row.push(cell);
        cell = "";
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }
      cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }
  // Convierte CSV/TSV en objetos con alias de encabezados
  function csvToObjectsFlex(text) {
    text = stripBOM(text);
    const delim = detectDelimiter(text);
    const table = parseTable(text, delim);
    if (!table.length) return [];

    const headersRaw = table[0].map((h) => h.trim());
    const H = headersRaw.map(normHeader);
    const idx = (...aliases) => {
      for (const a of aliases) {
        const i = H.indexOf(a);
        if (i >= 0) return i;
      }
      return -1;
    };

    const iNombre = idx("nombre", "razon social", "razonsocial", "name");
    const iID = idx("idcliente", "idcliente ", "id", "codigo", "codigo cliente", "clave", "id");
    const iTel = idx("telefono", "tel", "phone", "telefono1");
    const iDir = idx("direccion", "domicilio", "address");
    const iRFC = idx("rfc", "tax id", "taxid");
    const iEst = idx("estado", "state", "provincia", "estado/provincia");
    const iNomC = idx("nombrecont", "nombrecontacto", "contacto", "contactname");
    const iTelC = idx("telefonocon", "telefonocontacto", "contacto tel", "contactphone");

    const out = [];
    for (let r = 1; r < table.length; r++) {
      const cols = table[r];
      if (!cols || cols.every((c) => !c || !String(c).trim())) continue;
      out.push({
        IDCliente: iID >= 0 ? S(cols[iID]).trim() : "",
        Nombre: iNombre >= 0 ? S(cols[iNombre]).trim() : "",
        Telefono: iTel >= 0 ? S(cols[iTel]).trim() : "",
        Direccion: iDir >= 0 ? S(cols[iDir]).trim() : "",
        RFC: iRFC >= 0 ? S(cols[iRFC]).trim().toUpperCase() : "",
        Estado: iEst >= 0 ? S(cols[iEst]).trim() : "",
        NombreCont: iNomC >= 0 ? S(cols[iNomC]).trim() : "",
        TelefonoCon: iTelC >= 0 ? S(cols[iTelC]).trim() : ""
      });
    }
    return out;
  }

  // ---------- Inicio ----------
  document.addEventListener("DOMContentLoaded", async () => {
    await load();

    // Activar máscaras de teléfono
    attachPhoneMaskMulti(document.getElementById("c-telefono"));
    attachPhoneMaskMulti(document.getElementById("c-contacto-tel"));

    // Mostrar formulario vacío al pulsar "Crear / Agregar"
    $("#btn-show-form")?.addEventListener("click", () => {
      fillForm({});
      editingKey = null;
      $("#c-nombre").disabled = false;
    });

    // Cerrar formulario (botón y tecla ESC)
    $("#c-cerrar")?.addEventListener("click", () => showForm(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") showForm(false);
    });

    // Guardar / actualizar (click y Enter en inputs del form)
    const handleSave = async () => {
      const c = readForm();
      if (!c.Nombre) {
        alert("Nombre obligatorio");
        $("#c-nombre").focus();
        return;
      }

      // Normaliza teléfonos: "" | 10 dígitos | 10/10 (20 dígitos)
      const telNorm = normalizePhones(c.Telefono);
      const telcNorm = normalizePhones(c.TelefonoCon);
      if (telNorm === null) {
        alert("Teléfono del cliente inválido. Debe tener 10 dígitos o 2 teléfonos de 10 (20 en total).");
        $("#c-telefono").focus();
        return;
      }
      if (telcNorm === null) {
        alert("Teléfono de contacto inválido. Debe tener 10 dígitos o 2 teléfonos de 10 (20 en total).");
        $("#c-contacto-tel").focus();
        return;
      }
      c.Telefono = telNorm;
      c.TelefonoCon = telcNorm;

      // NO tocar ID existente; generar solo si está vacío
      if (!c.IDCliente) c.IDCliente = nextClientId();

      const key = norm(c.Nombre);
      const idx = sanitizeCache(cache).findIndex((x) => norm(x.Nombre) === (editingKey ?? key));

      if (idx >= 0) {
        if (editingKey !== key && sanitizeCache(cache).some((x) => norm(x.Nombre) === key)) {
          alert("Ya existe un cliente con ese nombre.");
          return;
        }
        cache[idx] = c;
      } else {
        if (sanitizeCache(cache).some((x) => norm(x.Nombre) === key)) {
          alert("Ya existe un cliente con ese nombre.");
          return;
        }
        cache.push(c);
      }

      cache = sanitizeCache(cache);
      await save();
      render($("#c-buscar").value);

      // Cierra el formulario (vuelve a lista) y enfoca buscador
      showForm(false);
      $("#c-buscar")?.focus();

      // Formateo visual
      $("#c-telefono").value = formatPhonePair(c.Telefono);
      $("#c-contacto-tel").value = formatPhonePair(c.TelefonoCon);

      alert("Cliente guardado" + (navigator.onLine ? " (local y nube si disponible)" : " (offline)"));
    };

    $("#c-guardar")?.addEventListener("click", handleSave);
    // Enter guarda cuando el foco está en un input del form
    document.querySelectorAll("#card-form input").forEach((inp) => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSave();
        }
      });
    });

    // Nuevo (limpia y mantiene visible el form)
    $("#c-nuevo").addEventListener("click", () => {
      fillForm({});
      editingKey = null;
      $("#c-nombre").disabled = false;
    });

    // Eliminar
    $("#c-eliminar").addEventListener("click", async () => {
      const name = $("#c-nombre").value.trim();
      if (!name) return;
      if (confirm(`¿Eliminar "${name}"?`)) {
        const key = norm(name);
        cache = sanitizeCache(cache).filter((x) => norm(x.Nombre) !== key);
        await save();
        fillForm({});
        render($("#c-buscar").value);
        editingKey = null;
        $("#c-nombre").disabled = false;
        showForm(false);
        alert("Cliente eliminado.");
      }
    });

    // Buscar (con debounce)
    $("#c-buscar").addEventListener(
      "input",
      debounce((e) => render(e.target.value), 200)
    );

    // Exportar
    $("#c-exportar").addEventListener("click", () => {
      const json = JSON.stringify(sanitizeCache(cache), null, 2);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = "clients.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // -------- Importar (CSV/TSV/JSON) preservando IDs y generando únicos por lote --------
    $("#c-importar").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const txt = await f.text();
        let data;
        const name = f.name.toLowerCase();
        if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
          data = csvToObjectsFlex(txt);
        } else {
          const parsed = JSON.parse(stripBOM(txt));
          data = Array.isArray(parsed) ? parsed : [];
        }
        if (!data.length) {
          alert("No se detectaron filas válidas en el archivo.");
          e.target.value = "";
          return;
        }

        // IDs ya usados (cache + archivo con ID)
        const used = new Set(sanitizeCache(cache).map((c) => c.IDCliente).filter(Boolean));
        sanitizeCache(data).forEach((c) => {
          const id = (c.IDCliente || "").trim();
          if (id) used.add(id);
        });

        // esquema actual (NUM o C####)
        const scheme = (() => {
          const ids = Array.from(used);
          const num = ids.filter((x) => /^\d+$/.test(x)).length;
          const cst = ids.filter((x) => /^C\d+$/i.test(x)).length;
          if (cst > 0 && cst >= num) return "C";
          if (num > 0) return "NUM";
          return "C";
        })();

        // consecutivo inicial
        let next = 1;
        if (scheme === "NUM") {
          const max = Array.from(used)
            .filter((x) => /^\d+$/.test(x))
            .reduce((m, x) => Math.max(m, parseInt(x, 10)), 0);
          next = max + 1;
        } else {
          const max = Array.from(used)
            .map((x) => (x.match(/^C(\d+)$/i) || [])[1])
            .filter(Boolean)
            .reduce((m, x) => Math.max(m, parseInt(x, 10)), 0);
          next = max + 1;
        }

        // generador único por lote
        const allocId = () => {
          if (scheme === "NUM") {
            while (used.has(String(next))) next++;
            const id = String(next);
            used.add(id);
            next++;
            return id;
          } else {
            const pad = (n) => String(n).padStart(4, "0");
            while (used.has("C" + pad(next))) next++;
            const id = "C" + pad(next);
            used.add(id);
            next++;
            return id;
          }
        };

        // Merge por Nombre (preserva ID si viene; si no, asigna único). Normaliza teléfonos.
        const map = new Map(sanitizeCache(cache).map((c) => [norm(c.Nombre), c]));
        data.forEach((raw) => {
          const c = sanitizeCache([raw])[0] || {};
          if (!c || !c.Nombre) return;

          const telNorm = normalizePhones(c.Telefono);
          const telcNorm = normalizePhones(c.TelefonoCon);
          // Si vienen inválidos, deja vacío
          const TelOut = telNorm === null ? "" : telNorm;
          const TelCOut = telcNorm === null ? "" : telcNorm;

          const incomingID = (c.IDCliente || "").trim();
          const finalID = incomingID || allocId();
          map.set(norm(c.Nombre), {
            IDCliente: finalID,
            Nombre: S(c.Nombre),
            Telefono: TelOut,
            Direccion: S(c.Direccion),
            RFC: S(c.RFC).toUpperCase(),
            Estado: S(c.Estado),
            NombreCont: S(c.NombreCont || c.NombreContacto),
            TelefonoCon: TelCOut
          });
        });

        cache = sanitizeCache([...map.values()]);
        await save();
        render($("#c-buscar").value);
        alert("Importación completada (IDs preservados y únicos)");
      } catch (err) {
        console.error(err);
        alert("No se pudo importar: " + err.message);
      } finally {
        e.target.value = "";
      }
    });

    // -------- Botón Limpiar (local y nube si disponible) --------
    const btnReset = document.getElementById("c-reset");
    btnReset?.addEventListener("click", async () => {
      if (
        !confirm(
          "¿Borrar TODOS los clientes?\n• Se eliminarán del almacenamiento local.\n• Si hay sesión con OneDrive/SharePoint, también se vaciará la colección en la nube."
        )
      )
        return;

      const originalText = btnReset.textContent;
      btnReset.disabled = true;
      btnReset.textContent = "Limpiando…";

      try {
        // 1) local
        localStorage.removeItem("clients");
        // 2) nube (no interrumpir si falla)
        try {
          await ArtepisaData.saveCollection("clients", []);
        } catch (e) {
          console.warn("No se pudo limpiar en nube:", e);
        }
        // 3) UI
        cache = [];
        editingKey = null;
        render("");
        fillForm({});
        $("#c-nombre").disabled = false;
        showForm(false);
        alert("Clientes eliminados.");
      } finally {
        btnReset.disabled = false;
        btnReset.textContent = originalText;
      }
    });
  });
})();
