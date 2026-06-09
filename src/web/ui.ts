/**
 * Inline HTML/CSS/JS for the session browser SPA.
 * No frameworks, no build tools — just a single HTML string.
 */
export function getHtml(): string {
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
  --border: #2a2a3a;
  --text: #e0e0e8;
  --text2: #9090a0;
  --accent: #6366f1;
  --accent-dim: #4f46e5;
  --green: #22c55e;
  --red: #ef4444;
  --radius: 8px;
  --font: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  font-size: 13px;
}
a { color: var(--accent); text-decoration: none; cursor: pointer; }
a:hover { text-decoration: underline; }

/* Layout */
.app { display: grid; grid-template-columns: 240px 1fr 1fr; height: 100vh; }
.panel { border-right: 1px solid var(--border); overflow-y: auto; }
.panel:last-child { border-right: none; }
.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text2);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

/* Project list */
.project-item {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.project-item:hover { background: var(--surface2); }
.project-item.active { background: var(--surface); border-left: 3px solid var(--accent); }
.project-name { font-weight: 600; color: var(--text); margin-bottom: 2px; }
.project-meta { font-size: 11px; color: var(--text2); }

/* Session list */
.session-table { width: 100%; border-collapse: collapse; }
.session-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text2);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
}
.session-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-table tr { cursor: pointer; transition: background 0.15s; }
.session-table tbody tr:hover { background: var(--surface2); }
.session-table tbody tr.active { background: var(--surface); }

/* Filters */
.filters {
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.filters label { font-size: 11px; color: var(--text2); }
.filters input {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 8px;
  border-radius: var(--radius);
  font-family: var(--font);
  font-size: 12px;
}
.filters input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
.filter-count { font-size: 11px; color: var(--text2); margin-left: auto; }

/* Detail */
.detail { padding: 16px; }
.detail h2 { font-size: 16px; margin-bottom: 12px; color: var(--text); }
.detail-field {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.detail-label { color: var(--text2); min-width: 100px; font-size: 11px; text-transform: uppercase; }
.detail-value { color: var(--text); word-break: break-all; }
.detail-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.detail-section h3 {
  font-size: 13px;
  color: var(--text2);
  margin-bottom: 8px;
}

/* File edits list */
.file-list { list-style: none; }
.file-list li {
  padding: 4px 0;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.file-list .path { color: var(--text); }
.file-list .count { color: var(--text2); }

/* Messages / conversation */
.messages-section { margin-top: 16px; }
.msg {
  padding: 10px 12px;
  border-radius: var(--radius);
  margin-bottom: 8px;
  max-height: 400px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
  transition: max-height 0.3s;
}
.msg.collapsed { max-height: 60px; overflow: hidden; position: relative; }
.msg.collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, var(--surface2));
}
.msg-user { background: var(--surface); border-left: 3px solid var(--accent); }
.msg-assistant { background: var(--surface2); border-left: 3px solid var(--green); }
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
.load-messages-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius);
  cursor: pointer;
  font-family: var(--font);
  font-size: 12px;
  margin-top: 8px;
}
.load-messages-btn:hover { background: var(--accent-dim); }
.msg-loading { color: var(--text2); font-size: 12px; }

/* Empty states */
.empty { padding: 24px 16px; text-align: center; color: var(--text2); }

/* Responsive */
@media (max-width: 768px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: auto;
  }
  .panel { border-right: none; border-bottom: 1px solid var(--border); max-height: 50vh; }
  .panel:last-child { max-height: none; }
}
</style>
</head>
<body>
<div class="app">
  <div class="panel" id="projects-panel">
    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center">
      <span>Projects</span>
      <select id="project-sort" onchange="loadProjects()" style="background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:4px;padding:2px 4px;font-size:10px;font-family:var(--font)">
        <option value="time">By time</option>
        <option value="count">By count</option>
      </select>
    </div>
    <div id="projects-list"></div>
  </div>
  <div class="panel" id="sessions-panel">
    <div class="panel-header">Sessions</div>
    <div class="filters">
      <label>From</label><input type="date" id="filter-from">
      <label>To</label><input type="date" id="filter-to">
      <span class="filter-count" id="session-count"></span>
    </div>
    <div id="sessions-list"></div>
  </div>
  <div class="panel" id="detail-panel">
    <div class="panel-header">Detail</div>
    <div class="detail" id="detail-content">
      <div class="empty">Select a session to view details</div>
    </div>
  </div>
