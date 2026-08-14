import { afterEach, describe, expect, test } from 'vitest';
import { isNativeShell } from './nativeShell.js';

describe('isNativeShell', () => {
  afterEach(() => {
    delete window.Capacitor;
  });

  test('Capacitor 전역이 없으면 false', () => {
    expect(isNativeShell()).toBe(false);
  });

  test('Capacitor.isNativePlatform()이 false면 false', () => {
    window.Capacitor = { isNativePlatform: () => false };
    expect(isNativeShell()).toBe(false);
  });

  test('Capacitor.isNativePlatform()이 true면 true', () => {
    window.Capacitor = { isNativePlatform: () => true };
    expect(isNativeShell()).toBe(true);
  });
});
