// SVG output for editable annotations and selection handles.

function getAnnotationBounds(a) {
    if (a.t == 'edit')
        return a.cv;
    if (a.t == 'pen') {
        const xs = a.p.map(q => q[0]), ys = a.p.map(q => q[1]), x = Math.min(...xs), y = Math.min(...ys);
        return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    if (a.t == 'text') {
        const L = a.txt.split('\n');
        return { x: a.x, y: a.y - a.s, w: Math.max(...L.map(l => l.length)) * a.s * .55, h: L.length * a.s * 1.2 };
    }
    return a;
}
function renderAnnotation(a) {
    const k = Math.max(14 / zoom, a.sw || 0), id = `data-id="${a.id}"`;
    if (a.t == 'pen') {
        const d = 'M' + a.p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
        return `<g ${id}><path d="${d}" fill="none" stroke="${a.c}" stroke-width="${a.sw}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="transparent" stroke-width="${k}" stroke-linecap="round"/></g>`;
    }
    if (a.t == 'edit') {
        const v = a.cv;
        return `<g ${id}><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${a.bg}"/><text x="${a.x}" y="${a.y}" font-size="${a.s}" fill="${a.c}" font-family="${FONT_FAMILIES[a.f.k]}" font-weight="${a.f.b ? 700 : 400}" font-style="${a.f.i ? 'italic' : 'normal'}">${a.txt.split('\n').map((l, j) => `<tspan x="${a.x}" dy="${j ? a.s * 1.2 : 0}">${escapeSvgText(l) || '\u00a0'}</tspan>`).join('')}</text></g>`;
    }
    if (a.t == 'shp') {
        const outline = a.c || 'none', dash = a.dash == 'dashed' ? `${a.sw * 4} ${a.sw * 2}` : a.dash == 'dotted' ? `${a.sw} ${a.sw * 2}` : 'none';
        const at = `fill="${a.fill}" fill-opacity="${a.fo ?? 1}" stroke="${outline}" stroke-width="${a.sw}" stroke-dasharray="${dash}" stroke-linejoin="round" pointer-events="all"`;
        let g = a.k == 'ell' ? `<ellipse cx="${a.x + a.w / 2}" cy="${a.y + a.h / 2}" rx="${a.w / 2}" ry="${a.h / 2}" ${at}/>` : SHAPE_VERTICES[a.k] ? `<polygon points="${getShapePolygonPoints(a)}" ${at}/>` : `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="${a.k == 'round' ? Math.min(a.w, a.h) * .2 : 0}" ${at}/>`;
        if (a.txt)
            g += `<text text-anchor="middle" font-size="${a.s}" fill="${a.tc}" font-family="${FONT_FAMILIES[a.f.k]}" font-weight="${a.f.b ? 700 : 400}" font-style="${a.f.i ? 'italic' : 'normal'}" pointer-events="none">${a.txt.split('\n').map((l, j, A) => `<tspan x="${a.x + a.w / 2}" y="${a.y + a.h / 2 + (j - (A.length - 1) / 2) * a.s * 1.2 + a.s * .35}">${escapeSvgText(l) || '\u00a0'}</tspan>`).join('')}</text>`;
        return `<g ${id}>${g}</g>`;
    }
    if (a.t == 'red')
        return `<rect ${id} x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="#000"/>`;
    if (a.t == 'hl')
        return `<rect ${id} x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="${a.c}" opacity=".38"/>`;
    if (a.t == 'box')
        return `<g ${id}><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="${a.c}" stroke-width="${a.sw}"/><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="transparent" stroke-width="${k}" pointer-events="stroke"/></g>`;
    if (a.t == 'img')
        return `<image ${id} href="${imageAssets[a.img]}" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" preserveAspectRatio="none"/>`;
    const b = getAnnotationBounds(a);
    return `<g ${id}><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/><text x="${a.x}" y="${a.y}" font-size="${a.s}" fill="${a.c}" font-family="${FONT_FAMILIES[(a.f || { k: 'h' }).k]}" font-weight="${a.f && a.f.b ? 700 : 400}" font-style="${a.f && a.f.i ? 'italic' : 'normal'}">${a.txt.split('\n').map((l, j) => `<tspan x="${a.x}" dy="${j ? a.s * 1.2 : 0}">${escapeSvgText(l) || '\u00a0'}</tspan>`).join('')}</text></g>`;
}
function renderSelectionHandle(i) {
    if (!selectedObject || selectedObject.i != i || tool != 'select')
        return '';
    const a = getSelectedObject();
    if (!a)
        return '';
    const b = getAnnotationBounds(a);
    let h = `<rect x="${b.x - 2}" y="${b.y - 2}" width="${b.w + 4}" height="${b.h + 4}" fill="none" stroke="#2979ff" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    if (a.t == 'hl' || a.t == 'box' || a.t == 'img' || a.t == 'red' || a.t == 'shp')
        h += `<circle data-h="1" cx="${b.x + b.w}" cy="${b.y + b.h}" r="${(matchMedia('(pointer:coarse)').matches ? 19 : 11) / zoom}" fill="#fff" stroke="#2979ff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    return h;
}
function renderPageAnnotations(i) {
    const w = getPageElement(i);
    if (!w)
        return;
    const s = w.lastChild;
    s.innerHTML = (annotations[i] || []).map(renderAnnotation).join('') + renderSelectionHandle(i) + (tool == 'etext' ? getEditableTextRegions(i) : '') + (tool == 'form' ? renderPdfFormFields(i) : '') + renderSearchHighlights(i);
    s.style.touchAction = (tool != 'select' && tool != 'etext' && tool != 'form' || (selectedObject && selectedObject.i == i)) ? 'none' : 'pan-x pan-y pinch-zoom';
}
const renderAllPageAnnotations = () => pageMetadata.forEach((_, i) => renderPageAnnotations(i));
