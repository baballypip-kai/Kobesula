/* 成語小達人 — 主程式
 * 成語資料在 data/idioms.json，新增成語不需要改這個檔案。
 */
(() => {
  'use strict';

  const $app = document.getElementById('app');
  const $title = document.getElementById('title');
  const $stars = document.getElementById('starCount');
  const LS_PROGRESS = 'chengyu.progress.v1';
  const LS_LOCAL = 'chengyu.local.v1';
  const ROUND = 6;

  const S = { z: null, idioms: [], progress: {} };

  // ---------- 小工具 ----------
  const esc = Zhuyin.esc;
  const strip = Zhuyin.stripOverrides;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.random() * a.length | 0];
  const zy = text => `<span class="zytext">${Zhuyin.toHTML(S.z.annotate(text))}</span>`;
  const tokens = text => S.z.annotate(text);

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 無痕模式等 */ }
  }

  // 成語本身的注音（可用 zhuyin 欄位指定）
  function idiomTokens(it) {
    if (it.zhuyin) {
      const syl = it.zhuyin.trim().split(/\s+/);
      return [...it.word].map((ch, i) => ({ ch, zy: syl[i] || '' }));
    }
    return tokens(it.idiom);
  }
  const idiomHTML = it => Zhuyin.toHTML(idiomTokens(it));
  const charHTML = t => Zhuyin.toHTML([t]);

  // ---------- 聲音 ----------
  let actx;
  function beep(ok) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = ok ? [660, 880, 1100] : [300, 220];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = ok ? 'triangle' : 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(.12, actx.currentTime + i * .09);
        g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + i * .09 + .18);
        o.connect(g); g.connect(actx.destination);
        o.start(actx.currentTime + i * .09); o.stop(actx.currentTime + i * .09 + .2);
      });
    } catch (e) { /* 沒聲音也沒關係 */ }
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(strip(text));
    u.lang = 'zh-TW';
    u.rate = .85;
    const v = speechSynthesis.getVoices().find(v => /zh[-_]TW/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  const speakBtn = text => `<button class="speak" data-say="${esc(strip(text))}" aria-label="唸給我聽">🔊</button>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) speak(b.dataset.say);
  });

  // ---------- 學習紀錄 ----------
  function rec(word) { return S.progress.items[word] || (S.progress.items[word] = { r: 0, w: 0 }); }
  function record(word, ok) {
    const p = rec(word);
    ok ? p.r++ : p.w++;
    p.t = Date.now();
    saveJSON(LS_PROGRESS, S.progress);
  }
  function addStars(n) {
    S.progress.stars = (S.progress.stars || 0) + n;
    saveJSON(LS_PROGRESS, S.progress);
    updateStars();
  }
  function updateStars() { $stars.textContent = `⭐ ${S.progress.stars || 0}`; }

  // 錯越多、越新的成語越常出現
  function weightOf(it, idx) {
    const p = S.progress.items[it.word] || { r: 0, w: 0 };
    let w = 1 + p.w * 1.5 - Math.min(p.r, 6) * .12;
    if (idx >= S.idioms.length - 3) w += 1.5;
    if (!p.r && !p.w) w += 1;
    return Math.max(w, .3);
  }
  function weightedPick(list, n, filter = () => true) {
    const pool = S.idioms.map((it, i) => ({ it, w: weightOf(it, i) })).filter(x => list.includes(x.it) && filter(x.it));
    const out = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * total, k = 0;
      while (k < pool.length - 1 && (r -= pool[k].w) > 0) k++;
      out.push(pool.splice(k, 1)[0].it);
    }
    return out;
  }
  function distractors(answer, n, filter = () => true) {
    const rel = new Set([answer.word, ...(answer.related || [])]);
    return shuffle(S.idioms.filter(it => !rel.has(it.word) && filter(it))).slice(0, n);
  }

  // ---------- 載入資料 ----------
  function normalize(it, local) {
    const word = strip(it.idiom).trim();
    return {
      ...it,
      word,
      examples: (it.examples || []).filter(e => strip(e).includes(word)),
      related: (it.related || []).map(strip),
      local: !!local,
    };
  }

  async function init() {
    S.progress = loadJSON(LS_PROGRESS, { items: {}, stars: 0 });
    S.progress.items = S.progress.items || {};
    updateStars();
    try {
      const [dict, data] = await Promise.all([
        fetch('data/zhuyin.json').then(r => r.json()),
        fetch('data/idioms.json', { cache: 'no-cache' }).then(r => r.json()),
      ]);
      S.z = Zhuyin.create(dict);
      const seen = new Set();
      const all = [...(data.idioms || []).map(it => normalize(it)),
                   ...loadJSON(LS_LOCAL, []).map(it => normalize(it, true))];
      S.idioms = all.filter(it => it.word && !seen.has(it.word) && seen.add(it.word));
    } catch (e) {
      $app.innerHTML = `<div class="card">資料載入失敗，請檢查網路後重新整理。<br><small>${esc(String(e))}</small></div>`;
      return;
    }
    window.addEventListener('hashchange', route);
    route();
  }

  // ---------- 路由 ----------
  function route() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    window.scrollTo(0, 0);
    const pages = { learn: pageLearn, list: pageList, match: pageMatch, parent: pageParent };
    if (pages[name]) return pages[name](arg);
    if (QUIZ[name]) return startQuiz(name);
    pageHome();
  }
  function setTitle(t) { $title.textContent = t; document.title = t === '成語小達人' ? t : `${t}｜成語小達人`; }

  // ---------- 首頁 ----------
  function pageHome() {
    setTitle('成語小達人');
    const today = S.idioms[S.idioms.length - 1];
    $app.innerHTML = `
      <a class="today" href="#learn/${S.idioms.length - 1}" style="display:block;text-decoration:none;color:inherit">
        <div class="label">${zy('今日成語')}</div>
        <div class="emoji">${today.emoji || '📖'}</div>
        <div class="word">${idiomHTML(today)}</div>
        <div class="short">${zy(today.short || '')}</div>
      </a>
      <div class="grid">
        <a class="tile c1" href="#list"><span class="ico">📚</span>${zy('學習卡')}<span class="sub">${zy(S.idioms.length + ' 個成語')}</span></a>
        <a class="tile c2" href="#match"><span class="ico">🔗</span>${zy('連連看')}<span class="sub">${zy('成語配意思')}</span></a>
        <a class="tile c3" href="#fill"><span class="ico">✏️</span>${zy('例句填空')}<span class="sub">${zy('學會怎麼用')}</span></a>
        <a class="tile c4" href="#missing"><span class="ico">🧩</span>${zy('缺字補補')}<span class="sub">${zy('少了哪個字')}</span></a>
        <a class="tile c5" href="#order"><span class="ico">🔀</span>${zy('排排看')}<span class="sub">${zy('把字排好')}</span></a>
        <a class="tile c6" href="#meaning"><span class="ico">💡</span>${zy('猜成語')}<span class="sub">${zy('看意思猜')}</span></a>
        <a class="tile c5 wide" href="#mix" style="background:linear-gradient(135deg,#ff6b9a,#ff9f43)"><span class="ico">🏆</span><span>${zy('今日挑戰')}<span class="sub" style="display:block">${zy('各種題目混在一起')}</span></span></a>
      </div>
      <div class="footer-links"><a href="#parent">👨‍👩‍👧 ${zy('家長區')}</a></div>`;
  }

  // ---------- 學習卡 ----------
  function pageList() {
    setTitle('學習卡');
    const n = S.idioms.length;
    $app.innerHTML = `<p class="hint">${zy('點一個成語來學習')}</p><div class="list">` +
      S.idioms.map((it, i) => `<a href="#learn/${i}">
        <span class="em">${it.emoji || '📖'}</span>${idiomHTML(it)}
        ${i === n - 1 ? `<div><span class="new">${zy('今日')}</span></div>` : ''}</a>`).reverse().join('') +
      '</div>';
  }

  function highlight(sentence, word) {
    const toks = tokens(sentence);
    const plain = toks.map(t => t.ch).join('');
    const at = plain.indexOf(word);
    if (at < 0) return zy(sentence);
    const html = (a, b) => Zhuyin.toHTML(toks.slice(a, b));
    return `<span class="zytext">${html(0, at)}<span class="hl">${html(at, at + word.length)}</span>${html(at + word.length)}</span>`;
  }

  function pageLearn(arg) {
    const n = S.idioms.length;
    const i = Math.min(Math.max(parseInt(arg, 10) || 0, 0), n - 1);
    const it = S.idioms[i];
    setTitle('學習卡');
    rec(it.word).seen = true; saveJSON(LS_PROGRESS, S.progress);
    $app.innerHTML = `
      <div class="learn-nav">
        <a class="btn small ghost" href="#learn/${(i - 1 + n) % n}">◀ ${zy('上一個')}</a>
        <span class="pos">${i + 1} / ${n}</span>
        <a class="btn small ghost" href="#learn/${(i + 1) % n}">${zy('下一個')} ▶</a>
      </div>
      <div class="card learn-head pop">
        <div class="emoji">${it.emoji || '📖'}</div>
        <div class="word">${idiomHTML(it)}</div>
        ${speakBtn(it.word)}
      </div>
      <div class="card"><h3>💡 ${zy('意思')} ${speakBtn(it.meaning)}</h3><div>${zy(it.meaning)}</div></div>
      ${it.story ? `<div class="card"><h3>📜 ${zy('故事')} ${speakBtn(it.story)}</h3><div>${zy(it.story)}</div>
        ${it.source ? `<div class="source">— ${zy('出自' + it.source)}</div>` : ''}</div>` : ''}
      ${it.examples.length ? `<div class="card"><h3>✏️ ${zy('例句')}</h3>${it.examples.map(e =>
        `<div class="example">${highlight(e, it.word)} ${speakBtn(e)}</div>`).join('')}</div>` : ''}
      <div class="row" style="margin:18px 0">
        <a class="btn" href="#mix">🏆 ${zy('去挑戰')}</a>
        <a class="btn ghost" href="#list">📚 ${zy('全部成語')}</a>
      </div>`;
  }

  // ---------- 測驗（填空、缺字、排排看、猜成語、綜合） ----------
  // 每一種題型：make(it) 回傳題目，render(q, done) 畫出題目並在作答後呼叫 done(ok)
  const QUIZ = {
    fill: { title: '例句填空', types: ['fill'] },
    missing: { title: '缺字補補', types: ['missing'] },
    order: { title: '排排看', types: ['order'] },
    meaning: { title: '猜成語', types: ['meaning'] },
    mix: { title: '今日挑戰', types: ['fill', 'missing', 'order', 'meaning'] },
  };

  const TYPES = {
    fill: {
      ok: it => it.examples.length > 0,
      render(it, host, done) {
        const sentence = pick(it.examples);
        const toks = tokens(sentence);
        const plain = toks.map(t => t.ch).join('');
        const at = plain.indexOf(it.word);
        const before = Zhuyin.toHTML(toks.slice(0, at)), after = Zhuyin.toHTML(toks.slice(at + it.word.length));
        const opts = shuffle([it, ...distractors(it, 3)]);
        host.innerHTML = `
          <div class="q-title">${zy('選出最適合的成語，填進句子裡')}</div>
          <div class="card question"><span class="zytext">${before}<span class="blank" id="blank">？</span>${after}</span></div>
          <div class="options">${opts.map((o, k) => `<button class="opt" data-k="${k}">${idiomHTML(o)}</button>`).join('')}</div>
          <div class="feedback" id="fb"></div>`;
        bindOptions(host, opts, it, ok => {
          const b = host.querySelector('#blank');
          b.className = 'blank filled pop';
          b.innerHTML = idiomHTML(it);
          done(ok, sentence);
        });
      },
    },
    missing: {
      ok: () => true,
      render(it, host, done) {
        const toks = idiomTokens(it);
        const pos = Math.random() * toks.length | 0;
        const ans = toks[pos];
        // 干擾選項：其他成語裡的字
        const pool = [];
        for (const o of shuffle(S.idioms)) {
          if (o === it) continue;
          for (const t of idiomTokens(o)) if (t.ch !== ans.ch && !pool.some(p => p.ch === t.ch)) pool.push(t);
        }
        const opts = shuffle([ans, ...shuffle(pool).slice(0, 3)]);
        const html = toks.map((t, k) => k === pos ? '<span class="blank one" id="blank">？</span>' : charHTML(t)).join('');
        host.innerHTML = `
          <div class="q-title">${zy('少了哪一個字？')}</div>
          <div class="card"><div class="big-word">${it.emoji || ''}</div>
            <div class="big-word">${html}</div>
            <div class="hint">${zy('提示：' + (it.short || it.meaning))}</div></div>
          <div class="options">${opts.map((o, k) => `<button class="opt big" data-k="${k}">${charHTML(o)}</button>`).join('')}</div>
          <div class="feedback" id="fb"></div>`;
        bindOptions(host, opts, ans, ok => {
          const b = host.querySelector('#blank');
          b.outerHTML = `<span class="hl pop">${charHTML(ans)}</span>`;
          done(ok);
        }, (a, b) => a.ch === b.ch);
      },
    },
    meaning: {
      ok: () => true,
      render(it, host, done) {
        const opts = shuffle([it, ...distractors(it, 3)]);
        host.innerHTML = `
          <div class="q-title">${zy('哪一個成語是這個意思？')}</div>
          <div class="card question">${zy(it.meaning)}</div>
          <div class="options">${opts.map((o, k) => `<button class="opt" data-k="${k}">${idiomHTML(o)}</button>`).join('')}</div>
          <div class="feedback" id="fb"></div>`;
        bindOptions(host, opts, it, ok => done(ok));
      },
    },
    order: {
      ok: () => true,
      render(it, host, done) {
        const toks = idiomTokens(it);
        let order;
        do { order = shuffle(toks.map((_, k) => k)); } while (toks.length > 1 && order.every((v, k) => v === k));
        const placed = [];
        let tries = 0;
        host.innerHTML = `
          <div class="q-title">${zy('照順序點字，排出正確的成語')}</div>
          <div class="card center"><div class="big-word">${it.emoji || ''}</div>
            <div>${zy(it.short || it.meaning)}</div>
            <div class="slots">${toks.map((_, k) => `<div class="slot" data-s="${k}"></div>`).join('')}</div>
            <div class="pool">${order.map(k => `<button class="piece" data-p="${k}">${charHTML(toks[k])}</button>`).join('')}</div>
          </div>
          <div class="feedback" id="fb"></div>`;
        const slots = [...host.querySelectorAll('.slot')];
        const draw = () => slots.forEach((s, k) => {
          s.className = 'slot' + (placed[k] !== undefined ? ' filled' : '');
          s.innerHTML = placed[k] !== undefined ? charHTML(toks[placed[k]]) : '';
        });
        host.querySelectorAll('.piece').forEach(b => b.onclick = () => {
          if (b.classList.contains('used') || placed.length >= toks.length) return;
          placed.push(+b.dataset.p);
          b.classList.add('used');
          draw();
          if (placed.length === toks.length) {
            // 同一個字出現兩次時，比對字而不是位置
            const ok = placed.every((p, k) => toks[p].ch === toks[k].ch);
            if (ok) {
              slots.forEach(s => s.classList.add('ok'));
              beep(true);
              host.querySelectorAll('.piece').forEach(p => p.disabled = true);
              done(tries === 0);
            } else {
              tries++;
              beep(false);
              slots.forEach(s => s.classList.add('bad'));
              host.querySelector('#fb').innerHTML = zy('不對喔，再試一次！');
              setTimeout(() => {
                placed.length = 0; draw();
                host.querySelectorAll('.piece').forEach(p => p.classList.remove('used'));
              }, 700);
            }
          }
        });
        slots.forEach((s, k) => s.onclick = () => {   // 點已放好的格子可以退回
          if (placed.length !== k + 1 || placed.length === toks.length) return;
          const p = placed.pop();
          host.querySelector(`.piece[data-p="${p}"]`).classList.remove('used');
          draw();
        });
      },
    },
  };

  // 選擇題共用：答錯顯示正確答案
  function bindOptions(host, opts, answer, after, same = (a, b) => a === b) {
    const btns = [...host.querySelectorAll('.opt')];
    btns.forEach(b => b.onclick = () => {
      const chosen = opts[+b.dataset.k];
      const ok = same(chosen, answer);
      btns.forEach(x => x.disabled = true);
      b.classList.add(ok ? 'ok' : 'bad');
      if (!ok) btns.find(x => same(opts[+x.dataset.k], answer)).classList.add('ok');
      beep(ok);
      after(ok);
    });
  }

  function startQuiz(mode) {
    const cfg = QUIZ[mode];
    setTitle(cfg.title);
    const items = weightedPick(S.idioms, Math.min(ROUND, S.idioms.length));
    // 題目不夠 6 題時重複出現
    while (items.length < ROUND) items.push(pick(S.idioms));
    const results = [];
    let i = 0;

    const next = () => {
      if (i >= items.length) return finish(cfg, mode, results);
      const it = items[i];
      const types = cfg.types.filter(t => TYPES[t].ok(it));
      const type = pick(types.length ? types : ['meaning']);
      $app.innerHTML = `<div class="progress">${items.map((_, k) =>
        `<span class="${k < i ? (results[k].ok ? 'ok' : 'bad') : k === i ? 'cur' : ''}"></span>`).join('')}</div>
        <div id="q"></div>`;
      const host = document.getElementById('q');
      TYPES[type].render(it, host, (ok, sentence) => {
        results.push({ it, ok });
        record(it.word, ok);
        const fb = host.querySelector('#fb');
        fb.innerHTML = `<div class="pop">${ok ? '🎉 ' + zy('答對了！') : '💪 ' + zy('沒關係，記起來！')}</div>
          <div class="meaning">${idiomHTML(it)}：${zy(it.short || '')}</div>
          <div class="row" style="margin-top:12px">
            ${sentence ? speakBtn(sentence) : speakBtn(it.word)}
            <button class="btn" id="nextBtn">${i + 1 < items.length ? zy('下一題') + ' ➜' : zy('看成績') + ' 🏁'}</button></div>`;
        host.querySelector('#nextBtn').onclick = () => { i++; next(); };
      });
    };
    next();
  }

  function finish(cfg, mode, results) {
    const right = results.filter(r => r.ok).length;
    const rate = right / results.length;
    const stars = rate >= .9 ? 3 : rate >= .6 ? 2 : 1;
    addStars(stars);
    const wrong = [...new Set(results.filter(r => !r.ok).map(r => r.it))];
    $app.innerHTML = `
      <div class="card result pop">
        <div class="big">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="score">${zy(`答對 ${right} 題，共 ${results.length} 題`)}</div>
        <p>${zy(rate === 1 ? '全部答對，太厲害了！' : rate >= .6 ? '很棒喔，繼續加油！' : '多練習幾次就會記住了！')}</p>
      </div>
      ${wrong.length ? `<div class="card review"><h3>📝 ${zy('再複習一下')}</h3>${wrong.map(it =>
        `<div class="item"><a href="#learn/${S.idioms.indexOf(it)}" style="text-decoration:none">
          <b>${idiomHTML(it)}</b></a><div>${zy(it.meaning)}</div></div>`).join('')}</div>` : ''}
      <div class="row"><button class="btn" id="again">🔁 ${zy('再玩一次')}</button><a class="btn ghost" href="#">🏠 ${zy('回首頁')}</a></div>`;
    document.getElementById('again').onclick = () => (mode === 'match' ? pageMatch() : startQuiz(mode));
  }

  // ---------- 連連看 ----------
  function pageMatch() {
    setTitle('連連看');
    const n = Math.min(4, S.idioms.length);
    // 避免意思很像的成語同時出現
    const chosen = [];
    for (const it of weightedPick(S.idioms, S.idioms.length)) {
      if (chosen.length >= n) break;
      if (!chosen.some(c => c.related.includes(it.word))) chosen.push(it);
    }
    const left = shuffle(chosen), right = shuffle(chosen);
    let sel = null, mistakes = 0, done = 0;
    const wrongSet = new Set();
    $app.innerHTML = `
      <div class="q-title">${zy('先點成語，再點它的意思')}</div>
      <div class="match">
        <div class="col">${left.map(it => `<button class="mitem" data-w="${esc(it.word)}">${idiomHTML(it)}</button>`).join('')}</div>
        <div class="col">${right.map(it => `<button class="mitem meaning" data-m="${esc(it.word)}">${zy(it.short || it.meaning)}</button>`).join('')}</div>
      </div>
      <div class="feedback" id="fb"></div>`;
    const L = [...$app.querySelectorAll('[data-w]')], R = [...$app.querySelectorAll('[data-m]')];
    L.forEach(b => b.onclick = () => {
      if (b.classList.contains('ok')) return;
      L.forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      sel = b;
    });
    R.forEach(b => b.onclick = () => {
      if (b.classList.contains('ok')) return;
      if (!sel) { $app.querySelector('#fb').innerHTML = zy('先點左邊的成語喔'); return; }
      const w = sel.dataset.w;
      if (b.dataset.m === w) {
        beep(true);
        sel.classList.remove('sel'); sel.classList.add('ok'); b.classList.add('ok');
        sel.disabled = b.disabled = true;
        record(w, !wrongSet.has(w));
        sel = null; done++;
        $app.querySelector('#fb').innerHTML = '';
        if (done === chosen.length) {
          const results = chosen.map(it => ({ it, ok: !wrongSet.has(it.word) }));
          setTimeout(() => finish({ title: '連連看' }, 'match', results), 600);
        }
      } else {
        beep(false); mistakes++;
        wrongSet.add(w);
        b.classList.add('bad'); sel.classList.add('bad');
        const s = sel;
        setTimeout(() => { b.classList.remove('bad'); s.classList.remove('bad'); }, 450);
      }
    });
  }

  // ---------- 家長區 ----------
  function pageParent() {
    setTitle('家長區');
    const local = loadJSON(LS_LOCAL, []);
    const rows = S.idioms.map(it => {
      const p = S.progress.items[it.word] || { r: 0, w: 0 };
      return `<tr><td style="text-align:left">${esc(it.word)}${it.local ? ' 📱' : ''}</td><td>${p.r}</td><td>${p.w}</td></tr>`;
    }).join('');
    $app.innerHTML = `<div class="parent">
      <div class="card">
        <h3>➕ 怎麼新增成語？</h3>
        <p style="font-size:15px;line-height:1.7">
        <b>方法一（推薦，所有裝置都會更新）</b>：到 GitHub 編輯 <code>data/idioms.json</code>，
        在最後面加一筆，存檔後約一分鐘網站就會更新，不用改程式。最後一筆會變成「今日成語」。<br>
        <b>方法二（只存在這支手機）</b>：用下面的表單新增，馬上就能玩。之後可以按「複製 JSON」貼到 idioms.json 永久保存。</p>
        <p style="font-size:15px">注音會自動產生。如果破音字唸錯，在那個字後面加上 <code>[注音]</code>，例如 <code>塞[ㄙㄞˋ]翁失馬</code>。</p>
      </div>

      <div class="card">
        <h3>🔍 注音檢查</h3>
        <textarea id="zyIn" rows="2" placeholder="輸入文字看看注音對不對">他的田卻長[ㄓㄤˇ]滿了野草。</textarea>
        <div class="preview" id="zyOut"></div>
        <div class="poly" id="zyPoly"></div>
      </div>

      <div class="card">
        <h3>📱 在這支手機新增成語</h3>
        <label>成語（必填）</label><input id="fIdiom" placeholder="例如：對牛彈琴">
        <label>表情符號（可不填）</label><input id="fEmoji" placeholder="例如：🐮🎵">
        <label>簡短意思（連連看用，10 個字左右）</label><input id="fShort" placeholder="例如：說話不看對象">
        <label>意思（必填）</label><textarea id="fMeaning" rows="2"></textarea>
        <label>故事（可不填）</label><textarea id="fStory" rows="3"></textarea>
        <label>例句（一行一句，句子裡要有這個成語）</label><textarea id="fEx" rows="3"></textarea>
        <label>意思很像的成語（用逗號分開，出題時不會一起當選項）</label><input id="fRel" placeholder="例如：畫蛇添足">
        <div class="row" style="margin-top:12px"><button class="btn" id="fSave">儲存</button></div>
        <div class="msg" id="fMsg"></div>
        ${local.length ? `<h3 style="margin-top:16px">這支手機新增的成語</h3>
          ${local.map((it, k) => `<div class="row" style="justify-content:space-between;align-items:center;margin:6px 0">
            <span>${esc(it.idiom)}</span><button class="btn small ghost" data-del="${k}">刪除</button></div>`).join('')}
          <div class="row" style="margin-top:10px"><button class="btn small" id="fCopy">📋 複製 JSON</button></div>` : ''}
      </div>

      <div class="card">
        <h3>📊 學習紀錄（⭐ ${S.progress.stars || 0}）</h3>
        <table><tr><th style="text-align:left">成語</th><th>答對</th><th>答錯</th></tr>${rows}</table>
        <div class="row" style="margin-top:12px"><button class="btn small ghost" id="reset">清除紀錄</button></div>
      </div>
    </div>`;

    const zin = document.getElementById('zyIn');
    const renderZy = () => {
      const toks = S.z.annotate(zin.value);
      document.getElementById('zyOut').innerHTML = Zhuyin.toHTML(toks);
      const polys = [...new Set(toks.filter(t => S.z.readings(t.ch).length > 1).map(t => t.ch))];
      document.getElementById('zyPoly').innerHTML = polys.length
        ? '破音字：' + polys.map(c => `<b>${esc(c)}</b>（${S.z.readings(c).join('、')}）`).join('　') : '';
    };
    zin.oninput = renderZy; renderZy();

    const val = id => document.getElementById(id).value.trim();
    document.getElementById('fSave').onclick = () => {
      const idiom = val('fIdiom'), meaning = val('fMeaning');
      const msg = document.getElementById('fMsg');
      if (!idiom || !meaning) { msg.style.color = 'var(--bad)'; msg.textContent = '請填寫成語和意思'; return; }
      const word = strip(idiom);
      const ex = val('fEx').split('\n').map(s => s.trim()).filter(Boolean);
      const badEx = ex.filter(e => !strip(e).includes(word));
      const entry = { idiom, emoji: val('fEmoji') || undefined, short: val('fShort') || undefined, meaning,
        story: val('fStory') || undefined, examples: ex,
        related: val('fRel') ? val('fRel').split(/[,，、\s]+/).filter(Boolean) : undefined };
      const list = loadJSON(LS_LOCAL, []).filter(it => strip(it.idiom) !== word);
      list.push(JSON.parse(JSON.stringify(entry)));
      saveJSON(LS_LOCAL, list);
      S.idioms = S.idioms.filter(it => it.word !== word);
      S.idioms.push(normalize(entry, true));
      pageParent();
      const m = document.getElementById('fMsg');
      m.textContent = `已新增「${word}」！` + (badEx.length ? `（有 ${badEx.length} 句例句沒有包含這個成語，不會出題）` : '');
    };
    $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const list = loadJSON(LS_LOCAL, []);
      const [gone] = list.splice(+b.dataset.del, 1);
      saveJSON(LS_LOCAL, list);
      S.idioms = S.idioms.filter(it => !(it.local && it.word === strip(gone.idiom)));
      pageParent();
    });
    const copy = document.getElementById('fCopy');
    if (copy) copy.onclick = async () => {
      const text = loadJSON(LS_LOCAL, []).map(it => JSON.stringify(it, null, 2)).join(',\n');
      try { await navigator.clipboard.writeText(text); copy.textContent = '✅ 已複製'; }
      catch (e) { prompt('請手動複製：', text); }
    };
    document.getElementById('reset').onclick = () => {
      if (!confirm('確定要清除所有答題紀錄和星星嗎？')) return;
      S.progress = { items: {}, stars: 0 };
      saveJSON(LS_PROGRESS, S.progress);
      updateStars();
      pageParent();
    };
  }

  // ---------- 離線使用 ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  init();
})();
