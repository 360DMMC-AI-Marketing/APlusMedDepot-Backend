const SLOW_QUERY_THRESHOLD_MS = 200;

/**
 * Measure and log query execution time in development mode.
 * Logs a warning for queries exceeding 200ms threshold.
 * No-op in production to avoid performance overhead.
 *
 * @param label - Description of the query being measured
 * @param queryFn - Async function that performs the query
 * @returns The result of the query function
 */
export async function timeQuery<T>(label: string, queryFn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== "development") {
    return queryFn();
  }

  const start = performance.now();
  const result = await queryFn();
  const duration = Math.round((performance.now() - start) * 100) / 100;

  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    console.warn(`[SLOW QUERY] ${label}: ${duration}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
  }

  return result;
}
