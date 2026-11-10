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
  for (const w of ['cloud', 'before 2012', 'not fully independent', 'not as a guaranteed 95% bound']) {
    assert.ok(li[0].includes(w), `range bullet mentions "${w}"`);
  }
});

test('the audit records carry the dated erratum', () => {
  for (const p of ['VALIDATION_REPORT.md', 'SCIENTIFIC_METHODOLOGY.md']) {
    assert.match(read(`../../docs/audit/${p}`), /Erratum E1, 11 November 2026/, p);
  }
  assert.match(read('../../docs/audit/HARMONIZATION_EQUATIONS.md'), /\[E1:/);
  assert.match(read('../../docs/audit/SCIENTIFIC_CLAIMS_CORRECTION_2026-11-11.md'), /## 3\. Proposed experiment/);
});
