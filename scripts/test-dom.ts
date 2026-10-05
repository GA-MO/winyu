import { registerDom } from "./dom";
import { isolateTestData, withoutPaidModels } from "./test-data";

withoutPaidModels();
await isolateTestData();
registerDom({ actEnvironment: true });
