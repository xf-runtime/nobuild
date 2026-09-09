# xF Runtime Frontend

> A deterministic, metadata-driven client execution environment designed for absolute zero-build simplicity.

The **xF Runtime Frontend** eliminates modern JavaScript build toolchains (`npm`, Vite, Webpack) in favor of native web standards: HTML, CSS, Vanilla JS, and lightweight reactivity provided by **`xf.vue.js`** (a custom fork of Petite-Vue exported under the `xfvue` global namespace). Driven by backend JSON schema metadata, the runtime dynamically assembles UI components, handles routing and authentication, manages global shell state (navigation history, command-palette search), and executes lazy-loaded component and page behavior without any compilation step.

---

## 🏗️ Architecture & Core Design

The framework functions as a dynamic client-side execution target for the xF distributed state machine:

```text
┌─────────────────────────────────────────────────────────┐
│                       index.html                        │
│   (Bootstrap 5, xfvue, xf.core.js, Base Styles)          │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
                       [XFRouter]
              ┌─────────────┴─────────────┐
              ▼                           ▼
       [Unauthenticated]           [Authenticated]
   renderStandalone(name)              mountShell()
   shell/landing.html or          shell/app.html
   pages/<name>.html                    │
              │                         ▼
              │                #xf_view_slot Mount Point
              │                         │
              │                         ▼
              │                    [XFEngine]
              │              ┌─────────────┴─────────────┐
              │              ▼                           ▼
              │     /api/xf_get Schema (y, z)     pages/<cp_*>.html
              │              │                    (Custom Page Override)
              │              ▼                           │
              │     components/qXXXX (auto)               │
              └─────────────┬─────────────────────────────┘
                            │
                            ▼
                 xfvue.createApp(...).mount()
```

### Key Architectural Pillars

1. **Zero-Build Delivery:** Files are served as raw assets. Development requires no build watch processes or transpilation steps.
2. **Metadata-Driven UI:** UI layouts and field mappings are driven by backend payloads (`y` schema definitions, `z` entity values) returned per-entity from `/api/xf_get`.
3. **`xfvue` Reactivity Substrate:** Built on top of `xfvue` (exported globally via `shell/xf.vue.js`) providing lightweight reactive scopes, custom directives, and DOM bindings (`v-model`, `v-bind`/`:`, `v-on`/`@`).
4. **Lazy Component & Page Loading:** Component controller scripts (`ComponentLoader`) and custom page controller scripts (`PageLoader`) are fetched, `eval`'d, and cached on demand — nothing loads until its template is actually rendered. Heavy vendor dependencies (SheetJS, jQuery/jQuery UI, PivotTable.js, Dragula) are pulled in lazily per-component via `XF.loadScript`.
5. **Isolated Component Scoping:** Standard input elements are pure template fragments with no JS. Components with interactive behavior isolate their controller logic under `window.F.<qCode>` (e.g. `window.F.q1500`), preventing collisions between components.
6. **Session-Aware Hash Routing:** `XFRouter` parses `#page/<name>`, `#<entity>/<id>`, and `#logout` routes, gates entity routes behind a valid JWT, remembers a `pendingRoute` through the login flow, and swaps between the unauthenticated shell (`renderStandalone`) and the authenticated app shell (`mountShell`) as session state changes.
7. **Template & Asset Caching:** `TemplateLoader` memoizes fetched HTML fragments (with a dev-mode cache-busting mode), and `window.xflush()` clears all component/page/template caches and remounts the current route for rapid iteration.

---

## 📁 Directory Structure

