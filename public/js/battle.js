/* =====================================================
   battle.js v2 — 前端 SSE 客户端（Premium 版）
   ===================================================== */

let es = null;
let currentReport = '';

// ─── Markdown 轻量渲染 ──────────────────────────────────
function markdownToHtml(md) {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .split('\n')
    .map(line => {
      if (line.match(/^<(h[23]|blockquote)/)) return line;
      return line ? `<p>${line}</p>` : '';
    })
    .join('\n');
}

function scrollToBottom(el) {
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function updateTime() {
  const el = document.getElementById('termTime');
  if (el) el.textContent = new Date().toLocaleTimeString('zh-CN');
}
setInterval(updateTime, 1000);
updateTime();

// ─── 用户画像初始化 ─────────────────────────────────────
async function initProfile() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) { window.location.href = '/'; return; }
    const { profile } = await res.json();
    document.getElementById('userName').textContent = profile.name;
    document.getElementById('victimName').textContent = profile.name + ' 的分身';
    document.title = `对战中 · ${profile.name} — 局中局`;
  } catch (e) {
    console.error('initProfile error', e);
  }
}
initProfile();

// ─── 聊天气泡 ───────────────────────────────────────────
function appendBubble(role, message) {
  const chatWindow = document.getElementById('chatWindow');
  const placeholder = document.getElementById('chatPlaceholder');
  if (placeholder) placeholder.remove();

  // 移除思考气泡
  document.getElementById('thinkingBubble')?.remove();

  const isXiaobao = role === 'xiaobao';
  const row = document.createElement('div');
  row.className = `bubble-row ${role}`;
  row.innerHTML = `
    <div class="bubble-avatar">${isXiaobao ? '🎭' : '👤'}</div>
    <div class="bubble-inner">
      <div class="bubble-name">${isXiaobao ? '小宝' : '你的分身'}</div>
      <div class="bubble-text">${escapeHtml(message)}</div>
    </div>
  `;
  chatWindow.appendChild(row);
  scrollToBottom(chatWindow);
}

