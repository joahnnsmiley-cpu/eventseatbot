# -*- coding: utf-8 -*-
"""
Read a venue plan straight out of the PDF.

The plans come as vector PDFs: tables are rectangle and bezier operators, the
numbers are text with coordinates. There is nothing to detect — the geometry is
in the file. Contour detection stays as the fallback for venues that send a
photo or a JPEG.

This walks the content stream, tracks the CTM, and collects:
  - `re` rectangles
  - subpaths built from m/l/c (a circle is four beziers)
  - text runs with their position
"""
import re
import sys
import zlib


def content_streams(raw):
    out = []
    for m in re.finditer(rb'stream\r?\n(.*?)endstream', raw, re.S):
        blob = m.group(1)
        try:
            out.append(zlib.decompress(blob))
        except Exception:
            pass
    return out


NUM = r'[-+]?\d*\.?\d+'


def parse(stream):
    """Return rectangles, subpath bounding boxes, and text runs."""
    text = stream.decode('latin-1', 'ignore')
    rects, paths, texts = [], [], []

    # Graphics state: only the translation/scale part of the CTM matters here.
    ctm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    stack = []

    def apply(m, x, y):
        return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])

    def mul(a, b):
        return [
            a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
        ]

    cur = []          # points of the subpath being built
    tm = None         # text matrix

    token = re.compile(
        r'(?P<nums>(?:' + NUM + r'\s+)+)(?P<op>re|m|l|c|cm|Tm|Td|TD)\b'
        r'|(?P<q>[qQ])\b'
        r'|\((?P<str>(?:\\.|[^\\()])*)\)\s*Tj'
        r'|(?P<arr>\[(?:\\.|[^\]])*\])\s*TJ'
        r'|(?P<close>[hf*BSn]+)\b'
    )

    for t in token.finditer(text):
        if t.group('q'):
            if t.group('q') == 'q':
                stack.append(list(ctm))
            elif stack:
                ctm = stack.pop()
            continue

        if t.group('str') is not None or t.group('arr') is not None:
            s = t.group('str')
            if s is None:
                s = ''.join(re.findall(r'\((?:\\.|[^\\()])*\)', t.group('arr')))
                s = re.sub(r'[()]', '', s)
            s = s.strip()
            if s and tm:
                x, y = apply(ctm, tm[4], tm[5])
                texts.append({'text': s, 'x': x, 'y': y})
            continue

        if t.group('close'):
            if cur:
                xs = [p[0] for p in cur]
                ys = [p[1] for p in cur]
                paths.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys),
                              'pts': len(cur)})
                cur = []
            continue

        nums = [float(v) for v in re.findall(NUM, t.group('nums'))]
        op = t.group('op')

        if op == 'cm' and len(nums) >= 6:
            ctm = mul(nums[-6:], ctm)
        elif op == 'Tm' and len(nums) >= 6:
            tm = nums[-6:]
        elif op in ('Td', 'TD') and len(nums) >= 2 and tm:
            tm = list(tm)
            tm[4] += nums[-2]
            tm[5] += nums[-1]
        elif op == 're' and len(nums) >= 4:
            x, y, w, h = nums[-4:]
            c = [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x, y + h), apply(ctm, x + w, y + h)]
            xs = [p[0] for p in c]
            ys = [p[1] for p in c]
            rects.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys)})
        elif op == 'm' and len(nums) >= 2:
            if cur:
                xs = [p[0] for p in cur]
                ys = [p[1] for p in cur]
                paths.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys),
                              'pts': len(cur)})
            cur = [apply(ctm, nums[-2], nums[-1])]
        elif op == 'l' and len(nums) >= 2:
            cur.append(apply(ctm, nums[-2], nums[-1]))
        elif op == 'c' and len(nums) >= 6:
            cur.append(apply(ctm, nums[-2], nums[-1]))

    if cur:
        xs = [p[0] for p in cur]
        ys = [p[1] for p in cur]
        paths.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys), 'pts': len(cur)})

    return rects, paths, texts


def main(path):
    raw = open(path, 'rb').read()
    rects, paths, texts = [], [], []
    for st in content_streams(raw):
        r, p, t = parse(st)
        rects += r
        paths += p
        texts += t

    print('файл          :', path.split('\\')[-1].split('/')[-1])
    print('прямоугольников:', len(rects))
    print('замкнутых путей:', len(paths))
    print('текстовых строк:', len(texts))

    # Numbers that look like table labels
    labels = [t for t in texts if re.fullmatch(r'\d{1,4}', t['text'])]
    print('числовых меток :', len(labels))
    if labels:
        vals = sorted(int(t['text']) for t in labels)
        print('  номера       :', ', '.join(str(v) for v in vals[:40]), '...' if len(vals) > 40 else '')

    # Table-sized shapes: square-ish and not the page frame
    def size(s):
        return (s['x1'] - s['x0'], s['y1'] - s['y0'])
    cand = []
    for s in rects + paths:
        w, h = size(s)
        if w > 4 and h > 4 and w < 400 and h < 400:
            cand.append((w, h, s))
    print('фигур «со стол»:', len(cand))
    if cand:
        ws = sorted(w for w, h, _ in cand)
        print('  ширины: мин %.1f  медиана %.1f  макс %.1f' % (ws[0], ws[len(ws) // 2], ws[-1]))
    print('примеры текста :', ' | '.join(t['text'] for t in texts[:14]))


if __name__ == '__main__':
    main(sys.argv[1])
