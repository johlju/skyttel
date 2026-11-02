import type Database from 'better-sqlite3';

const windowMilliseconds = 60_000;
const attemptsPerWindow = 30;
const unconnectedClientLimit = 1000;

function unavailable(retryAfter: number, status = 429) {
  return Response.json(
    {
      error: 'temporarily_unavailable',
      error_description:
        'Client registration is temporarily unavailable. Retry after the indicated delay.',
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) },
    },
  );
}

export function assistantRegistrationAdmission(database: Database.Database, now: () => number) {
  // The supported installation has one application instance. Reserve capacity
  // before awaiting the provider, including while its client write is pending.
  // Completed writes can briefly count twice; this only makes admission stricter.
  let inFlight = 0;
  const admit = database.transaction(() => {
    const time = now();
    database
      .prepare('DELETE FROM assistant_registration_admission WHERE admittedAt <= ?')
      .run(time - windowMilliseconds);
    const recent = database
      .prepare(
        'SELECT count(*) AS count, min(admittedAt) AS oldest FROM assistant_registration_admission',
      )
      .get() as { count: number; oldest: number | null };
    if (recent.count >= attemptsPerWindow)
      return Math.max(1, Math.ceil(((recent.oldest ?? time) + windowMilliseconds - time) / 1000));
    database
      .prepare('INSERT INTO assistant_registration_admission (admittedAt) VALUES (?)')
      .run(time);
    const unconnected = database
      .prepare(`SELECT count(*) AS count FROM (
        SELECT 1 FROM oauthClient WHERE NOT EXISTS (
          SELECT 1 FROM assistant_connection WHERE clientId = oauthClient.clientId
        ) LIMIT ?
      )`)
      .get(unconnectedClientLimit) as { count: number };
    if (unconnected.count + inFlight >= unconnectedClientLimit) return 60;
    return 0;
  });
  return async (operation: () => Promise<Response>) => {
    // Never join the provider's asynchronous transaction on this connection.
    if (database.inTransaction) return unavailable(1, 503);
    const retryAfter = admit.immediate();
    if (retryAfter) return unavailable(retryAfter);
    inFlight++;
    try {
      return await operation();
    } finally {
      inFlight--;
    }
  };
}
