/* Vaydena Lager — gemeinsamer Auth-/API-Helfer (window.LV), ohne Build-Schritt.
   Funktioniert mit und ohne geladene supabase-js (publicCall/adminCall brauchen sie nicht). */
(function () {
  "use strict";
  var SB_URL = "https://xeuexovdipdiiuzjpzkj.supabase.co";
  var SB_KEY = "sb_publishable_3dLuQ2PfEsjavJyl0fmkaA_DXB8ZS6f";
  var FN = SB_URL + "/functions/v1";
  var STORAGE_KEY = "sb-xeuexovdipdiiuzjpzkj-auth-token";

  var sb = null;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    sb = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "implicit" }
    });
  }

  function post(url, headers, payload, timeoutMs) {
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(payload || {}), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var d;
          try { d = t ? JSON.parse(t) : {}; } catch (e) { d = { error: "bad_response", raw: String(t).slice(0, 200) }; }
          return { status: r.status, data: d };
        });
      })
      .catch(function (e) { return { status: 0, data: { error: (e && e.name === "AbortError") ? "timeout" : "offline" } }; })
      .then(function (res) { if (timer) clearTimeout(timer); return res; });
  }

  function currentSession() {
    if (!sb) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; }).catch(function () { return null; });
  }
  function token() { return currentSession().then(function (s) { return s ? s.access_token : null; }); }

  // Roh-Sitzung aus dem localStorage (auch offline / bei abgelaufenem Token lesbar)
  function storedSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.access_token) ? s : null;
    } catch (e) { return null; }
  }

  function apiCall(action, payload, timeoutMs) {
    return token().then(function (t) {
      if (!t) return { status: 401, data: { error: "not_signed_in" } };
      var body = Object.assign({ action: action }, payload || {});
      return post(FN + "/lager-api", { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + t }, body, timeoutMs);
    });
  }
  function publicCall(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    return post(FN + "/lager-public", { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY }, body);
  }
  function adminCall(adminKey, action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    return post(FN + "/lager-admin", { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "x-admin-key": adminKey }, body);
  }

  function signIn(email, password) {
    if (!sb) return Promise.resolve({ data: null, error: { message: "Auth-Bibliothek nicht geladen" } });
    return sb.auth.signInWithPassword({ email: email, password: password })
      .catch(function (e) { return { data: null, error: { message: (e && e.message) || "Netzwerkfehler" } }; });
  }
  function signOut() {
    var p = sb ? sb.auth.signOut().catch(function () {}) : Promise.resolve();
    return p.then(function () { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} });
  }
  function safeNext(n) {
    n = String(n || "");
    if (!n || n.indexOf("//") >= 0 || n.indexOf(":") >= 0 || n.charAt(0) === "/" || n.charAt(0) === "\\") return "";
    return n;
  }
  function requireSession(redirectTo) {
    return currentSession().then(function (s) {
      if (s) return s;
      var next = redirectTo || (location.pathname.split("/").pop() + location.search);
      location.replace("anmelden.html?next=" + encodeURIComponent(next));
      return new Promise(function () {}); // Seite wird verlassen
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function qs(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function euro(cents) {
    return (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  var ERRORS = {
    offline: "Keine Verbindung zum Server. Bitte Internetverbindung prüfen.",
    timeout: "Der Server antwortet nicht. Bitte später erneut versuchen.",
    not_signed_in: "Bitte zuerst anmelden.",
    unauthorized: "Die Sitzung ist abgelaufen. Bitte neu anmelden.",
    bad_company: "Bitte einen Firmennamen mit mindestens 2 Zeichen angeben.",
    bad_email: "Bitte eine gültige E-Mail-Adresse angeben.",
    bad_password: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    bad_message: "Bitte eine Nachricht mit mindestens 5 Zeichen eingeben.",
    already_registered: "Für diese E-Mail-Adresse gibt es bereits einen Lager-Zugang. Bitte anmelden.",
    email_exists: "Diese E-Mail-Adresse hat bereits ein Vaydena-Konto (z. B. bei Vaydena Schulungen). Bitte das bestehende Passwort verwenden – oder auf der Anmeldeseite „Passwort vergessen“ nutzen.",
    auth_create_failed: "Das Konto konnte nicht angelegt werden. Bitte später erneut versuchen.",
    rate_limited: "Zu viele Versuche. Bitte in einer Stunde erneut versuchen.",
    invalid_token: "Dieser Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.",
    invite_used: "Diese Einladung wurde bereits verwendet. Bitte mit dem bestehenden Passwort anmelden oder „Passwort vergessen“ nutzen.",
    update_failed: "Das Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.",
    not_found: "Nicht gefunden.",
    not_registered: "Für dieses Konto gibt es noch keinen Lager-Zugang.",
    member_inactive: "Dieser Zugang wurde deaktiviert. Bitte an den Administrator Ihrer Firma wenden.",
    subscription_inactive: "Das Abo ist nicht aktiv. Buchungen bleiben auf dem Gerät gespeichert und werden nach Freischaltung übertragen.",
    forbidden: "Dafür fehlt die Berechtigung (nur Administratoren).",
    limit_items: "Die Artikelgrenze des Tarifs ist erreicht. Bitte Tarif wechseln.",
    limit_users: "Die Nutzergrenze des Tarifs ist erreicht. Bitte Tarif wechseln.",
    already_member: "Diese Person ist bereits Mitglied.",
    member_elsewhere: "Diese E-Mail-Adresse gehört bereits zu einer anderen Firma.",
    too_many_open: "Es sind bereits 3 offene Rechnungen vorhanden. Bitte zuerst bezahlen oder stornieren lassen.",
    code_exists: "Dieser Code ist bereits einem anderen Artikel zugeordnet.",
    bad_prefix: "Das Präfix darf nur Buchstaben, Ziffern und Bindestrich enthalten (max. 8 Zeichen).",
    confirm_mismatch: "Der eingegebene Name stimmt nicht mit dem Firmennamen überein."
  };
  function errText(res, fallback) {
    var code = res && res.data && res.data.error;
    if (code && ERRORS[code]) return ERRORS[code];
    if (res && res.status === 0) return ERRORS.offline;
    if (res && res.status === 401) return ERRORS.unauthorized;
    if (res && res.status === 429) return ERRORS.rate_limited;
    return fallback || ("Fehler" + (code ? " (" + code + ")" : "") + ". Bitte erneut versuchen.");
  }

  window.LV = {
    SB_URL: SB_URL, SB_KEY: SB_KEY, FN: FN, STORAGE_KEY: STORAGE_KEY, sb: sb,
    token: token, currentSession: currentSession, storedSession: storedSession,
    apiCall: apiCall, publicCall: publicCall, adminCall: adminCall,
    signIn: signIn, signOut: signOut, requireSession: requireSession, safeNext: safeNext,
    esc: esc, qs: qs, euro: euro, errText: errText, ERRORS: ERRORS
  };
})();
