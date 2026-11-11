// Guards for the scientific wording corrected on 11 Nov 2026 (docs/audit/SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md).
// They check specific claims, not general keywords: the coverage number must carry its qualifier in the same
// element, overclaiming phrases must not come back, and the report fields the page reads must stay the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const validation = read('../src/pages/Validation.jsx');
const method = read('../src/pages/Method.jsx');
const switch2012 = read('../src/pages/Switch2012.jsx');
const text = read('../src/content/text.js');
const compare = read('../src/components/Compare.jsx');
const claims = read('../../docs/audit/SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md');

test('the overgeneralised claims are gone from the public pages', () => {
  for (const [name, src] of [['Validation', validation], ['Method', method], ['Switch2012', switch2012]]) {
    assert.doesNotMatch(src, /never saw/i, `${name}: "never saw"`);
    assert.doesNotMatch(src, /the real change/i, `${name}: "the real change"`);
    assert.doesNotMatch(src, /every choice was tested/i, `${name}: "every choice was tested"`);
  }
  assert.doesNotMatch(validation, /No jump at 2012/);
});

test('the coverage number carries its qualifier in the same element', () => {
  const block = validation.match(/<p className="coverage">[\s\S]*?<\/p>/);
  assert.ok(block, 'coverage fact block present');
  assert.match(block[0], /coverOf\('cells'\)/);
  assert.match(block[0], /coverOf\('frp'\)/);
  assert.match(block[0], /className="qualifier"/);
  assert.match(block[0], /Not a fully independent check/);
  assert.doesNotMatch(block[0], /held-out months/);
  // revision 1 and 4: names the cell choice and model choice, and says the checked ranges are not the published ones
  assert.match(block[0], /choose and weight the tested cells/);
  assert.match(block[0], /choosing the model/);
  assert.match(block[0], /built a little differently from the\s+published pre-2012 ranges/);
  // the numbers come from the report, never typed into the page
  assert.doesNotMatch(block[0], /9[34]\.\d/);
});

test('the page still reads the same report fields', () => {
  for (const f of ["'calibrated_coverage_pct'", "'gate_2012_step'", "'cells_gap_pct'", "'frp_gap_pct'", "'final_test_2026'",
    "'known_events'", "'tested_cells'"]) {
    assert.ok(validation.includes(f.slice(1, -1)), `field ${f}`);
  }
});

test('the Method page states what the 95% range does not cover', () => {
  const li = method.match(/<li>Before 2012 every value carries a calibrated 95% range[\s\S]*?<\/li>/);
  assert.ok(li, 'range bullet present');
  const flat = li[0].replace(/\s+/g, ' ');
  for (const w of ['cloud', 'before 2012', 'not fully independent', 'built a little differently', 'not as a guaranteed 95% bound']) {
    assert.ok(flat.includes(w), `range bullet mentions "${w}"`);
  }
});

test('the audit records carry the dated erratum', () => {
  for (const p of ['VALIDATION_REPORT.md', 'SCIENTIFIC_METHODOLOGY.md']) {
    assert.match(read(`../../docs/audit/${p}`), /Erratum E1, 11 November 2026/, p);
  }
  assert.match(read('../../docs/audit/HARMONIZATION_EQUATIONS.md'), /\[E1:/);
});


// ---------------------------------------------------------------- revision 2 (11 Nov 2026)

test('every 95% range label on the site carries its caveat', () => {
  // each string in text.js that shows a 95% range to the reader must say it is conversion error only
  // a label may continue on the next source line (string concatenation), so each match is read with that line
  const src = text.split('\n');
  const lines = src.map((l, i) => [l, `${l} ${src[i + 1] || ''}`]).filter(([l]) => /95% range/.test(l) && !/^\s*\/\//.test(l)).map(([, two]) => two);
  assert.ok(lines.length >= 6, `expected the range labels, found ${lines.length}`);
  for (const l of lines) {
    assert.ok(/conversion error only|RANGE_CAVEAT|conversion-error range only|MODIS-to-VIIRS conversion error/.test(l), `uncaveated: ${l.trim()}`);
  }
  assert.match(text, /export const RANGE_CAVEAT = '[^']*not a guaranteed bound/);
  assert.match(text, /modisNote: [^\n]*RANGE_CAVEAT/);
  assert.match(text, /rangeValue[\s\S]{0,300}RANGE_CAVEAT/);
  // the Compare hover uses the shared caveated label, not a bare "95% range"
  assert.doesNotMatch(compare, /95% range/);
  assert.match(compare, /rangeShort\(/);
});

test('Suomi NPP end is 2 November 2026 at 13:00 UTC, with its source', () => {
  for (const [name, src] of [['Validation', validation], ['Method', method], ['text', text],
    ['README', read('../../README.md')], ['DATA_CONTRACT', read('../../docs/DATA_CONTRACT.md')],
    ['SCIENTIFIC_SPECIFICATION', read('../../docs/SCIENTIFIC_SPECIFICATION.md')], ['COLAB_GUIDE', read('../../docs/COLAB_GUIDE.md')]]) {
    assert.doesNotMatch(src, /\b1 Nov(ember)? 2026|November 1,? 2026/, `${name} still gives 1 November`);
  }
  assert.match(method, /2 November 2026, 13:00 UTC[^<]*NASA FIRMS FAQ/);
  assert.match(validation, /13:00 UTC on 2 November 2026/);
  assert.match(read('../../README.md'), /13:00 UTC on 2 November 2026 \(\[NASA FIRMS FAQ\]\(https:\/\/www\.earthdata\.nasa\.gov\/data\/tools\/firms\/faq\)\)/);
});

test('the claims record separates leakage types and frames the refit as sensitivity analysis', () => {
  // revision 1: cell selection, weights and factor fitting compared with model selection
  for (const h of ['### 1.2 Which cells are evaluated, and how they are weighted', '### 1.3 Factor fitting compared with model selection',
    '### 1.4 Evaluated bands are not the published bands']) {
    assert.ok(claims.includes(h), h);
  }
  // revision 2: no independent-validation claim for a retrospective split
  assert.match(claims, /### 3\.1 Sensitivity analysis on 2012-2019/);
  assert.match(claims, /### 3\.2 Genuine outer holdout/);
  assert.match(claims, /not independent validation/);
  // revision 3: no rule that widens or recalibrates bands on the test set
  assert.doesNotMatch(claims, /widened by the measured shortfall/);
  assert.doesNotMatch(claims, /can say "independently verified on held-out years"/);
  assert.match(claims, /will not be recalibrated on 2012-2015, or on any evaluation set/);
});

test('the 4% figure is defined wherever it is used', () => {
  assert.match(claims, /### 2\.1 The 4% figure, defined/);
  for (const w of ['Hotspots (S-NPP-equivalent', 'all 48 months of 2012-2015', 'Fire-weighted median over the 1,743 tested cells', '17.6%']) {
    assert.ok(claims.includes(w), `definition mentions "${w}"`);
  }
  for (const p of ['VALIDATION_REPORT.md', 'SCIENTIFIC_METHODOLOGY.md']) {
    assert.match(read(`../../docs/audit/${p}`), /Erratum E2, 11 November 2026/, p);
  }
  const pitch = read('../../docs/audit/NASA_JUDGING_EXPLANATION.md');
  assert.match(pitch, /four-year total/);
  assert.doesNotMatch(pitch, /predicted them with a typical error of four percent/);
});
