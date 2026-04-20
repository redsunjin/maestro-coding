import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGoldenListeningPackEntries } from '../src/lib/goldenListeningPack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../output/golden-listening-set');

export function buildGoldenListeningPack() {
  return buildGoldenListeningPackEntries();
}

export function writeGoldenListeningPack(outputDir = DEFAULT_OUTPUT_DIR) {
  const entries = buildGoldenListeningPack();
  fs.mkdirSync(outputDir, { recursive: true });

  const manifestPath = path.join(outputDir, 'manifest.json');
  const markdownPath = path.join(outputDir, 'listening-pack.md');

  fs.writeFileSync(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scenarioCount: entries.length,
    entries,
  }, null, 2));
  fs.writeFileSync(markdownPath, renderListeningPackMarkdown(entries));

  return {
    outputDir,
    manifestPath,
    markdownPath,
    entries,
  };
}

function renderListeningPackMarkdown(entries) {
  const sections = entries.map((entry) => [
    `## ${entry.label}`,
    '',
    `- Source: ${entry.sourceUrl}`,
    `- Provider: ${entry.provider}`,
    `- Tempo: ${entry.tempo} BPM`,
    `- Motif: ${entry.motifId}`,
    `- Key: ${entry.key}`,
    `- Events: ${entry.eventCount}`,
    `- Sessions: ${entry.sessionCount}`,
    `- Notes: ${entry.noteCount}`,
    `- Cue batches: ${entry.cueBatchCount}`,
    `- Peak tension: ${formatIntentSummary(entry.peakTensionEvent)}`,
    `- Peak resolution: ${formatIntentSummary(entry.peakResolutionEvent)}`,
    `- Roles: ${entry.roleSequence.join(' -> ')}`,
    `- Rhythms: ${entry.rhythmSequence.join(' -> ')}`,
    `- Harmony: ${entry.harmonySequence.join(' -> ')}`,
    '- Listening focus:',
    ...entry.listeningFocus.map((item) => `  - ${item}`),
    '- Cue preview:',
    ...entry.cueSummaryPreview.map((item) => `  - ${item}`),
    '',
  ].join('\n'));

  return [
    '# Maestro Player Golden Listening Pack',
    '',
    'This pack fixes three autoplay listening scenarios so musical regressions can be checked against stable fixture output before manual listening.',
    '',
    ...sections,
  ].join('\n');
}

function formatIntentSummary(intent) {
  if (!intent) {
    return 'n/a';
  }

  return `${intent.eventType} (${intent.structuralRole}, ${intent.rhythmPattern}, ${intent.harmonyAction})`;
}

if (process.argv[1] === __filename) {
  const result = writeGoldenListeningPack(process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT_DIR);
  process.stdout.write(`${result.markdownPath}\n${result.manifestPath}\n`);
}
