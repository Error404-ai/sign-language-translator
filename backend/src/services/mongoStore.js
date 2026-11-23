import { MongoClient } from "mongodb";
import { config } from "../config.js";

/**
 * MongoDB history store, same interface as the JSON store: add(entry)  list(limit)  clear().
 * Newest first by _id (ObjectIds increase with insertion time). Only the newest `max` are kept.
 */
export async function createMongoStore(url = config.mongoUrl, { max = config.historyMax, dbName, timeoutMs = 3000 } = {}) {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: timeoutMs });
  await client.connect();                                   // throws fast if the server isn't reachable
  const col = client.db(dbName).collection("history");      // database from the URL path ("test" if none)
  const newest = { _id: -1 };
  const trim = async () => {
    const cut = await col.find({}, { projection: { _id: 1 } }).sort(newest).skip(max).limit(1).next();
    if (cut) await col.deleteMany({ _id: { $lte: cut._id } });
  };

  return {
    kind: "mongo",
    async add(entry) {
      await col.insertOne({ ...entry, at: new Date() });
      trim().catch(e => console.warn("history trim:", e.message));   // off the request path; list() caps at max
    },
    async list(limit = 20) {
      const rows = await col.find({}, { projection: { _id: 0 } }).sort(newest).limit(Math.min(limit, max)).toArray();
      return rows.map(r => ({ ...r, at: r.at.toISOString() }));
    },
    async clear() { await col.deleteMany({}); },
    close: () => client.close(),
  };
}