</div>

<script>
// ---- State ----
let currentProject = null;
let currentSessionId = null;
let allSessions = [];

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
    loadSessions();
  }
  if (r.session !== currentSessionId) {
    currentSessionId = r.session;
    if (currentSessionId) loadDetail(currentSessionId);
  }
  highlightProject();
}

// ---- API ----
async function api(path) {
  const res = await fetch(path);
  return res.json();
}

// ---- Projects ----
async function loadProjects() {
  const sort = document.getElementById('project-sort')?.value || 'time';
  const projects = await api('/api/projects?sort=' + sort);
  const el = document.getElementById('projects-list');
  el.innerHTML = projects.map(p => {
    const dateStr = p.dateRange.start
      ? p.dateRange.start.slice(0,10) + ' ~ ' + p.dateRange.end.slice(0,10)
      : 'No dates';
    return '<div class="project-item" data-name="' + esc(p.name) + '" onclick="selectProject(\\'' + esc(p.name) + '\\')">'
      + '<div class="project-name">' + esc(p.name) + '</div>'
      + '<div class="project-meta">' + p.sessionCount + ' sessions &middot; ' + dateStr + '</div>'
      + '</div>';
  }).join('');
}

function selectProject(name) {
  setHash({ project: name });
}

function highlightProject() {
  document.querySelectorAll('.project-item').forEach(el => {
    el.classList.toggle('active', el.dataset.name === currentProject);
  });
}

// ---- Sessions ----
async function loadSessions() {
  if (!currentProject) {
    document.getElementById('sessions-list').innerHTML = '<div class="empty">Select a project</div>';
    document.getElementById('session-count').textContent = '';
    return;
  }
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  let url = '/api/sessions?project=' + encodeURIComponent(currentProject);
  if (from) url += '&from=' + from;
  if (to) url += '&to=' + to;

  allSessions = await api(url);
  renderSessions();
}

function renderSessions() {
  const el = document.getElementById('sessions-list');
  const count = document.getElementById('session-count');
  count.textContent = allSessions.length + ' sessions';

  if (allSessions.length === 0) {
    el.innerHTML = '<div class="empty">No sessions found</div>';
    return;
  }

  el.innerHTML = '<table class="session-table"><thead><tr>'
    + '<th>ID</th><th>Title</th><th>Date</th><th>Msgs</th><th>Cost</th>'
    + '</tr></thead><tbody>'
    + allSessions.map(s => {
      const date = s.startTime ? s.startTime.slice(0,10) : 'N/A';
      const msgs = s.messages.user + s.messages.assistant;
      const cost = formatCost(s);
      return '<tr data-id="' + esc(s.id) + '" onclick="selectSession(\\'' + esc(s.id) + '\\')">'
        + '<td>' + esc(s.shortId) + '</td>'
        + '<td>' + esc(s.title) + '</td>'
        + '<td>' + date + '</td>'
        + '<td>' + msgs + '</td>'
        + '<td>' + cost + '</td>'
        + '</tr>';
    }).join('')
    + '</tbody></table>';

  if (currentSessionId) {
    document.querySelectorAll('.session-table tbody tr').forEach(tr => {
      tr.classList.toggle('active', tr.dataset.id === currentSessionId || tr.dataset.id.startsWith(currentSessionId));
    });
  }
}

function selectSession(id) {
  setHash({ project: currentProject, session: id });
}

