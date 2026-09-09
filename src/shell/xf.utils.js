// ==========================================
// SHARED, VENDOR-FREE HELPERS
// ==========================================
// Anything here is loaded for every user on every page, so it should stay
// tiny and have zero external dependencies. Helpers that need a vendor
// library (e.g. Excel export) or are specific to one component's behaviour
// belong in that component's own folder instead — see
// templates/components/q1504/q1504.js for the pattern.
const XFUtils = {
    arrOk: function (arr) {
        return Array.isArray(arr) && arr.length > 0;
    },

    objKeys: function (obj) {
        return obj ? Object.keys(obj).filter(k => k !== 'xf_id') : [];
    },

    /**
     * Handles entity redirection and link navigation.
     * @param {string} targetEntity - The entity route to navigate to.
     * @param {number|string} targetId - The record ID.
     * @param {boolean|number} openNewTab - Whether to open in a new window/tab.
     * @param {string} customBaseUrl - Optional external URL target.
     * @param {object} currentCtx - Optional current component context (for tracking parent redirect info).
     */
    redirect: function (targetEntity, targetId, openNewTab, customBaseUrl, currentCtx) {
        // Track previous entity state for back navigation if provided
        if (currentCtx && currentCtx.xz) {
            if (currentCtx.xf_rde !== currentCtx.xz.xf_entity && currentCtx.xz.xf_id > 0) {
                currentCtx.xf_rde = currentCtx.xz.xf_entity;
                currentCtx.xf_rdi = currentCtx.xz.xf_id;
            }
        }
        if (!targetEntity) return;
        const recordId = targetId || -1;

        // Standard hash-based routing in same tab
        if (!openNewTab) {
            $init(targetEntity, recordId);
            return;
        }

        // External or New Tab Navigation
        const queryParams = new URLSearchParams({ entity: targetEntity, id: recordId }).toString();
        if (customBaseUrl && customBaseUrl.trim() !== '') {
            const separator = customBaseUrl.includes('?') ? '&' : '?';
            window.open(`${customBaseUrl}${separator}${queryParams}`, '_blank');
            return;
        }
        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        window.open(`${baseUrl}?${queryParams}`, '_blank');
    },

    // Safely converts time string (HH:MM or HH:MM:SS) to integer minutes/hhmm representation
    timeToMins: function (t) {
        if (!t) return 0;
        var parts = t.toString().split(':');
        if (parts.length < 2) return 0;
        return parseInt(parts[0].padStart(2, '0') + parts[1].padStart(2, '0'), 10);
    },

    // Safely converts integer time (845) or string to formatted HH:MM
    timeToStr: function (t) {
        if (!t && t !== 0) return "00:00";
        var ts = t.toString().padStart(4, '0');
        return ts.slice(0, 2) + ':' + ts.slice(2, 4);
    },

    parseStrJSON: function (s) {
        if (!s || typeof s !== 'string') return [];
        try { return JSON.parse(s); } catch (e) { return []; }
    },

    formatBytes: function (size, d) {
        if (size === 0) return '0 bytes';
        var k = 1024;
        d = d < 0 ? 0 : 2;
        var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(size) / Math.log(k));
        return parseFloat((size / Math.pow(k, i)).toFixed(d)) + ' ' + sizes[i];
    },

    file_up: function (cx, xzState, attrKey) {
        var maxSize = 10 * 1024 * 1024; // 10MB limit
        var targetAttr = attrKey || cx.target.id.replace('file_', '');

        // Ensure the target array is initialized reactively for Petite-Vue
        if (!Array.isArray(xzState[targetAttr])) {
            xzState[targetAttr] = [];
        }

        var files = cx.target.files;
        if (!files || files.length === 0) return;

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.size > maxSize) {
                if (typeof _alertshow === 'function') {
                    _alertshow(-1, `${file.name} exceeds the 10MB limit.`);
                }
                continue;
            }

            // Prevent adding duplicate files by name
            var isDuplicate = xzState[targetAttr].some(f => f.name === file.name);
            if (isDuplicate) continue;

            var fR = new FileReader();
            fR.fileName = file.name;
            fR.fileSize = this.formatBytes(file.size);

            fR.onload = (e) => {
                xzState[targetAttr].push({
                    name: e.target.fileName,
                    size: e.target.fileSize,
                    dataurl: e.target.result
                });
            };

            fR.readAsDataURL(file);
        }

        // Reset input value so the same file can be re-selected if removed
        cx.target.value = '';
    },

    file_down: function (dataurl, filename) {
        var a = document.createElement("a");
        a.href = dataurl;
        a.download = filename;
        a.click();
    },

    file_remove: function (fileObj, attrKey, xzState, entityName) {
        if (!xzState || !xzState[attrKey]) return;

        var index = xzState[attrKey].indexOf(fileObj);
        if (index !== -1) {
            xzState[attrKey].splice(index, 1);
            if (entityName && fileObj.url) {
                _get("/api/file_del/" + entityName + "/" + btoa(fileObj.url));
            }
        }
    },

    file_uri: function (uri) {
        if (!uri) return '';
        if (uri.startsWith('data:')) return uri;
        return window.location.origin + "/files/" + uri;
    },

    delay: function (fn, ms) { setTimeout(fn, ms); }
};
