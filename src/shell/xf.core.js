// ==========================================
// 1. GLOBAL UTILITIES & NETWORK PRIMITIVES
// ==========================================
const $id = id => document.getElementById(id);
const $ls = ls => localStorage.getItem(ls);

const $init = (entity, id = 0) => location.hash = `#${entity}/${id}`;
const $xpost = (f) => XFLive.root?.xpost?.(f);

const $redirect = (targetEntity, targetId = -1, openNewTab = false, customBaseUrl = null) => {
    if (!targetEntity) return;
    if (!openNewTab) return $init(targetEntity, targetId);
    const query = new URLSearchParams({ entity: targetEntity, id: targetId });
    const base = customBaseUrl?.trim() || `${location.origin}${location.pathname}`;
    window.open(`${base}${base.includes('?') ? '&' : '?'}${query}`, '_blank');
};

const $search = (name, hdr) => {
    const vm = XFLive.shell;
    if (!vm) return;
    vm.openSearch(name, hdr);
};
const $objKeys = (A, idOk) =>
    (A && Object.keys(A).filter(k => !k.startsWith("xf_") || (idOk && k === "xf_id"))) || [];

const $tpl = () => $id("xf_template") ? $id("xf_template").value : ".";
const JWT_REFRESH_INTERVAL_MS = 300000;

// ==========================================
// LIVE INSTANCE REGISTRY
// ==========================================
const XFLive = {
    root: null,
    shell: null,
    setRoot(vm, isShell) {
        this.root = vm;
        this.shell = isShell ? vm : null;
    },
    xa() {
        return (this.root && this.root.xa) || shellState.xa;
    }
};

function _goto(hash) {
    if (location.hash === hash) {
        XFRouter.navigate();
    } else {
        location.hash = hash;
    }
}

function _headers(unauth) {
    try {
        const b = { 'Content-Type': 'application/json' };
        if (!unauth) {
            b.Authorization = "Bearer " + $ls("xf_jwt");
            b.xfuser = $ls("xf_user");
            b.cnid = 0;
        }
        return b;
    } catch (e) { _alertshow(-1, e?.message || "Error"); }
}

function _forceLogout(message) {
    XFAuth.clearSession();
    _alertshow(-1, message || "Session expired. Please log in again.");
    if (typeof XFRouter !== 'undefined' && XFRouter.currentRoute && XFRouter.requiresAuth(XFRouter.currentRoute)) {
        XFRouter.pendingRoute = XFRouter.currentRoute;
    }
    _goto('#page/landing');
}

async function _maybeRefreshJWT() {
    const xa = XFLive.xa();
    if (!xa || !xa.jwt) return;
    const last = parseInt($ls("xf_jwt_exp") || "0", 10);
    if (Date.now() - last < JWT_REFRESH_INTERVAL_MS) return;
    localStorage.setItem("xf_jwt_exp", Date.now());
    await XFAuth.renewSession();
}

async function _get(uri, unauth) {
    try {
        const response = await fetch(uri, { method: 'GET', headers: _headers(unauth) });
        if (response.status === 401 && !unauth) { _forceLogout(); return; }
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
        const data = await response.json();
        if (!unauth) _maybeRefreshJWT();
        return data;
    } catch (e) { _alertshow(-1, e?.message || "Error"); }
}

async function _post(payload, uri, unauth) {
    try {
        const response = await fetch(uri, { method: 'POST', headers: _headers(unauth), body: JSON.stringify(payload) });
        if (response.status === 401 && !unauth) { _forceLogout(); return; }
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
        const data = await response.json();
        if (!unauth) _maybeRefreshJWT();
        return data;
    } catch (e) { _alertshow(-1, e?.message || "Error"); }
}

