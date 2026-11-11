// The chart image export writes theme.font into an SVG attribute in double quotes. A font list with
// double quotes broke every SVG chart's PNG and SVG download from 7 Nov to 11 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/theme/useTheme.js', import.meta.url), 'utf8');

test('the theme font never carries double quotes into the chart image export', () => {
  assert.match(src, /font: v\('--font-body'\)\.replace\(\/"\/g, "'"\)/);
});
