// Maestro Coding VS Code 확장 진입점 — lib/server-embed.mjs 소비자 (스펙 2026-08-05).
// 서버 소유권 의미는 embed 핸들 그대로: 재사용한 서버는 stop해도 건드리지 않는다.
const path = require('node:path');
const vscode = require('vscode');
const { createLifecycle } = require('./lifecycle.cjs');

const EMBED_PATH = path.resolve(__dirname, '..', 'lib', 'server-embed.mjs');

let lifecycle = null;
let outputChannel = null;
let statusBarItem = null;

function refreshStatusBar() {
  const status = lifecycle.status();
  if (status.state === 'running') {
    statusBarItem.text = `$(play) Maestro ${status.port}${status.reused ? ' (재사용)' : ''}`;
    statusBarItem.tooltip = `Maestro 서버 실행 중 — ${status.url}`;
    statusBarItem.command = 'maestro.openDashboard';
  } else {
    statusBarItem.text = '$(circle-slash) Maestro';
    statusBarItem.tooltip = 'Maestro 서버 꺼짐 — 클릭하여 시작';
    statusBarItem.command = 'maestro.startServer';
  }
  statusBarItem.show();
}

function resolveRepoPath() {
  const configured = vscode.workspace.getConfiguration('maestro').get('repoPath');
  if (configured) return configured;
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || undefined;
}

async function startServer() {
  const port = vscode.workspace.getConfiguration('maestro').get('port') || 8080;
  const repoPath = resolveRepoPath();
  try {
    const handle = await lifecycle.start({
      port,
      repoPath,
      onLog: (line) => outputChannel.appendLine(line),
    });
    refreshStatusBar();
    const reuseNote = handle.alreadyRunning ? ' (기존 서버 재사용)' : '';
    const action = await vscode.window.showInformationMessage(
      `Maestro 서버 실행 중 — ${handle.url}${reuseNote}`,
      '대시보드 열기',
    );
    if (action === '대시보드 열기') {
      await openDashboard();
    }
  } catch (error) {
    outputChannel.appendLine(String(error?.message || error));
    vscode.window.showErrorMessage(`Maestro 서버 시작 실패: ${error?.message || error}`);
  }
}

async function stopServer() {
  await lifecycle.stop();
  refreshStatusBar();
  vscode.window.showInformationMessage('Maestro 서버를 중지했습니다.');
}

async function openDashboard() {
  const status = lifecycle.status();
  if (status.state !== 'running') {
    const action = await vscode.window.showWarningMessage('Maestro 서버가 꺼져 있습니다.', '서버 시작');
    if (action === '서버 시작') await startServer();
    return;
  }
  try {
    // 에디터 안 Simple Browser 우선, 실패 시 외부 브라우저
    await vscode.commands.executeCommand('simpleBrowser.show', status.url);
  } catch {
    await vscode.env.openExternal(vscode.Uri.parse(status.url));
  }
}

async function activate(context) {
  const { startMaestroServer } = await import(EMBED_PATH);
  lifecycle = createLifecycle({ embed: startMaestroServer });
  outputChannel = vscode.window.createOutputChannel('Maestro');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  refreshStatusBar();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    vscode.commands.registerCommand('maestro.startServer', startServer),
    vscode.commands.registerCommand('maestro.stopServer', stopServer),
    vscode.commands.registerCommand('maestro.openDashboard', openDashboard),
    vscode.commands.registerCommand('maestro.showLogs', () => outputChannel.show(true)),
  );
}

async function deactivate() {
  if (lifecycle) await lifecycle.stop();
}

module.exports = { activate, deactivate };