function SHA(i) {
    function d(a, b) { return a >>> b | a << 32 - b; } var l = Math.pow; var m = l(2, 32); var e = 'length'; var a, c; var r = ''; var f = []; var s = i[e] * 8; var b = this.SHA.h = this.SHA.h || []; var n = this.SHA.k = this.SHA.k || []; var o = n[e]; var t = {}; for (var g = 2; o < 64; g++) if (!t[g]) { for (a = 0; a < 313; a += g) t[a] = g; b[o] = l(g, 0.5) * m | 0, n[o++] = l(g, 0.3333333333333333) * m | 0; } i += '\x80'; while (i[e] % 64 - 56) i += '\0'; for (a = 0; a < i[e]; a++) { if (c = i.charCodeAt(a), c >> 8) return; f[a >> 2] |= c << (3 - a) % 4 * 8; }
    for (f[f[e]] = s / m | 0, f[f[e]] = s, c = 0; c < f[e];) { var h = f.slice(c, c += 16); var w = b; for (b = b.slice(0, 8), a = 0; a < 64; a++) { var p = h[a - 15], q = h[a - 2]; var j = b[0], k = b[4]; var u = b[7] + (d(k, 6) ^ d(k, 11) ^ d(k, 25)) + (k & b[5] ^ ~k & b[6]) + n[a] + (h[a] = a < 16 ? h[a] : h[a - 16] + (d(p, 7) ^ d(p, 18) ^ p >>> 3) + h[a - 7] + (d(q, 17) ^ d(q, 19) ^ q >>> 10) | 0); var x = (d(j, 2) ^ d(j, 13) ^ d(j, 22)) + (j & b[1] ^ j & b[2] ^ b[1] & b[2]); b = [u + x | 0].concat(b), b[4] = b[4] + u | 0; } for (a = 0; a < 8; a++) b[a] = b[a] + w[a] | 0; } for (a = 0; a < 8; a++) for (c = 3; c + 1; c--) { var v = b[a] >> c * 8 & 255; r += (v < 16 ? 0 : '') + v.toString(16); } return r;
}

function spinner(show) {
    const d = document.getElementById("xf_spinner");
    if (show) {
        if (d) d.classList.remove("d-none");
        document.body.classList.add("cursor-wait");
    } else {
        if (d) d.classList.add("d-none");
        document.body.classList.remove("cursor-wait");
    }
}

function _alertraise(A) {
    if (!A) return;
    if (A.xf_e != 0) { _alertshow(A.xf_e, A.xf_ex); } else { _alertshow(0); }
}

function _alertshow(e, ex) {
    _alertdismiss();
    const isSuccess = (e === 1);
    const barId = isSuccess ? "xf_alert_success" : "xf_alert_error";
    const msgClass = isSuccess ? ".xf_alert_msg_success" : ".xf_alert_msg_error";
    const bar = document.getElementById(barId);
    if (!bar) return;

    if (e === 1 || e === -1) {
        document.querySelectorAll(msgClass).forEach(el => el.textContent = ex); bar.classList.add("show");
        if (isSuccess) setTimeout(() => bar.classList.remove("show"), 3000);
    }
}

function _alertdismiss() {
    const s = document.getElementById("xf_alert_success");
    const err = document.getElementById("xf_alert_error");
    if (s) s.classList.remove("show");
    if (err) err.classList.remove("show");
}

// ==========================================
// 2. AUTH SERVICE & APPLICATION SCHEMA
// ==========================================
async function loadAppSchema(appId) {
    spinner(true);
    try {
        const metaData = await _get(`/api/xf_init/${appId || 1}`);
        if (metaData && metaData.xf_entities) {
            shellState.meta = metaData; shellState.meta.hasJs = {};
            (metaData.xf_components || []).forEach(c => { shellState.meta.hasJs[`q${c.v}`] = !!c.j; });
        }
    } catch (e) {
        console.error("Failed to load application schema", e);
        _alertshow(-1, "Failed to load application configuration.");
    } finally {
        spinner(false);
    }
}

