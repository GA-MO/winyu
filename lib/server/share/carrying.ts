import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { holdingHop, type Matter } from "@/lib/share/matter";
import { shares } from "./shares";

/** The open matter that already carries this alert, whoever sent it: the alert is being handled and needs no second one. */
export function openMatterCarrying(alertId: string): Matter | null {
  return shares().all().find((matter) => matter.status === "open" && matter.alertIds.includes(alertId)) ?? null;
}

/** How an alert that went out as a matter is being handled, for everyone but the one holding it: who sent it to whom, or that the viewer did. */
export function handedOffNote(alertId: string, viewerId: string): string | null {
  const matter = openMatterCarrying(alertId);
  const holder = matter ? holdingHop(matter) : null;
  if (!matter || !holder || holder.userId === viewerId) return null;
  const to = findUser(holder.userId)?.nameTh ?? holder.userId;
  return matter.senderId === viewerId ? TH.team.youHandedOff(to) : TH.team.handedOff(findUser(matter.senderId)?.nameTh ?? matter.senderId, to);
}

/** The matter one person sent about any of these alerts, and who holds it now. */
export function sentAbout(senderId: string, alertIds: ReadonlySet<string>): { matter: Matter; holderId: string } | null {
  const matter = shares().all().find((entry) => entry.senderId === senderId && entry.alertIds.some((id) => alertIds.has(id)));
  const holder = matter ? holdingHop(matter) : null;
  return matter && holder ? { matter, holderId: holder.userId } : null;
}
