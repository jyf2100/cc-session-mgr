/**
 * Inline HTML/CSS/JS for the session browser SPA.
 * No frameworks, no build tools — just a single HTML string.
 *
 * TODO(theme): this panel ships a self-contained dark CSS design that is
 * fully independent of the terminal TUI color system in `src/tui/theme.ts`.
 * Wiring it into the same SESSION_MGR_THEME mechanism (light variant) is
 * deferred — see the tui-light-theme PR description.
 */
export function getHtml(timezone?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code Session Browser</title>
<style>
:root {
  --bg: #0a0a0f;
  --surface: #13131a;
  --surface2: #1a1a24;
  --card: #1e1e2a;
  --border: #2a2a3a;
  --text: #e0e0e8;
  --text2: #9090a0;
  --accent: #6366f1;
  --accent-dim: #4f46e5;
  --green: #22c55e;
  --red: #ef4444;
  --radius: 10px;
  --font: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  font-size: 14px;
}
a { color: var(--accent); text-decoration: none; cursor: pointer; }
a:hover { text-decoration: underline; }

/* Layout: main + overlay drawer */
.app {
  height: 100vh;
}
.app.drawer-open {
}

/* Main area */
.main-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Top navigation bar */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
}
.nav-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
  margin-right: 8px;
}
.nav-btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.nav-btn:hover { background: var(--hover); }
.nav-btn:active { background: var(--border); }
.nav-select, .nav-input {  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 10px;
  border-radius: var(--radius);
  font-family: var(--font);
  font-size: 13px;
}
.nav-select:focus, .nav-input:focus {
  outline: 1px solid var(--accent);
  border-color: var(--accent);
}
.nav-input { width: 130px; }
.nav-label { font-size: 12px; color: var(--text2); }
.nav-count { margin-left: auto; font-size: 12px; color: var(--text2); }

/* Session table */
.table-wrap { flex: 1; overflow-y: auto; }
.session-table { width: 100%; border-collapse: collapse; }
.session-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text2);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 5;
}
.session-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.session-table tbody tr { cursor: pointer; transition: background 0.15s; }
.session-table tbody tr:hover { background: var(--surface2); }
.session-table tbody tr.active {
  background: var(--surface);
  border-left: 3px solid var(--accent);
}
.hide-project .col-project { display: none; }

/* Right drawer */
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 75%;
  height: 100vh;
  overflow-y: auto;
  padding: 24px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 16px rgba(0,0,0,0.08);
  z-index: 100;
  transform: translateX(100%);
  transition: transform 0.25s ease;
}
.app.drawer-open .drawer {
  transform: translateX(0);
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  position: sticky;
  top: 0;
  background: var(--surface);
  padding: 8px 0 12px;
  z-index: 10;
}
.drawer-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  line-height: 1.3;
}
.drawer-subtitle {
  font-size: 13px;
  color: var(--text2);
  margin-top: 4px;
}
.drawer-close {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 16px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius);
  line-height: 1;
}
.drawer-close:hover { background: var(--surface2); color: var(--text); }

/* Collapsible cards */
.card {
  background: var(--card);
  border-radius: var(--radius);
  margin-bottom: 12px;
  overflow: hidden;
}
.card summary {
  padding: 14px 16px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}
.card summary::-webkit-details-marker { display: none; }
.card summary::before {
  content: '\\25B6';
  font-size: 10px;
  margin-right: 8px;
  display: inline-block;
  transition: transform 0.2s;
}
.card details[open] > summary::before { transform: rotate(90deg); }
.card summary .card-count {
  font-weight: 400;
  font-size: 12px;
  color: var(--text2);
}
.card-body {
  padding: 0 16px 16px;
  font-size: 13px;
}