const XFAuth = {
    setSession(data) {
        localStorage.setItem("xf_jwt", data.jwt);
        localStorage.setItem("xf_user", data.username);
        localStorage.setItem("xf_jwt_exp", Date.now());
        if (data.app_) localStorage.setItem("xf_app", data.app_);
        shellState.xa.jwt = data.jwt; shellState.xa.user = data.username; shellState.xa.name = data.userfullname; shellState.xa.app_ = data.app_ || 0;
    },

    clearSession() {
        localStorage.removeItem("xf_jwt");
        localStorage.removeItem("xf_user");
        localStorage.removeItem("xf_jwt_exp");
        localStorage.removeItem("xf_app");
        shellState.xa.jwt = ""; shellState.xa.user = ""; shellState.xa.name = ""; shellState.xa.app_ = 0;
    },

    async login(username, password) {
        spinner(true);
        try {
            const cleanUser = (username || '').trim().toLowerCase();
            const utc = Math.floor(Date.now() / 1000);
            const h = SHA(cleanUser + password);

            const payload = {
                cnid: 0, username: cleanUser, utc: utc,
                roleid: $id("xf_rx") ? parseInt($id("xf_rx").value) || 10 : 10,
                src: $id("xf_src") ? $id("xf_src").value || '' : '',
                hsh: SHA(h + utc.toString())
            };

            const res = await _post(payload, "/api/xfsignin", 1);
            if (!res) return { success: false, error: "No response from server" };
            if (res.mode === 1) { return { success: false, mode: 1, id: res.id || 0 }; }
            if (res.jwt) { this.setSession(res); await loadAppSchema(res.app_); return { success: true }; }

            return { success: false, error: res.ex || "Invalid Username or Password" };
        } catch (e) {
            return { success: false, error: e?.message || "Login failed" };
        } finally {
            spinner(false);
        }
    },

    async resetPassword({ id, user, p1, p2 }) {
        if (!p1 || p1 !== p2) return { success: false, error: "Passwords do not match." };

        spinner(true);
        try {
            const cleanUser = (user || '').trim().toLowerCase();
            const hsh = SHA(cleanUser + p1);
            const payload = {
                id: id, username: cleanUser,
                p1: p1, p2: p2, userfullname: "", cnid: 0, jwt: "", mode: 1, app_: 0, hsh: hsh,
                roleid: $id("xf_rx") ? parseInt($id("xf_rx").value) || 100 : 100,
                src: $id("xf_src") ? $id("xf_src").value || '' : ''
            };
            const res = await _post(payload, "/api/xfsigninreset", 1);
            if (res && (res.mode === 2 || res.e === 0 || !res.ex)) { return { success: true, mode: 2 }; }
            return { success: false, error: res?.ex || "Password reset failed." };
        } catch (e) {
            return { success: false, error: e?.message || "Error resetting password." };
        } finally {
            spinner(false);
        }
    },

    async renewSession() {
        const u = $ls("xf_user");
        const s = $id("xf_src") ? $id("xf_src").value : '';
        if (!u || !$ls("xf_jwt")) { this.clearSession(); return false; }

        const res = await _get(`/api/xfrenewsignin/${u}/${s}`);
        if (res && res.jwt) {
            this.setSession(res); await loadAppSchema(res.app_); return true;
        } else {
            _forceLogout(); return false;
        }
    }
};

// ==========================================
// 3. TEMPLATE & SCRIPT LOADERS
// ==========================================
const TemplateLoader = {
    cache: new Map(),
    devMode: true,
    async fetch(path, { noCache = false } = {}) {
        if (!noCache && this.cache.has(path)) return this.cache.get(path);
        const forceNetworkFetch = noCache || this.devMode;
        const fetchUrl = forceNetworkFetch ? `${path}?_t=${Date.now()}` : path;
        const res = await fetch(fetchUrl, forceNetworkFetch ? { cache: 'no-store' } : {});
        if (!res.ok) throw new Error(`Template not found: ${path}`);
        const html = await res.text();
        if (!noCache) this.cache.set(path, html);
        return html;
    },
    invalidate(path) { this.cache.delete(path); },
    clear() { this.cache.clear(); }
};

window.xflush = async function () {
    TemplateLoader.clear();
    PageLoader.loaded.clear();
    ComponentLoader.loaded.clear();
    await XFRouter.navigate();
    _alertshow(1, "Cache flushed and view reloaded");
};

