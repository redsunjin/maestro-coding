import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChartFromMusicPlan } from '../src/lib/chartMapper.js';
import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';
import { createReplayCuePlan } from '../src/lib/replayAudioEngine.js';
import { buildGoldenListeningScenarios } from '../tests/fixtures/goldenListeningSet.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../output/golden-listening-set');

export function buildGoldenListeningPack() {
  return buildGoldenListeningScenarios().map((scenario) => summarizeScenario(scenario));
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

function summarizeScenario(scenario) {
  const plan = buildMusicPlan(scenario.events, { laneCount: 4 });
  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const cuePlan = createReplayCuePlan(chart.notes, { laneCount: 4 });
  const primarySession = plan[0];
  const allIntents = plan.flatMap((session) => session.intents);
  const peakTensionIntent = [...allIntents].sort((left, right) => right.tension - left.tension)[0];
  const peakResolutionIntent = pickPeakResolutionIntent(allIntents);

  return {
    id: scenario.id,
    label: scenario.label,
    provider: scenario.provider,
    sourceUrl: scenario.sourceUrl,
    listeningFocus: scenario.listeningFocus,
    sessionCount: plan.length,
    eventCount: scenario.events.length,
    cueBatchCount: cuePlan.length,
    noteCount: chart.notes.length,
    tempo: primarySession.tempo,
    motifId: primarySession.motif.motifId,
    key: primarySession.harmony.key,
    roleSequence: allIntents.map((intent) => intent.structuralRole),
    rhythmSequence: allIntents.map((intent) => intent.rhythmPattern),
    harmonySequence: allIntents.map((intent) => intent.harmonyAction),
    peakTensionEvent: describeIntent(allIntents, peakTensionIntent.eventRef),
    peakResolutionEvent: describeIntent(allIntents, peakResolutionIntent.eventRef),
    cueSummaryPreview: cuePlan.slice(0, 4).map((batch) => batch.summary),
  };
}

function describeIntent(intents, eventRef) {
  const intent = intents.find((entry) => entry.eventRef === eventRef);
  if (!intent) {
    return null;
  }

  return {
    eventRef: intent.eventRef,
    eventType: intent.eventType,
    structuralRole: intent.structuralRole,
    rhythmPattern: intent.rhythmPattern,
    harmonyAction: intent.harmonyAction,
  };
}

function pickPeakResolutionIntent(intents) {
  return [...intents].sort((left, right) => scoreResolutionIntent(right) - scoreResolutionIntent(left))[0];
}

function scoreResolutionIntent(intent) {
  let score = intent.accentLevel || 0;

  if (intent.eventType === 'merge') {
    score += 3;
  } else if (intent.eventType === 'review-approve' || intent.eventType === 'history-approved') {
    score += 2;
  } else if (intent.eventType === 'review-resolve') {
    score += 1.25;
  }

  if (intent.structuralRole === 'outro') {
    score += 1;
  } else if (intent.structuralRole === 'cadence') {
    score += 0.5;
  }

  if (intent.harmonyAction === 'resolve') {
    score += 0.5;
  }

  return score;
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
