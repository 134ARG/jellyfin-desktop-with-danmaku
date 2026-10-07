const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = (file) => fs.readFileSync(path.join(root, 'src/web', file), 'utf8');

function apiHarness(config, response = { ok: true, status: 200 }) {
    const requests = [];
    const context = vm.createContext({
        window: {}, URL,
        fetch: async (url, options) => {
            requests.push({ url, options });
            return response;
        },
    });
    vm.runInContext(source('danmaku/api.js'), context);
    return { api: context.window.createDesktopDanmakuApi(config), requests, context };
}

test('all danmaku routes use the plain base address and header authentication', async () => {
    const key = 'quoted"key#with=punctuation';
    const { api, requests } = apiHarness({ apiUrl: 'https://danmaku.example.com/', apiKey: key });
    assert.equal(api.getApiPrefix(), 'https://danmaku.example.com');
    for (const route of ['search/episodes?anime=A%26B', 'comment/12', 'related/12', 'extcomment?url=https%3A%2F%2Fvideo.example']) {
        await api.get(`${api.getApiPrefix()}/api/v2/${route}`);
    }
    assert.equal(requests.length, 4);
    for (const { url, options } of requests) {
        assert.equal(new URL(url).origin, 'https://danmaku.example.com');
        assert.equal(options.headers['X-API-key'], key);
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        assert.equal(url.includes(key), false);
    }
});

test('missing or invalid configuration prevents authenticated requests', async () => {
    for (const config of [
        {}, { apiUrl: 'https://danmaku.example.com', apiKey: '' },
        { apiUrl: 'https://user:password@danmaku.example.com', apiKey: 'key' },
        { apiUrl: 'https://danmaku.example.com?token=old', apiKey: 'key' },
        { apiUrl: 'file:///tmp/api', apiKey: 'key' },
        { apiUrl: 'https://danmaku.example.com', apiKey: 'key\r\ninjected' },
    ]) {
        const { api, requests } = apiHarness(config);
        await assert.rejects(api.get('https://danmaku.example.com/api/v2/comment/1'), /not configured/);
        assert.equal(requests.length, 0);
    }
});

test('the key cannot be sent to another origin or outside the API path', async () => {
    const { api, requests } = apiHarness({ apiUrl: 'https://danmaku.example.com/service/', apiKey: 'key' });
    for (const url of [
        'https://other.example.com/service/api/v2/comment/1',
        'http://danmaku.example.com/service/api/v2/comment/1',
        'https://danmaku.example.com/api/v2/comment/1',
        'https://danmaku.example.com/service/api/v2/../../private',
        'https://user:pass@danmaku.example.com/service/api/v2/comment/1',
    ]) {
        await assert.rejects(api.get(url), /outside the configured/);
    }
    assert.equal(requests.length, 0);
    await api.get(`${api.getApiPrefix()}/api/v2/comment/1`);
    assert.equal(requests.length, 1);
});

test('HTTP failures report status without exposing the key or response body', async () => {
    const { api } = apiHarness({ apiUrl: 'https://danmaku.example.com', apiKey: 'private-key' }, { ok: false, status: 401 });
    await assert.rejects(api.get(`${api.getApiPrefix()}/api/v2/comment/1`), /^Error: Danmaku API request failed \(HTTP 401\)\.$/);
});

test('unrelated Jellyfin requests receive no danmaku authentication', async () => {
    const { api, context, requests } = apiHarness({ apiUrl: 'https://danmaku.example.com', apiKey: 'private-key' });
    await api.get(`${api.getApiPrefix()}/api/v2/comment/1`);
    await context.fetch('https://jellyfin.example.com/api/danmu/item/raw');
    assert.equal(requests[1].options, undefined);
});

class Element extends EventTarget {
    constructor(tag) {
        super();
        this.tagName = tag;
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.isConnected = true;
    }
    setAttribute() {}
    appendChild(child) { this.children.push(child); }
}

function adapterHarness() {
    const body = new Element('body');
    const document = new EventTarget();
    document.body = body;
    document.documentElement = body;
    document.createElement = (tag) => new Element(tag);
    document.querySelector = (selector) => selector === '.htmlvideoplayer'
        ? body.children.find((child) => child.className === 'htmlvideoplayer')
        : null;
    const window = new EventTarget();
    const signal = () => {
        const listeners = [];
        return { connect: (callback) => listeners.push(callback), emit: (...args) => listeners.forEach((callback) => callback(...args)) };
    };
    const player = Object.fromEntries(['playing', 'paused', 'seeking', 'positionUpdate', 'finished', 'stopped', 'canceled'].map((name) => [name, signal()]));
    const seeks = [];
    player.seekTo = (ms) => seeks.push(ms);
    const rateChanged = signal();
    window.api = { player, input: { rateChanged } };
    window._mpvVideoPlayerInstance = { _currentPlayOptions: { item: { Id: 'episode-1' } } };
    class CustomEvent extends Event {
        constructor(type, options) { super(type); this.detail = options.detail; }
    }
    const context = vm.createContext({ window, document, Event, CustomEvent, console: { log() {} }, MutationObserver: class { observe() {} } });
    vm.runInContext(source('danmaku-desktop-adapter.js'), context);
    return { player, rateChanged, seeks, window, media: body.children.find((child) => child.tagName === 'video') };
}

test('the rebased player bridge preserves timing, pause, rate and seeking', () => {
    const { player, rateChanged, media, seeks } = adapterHarness();
    const events = [];
    for (const type of ['play', 'playing', 'pause', 'seeking', 'ratechange']) {
        media.addEventListener(type, () => events.push(type));
    }
    player.playing.emit();
    assert.equal(media.paused, false);
    player.positionUpdate.emit(12345);
    assert.equal(media.currentTime, 12.345);
    rateChanged.emit(1.5);
    assert.equal(media.playbackRate, 1.5);
    media.currentTime = 20;
    assert.deepEqual(seeks, [20000]);
    player.seeking.emit();
    player.paused.emit();
    assert.equal(media.paused, true);
    assert.deepEqual(events, ['play', 'playing', 'ratechange', 'seeking', 'pause']);
});

test('episode changes and playback completion update the danmaku item', () => {
    const { player, window, media } = adapterHarness();
    const items = [];
    window.addEventListener('jellyfinDesktopDanmakuItemChanged', (event) => items.push(event.detail.itemId));
    window._mpvVideoPlayerInstance._currentPlayOptions.item = { Id: 'episode-2' };
    player.playing.emit();
    player.playing.emit();
    player.finished.emit();
    assert.deepEqual(items, ['episode-2', null]);
    assert.equal(media.paused, true);
});
