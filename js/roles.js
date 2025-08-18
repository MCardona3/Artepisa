// js/roles.js
(function(global){
  const ROLE_ORDER = { LECTOR:1, EDITOR:2, ADMIN:3 };

  const Roles = {
    current: null,      // { email, name }
    users: [],          // [{email,nombre,rol,activo}]
    role: "LECTOR",     // rol efectivo del usuario actual
    ready: false,

    async init() {
      // 1) asegurar sesión (si falla, no truena; quedas como LECTOR)
      try { if (MSALApp?.requireAuth) await MSALApp.requireAuth(); } catch(_) {}

      const acc = MSALApp?.getAccount?.();
      const email = acc?.idTokenClaims?.preferred_username || acc?.username || "";
      const name  = acc?.name || email || "";

      this.current = email ? { email, name } : null;

      // 2) cargar users.json (nube -> local)
      try {
        const list = await ArtepisaData.loadCollection("users");
        this.users = Array.isArray(list) ? list : [];
      } catch {
        try { this.users = JSON.parse(localStorage.getItem("users")||"[]"); } catch { this.users = []; }
      }

      // 3) bootstrap: si no hay users.json y hay sesión -> el primero es ADMIN
      if (!this.users.length && this.current?.email){
        this.users = [{ email: this.current.email, nombre: this.current.name, rol:"ADMIN", activo:true }];
        try { await ArtepisaData.saveCollection("users", this.users); } catch {}
        localStorage.setItem("users", JSON.stringify(this.users));
      } else {
        localStorage.setItem("users", JSON.stringify(this.users));
      }

      // 4) rol efectivo
      const u = this.users.find(x => (x.email||"").toLowerCase() === (this.current?.email||"").toLowerCase());
      this.role = (u && u.activo) ? (u.rol || "LECTOR") : "LECTOR";
      this.ready = true;
      return this.role;
    },

    // helpers de comparación
    meets(minRole){ return ROLE_ORDER[this.role] >= ROLE_ORDER[minRole]; },
    below(minRole){ return !this.meets(minRole); },
    is(r){ return this.role === r; },

    // utilidades de UI
    hideIfBelow(selOrArr, minRole){
      const arr = Array.isArray(selOrArr) ? selOrArr : [selOrArr];
      arr.forEach(s => document.querySelectorAll(s).forEach(el => { if (this.below(minRole)) el.style.display="none"; }));
    },
    disableIfBelow(selOrArr, minRole){
      const arr = Array.isArray(selOrArr) ? selOrArr : [selOrArr];
      arr.forEach(s => document.querySelectorAll(s).forEach(el => { if (this.below(minRole)) el.disabled = true; }));
    }
  };

  global.Roles = Roles;
})(window);
