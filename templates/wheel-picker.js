/* XHS MiniTool bottom wheel picker.
 * Classic script, no network / Worker / WASM / inline handlers.
 * Use for migrated WeChat <picker mode="selector"> and <picker mode="date">.
 */
var XhsWheelPicker = (function () {
  var ITEM_H = 44;
  var VISIBLE_ROWS = 5;
  var PAD_H = ITEM_H * ((VISIBLE_ROWS - 1) / 2);
  var layer = null;
  var sheet = null;
  var columnsEl = null;
  var titleEl = null;
  var state = null;
  var closeTimer = null;
  var previousBodyOverflow = '';

  function ensure() {
    if (layer) return;
    layer = document.createElement('div');
    layer.className = 'xhs-wheel-layer';
    layer.hidden = true;
    layer.innerHTML = '' +
      '<div class="xhs-wheel-mask" data-wheel-action="cancel"></div>' +
      '<section class="xhs-wheel-sheet" role="dialog" aria-modal="true" aria-label="选择器">' +
        '<div class="xhs-wheel-toolbar">' +
          '<button type="button" class="xhs-wheel-toolbar-btn cancel" data-wheel-action="cancel">取消</button>' +
          '<div class="xhs-wheel-title"></div>' +
          '<button type="button" class="xhs-wheel-toolbar-btn confirm" data-wheel-action="confirm">确定</button>' +
        '</div>' +
        '<div class="xhs-wheel-columns"></div>' +
      '</section>';
    document.body.appendChild(layer);
    sheet = layer.querySelector('.xhs-wheel-sheet');
    columnsEl = layer.querySelector('.xhs-wheel-columns');
    titleEl = layer.querySelector('.xhs-wheel-title');

    layer.addEventListener('click', function (e) {
      var action = e.target && e.target.getAttribute ? e.target.getAttribute('data-wheel-action') : '';
      if (action === 'cancel') {
        e.preventDefault();
        close(false);
        return;
      }
      if (action === 'confirm') {
        e.preventDefault();
        close(true);
        return;
      }
      var item = e.target && e.target.closest ? e.target.closest('.xhs-wheel-item') : null;
      if (item) {
        var col = item.closest('.xhs-wheel-column');
        if (col) {
          var idx = Number(item.getAttribute('data-index')) || 0;
          col.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!layer || layer.hidden) return;
      if (e.key === 'Escape') close(false);
    });
  }

  function labels(items) {
    return (items || []).map(function (item) {
      if (item == null) return '';
      if (typeof item === 'object') {
        if (item.label != null) return String(item.label);
        if (item.name != null) return String(item.name);
      }
      return String(item);
    });
  }

  function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function renderColumn(key, items, selectedIndex) {
    var col = document.createElement('div');
    col.className = 'xhs-wheel-column';
    col.setAttribute('data-column-key', key);
    col.style.setProperty('--xhs-wheel-pad', PAD_H + 'px');
    col.innerHTML = labels(items).map(function (label, idx) {
      return '<button type="button" class="xhs-wheel-item" data-index="' + idx + '">' + escapeHtml(label) + '</button>';
    }).join('');
    columnsEl.appendChild(col);
    bindColumn(col, items, selectedIndex);
    requestAnimationFrame(function () {
      col.scrollTop = selectedIndex * ITEM_H;
      updateColumnSelection(col, selectedIndex);
    });
    return col;
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function bindColumn(col, items, selectedIndex) {
    col._xhsItems = items;
    col._xhsIndex = selectedIndex;
    col._xhsSettleTimer = 0;
    col.addEventListener('scroll', function () {
      var max = Math.max(0, (col._xhsItems || []).length - 1);
      var idx = clamp(Math.round(col.scrollTop / ITEM_H), 0, max);
      col._xhsIndex = idx;
      updateColumnSelection(col, idx);
      clearTimeout(col._xhsSettleTimer);
      col._xhsSettleTimer = setTimeout(function () {
        col.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
        if (state && typeof state.onColumnChange === 'function') state.onColumnChange(col.getAttribute('data-column-key'), idx);
      }, 80);
    }, { passive: true });
  }

  function updateColumnSelection(col, idx) {
    var nodes = col.querySelectorAll('.xhs-wheel-item');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('is-selected', i === idx);
  }

  function replaceColumn(key, items, selectedIndex) {
    var old = columnsEl.querySelector('[data-column-key="' + key + '"]');
    if (!old) return renderColumn(key, items, selectedIndex);
    var fresh = document.createElement('div');
    fresh.className = 'xhs-wheel-column';
    fresh.setAttribute('data-column-key', key);
    fresh.style.setProperty('--xhs-wheel-pad', PAD_H + 'px');
    fresh.innerHTML = labels(items).map(function (label, idx) {
      return '<button type="button" class="xhs-wheel-item" data-index="' + idx + '">' + escapeHtml(label) + '</button>';
    }).join('');
    old.replaceWith(fresh);
    bindColumn(fresh, items, selectedIndex);
    requestAnimationFrame(function () {
      fresh.scrollTop = selectedIndex * ITEM_H;
      updateColumnSelection(fresh, selectedIndex);
    });
    return fresh;
  }

  function openBase(title) {
    ensure();
    clearTimeout(closeTimer);
    titleEl.textContent = title || '请选择';
    columnsEl.innerHTML = '';
    previousBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    layer.hidden = false;
    requestAnimationFrame(function () { layer.classList.add('is-open'); });
  }

  function close(confirm) {
    if (!layer || layer.hidden || !state) return;
    var st = state;
    if (confirm && typeof st.confirm === 'function') st.confirm();
    state = null;
    layer.classList.remove('is-open');
    document.body.style.overflow = previousBodyOverflow;
    closeTimer = setTimeout(function () {
      if (layer) layer.hidden = true;
    }, 190);
  }

  function openSelector(opts) {
    opts = opts || {};
    var items = Array.isArray(opts.items) ? opts.items : [];
    if (!items.length) return;
    var index = clamp(opts.index || 0, 0, items.length - 1);
    openBase(opts.title || '请选择');
    state = {
      kind: 'selector',
      confirm: function () {
        var col = columnsEl.querySelector('[data-column-key="selector"]');
        var idx = col ? clamp(col._xhsIndex, 0, items.length - 1) : index;
        if (typeof opts.onConfirm === 'function') opts.onConfirm(idx, items[idx]);
      }
    };
    renderColumn('selector', items, index);
  }

  function parseDate(value) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value || ''));
    var now = new Date();
    var y = m ? Number(m[1]) : now.getFullYear();
    var mo = m ? Number(m[2]) : now.getMonth() + 1;
    var d = m ? Number(m[3]) : now.getDate();
    mo = clamp(mo, 1, 12);
    d = clamp(d, 1, daysInMonth(y, mo));
    return { year: y, month: mo, day: d };
  }

  function openDate(opts) {
    opts = opts || {};
    var current = parseDate(opts.value);
    var min = parseDate(opts.min || '1970-01-01');
    var max = parseDate(opts.max || '2100-12-31');
    if (min.year > max.year) { var t = min; min = max; max = t; }
    current.year = clamp(current.year, min.year, max.year);
    current.month = clamp(current.month, 1, 12);
    current.day = clamp(current.day, 1, daysInMonth(current.year, current.month));

    var years = [], months = [], days = [];
    for (var y = min.year; y <= max.year; y++) years.push(y + '年');
    for (var m = 1; m <= 12; m++) months.push(m + '月');
    function buildDays() {
      days = [];
      var n = daysInMonth(current.year, current.month);
      for (var d = 1; d <= n; d++) days.push(d + '日');
      current.day = clamp(current.day, 1, n);
    }
    buildDays();

    openBase(opts.title || '选择日期');
    state = {
      kind: 'date',
      onColumnChange: function (key, idx) {
        if (key === 'year') {
          current.year = min.year + idx;
          buildDays();
          replaceColumn('day', days, current.day - 1);
        } else if (key === 'month') {
          current.month = idx + 1;
          buildDays();
          replaceColumn('day', days, current.day - 1);
        } else if (key === 'day') {
          current.day = idx + 1;
        }
      },
      confirm: function () {
        var ycol = columnsEl.querySelector('[data-column-key="year"]');
        var mcol = columnsEl.querySelector('[data-column-key="month"]');
        var dcol = columnsEl.querySelector('[data-column-key="day"]');
        current.year = min.year + (ycol ? ycol._xhsIndex : current.year - min.year);
        current.month = 1 + (mcol ? mcol._xhsIndex : current.month - 1);
        current.day = 1 + (dcol ? dcol._xhsIndex : current.day - 1);
        current.day = clamp(current.day, 1, daysInMonth(current.year, current.month));
        var value = current.year + '-' + pad2(current.month) + '-' + pad2(current.day);
        if (value < (opts.min || '1970-01-01')) value = opts.min || '1970-01-01';
        if (value > (opts.max || '2100-12-31')) value = opts.max || '2100-12-31';
        if (typeof opts.onConfirm === 'function') opts.onConfirm(value);
      }
    };

    renderColumn('year', years, current.year - min.year);
    renderColumn('month', months, current.month - 1);
    renderColumn('day', days, current.day - 1);
  }

  return {
    openSelector: openSelector,
    openDate: openDate,
    close: close
  };
})();