// ---- Detail ----
async function loadDetail(id) {
  const el = document.getElementById('detail-content');
  el.innerHTML = '<div class="empty">Loading...</div>';

  const data = await api('/api/sessions/' + id);
  if (data.error) {
    el.innerHTML = '<div class="empty">' + esc(data.error) + '</div>';
    return;
  }

  const start = data.startTime ? new Date(data.startTime).toLocaleString() : 'N/A';
  const end = data.endTime ? new Date(data.endTime).toLocaleString() : 'N/A';
  const msgs = data.messages;
  const totalMsgs = msgs.user + msgs.assistant;
  const estTag = data.cost.isEstimated ? ' <span style="color:var(--text2)">(estimated)</span>' : '';
  const tokenStr = data.cost.inputTokens > 0
    ? formatTokens(data.cost.inputTokens) + ' in / ' + formatTokens(data.cost.outputTokens) + ' out'
    : '';

  let html = '<h2>' + esc(data.title) + '</h2>'
    + field('ID', data.id)
    + field('Project', data.project)
    + field('Time', start + ' &rarr; ' + end)
    + field('Messages', totalMsgs + ' (user: ' + msgs.user + ', assistant: ' + msgs.assistant + ', system: ' + msgs.system + ')')
    + field('Cost', '$' + data.cost.totalUSD.toFixed(2) + estTag + (tokenStr ? ' &middot; ' + tokenStr : ''))
    + field('Models', data.models.join(', ') || 'N/A');

  // File edits
  html += '<div class="detail-section"><h3>File Edits</h3>';
  if (data.fileEdits && data.fileEdits.length > 0) {
    html += '<ul class="file-list">'
      + data.fileEdits.map(f => '<li><span class="path">' + esc(f.filePath) + '</span><span class="count">' + f.editCount + '</span></li>').join('')
      + '</ul>';
  } else {
    html += '<div style="color:var(--text2)">No file edits</div>';
  }
  html += '</div>';

  // Conversation messages
  html += '<div class="detail-section messages-section">'
    + '<h3>Conversation</h3>'
    + '<button class="load-messages-btn" onclick="loadMessages(\\'' + esc(data.id) + '\\')">Load Messages</button>'
    + '<div id="messages-content"></div>'
    + '</div>';

  el.innerHTML = html;

  document.querySelectorAll('.session-table tbody tr').forEach(tr => {
    tr.classList.toggle('active', tr.dataset.id === data.id);
  });
}

async function loadMessages(sessionId) {
  const container = document.getElementById('messages-content');
  const btn = container.previousElementSibling;
  btn.style.display = 'none';
  container.innerHTML = '<div class="msg-loading">Loading messages...</div>';

  const messages = await api('/api/sessions/' + sessionId + '/messages');
  if (!messages.length) {
    container.innerHTML = '<div style="color:var(--text2)">No messages found</div>';
    return;
  }

  container.innerHTML = messages.map(m => {
    const roleClass = m.role === 'user' ? 'msg-user' : 'msg-assistant';
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
    const model = m.model ? ' &middot; ' + m.model : '';
    return '<div class="msg ' + roleClass + ' collapsed" onclick="toggleMsg(this)">'
      + '<div class="msg-role">' + m.role + '</div>'
      + '<div class="msg-meta">' + time + model + '</div>'
      + esc(m.content)
      + '</div>';
  }).join('');
}

function toggleMsg(el) {
  el.classList.toggle('collapsed');
}

// ---- Helpers ----
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function field(label, value) {
  return '<div class="detail-field"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>';
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

// ---- Date filter listeners ----
document.getElementById('filter-from').addEventListener('change', loadSessions);
document.getElementById('filter-to').addEventListener('change', loadSessions);

// ---- Init ----
loadProjects().then(() => {
  const r = readHash();
  if (r.project) {
    currentProject = r.project;
    highlightProject();
    loadSessions().then(() => {
      if (r.session) {
        currentSessionId = r.session;
        loadDetail(r.session);
      }
    });
  }
});
</script>
</body>
</html>`;
}
