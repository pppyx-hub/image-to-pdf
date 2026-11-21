/*
 * pdf-core.js —— 纯逻辑核心（不依赖 DOM）
 * 1) PDFBuilder：手写 PDF 结构，把 JPEG 以 DCTDecode 方式直接嵌入页面，零第三方库
 * 2) planPages：把图片按纸张 / 边距 / 每页张数 / 旋转，计算成 PDF 坐标中的摆放位置
 *
 * 坐标约定：单位 pt（1 pt = 1/72 inch），原点在页面左下角。
 */
(function (root) {
  'use strict';

  var encoder = new TextEncoder();

  function toBytes(text) {
    return encoder.encode(text);
  }

  function fmt(n) {
    var v = Math.round(n * 1000) / 1000;
    if (Object.is(v, -0)) v = 0;
    return String(v);
  }

  function pad10(n) {
    var s = String(n);
    while (s.length < 10) s = '0' + s;
    return s;
  }

  var PAGE_SIZES = {
    A4: [595.28, 841.89],
    A3: [841.89, 1190.55],
    Letter: [612, 792]
  };

  function mmToPt(mm) {
    return (Number(mm) || 0) * 72 / 25.4;
  }

  function escapePdfText(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function pdfDate(date) {
    function p(n, len) {
      var s = String(n);
      while (s.length < (len || 2)) s = '0' + s;
      return s;
    }
    var offset = -date.getTimezoneOffset();
    var sign = offset >= 0 ? '+' : '-';
    var abs = Math.abs(offset);
    return 'D:' + date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) +
      p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds()) +
      sign + p(Math.floor(abs / 60)) + "'" + p(abs % 60) + "'";
  }

  function concatBytes(parts) {
    var total = 0;
    var i;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var offset = 0;
    for (i = 0; i < parts.length; i++) {
      out.set(parts[i], offset);
      offset += parts[i].length;
    }
    return out;
  }

  function PDFBuilder() {
    // 下标即对象编号，objects[0] 不使用
    this.objects = [
      null,
      { head: '<< /Type /Catalog /Pages 2 0 R' },
      null // Pages 节点，build() 时填充
    ];
    this.pages = [];
    this.fontRef = 0;
  }

  PDFBuilder.prototype._reserve = function () {
    this.objects.push(null);
    return this.objects.length - 1;
  };

  PDFBuilder.prototype._set = function (num, obj) {
    this.objects[num] = obj;
  };

  PDFBuilder.prototype._ensureFont = function () {
    if (this.fontRef) return this.fontRef;
    var num = this._reserve();
    this._set(num, {
      head: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding'
    });
    this.fontRef = num;
    return num;
  };

  PDFBuilder.prototype.addImage = function (jpeg, pixelWidth, pixelHeight) {
    var num = this._reserve();
    this._set(num, {
      head: '<< /Type /XObject /Subtype /Image /Width ' + pixelWidth + ' /Height ' + pixelHeight +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
      stream: jpeg
    });
    return num;
  };

  /**
   * 添加一页。
   * items: [{ jpeg: Uint8Array, pxW, pxH, x, y, w, h }]
   */
  PDFBuilder.prototype.addPage = function (options) {
    var width = options.width;
    var height = options.height;
    var items = options.items || [];
    var pageNumber = options.pageNumber;

    var content = [];
    var xobjects = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var ref = this.addImage(item.jpeg, item.pxW, item.pxH);
      var name = 'Im' + i;
      xobjects.push('/' + name + ' ' + ref + ' 0 R');
      content.push(
        'q ' + fmt(item.w) + ' 0 0 ' + fmt(item.h) + ' ' + fmt(item.x) + ' ' + fmt(item.y) +
        ' cm /' + name + ' Do Q'
      );
    }

    var fontPart = '';
    if (pageNumber != null) {
      var fontRef = this._ensureFont();
      fontPart = ' /Font << /F1 ' + fontRef + ' 0 R >>';
      var label = String(pageNumber);
      var textX = Math.max(10, width / 2 - label.length * 2.6);
      var textY = options.pageNumberY != null
        ? options.pageNumberY
        : Math.max(12, Math.min(30, height * 0.045));
      content.push('BT /F1 9 Tf 0.45 g ' + fmt(textX) + ' ' + fmt(textY) + ' Td (' + label + ') Tj ET');
    }

    var contentRef = this._reserve();
    this._set(contentRef, {
      head: '<<',
      stream: toBytes(content.join('\n'))
    });

    var pageHead = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + fmt(width) + ' ' + fmt(height) + ']' +
      ' /Resources << /XObject << ' + xobjects.join(' ') + ' >>' + fontPart + ' >>' +
      ' /Contents ' + contentRef + ' 0 R';

    var pageRef = this._reserve();
    this._set(pageRef, { head: pageHead });
    this.pages.push(pageRef);
    return pageRef;
  };

  PDFBuilder.prototype.build = function (meta) {
    meta = meta || {};

    this._set(2, {
      head: '<< /Type /Pages /Kids [' + this.pages.map(function (ref) {
        return ref + ' 0 R';
      }).join(' ') + '] /Count ' + this.pages.length
    });

    var infoRef = 0;
    if (meta.producer) {
      var infoNum = this._reserve();
      this._set(infoNum, {
        head: '<< /Producer (' + escapePdfText(meta.producer) + ') /CreationDate (' + pdfDate(new Date()) + ')'
      });
      infoRef = infoNum;
    }

    var chunks = [];
    var position = 0;
    var offsets = [];

    function push(bytes) {
      chunks.push(bytes);
      position += bytes.length;
    }

    function write(text) {
      push(toBytes(text));
    }

    write('%PDF-1.4\n');

    for (var i = 1; i < this.objects.length; i++) {
      var obj = this.objects[i];
      offsets[i] = position;
      write(i + ' 0 obj\n');
      if (obj && obj.stream && obj.stream.length != null) {
        write(obj.head + ' /Length ' + obj.stream.length + ' >>\nstream\n');
        push(obj.stream);
        write('\nendstream\nendobj\n');
      } else {
        write((obj ? obj.head : '<<') + ' >>\nendobj\n');
      }
    }

    var xrefPosition = position;
    var xref = 'xref\n0 ' + this.objects.length + '\n0000000000 65535 f \n';
    for (var j = 1; j < this.objects.length; j++) {
      xref += pad10(offsets[j]) + ' 00000 n \n';
    }
    write(xref);
    write('trailer\n<< /Size ' + this.objects.length + ' /Root 1 0 R' +
      (infoRef ? ' /Info ' + infoRef + ' 0 R' : '') +
      ' >>\nstartxref\n' + xrefPosition + '\n%%EOF\n');

    return concatBytes(chunks);
  };

  /** 旋转后的像素宽高（旋转只作用于版式，不改变原始数据） */
  function rotatedSize(item) {
    var rotation = ((item.rotation || 0) % 360 + 360) % 360;
    if (rotation % 180 === 0) return [item.w, item.h];
    return [item.h, item.w];
  }

  /** 把若干矩形均匀切分成 rows × cols，返回从上到下的格子（PDF 坐标） */
  function splitCells(box, rows, cols, gap) {
    var cellW = (box.w - gap * (cols - 1)) / cols;
    var cellH = (box.h - gap * (rows - 1)) / rows;
    var cells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        cells.push({
          x: box.x + c * (cellW + gap),
          y: box.y + box.h - cellH - r * (cellH + gap),
          w: cellW,
          h: cellH
        });
      }
    }
    return cells;
  }

  /**
   * 计算分页与摆放。
   * options: { pageSize: 'A4'|'A3'|'Letter'|'auto', orientation: 'auto'|'portrait'|'landscape',
   *            marginMm, perPage: 1|2|4, fit: 'contain'|'cover' }
   */
  function planPages(items, options) {
    options = options || {};
    var perPage = Math.max(1, Number(options.perPage) || 1);
    var fit = options.fit === 'cover' ? 'cover' : 'contain';
    var autoSize = options.pageSize === 'auto';
    var margin = autoSize ? 0 : mmToPt(options.marginMm || 0);
    var gap = margin > 0 ? Math.min(18, Math.max(6, margin * 0.45)) : 6;

    var pages = [];

    for (var start = 0; start < items.length; start += perPage) {
      var group = items.slice(start, start + perPage);

      var pageWidth;
      var pageHeight;

      if (autoSize) {
        var firstSize = rotatedSize(group[0]);
        var longEdge = 841.89; // A4 长边
        if (firstSize[0] >= firstSize[1]) {
          pageWidth = longEdge;
          pageHeight = longEdge * firstSize[1] / firstSize[0];
        } else {
          pageHeight = longEdge;
          pageWidth = longEdge * firstSize[0] / firstSize[1];
        }
      } else {
        var base = PAGE_SIZES[options.pageSize] || PAGE_SIZES.A4;
        var landscape = options.orientation === 'landscape';
        if (options.orientation === 'auto') {
          if (perPage === 1) {
            var size2 = rotatedSize(group[0]);
            landscape = size2[0] > size2[1];
          } else {
            landscape = false;
          }
        }
        pageWidth = landscape ? base[1] : base[0];
        pageHeight = landscape ? base[0] : base[1];
      }

      var box = {
        x: margin,
        y: margin,
        w: pageWidth - margin * 2,
        h: pageHeight - margin * 2
      };

      var cells;
      if (perPage === 1) {
        cells = [{ x: box.x, y: box.y, w: box.w, h: box.h }];
      } else if (perPage === 2) {
        cells = splitCells(box, 2, 1, gap);
      } else {
        cells = splitCells(box, 2, 2, gap);
      }

      var placements = [];
      for (var idx = 0; idx < group.length; idx++) {
        var item = group[idx];
        var cell = cells[idx];
        if (!cell) break;
        var rotated = rotatedSize(item);

        if (fit === 'cover') {
          placements.push({ item: item, x: cell.x, y: cell.y, w: cell.w, h: cell.h, cover: true });
        } else {
          var scale = Math.min(cell.w / rotated[0], cell.h / rotated[1]);
          var drawW = rotated[0] * scale;
          var drawH = rotated[1] * scale;
          placements.push({
            item: item,
            x: cell.x + (cell.w - drawW) / 2,
            y: cell.y + (cell.h - drawH) / 2,
            w: drawW,
            h: drawH,
            cover: false
          });
        }
      }

      pages.push({ width: pageWidth, height: pageHeight, placements: placements });
    }

    return pages;
  }

  root.PDFMaker = {
    PDFBuilder: PDFBuilder,
    planPages: planPages,
    rotatedSize: rotatedSize,
    PAGE_SIZES: PAGE_SIZES,
    mmToPt: mmToPt
  };
})(typeof window !== 'undefined' ? window : globalThis);
