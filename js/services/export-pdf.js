// Render the current document and annotations into a downloadable PDF.
// Redacted pages are rasterized for export; review sensitive PDFs before sharing.

$('#save').onclick = async () => {
    if (!documentBytes)
        return;
    commitTextChanges();
    const b = $('#save');
    b.disabled = true;
    b.textContent = 'Exporting…';
    try {
        const { PDFDocument: D, rgb, StandardFonts: F, LineCapStyle: L } = PDFLib, doc = await D.load(documentBytes, { ignoreEncryption: true }), font = await doc.embedFont(F.Helvetica), ps = doc.getPages();
        const C = h => rgb(...[1, 3, 5].map(k => parseInt(h.substr(k, 2), 16) / 255));
        const FM = { h: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], t: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], c: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] }, FK = {};
        const EF = async (f) => {
            const n = FM[f.k][(f.b ? 1 : 0) + (f.i ? 2 : 0)];
            return FK[n] || (FK[n] = await doc.embedFont(F[n]));
        };
        let UFo;
        const UF = async () => UFo || (doc.registerFontkit(fontkit), UFo = await doc.embedFont(ufb, { subset: true })), FO = async (t, f) => ufb && hasU(t) ? UF() : EF(f || { k: 'h' }), SN = t => ufb && hasU(t) ? t : t.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), TX = async (p, l, x, y, s, col, f) => {
            const fo = await FO(l, f);
            p.drawText(SN(l), { x, y, size: s, font: fo, color: col });
        };
        for (const i in annotations) {
            const R = annotations[i].filter(a => a.t == 'red');
            if (!R.length)
                continue;
            const pi = pageMetadata[i], cv = document.createElement('canvas'), s = 2, vp = pi.p.getViewport({ scale: s });
            cv.width = vp.width;
            cv.height = vp.height;
            const x = cv.getContext('2d');
            await pi.p.render({ canvasContext: x, viewport: vp }).promise;
            x.fillStyle = '#000';
            R.forEach(a => x.fillRect(a.x * s, a.y * s, a.w * s, a.h * s));
            const im = await doc.embedJpg(Uint8Array.from(atob(cv.toDataURL('image/jpeg', .92).split(',')[1]), ch => ch.charCodeAt(0)));
            const np = doc.insertPage(+i, [pi.w, pi.h]);
            np.drawImage(im, { x: 0, y: 0, width: pi.w, height: pi.h });
            doc.removePage(+i + 1);
            ps[i] = np;
        }
        for (const i in annotations) {
            const p = ps[i], H = p.getHeight();
            for (const a of annotations[i]) {
                const c = a.c && a.c != 'none' ? C(a.c) : undefined;
                if (a.t == 'pen')
                    for (let j = 1; j < a.p.length; j++)
                        p.drawLine({ start: { x: a.p[j - 1][0], y: H - a.p[j - 1][1] }, end: { x: a.p[j][0], y: H - a.p[j][1] }, thickness: a.sw, color: c, lineCap: L.Round });
                else if (a.t == 'hl')
                    p.drawRectangle({ x: a.x, y: H - a.y - a.h, width: a.w, height: a.h, color: c, opacity: .38 });
                else if (a.t == 'box')
                    p.drawRectangle({ x: a.x, y: H - a.y - a.h, width: a.w, height: a.h, borderColor: c, borderWidth: a.sw });
                else if (a.t == 'text') {
                    for (const [k, l] of a.txt.split('\n').entries())
                        await TX(p, l, a.x, H - a.y - k * a.s * 1.2, a.s, c, a.f);
                }
                else if (a.t == 'edit') {
                    const v = a.cv, f = await EF(a.f);
                    p.drawRectangle({ x: v.x, y: H - v.y - v.h, width: v.w, height: v.h, color: C(a.bg) });
                    for (const [k, l] of a.txt.split('\n').entries())
                        await TX(p, l, a.x, H - a.y - k * a.s * 1.2, a.s, C(a.c), a.f);
                }
                else if (a.t == 'shp') {
                    const dash = a.dash == 'dashed' ? [a.sw * 4, a.sw * 2] : a.dash == 'dotted' ? [a.sw, a.sw * 2] : undefined;
                    const bo = { color: a.fill == 'none' ? undefined : C(a.fill), opacity: a.fo ?? 1, borderColor: a.c == 'none' ? undefined : C(a.c), borderWidth: a.c == 'none' ? 0 : a.sw, borderOpacity: 1, borderDashArray: dash };
                    if (a.k == 'ell')
                        p.drawEllipse({ x: a.x + a.w / 2, y: H - a.y - a.h / 2, xScale: a.w / 2, yScale: a.h / 2, ...bo });
                    else if (SHAPE_VERTICES[a.k])
                        p.drawSvgPath('M' + getShapePolygonPoints(a).split(' ').join('L') + 'Z', { x: 0, y: H, ...bo });
                    else if (a.k == 'round')
                        p.drawSvgPath(getRoundedRectanglePath(a), { x: 0, y: H, ...bo });
                    else
                        p.drawRectangle({ x: a.x, y: H - a.y - a.h, width: a.w, height: a.h, ...bo });
                    if (a.txt) {
                        const L2 = a.txt.split('\n'), fo = await FO(a.txt, a.f);
                        L2.forEach((l, j) => {
                            const t = SN(l);
                            p.drawText(t, { x: a.x + a.w / 2 - fo.widthOfTextAtSize(t, a.s) / 2, y: H - a.y - a.h / 2 - (j - (L2.length - 1) / 2) * a.s * 1.2 - a.s * .3, size: a.s, font: fo, color: C(a.tc) });
                        });
                    }
                }
                else if (a.t == 'img') {
                    const im = await doc.embedPng(Uint8Array.from(atob(imageAssets[a.img].split(',')[1]), ch => ch.charCodeAt(0)));
                    p.drawImage(im, { x: a.x, y: H - a.y - a.h, width: a.w, height: a.h });
                }
            }
        }
        [...deletedPageIndexes].sort((x, y) => y - x).forEach(i => doc.removePage(i));
        if (Object.keys(formValues).length) {
            try {
                const fm = doc.getForm();
                for (const n in formValues) {
                    const v = formValues[n];
                    try {
                        typeof v == 'boolean' ? (v ? fm.getCheckBox(n).check() : fm.getCheckBox(n).uncheck()) : fm.getTextField(n).setText(v);
                    }
                    catch (e1) {
                        try {
                            fm.getDropdown(n).select(v);
                        }
                        catch (e2) { }
                    }
                }
            }
            catch (e) { }
        }
        const rem = pageMetadata.map((_, i) => i).filter(i => !deletedPageIndexes.includes(i)), nd = await D.create(), cp2 = await nd.copyPages(doc, pageOrder.filter(i => !deletedPageIndexes.includes(i)).map(i => rem.indexOf(i)));
        cp2.forEach(p => nd.addPage(p));
        const out = await nd.save(), dl = await window.claude?.use?.('downloads');
        if (!dl) {
            const u = URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), a = document.createElement('a');
            a.href = u;
            a.download = documentName.replace(/\.pdf$/i, '') + '-edited.pdf';
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 4000);
            showToast('Saved');
        }
        else
            await dl.save({ filename: documentName.replace(/\.pdf$/i, '') + '-edited.pdf', data: out }).then(() => showToast('Saved')).catch(e => {
                if (e.code != 'declined')
                    showToast('Could not save the file');
            });
    }
    catch (e) {
        console.error('PDF export:', e);
        showToast('Export failed: ' + (e.message || 'Please try again'));
    }
    b.disabled = false;
    b.innerHTML = '<span>↓</span> Export PDF';
};