/* Info card fields */
.info-field {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.info-field:last-child { border-bottom: none; }
.info-label {
  color: var(--text2);
  min-width: 90px;
  font-size: 12px;
  text-transform: uppercase;
}
.info-value { color: var(--text); word-break: break-all; }

/* File edits */
.file-list { list-style: none; }
.file-list li {
  padding: 4px 0;
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 12px;
}
.file-list .path { color: var(--text); }
.file-list .count { color: var(--text2); }

/* Messages */
.msg {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 8px;
  max-height: 400px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
  transition: max-height 0.3s;
  font-family: var(--font-mono);
}
.msg.collapsed { max-height: 60px; overflow: hidden; position: relative; }
.msg.collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, var(--card));
}
.msg-user { background: var(--surface2); border-left: 3px solid var(--accent); }
.msg-assistant { background: var(--surface); border-left: 3px solid var(--green); }
.msg-role {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.msg-user .msg-role { color: var(--accent); }
.msg-assistant .msg-role { color: var(--green); }
.msg-meta { font-size: 10px; color: var(--text2); margin-bottom: 4px; }
.msg-loading { color: var(--text2); font-size: 13px; padding: 8px 0; }

/* Analysis */
.analysis-phase {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.analysis-phase:last-child { border-bottom: none; }
.analysis-phase .phase-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}
.analysis-phase .phase-name { font-weight: 600; color: var(--text); }
.analysis-phase .phase-range { color: var(--text2); font-size: 11px; }
.analysis-phase .phase-tags { color: var(--text2); }

.analysis-lint-item {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.analysis-lint-item:last-child { border-bottom: none; }
.analysis-lint-item .lint-severity {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  margin-right: 6px;
}
.analysis-lint-item .lint-severity.warn { background: #f59e0b22; color: #d97706; }
.analysis-lint-item .lint-severity.error { background: #ef444422; color: #dc2626; }
.analysis-lint-item .lint-severity.info { background: #3b82f622; color: #2563eb; }

.analysis-tl-summary { font-size: 12px; color: var(--text2); padding: 8px 0; border-bottom: 1px solid var(--border); }
.analysis-tl-waste { font-size: 11px; color: var(--red); padding: 4px 0; }
.analysis-postmortem { padding: 8px 0; font-size: 12px; }
.analysis-postmortem .pm-label { color: var(--text2); }
.analysis-postmortem .pm-value { color: var(--text); font-weight: 600; }
.analysis-block { margin-bottom: 12px; }
.analysis-block h4 { font-size: 12px; color: var(--text2); margin-bottom: 6px; }

/* Empty state */
.empty { padding: 32px 16px; text-align: center; color: var(--text2); }
</style>
</head>
<body>
<div class="app" id="app">
  <div class="main-area">
    <nav class="top-nav">
      <span class="nav-title">Session Browser</span>
      <label class="nav-label">Project</label>
      <select class="nav-select" id="project-select">
        <option value="">All Projects</option>
      </select>
      <label class="nav-label">From</label>
      <input type="date" class="nav-input" id="filter-from">
      <label class="nav-label">To</label>
      <input type="date" class="nav-input" id="filter-to">
      <button class="nav-btn" onclick="onQuery()">查询</button>
      <span class="nav-count" id="session-count"></span>
    </nav>
    <div class="table-wrap" id="table-wrap">
      <table class="session-table">
        <thead><tr>
          <th>Title</th>
          <th class="col-project">Project</th>
          <th>Time</th>
          <th>Cost</th>
          <th>Msgs</th>
          <th>Edits</th>
        </tr></thead>
        <tbody id="session-tbody"></tbody>
      </table>
      <div class="empty" id="table-empty" style="display:none">No sessions found</div>
    </div>
  </div>

  <div class="drawer" id="drawer">
    <div class="drawer-header">
      <div>
        <h2 id="drawer-title"></h2>
        <div class="drawer-subtitle" id="drawer-subtitle"></div>
      </div>
      <button class="drawer-close" onclick="closeDrawer()" title="Close">&times;</button>
    </div>
    <div id="drawer-cards"></div>
  </div>
</div>

<script>
// Timezone-aware date formatting (matches server-side --tz option)
const _tzDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: ${timezone ? JSON.stringify(timezone) : "undefined"},
  year: "numeric", month: "2-digit", day: "2-digit"
});
function toDate(ts) { return ts ? _tzDateFmt.format(new Date(ts)) : "N/A"; }

// ---- State ----
let currentProject = null;
let currentSessionId = null;
let allProjects = [];
let allSessions = [];
let drawerOpen = false;
let currentDetailId = null;

// ---- Routing ----
function readHash() {
  const h = location.hash.slice(1);
  const params = new URLSearchParams(h);
  return {
    project: params.get('project') || null,
    session: params.get('session') || null,
  };
}

function setHash(params) {
  const parts = [];
  if (params.project) parts.push('project=' + encodeURIComponent(params.project));
  if (params.session) parts.push('session=' + encodeURIComponent(params.session));
  location.hash = parts.join('&');
}

window.addEventListener('hashchange', onRoute);

function onRoute() {
  const r = readHash();
  if (r.project !== currentProject) {
    currentProject = r.project;
    document.getElementById('project-select').value = currentProject || '';
    loadSessions();
  }
  if (r.session !== currentSessionId) {
    currentSessionId = r.session;
    if (currentSessionId) openDrawer(currentSessionId);
    else closeDrawer();
  }
}

// ---- API ----
async function api(path) {
  const res = await fetch(path);
  return res.json();
}

// ---- Projects (nav dropdown) ----
async function loadProjects() {
  allProjects = await api('/api/projects');
  const sel = document.getElementById('project-select');
  sel.innerHTML = '<option value="">All Projects</option>'
    + allProjects.map(p => '<option value="' + esc(p.name) + '">' + esc(p.name) + ' (' + p.sessionCount + ')</option>').join('');
}

function onQuery() {
  const val = document.getElementById('project-select').value;
  currentProject = val || null;
  loadSessions();
  setHash({ project: currentProject, session: null });
}

// ---- Sessions ----
async function loadSessions() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const tbody = document.getElementById('session-tbody');
  const emptyEl = document.getElementById('table-empty');
  const count = document.getElementById('session-count');

  tbody.innerHTML = '';
  count.textContent = '';

  if (currentProject) {
    let url = '/api/sessions?project=' + encodeURIComponent(currentProject);
    if (from) url += '&from=' + from;
    if (to) url += '&to=' + to;
    allSessions = await api(url);
    allSessions = allSessions.map(s => ({ ...s, projectName: currentProject }));
  } else if (allProjects.length > 0) {
    const results = await Promise.all(allProjects.map(async p => {
      let url = '/api/sessions?project=' + encodeURIComponent(p.name);
      if (from) url += '&from=' + from;
      if (to) url += '&to=' + to;
      const sessions = await api(url);
      return sessions.map(s => ({ ...s, projectName: p.name }));
    }));
    allSessions = results.flat().sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  } else {
    allSessions = [];
  }

  // Toggle project column visibility
  const table = document.querySelector('.session-table');
  if (currentProject) table.classList.add('hide-project');
  else table.classList.remove('hide-project');

  count.textContent = allSessions.length + ' sessions';

  if (allSessions.length === 0) {
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';
  tbody.innerHTML = allSessions.map(s => {
    const date = s.startTime ? toDate(s.startTime) : 'N/A';
    const msgs = s.messages.user + s.messages.assistant;
    const cost = formatCost(s);
    const editCount = s.fileEdits ? s.fileEdits.reduce((sum, f) => sum + f.editCount, 0) : 0;
    return '<tr data-id="' + esc(s.id) + '" onclick="onRowClick(this.dataset.id)">'
      + '<td>' + esc(s.title) + '</td>'
      + '<td class="col-project">' + esc(s.projectName || s.project || '') + '</td>'
      + '<td>' + date + '</td>'
      + '<td>' + cost + '</td>'
      + '<td>' + msgs + '</td>'
      + '<td>' + editCount + '</td>'
      + '</tr>';
  }).join('');

  highlightRow();
}

function onRowClick(id) {
  setHash({ project: currentProject, session: id });
}

function highlightRow() {
  document.querySelectorAll('.session-table tbody tr').forEach(tr => {
    tr.classList.toggle('active',
      tr.dataset.id === currentSessionId ||
      (currentSessionId && tr.dataset.id.startsWith(currentSessionId))
    );
  });
}

// ---- Drawer ----
function openDrawer(id) {
  const app = document.getElementById('app');
  app.classList.add('drawer-open');
  drawerOpen = true;
  highlightRow();
  loadDetail(id);
}

function closeDrawer() {
  const app = document.getElementById('app');
  app.classList.remove('drawer-open');
  drawerOpen = false;
  currentSessionId = null;

  const r = readHash();
  if (r.session) setHash({ project: currentProject, session: null });

  highlightRow();
}

// Escape key closes drawer
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && drawerOpen) closeDrawer();
});

