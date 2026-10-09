import { TH } from "@/lib/i18n/th";
import { Popover, Sheet } from "./direction-a";
import { DigestLine } from "./direction-b";
import { SharedPage } from "./direction-c";
import { Frame, Landing, type Shell } from "./frame";
import type { Moments, NotifyItem } from "./items";

const COPY = TH.notifyUi;
const DIGEST_PHRASES = 3;

/** D: B's sentence under the greeting, A's popover behind the bell and "ดูทั้งหมด", C's activity history on Shared; nothing pops up on its own. */
export function DirectionD({ moments, shell }: { moments: Moments; shell: (items: NotifyItem[]) => Shell }) {
  const empty = shell([]);
  const mix = shell(moments.mix);
  return (
    <>
      <Frame label={COPY.states.empty} shell={empty}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={[]} limit={DIGEST_PHRASES} seeAll="popover" />
        </Landing>
      </Frame>
      <Frame label={COPY.states.one} shell={shell(moments.one)}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={moments.one} limit={DIGEST_PHRASES} seeAll="popover" />
        </Landing>
      </Frame>
      <Frame label={COPY.states.mix} shell={mix}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={moments.mix} limit={DIGEST_PHRASES} seeAll="popover" />
        </Landing>
      </Frame>
      <Frame label={COPY.states.mixOpen} shell={mix} bellPressed overlay={<Popover items={moments.mix} />}>
        <Landing viewer={empty.viewer}>
          <DigestLine items={moments.mix} limit={DIGEST_PHRASES} seeAll="popover" open />
        </Landing>
      </Frame>
      <Frame label={COPY.states.mobile} shell={mix} mobile bellPressed overlay={<Sheet items={moments.mix} />}>
        <Landing viewer={empty.viewer} compact>
          <DigestLine items={moments.mix} limit={DIGEST_PHRASES} seeAll="popover" open />
        </Landing>
      </Frame>
      <Frame label={COPY.states.mixShared} shell={mix} on="shared">
        <SharedPage items={moments.mix} waiting={mix.bell} />
      </Frame>
    </>
  );
}