function showThinkingBubble(who) {
  document.getElementById('thinkingBubble')?.remove();
  const chatWindow = document.getElementById('chatWindow');
  const div = document.createElement('div');
  div.id = 'thinkingBubble';
  div.className = `bubble-row ${who}`;
  div.innerHTML = `
    <div class="bubble-avatar">${who === 'xiaobao' ? '🎭' : '👤'}</div>
    <div class="bubble-inner">
      <div class="bubble-name" style="color:var(--text-3)">正在思考…</div>
      <div class="bubble-thinking">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>
  `;
  chatWindow.appendChild(div);
  scrollToBottom(chatWindow);
}

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── 终端日志 ────────────────────────────────────────────
function appendTermLine(type, text, round) {
  const terminal = document.getElementById('terminalWindow');
  document.getElementById('termWelcome')?.querySelector('.cursor')?.remove();

  if (type === 'round') {
    const sep = document.createElement('div');
    sep.className = 'term-line round';
    sep.textContent = `━━━ ROUND ${round} / 5 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    terminal.appendChild(sep);
    return;
  }

  const line = document.createElement('div');
  line.className = `term-line ${type}`;
  line.innerHTML = `<span style="opacity:.45">[${new Date().toLocaleTimeString('zh-CN')}]</span> ${escapeHtml(text)}`;
  terminal.appendChild(line);
  scrollToBottom(terminal);
}

// ─── 开始对打 ────────────────────────────────────────────
function startBattle() {
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.textContent = '⚡ 战局进行中…';

  const header = document.getElementById('battleHeader');
  header.classList.add('active');

  const statusEl = document.getElementById('battleStatus');
  statusEl.textContent = '对战中';
  statusEl.className = 'battle-status active';

  appendTermLine('system', '>>> 赛博靶场启动，连接 SecondMe A2A 引擎…');

  if (es) { es.close(); es = null; }

  es = new EventSource('/api/battle/start');

  es.addEventListener('init', e => {
    const { message } = JSON.parse(e.data);
    appendTermLine('system', `>>> ${message}`);
    showThinkingBubble('xiaobao');
  });

  es.addEventListener('monitor', e => {
    const data = JSON.parse(e.data);
    if (data.type === 'system') {
      if (data.text.includes('小宝正在计算')) {
        appendTermLine('round', '', data.round);
        showThinkingBubble('xiaobao');
      } else if (data.text.includes('用户分身正在思考')) {
        showThinkingBubble('victim');
      }
      appendTermLine('system', data.text, data.round);
    } else if (data.type === 'thought') {
      appendTermLine('thought', data.text, data.round);
    } else if (data.type === 'alert') {
      appendTermLine('alert', data.text, data.round);
    }
    if (data.round) {
      document.getElementById('roundNum').textContent = `${data.round} / 5`;
    }
  });

  es.addEventListener('chat', e => {
    const { role, message } = JSON.parse(e.data);
    appendBubble(role, message);
  });

  es.addEventListener('gameover', e => {
    const { report } = JSON.parse(e.data);
    es.close(); es = null;
    currentReport = report;

    document.getElementById('thinkingBubble')?.remove();
    document.getElementById('battleStatus').textContent = '已拦截';
    document.getElementById('battleStatus').className = 'battle-status';
    document.getElementById('battleHeader').classList.remove('active');

    appendTermLine('alert', '>>> ⚠️ 雷霆拦截！战局已冻结。刘看山复盘报告生成中…');

    // 触发爆红遮罩（短延迟营造冲击感）
    setTimeout(() => {
      document.getElementById('gameoverOverlay').classList.add('visible');
    }, 400);
  });

  es.addEventListener('done', e => {
    const { message } = JSON.parse(e.data);
    es.close(); es = null;
    document.getElementById('thinkingBubble')?.remove();

    document.getElementById('battleStatus').textContent = '平局通关';
    document.getElementById('battleStatus').className = 'battle-status done';
    document.getElementById('roundNum').textContent = '5 / 5';
    document.getElementById('battleHeader').classList.remove('active');

    appendTermLine('system', '>>> 战局结束：分身成功防御 5 轮！防骗体质 +1 🛡️');

    document.getElementById('winMessage').textContent = message;
    setTimeout(() => {
      document.getElementById('winOverlay').classList.add('visible');
    }, 600);
  });

  es.addEventListener('error', e => {
    try {
      const { message } = JSON.parse(e.data);
      appendTermLine('alert', '>>> ❌ 错误：' + message);
    } catch {
      appendTermLine('alert', '>>> ❌ 连接中断，请检查配置后重试');
    }
    if (es) { es.close(); es = null; }
    startBtn.disabled = false;
    startBtn.textContent = '⚡ 重新开始';
    document.getElementById('battleStatus').textContent = '已中断';
    document.getElementById('battleHeader').classList.remove('active');
  });
}

// ─── 弹窗控制 ────────────────────────────────────────────
function showReport() {
  document.getElementById('gameoverOverlay').classList.remove('visible');
  document.getElementById('reportBody').innerHTML = markdownToHtml(currentReport);
  document.getElementById('reportModal').classList.add('visible');
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('visible');
}

// ─── 再战一局 ────────────────────────────────────────────
function retryBattle() {
  document.getElementById('reportModal').classList.remove('visible');
  document.getElementById('gameoverOverlay').classList.remove('visible');
  document.getElementById('winOverlay').classList.remove('visible');

  document.getElementById('chatWindow').innerHTML = `
    <div class="chat-placeholder" id="chatPlaceholder">
      <div class="placeholder-icon">🔒</div>
      <p>点击下方按钮解锁战局</p>
    </div>`;

  document.getElementById('terminalWindow').innerHTML = `
    <div class="term-line system" id="termWelcome">
      &gt; 系统就绪。等待战局初始化…<span class="cursor">▋</span>
    </div>`;

  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = false;
  startBtn.textContent = '⚡ 开始赛博靶场';

  document.getElementById('battleStatus').textContent = '待命中';
  document.getElementById('battleStatus').className = 'battle-status';
  document.getElementById('battleHeader').classList.remove('active');
  document.getElementById('roundNum').textContent = '0 / 5';
  currentReport = '';
}
