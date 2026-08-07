const hex = (h) => { h = h.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const toHex = (c) => '#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const L = (rgb) => { const f = rgb.map(v=>{const s=v/255; return s<=0.03928? s/12.92 : Math.pow((s+0.055)/1.055,2.4);}); return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]; };
const CR = (a,b) => { const la=L(typeof a==='string'?hex(a):a), lb=L(typeof b==='string'?hex(b):b); const hi=Math.max(la,lb), lo=Math.min(la,lb); return (hi+0.05)/(lo+0.05); };
const over = (fg, alpha, bg) => { const f=typeof fg==='string'?hex(fg):fg, b=typeof bg==='string'?hex(bg):bg; return f.map((v,i)=>alpha*v+(1-alpha)*b[i]); };
const r2 = (n)=>Math.round(n*100)/100;

const C = {
  bg:'#f2ede4', panel:'#fbf9f5', panel2:'#efe9de', line:'#e2dbcd', lineStrong:'#cfc5b2', lineEdge:'#bfb49f',
  ink:'#23201b', muted:'#6e675d', accent:'#9a6a2e', skipped:'#72695a', drifted:'#7b746a',
  bar:'#eee7da', s1:'#fffdf9', s2:'#f3f6ec', s3:'#f5e9dd',
};

console.log('=== BASELINE (shipped tokens) ===');
for (const [n,s] of [['s1',C.s1],['s2',C.s2],['s3',C.s3],['bg',C.bg],['panel',C.panel],['bar',C.bar]]) {
  console.log(`muted on ${n} ${s}: ${r2(CR(C.muted,s))}   ink: ${r2(CR(C.ink,s))}   lineStrong: ${r2(CR(C.lineStrong,s))}   accent: ${r2(CR(C.accent,s))}   skipped: ${r2(CR(C.skipped,s))}`);
}
console.log('lineEdge on bg:', r2(CR(C.lineEdge,C.bg)), ' on s1:', r2(CR(C.lineEdge,C.s1)), ' on s2:', r2(CR(C.lineEdge,C.s2)), ' on s3:', r2(CR(C.lineEdge,C.s3)));
console.log('line on bg:', r2(CR(C.line,C.bg)), ' lineStrong on bg:', r2(CR(C.lineStrong,C.bg)));

console.log('\n=== D1: BLOOM peak 13% accent over s1 ===');
const bloomPeak = over(C.accent, 0.13, C.s1);
console.log('composite', toHex(bloomPeak), 'ink', r2(CR(C.ink,bloomPeak)), 'muted', r2(CR(C.muted,bloomPeak)), 'accent-as-stroke', r2(CR(C.accent,bloomPeak)), 'lineStrong track', r2(CR(C.lineStrong,bloomPeak)));
const bloom45 = over(C.accent, 0.045, C.s1);
console.log('at 4.5% (caption zone)', toHex(bloom45), 'muted', r2(CR(C.muted,bloom45)));

console.log('\n=== D1: LIT PANE, white 0.38 over each surface ===');
for (const [n,s] of [['s1',C.s1],['s2',C.s2],['s3',C.s3]]) {
  const lit = over('#ffffff',0.38,s);
  console.log(`${n} -> ${toHex(lit)}  muted ${r2(CR(C.muted,s))} -> ${r2(CR(C.muted,lit))}   skipped ${r2(CR(C.skipped,s))} -> ${r2(CR(C.skipped,lit))}   lineStrong ${r2(CR(C.lineStrong,s))} -> ${r2(CR(C.lineStrong,lit))}   line ${r2(CR(C.line,s))} -> ${r2(CR(C.line,lit))}`);
}

console.log('\n=== D1: line-deep #bdb09a track ===');
for (const [n,s] of [['s1',C.s1],['s2',C.s2],['s3',C.s3],['bg',C.bg]]) console.log(`#bdb09a on ${n}: ${r2(CR('#bdb09a',s))}  (lit #cfc5b2: ${r2(CR('#cfc5b2',s))})`);
// on the LIT surface (top of pane) the track is what you actually see
for (const [n,s] of [['s1',C.s1],['s2',C.s2],['s3',C.s3]]) { const lit=over('#ffffff',0.38,s); console.log(`  on LIT ${n} ${toHex(lit)}: deep ${r2(CR('#bdb09a',lit))}  lit-stop ${r2(CR('#cfc5b2',lit))}`); }

console.log('\n=== D1: GLASS 92% panel over scrimmed amber ===');
const scrimmedAmber = over('#232320'.replace('#232320','#23201b'), 0.22, C.accent);
console.log('amber under 0.22 ink scrim:', toHex(scrimmedAmber));
const pane92 = over(C.panel, 0.92, scrimmedAmber);
console.log('92% pane ->', toHex(pane92), 'ink', r2(CR(C.ink,pane92)), 'muted', r2(CR(C.muted,pane92)), 'skipped', r2(CR(C.skipped,pane92)), 'drifted', r2(CR(C.drifted,pane92)));
for (const a of [0.90,0.88,0.86]) { const p = over(C.panel,a,scrimmedAmber); console.log(`  ${a}: ${toHex(p)} muted ${r2(CR(C.muted,p))} skipped ${r2(CR(C.skipped,p))}`); }
// worst case: pure INK behind (blurred neighbourhood of a big dark thing)
const scrimmedInk = over(C.ink,0.22,C.ink);
const pane92ink = over(C.panel,0.92,scrimmedInk);
console.log('over pure ink:', toHex(pane92ink), 'muted', r2(CR(C.muted,pane92ink)), 'skipped', r2(CR(C.skipped,pane92ink)));
// separation of pane from its scrimmed surround (page under 0.22)
const scrimmedPage = over(C.ink,0.22,C.bg);
console.log('page under 0.22 scrim:', toHex(scrimmedPage), 'pane 92% over it:', toHex(over(C.panel,0.92,scrimmedPage)), 'separation', r2(CR(over(C.panel,0.92,scrimmedPage), scrimmedPage)));
console.log('opaque panel vs page under 0.20 scrim:', r2(CR(C.panel, over(C.ink,0.20,C.bg))), ' under 0.24:', r2(CR(C.panel, over(C.ink,0.24,C.bg))), ' under 0.28:', r2(CR(C.panel, over(C.ink,0.28,C.bg))));

console.log('\n=== D2: TOOTH black at alpha over surfaces ===');
for (const [n,s] of [['s1',C.s1],['s3',C.s3],['panel',C.panel]]) {
  for (const a of [0.008,0.016]) { const t = over('#000000',a,s); console.log(`${n} @${a}: ${toHex(t)} muted ${r2(CR(C.muted,s))} -> ${r2(CR(C.muted,t))}`); }
}

console.log('\n=== D2: BLOOM box-shadow 12% accent ===');
const b12 = over(C.accent,0.12,C.s1);
console.log('12% over s1:', toHex(b12), 'muted', r2(CR(C.muted,b12)), 'ink', r2(CR(C.ink,b12)));
const b12t = over('#000000',0.008, b12);
console.log('+ tooth:', toHex(b12t), 'muted', r2(CR(C.muted,b12t)), 'ink', r2(CR(C.ink,b12t)));

console.log('\n=== D3: BLOOM 10% peak over s1 ===');
const d3peak = over(C.accent,0.10,C.s1);
console.log('peak', toHex(d3peak), 'vs s1', r2(CR(d3peak,C.s1)), 'lineStrong on peak', r2(CR(C.lineStrong,d3peak)), 'accent on peak', r2(CR(C.accent,d3peak)), 'ink', r2(CR(C.ink,d3peak)), 'muted', r2(CR(C.muted,d3peak)));
const d3_14 = over(C.accent,0.14,C.s1);
console.log('at 14%:', toHex(d3_14), 'lineStrong', r2(CR(C.lineStrong,d3_14)));
const d3_2 = over(C.accent,0.02,C.s1), d3_65 = over(C.accent,0.065,C.s1);
console.log('at 2% (numeral):', toHex(d3_2), 'muted', r2(CR(C.muted,d3_2)), ' | at 6.5% (caption):', toHex(d3_65), 'muted', r2(CR(C.muted,d3_65)));