```text
.
├── index.html                  # Entry document & runtime bootstrap (loads xf.vue.js, xf.core.js)
├── assets/
│   ├── style.css                # Application-level CSS overrides / design tokens
│   ├── scripts.js                # Global JS utilities loaded ahead of the runtime
│   ├── favicon.ico
│   └── *.png / *.svg             # Branding & illustration assets
├── shell/
│   ├── xf.vue.js                 # Custom Petite-Vue fork (exports 'xfvue')
│   ├── xf.core.js                # Network primitives, Auth, Router, Engine, Template/Component/Page Loaders
│   ├── app.html                  # Authenticated shell frame: navbar, history, command palette, toasts, spinner
│   ├── entity.html                # Generic entity view template target (toolbar + metadata-driven grid slot)
│   └── landing.html               # Landing page, login form, and post-login dashboard template
├── components/                  # Atomic UI controls (q-namespace: qXXXX/qXXXX.html [+ qXXXX.js])
│   ├── q1000/                    # Action button (posts a named server-side action)
│   ├── q1010/                    # Form switch (checkbox)
│   ├── q1100/                    # Standard text input
│   ├── q1101/                    # Standard integer input
│   ├── q1105/                    # Stepped/decimal numeric input
│   ├── q1106/                    # Numeric input control
│   ├── q1120/                    # Textarea
│   ├── q1125/                    # Read-only display field
│   ├── q1130/                    # Color picker control
│   ├── q1155/                    # Date picker control
│   ├── q1158/                    # Time picker (with q1158.js minute-conversion helper)
│   ├── q1303/                    # Select dropdown (key/value option list)
│   ├── q1310/                    # Select dropdown (plain value list)
│   ├── q1318/                    # Select dropdown (alternate key/value schema)
│   ├── q1320/                    # FK type-ahead picker: debounced search, select, clear, redirect (q1320.js)
│   ├── q1500/                    # Interactive data grid: sort, row select, XLS export, context actions
│   │   ├── q1500.html
│   │   ├── q1500.js
│   │   └── vendor/                 # xlsx.full.min.js, filesaver.133.js (lazy-loaded)
│   ├── q1535/                    # Kanban / drag-drop board (Dragula-powered)
│   │   ├── q1535.html
│   │   ├── q1535.js
│   │   └── vendor/                 # dragula.css, dragula.min.js
│   ├── q1545/                    # Ad-hoc pivot table (PivotTable.js, lazy jQuery/jQuery UI + CSS)
│   ├── q20201/                    # Role/menu access editor (drag-to-reorder permission matrix)
│   └── q20202/                    # (companion role/access component)
└── pages/                        # Custom entity overrides & fully static pages
    ├── cp_invoice.html / .js       # Custom entity template + scoped controller (line items, PDF export)
    ├── cp_monthlyview.html / .js   # Custom entity template + scoped controller (calendar/month view)
    ├── cp_taskrec.html / .js       # Custom entity template + scoped controller (task recorder)
    └── custompage.html             # Static, unauthenticated informational page example
```

Any `.js` file placed alongside a component or page's `.html` is optional — `ComponentLoader`/`PageLoader` silently skip a missing script and continue rendering the template on its own.

---

## ⚙️ Runtime Component Mechanics

### 1. Metadata Binding System

The backend returns two primary data keys per entity, fetched from `/api/xf_get/<entity>/<id>/_/_`:

* **`z` Payload:** Holds actual field instance data (e.g., `xz.customer_name`), plus runtime record flags (`xf_id`, `xf_entity`, `xf_entityhdr`, `xf_r` read-only level, `xf_xu` custom post URL).
* **`y` Payload:** Defines structural metadata — field labels (`xy.{{ATTR}}.h`), layout classes (`xy.{{ATTR}}.c`), component code (`xy.{{ATTR}}.q`), group structures (`xf_gx`), attribute-to-group mapping (`xf_attr`), and component-specific parameters (`p1`–`p10`, `t`, `x`) used for things like FK search results, dropdown options, grid rows, and context-menu actions.

#### Placeholder Replacement

`XFEngine.composeHTML` performs template string substitution prior to mounting `xfvue`:

```html
<!-- Input Template (q1100.html) -->
<div v-bind:class="xy.{{ATTR}}.c" class="component-container">
    <label v-bind:for="'inp_{{ATTR}}'" class="field-label">{{ xy.{{ATTR}}.h }}</label>
    <input v-bind:id="'inp_{{ATTR}}'" type="text" class="glass-input" v-model="xz.{{ATTR}}">
</div>
```

When processed for attribute `first_name`, every `{{ATTR}}` token is replaced throughout the template string, producing explicit `xfvue` reactive directives bound to `xz.first_name` and `xy.first_name`.

---

### 2. Component Logic & Vendor Isolation

Components requiring complex interactive logic load their controller script asynchronously via `ComponentLoader.ensure(name)`. The controller registers itself under `window.F.<qCode>`, and any heavy vendor libraries it needs are pulled in lazily and awaited only when actually used (e.g. on export click), not on initial render.

#### Script Loading and Execution Pattern (`q1500.js` — data grid)

```javascript
(function () {
    window.F = window.F || {};

    // Vendor libraries loaded lazily via XF.loadScript, resolved once and reused
    const VENDOR_BASE = `${$tpl()}/components/q1500/vendor/`;
    const vendorReady = XF.loadScript(VENDOR_BASE + 'xlsx.full.min.js')
        .then(() => XF.loadScript(VENDOR_BASE + 'filesaver.133.js'));

    window.F.q1500 = {
        sortTable: function (dT, c, asc) { /* ... */ },
        saveToExcel: async function (data, filename = "export.xlsx") {
            if (!XFUtils.arrOk(data)) return;
            await vendorReady; // Awaits vendor scripts before triggering XLSX export
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
            XLSX.writeFile(wb, filename);
        },
        redirect: function (path, id) { $init(path, id); }
    };
})();
```

