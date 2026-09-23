export function resolveDevServiceUrl(_env: string | undefined, port: number): string {
  return `http://127.0.0.1:${port}`;
}