// ---- Detail ----
async function loadDetail(id) {
  const title = document.getElementById('drawer-title');
  const subtitle = document.getElementById('drawer-subtitle');
  const cards = document.getElementById('drawer-cards');

  title.textContent = 'Loading...';
  subtitle.textContent = '';
  cards.innerHTML = '';
  currentDetailId = id;

  const data = await api('/api/sessions/' + id);
  if (data.error) {
    title.textContent = 'Error';
    subtitle.textContent = data.error;
    return;
  }

  title.textContent = data.title || 'Untitled Session';
  subtitle.textContent = (data.project || '') + ' \\u00B7 ' + relativeTime(data.startTime);

  const msgs = data.messages;
  const totalMsgs = msgs.user + msgs.assistant;
  const editFiles = data.fileEdits ? data.fileEdits.length : 0;
  const editCount = data.fileEdits ? data.fileEdits.reduce((sum, f) => sum + f.editCount, 0) : 0;
  const start = data.startTime ? new Date(data.startTime).toLocaleString() : 'N/A';
  const end = data.endTime ? new Date(data.endTime).toLocaleString() : 'N/A';
  const estTag = data.cost.isEstimated ? ' (estimated)' : '';
  const tokenStr = data.cost.inputTokens > 0
    ? formatTokens(data.cost.inputTokens) + ' in / ' + formatTokens(data.cost.outputTokens) + ' out'
    : '';

  let html = '';

  // Info card (open by default)
  html += '<div class="card"><details open><summary>Info</summary><div class="card-body">'
    + infoField('Time', start + ' \\u2192 ' + end)
    + infoField('Cost', '$' + data.cost.totalUSD.toFixed(2) + estTag + (tokenStr ? ' \\u00B7 ' + tokenStr : ''))
    + infoField('Models', data.models.join(', ') || 'N/A')
    + infoField('Messages', totalMsgs + ' (user: ' + msgs.user + ', assistant: ' + msgs.assistant + ', system: ' + msgs.system + ')')
    + infoField('File Edits', editFiles + ' files, ' + editCount + ' edits')
    + '</div></details></div>';

  // File Edits card
  html += '<div class="card"><details><summary>File Edits <span class="card-count">(' + editFiles + ')</span></summary><div class="card-body">';
  if (data.fileEdits && data.fileEdits.length > 0) {
    html += '<ul class="file-list">'
      + data.fileEdits.map(f => '<li><span class="path">' + esc(f.filePath) + '</span><span class="count">' + f.editCount + '</span></li>').join('')
      + '</ul>';
  } else {
    html += '<div style="color:var(--text2)">No file edits</div>';
  }
  html += '</div></details></div>';

  // Messages card (lazy load on first expand)
  html += '<div class="card"><details id="card-messages" ontoggle="onMessagesToggle(event)">'
    + '<summary>Messages <span class="card-count">(' + totalMsgs + ')</span></summary>'
    + '<div class="card-body" id="messages-content"></div></details></div>';

  // Analysis card (lazy load on first expand)
  html += '<div class="card"><details id="card-analysis" ontoggle="onAnalysisToggle(event)">'
    + '<summary>Analysis</summary>'
    + '<div class="card-body" id="analysis-content"></div></details></div>';

  cards.innerHTML = html;
}

