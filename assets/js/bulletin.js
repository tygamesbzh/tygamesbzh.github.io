// Fills the subscription bulletin (assets/bulletin.pdf) with the invest form values.
// Everything happens in the browser: the PDF is built in memory and handed to the
// visitor as a download, nothing is sent to or stored on the server.
(function (root) {
  // AcroForm fields of assets/bulletin.pdf. Update them if the PDF template changes.
  var FIELDS = {
    name: 'text_0',
    legalForm: 'text_1',
    address: 'text_2',
    representative: 'text_3',
    email: 'text_4',
    phone: 'text_5',
    shares: 'text_6',
    amount: 'text_7',
    place: 'text_13',
    date: 'text_14',
    signature: 'signature_15',
    // One box per member category, in the order of the form options.
    colleges: ['checkbox_8', 'checkbox_9', 'checkbox_10', 'checkbox_11', 'checkbox_12']
  };
  // Page 4 prints « Bon pour engagement de souscription de XX parts sociales… » as a TJ
  // array in its own font (/TT1, a subset without every digit). "XX" is swapped for the
  // number shown in Helvetica, then the line goes on in the original font.
  var SHARES_PLACEHOLDER = { page: 3, text: '(XX )', font: 'TT1', helvetica: 'TyHelv' };
  var TEXT_SIZE = 11;
  var SIGNATURE_SIZE = 30;

  // The bulletin is in French whatever the page language.
  function frenchNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function frenchDate(date) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Standard PDF fonts only cover Latin-1: strip accents from other characters, or drop them.
  function encodable(font, text) {
    return Array.from(text).map(function (c) {
      try { font.encodeText(c); return c; } catch (e) { /* not in WinAnsi */ }
      var plain = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      try { font.encodeText(plain); return plain; } catch (e) { return '?'; }
    }).join('');
  }

  function fitSize(font, text, width, maxSize) {
    var textWidth = font.widthOfTextAtSize(text, maxSize);
    return textWidth > width ? Math.floor(maxSize * width / textWidth * 10) / 10 : maxSize;
  }

  function setText(doc, form, font, name, value) {
    var field = form.getTextField(name);
    var text = encodable(font, value || '');
    var width = field.acroField.getWidgets()[0].getRectangle().width - 4;
    field.setText(text);
    field.setFontSize(fitSize(font, text, width, TEXT_SIZE));
  }

  function bytesToLatin1(bytes) {
    var text = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return text;
  }

  function latin1ToBytes(text) {
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
  }

  function writeShareCount(PDFLib, doc, helvetica, shares) {
    var p = SHARES_PLACEHOLDER;
    var page = doc.getPage(p.page);
    page.node.Resources().lookup(PDFLib.PDFName.of('Font'), PDFLib.PDFDict)
      .set(PDFLib.PDFName.of(p.helvetica), helvetica.ref);

    var contents = page.node.Contents();
    var refs = contents instanceof PDFLib.PDFArray ? contents.asArray() : [page.node.get(PDFLib.PDFName.of('Contents'))];
    for (var i = 0; i < refs.length; i++) {
      var stream = doc.context.lookup(refs[i]);
      var text = bytesToLatin1(PDFLib.decodePDFRawStream(stream).decode());
      if (text.indexOf(p.text) < 0) continue;
      text = text.replace(p.text, '] TJ /' + p.helvetica + ' 1 Tf (' + shares + ') Tj /' + p.font + ' 1 Tf [( )');
      var ref = doc.context.register(doc.context.flateStream(latin1ToBytes(text)));
      if (contents instanceof PDFLib.PDFArray) contents.set(i, ref);
      else page.node.set(PDFLib.PDFName.of('Contents'), ref);
      return;
    }
    throw new Error('Shares placeholder not found in the bulletin template');
  }

  // The template's checkbox appearances are indirect dictionaries, which pdf-lib's flatten
  // mistakes for streams (invalid page content, checked box not drawn): inline them.
  function checkCollege(PDFLib, doc, form, index) {
    FIELDS.colleges.forEach(function (name, i) {
      var box = form.getCheckBox(name);
      if (i === index) box.check();
      box.acroField.getWidgets().forEach(function (widget) {
        var ap = widget.dict.lookup(PDFLib.PDFName.of('AP'), PDFLib.PDFDict);
        var normal = ap.get(PDFLib.PDFName.of('N'));
        if (normal instanceof PDFLib.PDFRef) ap.set(PDFLib.PDFName.of('N'), doc.context.lookup(normal));
      });
    });
  }

  // The signature field has no appearance, which blocks flattening: remove it and write
  // the signer's name in cursive where it was.
  function sign(PDFLib, doc, form, font, signer) {
    var field = form.getSignature(FIELDS.signature);
    var widget = field.acroField.getWidgets()[0];
    var rect = widget.getRectangle();
    var page = doc.getPages().find(function (p) { return p.ref === widget.P(); });
    var kids = field.acroField.normalizedEntries().Kids;
    for (var i = 0; kids && i < kids.size(); i++) {
      page.node.removeAnnot(kids.get(i));
      doc.context.delete(kids.get(i));
    }
    page.node.removeAnnot(field.ref);
    form.acroForm.removeField(field.acroField);
    doc.context.delete(field.ref);

    var size = fitSize(font, signer, rect.width - 40, SIGNATURE_SIZE);
    page.drawText(signer, {
      x: rect.x + 20,
      y: rect.y + (rect.height - size) / 2 + size * 0.2,
      size: size,
      font: font,
      color: PDFLib.rgb(0.1, 0.15, 0.4)
    });
  }

  // values: name, legalForm, address, representative, email, phone, shares (number),
  // amount (number), college (option index), place, signer.
  function fill(PDFLib, fontkit, templateBytes, signatureFontBytes, values) {
    return PDFLib.PDFDocument.load(templateBytes).then(function (doc) {
      doc.registerFontkit(fontkit);
      return Promise.all([
        doc.embedFont(PDFLib.StandardFonts.Helvetica),
        doc.embedFont(signatureFontBytes, { subset: true })
      ]).then(function (fonts) {
        var helvetica = fonts[0];
        var form = doc.getForm();
        setText(doc, form, helvetica, FIELDS.name, values.name);
        setText(doc, form, helvetica, FIELDS.legalForm, values.legalForm);
        setText(doc, form, helvetica, FIELDS.address, values.address);
        setText(doc, form, helvetica, FIELDS.representative, values.representative);
        setText(doc, form, helvetica, FIELDS.email, values.email);
        setText(doc, form, helvetica, FIELDS.phone, values.phone);
        setText(doc, form, helvetica, FIELDS.shares, String(values.shares));
        setText(doc, form, helvetica, FIELDS.amount, frenchNumber(values.amount));
        setText(doc, form, helvetica, FIELDS.place, values.place);
        setText(doc, form, helvetica, FIELDS.date, frenchDate(new Date()));
        writeShareCount(PDFLib, doc, helvetica, values.shares);
        checkCollege(PDFLib, doc, form, values.college);
        sign(PDFLib, doc, form, fonts[1], values.signer);
        form.updateFieldAppearances(helvetica);
        form.flatten();
        return doc.save();
      });
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Cannot load ' + src)); };
      document.head.appendChild(script);
    });
  }

  function fetchBytes(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.arrayBuffer();
    });
  }

  function save(bytes, filename) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // urls: template, signatureFont (TrueType: PDFs cannot embed WOFF), pdfLib, fontkit. The libraries are only loaded on demand.
  function download(urls, values, filename) {
    var libs = root.PDFLib && root.fontkit
      ? Promise.resolve()
      : loadScript(urls.pdfLib).then(function () { return loadScript(urls.fontkit); });
    return Promise.all([libs, fetchBytes(urls.template), fetchBytes(urls.signatureFont)])
      .then(function (r) { return fill(root.PDFLib, root.fontkit, r[1], r[2], values); })
      .then(function (bytes) { save(bytes, filename); });
  }

  root.TyBulletin = { fill: fill, download: download };
  if (typeof module !== 'undefined') module.exports = root.TyBulletin;
})(typeof window !== 'undefined' ? window : globalThis);
