import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Tiny JSON-file store, the default when MONGO_URL is not set. Same async interface as mongoStore.js:
 *   add(entry)  list(limit)  clear()
 */
export function createJsonStore(file = config.historyFile, max = config.historyMax) {
  let rows = null, loading = null, saving = Promise.resolve(), dirReady = null;
  // one shared first read, so concurrent first calls can't overwrite each other's add / clear
  const load = () => rows ? Promise.resolve(rows) : (loading ??= fs.readFile(file, "utf8")
    .then(t => JSON.parse(t), () => [])
    .then(r => (rows ??= Array.isArray(r) ? r : [])));
  const persist = () => {
    const snapshot = JSON.stringify(rows);
    saving = saving.then(async () => {
      await (dirReady ??= fs.mkdir(path.dirname(file), { recursive: true }));
      await fs.writeFile(file, snapshot);
    }).catch(console.error);
    return saving;
  };
  return {
    kind: "json",
    async add(entry) {
      await load();
      rows.unshift({ ...entry, at: new Date().toISOString() });
      if (rows.length > max) rows.length = max;
      persist();
    },
    async list(limit = 20) { return (await load()).slice(0, limit); },
    async clear() { await load(); rows.length = 0; await persist(); },
  };
}
