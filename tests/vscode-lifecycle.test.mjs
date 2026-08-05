// VS Code 확장 라이프사이클 (스펙 2026-08-05 §2) — vscode 비의존 상태 머신 검증.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../vscode-extension/lifecycle.cjs';

function createFakeEmbed() {
  const calls = [];
  let stopped = 0;
  const embed = async (options) => {
    calls.push(options);
    if (options.port === 9999) {
      throw new Error('기동 실패 시뮬레이션');
    }
    return {
      url: `http://127.0.0.1:${options.port}`,
      port: options.port,
      alreadyRunning: options.port === 8081,
      pid: options.port === 8081 ? null : 4242,
      stop: async () => {
        stopped += 1;
      },
    };
  };
  return { embed, calls, stopCount: () => stopped };
}

test('start는 running 상태가 되고 중복 start는 기존 핸들을 유지한다', async () => {
  const fake = createFakeEmbed();
  const lifecycle = createLifecycle({ embed: fake.embed });

  const first = await lifecycle.start({ port: 8080 });
  assert.equal(first.url, 'http://127.0.0.1:8080');
  assert.equal(lifecycle.status().state, 'running');
  assert.equal(lifecycle.status().url, 'http://127.0.0.1:8080');

  const second = await lifecycle.start({ port: 8080 });
  assert.equal(second, first, '이미 실행 중이면 같은 핸들 반환');
  assert.equal(fake.calls.length, 1, 'embed는 한 번만 호출');
});

test('stop 후 idle이 되고 다시 시작할 수 있다', async () => {
  const fake = createFakeEmbed();
  const lifecycle = createLifecycle({ embed: fake.embed });

  await lifecycle.start({ port: 8080 });
  await lifecycle.stop();
  assert.equal(lifecycle.status().state, 'idle');
  assert.equal(fake.stopCount(), 1);

  await lifecycle.start({ port: 8080 });
  assert.equal(lifecycle.status().state, 'running');
  assert.equal(fake.calls.length, 2);
});

test('embed 실패 시 idle을 유지하고 오류를 전파한다', async () => {
  const fake = createFakeEmbed();
  const lifecycle = createLifecycle({ embed: fake.embed });

  await assert.rejects(lifecycle.start({ port: 9999 }), /기동 실패/);
  assert.equal(lifecycle.status().state, 'idle');
});

test('재사용(alreadyRunning) 서버는 상태에 구분 표시되고 stop은 조용히 통과한다', async () => {
  const fake = createFakeEmbed();
  const lifecycle = createLifecycle({ embed: fake.embed });

  await lifecycle.start({ port: 8081 });
  const status = lifecycle.status();
  assert.equal(status.state, 'running');
  assert.equal(status.reused, true);

  await lifecycle.stop(); // 소유하지 않은 서버 — embed 핸들의 no-op stop 호출
  assert.equal(lifecycle.status().state, 'idle');
});

test('idle 상태의 stop은 아무 일도 하지 않는다', async () => {
  const fake = createFakeEmbed();
  const lifecycle = createLifecycle({ embed: fake.embed });
  await lifecycle.stop();
  assert.equal(lifecycle.status().state, 'idle');
  assert.equal(fake.stopCount(), 0);
});
