export type AppActiveMode = 'USER';

/** Sarh has a single app mode; any stored legacy value resolves to USER. */
export function parseActiveMode(_value: unknown): AppActiveMode {
  return 'USER';
}
