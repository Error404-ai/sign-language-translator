// Same contract for both history stores. The MongoDB case runs only when MONGO_URL is set:
//   MONGO_URL=mongodb://127.0.0.1:27017/signbridge_test npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createJsonStore } from "../src/services/historyStore.js";
import { createMongoStore } from "../src/services/mongoStore.js";

async function contract(store) {
  await store.clear();
  for (let i = 0; i < 5; i++) await store.add({ mode: "words", label: `s${i}`, confidence: 0.9 });
  const rows = await store.list(10);
  assert.deepEqual(rows.map(r => r.label), ["s4", "s3", "s2"]);        // newest first, trimmed to max = 3
  assert.equal(rows[0].mode, "words");
  assert.ok(!Number.isNaN(Date.parse(rows[0].at)));
  assert.equal((await store.list(1)).length, 1);
  await store.clear();
  assert.deepEqual(await store.list(), []);
}

test("json store", () => contract(createJsonStore(path.join(os.tmpdir(), `sb-store-${process.pid}.json`), 3)));

test("mongo store", { skip: !process.env.MONGO_URL && "set MONGO_URL to run" }, async () => {
  const store = await createMongoStore(process.env.MONGO_URL, { max: 3 });
  try { await contract(store); } finally { await store.close(); }
});

test("json store: concurrent first calls don't lose adds or undo a clear", async () => {
  const fs = await import("node:fs/promises");
  const file = path.join(os.tmpdir(), `sb-race-${process.pid}.json`);
  await fs.writeFile(file, JSON.stringify([{ mode: "words", label: "old", confidence: 1, at: new Date().toISOString() }]));
  let store = createJsonStore(file, 10);
  await Promise.all([store.add({ mode: "words", label: "a", confidence: 1 }), store.add({ mode: "words", label: "b", confidence: 1 })]);
  assert.deepEqual((await store.list()).map(r => r.label).sort(), ["a", "b", "old"]);
  store = createJsonStore(file, 10);
  await Promise.all([store.list(), store.clear()]);
  assert.deepEqual(await store.list(), []);
  await fs.rm(file, { force: true });
});
