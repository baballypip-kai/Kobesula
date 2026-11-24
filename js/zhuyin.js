/*
 * 注音引擎：用教育部《重編國語辭典修訂本》整理出的字典，把中文轉成注音。
 * - 先用「詞」比對（處理破音字，例如 塞翁失馬 的「塞」唸 ㄙㄞˋ）
 * - 找不到詞就用單字最常見的讀音
 * - 文字裡可以手動指定讀音：字[ㄓㄨˋ ㄧㄣ] → 例如 塞[ㄙㄞˋ]
 */
(function (root) {
  const OVERRIDE = /(.)\[([ㄅ-ㄩˊˇˋ˙ ]+)\]/gu;
  const HAN = /\p{Script=Han}/u;
  const MAX_PHRASE = 8;

  function create(dict) {
    const chars = dict.c, phrases = dict.p;

    // 回傳 [{ch, zy}]，zy 為 null 代表標點或非中文
    function annotate(text) {
      // 1. 解析手動指定讀音
      const toks = [];
      let last = 0, m;
      OVERRIDE.lastIndex = 0;
      while ((m = OVERRIDE.exec(text))) {
        for (const ch of text.slice(last, m.index)) toks.push({ ch });
        toks.push({ ch: m[1], forced: m[2].trim() });
        last = OVERRIDE.lastIndex;
      }
      for (const ch of text.slice(last)) toks.push({ ch });

      // 2. 詞語比對（長詞優先），再用單字預設讀音
      const n = toks.length;
      let i = 0;
      while (i < n) {
        if (!HAN.test(toks[i].ch)) { toks[i].zy = null; i++; continue; }
        let matched = 0;
        for (let L = Math.min(MAX_PHRASE, n - i); L >= 2; L--) {
          let s = '';
          for (let k = i; k < i + L; k++) s += toks[k].ch;
          const p = phrases[s];
          if (p) {
            const syl = p.split(' ');
            for (let k = 0; k < L; k++) toks[i + k].zy = syl[k];
            matched = L;
            break;
          }
        }
        if (matched) { i += matched; continue; }
        const r = chars[toks[i].ch];
        toks[i].zy = r ? r.split('|')[0] : '';
        i++;
      }
      for (const t of toks) if (t.forced) t.zy = t.forced;
      return toks;
    }

    // 所有讀音（給家長檢查破音字用）
    function readings(ch) {
      const r = chars[ch];
      return r ? r.split('|') : [];
    }

    return { annotate, readings };
  }

  function stripOverrides(text) {
    return text.replace(OVERRIDE, '$1');
  }

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 一個音節 → 直排注音 HTML
  function syllableHTML(zy) {
    if (!zy) return '<span class="zb"></span>';
    let neutral = false, tone = '';
    let s = zy;
    if (s[0] === '˙') { neutral = true; s = s.slice(1); }
    if (/[ˊˇˋ]$/.test(s)) { tone = s.slice(-1); s = s.slice(0, -1); }
    const sym = [...s].map(c => `<i>${c}</i>`).join('');
    return '<span class="zb">' +
      `<span class="zs">${neutral ? '<b class="zn">˙</b>' : ''}${sym}</span>` +
      `<span class="zt zt${[...s].length}">${tone}</span>` +
      '</span>';
  }

  // 標點不放在行首（黏著前一個字）、開頭的引號不放在行尾（黏著後一個字）
  const CLOSE = /^[，。、；：！？」』）》…,.!?;:)\]]$/;
  const OPEN = /^[「『（《(\[]$/;

  function toHTML(toks) {
    const one = t => t.zy === null || t.zy === undefined
      ? `<span class="zp">${esc(t.ch)}</span>`
      : `<span class="zc"><span class="zh">${esc(t.ch)}</span>${syllableHTML(t.zy)}</span>`;
    const groups = [];
    let pendingOpen = '';
    for (const t of toks) {
      const isPunct = t.zy === null || t.zy === undefined;
      if (isPunct && OPEN.test(t.ch)) { pendingOpen += one(t); continue; }
      if (isPunct && CLOSE.test(t.ch) && groups.length && !pendingOpen) { groups[groups.length - 1] += one(t); continue; }
      groups.push(pendingOpen + one(t));
      pendingOpen = '';
    }
    if (pendingOpen) groups.push(pendingOpen);
    return groups.map(g => `<span class="zg">${g}</span>`).join('');
  }

  const api = { create, toHTML, syllableHTML, stripOverrides, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Zhuyin = api;
})(this);
