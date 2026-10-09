import type { NotificationKind } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { personaOf } from "@/lib/server/portraits";
import { notificationTitle } from "@/lib/share/notification-kinds";
import { targetOf, type Moments, type NotifyItem, type Person } from "./items";

export const VIEWERS = ["u_krit", "u_thana"] as const;
export type ViewerId = (typeof VIEWERS)[number];

const MINUTE_MS = 60_000;
const GRANT_DAYS = 3;
const ALL_SALES = "มูลค่าขายเข้า · ทุกภาค · ทุกแบรนด์";

type Seed = { kind: NotificationKind; from: string | null; title: string; minutesAgo: number; read: boolean; refId: string };

function personOf(userId: string | null): Person | null {
  const user = userId ? findUser(userId) : undefined;
  if (!user) return null;
  const persona = personaOf(user);
  return { name: persona.nameTh, photo: persona.photo };
}

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function seedsFor(viewer: ViewerId, now: Date): { one: Seed[]; mix: Seed[] } {
  const until = formatDateTh(new Date(now.getTime() + GRANT_DAYS * 24 * 60 * MINUTE_MS));
  if (viewer === "u_thana") {
    const request: Seed = { kind: "grant_request", from: "u_krit", title: notificationTitle({ kind: "grant_request", refId: "", requesterName: nameOf("u_krit"), slice: ALL_SALES }), minutesAgo: 8, read: false, refId: "49b43e25" };
    return {
      one: [request],
      mix: [
        request,
        { kind: "share", from: "u_prasit", title: notificationTitle({ kind: "share", refId: "", senderName: nameOf("u_prasit"), cardTitle: "การบรรลุเป้าหมาย", grantUntil: null }), minutesAgo: 31, read: false, refId: "Qm2rTa8LwX1c" },
        { kind: "handoff", from: "u_siriporn", title: TH.handoff.newFrom(nameOf("u_siriporn"), "ทบทวนงบแคมเปญไตรมาส 4"), minutesAgo: 130, read: true, refId: "p-siriporn-q4" },
        { kind: "alert", from: null, title: TH.watch.fired("สต๊อกคงเหลือ คลังกลาง", "ต่ำกว่าเกณฑ์"), minutesAgo: 320, read: true, refId: "w-stock" },
        { kind: "share", from: "u_ben", title: notificationTitle({ kind: "share", refId: "", senderName: nameOf("u_ben"), cardTitle: "งบแคมเปญที่ใช้", grantUntil: null }), minutesAgo: 1500, read: true, refId: "Bn4cPq9ZsE2k" },
      ],
    };
  }
  const handoff: Seed = { kind: "handoff", from: "u_anucha", title: TH.handoff.newFrom(nameOf("u_anucha"), "อุบลศรีสุข เทรดดิ้ง แทบไม่สั่งสินค้า"), minutesAgo: 12, read: false, refId: "c86b39f7" };
  return {
    one: [handoff],
    mix: [
      handoff,
      { kind: "share", from: "u_thana", title: notificationTitle({ kind: "share", refId: "", senderName: nameOf("u_thana"), cardTitle: "มูลค่าขายเข้า", grantUntil: until }), minutesAgo: 40, read: false, refId: "79o8IcRiPzQy" },
      { kind: "grant_approved", from: "u_thana", title: notificationTitle({ kind: "grant_approved", refId: "", approverName: nameOf("u_thana"), slice: ALL_SALES, until }), minutesAgo: 64, read: true, refId: "79o8IcRiPzQy" },
      { kind: "alert", from: null, title: TH.watch.fired("มูลค่าขายเข้า ขอนแก่น", "ต่ำกว่าเป้า"), minutesAgo: 190, read: true, refId: "w-khonkaen" },
      { kind: "email", from: "u_pim", title: TH.notifyUi.email("แผนออกบูธงานบุญบั้งไฟ"), minutesAgo: 1460, read: true, refId: "m-pim" },
    ],
  };
}

function itemOf(seed: Seed, index: number, now: Date): NotifyItem {
  return {
    id: `${seed.kind}-${index}`,
    kind: seed.kind,
    title: seed.title,
    person: personOf(seed.from),
    at: new Date(now.getTime() - seed.minutesAgo * MINUTE_MS).toISOString(),
    read: seed.read,
    target: targetOf(seed.kind, seed.refId),
  };
}

/** What the viewer would have been told, written with the real title builders, names and card titles; the live store holds too few to show every moment. */
export function momentsFor(viewer: ViewerId, now: Date): Moments {
  const seeds = seedsFor(viewer, now);
  return { one: seeds.one.map((seed, index) => itemOf(seed, index, now)), mix: seeds.mix.map((seed, index) => itemOf(seed, index, now)) };
}

export function viewerPerson(viewer: ViewerId): Person {
  return personOf(viewer) ?? { name: viewer, photo: null };
}
