import { registerDom } from "./dom";
import { isolateTestData, withoutEmbeddingModel, withoutPaidModels } from "./test-data";

withoutPaidModels();
await isolateTestData();
await withoutEmbeddingModel();
registerDom({ actEnvironment: true });
