/**
 * Venue plan detector.
 *
 * The one thing every hall plan has in common is that a table is a CLOSED
 * OUTLINED SHAPE. Not a colour, not a brightness, not a dot pattern — the
 * samples disagree on all of those (one is dark ink on paper with seat dots,
 * the other is bright strokes on black with no seats at all). So:
 *
 *   luminance -> gradient -> edges -> close gaps -> flood fill from the border
 *
 * Whatever the fill cannot reach is enclosed by a stroke. That is a table.
 * Brightness polarity stops mattering entirely, because a gradient is a
 * gradient whichever side is darker.
 */
const sharp = require('C:/eventseatbot_1/eventseatbot/backend/node_modules/sharp');

/** Otsu's method: the threshold that best separates a histogram into two classes. */
function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) { bestVar = between; best = t; }
  }
  return best;
}

async function analyse(file, opts = {}) {
  const image = sharp(file).removeAlpha();
  const meta = await image.metadata();
  const width = meta.width, height = meta.height;
  const { data } = await image.greyscale().raw().toBuffer({ resolveWithObject: true });
  const N = width * height;

  // --- Sobel gradient magnitude ------------------------------------------
  const grad = new Uint8Array(N);
  const hist = new Uint32Array(256);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const tl = data[p - width - 1], t = data[p - width], tr = data[p - width + 1];
      const l = data[p - 1], r = data[p + 1];
      const bl = data[p + width - 1], b = data[p + width], br = data[p + width + 1];
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      const m = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy) / 4));
      grad[p] = m;
      hist[m]++;
    }
  }

  const edgeThreshold = opts.edgeThreshold ?? Math.max(12, otsu(hist, N));
  const edge = new Uint8Array(N);
  for (let p = 0; p < N; p++) edge[p] = grad[p] >= edgeThreshold ? 1 : 0;

  // --- Close gaps so a stroke becomes a continuous ring -------------------
  // Anti-aliased corners and JPEG artefacts leave pinholes; a leak turns the
  // whole hall into "outside" and the detector finds nothing.
  const dilate = (src, radius) => {
    let cur = src;
    for (let it = 0; it < radius; it++) {
      const out = new Uint8Array(N);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = y * width + x;
          if (cur[p]) { out[p] = 1; continue; }
          let hit = 0;
          for (let dy = -1; dy <= 1 && !hit; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              if (cur[ny * width + nx]) { hit = 1; break; }
            }
          }
          out[p] = hit;
        }
      }
      cur = out;
    }
    return cur;
  };
  const closed = dilate(edge, opts.close ?? 2);

  // --- Flood fill from the border: everything reachable is "outside" ------
  const outside = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (p) => { if (!closed[p] && !outside[p]) { outside[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % width, y = (p / width) | 0;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  // --- Enclosed regions --------------------------------------------------
  const label = new Int32Array(N).fill(-1);
  const regions = [];
  for (let start = 0; start < N; start++) {
    if (closed[start] || outside[start] || label[start] !== -1) continue;
    const id = regions.length;
    sp = 0; stack[sp++] = start; label[start] = id;
    let minX = width, minY = height, maxX = 0, maxY = 0, area = 0;
    const rowMin = new Map(), rowMax = new Map();
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % width, y = (p / width) | 0;
      area++;
      if (!rowMin.has(y) || x < rowMin.get(y)) rowMin.set(y, x);
      if (!rowMax.has(y) || x > rowMax.get(y)) rowMax.set(y, x);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const np of nb) {
        if (np < 0 || closed[np] || outside[np] || label[np] !== -1) continue;
        label[np] = id; stack[sp++] = np;
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    // Span area = the region with its interior holes filled in. The number
    // printed inside a table is itself enclosed, so it eats into `area` and
    // makes a disc look like something else. Row spans ignore it.
    let spanArea = 0;
    for (const [y, lo] of rowMin) spanArea += rowMax.get(y) - lo + 1;
    regions.push({
      id, minX, minY, maxX, maxY, w, h, area, spanArea,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      // 1.00 rectangle · 0.79 circle · 0.50 diamond
      boxFill: spanArea / (w * h),
      aspect: w / h,
    });
  }

  return { width, height, edgeThreshold, regions };
}

/** A region is a table candidate if it is shaped like one and sized like one. */
function pickTables(res, opts = {}) {
  const { width, height, regions } = res;
  const px = width * height;
  const minArea = px * (opts.minAreaFrac ?? 0.00025);
  const maxArea = px * (opts.maxAreaFrac ?? 0.10);

  const candidates = regions.filter((r) =>
    r.spanArea >= minArea && r.spanArea <= maxArea &&
    r.aspect > 0.12 && r.aspect < 8 &&
    r.boxFill > 0.42
  );

  // A digit sitting inside a table is itself an enclosed region (the hole in a
  // 0, 6, 8, 9). Drop anything fully contained in a larger candidate.
  const byAreaDesc = [...candidates].sort((a, b) => b.spanArea - a.spanArea);
  const kept = [];
  for (const r of byAreaDesc) {
    const insideBigger = kept.some((k) =>
      r.minX >= k.minX && r.maxX <= k.maxX && r.minY >= k.minY && r.maxY <= k.maxY
    );
    if (!insideBigger) kept.push(r);
  }

  return kept.map((r) => ({
    ...r,
    shape: r.boxFill < 0.88 ? 'circle' : 'rect',
    xPercent: +(r.cx / width * 100).toFixed(2),
    yPercent: +(r.cy / height * 100).toFixed(2),
    wPercent: +(r.w / width * 100).toFixed(2),
    hPercent: +(r.h / height * 100).toFixed(2),
  }));
}

/**
 * Pick the edge threshold by the quality of what it produces, not by a constant.
 *
 * Otsu alone fails across plans: on a light plan the strong seat-dot edges
 * dominate the histogram and the faint table outlines fall below the cut, so
 * the fill leaks and nothing is enclosed. Rather than hand-tuning a number per
 * file — which is the crutch — sweep and keep the threshold whose regions look
 * most like a hall: many enclosed shapes of a consistent size.
 */
async function detectBest(file, opts = {}) {
  const ladder = opts.ladder ?? [10, 14, 18, 24, 30, 38, 48, 62, 80];
  let best = null;
  for (const edgeThreshold of ladder) {
    for (const close of [1, 2]) {
      const res = await analyse(file, { edgeThreshold, close });
      const tables = pickTables(res);
      if (tables.length < 3) continue;
      // A hall is many similar shapes. Reward that; ignore outliers.
      const sizes = tables.map((t) => t.spanArea).sort((a, b) => a - b);
      const median = sizes[Math.floor(sizes.length / 2)];
      const consistent = tables.filter((t) => t.spanArea > median * 0.25 && t.spanArea < median * 4).length;
      const score = consistent;
      if (!best || score > best.score) best = { score, edgeThreshold, close, res, tables, consistent };
    }
  }
  return best;
}

(async () => {
  const file = process.argv[2];
  const best = await detectBest(file);
  if (!best) { console.log('ничего не найдено'); return; }
  const { res, tables } = best;
  console.log('выбрано: порог', best.edgeThreshold, '| закрытие', best.close, '| консистентных', best.consistent);
  const circles = tables.filter((t) => t.shape === 'circle').length;
  console.log('файл          :', file.split(/[\\/]/).pop(), `${res.width}x${res.height}`);
  console.log('порог границ  :', res.edgeThreshold, '(Otsu)');
  console.log('замкнутых обл.:', res.regions.length);
  console.log('СТОЛОВ        :', tables.length, `(кругов ${circles}, прямоуг. ${tables.length - circles})`);
  console.log('');
  tables.sort((a, b) => a.yPercent - b.yPercent || a.xPercent - b.xPercent)
    .slice(0, 40)
    .forEach((t) => console.log(
      '  ' + t.shape.padEnd(6),
      'x' + String(t.xPercent).padStart(6),
      'y' + String(t.yPercent).padStart(6),
      'w' + String(t.wPercent).padStart(6),
      'h' + String(t.hPercent).padStart(6)));
})();