`ComponentLoader` checks a `hasJs` map (built from the `/api/xf_init` app schema) so it never issues a wasted network request for components that have no controller script.

---

### 3. Custom Pages & Page Controllers

Any entity can be routed to a fully custom template instead of the generic metadata-driven grid. `XFEngine.composeHTML` resolves the target page in this order:

1. An explicit `page` override on the entity's metadata (from `/api/xf_init`), or
2. An automatic `tk_<name>` → `pages/cp_<name>.html` convention, or
3. Falls back to the generic `shell/entity.html` grid renderer if no custom page exists.

If a `pages/cp_<name>.js` file exists alongside the template, `PageLoader.ensure` fetches and `eval`s it once (cached thereafter) before the page mounts — giving the page its own scoped helpers, calculations, or third-party integrations (e.g. `cp_invoice.js` handles line-item totals and PDF export via `jspdf`; `cp_taskrec.js` handles grouping and search helpers for the task recorder).

Static, unauthenticated pages (like `pages/custompage.html`) work the same way but are served via `XFRouter.renderStandalone` before login and require no entity metadata at all.

---

### 4. Execution Pipeline (`XFEngine` & `XFRouter`)

When navigating to an entity route (`#customer/1001`):

```text
XFRouter.navigate()
  ├─► requiresAuth? → redirect to #page/landing + remember pendingRoute if no JWT
  ├─► mountShell()               (loads shell/app.html once, mounts shellState)
  └─► XFEngine.loadEntity('customer', '1001')
        ├─► Fetch API data: GET /api/xf_get/customer/1001/_/_
        ├─► composeHTML():
        │     ├─ Resolve custom page override, OR
        │     ├─ Load base shell (shell/entity.html)
        │     ├─ Loop groups (xf_gx) & attributes (xf_attr)
        │     ├─ Ensure Component JS (ComponentLoader.ensure)
        │     └─ Fetch Component HTML, replace '{{ATTR}}', append to slot grid
        ├─► Inject combined markup into #xf_view_slot
        └─► Mount xfvue instance: xfvue.createApp(entityState).mount('#xf_view_slot')
```

The mounted `entityState` exposes `xpost(f)` (posts `xz` to `xz.xf_xu` or `/api/xf_set`, merging the response back into `xz`/`xy`), `refresh()`, `clone(src)`, and `close(targetRoute)` to every component in scope.

For non-entity routes, `XFRouter.renderPage(name)` (authenticated) or `renderStandalone(name)` (unauthenticated) fetch `pages/<name>.html` (+ optional `.js`) or `shell/landing.html` and mount a lightweight bridge instance instead.

---

## 🔐 Authentication & Session Management

* **Login:** `xsignin` hashes the username/password with a bundled SHA-256 implementation, posts to `/api/xfsignin`, and stores `xf_jwt`, `xf_user`, `xf_jwt_exp`, and `xf_app` in `localStorage`.
* **Session Restore:** On boot, `_loginjwt` silently renews the session via `/api/xfrenewsignin/<user>/<src>` using the stored user/JWT, then loads the app's component/entity schema (`loadAppSchema`) before the router mounts anything.
* **Background Refresh:** Any authenticated `_get`/`_post` call triggers `_maybeRefreshJWT`, which silently re-validates the token once `JWT_REFRESH_INTERVAL_MS` (5 minutes) has elapsed since the last refresh.
* **Forced Logout:** A `401` response, or an explicit `#logout` route, clears all session `localStorage` keys and returns the user to `#page/landing`, remembering the route they were on (`XFRouter.pendingRoute`) so they land back where they left off after re-authenticating.

---

## 🎨 Changing the CSS Framework (e.g., Bootstrap to Tailwind)

Because xF is a strict zero-build environment, you **do not use `npm install` or build CLIs** to switch CSS frameworks. To swap from default Bootstrap 5 to Tailwind CSS, perform the following 4 steps:

### Step 1: Update Global Script & Styles (`index.html`)

Remove Bootstrap CSS from `<head>` and include the Tailwind Play CDN script:

```html
<!-- REMOVE: Bootstrap CSS -->
<!-- <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"> -->

<!-- ADD: Tailwind Play CDN -->
<script src="https://cdn.tailwindcss.com"></script>
```

### Step 2: Refactor Core Shell Layouts

