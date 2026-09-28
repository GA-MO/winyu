import { registerDom } from "./dom";
import { isolateTestData, withoutPaidModels } from "./test-data";

withoutPaidModels();
isolateTestData();
registerDom({ actEnvironment: true });
