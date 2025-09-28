// js/entra-admin.js
// Admin de usuarios en Entra ID usando Microsoft Graph desde la SPA.
// Requiere: msal-browser, msal-config.js (con scopes y privilegeGroups) y auth.js.

(function(){
  if (!window.MSALApp || !window.MSAL_CONFIG) {
    console.warn("MSALApp/MSAL_CONFIG no disponibles aún. entra-admin.js seguirá intentando.");
  }

  // --- Core Graph fetch ---
  async function graph(path, { method="GET", body, token, headers } = {}) {
    const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
    if (!token) token = await MSALApp.getToken(); // usa DEFAULT_SCOPES; para permisos extra, pásalos al pedir token
    const h = Object.assign({
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`
    }, headers || {});
    if (body != null && !h["Content-Type"]) h["Content-Type"] = "application/json";
    const res = await fetch(url, { method, headers: h, body: body!=null ? (typeof body==="string" ? body : JSON.stringify(body)) : undefined });
    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      throw new Error(`Graph ${method} ${url} -> ${res.status}: ${txt}`);
    }
    return res.status === 204 ? null : res.json();
  }

  // --- Privilegios por grupos (Admin/Editor/Viewer) ---
  async function myGroupIds() {
    try {
      const token = await MSALApp.getToken(["Group.Read.All"]);
      const data = await graph("/me/memberOf?$select=id,displayName", { token });
      return (data.value || []).map(x => x.id);
    } catch(e) {
      console.warn("No se pudieron leer grupos:", e.message);
      return [];
    }
  }

  async function getPrivileges() {
    const ids = new Set(await myGroupIds());
    const PG = (window.MSAL_CONFIG && window.MSAL_CONFIG.privilegeGroups) || {};
    return {
      isAdmin:  !!PG?.admin  && ids.has(PG.admin),
      isEditor: !!PG?.editor && ids.has(PG.editor),
      isViewer: !!PG?.viewer && ids.has(PG.viewer)
    };
  }

  async function can(action){
    const p = await getPrivileges();
    const matrix = {
      "user.create": p.isAdmin,                   // crear usuarios internos
      "user.invite": p.isAdmin,                   // invitar externos
      "user.group.add": p.isAdmin,                // administrar grupos
      "ot.edit": p.isAdmin || p.isEditor,
      "ot.view": p.isAdmin || p.isEditor || p.isViewer
    };
    return !!matrix[action];
  }

  // --- Acciones de administración ---
  async function createEntraUser({ userPrincipalName, displayName, mailNickname, initialPassword, forcePwdChange=true, accountEnabled=true }) {
    if (!(await can("user.create"))) throw new Error("No tienes privilegios para crear usuarios.");
    const token = await MSALApp.getToken(["User.ReadWrite.All"]);
    const body = {
      accountEnabled,
      displayName,
      mailNickname,
      userPrincipalName,
      passwordProfile: {
        forceChangePasswordNextSignIn: forcePwdChange,
        password: initialPassword
      }
    };
    return await graph("/users", { method: "POST", body, token });
  }

  async function inviteExternalUser({ invitedUserEmailAddress, invitedUserDisplayName, inviteRedirectUrl, sendInvitationMessage=true }) {
    if (!(await can("user.invite"))) throw new Error("No tienes privilegios para invitar usuarios.");
    const token = await MSALApp.getToken(["User.Invite.All"]);
    const body = {
      invitedUserEmailAddress,
      invitedUserDisplayName,
      inviteRedirectUrl: inviteRedirectUrl || (window.MSAL_CONFIG && window.MSAL_CONFIG.inviteRedirectUrl) || (window.MSAL_CONFIG && window.MSAL_CONFIG.redirectUri) || location.origin + "/dashboard.html",
      sendInvitationMessage
    };
    return await graph("/invitations", { method: "POST", body, token });
  }

  async function addUserToGroup({ userId, groupId }) {
    if (!(await can("user.group.add"))) throw new Error("No tienes privilegios para administrar grupos.");
    const token = await MSALApp.getToken(["Group.ReadWrite.All"]);
    const body = { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}` };
    return await graph(`/groups/${groupId}/members/$ref`, { method: "POST", body, token });
  }

  // --- Helpers de asignación por rol ---
  function roleToGroupId(role){
    const PG = (window.MSAL_CONFIG && window.MSAL_CONFIG.privilegeGroups) || {};
    const map = { admin: PG.admin, editor: PG.editor, viewer: PG.viewer };
    return map[(role || "").toLowerCase()] || null;
  }

  async function createUserAndAssignRole({ userPrincipalName, displayName, mailNickname, initialPassword, role="editor" }){
    const u = await createEntraUser({ userPrincipalName, displayName, mailNickname, initialPassword, forcePwdChange:true });
    const gid = roleToGroupId(role);
    if (gid) {
      try { await addUserToGroup({ userId: u.id, groupId: gid }); }
      catch(e){ console.warn("Usuario creado pero no se pudo asignar grupo:", e); }
    }
    return u;
  }

  async function inviteUserAndAssignRole({ email, displayName, role="" }){
    const inv = await inviteExternalUser({ invitedUserEmailAddress: email, invitedUserDisplayName: displayName });
    const gid = roleToGroupId(role);
    if (gid && inv?.invitedUser?.id) {
      try { await addUserToGroup({ userId: inv.invitedUser.id, groupId: gid }); }
      catch(e){ console.warn("Invitado creado pero no se pudo asignar grupo:", e); }
    }
    return inv;
  }

  window.EntraAdmin = {
    // privilegios
    getPrivileges, can,
    // primitivas
    createEntraUser, inviteExternalUser, addUserToGroup,
    // conveniencia con rol
    createUserAndAssignRole, inviteUserAndAssignRole,
    roleToGroupId
  };
})();
