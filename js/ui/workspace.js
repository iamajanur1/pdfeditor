// Tool search, command menu, shortcuts, and workspace controls.

// Tools directory: filter/search without changing the PDF document.
let activeToolFilter = 'all';
function filterLandingTools() {
    const term = $('#toolSearch').value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.tool-card[data-category]').forEach(card => {
        const match = (activeToolFilter === 'all' || card.dataset.category === activeToolFilter) && card.textContent.toLowerCase().includes(term);
        card.hidden = !match;
        if (match)
            shown++;
    });
    $('#toolEmpty').hidden = shown !== 0;
}
document.querySelectorAll('.tool-filter').forEach(btn => btn.addEventListener('click', () => {
    activeToolFilter = btn.dataset.filter;
    document.querySelectorAll('.tool-filter').forEach(other => {
        const on = other === btn;
        other.classList.toggle('active', on);
        other.setAttribute('aria-pressed', String(on));
    });
    filterLandingTools();
}));
$('#toolSearch').addEventListener('input', filterLandingTools);
// Context information & quick, reusable shape themes.
function updateInspectorContext() {
    const a = selectedObject && getSelectedObject();
    const map = { etext: 'Click text in the document to edit', text: 'Click to place a text block', shp: 'Drag to draw a shape', pen: 'Draw on the canvas', hl: 'Drag to highlight', box: 'Drag to outline', form: 'Select a PDF field', red: 'Draw a redaction area', select: 'Choose an element to edit' };
    $('#inspectorContext').textContent = a ? ({ shp: 'Shape selected · edit its appearance', text: 'Text selected · adjust typography', edit: 'Existing text · adjust styling' }[a.t] || 'Element selected · edit properties') : (map[tool] || 'Use the toolbar to get started');
}
const oldUI = refreshEditorUI;
refreshEditorUI = function () {
    oldUI();
    updateInspectorContext();
};
$('#shapePalettes').addEventListener('click', e => {
    const b = e.target.closest('[data-colors]');
    if (!b)
        return;
    const [fill, stroke] = b.dataset.colors.split(',');
    const a = selectedObject && getSelectedObject();
    if (a && a.t === 'shp') {
        if (a.fill !== fill || a.c !== stroke) {
            pushUndoSnapshot();
            a.fill = fill;
            a.c = stroke;
            renderPageAnnotations(selectedObject.i);
            scheduleSessionSave();
        }
    }
    $('#fc').value = fill;
    $('#oc').value = stroke;
    $('#fillEnabled').checked = true;
    $('#outlineEnabled').checked = true;
    refreshAppearanceUI();
    showToast(`${b.title} palette ${a && a.t === 'shp' ? 'applied' : 'ready for the next shape'}`);
});
// Document workspace helpers.
function fitPage() {
    if (!documentBytes || !pageMetadata.length)
        return;
    const pi = pageMetadata[pageOrder.find(i => !deletedPageIndexes.includes(i))] || pageMetadata[0];
    const width = Math.max(100, view.clientWidth - 84), height = Math.max(100, view.clientHeight - 170);
    setZoom(Math.min(width / pi.w, height / pi.h));
    showToast('Fit page to available canvas');
}
$('#canvasPages').addEventListener('click', () => $('#pgs').click());
$('#canvasFit').addEventListener('click', fitPage);
$('#canvasGrid').addEventListener('click', () => {
    const enabled = document.body.classList.toggle('canvas-grid');
    $('#canvasGrid').classList.toggle('active', enabled);
    $('#canvasGrid').setAttribute('aria-pressed', String(enabled));
    showToast(enabled ? 'Grid enabled' : 'Grid disabled');
});
const collapseInspector = () => {
    if (matchMedia('(max-width:590px)').matches) {
        $('#inspector').classList.toggle('mobile-open');
        return;
    }
    const hidden = document.body.classList.toggle('inspector-collapsed');
    $('#toggleInspector').setAttribute('aria-pressed', String(!hidden));
    $('#toggleInspector').classList.toggle('active', !hidden);
};
$('#toggleInspector').addEventListener('click', collapseInspector);
$('#inspectorClose').addEventListener('click', collapseInspector);
// Accessible shortcuts reference.
function openShortcuts() {
    closePalette();
    $('#shortcutHelp').hidden = false;
    $('#shortcutsClose').focus();
}
function closeShortcuts() {
    $('#shortcutHelp').hidden = true;
}
$('#canvasHelp').addEventListener('click', openShortcuts);
$('#shortcutsClose').addEventListener('click', closeShortcuts);
$('#shortcutHelp').addEventListener('pointerdown', e => {
    if (e.target === $('#shortcutHelp'))
        closeShortcuts();
});
// Command palette: genuine tool and document actions, not decorative buttons.
const commands = [
    ['Open PDF', 'Document', '↥', () => pickFile()],
    ['Try sample PDF', 'Document', '◫', () => runDemo()],
    ['Select elements', 'Tools', '⌖', () => commandTool('select')],
    ['Edit existing text', 'Tools', 'Aa', () => commandTool('etext')],
    ['Add text', 'Tools', 'T', () => commandTool('text')],
    ['Draw shapes', 'Tools', '◇', () => commandTool('shp')],
    ['Draw with pen', 'Tools', '〰', () => commandTool('pen')],
    ['Highlight', 'Tools', '▰', () => commandTool('hl')],
    ['Add image', 'Tools', '▧', () => commandTool('img')],
    ['Create signature', 'Tools', '✍', () => commandTool('sig')],
    ['Fill forms', 'Tools', '☑', () => commandTool('form')],
    ['Redact areas', 'Tools', '▣', () => commandTool('red')],
    ['Manage pages', 'Document', '▤', () => {
            if (documentBytes)
                $('#pgs').click();
            else {
                pendingAction = 'pages';
                pendingTool = null;
                pickFile();
            }
        }],
    ['Fit page', 'View', '⊞', () => fitPage()],
    ['Toggle grid', 'View', '▦', () => $('#canvasGrid').click()],
    ['Toggle properties panel', 'View', '◫', () => collapseInspector()],
    ['Keyboard shortcuts', 'Help', '?', () => openShortcuts()],
    ['Export PDF', 'Document', '↓', () => documentBytes ? $('#save').click() : showToast('Open a PDF before exporting')],
    ['Return to home', 'Navigation', '⌂', () => documentBytes ? $('#backHome').click() : view.scrollTo({ top: 0, behavior: 'smooth' })],
    ['Configure author GitHub', 'Help', '↗', () => openGithubDialog()]
];
function commandTool(t) {
    if (!documentBytes) {
        openWithTool(t);
        return;
    }
    if (t === 'sig')
        openSignatureDialog();
    else if (t === 'img')
        $('#fi').click();
    else
        setTool(t);
}
let commandChoices = [], commandIndex = 0;
function renderCommands() {
    const q = $('#commandInput').value.trim().toLowerCase();
    commandChoices = commands.filter(c => `${c[0]} ${c[1]}`.toLowerCase().includes(q)).slice(0, 11);
    if (!commandChoices.length) {
        $('#commandResults').innerHTML = '<p class="command-no-results">No matching action. Try “shape”, “text” or “export”.</p>';
        return;
    }
    commandIndex = Math.min(commandIndex, commandChoices.length - 1);
    $('#commandResults').innerHTML = commandChoices.map((c, i) => `<button type="button" class="command-result ${i === commandIndex ? 'chosen' : ''}" data-command-index="${i}"><span class="command-icon">${escapeSvgText(c[2])}</span><span>${escapeSvgText(c[0])}</span><small>${escapeSvgText(c[1])}</small><span class="command-enter">↵</span></button>`).join('');
}
function openPalette() {
    closeShortcuts();
    $('#commandPalette').hidden = false;
    commandIndex = 0;
    $('#commandInput').value = '';
    renderCommands();
    $('#commandInput').focus();
}
function closePalette() {
    $('#commandPalette').hidden = true;
}
function runCommand(idx) {
    const selected = commandChoices[idx];
    if (!selected)
        return;
    closePalette();
    selected[3]();
}
$('#commandOpen').addEventListener('click', openPalette);
$('#commandInput').addEventListener('input', () => {
    commandIndex = 0;
    renderCommands();
});
$('#commandInput').addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        commandIndex = (commandIndex + (e.key === 'ArrowDown' ? 1 : -1) + commandChoices.length) % Math.max(1, commandChoices.length);
        renderCommands();
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        runCommand(commandIndex);
    }
});
$('#commandResults').addEventListener('click', e => {
    const b = e.target.closest('[data-command-index]');
    if (b)
        runCommand(+b.dataset.commandIndex);
});
$('#commandPalette').addEventListener('pointerdown', e => {
    if (e.target === $('#commandPalette'))
        closePalette();
});
// GitHub profile is intentionally configurable: avoid inventing Ajanur Rahman's username.
// To pre-configure for all visitors: set GITHUB_PROFILE_URL below to an actual https://github.com/<username> URL.
const GITHUB_PROFILE_URL = '';
const GITHUB_STORAGE_KEY = 'pdfstudio_ajanur_github';
function validGithub(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && u.hostname.toLowerCase() === 'github.com' && /^\/[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/?$/i.test(u.pathname);
    }
    catch (e) {
        return false;
    }
}
function configuredGithub() {
    try {
        return localStorage.getItem(GITHUB_STORAGE_KEY) || GITHUB_PROFILE_URL;
    }
    catch (e) {
        return GITHUB_PROFILE_URL;
    }
}
function applyGithubLink() {
    const url = configuredGithub(), valid = validGithub(url);
    document.querySelectorAll('.github-credit').forEach(el => {
        el.href = valid ? url : '#github-link-setup';
        el.target = valid ? '_blank' : '_self';
        el.title = valid ? 'Open Ajanur Rahman on GitHub' : 'Set Ajanur Rahman’s GitHub URL';
        el.classList.toggle('needs-link', !valid);
    });
    document.querySelectorAll('.github-configure').forEach(el => el.textContent = valid ? 'Edit GitHub link' : 'Connect GitHub profile');
}
function openGithubDialog() {
    closePalette();
    $('#githubDialog').hidden = false;
    $('#githubUrl').value = configuredGithub();
    $('#githubError').hidden = true;
    $('#githubUrl').focus();
}
function closeGithubDialog() {
    $('#githubDialog').hidden = true;
}
for (const link of document.querySelectorAll('.github-credit'))
    link.addEventListener('click', e => {
        if (!validGithub(configuredGithub())) {
            e.preventDefault();
            openGithubDialog();
        }
    });
