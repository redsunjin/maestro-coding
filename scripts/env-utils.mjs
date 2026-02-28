import { existsSync, readFileSync } from 'node:fs';

export function parseEnvContent(content) {
  const values = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = rawLine.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function readEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return { found: false, values: {} };
  }

  const content = readFileSync(envFilePath, 'utf8');
  return { found: true, values: parseEnvContent(content) };
}
