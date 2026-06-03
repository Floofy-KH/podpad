export function logInfo(message: string): void {
  console.log(`[info] ${message}`);
}

export function logSuccess(message: string): void {
  console.log(`[ok] ${message}`);
}

export function logError(message: string): void {
  console.error(`[error] ${message}`);
}