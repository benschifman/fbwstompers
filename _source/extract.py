import json, glob, re, html, os
os.makedirs('_source/text', exist_ok=True)
for f in sorted(glob.glob('_source/pages/*.json')):
    d = json.load(open(f))
    c = d['content']['rendered']
    c = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', c, flags=re.S|re.I)
    # keep heading level markers and links
    c = re.sub(r'<h([1-6])[^>]*>', lambda m: '\n\n'+'#'*int(m.group(1))+' ', c, flags=re.I)
    c = re.sub(r'</h[1-6]>', '\n', c, flags=re.I)
    c = re.sub(r'<li[^>]*>', '\n- ', c, flags=re.I)
    c = re.sub(r'</(p|div|section)>', '\n', c, flags=re.I)
    c = re.sub(r'<br\s*/?>', '\n', c, flags=re.I)
    c = re.sub(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', r'\2 [\1]', c, flags=re.S|re.I)
    c = re.sub(r'<img [^>]*?(?:data-src|src)="([^"]+)"[^>]*>', r'\n[IMG: \1]\n', c, flags=re.I)
    c = re.sub(r'<iframe [^>]*?(?:data-src|src)="([^"]+)"[^>]*>', r'\n[EMBED: \1]\n', c, flags=re.I)
    c = re.sub(r'<[^>]+>', '', c)
    c = html.unescape(c)
    c = re.sub(r'[ \t]+', ' ', c)
    c = re.sub(r'\n\s*\n\s*\n+', '\n\n', c).strip()
    out = f"# PAGE: {d['title']['rendered']}  ({d['link']})\n\n{c}\n"
    open(f"_source/text/{d['slug']}.md", 'w').write(out)
    print(f"{d['slug']:16} -> {len(c):6} chars")