// Lazy load: messages on first expand
function onMessagesToggle(e) {
  if (!e.target.open) return;
  if (e.target.dataset.loaded) return;
  e.target.dataset.loaded = '1';
  loadMessages(currentDetailId);
}

// Lazy load: analysis on first expand
function onAnalysisToggle(e) {
  if (!e.target.open) return;
  if (e.target.dataset.loaded) return;
  e.target.dataset.loaded = '1';
  loadAnalysis(currentDetailId);
}

async function loadMessages(sessionId) {
  const container = document.getElementById('messages-content');
  container.innerHTML = '<div class="msg-loading">Loading messages...</div>';

  const messages = await api('/api/sessions/' + sessionId + '/messages');
  if (!messages.length) {
    container.innerHTML = '<div style="color:var(--text2)">No messages found</div>';
    return;
  }

  messages.reverse();
  container.innerHTML = messages.map(m => {
    const roleClass = m.role === 'user' ? 'msg-user' : 'msg-assistant';
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
    const model = m.model ? ' \\u00B7 ' + m.model : '';
    return '<div class="msg ' + roleClass + ' collapsed" onclick="toggleMsg(this)">'
      + '<div class="msg-role">' + m.role + '</div>'
      + '<div class="msg-meta">' + time + model + '</div>'
      + esc(m.content)
      + '</div>';
  }).join('');
}

