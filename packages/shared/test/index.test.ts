import { assertEnv, buildZKillRelatedUrl, deriveSpaceType, projectName } from '../src/index';

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

  it('derives space type from system ids', () => {
    expect(deriveSpaceType(30000142)).toBe('kspace');
    expect(deriveSpaceType(31000142)).toBe('jspace');
    expect(deriveSpaceType(32000142)).toBe('pochven');
  });

  it('builds related killboard urls', () => {
    const url = buildZKillRelatedUrl(31000123, new Date('2024-05-01T12:34:00Z'));
    expect(url).toBe('https://zkillboard.com/related/31000123/202405011234/');
  });
});
