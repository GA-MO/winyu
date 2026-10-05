"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { indexDocuments } from "@/lib/server/documents/index-documents";
import { readUser } from "@/lib/server/session";

const DOCUMENTS_TAB = "/admin";

/** Re-reads the documents folder and brings the search index to match it; IT admins only. */
export async function reindexDocumentsAction() {
  const user = readUser(await cookies());
  if (!user || user.role !== "it_admin") return;
  await indexDocuments();
  revalidatePath(DOCUMENTS_TAB);
}
