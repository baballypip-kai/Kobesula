"""
從教育部《重編國語辭典修訂本》資料產生 data/zhuyin.json（注音字典）。
平常不需要執行；只有想調整「常用破音字的預設讀音」時才需要重建。

用法：
  1. 下載資料：npm pack moedict-data（或從 g0v/moedict-data 取得 dict-revised.json）
  2. python3 tools/build_dict.py path/to/dict-revised.json data/zhuyin.json

輸出格式：{"c": {字: "讀音1|讀音2..."}, "p": {詞: "注音 注音 ..."}}
  c 的第一個讀音是預設讀音；p 只收錄「預設讀音不對」或「需要保護不被誤判」的詞。
"""
import json
import re
import sys

# 常用破音字的預設讀音（辭典的第一個讀音不一定是最常用的）
DEFAULTS = {
    '的': '˙ㄉㄜ', '了': '˙ㄌㄜ', '著': '˙ㄓㄜ', '得': '˙ㄉㄜ', '地': 'ㄉㄧˋ',
    '還': 'ㄏㄞˊ', '沒': 'ㄇㄟˊ', '給': 'ㄍㄟˇ', '都': 'ㄉㄡ', '為': 'ㄨㄟˋ',
    '呢': '˙ㄋㄜ', '吧': '˙ㄅㄚ', '嗎': '˙ㄇㄚ', '啊': '˙ㄚ', '們': '˙ㄇㄣ',
    '玩': 'ㄨㄢˊ', '淺': 'ㄑㄧㄢˇ', '姊': 'ㄐㄧㄝˇ', '更': 'ㄍㄥˋ', '嚇': 'ㄒㄧㄚˋ',
    '哪': 'ㄋㄚˇ', '場': 'ㄔㄤˇ', '喔': 'ㄛ', '哦': 'ㄛˊ', '呀': '˙ㄧㄚ',
    '啦': '˙ㄌㄚ', '么': 'ㄧㄠ',
}

# 修正或補充的詞語讀音（辭典有多種讀法時選常用的那一個）
PHRASE_FIX = {
    '看看': 'ㄎㄢˋ ˙ㄎㄢ',
    '好處': 'ㄏㄠˇ ㄔㄨˋ',
    '羊圈': 'ㄧㄤˊ ㄐㄩㄢˋ',
    '豬圈': 'ㄓㄨ ㄐㄩㄢˋ',
    '變得': 'ㄅㄧㄢˋ ˙ㄉㄜ',
    '兒子': 'ㄦˊ ˙ㄗ',
    '因為': 'ㄧㄣ ㄨㄟˋ',
    '以為': 'ㄧˇ ㄨㄟˊ',
    '成為': 'ㄔㄥˊ ㄨㄟˊ',
    '認為': 'ㄖㄣˋ ㄨㄟˊ',
    '作為': 'ㄗㄨㄛˋ ㄨㄟˊ',
    '行為': 'ㄒㄧㄥˊ ㄨㄟˊ',
}

# 容易跨詞誤判、不收錄的詞
BLACKLIST = {'的是', '了的', '的話了', '還沒'}

MAX_PHRASE = 8


def clean(b):
    if not b:
        return None
    b = b.replace('　', ' ')
    parts = [p.strip() for p in re.split(r'（[^）]*）', b) if p.strip()]
    return parts[0] if parts else None


def main(src, out):
    d = json.load(open(src, encoding='utf-8'))
    chars, phrases = {}, {}
    for e in d:
        t = e['title']
        if '{' in t:
            continue
        hs = [h for h in (clean(x.get('bopomofo')) for x in e['heteronyms']) if h]
        if not hs:
            continue
        if len(t) == 1:
            r = []
            for h in hs:
                if ' ' not in h and h not in r:
                    r.append(h)
            if r:
                chars[t] = r
        elif 2 <= len(t) <= MAX_PHRASE:
            syl = hs[0].split()
            if len(syl) == len(t):
                phrases[t] = syl

    for ch, r in DEFAULTS.items():
        if ch in chars:
            chars[ch] = [r] + [x for x in chars[ch] if x != r]
        else:
            chars[ch] = [r]
    for t, z in PHRASE_FIX.items():
        phrases[t] = z.split()
    for t in BLACKLIST:
        phrases.pop(t, None)

    default = lambda c: chars[c][0] if c in chars else ''

    keep = {t: s for t, s in phrases.items()
            if t in PHRASE_FIX or any(default(c) != x for c, x in zip(t, s))}

    def annotate(text):
        res, i, n = [], 0, len(text)
        while i < n:
            for L in range(min(MAX_PHRASE, n - i), 1, -1):
                s = text[i:i + L]
                if s in keep:
                    res += keep[s]
                    i += L
                    break
            else:
                res.append(default(text[i]))
                i += 1
        return res

    # 收錄會被短詞誤判的長詞（例如「刮目相看」不能被「相看」帶錯）
    while True:
        added = 0
        for t, s in phrases.items():
            if t not in keep and annotate(t) != s:
                keep[t] = s
                added += 1
        if not added:
            break

    data = {'c': {c: '|'.join(r) for c, r in chars.items()},
            'p': {t: ' '.join(s) for t, s in keep.items()}}
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'字：{len(chars)}　詞：{len(keep)} / {len(phrases)}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
