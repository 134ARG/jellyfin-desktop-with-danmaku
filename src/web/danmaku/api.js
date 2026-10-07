(function () {
    'use strict';

    // The factory contains no credentials. Each instance keeps its key in a
    // closure instead of publishing it on window or storing it in localStorage.
    window.createDesktopDanmakuApi = function (config) {
        let base = null;
        const apiKey = typeof config?.apiKey === 'string' ? config.apiKey : '';
        try {
            const candidate = new URL(config?.apiUrl);
            if (['https:', 'http:'].includes(candidate.protocol) &&
                !candidate.username && !candidate.password &&
                !candidate.search && !candidate.hash) {
                candidate.pathname = candidate.pathname.replace(/\/+$/, '') + '/';
                base = candidate;
            }
        } catch (_) {}

        function requireBase() {
            if (!base || !apiKey || /[\r\n]/.test(apiKey)) {
                throw new Error('Danmaku API address and key are not configured.');
            }
            return base;
        }

        return Object.freeze({
            getApiPrefix() {
                return requireBase().href.replace(/\/$/, '');
            },
            async get(url) {
                const configured = requireBase();
                const target = new URL(url);
                if (target.origin !== configured.origin ||
                    !target.pathname.startsWith(configured.pathname + 'api/v2/') ||
                    target.username || target.password || target.hash) {
                    throw new Error('Refusing a request outside the configured danmaku API.');
                }
                const response = await fetch(target.href, {
                    method: 'GET',
                    headers: { Accept: 'application/json', 'X-API-key': apiKey },
                    credentials: 'omit',
                    redirect: 'error',
                });
                if (!response.ok) {
                    throw new Error(`Danmaku API request failed (HTTP ${response.status}).`);
                }
                return response;
            },
        });
    };
})();
