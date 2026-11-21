(function () {
  'use strict';

  var core = window.PDFMaker;
  var PDFBuilder = core.PDFBuilder;
  var planPages = core.planPages;
  var rotatedSize = core.rotatedSize;
  var mmToPt = core.mmToPt;

  var $ = function (id) {
    return document.getElementById(id);
  };

  var els = {
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    fileList: $('fileList'),
    emptyState: $('emptyState'),
    countText: $('countText'),
    pageText: $('pageText'),
    btnSort: $('btnSort'),
    btnClear: $('btnClear'),
    btnDemo: $('btnDemo'),
    statusPill: $('statusPill'),
    inputName: $('inputName'),
    selPageSize: $('selPageSize'),
    selOrientation: $('selOrientation'),
    selMargin: $('selMargin'),
    selPerPage: $('selPerPage'),
    selFit: $('selFit'),
    selQuality: $('selQuality'),
    chkPageNumbers: $('chkPageNumbers'),
    btnGenerate: $('btnGenerate'),
    generateHint: $('generateHint'),
    progressWrap: $('progressWrap'),
    progressFill: $('progressFill'),
    progressText: $('progressText'),
    resultPanel: $('resultPanel'),
    resultMeta: $('resultMeta'),
    previewStrip: $('previewStrip'),
    previewNote: $('previewNote'),
    btnDownload: $('btnDownload'),
    btnOpen: $('btnOpen'),
    btnAgain: $('btnAgain'),
    lightbox: $('lightbox'),
    lightboxClose: $('lightboxClose'),
    lightboxStage: $('lightboxStage'),
    lightboxCaption: $('lightboxCaption'),
    dropOverlay: $('dropOverlay'),
    toastHost: $('toastHost'),
    panelSettings: document.querySelector('.panel-settings'),
    panelFiles: document.querySelector('.panel-files')
  };

  var QUALITY = {
    high: { dpi: 300, quality: 0.92, maxEdge: 4200 },
    standard: { dpi: 200, quality: 0.86, maxEdge: 2800 },
    small: { dpi: 130, quality: 0.75, maxEdge: 1700 }
  };

  var SETTINGS_KEY = 'image-to-pdf.settings.v1';
  var SETTINGS_SELECTS = {
    pageSize: { el: 'selPageSize', values: ['A4', 'A3', 'Letter', 'auto'] },
    orientation: { el: 'selOrientation', values: ['auto', 'portrait', 'landscape'] },
    margin: { el: 'selMargin', values: ['0', '8', '15', '25'] },
    perPage: { el: 'selPerPage', values: ['1', '2', '4'] },
    fit: { el: 'selFit', values: ['contain', 'cover'] },
    quality: { el: 'selQuality', values: ['high', 'standard', 'small'] }
  };
  var pageNumbersPref = true;

  var state = {
    items: [],
    uid: 0,
    busy: false,
    pdfUrl: null,
    previewUrls: []
  };

  var MAX_PREVIEW_PAGES = 12;

  var collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

  var ICONS = {
    grip: '<svg viewBox="0 0 10 18" fill="currentColor" aria-hidden="true">' +
      '<circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/>' +
      '<circle cx="3" cy="9" r="1.3"/><circle cx="7" cy="9" r="1.3"/>' +
      '<circle cx="3" cy="15" r="1.3"/><circle cx="7" cy="15" r="1.3"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.2v4h-4"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 19V6"/><path d="M6.5 11.5L12 6l5.5 5.5"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 5v13"/><path d="M6.5 12.5L12 18l5.5-5.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 7h16"/><path d="M9.5 7V5.2h5V7"/><path d="M6.6 7l.9 12.3h9l.9-12.3"/><path d="M10.2 10.5v5.6M13.8 10.5v5.6"/></svg>'
  };

  /* ---------------- 基础工具 ---------------- */

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function safeFileName(name) {
    var cleaned = String(name || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.pdf\s*$/i, '')
      .trim();
    return cleaned || '图片合集';
  }

  function closestItem(node) {
    if (!node || node.nodeType !== 1) return null;
    return node.closest('.file-item');
  }

  function indexOfId(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return i;
    }
    return -1;
  }

  function tick() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  var toastTimer = 0;
  function toast(message, isError) {
    els.toastHost.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.textContent = message;
    els.toastHost.appendChild(el);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.style.transition = 'opacity .18s ease';
      el.style.opacity = '0';
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 220);
    }, 2400);
  }

  /* ---------------- 设置读取 ---------------- */

  function readOptions() {
    var autoSize = els.selPageSize.value === 'auto';
    return {
      pageSize: els.selPageSize.value,
      orientation: els.selOrientation.value,
      marginMm: Number(els.selMargin.value) || 0,
      perPage: autoSize ? 1 : (Number(els.selPerPage.value) || 1),
      fit: els.selFit.value,
      quality: els.selQuality.value,
      pageNumbers: els.chkPageNumbers.checked,
      fileName: els.inputName.value.trim() || '图片合集'
    };
  }

  function syncControls() {
    var autoSize = els.selPageSize.value === 'auto';
    els.selOrientation.disabled = autoSize;
    els.selMargin.disabled = autoSize;
    els.selPerPage.disabled = autoSize;
    if (autoSize) els.selPerPage.value = '1';

    if (autoSize) {
      els.chkPageNumbers.disabled = true;
      els.chkPageNumbers.checked = false;
      els.chkPageNumbers.title = '自适应纸张跟随图片比例、没有页边距，因此不显示页码';
    } else {
      els.chkPageNumbers.disabled = false;
      els.chkPageNumbers.checked = pageNumbersPref;
      els.chkPageNumbers.removeAttribute('title');
    }
  }

  function restoreSettings() {
    var stored = null;
    try {
      stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    } catch (err) {
      stored = null;
    }
    if (!stored || typeof stored !== 'object') return;

    Object.keys(SETTINGS_SELECTS).forEach(function (key) {
      var config = SETTINGS_SELECTS[key];
      var value = String(stored[key] == null ? '' : stored[key]);
      if (config.values.indexOf(value) !== -1) {
        els[config.el].value = value;
      }
    });

    if (typeof stored.pageNumbers === 'boolean') pageNumbersPref = stored.pageNumbers;
    if (typeof stored.fileName === 'string' && stored.fileName.trim()) {
      els.inputName.value = stored.fileName.slice(0, 60);
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        pageSize: els.selPageSize.value,
        orientation: els.selOrientation.value,
        margin: els.selMargin.value,
        perPage: els.selPerPage.value,
        fit: els.selFit.value,
        quality: els.selQuality.value,
        pageNumbers: pageNumbersPref,
        fileName: els.inputName.value
      }));
    } catch (err) {
      /* 无痕模式或禁用存储时忽略 */
    }
  }

  /* ---------------- 汇总信息 ---------------- */

  function updateSummary() {
    var options = readOptions();
    var pages = state.items.length ? planPages(state.items, options).length : 0;

    els.countText.textContent = state.items.length;
    els.pageText.textContent = pages;
    els.statusPill.textContent = state.items.length
      ? state.items.length + ' 张图片 · ' + pages + ' 页'
      : '等待添加图片';
    els.statusPill.classList.toggle('is-ready', state.items.length > 0);

    els.btnSort.disabled = state.items.length < 2 || state.busy;
    els.btnClear.disabled = state.items.length === 0 || state.busy;
    els.btnGenerate.disabled = state.items.length === 0 || state.busy;

    if (!state.busy) {
      els.btnGenerate.querySelector('.btn-label').textContent = state.items.length
        ? '生成 PDF（' + pages + ' 页）'
        : '生成 PDF';
      els.generateHint.textContent = state.items.length
        ? '共 ' + pages + ' 页 · Ctrl / ⌘ + Enter 快速生成'
        : '添加图片后可生成 PDF';
    }
  }

  /* ---------------- 列表渲染 ---------------- */

  function renderThumb(canvas, item) {
    var size = 128;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f8fc';
    ctx.fillRect(0, 0, size, size);

    var rotation = ((item.rotation % 360) + 360) % 360;
    var rotated = rotatedSize(item);
    var box = size - 20;
    var scale = Math.min(box / rotated[0], box / rotated[1]);

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    var drawW = rotated[0] * scale;
    var drawH = rotated[1] * scale;
    ctx.drawImage(item.img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  function renderLightboxCanvas(item) {
    var rotation = ((item.rotation % 360) + 360) % 360;
    var swapped = rotation % 180 !== 0;
    var rotated = rotatedSize(item);
    var maxEdge = 1400;
    var scale = Math.min(1, maxEdge / Math.max(rotated[0], rotated[1]));
    var width = Math.max(1, Math.round(rotated[0] * scale));
    var height = Math.max(1, Math.round(rotated[1] * scale));

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    var localWidth = swapped ? height : width;
    var localHeight = swapped ? width : height;
    var drawScale = Math.min(localWidth / item.w, localHeight / item.h);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(item.img, -item.w * drawScale / 2, -item.h * drawScale / 2, item.w * drawScale, item.h * drawScale);
    ctx.restore();
    return canvas;
  }

  var lastLightboxFocus = null;

  function openLightbox(item) {
    if (!item) return;
    lastLightboxFocus = document.activeElement;
    els.lightboxStage.innerHTML = '';
    els.lightboxStage.appendChild(renderLightboxCanvas(item));
    var rotated = rotatedSize(item);
    els.lightboxCaption.textContent = item.file.name + ' · ' + rotated[0] + ' × ' + rotated[1] + ' · ' + formatBytes(item.file.size);
    els.lightbox.hidden = false;
    document.body.classList.add('has-lightbox');
    els.lightboxClose.focus({ preventScroll: true });
  }

  function closeLightbox() {
    if (els.lightbox.hidden) return;
    els.lightbox.hidden = true;
    els.lightboxStage.innerHTML = '';
    els.lightboxCaption.textContent = '';
    document.body.classList.remove('has-lightbox');
    if (lastLightboxFocus && typeof lastLightboxFocus.focus === 'function') {
      lastLightboxFocus.focus({ preventScroll: true });
    }
    lastLightboxFocus = null;
  }

  function itemSubText(item) {
    var rotated = rotatedSize(item);
    return rotated[0] + ' × ' + rotated[1] + ' · ' + formatBytes(item.file.size);
  }

  function createItemEl(item, index) {
    var el = document.createElement('div');
    el.className = 'file-item';
    el.draggable = true;
    el.dataset.id = String(item.id);

    el.innerHTML =
      '<div class="drag-grip" title="拖动可调整顺序">' + ICONS.grip + '</div>' +
      '<div class="thumb-wrap" role="button" tabindex="0" aria-label="查看大图"><span class="thumb-index">' + (index + 1) + '</span></div>' +
      '<div class="file-meta">' +
        '<div class="file-name" title="' + escapeHtml(item.file.name) + '">' + escapeHtml(item.file.name) + '</div>' +
        '<div class="file-sub">' + itemSubText(item) + '</div>' +
      '</div>' +
      '<div class="file-actions">' +
        '<button type="button" class="icon-btn" data-act="rotate" title="旋转 90°">' + ICONS.rotate + '</button>' +
        '<button type="button" class="icon-btn" data-act="up" title="上移"' + (index === 0 ? ' disabled' : '') + '>' + ICONS.up + '</button>' +
        '<button type="button" class="icon-btn" data-act="down" title="下移"' + (index === state.items.length - 1 ? ' disabled' : '') + '>' + ICONS.down + '</button>' +
        '<button type="button" class="icon-btn is-danger" data-act="remove" title="移除这张图片">' + ICONS.trash + '</button>' +
      '</div>';

    var canvas = document.createElement('canvas');
    el.querySelector('.thumb-wrap').appendChild(canvas);
    renderThumb(canvas, item);
    return el;
  }

  function renderList() {
    els.fileList.innerHTML = '';
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < state.items.length; i++) {
      fragment.appendChild(createItemEl(state.items[i], i));
    }
    els.fileList.appendChild(fragment);
    els.emptyState.hidden = state.items.length > 0;
    els.panelFiles.classList.toggle('has-items', state.items.length > 0);
  }

  function refresh(clearOutput) {
    renderList();
    updateSummary();
    if (clearOutput) clearResult();
  }

  /* ---------------- 添加 / 移除图片 ---------------- */

  function isSupportedImage(file) {
    if (!file) return false;
    var type = (file.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) return type !== 'image/svg+xml';
    return /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '');
  }

  function loadItem(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) {
          URL.revokeObjectURL(url);
          reject(new Error('图片尺寸异常'));
          return;
        }
        resolve({
          id: ++state.uid,
          file: file,
          url: url,
          img: img,
          w: img.naturalWidth,
          h: img.naturalHeight,
          rotation: 0
        });
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片解码失败'));
      };

      img.src = url;
    });
  }

  function addFiles(files) {
    if (state.busy) {
      toast('正在生成 PDF，请稍候再添加图片', true);
      return Promise.resolve(0);
    }

    var list = Array.prototype.slice.call(files || []).filter(isSupportedImage);
    if (!list.length) {
      toast('没有可用的图片文件（支持 JPG / PNG / WebP / GIF / BMP）', true);
      return Promise.resolve(0);
    }

    var added = 0;

    return list.reduce(function (chain, file) {
      return chain.then(function () {
        return loadItem(file).then(function (item) {
          state.items.push(item);
          added += 1;
        }).catch(function () {
          toast('无法读取：' + file.name, true);
        });
      });
    }, Promise.resolve()).then(function () {
      refresh(true);
      return added;
    });
  }

  /* ---------------- 生成 PDF ---------------- */

  function canvasToJpeg(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('图片编码失败'));
          return;
        }
        blob.arrayBuffer().then(function (buffer) {
          resolve(new Uint8Array(buffer));
        }, reject);
      }, 'image/jpeg', quality);
    });
  }

  /**
   * 把一张图片渲染成符合目标框比例、带白底的 JPEG。
   * placement: { item, w, h, cover }
   */
  function renderPlacement(placement, preset) {
    var item = placement.item;
    var rotation = ((item.rotation % 360) + 360) % 360;
    var swapped = rotation % 180 !== 0;
    var rotatedW = swapped ? item.h : item.w;
    var rotatedH = swapped ? item.w : item.h;

    var targetW = placement.w * preset.dpi / 72;
    var targetH = placement.h * preset.dpi / 72;

    var scaleFactor = Math.min(
      1,
      preset.maxEdge / Math.max(targetW, targetH),
      rotatedW / targetW,
      rotatedH / targetH
    );

    var pxW = Math.max(1, Math.round(targetW * scaleFactor));
    var pxH = Math.max(1, Math.round(targetH * scaleFactor));

    var canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    var localW = swapped ? pxH : pxW;
    var localH = swapped ? pxW : pxH;
    var drawScale = placement.cover
      ? Math.max(localW / item.w, localH / item.h)
      : Math.min(localW / item.w, localH / item.h);

    ctx.save();
    ctx.translate(pxW / 2, pxH / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(item.img, -item.w * drawScale / 2, -item.h * drawScale / 2, item.w * drawScale, item.h * drawScale);
    ctx.restore();

    return canvasToJpeg(canvas, preset.quality).then(function (jpeg) {
      return { jpeg: jpeg, pxW: pxW, pxH: pxH, canvas: canvas };
    });
  }

  /** 按最终 PDF 的几何关系，把一页画成等比缩略图 */
  function makePreviewCanvas(page, pageItems, canvases) {
    var previewWidth = 480;
    var scale = previewWidth / page.width;
    var canvas = document.createElement('canvas');
    canvas.width = previewWidth;
    canvas.height = Math.max(1, Math.round(page.height * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (var i = 0; i < pageItems.length; i++) {
      var item = pageItems[i];
      ctx.drawImage(
        canvases[i],
        item.x * scale,
        (page.height - item.y - item.h) * scale,
        item.w * scale,
        item.h * scale
      );
    }
    return canvas;
  }

  function canvasToPreviewUrl(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('预览图生成失败'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, 'image/jpeg', 0.86);
    });
  }

  function setProgress(value) {
    var pct = Math.max(0, Math.min(100, Math.round(value * 100)));
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = pct + '%';
    if (state.busy) {
      els.btnGenerate.querySelector('.btn-label').textContent = '正在生成… ' + pct + '%';
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    els.panelSettings.classList.toggle('is-busy', busy);
    els.fileList.classList.toggle('is-disabled', busy);
    var controls = [els.inputName, els.selPageSize, els.selOrientation, els.selMargin,
      els.selPerPage, els.selFit, els.selQuality, els.chkPageNumbers];
    controls.forEach(function (el) {
      el.disabled = busy;
    });
    els.progressWrap.hidden = !busy;
    if (!busy) {
      els.progressFill.style.width = '0%';
      els.progressText.textContent = '0%';
      syncControls();
      updateSummary();
    } else {
      els.btnGenerate.disabled = true;
      els.btnSort.disabled = true;
      els.btnClear.disabled = true;
    }
  }

  function clearResult() {
    if (state.pdfUrl) {
      URL.revokeObjectURL(state.pdfUrl);
      state.pdfUrl = null;
    }
    state.previewUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    state.previewUrls = [];
    els.resultPanel.hidden = true;
    els.previewStrip.innerHTML = '';
    els.previewNote.hidden = true;
    els.btnDownload.removeAttribute('href');
    els.btnOpen.removeAttribute('href');
  }

  function showResult(blob, pageCount, imageCount, previewUrls) {
    var fileName = safeFileName(readOptions().fileName) + '.pdf';
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = URL.createObjectURL(blob);
    state.previewUrls = previewUrls;

    els.previewStrip.innerHTML = '';
    previewUrls.forEach(function (url, index) {
      var figure = document.createElement('figure');
      figure.className = 'preview-page';
      var image = document.createElement('img');
      image.src = url;
      image.alt = '第 ' + (index + 1) + ' 页预览';
      var caption = document.createElement('figcaption');
      caption.textContent = '第 ' + (index + 1) + ' 页';
      figure.appendChild(image);
      figure.appendChild(caption);
      els.previewStrip.appendChild(figure);
    });

    if (pageCount > previewUrls.length) {
      els.previewNote.hidden = false;
      els.previewNote.textContent = '共 ' + pageCount + ' 页，这里预览前 ' + previewUrls.length + ' 页，完整内容请下载查看。';
    } else {
      els.previewNote.hidden = true;
      els.previewNote.textContent = '';
    }

    els.btnDownload.href = state.pdfUrl;
    els.btnDownload.download = fileName;
    els.btnOpen.href = state.pdfUrl;
    els.btnDownload.querySelector('.btn-label').textContent = '下载 PDF（' + formatBytes(blob.size) + '）';
    els.resultMeta.textContent = pageCount + ' 页 · ' + formatBytes(blob.size) + ' · ' + imageCount + ' 张图片';
    els.resultPanel.hidden = false;
    els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function generate() {
    if (state.busy || !state.items.length) return Promise.resolve();

    var options = readOptions();
    var plan = planPages(state.items, options);
    var imageCount = state.items.length;
    var preset = QUALITY[options.quality] || QUALITY.standard;
    var totalCells = 0;
    plan.forEach(function (page) {
      totalCells += page.placements.length;
    });

    clearResult();
    setBusy(true);
    setProgress(0);

    var done = 0;
    var builder = new PDFBuilder();
    var previewUrls = [];

    function processPage(pageIndex) {
      if (pageIndex >= plan.length) return Promise.resolve(true);

      var page = plan[pageIndex];
      var pageItems = [];
      var pageCanvases = [];

      return page.placements.reduce(function (chain, placement) {
        return chain.then(function () {
          return renderPlacement(placement, preset).then(function (rendered) {
            pageItems.push({
              jpeg: rendered.jpeg,
              pxW: rendered.pxW,
              pxH: rendered.pxH,
              x: placement.x,
              y: placement.y,
              w: placement.w,
              h: placement.h
            });
            pageCanvases.push(rendered.canvas);
            done += 1;
            setProgress(totalCells ? done / totalCells : 1);
            return tick();
          });
        });
      }, Promise.resolve()).then(function () {
        var pageNumber = (options.pageNumbers && options.pageSize !== 'auto') ? pageIndex + 1 : null;
        var pageNumberY = Math.max(11, mmToPt(options.marginMm) * 0.45);

        builder.addPage({
          width: page.width,
          height: page.height,
          items: pageItems,
          pageNumber: pageNumber,
          pageNumberY: pageNumberY
        });

        if (pageIndex < MAX_PREVIEW_PAGES) {
          var previewCanvas = makePreviewCanvas(page, pageItems, pageCanvases);
          return canvasToPreviewUrl(previewCanvas).then(function (url) {
            previewUrls.push(url);
            return processPage(pageIndex + 1);
          });
        }
        return processPage(pageIndex + 1);
      });
    }

    return processPage(0).then(function () {
      var bytes = builder.build({ producer: 'ImageToPDF local' });
      var blob = new Blob([bytes], { type: 'application/pdf' });
      showResult(blob, plan.length, imageCount, previewUrls);
      toast('PDF 已生成：' + plan.length + ' 页');
    }).catch(function (error) {
      previewUrls.forEach(function (url) {
        URL.revokeObjectURL(url);
      });
      console.error(error);
      toast('生成失败：' + (error && error.message ? error.message : '未知错误'), true);
    }).then(function () {
      setBusy(false);
    });
  }

  /* ---------------- 示例图片（仅 ?demo=1 时载入，用于自检） ---------------- */

  function makeDemoCanvas(width, height, hue, label) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');

    var gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'hsl(' + hue + ', 68%, 58%)');
    gradient.addColorStop(1, 'hsl(' + ((hue + 48) % 360) + ', 62%, 34%)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    var radius = Math.min(width, height) * 0.45;
    var glow = ctx.createRadialGradient(width * 0.74, height * 0.2, 0, width * 0.74, height * 0.2, radius);
    glow.addColorStop(0, 'rgba(255,255,255,.6)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(width * 0.74, height * 0.2, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath();
    ctx.arc(width * 0.18, height * 0.82, Math.min(width, height) * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.95)';
    var fontSize = Math.round(Math.min(width, height) * 0.062);
    ctx.font = '600 ' + fontSize + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(label, width * 0.08, height * 0.88);

    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = '400 ' + Math.round(fontSize * 0.62) + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('Demo image · 图片转 PDF', width * 0.08, height * 0.88 + fontSize * 1.1);

    return canvas;
  }

  function canvasToPngFile(canvas, name) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('示例图生成失败'));
          return;
        }
        resolve(new File([blob], name, { type: 'image/png' }));
      }, 'image/png');
    });
  }

  function buildDemoFiles() {
    var specs = [
      { w: 1600, h: 1067, hue: 214, label: '示例 · 横版照片' },
      { w: 1000, h: 1400, hue: 268, label: '示例 · 竖版照片' },
      { w: 1400, h: 1400, hue: 158, label: '示例 · 方形照片' }
    ];
    return Promise.all(specs.map(function (spec, index) {
      return canvasToPngFile(makeDemoCanvas(spec.w, spec.h, spec.hue, spec.label), 'sample-' + (index + 1) + '.png');
    }));
  }

  function loadDemoImages() {
    if (state.busy) return Promise.resolve(0);
    return buildDemoFiles().then(addFiles).then(function (count) {
      if (count) toast('已载入 ' + count + ' 张示例图片');
      return count;
    });
  }

  /* ---------------- 事件绑定 ---------------- */

  els.dropzone.addEventListener('click', function () {
    els.fileInput.click();
  });

  els.dropzone.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.fileInput.click();
    }
  });

  els.btnDemo.addEventListener('click', function () {
    loadDemoImages();
  });

  els.fileInput.addEventListener('change', function () {
    if (els.fileInput.files && els.fileInput.files.length) {
      addFiles(els.fileInput.files).then(function (count) {
        if (count) toast('已添加 ' + count + ' 张图片');
      });
    }
    els.fileInput.value = '';
  });

  els.fileList.addEventListener('click', function (event) {
    if (state.busy) return;
    var button = event.target.closest ? event.target.closest('[data-act]') : null;
    if (!button) return;
    var itemEl = closestItem(button);
    if (!itemEl) return;

    var index = indexOfId(Number(itemEl.dataset.id));
    if (index < 0) return;
    var action = button.dataset.act;

    if (action === 'remove') {
      URL.revokeObjectURL(state.items[index].url);
      state.items.splice(index, 1);
      refresh(true);
      toast('已移除 1 张图片');
      return;
    }

    if (action === 'rotate') {
      var item = state.items[index];
      item.rotation = (item.rotation + 90) % 360;
    } else if (action === 'up' && index > 0) {
      var prev = state.items[index - 1];
      state.items[index - 1] = state.items[index];
      state.items[index] = prev;
    } else if (action === 'down' && index < state.items.length - 1) {
      var next = state.items[index + 1];
      state.items[index + 1] = state.items[index];
      state.items[index] = next;
    } else {
      return;
    }
    refresh(true);
  });

  els.fileList.addEventListener('click', function (event) {
    if (state.busy) return;
    var wrap = event.target.closest ? event.target.closest('.thumb-wrap') : null;
    if (!wrap) return;
    var itemEl = closestItem(wrap);
    if (!itemEl) return;
    var index = indexOfId(Number(itemEl.dataset.id));
    if (index >= 0) openLightbox(state.items[index]);
  });

  els.fileList.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var wrap = event.target.closest ? event.target.closest('.thumb-wrap') : null;
    if (!wrap) return;
    event.preventDefault();
    var itemEl = closestItem(wrap);
    if (!itemEl) return;
    var index = indexOfId(Number(itemEl.dataset.id));
    if (index >= 0) openLightbox(state.items[index]);
  });

  els.lightboxClose.addEventListener('click', closeLightbox);

  els.lightbox.addEventListener('click', function (event) {
    if (event.target === els.lightbox) closeLightbox();
  });

  els.btnSort.addEventListener('click', function () {
    state.items.sort(function (a, b) {
      return collator.compare(a.file.name, b.file.name);
    });
    refresh(true);
    toast('已按文件名排序');
  });

  els.btnClear.addEventListener('click', function () {
    if (!state.items.length) return;
    if (!window.confirm('确定清空所有图片吗？')) return;
    state.items.forEach(function (item) {
      URL.revokeObjectURL(item.url);
    });
    state.items = [];
    refresh(true);
    toast('已清空');
  });

  /* 列表内拖动排序 */
  var dragId = null;

  els.fileList.addEventListener('dragstart', function (event) {
    if (state.busy) {
      event.preventDefault();
      return;
    }
    var itemEl = closestItem(event.target);
    if (!itemEl) return;
    dragId = Number(itemEl.dataset.id);
    itemEl.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', String(dragId));
      } catch (err) { /* 忽略 */ }
    }
  });

  els.fileList.addEventListener('dragend', function (event) {
    var itemEl = closestItem(event.target);
    if (itemEl) itemEl.classList.remove('is-dragging');
    Array.prototype.forEach.call(els.fileList.querySelectorAll('.is-drop-target'), function (el) {
      el.classList.remove('is-drop-target');
    });
    dragId = null;
  });

  els.fileList.addEventListener('dragover', function (event) {
    if (dragId == null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    Array.prototype.forEach.call(els.fileList.querySelectorAll('.is-drop-target'), function (el) {
      el.classList.remove('is-drop-target');
    });
    var overEl = closestItem(event.target);
    if (overEl) overEl.classList.add('is-drop-target');
  });

  els.fileList.addEventListener('drop', function (event) {
    if (dragId == null) return;
    event.preventDefault();

    var fromIndex = indexOfId(dragId);
    var overEl = closestItem(event.target);
    var dropIndex = state.items.length;

    if (overEl) {
      var toIndex = indexOfId(Number(overEl.dataset.id));
      var rect = overEl.getBoundingClientRect();
      var insertAfter = (event.clientY - rect.top) > rect.height / 2;
      dropIndex = toIndex + (insertAfter ? 1 : 0);
    }

    if (fromIndex >= 0 && fromIndex < dropIndex) dropIndex -= 1;

    if (fromIndex >= 0 && dropIndex !== fromIndex) {
      var moved = state.items.splice(fromIndex, 1)[0];
      state.items.splice(dropIndex, 0, moved);
    }

    dragId = null;
    refresh(true);
  });

  /* 整页拖入文件（支持文件夹递归） */
  var dragDepth = 0;

  function hasFiles(event) {
    if (!event.dataTransfer) return false;
    var types = event.dataTransfer.types;
    return types && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function collectEntryFiles(entry, out) {
    return new Promise(function (resolve) {
      if (!entry) {
        resolve();
        return;
      }
      if (entry.isFile) {
        entry.file(function (file) {
          out.push(file);
          resolve();
        }, function () {
          resolve();
        });
        return;
      }
      if (entry.isDirectory) {
        var reader = entry.createReader();
        var readNext = function () {
          reader.readEntries(function (entries) {
            if (!entries.length) {
              resolve();
              return;
            }
            var chain = Promise.resolve();
            for (var i = 0; i < entries.length; i++) {
              chain = chain.then((function (child) {
                return function () {
                  return collectEntryFiles(child, out);
                };
              })(entries[i]));
            }
            chain.then(readNext, readNext);
          }, function () {
            resolve();
          });
        };
        readNext();
        return;
      }
      resolve();
    });
  }

  function readDropFiles(dataTransfer) {
    var items = dataTransfer.items;
    if (items && items.length) {
      var entries = [];
      for (var i = 0; i < items.length; i++) {
        var entry = null;
        try {
          entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        } catch (err) {
          entry = null;
        }
        if (entry) entries.push(entry);
      }
      if (entries.length) {
        var out = [];
        var chain = Promise.resolve();
        entries.forEach(function (entry) {
          chain = chain.then(function () {
            return collectEntryFiles(entry, out);
          });
        });
        return chain.then(function () {
          return out;
        });
      }
    }
    return Promise.resolve(Array.prototype.slice.call(dataTransfer.files || []));
  }

  document.addEventListener('dragenter', function (event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    els.dropOverlay.hidden = false;
    els.dropzone.classList.add('is-over');
  });

  document.addEventListener('dragover', function (event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('dragleave', function () {
    if (els.dropOverlay.hidden) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
      els.dropOverlay.hidden = true;
      els.dropzone.classList.remove('is-over');
    }
  });

  document.addEventListener('drop', function (event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    els.dropzone.classList.remove('is-over');
    readDropFiles(event.dataTransfer).then(addFiles).then(function (count) {
      if (count) toast('已添加 ' + count + ' 张图片');
    });
  });

  /* 设置变化 */
  [els.selPageSize, els.selOrientation, els.selMargin, els.selPerPage, els.selFit, els.selQuality].forEach(function (el) {
    el.addEventListener('change', function () {
      syncControls();
      saveSettings();
      updateSummary();
      clearResult();
    });
  });

  els.chkPageNumbers.addEventListener('change', function () {
    if (!els.chkPageNumbers.disabled) pageNumbersPref = els.chkPageNumbers.checked;
    saveSettings();
    clearResult();
  });

  els.inputName.addEventListener('change', function () {
    saveSettings();
    clearResult();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !els.lightbox.hidden) {
      closeLightbox();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (!els.lightbox.hidden) return;
      event.preventDefault();
      generate().then(updateSummary);
    }
  });

  els.btnGenerate.addEventListener('click', function () {
    generate().then(function () {
      updateSummary();
    });
  });

  els.btnAgain.addEventListener('click', function () {
    els.panelSettings.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.selPageSize.focus({ preventScroll: true });
  });

  /* ---------------- 初始化 ---------------- */

  restoreSettings();
  syncControls();
  updateSummary();
  clearResult();

  if (/[?&]demo=1(?:&|$)/.test(window.location.search)) {
    loadDemoImages().catch(function (error) {
      console.error(error);
    });
  }
})();
