export type AppActiveMode = 'USER' | 'BUTCHER';

export function parseActiveMode(value: unknown): AppActiveMode {
  return value === 'BUTCHER' ? 'BUTCHER' : 'USER';
}
