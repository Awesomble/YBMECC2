/* abm-shaders.js — ABMEN 셰이더 브리지: HyperFrames `hf-seek` → Shaders(shaders.com) 프레임 고정 렌더.
 * 정본 docs/14-hyperframes.md §16. index.html <head> 가 shaders-core.js 다음에 한 번 싣는다
 * (`node pipeline/shader-fx.mjs <p> install`). 프레임은 ABMShaders.mount(...) 만 부른다.
 * 이 파일을 고치면 `node pipeline/shader-fx.mjs selftest` 로 결정성을 다시 잰다.
 *
 * 2026-10-08 PoC 실측으로 굳힌 규칙(docs/02-pitfalls.md §181):
 *   ① 매 seek 마다 시계를 0 으로 되돌리고 t 로 한 번에 간다 — 증분 delta 는 워커 수에 따라 1~2 코드값 어긋났다
 *   ② 이미지가 디코드될 때까지 데운다 — 로더는 첫 합성 때 시작해, 데우지 않으면 워커 하나가 이미지 없는 프레임을 찍었다.
 *      완료 표시(getNaturalSize)는 URL 단위로 페이지 전체가 공유하므로 렌더러마다 URL 에 #abm-N 을 달아 따로 잰다
 *   ③ hf-seek 의 time 은 루트 시각이고 숨은 프레임에도 온다 — 마운트한 슬롯의 data-start 를 빼고 구간 밖은 건너뛴다.
 *      구간을 벗어나면 렌더러를 놓고 다시 들어오면 새로 만든다(selftest 가 이 경로도 지난다)
 *   ⑤ compute 를 쓰는 효과(Blur·Glow·FilmStock 등)는 한 프레임 늦게 반영된다 — 0.2초를 그리면 직전 시크 화면의 블러가 나왔다.
 *      selftest 가 잰 효과별 안정 횟수(ShadersCore.settle)만큼 같은 t 를 다시 그린다
 *   ⑥ FilmGrain animated 등 켜면 CPU 누산기가 도는 prop 은 시계를 되돌려도 초기화되지 않는다 — ShadersCore.unsafe 의 prop 은 기본값만 받는다
 *   ⑦ 버퍼는 캔버스 width/height 속성 크기·배율 1 로 고정한다 — 화면상 크기를 따르면 조상 변형에 따라 워커마다 달라진다
 *   ④ 실패는 조용히 넘기지 않는다 — 코드 오류(마운트 때 포함)는 자홍 판 + 그 슬롯 seek 의 waitUntil reject(HyperFrames 캡처가 멈춘다).
 *      GPU 가 없는 검사 브라우저(layout-scan 의 --disable-gpu)만 캔버스를 자홍으로 칠하고 통과시킨다.
 */
