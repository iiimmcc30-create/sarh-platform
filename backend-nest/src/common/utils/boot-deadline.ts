/** Fail a startup connection instead of leaving the process stuck. */
export function withBootDeadline<T>(
  task: Promise<T>,
  label: string,
  ms = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms during startup`));
    }, ms);
  });
  return Promise.race([task, deadline]).finally(() => clearTimeout(timer));
}
