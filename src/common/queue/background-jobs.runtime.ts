export function areBackgroundJobsEnabled(): boolean {
  return process.env.ENABLE_BACKGROUND_JOBS !== 'false';
}