const ComponentLoader = {
    loaded: new Set(),
    loading: new Map(),
    async ensure(name) {
        if (this.loaded.has(name)) return;
        if (this.loading.has(name)) return this.loading.get(name);

        if (shellState.meta.hasJs && shellState.meta.hasJs[name] === false) {
            this.loaded.add(name);
            return;
        }

        const p = this._load(name);
        this.loading.set(name, p);
        try {
            await p;
            this.loaded.add(name);
        } finally {
            this.loading.delete(name);
        }
    },
    async _load(name) {
        const src = `${$tpl()}/components/${name}/${name}.js`;
        try {
            const res = await fetch(src);
            if (!res.ok) return;
            const code = await res.text();
            (0, eval)(code + `\n//# sourceURL=${src}`);
        } catch (e) { }
    },
    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[data-xfc="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.dataset.xfc = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`Failed to load: ${src}`));
            document.head.appendChild(s);
        });
    }
};

const PageLoader = {
    loaded: new Set(),
    loading: new Map(),
    async ensure(name) {
        if (!name || this.loaded.has(name)) return;
        if (this.loading.has(name)) return this.loading.get(name);
        const p = this._load(name);
        this.loading.set(name, p);
        try {
            await p;
            this.loaded.add(name);
        } finally {
            this.loading.delete(name);
        }
    },
    async _load(name) {
        const src = `${$tpl()}/pages/${name}.js`;
        try {
            const res = await fetch(src);
            if (!res.ok) return;
            const code = await res.text();
            (0, eval)(code + `\n//# sourceURL=${src}`);
        } catch (e) { }
    }
};

window.XF = window.XF || {};
window.XF.loadScript = (src) => ComponentLoader.loadScript(src);

// ==========================================
// 4. XF ENGINE
// ==========================================
const XFEngine = {
    entityApp: null,
    async fetchTemplate(path) { return TemplateLoader.fetch(path); },
    getComponentName(qCode) { return `q${qCode || 1100}`; },

    async loadEntity(entityName, entityId) {
        if (this.entityApp) { this.entityApp.unmount(); this.entityApp = null; }
        if (XFRouter.pageApp) { XFRouter.pageApp.unmount(); XFRouter.pageApp = null; }

        spinner(true);
        let payload;
        try {
            payload = await _get(`/api/xf_get/${entityName}/${entityId}/_/_`);
            if (!payload || (!payload.z && !payload.y)) throw new Error("Invalid or empty response from server");
        } catch (e) {
            spinner(false);
            _alertshow(-1, "Failed to load entity: " + (e?.message || "Server Error"));
            return;
        }

        window.F = window.F || {};
        const safeZ = payload.z || { xf_entity: entityName, xf_id: entityId, xf_entityhdr: entityName, xf_r: 0 };
        const safeY = payload.y || { xf_gx: [], xf_attr: [] };

        const entityState = {
            xz: safeZ,
            xy: safeY,
            F: window.F,
            XFUtils: XFUtils,
            init: $init,
            xpost: async function (f) {
                const url = this.xz.xf_xu || "/api/xf_set";
                if (f) this.xz.xf_f = f;
                spinner(true);
                const B = await _post(this.xz, url);
                if (B && B.z) {
                    for (const g in B.z) { this.xz[g] = B.z[g]; }
                    for (const g in B.y) {
                        this.xy[g] ??= {};
                        for (const p in B.y[g]) { if (B.y[g][p]) this.xy[g][p] = B.y[g][p]; }
                    }
                    _alertraise(B.z);
                }
                spinner(false);
            },
            refresh: function () { XFEngine.loadEntity(this.xz.xf_entity, this.xz.xf_id); },
            clone: function (src) { this.xz.xf_id = -1; if (src && typeof src === 'object') Object.assign(this.xz, src); },
            close: function (targetRoute) {
                if (this.xz?.xf_entity) { shellState.addHistory(this.xz.xf_entity, this.xz.xf_id, this.xz.xf_entityhdr); }
                document.getElementById('xf_view_slot').innerHTML = '';
                if (XFEngine.entityApp) {
                    XFEngine.entityApp.unmount();
                    XFEngine.entityApp = null;
                }
                if (typeof targetRoute === 'string') location.hash = targetRoute;
            }
        };

        const finalHTML = await this.composeHTML(entityState.xy, entityName);
        const slot = document.getElementById('xf_view_slot');
        slot.innerHTML = finalHTML;

        this.entityApp = xfvue.createApp(entityState);
        this.entityApp.mount('#xf_view_slot');
        spinner(false);
    },

    async composeHTML(yMetadata, entityName) {
        let layoutPath = `${$tpl()}/shell/entity.html`;
        let html;

        const entityMeta = shellState.meta?.xf_entities?.find(e => e.name === entityName);
        const targetPage = (entityMeta && entityMeta.page) ||
            (entityName.startsWith('tk_') ? entityName.replace('tk_', 'cp_') : null);

        let isCustomPage = false;
        if (targetPage) {
            try {
                layoutPath = `${$tpl()}/pages/${targetPage}.html`;
                html = await this.fetchTemplate(layoutPath);
                await PageLoader.ensure(targetPage);
                isCustomPage = true;
            } catch (e) {
                layoutPath = `${$tpl()}/shell/entity.html`;
                html = await this.fetchTemplate(layoutPath);
            }
        } else {
            html = await this.fetchTemplate(layoutPath);
        }

        if (isCustomPage && !html.includes('<!-- SECTIONS AND COMPONENTS INJECTED HERE -->')) {
            const matches = html.match(/\bF\.(q\d+)\b/g);
            if (matches) {
                const comps = [...new Set(matches.map(m => m.split('.')[1]))];
                await Promise.all(comps.map(c => ComponentLoader.ensure(c)));
            }
            return html;
        }

        let gridHtml = '';
        if (yMetadata && Array.isArray(yMetadata.xf_gx)) {
            for (const group of yMetadata.xf_gx) {
                if (group.hide) continue;
                gridHtml += `<div class="${group.col}">
                   <div class="${group.card}">
                    <div class="${group.body || 'row card-body'}">`;

                const attributes = (yMetadata.xf_attr || []).filter(a => yMetadata[a] && yMetadata[a].g === group.id);

                for (const attrKey of attributes) {
                    const qCode = yMetadata[attrKey]?.q;
                    const name = this.getComponentName(qCode);
                    const componentPath = `${$tpl()}/components/${name}/${name}.html`;

                    try {
                        await ComponentLoader.ensure(name);
                        let compHtml = await this.fetchTemplate(componentPath);
                        compHtml = compHtml.replaceAll('{{ATTR}}', attrKey);
                        gridHtml += compHtml;
                    } catch (err) {
                        console.warn(`Template missing: ${name}`, err);
                    }
                }
                gridHtml += `</div></div></div>`;
            }
        }

        return html.replace('<!-- SECTIONS AND COMPONENTS INJECTED HERE -->', gridHtml);
    }
};

