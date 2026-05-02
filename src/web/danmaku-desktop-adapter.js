(function() {
    'use strict';

    const markerId = 'jellyfinDesktopDanmakuHtmlVideoPlayer';
    const mediaId = 'jellyfinDesktopDanmakuMedia';
    const state = {
        positionMs: 0,
        paused: true,
        rate: 1,
        wired: false,
        observing: false,
        itemId: null,
        media: null
    };

    function player() {
        return window._mpvVideoPlayerInstance || null;
    }

    function currentTimeMs() {
        const p = player();
        if (p && typeof p.currentTime === 'function') {
            const value = p.currentTime();
            if (typeof value === 'number' && value >= 0) return value;
        }
        return state.positionMs;
    }

    function isPaused() {
        const p = player();
        if (p && typeof p.paused === 'function') return !!p.paused();
        return state.paused;
    }

    function playbackRate() {
        const p = player();
        if (p && typeof p.getPlaybackRate === 'function') {
            const value = p.getPlaybackRate();
            if (typeof value === 'number' && value > 0) return value;
        }
        return state.rate || 1;
    }

    function currentItem() {
        return player()?._currentPlayOptions?.item || null;
    }

    function emitItemChanged() {
        const item = currentItem();
        const itemId = item?.Id || null;
        if (!itemId || itemId === state.itemId) return;

        state.itemId = itemId;
        window.dispatchEvent(new CustomEvent('jellyfinDesktopDanmakuItemChanged', {
            detail: { itemId, item }
        }));
    }

    function clearItem() {
        if (!state.itemId) return;

        state.itemId = null;
        window.dispatchEvent(new CustomEvent('jellyfinDesktopDanmakuItemChanged', {
            detail: { itemId: null, item: null }
        }));
    }

    function dispatch(type) {
        const media = ensureMedia();
        if (media) media.dispatchEvent(new Event(type));
    }

    function defineMediaProperties(media) {
        const define = (name, descriptor) => {
            try {
                Object.defineProperty(media, name, Object.assign({ configurable: true }, descriptor));
            } catch (_) {}
        };

        define('currentTime', {
            get() { return currentTimeMs() / 1000; },
            set(value) {
                const ms = Number(value) * 1000;
                if (Number.isFinite(ms) && window.api && window.api.player) {
                    window.api.player.seekTo(ms);
                }
            }
        });
        define('paused', { get: isPaused });
        define('playbackRate', { get: playbackRate });
        define('readyState', { get() { return 4; } });
    }

    function ensureMedia() {
        const realVideo = document.querySelector('video:not([data-jellyfin-desktop-danmaku])');
        if (realVideo) return realVideo;

        if (state.media && state.media.isConnected) return state.media;

        const host = document.querySelector('.videoPlayerContainer') || document.body;
        if (!host) return null;

        const media = document.createElement('video');
        media.id = mediaId;
        media.dataset.jellyfinDesktopDanmaku = '1';
        media.setAttribute('aria-hidden', 'true');
        media.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
        defineMediaProperties(media);
        host.appendChild(media);
        state.media = media;
        return media;
    }

    function ensureHtmlVideoPlayerMarker() {
        if (document.querySelector('.htmlvideoplayer')) return;
        const host = document.body || document.documentElement;
        if (!host) return;

        const marker = document.createElement('div');
        marker.id = markerId;
        marker.className = 'htmlvideoplayer';
        marker.setAttribute('aria-hidden', 'true');
        marker.style.display = 'none';
        host.appendChild(marker);
    }

    function ensurePlaybackDom() {
        ensureMedia();
        ensureHtmlVideoPlayerMarker();
    }

    function maybeActivate() {
        if (document.querySelector('.videoPlayerContainer') || player()?._currentPlayOptions) {
            ensurePlaybackDom();
            emitItemChanged();
        }
    }

    function wireSignals() {
        if (state.wired || !window.api || !window.api.player) return;
        state.wired = true;

        const p = window.api.player;
        p.playing.connect(() => {
            state.paused = false;
            ensurePlaybackDom();
            emitItemChanged();
            dispatch('play');
            dispatch('playing');
        });
        p.paused.connect(() => {
            state.paused = true;
            dispatch('pause');
        });
        p.seeking.connect(() => dispatch('seeking'));
        p.positionUpdate.connect((ms) => {
            if (typeof ms === 'number' && ms >= 0) state.positionMs = ms;
        });
        p.finished.connect(() => {
            state.paused = true;
            dispatch('pause');
            dispatch('ended');
            clearItem();
        });
        p.stopped.connect(() => {
            state.paused = true;
            dispatch('pause');
            clearItem();
        });
        p.canceled.connect(() => {
            state.paused = true;
            dispatch('pause');
            clearItem();
        });

        if (window.api.input && window.api.input.rateChanged) {
            window.api.input.rateChanged.connect((rate) => {
                if (typeof rate === 'number' && rate > 0) state.rate = rate;
                dispatch('ratechange');
            });
        }

        console.log('[DanmakuDesktop] adapter connected player signals');
    }

    function observeDom() {
        if (state.observing) return;

        const root = document.documentElement || document.body;
        if (!root) {
            document.addEventListener('DOMContentLoaded', observeDom, { once: true });
            return;
        }

        state.observing = true;
        new MutationObserver(() => {
            wireSignals();
            maybeActivate();
        }).observe(root, { childList: true, subtree: true });
    }

    console.log('[DanmakuDesktop] adapter installed');
    wireSignals();
    maybeActivate();
    observeDom();

    document.addEventListener('DOMContentLoaded', () => {
        wireSignals();
        maybeActivate();
        observeDom();
    });
})();
