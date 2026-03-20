/* =====================================================
   battle.js v4 — Tailwind 视觉版 + 客户端无穷轮询架构 (Route A)
   ===================================================== */

let currentReport = '';
let victimNameGlobal = '你的分身';
let currentRound = 1;
const MAX_ROUND = 50; 
let xiaobaoHistory = [];
let victimHistory = [];
let battleRunning = false;

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

function updateTimeStr() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── 核心 UI 挂载 ───────────────────────────────────────
async function initProfile() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) { window.location.href = '/'; return; }
    const { profile } = await res.json();
    victimNameGlobal = escapeHtml(profile.name) + '的分身';
    document.getElementById('userName').textContent = escapeHtml(profile.name);
    startBattle();
  } catch (e) {
    console.error('initProfile error', e);
  }
}

// ─── DOM 生成器：聊天气泡 ────────────────────────────────
function appendBubble(role, message) {
  const chatWindow = document.getElementById('chatWindow');
  document.getElementById('thinkingBubble')?.remove();

  const isXiaobao = role === 'xiaobao';
  const row = document.createElement('div');
  
  if (isXiaobao) {
    row.className = "flex flex-col items-start max-w-[85%]";
    row.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <div class="w-8 h-8 rounded bg-error-container/30 border border-error/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-error text-sm">person_alert</span>
        </div>
        <span class="text-[10px] font-mono font-bold text-error tracking-tighter uppercase">Subject: 小宝 (Threat)</span>
      </div>
      <div class="relative group">
        <div class="p-4 rounded-xl rounded-tl-none bg-surface-container-highest border border-error/20 text-on-surface text-sm leading-relaxed glow-error">
            ${escapeHtml(message)}
        </div>
      </div>
    `;
  } else {
    row.className = "flex flex-col items-end ml-auto max-w-[85%]";
    row.innerHTML = `
      <div class="flex items-center gap-2 mb-2 flex-row-reverse">
        <div class="w-8 h-8 rounded bg-primary-container/20 border border-primary-container/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-primary-container text-sm">face</span>
        </div>
        <span class="text-[10px] font-mono font-bold text-primary-container tracking-tighter uppercase">Persona: ${victimNameGlobal} (Secure)</span>
      </div>
      <div class="p-4 rounded-xl rounded-tr-none bg-primary-container/10 border border-primary-container/20 text-on-surface text-sm leading-relaxed glow-primary shadow-lg shadow-primary-container/5">
          ${escapeHtml(message)}
      </div>
    `;
  }
  
  chatWindow.appendChild(row);
  scrollToBottom(chatWindow);
}

function showThinkingBubble(who) {
  document.getElementById('thinkingBubble')?.remove();
  const chatWindow = document.getElementById('chatWindow');
  const div = document.createElement('div');
  div.id = 'thinkingBubble';
  div.className = "flex items-center gap-2 opacity-60 mt-2 mb-2 " + (who === 'victim' ? "ml-auto flex-row-reverse" : "");
  const colorClass = who === 'victim' ? 'primary-container' : 'error';
  
  div.innerHTML = `
    <div class="w-6 h-6 rounded bg-${colorClass}/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-${colorClass} text-[10px]">psychology</span>
    </div>
    <div class="flex gap-1">
        <div class="w-1.5 h-1.5 rounded-full bg-${colorClass} animate-blink"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-${colorClass} animate-blink" style="animation-delay: 0.2s"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-${colorClass} animate-blink" style="animation-delay: 0.4s"></div>
    </div>
  `;
  chatWindow.appendChild(div);
  scrollToBottom(chatWindow);
}

// ─── DOM 生成器：监控面板 & 日志 ──────────────────────────
function appendTermLine(type, text, round) {
  const terminalWindow = document.getElementById('terminalWindow');
  const thoughtWindow = document.getElementById('thoughtWindow');
  const now = updateTimeStr();
  
  const line = document.createElement('div');

  if (type === 'round') {
     line.className = "pt-2 mt-2 border-t border-white/5";
     line.innerHTML = `
       <div class="text-[10px] uppercase text-primary-container mb-2">ROUND ${round} SYNCHRONIZED</div>
       <div class="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
         <div class="h-full bg-primary-container w-[100%]"></div>
       </div>
     `;
     terminalWindow.appendChild(line);
     scrollToBottom(terminalWindow);
     return;
  }

  if (type === 'thought') {
    line.className = "text-error mb-4 border-l-2 border-error/50 pl-2 leading-relaxed opacity-90";
    line.innerHTML = `&gt; ${escapeHtml(text)}`;
    thoughtWindow.appendChild(line);
    scrollToBottom(thoughtWindow);
    return;
  }

  if (type === 'alert') {
    line.className = "flex gap-4 mb-1";
    line.innerHTML = `<span class="text-error/50">[${now}]</span><span class="text-error font-bold">[ATTACK]</span><span class="text-error/90 font-bold">${escapeHtml(text)}</span>`;
    terminalWindow.appendChild(line);
  } else {
    // System
    line.className = "flex gap-4 mb-1";
    line.innerHTML = `<span class="text-slate-600">[${now}]</span><span class="text-primary-container">[SYS]</span><span class="text-on-surface-variant">${escapeHtml(text)}</span>`;
    terminalWindow.appendChild(line);
  }
  
  scrollToBottom(terminalWindow);
}

// ─── 核心引擎对接流 (客户端长轮询 架构 A) ────────────────────
async function startBattle() {
  document.getElementById('chatWindow').innerHTML = '';
  document.getElementById('terminalWindow').innerHTML = '';
  document.getElementById('thoughtWindow').innerHTML = '';
  document.getElementById('roundNum').textContent = `01 / ${MAX_ROUND}`;
  
  document.getElementById('battleStatusText').textContent = "Neural Link Active: IN COMBAT";
  document.getElementById('battleStatusText').classList.add("text-error");
  document.getElementById('battleStatusDot').className = "w-2 h-2 rounded-full bg-error animate-pulse";
  
  appendTermLine('system', 'Initializing tactical connection with SecondMe A2A Core...');

  currentRound = 1;
  xiaobaoHistory = [];
  victimHistory = [];
  battleRunning = true;

  playNextTurn();
}

async function playNextTurn() {
  if (!battleRunning) return;

  try {
    const response = await fetch('/api/battle/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        round: currentRound, 
        maxRound: MAX_ROUND, 
        xiaobaoHistory, 
        victimHistory 
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let eventType = "message";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      let lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一行不完整的 chunk

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.substring(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.substring(6).trim();
          if (!dataStr) continue;
          const data = JSON.parse(dataStr);
          await handleStreamEvent(eventType, data);
        }
      }
    }
  } catch (err) {
    appendTermLine('alert', '❌ 网络抛锚或超时: ' + err.message);
    battleRunning = false;
  }
}

async function handleStreamEvent(eventType, data) {
  if (eventType === 'monitor') {
    if (data.type === 'system') {
      if (data.text.includes('小宝正在计算')) {
        appendTermLine('round', '', data.round);
        appendTermLine('thought', '[SYSTEM] Preparing next injection attack...');
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
    document.getElementById('roundNum').textContent = `${String(data.round).padStart(2, '0')} / ${MAX_ROUND}`;
  } 
  else if (eventType === 'chat') {
    const { role, message } = data;
    appendBubble(role, message);
  }
  else if (eventType === 'turn_end') {
    // 成功顶住了一回合！保存上下文，进入下一回合
    xiaobaoHistory = data.xiaobaoHistory;
    victimHistory = data.victimHistory;
    currentRound++;
    
    // 给用户 2 秒时间留白看下这回合的内容，然后自动发起下一回合！
    setTimeout(playNextTurn, 2000); 
  }
  else if (eventType === 'gameover') {
    battleRunning = false;
    document.getElementById('thinkingBubble')?.remove();
    
    document.getElementById('battleStatusText').textContent = "SYSTEM COMPROMISED - LINK FROZEN";
    document.getElementById('battleStatusText').className = "text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest";
    document.getElementById('battleStatusDot').className = "w-2 h-2 rounded-full bg-slate-500";
    
    appendTermLine('alert', '⚠️ 雷霆拦截！战局已冻结。准备渲染刘看山复盘报告…');
    setTimeout(() => {
      document.getElementById('reportBody').innerHTML = markdownToHtml(data.report);
      document.getElementById('reportTitle').textContent = "战术冻结：安全漏洞解析";
      document.getElementById('reportModal').classList.remove('hidden');
      document.getElementById('reportModal').classList.add('flex');
    }, 1000);
  }
  else if (eventType === 'done') {
    battleRunning = false;
    document.getElementById('thinkingBubble')?.remove();

    document.getElementById('battleStatusText').textContent = "THREAT NEUTRALIZED - BATTLE WON";
    document.getElementById('battleStatusText').className = "text-[10px] font-mono font-bold text-primary-container uppercase tracking-widest";
    document.getElementById('battleStatusDot').className = "w-2 h-2 rounded-full bg-primary-container";
    document.getElementById('roundNum').textContent = `${MAX_ROUND} / ${MAX_ROUND}`;

    appendTermLine('system', data.message);

    setTimeout(() => {
      document.getElementById('reportBody').innerHTML = `<div class="p-6 bg-primary-container/10 border border-primary-container rounded-xl text-primary-container font-mono">${escapeHtml(data.message)}</div>`;
      document.getElementById('reportTitle').textContent = "演练胜利：干得漂亮！";
      document.getElementById('reportModal').classList.remove('hidden');
      document.getElementById('reportModal').classList.add('flex');
    }, 1000);
  }
  else if (eventType === 'error') {
    battleRunning = false;
    document.getElementById('thinkingBubble')?.remove();
    appendTermLine('alert', '❌ PING DROP: ' + data.message);
  }
}

// ─── INIT ─────────────────────────────────────────────
document.getElementById('retryBtn').addEventListener('click', startBattle);
initProfile();
