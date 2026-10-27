// The USL runner must send a multi-table COMPILE USL as one request
// (Zetaris rejects it split on ";") and every other statement on its own.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ROOT } from "../src/env.ts";
import { splitStatements } from "../scripts/zetaris-usl.ts";

test("COMPILE USL keeps its CREATE TABLEs; other statements split on a trailing ';'", () => {
  const sql = `-- header\n\n-- make it\nCREATE NAMESPACE IF NOT EXISTS lightning.metastore.x;\nCOMPILE USL m DEPLOY NAMESPACE lightning.metastore.x DDL\nCREATE TABLE a (\n  id int NOT NULL PRIMARY KEY\n);\nCREATE TABLE b (\n  id int NOT NULL PRIMARY KEY,\n  a_id int FOREIGN KEY REFERENCES a(id)\n);\n\n-- activate a\nACTIVATE USL TABLE lightning.metastore.x.m.a AS\nSELECT 1 AS id;\n`;
  const s = splitStatements(sql);
  assert.equal(s.length, 3);
  assert.equal(s[0].comment, "make it");
  assert.match(s[1].sql, /^COMPILE USL m[\s\S]*CREATE TABLE a[\s\S]*;\nCREATE TABLE b[\s\S]*REFERENCES a\(id\)\n\)$/);
  assert.equal(s[2].comment, "activate a");
  assert.ok(!s[2].sql.endsWith(";"));
});

test("data/zetaris/usl_create.sql compiles all five USL tables in one statement", () => {
  const s = splitStatements(fs.readFileSync(path.join(ROOT, "data/zetaris/usl_create.sql"), "utf-8"));
  const compile = s.filter((x) => /^COMPILE USL/i.test(x.sql));
  assert.equal(compile.length, 1);
  assert.equal((compile[0].sql.match(/CREATE TABLE/gi) ?? []).length, 5);
  assert.ok(s.some((x) => /^REGISTER DQ tracking_coverage_90/.test(x.sql)));
  assert.ok(s.some((x) => /^RUN DQ tracking_coverage_90/.test(x.sql)));
});
