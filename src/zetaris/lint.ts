// Query lint: catches SQL that would run fine but return wrong numbers, and
// tells the model how to rewrite it. Runs before anything reaches Zetaris.

/** Timestamp columns in the WhyBot sources. */
const TIMESTAMP_COLUMNS = ["created_at", "changed_at", "released_at"];

export function lintSql(sql: string): string | undefined {
  const s = sql.replace(/'[^']*'/g, "''");

  // Zetaris 2.4.3.1: when one query reads the same JDBC table twice with
  // different filters (two CTEs, two subqueries, a self-join), every read
  // returns the rows of the first filter. Verified against Postgres; see
  // docs/ZETARIS_FINDINGS.md.
  const refs = [...s.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => m[1].toLowerCase());
  const repeated = [...new Set(refs.filter((t, i) => refs.indexOf(t) !== i))];
  if (repeated.length) {
    return (
      `Rejected before running: this query reads ${repeated.join(", ")} more than once. Zetaris returns the first read's rows for every read of the same table, ` +
      `so period comparisons come back identical. Read each table once and compare periods in a single pass, e.g. ` +
      `SUM(CASE WHEN signup_date >= DATE '2026-10-12' THEN signups END) AS last_week, SUM(CASE WHEN signup_date < DATE '2026-10-12' THEN signups END) AS prior_week.`
    );
  }

  for (const col of TIMESTAMP_COLUMNS) {
    const between = new RegExp(`\\b${col}\\s+between\\s+date\\b`, "i");
    const upper = new RegExp(`\\b${col}\\s*<=\\s*date\\b`, "i");
    if (between.test(s) || upper.test(s)) {
      return `Rejected before running: ${col} is a timestamp, so comparing it to a DATE upper bound drops most of the last day. Use to_date(${col}) BETWEEN DATE '...' AND DATE '...'.`;
    }
  }
  return undefined;
}
