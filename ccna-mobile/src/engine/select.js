// Question selection — lifted from ccna-exam-simulator/assets/js/app.js (weightedPick,
// shuffle). Behaviour is unchanged; the only difference is that the pool, the domain
// list and the RNG arrive as arguments instead of being read from module globals, so
// the result is reproducible in tests.

// Fisher-Yates on a copy. `rng` must behave like Math.random: [0, 1).
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Blueprint-weighted pick across the 6 Cisco domains: floor(weight * total) each, then
// largest-remainder to reach `total` exactly.
//
// Known limitation, kept deliberately: a domain holding fewer questions than its quota
// contributes what it has and the shortfall is NOT redistributed, so the result can be
// shorter than `total`. With the real bank (smallest domain 145 questions, largest quota
// 25 for a 100-question exam) this never triggers; callers asking for very large exams
// should check the returned length.
export function weightedPick(pool, domains, total, rng = Math.random) {
  const byDom = {};
  for (const d of domains) byDom[d.id] = shuffle(pool.filter(q => q.dom === d.id), rng);

  const picked = domains.map(d => {
    const exact = d.weight * total;
    return { id: d.id, n: Math.floor(exact), frac: exact - Math.floor(exact) };
  });

  let sum = picked.reduce((a, b) => a + b.n, 0);
  picked.sort((a, b) => b.frac - a.frac);
  for (let i = 0; sum < total; i++, sum++) picked[i % picked.length].n++;

  const out = [];
  for (const p of picked) out.push(...byDom[p.id].slice(0, Math.min(p.n, byDom[p.id].length)));
  return shuffle(out, rng);
}

// A question counts towards scoring when it has a key: text/exhibit items need `a`,
// drag-and-drop items need a reconstructed `dd` block. Lab simulations never do.
export function scorable(q) {
  if (q.y === 'txt' || q.y === 'ex') return !!q.a && q.a.length > 0;
  if (q.y === 'dd') return !!q.dd;
  return false;
}
