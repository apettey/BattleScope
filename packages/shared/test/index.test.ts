import { assertEnv, projectName } from '../src/index';

describe('shared package', () => {
  it('exports project name', () => {
    expect(projectName).toBe('BattleScope');
  });

  it('assertEnv returns existing value', () => {
    process.env.FOO = 'bar';
    expect(assertEnv('FOO')).toBe('bar');
    delete process.env.FOO;
  });

  it('assertEnv throws when missing', () => {
    expect(() => assertEnv('MISSING')).toThrowError(/Missing required environment variable/);
  });
});
