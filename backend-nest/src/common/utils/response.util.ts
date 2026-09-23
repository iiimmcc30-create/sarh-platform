export function successResponse<T>(data: T) {
  return {
    success: true as const,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function errorResponse(
  error: string,
  messageAr: string,
  details?: unknown,
) {
  return {
    success: false as const,
    error,
    messageAr,
    ...(details !== undefined ? { details } : {}),
    timestamp: new Date().toISOString(),
  };
}