// ==========================================
// 5. LANDING SCOPE & ROUTER
// ==========================================

function createLandingContext() {
    return {
        xa: shellState.xa,
        F: window.F || {},
        XFUtils: XFUtils,
        auth: {
            user: '',
            pw: '',
            p1: '',
            p2: '',
            mode: 0,
            id: 0,
            ex: ''
        },
        async submitLogin() {
            this.auth.ex = '';
            const res = await XFAuth.login(this.auth.user, this.auth.pw);
            if (res.success) {
                const t = XFRouter.pendingRoute;
                XFRouter.pendingRoute = null;
                const nextHash = t && t.kind === 'entity' ? `#${t.entity}/${t.id}` : '#page/landing';
                _goto(nextHash);
            } else if (res.mode === 1) {
                this.auth.mode = 1;
                this.auth.id = res.id;
                this.auth.pw = '';
            } else {
                this.auth.ex = res.error || "Login failed: Invalid credentials";
            }
        },
        async submitReset() {
            this.auth.ex = '';
            const res = await XFAuth.resetPassword({
                id: this.auth.id,
                user: this.auth.user,
                p1: this.auth.p1,
                p2: this.auth.p2
            });
            if (res.success) {
                this.auth.mode = 2;
            } else {
                this.auth.ex = res.error || "Password reset failed.";
            }
        },
        resetContinue() {
            this.auth.mode = 0;
            this.auth.p1 = '';
            this.auth.p2 = '';
            this.auth.pw = '';
            this.auth.ex = '';
        }
    };
}