(function () {
  'use strict';
  if (window.ABMShaders) return;
  var SC = window.ShadersCore;
  var EPS = 1 / 120;                 // 60fps 반 프레임 — 경계 시각은 양쪽 슬롯이 모두 그린다
  var WARM_TRIES = 400, WARM_MS = 25; // 이미지 디코드 대기 최대 10초
  var PALETTE = { navy: '#FFF7EE', blue: '#A51D4D', cream: '#2B1420', lime: '#FFC23D', coral: '#F69321', white: '#FFFFFF' };   // YBMECC: 키 이름은 ABMEN 역할 이름(navy=paper·cream=ink·blue=accent·coral=warm) — 값은 brand.json
  var mounts = [], seq = 0;   // seq: 렌더러마다 이미지 URL 에 다는 조각 번호
  var state = window.__abmShaders = { mounts: mounts, errors: [], gpu: 'unknown' };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function msg(e) { return String((e && e.message) || e); }

  // ── 실패 표시 ────────────────────────────────────────────────────────────
  function showError(m, e) {
    var text = msg(e);
    state.errors.push((m ? m.name + ': ' : '') + text);
    console.error('[abm-shaders] ' + (m ? m.name + ': ' : '') + text);
    if (!m || !m.canvas.parentNode || m.errEl) return;
    var d = document.createElement('div');
    d.className = 'abm-shader-error';
    d.textContent = 'SHADER ERROR ' + m.name + ' — ' + text;
    d.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:2147483000;background:#FF00FF;' +
      'color:#000;font:700 34px/1.25 monospace;padding:120px 60px;box-sizing:border-box;white-space:pre-wrap';
    m.canvas.parentNode.appendChild(d);
    m.errEl = d;
  }
  function paintNoGpu(m, why) {
    state.gpu = 'none';
    console.warn('[abm-shaders] ' + m.name + ': ' + why + ' — 셰이더 없이 넘어간다(검사 브라우저). 렌더는 data-requires-webgpu 가 막는다');
    try {
      var g = m.canvas.getContext('2d');
      if (!g) return;
      g.fillStyle = '#FF00FF'; g.fillRect(0, 0, m.canvas.width, m.canvas.height);
      g.fillStyle = '#000'; g.font = '700 40px monospace'; g.fillText('NO WEBGPU — ' + m.name, 40, 120);
    } catch (e) { /* 이미 webgpu 컨텍스트면 칠할 수 없다 */ }
  }

  // ── 레이어 검증: 번들에 없는 효과·없는 prop 은 마운트 순간 막는다 ────────────────
  // FilmGrain animated 같은 prop 은 켜면 CPU 누산기가 돌고 시계를 되돌려도 초기화되지 않는다 — selftest 가 찾아 ShadersCore.unsafe 에 적는다
  function sameAsDefault(type, k, v, def) {
    var list = (SC.unsafe || {})[type];
    return !list || list.indexOf(k) < 0 || JSON.stringify(v) === JSON.stringify(def.props[k].default);
  }
  function normalize(name, layers) {
    if (!Array.isArray(layers) || !layers.length) throw new Error('layers 가 비었다');
    var ids = {}, n = 0, imgs = [];
    function one(c, path) {
      if (!c || typeof c.type !== 'string') throw new Error(path + ': type 이 없다');
      var def = SC.components[c.type];
      if (!def) throw new Error(path + ': ' + c.type + ' 은 번들에 없다 — 시간 결정성이 없거나(시뮬레이션·포인터) 원격 자원을 쓰는 효과다. 목록: node pipeline/shader-fx.mjs list');
      var props = c.props || {};
      Object.keys(props).forEach(function (k) {
        if (!(k in def.props)) throw new Error(path + ': ' + c.type + ' 에 ' + k + ' prop 이 없다 (가능: ' + Object.keys(def.props).join(', ') + ')');
        if (!sameAsDefault(c.type, k, props[k], def)) throw new Error(path + ': ' + c.type + '.' + k + ' 는 기본값(' + JSON.stringify(def.props[k].default) + ')만 쓴다 — 켜면 앞서 그린 프레임 수에 따라 결과가 갈린다(selftest)');
      });
      // MeshGradient 등: stops 기본값이 살아 있으면 colorA/colorB 는 무시된다(2026-10-08 PoC 에서 기본 분홍·주황이 나왔다)
      if ('stops' in def.props && props.stops === undefined && ('colorA' in props || 'colorB' in props))
        throw new Error(path + ': ' + c.type + ' 의 색은 stops 로 준다 — colorA/colorB 는 stops:null 일 때만 쓰인다. ABMShaders.stops([...]) 를 쓴다');
      var id = c.id || (name + '-' + c.type + '-' + (n++));
      if (ids[id]) throw new Error(path + ': id ' + id + ' 가 중복이다');
      ids[id] = def;
      var full = {};
      Object.keys(def.props).forEach(function (k) { full[k] = props[k] !== undefined ? props[k] : def.props[k].default; });
      var node = { id: id, def: def, props: full, children: (c.children || []).map(function (ch, i) { return one(ch, path + '.children[' + i + ']'); }) };
      if (c.type === 'ImageTexture') {
        if (!props.url) throw new Error(path + ': ImageTexture 에 url 이 없다');
        node.baseUrl = String(props.url).split('#')[0];
        imgs.push(node);
      }
      return node;
    }
    var tree = layers.map(function (c, i) { return one(c, name + '.layers[' + i + ']'); });
    // 한 프레임 늦는 효과가 이어지면 늦음이 더해진다 — 1 + Σ(안정 횟수 − 1)
    var renders = 1, settle = SC.settle || {};
    Object.keys(ids).forEach(function (id) { renders += Math.max(0, (settle[ids[id].name] || 1) - 1); });
    return { tree: tree, ids: ids, imgs: imgs, urls: [], renders: renders };
  }

  // ── 시각: 이 캔버스를 품은 컴포지션 슬롯들의 시작초를 뺀다 ────────────────────────
  // HyperFrames 가 컴파일한 DOM(렌더·snapshot)에서 슬롯은 data-composition-id + data-start + data-hf-authored-duration 이고
  // data-composition-src·data-duration 은 없다(2026-10-08 snapshot 실측 — src 만 찾던 첫 판은 at(t) 에 루트 시각을 넘겼다).
  // 프리뷰 런타임은 index.html 그대로 src·duration 을 단다. 둘 다 받는다. 묶음(챕터 안 프레임)은 시작초가 더해진다
  function hostOf(el) {
    var start = 0, near = null, dur = NaN;
    for (var p = el.parentElement; p; p = p.parentElement) {
      if (!p.hasAttribute('data-composition-id') || !p.hasAttribute('data-start')) continue;
      start += Number(p.getAttribute('data-start')) || 0;
      if (!near) {
        near = p;
        dur = Number(p.getAttribute('data-duration') || p.getAttribute('data-hf-authored-duration'));
      }
    }
    return { start: start, dur: dur > 0 ? dur : Infinity, id: near ? (near.id || near.getAttribute('data-composition-id')) : 'page' };
  }

  // ── 렌더러 ──────────────────────────────────────────────────────────────
  function register(r, tree) {
    r.registerNode('abm-root', SC.rootPassthrough.fragment, null, null, {}, SC.rootPassthrough);
    (function reg(list, parent) {
      list.forEach(function (c, i) {
        r.registerNode(c.id, c.def.fragment, parent, { blendMode: 'normal', renderOrder: i, id: c.id }, SC.createGpuUniformsMap(c.def, c.props, c.id), c.def);
        reg(c.children, c.id);
      });
    })(tree, 'abm-root');
  }
  function failed(r) { var f = r.getFailureReason && r.getFailureReason(); return f ? new Error('렌더러 실패: ' + (f.message || f.kind || JSON.stringify(f))) : null; }

  async function init(m) {
    if (!navigator.gpu) return paintNoGpu(m, 'navigator.gpu 없음');
    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return paintNoGpu(m, 'WebGPU 어댑터 없음');
    state.gpu = 'ok';
    // 이미지 크기 레지스트리(getNaturalSize)는 URL 하나를 페이지 전체가 같이 쓴다 — 다른 렌더러(다른 프레임, 또는 놓았다가 다시 만든
    // 이 마운트)가 같은 사진을 먼저 읽었으면 이 렌더러의 텍스처가 아직인데도 「읽음」이 된다. 렌더러마다 URL 조각을 새로 단다(fetch 는 조각을 보내지 않는다)
    var tag = '#abm-' + (++seq);
    m.spec.urls = m.spec.imgs.map(function (node) { return (node.props.url = node.baseUrl + tag); });
    var r = SC.shaderRendererGPU();
    // 버퍼 크기는 캔버스 width/height 속성으로 고정한다. 렌더러는 기본으로 화면상 크기(getBoundingClientRect — 조상 카메라 줌·묶음 무대 축소가 섞인다)로
    // 잡고 부모 요소 크기를 따라가는데, 그러면 처음 seek 한 시각에 따라 버퍼가 달라져 워커마다 다른 화면이 된다
    await r.initialize({ canvas: m.canvas, forceFullFrameRate: true, observeElement: false });
    r.beginRecordingResolution(m.size[0], m.size[1], 1);
    register(r, m.spec.tree);
    r.stopAnimation();
    r.setFrameLocked(true);
    var ready = false;
    r.setOnReady(function () { ready = true; });
    var urls = m.spec.urls;
    var loaded = function () { return urls.every(function (u) { return !!SC.getNaturalSize(u); }); };
    for (var i = 0; i < WARM_TRIES && !(ready && loaded()); i++) {
      await r.renderSyntheticFrame(0);
      var f = failed(r); if (f) throw f;
      await sleep(WARM_MS);
    }
    if (!loaded()) throw new Error('이미지를 읽지 못했다: ' + urls.filter(function (u) { return !SC.getNaturalSize(u); }).join(', ') + ' (index.html 기준 상대 경로인가)');
    if (!ready) throw new Error('첫 합성이 끝나지 않았다 (10초)');
    await r.renderSyntheticFrame(0);                       // 이미지가 들어온 뒤의 합성 한 번
    m.r = r;
  }

  async function renderAt(m, t) {
    var r = m.r;
    if (!r) return;
    var u = m.at ? (m.at(t) || {}) : null;
    for (var i = 0; i < m.renders; i++) {
      r.setFrameLocked(false); r.setFrameLocked(true);     // 시계 0 — 프레임 결과가 t 하나의 함수가 된다
      if (u) Object.keys(u).forEach(function (id) {
        var def = m.spec.ids[id];
        if (!def) throw new Error('at(): 없는 레이어 id ' + id);
        Object.keys(u[id]).forEach(function (k) {
          if (!(k in def.props)) throw new Error('at(): ' + id + ' 에 ' + k + ' prop 이 없다');
          if (!sameAsDefault(def.name, k, u[id][k], def)) throw new Error('at(): ' + def.name + '.' + k + ' 는 기본값만 쓴다(selftest)');
          r.updateUniformValue(id, k, u[id][k]);
        });
      });
      await r.renderSyntheticFrame(t);
      var f = failed(r); if (f) throw f;
    }
  }

  function release(m) {
    try { if (m.r && m.r.cleanup) m.r.cleanup(); } catch (e) { /* 정리 실패는 다음 초기화가 덮는다 */ }
    m.r = null; m.inited = null;
  }

  // 같은 마운트의 렌더는 하나씩. 밀린 요청은 마지막 시각 하나로 합친다(스튜디오 스크럽)
  function request(m, t) {
    m.want = t; m.dirty = true;
    if (!m.busy) {
      m.busy = (async function () {
        try {
          if (!m.inited) m.inited = init(m);
          await m.inited;
          while (m.dirty) { m.dirty = false; await renderAt(m, m.want); }
        } catch (e) { showError(m, e); throw e; }
        finally { m.busy = null; }
      })();
    }
    return m.busy;
  }

  window.addEventListener('hf-seek', function (e) {
    var d = e.detail || {}, T = Number(d.time) || 0;
    mounts.forEach(function (m) {
      if (m.dead) return;
      var h = m.host || (m.host = hostOf(m.canvas));
      var t = T - h.start;
      if (t < -EPS || t > h.dur + EPS) {                   // 숨은 슬롯 — GPU 작업 없음, 쓰던 렌더러는 놓는다(프레임마다 1080×1920 렌더러가 쌓이지 않게)
        if (m.r && !m.busy) release(m);
        return;
      }
      if (m.error) {                                       // 마운트 오류 — 이 슬롯의 캡처를 멈춘다
        if (typeof d.waitUntil === 'function') d.waitUntil(Promise.reject(m.error));
        return;
      }
      var p = request(m, Math.min(Math.max(t, 0), h.dur));
      if (typeof d.waitUntil === 'function') d.waitUntil(p);   // 리스너 안에서 동기로 불러야 한다
    });
  });

  window.ABMShaders = {
    palette: PALETTE,
    // ABMShaders.stops(['navy','blue','navy']) → 고르게 놓인 브랜드 색 stops. 색 이름 대신 '#hex' 도 된다
    stops: function (colors) {
      return colors.map(function (c, i) { return { color: PALETTE[c] || c, position: colors.length > 1 ? i / (colors.length - 1) : 0 }; });
    },
    // canvas: 요소 또는 선택자. opts.layers: [{type, id?, props?, children?}] · opts.at: t(이 슬롯 안의 초) → {레이어id: {prop: 값}}
    mount: function (canvas, opts) {
      var el = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
      var name = (el && (el.id || el.className)) || String(canvas);
      var m = { name: name, canvas: el, at: opts && opts.at };
      try {
        if (!SC || !SC.components) throw new Error('shaders-core.js 가 안 실렸다 — node pipeline/shader-fx.mjs <p> install');
        if (!el || el.tagName !== 'CANVAS') throw new Error('캔버스를 찾지 못했다: ' + canvas);
        if (m.at && typeof m.at !== 'function') throw new Error('at 은 t → {id:{prop:값}} 함수다');
        m.size = [el.width, el.height];                       // 작성한 width/height 속성 — 렌더러가 덮어쓰기 전에 잡아 둔다
        m.spec = normalize(name, opts && opts.layers);
        m.renders = (opts && opts.renders) || m.spec.renders;   // opts.renders 는 selftest 전용
      } catch (e) {
        // 마운트 오류는 그 슬롯을 seek 할 때 reject 로 돌려준다 — 렌더·snapshot 이 그 프레임에서 멈춘다(자홍 판만으로는 exit 0 이었다).
        // 여기서 던지지 않는다 — 같은 프레임 스크립트의 나머지(타임라인 등록)가 끊기지 않게
        m.error = e; showError(el ? m : null, e);
        if (el) mounts.push(m);
        return m;
      }
      mounts.push(m);
      return m;
    },
    // 시험 도구용 — 마운트를 끄고 GPU 자원을 놓는다(프레임에서는 부르지 않는다)
    unmount: function (m) { m.dead = true; release(m); }
  };
})();
