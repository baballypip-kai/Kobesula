// 用法：node tools/check-zhuyin.js
// 列出所有成語內容的注音，並標出破音字（有多種讀音的字），方便家長檢查。
const fs = require('fs');
const path = require('path');
const Z = require('../js/zhuyin.js');
const root = path.join(__dirname, '..');
const dict = JSON.parse(fs.readFileSync(path.join(root, 'data/zhuyin.json'), 'utf8'));
const { idioms } = JSON.parse(fs.readFileSync(path.join(root, 'data/idioms.json'), 'utf8'));
const z = Z.create(dict);
let missing = 0;
for (const it of idioms) {
  console.log(`\n=== ${it.idiom} ===`);
  const texts = [it.idiom, it.short, it.meaning, it.story, ...(it.examples || [])].filter(Boolean);
  for (const t of texts) {
    const toks = z.annotate(t);
    const line = toks.map(k => {
      if (k.zy === null) return k.ch;
      if (k.zy === '') { missing++; return `${k.ch}(？？)`; }
      const multi = z.readings(k.ch).length > 1;
      return multi ? `${k.ch}(${k.zy})` : k.ch;
    }).join('');
    console.log('  ' + line);
  }
}
console.log(`\n括號內是破音字目前採用的讀音。查不到注音的字：${missing} 個`);