const XFRouter = {
    shellApp: null,
    pageApp: null,
    isShellMounted: false,
    currentRoute: null,
    pendingRoute: null,

    parse(hash) {
        const h = (hash ?? location.hash).replace(/^#\/?/, '');
        const [kind, a] = h.split('/');
        if (!kind || kind === 'login') return { kind: 'page', name: 'landing' };
        if (kind === 'logout') return { kind: 'logout' };
        if (kind === 'page') return { kind: 'page', name: a || 'landing' };
        return { kind: 'entity', entity: kind, id: a || -1 };
    },

    requiresAuth(route) {
        return route.kind === 'entity';
    },

    async init() {
        window.addEventListener('hashchange', () => this.navigate());
        if (!location.hash) {
            location.hash = '#page/landing';
        } else {
            await this.navigate();
        }
    },

    async navigate() {
        const route = this.parse();
        this.currentRoute = route;

        if (route.kind === 'logout') {
            shellState.logout();
            _goto('#page/landing');
            return;
        }

        if (this.requiresAuth(route) && !shellState.xa.jwt) {
            this.pendingRoute = route;
            _goto('#page/landing');
            return;
        }

        if (!shellState.xa.jwt) {
            const targetPage = (route.kind === 'page' && route.name) ? route.name : 'landing';
            await this.renderStandalone(targetPage);
            return;
        }

        await this.mountShell();

        if (route.kind === 'page') await this.renderPage(route.name);
        if (route.kind === 'entity') await XFEngine.loadEntity(route.entity, route.id);
    },

    async renderStandalone(name) {
        if (this.shellApp) { this.shellApp.unmount(); this.shellApp = null; }
        if (XFEngine.entityApp) { XFEngine.entityApp.unmount(); XFEngine.entityApp = null; }
        if (this.pageApp) { this.pageApp.unmount(); this.pageApp = null; }

        this.isShellMounted = false;
        const pagePath = name === 'landing' ? `${$tpl()}/shell/landing.html` : `${$tpl()}/pages/${name}.html`;

        if (name !== 'landing') await PageLoader.ensure(name);

        let html;
        try {
            html = await TemplateLoader.fetch(pagePath);
        } catch (e) {
            html = `<div class="p-5 text-center text-muted"><h4>Page "${name}" not found.</h4></div>`;
        }

        document.getElementById('xf_root').innerHTML = html;
        this.pageApp = xfvue.createApp(createLandingContext());
        const vm = this.pageApp.mount('#xf_root');
        XFLive.setRoot(vm, false);
    },

    async mountShell() {
        if (this.isShellMounted) return;
        const shellHtml = await TemplateLoader.fetch(`${$tpl()}/shell/app.html`);
        document.getElementById('xf_root').innerHTML = shellHtml;

        if (this.shellApp) this.shellApp.unmount();
        this.pageApp = null;
        if (XFEngine.entityApp) { XFEngine.entityApp.unmount(); XFEngine.entityApp = null; }

        this.shellApp = xfvue.createApp(shellState);
        const vm = this.shellApp.mount('#xf_app_shell');
        XFLive.setRoot(vm, true);

        this.isShellMounted = true;
    },

    async renderPage(name) {
        if (XFEngine.entityApp) { XFEngine.entityApp.unmount(); XFEngine.entityApp = null; }
        if (this.pageApp) { this.pageApp.unmount(); this.pageApp = null; }

        if (name !== 'landing') await PageLoader.ensure(name);

        let html;
        try {
            const pagePath = name === 'landing' ? `${$tpl()}/shell/landing.html` : `${$tpl()}/pages/${name}.html`;
            html = await TemplateLoader.fetch(pagePath);
        } catch (e) {
            html = `<div class="p-4 text-center text-muted">Page "${name}" not found.</div>`;
        }

        const slot = document.getElementById('xf_view_slot');
        slot.innerHTML = html;
        this.pageApp = xfvue.createApp(createLandingContext());
        this.pageApp.mount('#xf_view_slot');
    }
};

let _searchTimeout = null;

const shellState = {
    xa: { jwt: '', user: '', name: '', app_: 0 },
    meta: { xf_version: "", xf_entities: [], xf_components: [] },
    history: [],
    searchQuery: "",
    showSearchModal: false,
    searchMode: false,
    selectedEntity: null,
    searchResults: [],
    isSearching: false,

    openSearch: function (name, hdr) {
        this.showSearchModal = true;
        if (name) {
            this.openEntity({ name: name, hdr: hdr });
        } else {
            this.searchMode = false;
            this.selectedEntity = null;
            this.searchQuery = "";
            this.searchResults = [];
        }
    },

    get filteredEntities() {
        if (!this.searchQuery) return this.meta.xf_entities;
        const q = this.searchQuery.toLowerCase();
        return this.meta.xf_entities.filter(e => e.hdr.toLowerCase().includes(q));
    },

    openEntity: function (entity) {
        if (entity.a) {
            this.closeSearchModal();
            $init(entity.name, 0);
        } else {
            this.searchMode = true;
            this.selectedEntity = entity;
            this.searchQuery = "";
            this.searchResults = [];
            this.executeRecordSearch();
        }
    },

    addHistory: function (entity, id, hdr) {
        if (!entity) return;
        const idx = this.history.findIndex(h => h.entity === entity && h.id === id);
        if (idx !== -1) this.history.splice(idx, 1);
        const entityMeta = this.meta.xf_entities?.find(e => e.name === entity);
        const title = hdr || entityMeta?.hdr || entity;
        this.history.unshift({ entity, id, title });
        if (this.history.length > 9) this.history.pop();
    },

    openHistory: function (item) {
        $init(item.entity, item.id);
    },

    onSearchInput: function () {
        if (this.searchMode) {
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(() => this.executeRecordSearch(), 300);
        }
    },

    executeRecordSearch: async function () {
        if (!this.selectedEntity || !this.xa.jwt) return;
        this.isSearching = true;
        try {
            const q = this.searchQuery.trim();
            const url = `/api/xf_get/zxf_search/0/entity=${this.selectedEntity.name}&query=${encodeURIComponent(q)}`;
            const res = await _get(url);
            this.searchResults = (res && res.z && res.z.data) ? res.z.data : [];
        } catch (e) {
            console.error("Search failed", e);
            this.searchResults = [];
        } finally {
            this.isSearching = false;
        }
    },

    openRecord: function (id) {
        this.closeSearchModal();
        $init(this.selectedEntity.name, id);
    },

    closeSearchModal: function () {
        if (document.activeElement) document.activeElement.blur();
        this.showSearchModal = false;
        setTimeout(() => {
            this.searchMode = false;
            this.selectedEntity = null;
            this.searchQuery = "";
            this.searchResults = [];
        }, 200);
    },

    resetToEntitySearch: function () {
        this.searchMode = false;
        this.selectedEntity = null;
        this.searchQuery = "";
        this.searchResults = [];
    },

    logout: function () {
        XFAuth.clearSession();
    }
};

// ==========================================
// 6. INITIALIZATION BOOTSTRAP
// ==========================================
async function bootApp() {
    await XFAuth.renewSession();
    await XFRouter.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

// ==========================================
// SHARED, VENDOR-FREE HELPERS
// ==========================================
window.XFUtils = window.XFUtils || {
    objKeys: function (obj) { return obj ? Object.keys(obj).filter(k => k !== 'xf_id') : []; },
    arrOk: arr => Array.isArray(arr) && arr.length > 0,
    arrExists: (arr, val) => Array.isArray(arr) && arr.includes(val),
    arrToggle: (arr, val) => { const i = arr?.indexOf(val); ~i ? arr.splice(i, 1) : arr?.push(val); },
    arrPushIds: (arr, field = "xf_id") => Array.isArray(arr) ? arr.map(x => x?.[field]) : [],
    arrKVexists: (arr, val) => val != null && Array.isArray(arr) && arr.some(x => x?.v === val),
    arrDistinct: (arr, field) => Array.isArray(arr) ? [...new Set(arr.map(x => x?.[field]))] : [],
    arrPushObj: (arr, obj) => { Array.isArray(arr) && obj && typeof obj === 'object' && arr.push({ ...obj }); },

    timeToMins: t => (([h, m]) => m !== undefined ? +(h.padStart(2, '0') + m.padStart(2, '0')) : 0)(String(t || '').split(':')),
    timeToStr: t => String(t ?? 0).padStart(4, '0').replace(/(..)(..)/, '$1:$2'),
    delay: function (fn, ms) { setTimeout(fn, ms); }
};