Translate utility class names in core structural markup files (`shell/app.html`, `shell/landing.html`, `shell/entity.html`):

* **Flex Layouts:** Change `d-flex flex-column vh-100` to `flex flex-col h-screen`.
* **Flex Alignment:** Change `justify-content-between align-items-center` to `justify-between items-center`.
* **Typography & Buttons:** Change `btn btn-primary rounded-pill` to `px-4 py-2 bg-blue-600 text-white rounded-full`.

### Step 3: Update Backend Metadata Schema (`y` Payload)

The `XFEngine` dynamically builds grid containers using CSS classes emitted by backend metadata (`y.xf_gx` groups and `y.{{ATTR}}.c` attribute wrappers). Update your backend metadata payloads to return Tailwind layout utilities:

* **Group Column Classes (`group.col`):** Change `"col-md-6"` to `"w-full md:w-1/2 p-2"`.
* **Group Card Containers (`group.card`):** Change `"card shadow-sm border-0"` to `"bg-white shadow rounded-lg border border-gray-100"`.
* **Attribute Width Classes (`xy.{{ATTR}}.c`):** Change `"col-md-4 pb-4"` to `"w-full md:w-1/3 pb-4"`.

### Step 4: Update Component Control Templates

Translate utility classes inside atomic component files in `/components/`. `xfvue` directives remain completely identical:

```html
<!-- Bootstrap Component (q1100.html) -->
<div class="pb-4" :class="xy.{{ATTR}}.c">
    <label :for="'inp_{{ATTR}}'" class="form-label">{{ xy.{{ATTR}}.h }}</label>
    <input :id="'inp_{{ATTR}}'" type="text" class="form-control" v-model="xz.{{ATTR}}">
</div>

<!-- Tailwind Component (q1100.html) -->
<div class="pb-4" :class="xy.{{ATTR}}.c">
    <label :for="'inp_{{ATTR}}'" class="block text-sm font-medium text-gray-700 mb-1">{{ xy.{{ATTR}}.h }}</label>
    <input :id="'inp_{{ATTR}}'" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 text-sm" v-model="xz.{{ATTR}}">
</div>
```

---

## 🚀 Navigation & Routing

Routing is managed via URL hash patterns, handled by `XFRouter`:

| Route Pattern | Target Logic | Auth Required |
| --- | --- | --- |
| `#page/landing` (or no hash) | Renders unauthenticated landing/login, or authenticated dashboard, from `shell/landing.html`. | No |
| `#page/<name>` | Renders a static or scripted page from `/pages/<name>.html` (+ optional `<name>.js`). | No |
| `#<entity>/<id>` | Calls `XFEngine.loadEntity()` to build a dynamic layout from metadata, or route to a `cp_<name>` custom page override. | **Yes** |
| `#logout` | Clears local storage session, returns user to `#page/landing`. | No |

Attempting an authenticated route without a valid JWT stores the route as `pendingRoute` and redirects to `#page/landing`; a successful login replays that route automatically.

---

## 🛠️ Global Shell Features

* **Command Palette / Search (`Ctrl+K`-style entry point via `$search(name, hdr)`):** Global modal driven by `shellState`, offering both an entity picker and a debounced record search against `/api/xf_get/zxf_search/...`.
* **Recent History:** `shellState.addHistory` tracks the last 9 visited entity records (deduplicated, most-recent-first) and renders them as clickable dots in the authenticated navbar (`shell/app.html`).
* **Automatic Session Management:** Authenticated endpoints attach a `Bearer` JWT plus `xfuser` header. Token refresh triggers automatically at interval boundaries (`JWT_REFRESH_INTERVAL_MS = 300000`).
* **Cache Management:** Executing `window.xflush()` clears the `TemplateLoader`, `PageLoader`, and `ComponentLoader` caches and re-renders the current route — useful for iterating on templates without a full page reload.
* **Global Helpers:** `xf.core.js` exposes a small set of window-level helpers usable from any template or controller: `$init(entity, id)` (navigate), `$xpost(f)` (post the active root instance), `$redirect(entity, id, newTab, baseUrl)`, `$search(name, hdr)`, `$tpl()` (resolve the template base path), and `XFUtils` (array/id/time helper utilities shared across components).

---

## 🚦 Local Development Setup

Because there are no compilation steps, local execution requires only a static file server:

```bash
# Using Python 3
python -m http.server 8080

# Using Node.js serve
npx serve .

# Using PHP
php -S localhost:8080
```

Navigate to `http://localhost:8080` to launch the client application runtime. Ensure API proxying is configured if target endpoints (`/api/...`) reside on an external backend server host.
