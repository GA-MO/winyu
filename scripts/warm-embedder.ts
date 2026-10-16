import { currentEmbedder } from "../lib/server/recall/embedder";

const vector = await currentEmbedder().query("warm");
console.log(`warm-embedder: ${currentEmbedder().id} ready, ${vector.length} dimensions`);