async function loadAnalysis(sessionId) {
  const container = document.getElementById('analysis-content');
  container.innerHTML = '<div class="msg-loading">Running analysis...</div>';

  const data = await api('/api/sessions/' + sessionId + '/analysis');
  let html = '';

  // Phases
  html += '<div class="analysis-block"><h4>Phases</h4>';
  if (data.phases && data.phases.length) {
    html += data.phases.map(function(p) {
      const range = (p.startTime || '') + (p.endTime ? ' \\u2192 ' + p.endTime : '');
      const tags = (p.filesModified && p.filesModified.length) ? p.filesModified.slice(0,4).join(', ') : '';
      const dur = p.durationMs ? formatDuration(p.durationMs) : '';
      const cost = p.costUSD ? ' \\u00B7 $' + p.costUSD.toFixed(2) : '';
      const tools = p.toolCount ? ' \\u00B7 ' + p.toolCount + ' tools' : '';
      return '<div class="analysis-phase">'
        + '<div class="phase-header"><span class="phase-name">' + esc(p.name || 'Phase') + '</span>'
        + '<span class="phase-range">' + esc(range) + '</span></div>'
        + '<div class="phase-tags">' + esc(dur + tools + cost) + (tags ? ' \\u00B7 ' + esc(tags) : '') + '</div>'
        + '</div>';
    }).join('');
  } else {
    html += '<div style="color:var(--text2)">No phases detected</div>';
  }
  html += '</div>';

  // Lint findings
  html += '<div class="analysis-block"><h4>Lint Findings</h4>';
  if (data.lintFindings && data.lintFindings.length) {
    html += data.lintFindings.map(function(f) {
      const sev = (f.severity || 'info').toLowerCase();
      const sevClass = (sev === 'warning') ? 'warn' : ((sev === 'error') ? 'error' : 'info');
      return '<div class="analysis-lint-item">'
        + '<span class="lint-severity ' + sevClass + '">' + esc(sev) + '</span>'
        + '<span style="color:var(--text2);margin-right:6px;">' + esc(f.ruleId || '') + '</span>'
        + esc(f.message || 'Finding')
        + '</div>';
    }).join('');
  } else {
    html += '<div style="color:var(--text2)">No issues found</div>';
  }
  html += '</div>';

  // Timeline
  html += '<div class="analysis-block"><h4>Timeline</h4>';
  if (data.timeline) {
    const tl = data.timeline;
    if (tl.summary) {
      html += '<div class="analysis-tl-summary">Duration: ' + formatDuration(tl.summary.totalDurationMs)
        + ' \\u00B7 Tool calls: ' + tl.summary.totalToolCalls
        + ' \\u00B7 Cost: $' + tl.summary.totalCost.toFixed(2) + '</div>';
      if (tl.summary.wastedSpendUSD > 0) {
        html += '<div class="analysis-tl-waste">Wasted spend: $' + tl.summary.wastedSpendUSD.toFixed(2) + '</div>';
      }
    }
    if (tl.phases && tl.phases.length) {
      html += tl.phases.map(function(tp) {
        return '<div class="analysis-phase">'
          + '<div class="phase-header"><span class="phase-name">' + esc(tp.name) + '</span>'
          + '<span class="phase-range">' + formatDuration(tp.durationMs)
          + ' \\u00B7 $' + tp.costUSD.toFixed(2)
          + ' \\u00B7 ' + tp.toolCallCount + ' tools'
          + (tp.errorCount ? ' \\u00B7 ' + tp.errorCount + ' errors' : '')
          + '</span></div></div>';
      }).join('');
    }
    if (!tl.summary && !(tl.phases && tl.phases.length)) html += '<div style="color:var(--text2)">No timeline data</div>';
  } else {
    html += '<div style="color:var(--text2)">No timeline data</div>';
  }
  html += '</div>';

  // Postmortem
  html += '<div class="analysis-block"><h4>Postmortem</h4>';
  if (data.postmortem && data.postmortem.hasCrash) {
    const pm = data.postmortem;
    html += '<div class="analysis-postmortem">';
    html += '<div><span class="pm-label">Crash type: </span><span class="pm-value">' + esc(pm.crashType || 'unknown') + '</span></div>';
    if (pm.lastUserPrompt) html += '<div><span class="pm-label">Last prompt: </span><span class="pm-value">' + esc(pm.lastUserPrompt) + '</span></div>';
    if (pm.rootCauseSteps && pm.rootCauseSteps.length) {
      html += '<div style="margin-top:6px"><span class="pm-label">Root cause: </span>';
      html += pm.rootCauseSteps.map(function(s) { return esc(s); }).join(' \\u2192 ');
      html += '</div>';
    }
    if (pm.violations && pm.violations.length) {
      html += '<div style="margin-top:6px"><span class="pm-label">Violations:</span></div>';
      html += pm.violations.map(function(v) {
        return '<div style="margin-left:8px;color:var(--text)">- ' + esc(v.rule) + ': ' + esc(v.description) + '</div>';
      }).join('');
    }
    if (pm.recoverySuggestions && pm.recoverySuggestions.length) {
      html += '<div style="margin-top:6px"><span class="pm-label">Recovery suggestions:</span></div>';
      html += pm.recoverySuggestions.map(function(s) {
        return '<div style="margin-left:8px;color:var(--text)">- ' + esc(s) + '</div>';
      }).join('');
    }
    html += '</div>';
  } else {
    html += '<div style="color:var(--text2)">No crash detected</div>';
  }
  html += '</div>';

  container.innerHTML = html;
}

function toggleMsg(el) { el.classList.toggle('collapsed'); }

// ---- Helpers ----
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function infoField(label, value) {
  return '<div class="info-field"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + esc(value) + '</span></div>';
}

function formatCost(s) {
  let str = '$' + s.cost.totalUSD.toFixed(2);
  if (s.cost.inputTokens > 0) {
    str += ' (' + formatTokens(s.cost.inputTokens) + ' / ' + formatTokens(s.cost.outputTokens) + ')';
  }
  return str;
}

function formatTokens(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return String(n);
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return toDate(ts);
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0ms';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

// ---- Init ----
loadProjects().then(() => {
  onRoute();
  if (!currentProject) loadSessions();
});
</script>
</body>
</html>`;
}
