// 搶答派對 — 共用程式
(function () {
  const SB_URL = 'https://nvbzibuwomwcixdybvfg.supabase.co';
  const SB_KEY = 'sb_publishable_MDvMASQ0HnTnoESe37CCMQ_c09Pt8oE';
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 20 } } });

  let clockOffset = 0;
  async function syncClock() {
    try {
      let best = null;
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const { data, error } = await sb.rpc('quiz_server_now');
        const t1 = Date.now();
        if (error || !data) continue;
        const rtt = t1 - t0;
        const off = new Date(data).getTime() - (t0 + rtt / 2);
        if (!best || rtt < best.rtt) best = { rtt, off };
      }
      if (best) clockOffset = best.off;
    } catch (e) { /* 校時失敗就用手機時間 */ }
  }
  const now = () => Date.now() + clockOffset;

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ERR = {
    no_game: '找不到這個 PIN 碼。請確認主持人給的 6 位數字，或這一場已經結束。',
    nick_taken: '這個暱稱已經有人用了，換一個吧。',
    bad_nick: '暱稱請輸入 1–12 個字。',
    full: '這一場人數已滿。',
    not_owner: '這份題庫不是你的，無法開場。',
    empty_set: '題庫裡還沒有題目，先新增題目再開場。',
    not_host: '只有開這一場的主持人能操作。',
    reveal_first: '請先公布這一題的答案，再出下一題。',
    pin_busy: '暫時產生不出 PIN 碼，請再試一次。',
    'Invalid login credentials': '帳號或密碼不正確。',
  };
  function errMsg(e) {
    const m = (e && (e.message || e.error_description || e)) + '';
    for (const k in ERR) if (m.includes(k)) return ERR[k];
    if (/fetch|network|Failed/i.test(m)) return '網路不穩，請確認連線後再試一次。';
    if (m.includes('quiz_sets_questions_valid')) return '題目格式有誤：每題需要題目、2–4 個選項、一個正確答案，秒數 5–120。';
    return '發生錯誤：' + m;
  }

  // 音效（第一次點擊後才能播放）
  let ac = null;
  function unlockAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} }
  function tone(freqs, dur = 0.12, type = 'triangle', vol = 0.18) {
    if (!ac) return;
    let t = ac.currentTime;
    freqs.forEach((f) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
      t += dur * 0.85;
    });
  }
  const sfx = {
    question: () => { tone([660, 880, 1100], 0.11); try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} },
    tick: () => tone([520], 0.05, 'square', 0.06),
    send: () => tone([780], 0.06),
    right: () => tone([660, 880, 1320], 0.12),
    wrong: () => tone([330, 247], 0.16, 'sawtooth', 0.1),
    fanfare: () => tone([523, 659, 784, 1047, 784, 1047], 0.14),
  };

  // 螢幕保持常亮（支援的瀏覽器）
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeLock) keepAwake(); });

  let toastTimer;
  function toast(text) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // 形狀用 SVG 畫，各手機顯示一致（不用文字符號）
  const svg = (inner) => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">${inner}</svg>`;
  const SHAPES = [
    svg('<circle cx="12" cy="12" r="8" fill="currentColor"/>'),
    svg('<path d="M12 4 21 20H3z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
    svg('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>'),
    svg('<path d="M12 2.5 21.5 12 12 21.5 2.5 12z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>'),
  ];
  const GIFT = svg('<path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3.5-5-1s3.5 1 5 1c1.5 0 5 1.5 5-1s-3.5-2-5 1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>');
  // 給螢幕報讀用：只在狀態改變時念一次（計時數字不念）
  function announce(text) {
    let el = document.getElementById('sr-live');
    if (!el) { el = document.createElement('div'); el.id = 'sr-live'; el.className = 'sr-only'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50);
  }
  const LETTERS = ['A', 'B', 'C', 'D'];

  function grillHTML() {
    return `<div class="grill-label"><span>烤肉計時</span><b data-left>--</b></div><div class="grill" data-grill><div class="meat" data-meat></div></div>`;
  }
  function updateGrill(root, startMs, endMs) {
    const total = Math.max(endMs - startMs, 1);
    const left = Math.max(endMs - now(), 0);
    const ratio = Math.min(left / total, 1);
    const meat = root.querySelector('[data-meat]'); const grill = root.querySelector('[data-grill]'); const lab = root.querySelector('[data-left]');
    if (!meat) return left;
    meat.style.width = (ratio * 100).toFixed(1) + '%';
    grill.classList.toggle('medium', ratio < 0.6 && ratio >= 0.25);
    grill.classList.toggle('done', ratio < 0.25);
    lab.textContent = Math.ceil(left / 1000) + ' 秒';
    return left;
  }

  function rankOf(players, id) {
    let rank = 0, prev = null;
    for (let i = 0; i < players.length; i++) {
      if (players[i].score !== prev) { rank = i + 1; prev = players[i].score; }
      if (players[i].id === id) return rank;
    }
    return null;
  }

  function podiumHTML(players, meId) {
    const p = players.slice(0, 3);
    const slot = (pl, cls, medal) => pl ? `<div class="p ${cls}"><div class="name ${pl.id === meId ? 'me' : ''}">${esc(pl.nickname)}</div><div class="score">${pl.score} 分</div><div class="block">${medal}</div></div>` : `<div class="p ${cls}"></div>`;
    return `<div class="podium">${slot(p[1], 'p2', '2')}${slot(p[0], 'p1', '1')}${slot(p[2], 'p3', '3')}</div>`;
  }

  function fastestHTML(list, meId) {
    if (!list || !list.length) return `<p class="muted">這題沒有人答對。</p>`;
    return `<ol class="fastest">${list.map((f, i) => `<li><span class="medal">${i + 1}</span><span class="${f.id === meId ? 'me' : ''}">${esc(f.nick)}</span><span class="sec">${Number(f.sec).toFixed(2)} 秒</span></li>`).join('')}</ol>`;
  }

  window.QP = { GIFT, announce, sb, syncClock, now, $, esc, errMsg, unlockAudio, sfx, keepAwake, toast, store, SHAPES, LETTERS, grillHTML, updateGrill, rankOf, podiumHTML, fastestHTML };
})();
