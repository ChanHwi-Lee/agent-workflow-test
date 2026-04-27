import type pg from "pg";

// PostgreSQL advisory lock 으로 critical section 을 직렬화한다.
// drizzle-orm 의 migrate() 가 다중 instance 동시 실행을 보호하지 않으므로
// (drizzle-orm issue #874) multi-replica 환경에서 boot 시 race 를 방지하기 위해
// migrate 호출을 이 helper 로 감싼다. fn 이 throw 해도 unlock + client release 보장.
export async function runWithAdvisoryLock<T>(
  pool: pg.Pool,
  lockKey: number,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [lockKey]);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
    }
  } finally {
    client.release();
  }
}
