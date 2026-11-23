import { createApp } from "./app.js";
import { config } from "./config.js";
import { createJsonStore } from "./services/historyStore.js";
import { createMongoStore } from "./services/mongoStore.js";
import { attachWs } from "./ws.js";

async function historyStore() {
  if (!config.mongoUrl) return createJsonStore();
  try {
    const store = await createMongoStore();
    console.log("history -> MongoDB");
    return store;
  } catch (e) {
    console.warn(`MongoDB unavailable (${e.message}) - falling back to ${config.historyFile}`);
    return createJsonStore();
  }
}

const history = await historyStore();
const server = createApp({ history }).listen(config.port, () =>
  console.log(`SignBridge backend on :${config.port} (ws /ws) -> ml-server ${config.mlUrl} · history: ${history.kind}`));
attachWs(server, { history });