for (const btn of document.querySelectorAll('.github-configure'))
    btn.addEventListener('click', openGithubDialog);
$('#githubClose').addEventListener('click', closeGithubDialog);
$('#githubCancel').addEventListener('click', closeGithubDialog);
$('#githubDialog').addEventListener('pointerdown', e => {
    if (e.target === $('#githubDialog'))
        closeGithubDialog();
});
$('#githubForm').addEventListener('submit', e => {
    e.preventDefault();
    const url = $('#githubUrl').value.trim();
    if (!validGithub(url)) {
        $('#githubError').hidden = false;
        return;
    }
    try {
        localStorage.setItem(GITHUB_STORAGE_KEY, url);
    }
    catch (e) {
        showToast('Browser storage is unavailable · set GITHUB_PROFILE_URL in app.js to make it permanent');
        return;
    }
    applyGithubLink();
    closeGithubDialog();
    showToast('GitHub footer link connected');
});
applyGithubLink();
// Shortcuts: only when the user is not typing/editing or interacting with modals.
addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (k === 'escape') {
        if (!$('#commandPalette').hidden) {
            e.preventDefault();
            e.stopImmediatePropagation();
            closePalette();
            return;
        }
        if (!$('#shortcutHelp').hidden) {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeShortcuts();
            return;
        }
        if (!$('#githubDialog').hidden) {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeGithubDialog();
            return;
        }
    }
    if (mod && k === 'k') {
        e.preventDefault();
        $('#commandPalette').hidden ? openPalette() : closePalette();
        return;
    }
    if (!$('#commandPalette').hidden || !$('#shortcutHelp').hidden || !$('#githubDialog').hidden)
        return;
    const el = document.activeElement;
    if (el && (el.matches('input, textarea, select, [contenteditable]') || el.isContentEditable))
        return;
    if (mod || e.altKey)
        return;
    if (!documentBytes) {
        if (k === '/') {
            e.preventDefault();
            $('#toolSearch').focus();
            return;
        }
        return;
    }
    const map = { v: 'select', e: 'etext', t: 'text', r: 'shp', p: 'pen', h: 'hl' };
    if (map[k]) {
        e.preventDefault();
        setTool(map[k]);
    }
    else if (k === '?') {
        e.preventDefault();
        openShortcuts();
    }
}, true);
