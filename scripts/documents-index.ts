import { indexDocuments } from "@/lib/server/documents/index-documents";
import { DOCUMENTS_DIR } from "@/lib/server/documents/corpus";

const started = performance.now();
const report = await indexDocuments();
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`docs:index ${DOCUMENTS_DIR} with ${report.embedder}: ${report.total} sections, ${report.embedded} embedded, ${report.unchanged} unchanged, ${report.removed} removed (${seconds} s)`);
for (const file of report.broken) console.error(`  skipped ${file.file}: ${file.reason}`);
process.exit(report.broken.length > 0 ? 1 : 0);
