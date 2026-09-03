import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

/** postgres.js 클라이언트. 앱 전체에서 하나를 공유한다. */
export function createSql(databaseUrl: string): Sql {
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    // jsonb 컬럼은 자동 파싱, bigint 는 number 로 (용량 합계가 2^53 을 넘지 않는다)
    transform: { undefined: null },
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number) => String(v),
        parse: (v: string) => Number(v),
      },
    },
  });
}
