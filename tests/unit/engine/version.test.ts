import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../../src/engine/version';

describe('ENGINE_VERSION', () => {
  it('is a positive integer that cached features are tagged with', () => {
    expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
    expect(ENGINE_VERSION).toBe(1);
  });
});
