/**
 * Run an async task over every item, a bounded number at a time.
 *
 * The alternative people reach for is a `for … of` with an `await` inside, which is one request
 * at a time: a bulk action over 200 members became 400 serial round-trips and minutes of a
 * blocked spinner. `Promise.all` over the whole list is the opposite failure — 400 requests at
 * once will trip rate limits and can exhaust the browser's per-host connection pool.
 *
 * Results come back in INPUT ORDER regardless of completion order, so a caller can pair them
 * back up with the items it passed in.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const effectiveLimit = Math.max(1, Math.min(Math.floor(limit), items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  // Each worker pulls the next index rather than taking a fixed slice, so one slow item does
  // not leave a whole shard idle behind it.
  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: effectiveLimit }, worker));
  return results;
}
