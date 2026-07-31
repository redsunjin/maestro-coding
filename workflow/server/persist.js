// 원자적 JSON 파일 스토어 (본체 persistHistoryStore 패턴 이식: temp 쓰기 후 rename).
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export function saveStore(storePath, payload) {
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(
      tempPath,
      `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), ...payload }, null, 2)}\n`,
      'utf8',
    );
    renameSync(tempPath, storePath);
    return true;
  } catch (error) {
    try {
      rmSync(tempPath, { force: true });
    } catch {}
    console.error(`store save failed (${storePath}): ${error.message}`);
    return false;
  }
}

export function loadStore(storePath) {
  if (!existsSync(storePath)) return null;
  try {
    return JSON.parse(readFileSync(storePath, 'utf8'));
  } catch (error) {
    console.error(`store load failed (${storePath}): ${error.message}`);
    return null;
  }
}
