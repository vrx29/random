/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         PerfMonitor.js  v2.0 — Drop-in HUD          ║
 * ║  Add to ANY webpage via a single <script> tag        ║
 * ╠══════════════════════════════════════════════════════╣
 * ║  Usage:                                              ║
 * ║    <script src="perf-monitor.js"></script>           ║
 * ║                                                      ║
 * ║  Options (data attributes):                          ║
 * ║    data-position = top-right | top-left |            ║
 * ║                    bottom-right | bottom-left        ║
 * ║    data-theme    = dark | light                      ║
 * ║                                                      ║
 * ║  JS API:                                             ║
 * ║    window.__perfMonitor.hide()                       ║
 * ║    window.__perfMonitor.show()                       ║
 * ║    window.__perfMonitor.destroy()                    ║
 * ╚══════════════════════════════════════════════════════╝
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     CONFIG
  ───────────────────────────────────────────────────────── */
  const _s        = document.currentScript || {};
  const POSITION  = _s.getAttribute?.('data-position') || 'top-right';
  const THEME     = _s.getAttribute?.('data-theme')    || 'dark';
  const TICK_MS   = 600;   // how often we refresh all metrics

  /* ─────────────────────────────────────────────────────────
     THEME
  ───────────────────────────────────────────────────────── */
  const THEMES = {
    dark: {
      bg:      '#0e0e11',
      surface: '#16161b',
      border:  '#26262f',
      text:    '#f0f0f8',
      label:   '#6b6b80',
      good:    '#22d97a',
      warn:    '#f5a623',
      bad:     '#f0455a',
      blue:    '#38bdf8',
      purple:  '#a78bfa',
    },
    light: {
      bg:      '#f2f2f7',
      surface: '#ffffff',
      border:  '#dcdce8',
      text:    '#18181f',
      label:   '#8888a0',
      good:    '#16a34a',
      warn:    '#d97706',
      bad:     '#dc2626',
      blue:    '#0284c7',
      purple:  '#7c3aed',
    },
  };
  const C = THEMES[THEME] || THEMES.dark;

  /* ─────────────────────────────────────────────────────────
     POSITION
  ───────────────────────────────────────────────────────── */
  const POS_MAP = {
    'top-right':    'top:14px;right:14px',
    'top-left':     'top:14px;left:14px',
    'bottom-right': 'bottom:14px;right:14px',
    'bottom-left':  'bottom:14px;left:14px',
  };
  const POS = POS_MAP[POSITION] || POS_MAP['top-right'];

  /* ─────────────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────────────── */
  // FPS
  let fps = 0, _frames = 0, _fpsLast = performance.now();
  let fpsHistory = new Array(30).fill(0);

  // CPU (estimated via requestIdleCallback idle-time ratio)
  let cpuPct  = 0;
  let _idleMs = 0, _busyMs = 0, _cpuWindow = performance.now();

  // Heap
  let heapUsedMB = 0, heapTotalMB = 0, heapLimitMB = 0;

  // DOM
  let domNodes = 0;

  // GPU
  let gpuName    = 'Detecting…';
  let gpuVendor  = '';
  let gpuReady   = false;

  // Long Tasks / blocking
  let blockingMs = 0, _blockAccum = 0;

  // Network (resource timing)
  let netRequests = 0;

  // Minimized / hidden
  let minimized = false;

  // rAF / interval handles
  let _raf, _tick;

  /* ─────────────────────────────────────────────────────────
     ROOT ELEMENT
  ───────────────────────────────────────────────────────── */
  const root = document.createElement('div');
  root.id = '__pm__';

  /* ─────────────────────────────────────────────────────────
     CSS  (all scoped under #__pm__)
  ───────────────────────────────────────────────────────── */
  const CSS = `
#__pm__ {
  position: fixed;
  ${POS};
  z-index: 2147483647;
  width: 260px;
  font-family: 'JetBrains Mono','Cascadia Code','Fira Mono','Courier New',monospace;
  font-size: 12px;
  line-height: 1.4;
  user-select: none;
  pointer-events: auto;
  filter: drop-shadow(0 8px 40px rgba(0,0,0,.65));
}
#__pm__ * {
  box-sizing: border-box;
  margin: 0; padding: 0;
}

/* ── Panel shell ── */
#__pm_panel__ {
  background: ${C.bg};
  border: 1px solid ${C.border};
  border-radius: 14px;
  overflow: hidden;
}

/* ── Header ── */
#__pm_hdr__ {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: ${C.surface};
  border-bottom: 1px solid ${C.border};
  cursor: move;
}
#__pm_title__ {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: ${C.blue};
}
#__pm_pulse__ {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: ${C.good};
  flex-shrink: 0;
  animation: __pm_blink__ 1.8s ease-in-out infinite;
}
@keyframes __pm_blink__ {
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.3;transform:scale(.7)}
}
#__pm_btns__ { display:flex; gap:5px; }
#__pm_btns__ button {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1px solid ${C.border};
  background: ${C.bg};
  color: ${C.label};
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
}
#__pm_btns__ button:hover {
  background: ${C.border};
  color: ${C.text};
}

/* ── Body ── */
#__pm_body__ {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 600px;
  overflow: hidden;
  transition: max-height .3s cubic-bezier(.4,0,.2,1), padding .3s;
}
#__pm_body__.--hidden {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* ── FPS Hero Row ── */
#__pm_fps_hero__ {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-radius: 10px;
}
#__pm_fps_big__ {
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -.04em;
  min-width: 64px;
  line-height: 1;
  color: ${C.good};
  transition: color .3s;
}
#__pm_fps_meta__ {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
#__pm_fps_label__ {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: ${C.label};
}
#__pm_fps_sub__ {
  font-size: 10px;
  color: ${C.label};
}
#__pm_sparkline__ {
  flex: 1;
  height: 36px;
  background: rgba(255,255,255,.03);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  padding: 3px;
}
.pm_sbar {
  flex: 1;
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height .15s, background .3s;
}

/* ── Metric rows (full-width) ── */
.pm_row {
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-radius: 10px;
  padding: 10px 12px;
}
.pm_row_top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.pm_row_label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: ${C.label};
  display: flex;
  align-items: center;
  gap: 5px;
}
.pm_row_label span { /* icon */
  font-size: 11px;
}
.pm_row_val {
  font-size: 16px;
  font-weight: 700;
  color: ${C.text};
  transition: color .3s;
}
.pm_row_sub {
  font-size: 9.5px;
  color: ${C.label};
  margin-top: 2px;
  line-height: 1.5;
}
/* Progress track */
.pm_track {
  height: 4px;
  background: ${C.border};
  border-radius: 99px;
  margin-top: 8px;
  overflow: hidden;
}
.pm_fill {
  height: 100%;
  border-radius: 99px;
  transition: width .5s cubic-bezier(.4,0,.2,1), background .5s;
}

/* ── 2-col mini grid ── */
#__pm_mini_grid__ {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.pm_mini {
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-radius: 10px;
  padding: 9px 10px;
}
.pm_mini_label {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: ${C.label};
  margin-bottom: 5px;
}
.pm_mini_val {
  font-size: 15px;
  font-weight: 700;
  color: ${C.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color .3s;
}
.pm_mini_sub {
  font-size: 8.5px;
  color: ${C.label};
  margin-top: 2px;
}

/* ── GPU card (full width) ── */
#__pm_gpu_card__ {
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-radius: 10px;
  padding: 10px 12px;
}
#__pm_gpu_name__ {
  font-size: 12px;
  font-weight: 700;
  color: ${C.purple};
  word-break: break-word;
  line-height: 1.4;
  margin-bottom: 3px;
}
#__pm_gpu_vendor__ {
  font-size: 9.5px;
  color: ${C.label};
}

/* ── Footer ── */
#__pm_footer__ {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: ${C.surface};
  border-top: 1px solid ${C.border};
  font-size: 9px;
  color: ${C.label};
  letter-spacing: .05em;
}
#__pm_status_dot__ {
  display: inline-block;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: ${C.good};
  margin-right: 5px;
  vertical-align: middle;
  transition: background .3s;
}

/* ── Restore pill (when hidden) ── */
#__pm_restore__ {
  display: none;
  background: ${C.bg};
  border: 1px solid ${C.border};
  color: ${C.blue};
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  padding: 7px 13px;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,.5);
  transition: opacity .15s;
}
#__pm_restore__:hover { opacity: .75; }
`;

  /* ─────────────────────────────────────────────────────────
     HTML TEMPLATE
  ───────────────────────────────────────────────────────── */
  const HTML = `
<style>${CSS}</style>

<div id="__pm_panel__">

  <!-- Header -->
  <div id="__pm_hdr__">
    <div id="__pm_title__">
      <div id="__pm_pulse__"></div>
      PERF MONITOR
    </div>
    <div id="__pm_btns__">
      <button id="__pm_min__" title="Minimize">─</button>
      <button id="__pm_close__" title="Hide">✕</button>
    </div>
  </div>

  <!-- Body -->
  <div id="__pm_body__">

    <!-- FPS hero -->
    <div id="__pm_fps_hero__">
      <div>
        <div id="__pm_fps_big__">--</div>
        <div id="__pm_fps_label__">FPS</div>
        <div id="__pm_fps_sub__">--ms frame</div>
      </div>
      <div id="__pm_sparkline__"></div>
    </div>

    <!-- CPU row -->
    <div class="pm_row">
      <div class="pm_row_top">
        <div class="pm_row_label"><span>⚙</span> CPU Usage</div>
        <div class="pm_row_val" id="__pm_cpu_val__">--%</div>
      </div>
      <div class="pm_row_sub" id="__pm_cpu_sub__">Estimating via idle time…</div>
      <div class="pm_track">
        <div class="pm_fill" id="__pm_cpu_fill__" style="width:0%"></div>
      </div>
    </div>

    <!-- Heap Memory row -->
    <div class="pm_row">
      <div class="pm_row_top">
        <div class="pm_row_label"><span>💾</span> JS Heap Memory</div>
        <div class="pm_row_val" id="__pm_heap_val__">-- MB</div>
      </div>
      <div class="pm_row_sub" id="__pm_heap_sub__">of -- MB total · limit -- MB</div>
      <div class="pm_track">
        <div class="pm_fill" id="__pm_heap_fill__" style="width:0%"></div>
      </div>
    </div>

    <!-- DOM row -->
    <div class="pm_row">
      <div class="pm_row_top">
        <div class="pm_row_label"><span>🌐</span> DOM Nodes</div>
        <div class="pm_row_val" id="__pm_dom_val__">--</div>
      </div>
      <div class="pm_row_sub" id="__pm_dom_sub__">Counting…</div>
      <div class="pm_track">
        <div class="pm_fill" id="__pm_dom_fill__" style="width:0%"></div>
      </div>
    </div>

    <!-- GPU card (full width) -->
    <div id="__pm_gpu_card__">
      <div class="pm_mini_label" style="margin-bottom:6px">🖥 GPU Adapter</div>
      <div id="__pm_gpu_name__">Detecting…</div>
      <div id="__pm_gpu_vendor__"></div>
    </div>

    <!-- Mini grid: Long Tasks + Network -->
    <div id="__pm_mini_grid__">
      <div class="pm_mini">
        <div class="pm_mini_label">⚡ Blocking</div>
        <div class="pm_mini_val" id="__pm_block_val__">0 ms</div>
        <div class="pm_mini_sub">long tasks</div>
      </div>
      <div class="pm_mini">
        <div class="pm_mini_label">🔗 Requests</div>
        <div class="pm_mini_val" id="__pm_net_val__">0</div>
        <div class="pm_mini_sub">resources loaded</div>
      </div>
    </div>

  </div><!-- /body -->

  <!-- Footer -->
  <div id="__pm_footer__">
    <span><span id="__pm_status_dot__"></span>LIVE</span>
    <span id="__pm_status_msg__">Monitoring…</span>
  </div>

</div><!-- /panel -->

<button id="__pm_restore__">▲ PERF</button>
`;

  root.innerHTML = HTML;

  /* ─────────────────────────────────────────────────────────
     INJECT
  ───────────────────────────────────────────────────────── */
  const inject = () => { document.body.appendChild(root); _init(); };
  if (document.body) inject();
  else document.addEventListener('DOMContentLoaded', inject);

  /* ─────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────── */
  const $  = id => document.getElementById(id);
  const mb = b  => (b / 1048576).toFixed(1);

  function threshColor(pct) {
    return pct < 55 ? C.good : pct < 80 ? C.warn : C.bad;
  }

  /* ─────────────────────────────────────────────────────────
     FPS  (requestAnimationFrame counter)
  ───────────────────────────────────────────────────────── */
  function _fpsLoop(now) {
    _frames++;
    const elapsed = now - _fpsLast;
    if (elapsed >= 1000) {
      fps = Math.round((_frames * 1000) / elapsed);
      _frames  = 0;
      _fpsLast = now;
    }
    _raf = requestAnimationFrame(_fpsLoop);
  }

  /* ─────────────────────────────────────────────────────────
     CPU  estimation
     ─────────────────────────────────────────────────────────
     Browser JS runs on the main thread. We can't read CPU
     registers, but we can estimate "busy time" by scheduling
     a repeating short task and measuring how long it actually
     takes to fire vs how long we asked to wait.

     Strategy:
       • Every ~100 ms we schedule a 0-ms setTimeout.
       • If the main thread is busy, it fires late.
       • lateness / expected_interval = approximate busy %.
       • Smooth with a rolling 5-sample EMA.

     Additionally we use PerformanceLongTaskObserver to add
     actual blocking duration on top.
  ───────────────────────────────────────────────────────── */
  const CPU_INTERVAL = 120;   // ms
  let   _cpuExpected = 0;
  let   _cpuEma      = 0;     // 0–100
  const CPU_EMA_K    = 0.25;  // smoothing factor

  function _scheduleCpuSample() {
    const scheduled = performance.now();
    setTimeout(() => {
      const actual  = performance.now();
      const late    = actual - scheduled - CPU_INTERVAL;
      // busy = late / (late + idle). Cap at 99 to avoid "100% always"
      const raw     = Math.min(99, Math.max(0, (late / (CPU_INTERVAL * 2)) * 100));
      _cpuEma       = _cpuEma + CPU_EMA_K * (raw - _cpuEma);
      cpuPct        = Math.round(_cpuEma);
      _scheduleCpuSample();
    }, CPU_INTERVAL);
  }

  /* ─────────────────────────────────────────────────────────
     LONG TASKS  (add to blocking counter + CPU)
  ───────────────────────────────────────────────────────── */
  function _observeLongTasks() {
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          _blockAccum += e.duration;
          // Long task = definite CPU spike, push EMA up
          _cpuEma = Math.min(99, _cpuEma + (e.duration / 16));
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  }

  /* ─────────────────────────────────────────────────────────
     HEAP MEMORY  (Chrome's performance.memory)
     Also works in Edge. Firefox/Safari return undefined.
  ───────────────────────────────────────────────────────── */
  function _readHeap() {
    const pm = performance.memory;           // may be undefined
    if (!pm) return;
    // Note: values update roughly every 100 ms in Chrome
    heapUsedMB  = parseFloat(mb(pm.usedJSHeapSize));
    heapTotalMB = parseFloat(mb(pm.totalJSHeapSize));
    heapLimitMB = parseFloat(mb(pm.jsHeapSizeLimit));
  }

  /* ─────────────────────────────────────────────────────────
     GPU INFO  (WebGPU → WebGL fallback)
  ───────────────────────────────────────────────────────── */
  function _detectGPU() {
    if (navigator.gpu) {
      navigator.gpu.requestAdapter()
        .then(adapter => {
          if (!adapter) { _tryWebGL(); return; }
          // adapter.info is the new API (Chrome 121+)
          const info = adapter.info || {};
          gpuName   = info.description || info.device || 'WebGPU Adapter';
          gpuVendor = info.vendor || 'WebGPU enabled';
          gpuReady  = true;
          _renderGPU();
        })
        .catch(_tryWebGL);
    } else {
      _tryWebGL();
    }
  }

  function _tryWebGL() {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      if (!gl) { gpuName = 'Not available'; gpuVendor = 'WebGL unsupported'; gpuReady = true; _renderGPU(); return; }

      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        gpuName   = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)   || 'Unknown GPU';
        gpuVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)     || '';
      } else {
        // Fallback: just get generic info
        gpuName   = gl.getParameter(gl.RENDERER) || 'WebGL renderer';
        gpuVendor = gl.getParameter(gl.VENDOR)   || '';
      }
      gpuReady = true;
      _renderGPU();
    } catch (e) {
      gpuName  = 'Detection failed';
      gpuVendor = '';
      gpuReady  = true;
      _renderGPU();
    }
  }

  function _renderGPU() {
    // Truncate very long strings but keep readable
    const name = gpuName.length > 60 ? gpuName.slice(0, 58) + '…' : gpuName;
    $('__pm_gpu_name__').textContent   = name;
    $('__pm_gpu_vendor__').textContent = gpuVendor;
  }

  /* ─────────────────────────────────────────────────────────
     NETWORK  (PerformanceObserver resource timing)
  ───────────────────────────────────────────────────────── */
  function _observeNetwork() {
    try {
      // Count resources already loaded
      netRequests = performance.getEntriesByType('resource').length;
      new PerformanceObserver(list => {
        netRequests += list.getEntries().length;
      }).observe({ type: 'resource', buffered: false });
    } catch (_) {}
  }

  /* ─────────────────────────────────────────────────────────
     SPARKLINE
  ───────────────────────────────────────────────────────── */
  function _buildSparkline() {
    const g = $('__pm_sparkline__');
    g.innerHTML = '';
    for (let i = 0; i < 30; i++) {
      const b = document.createElement('div');
      b.className = 'pm_sbar';
      g.appendChild(b);
    }
  }

  function _pushSparkline() {
    fpsHistory.push(fps);
    fpsHistory.shift();
    const bars = $('__pm_sparkline__').children;
    const max  = Math.max(60, ...fpsHistory);
    for (let i = 0; i < bars.length; i++) {
      const v = fpsHistory[i];
      const h = Math.max(2, (v / max) * 30);
      bars[i].style.height     = h + 'px';
      bars[i].style.background = v >= 50 ? C.good : v >= 30 ? C.warn : C.bad;
    }
  }

  /* ─────────────────────────────────────────────────────────
     CONTROLS
  ───────────────────────────────────────────────────────── */
  function _bindControls() {
    $('__pm_min__').onclick = () => {
      minimized = !minimized;
      $('__pm_body__').classList.toggle('--hidden', minimized);
      $('__pm_min__').textContent = minimized ? '□' : '─';
    };
    $('__pm_close__').onclick = () => {
      $('__pm_panel__').style.display = 'none';
      $('__pm_restore__').style.display = 'block';
    };
    $('__pm_restore__').onclick = () => {
      $('__pm_panel__').style.display = '';
      $('__pm_restore__').style.display = 'none';
    };
  }

  /* ─────────────────────────────────────────────────────────
     DRAG
  ───────────────────────────────────────────────────────── */
  function _makeDraggable() {
    const hdr = $('__pm_hdr__');
    let dragging = false, ox = 0, oy = 0;
    hdr.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      const r = root.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      root.style.right  = 'auto';
      root.style.bottom = 'auto';
      root.style.left   = Math.max(0, e.clientX - ox) + 'px';
      root.style.top    = Math.max(0, e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.userSelect = '';
    });
  }

  /* ─────────────────────────────────────────────────────────
     RENDER — called every TICK_MS
  ───────────────────────────────────────────────────────── */
  function _render() {

    /* — FPS — */
    const fpsEl  = $('__pm_fps_big__');
    const fpsCol = fps >= 55 ? C.good : fps >= 30 ? C.warn : C.bad;
    fpsEl.textContent     = fps || '--';
    fpsEl.style.color     = fpsCol;
    $('__pm_fps_sub__').textContent = fps > 0 ? (1000 / fps).toFixed(1) + ' ms/frame' : '--';
    _pushSparkline();

    /* — CPU — */
    const cpuFill = $('__pm_cpu_fill__');
    $('__pm_cpu_val__').textContent  = cpuPct + '%';
    $('__pm_cpu_val__').style.color  = threshColor(cpuPct);
    cpuFill.style.width              = cpuPct + '%';
    cpuFill.style.background         = threshColor(cpuPct);
    const cpuTag = cpuPct < 30 ? 'idle' : cpuPct < 60 ? 'normal' : cpuPct < 85 ? 'elevated' : 'overloaded';
    $('__pm_cpu_sub__').textContent  = `Main-thread busy · ${cpuTag}`;

    /* — Heap — */
    _readHeap();   // read on every tick so it's live
    if (performance.memory) {
      const pct = heapLimitMB > 0 ? (heapUsedMB / heapLimitMB) * 100 : 0;
      $('__pm_heap_val__').textContent = heapUsedMB + ' MB';
      $('__pm_heap_val__').style.color = threshColor(pct);
      $('__pm_heap_sub__').textContent = `of ${heapTotalMB} MB allocated · limit ${heapLimitMB} MB`;
      const hf = $('__pm_heap_fill__');
      hf.style.width      = Math.min(pct, 100) + '%';
      hf.style.background = threshColor(pct);
    } else {
      $('__pm_heap_val__').textContent = 'N/A';
      $('__pm_heap_sub__').textContent = 'Use Chrome for heap data';
    }

    /* — DOM nodes — */
    domNodes = document.querySelectorAll('*').length;
    const domPct = Math.min((domNodes / 3000) * 100, 100);
    const domTag = domNodes < 800 ? 'lean' : domNodes < 1500 ? 'moderate' : domNodes < 2500 ? 'large' : 'very large';
    $('__pm_dom_val__').textContent = domNodes.toLocaleString();
    $('__pm_dom_val__').style.color = threshColor(domPct);
    $('__pm_dom_sub__').textContent = `${domTag} · ${domNodes < 1500 ? 'good' : 'consider cleanup'}`;
    const df = $('__pm_dom_fill__');
    df.style.width      = domPct + '%';
    df.style.background = threshColor(domPct);

    /* — Long tasks / blocking — */
    const bv = $('__pm_block_val__');
    bv.textContent  = Math.round(_blockAccum) + ' ms';
    bv.style.color  = _blockAccum < 50 ? C.good : _blockAccum < 200 ? C.warn : C.bad;
    _blockAccum = 0;   // reset for next window

    /* — Network — */
    $('__pm_net_val__').textContent = netRequests.toLocaleString();

    /* — Status bar — */
    const sdot = $('__pm_status_dot__');
    const smsg = $('__pm_status_msg__');
    if (fps > 0 && fps < 30) {
      sdot.style.background = C.bad;
      smsg.textContent = '⚠ Low FPS!';
    } else if (cpuPct > 80) {
      sdot.style.background = C.warn;
      smsg.textContent = 'CPU pressure';
    } else {
      sdot.style.background = C.good;
      smsg.textContent = 'Healthy ✓';
    }
  }

  /* ─────────────────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────────────────── */
  function _init() {
    _buildSparkline();
    _bindControls();
    _makeDraggable();
    _observeLongTasks();
    _observeNetwork();
    _detectGPU();
    _scheduleCpuSample();
    requestAnimationFrame(_fpsLoop);
    _tick = setInterval(_render, TICK_MS);
  }

  /* ─────────────────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────────────────── */
  window.__perfMonitor = {
    hide()    { $('__pm_close__').click(); },
    show()    { $('__pm_restore__').click(); },
    destroy() {
      cancelAnimationFrame(_raf);
      clearInterval(_tick);
      root.remove();
      delete window.__perfMonitor;
    },
  };

})();