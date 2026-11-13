// Application state is intentionally shared across ordered browser scripts.
// Keep these declarations in one place; the persisted annotation schema is stable.

const $ = s => document.querySelector(s);
const view = $('#view');
const box = $('#pages');
const ti = $('#ti');
if (window.pdfjsLib)
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let documentBytes;
let documentName = 'document.pdf';
let pageMetadata = [];
let annotations = {};
let deletedPageIndexes = [];
let imageAssets = {};
let undoHistory = [];
let redoHistory = [];
let pageOrder = [];
let tool = 'select';
let color = '#e53935';
let size = 2;
let zoom = 1;
let selectedObject = null;
let nextAnnotationId = 1;
let currentAnnotation = null;
let dragState = null;
let pendingTextPlacement = null;
let pendingTextTarget = null;
let textEditorSession = null;
let pinchGesture = null;
let wheelZoomScale = 1;
let wheelZoomTimer;
let currentPageIndex = 0;
let strokeResizeActive = 0;
const pointerLocations = new Map();
const COLOR_PALETTE = [
    '#e53935', '#1e88e5', '#43a047',
    '#111111', '#ffeb3b', '#fb8c00',
];
const escapeSvgText = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const FONT_FAMILIES = {
    h: 'Helvetica,Arial,sans-serif',
    t: "'Times New Roman',Times,serif",
    c: "'Courier New',Courier,monospace",
};
// Normalized vertices used by polygon shapes. Coordinates range from 0 to 1.
const SHAPE_VERTICES = {
    tri: [[0.5, 0], [1, 1], [0, 1]],
    diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    star: [
        [0.5, 0], [0.62, 0.38], [1, 0.38], [0.69, 0.62], [0.81, 1],
        [0.5, 0.77], [0.19, 1], [0.31, 0.62], [0, 0.38], [0.38, 0.38],
    ],
    check: [[0, 0.55], [0.15, 0.4], [0.4, 0.65], [0.85, 0.1], [1, 0.25], [0.4, 0.95]],
    cross: [
        [0.15, 0], [0.5, 0.35], [0.85, 0], [1, 0.15], [0.65, 0.5], [1, 0.85],
        [0.85, 1], [0.5, 0.65], [0.15, 1], [0, 0.85], [0.35, 0.5], [0, 0.15],
    ],
    arrow: [
        [0, 0.35], [0.6, 0.35], [0.6, 0.1], [1, 0.5],
        [0.6, 0.9], [0.6, 0.65], [0, 0.65],
    ],
};

function getShapePolygonPoints(annotation) {
    const vertices = SHAPE_VERTICES[annotation.k];
    if (!vertices) {
        return '';
    }

    return vertices
        .map(([px, py]) => {
            const x = (annotation.x + px * annotation.w).toFixed(1);
            const y = (annotation.y + py * annotation.h).toFixed(1);
            return `${x},${y}`;
        })
        .join(' ');
}

// Cubic Bézier approximation of rounded corners in top-down SVG coordinates.
function getRoundedRectanglePath(annotation) {
    const { x, y, w, h } = annotation;
    const radius = Math.min(w, h) * 0.2;
    const bezierOffset = radius * 0.55228475;
    const round = value => Number(value.toFixed(2));
    const r = radius;
    const k = bezierOffset;

    return [
        `M${round(x + r)} ${round(y)}`,
        `L${round(x + w - r)} ${round(y)}`,
        `C${round(x + w - r + k)} ${round(y)} ${round(x + w)} ${round(y + r - k)} ${round(x + w)} ${round(y + r)}`,
        `L${round(x + w)} ${round(y + h - r)}`,
        `C${round(x + w)} ${round(y + h - r + k)} ${round(x + w - r + k)} ${round(y + h)} ${round(x + w - r)} ${round(y + h)}`,
        `L${round(x + r)} ${round(y + h)}`,
        `C${round(x + r - k)} ${round(y + h)} ${round(x)} ${round(y + h - r + k)} ${round(x)} ${round(y + h - r)}`,
        `L${round(x)} ${round(y + r)}`,
        `C${round(x)} ${round(y + r - k)} ${round(x + r - k)} ${round(y)} ${round(x + r)} ${round(y)}`,
        'Z',
    ].join(' ');
}

let formValues = {};
const showToast = m => {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => t.classList.remove('on'), 2600);
};
const getSelectedObject = () => selectedObject && (annotations[selectedObject.i] || []).find(a => a.id == selectedObject.id);
const getPageElement = i => box.querySelector(`.pg[data-i="${i}"]`);
const getPagePointerPosition = (e, w) => {
    const r = w.lastChild.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
};
