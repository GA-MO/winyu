import { registerDom } from "./dom";
import { isolateTestData } from "./test-data";

isolateTestData();
registerDom({ actEnvironment: true });
