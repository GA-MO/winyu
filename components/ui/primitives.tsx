import { Children, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import { cn } from "./cn";

type CardProps = {
  title?: string | null;
  description?: string | null;
  meta?: string | null;
  footnote?: string | null;
};

export function Card({
  props,
  children,
}: {
  props: CardProps;
  children?: ReactNode;
}) {
  const hasChildren = Children.toArray(children).length > 0;
  const hasHeader = Boolean(props.title || props.description || props.meta);
  return (
    <div className="@container/ui w-full min-w-0">
    <section className="flex w-full min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-3.5 shadow-[0_1px_2px_var(--ui-card-edge),0_14px_34px_-22px_var(--ui-glow-soft)] transition duration-300 hover:border-border hover:shadow-[0_1px_2px_var(--ui-card-edge),0_22px_46px_-24px_var(--ui-glow)] @md/ui:p-4">
      {hasHeader ? (
        <header className={cn("flex flex-col gap-0.5", hasChildren && "mb-3")}>
          {props.title ? (
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
              {props.title}
            </h3>
          ) : null}
          {props.meta ? (
            <p className="text-xs tabular-nums text-muted-foreground/90">{props.meta}</p>
          ) : null}
          {props.description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{props.description}</p>
          ) : null}
        </header>
      ) : null}
      {hasChildren ? (
        <div className="flex w-full min-w-0 flex-col gap-3 [&>*]:min-w-0">{children}</div>
      ) : null}
      {props.footnote ? (
        <p className="mt-3 border-t border-border/60 pt-2.5 text-[11px] leading-normal text-muted-foreground/80">
          {props.footnote}
        </p>
      ) : null}
    </section>
    </div>
  );
}

export type MetricTrend = "up" | "down" | "neutral";
export type MetricTone = "good" | "bad" | "neutral";

export type MetricProps = {
  label: string;
  value: string;
  detail?: string | null;
  trend?: MetricTrend | null;
  tone?: MetricTone | null;
  delta?: string | null;
  note?: string | null;
  size?: "sm" | "md" | "lg" | null;
};

const trendClass = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-muted-foreground",
} as const;

const deltaPillClass = {
  good: "bg-success/12 text-success",
  bad: "bg-danger/12 text-danger",
  neutral: "bg-muted text-muted-foreground",
} as const;

const TrendArrow = { up: ArrowUpRight, down: ArrowDownRight, neutral: Minus } as const;

const TREND_TONE = { up: "good", down: "bad", neutral: "neutral" } as const;

function toneOf(trend: MetricTrend | null | undefined, tone: MetricTone | null | undefined): MetricTone {
  if (tone) return tone;
  return TREND_TONE[trend ?? "neutral"];
}

const metricValueClass = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-[1.875rem] @md/ui:text-[2.125rem]",
} as const;

export function DeltaPill({
  delta,
  trend,
  tone,
  size = "md",
}: {
  delta: string;
  trend?: MetricTrend | null;
  tone?: MetricTone | null;
  size?: "sm" | "md";
}) {
  const Arrow = TrendArrow[trend ?? "neutral"];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full font-semibold tabular-nums",
        deltaPillClass[toneOf(trend, tone)],
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
      )}
    >
      <Arrow size={size === "sm" ? 11 : 13} strokeWidth={2.5} aria-hidden />
      {delta}
    </span>
  );
}

export function Metric({ props }: { props: MetricProps }) {
  const size = props.size ?? "md";
  const hero = size === "lg";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        !hero && "rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5",
      )}
    >
      <p className="break-words text-xs font-medium text-muted-foreground">{props.label}</p>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "break-words font-semibold leading-none tracking-tight tabular-nums text-foreground",
            metricValueClass[size],
          )}
        >
          {props.value}
        </span>
        {props.delta ? <DeltaPill delta={props.delta} trend={props.trend} tone={props.tone} /> : null}
        {props.detail ? (
          <span
            className={cn(
              "break-words text-xs font-medium",
              props.delta || !props.trend ? "text-muted-foreground" : trendClass[toneOf(props.trend, props.tone)],
            )}
          >
            {props.detail}
          </span>
        ) : null}
      </div>
      {props.note ? (
        <p className="break-words text-[11px] leading-normal text-muted-foreground/80">{props.note}</p>
      ) : null}
    </div>
  );
}

export type BadgeProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | null;
};

const badgeTone = {
  neutral: "bg-muted text-foreground/85",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
} as const;

export function Badge({ props }: { props: BadgeProps }) {
  const tone = props.tone ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
        badgeTone[tone],
      )}
    >
      {props.label}
    </span>
  );
}

export type AlertProps = {
  title?: string | null;
  body?: string | null;
  tone?: "info" | "success" | "warning" | "danger" | null;
  meta?: string | null;
};

const alertTone = {
  info: "border-primary/20 bg-primary/[0.06]",
  success: "border-success/25 bg-success/[0.07]",
  warning: "border-warning/25 bg-warning/[0.08]",
  danger: "border-danger/25 bg-danger/[0.07]",
} as const;

const alertDot = {
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

export function Alert({ props }: { props: AlertProps }) {
  const tone = props.tone ?? "info";
  return (
    <div className={cn("flex w-full min-w-0 gap-2.5 rounded-xl border px-3 py-2.5 text-sm text-foreground", alertTone[tone])}>
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", alertDot[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        {props.title ? (
          <p className="text-[13px] font-semibold leading-snug">{props.title}</p>
        ) : null}
        {props.meta ? (
          <p className="mt-0.5 text-xs font-medium tabular-nums text-muted-foreground">{props.meta}</p>
        ) : null}
        {props.body ? (
          <p className={cn((props.title || props.meta) && "mt-1", "text-[13px] leading-relaxed text-muted-foreground")}>
            {props.body}
          </p>
        ) : null}
      </div>
    </div>
  );
}


export type ColumnTone = "default" | "muted" | "delta";

export type TableColumn = {
  key: string;
  label: string;
  align?: "start" | "end" | null;
  tone?: ColumnTone | null;
};

export type TableProps = {
  columns?: TableColumn[] | null;
  rows?: Array<Record<string, string | number>> | null;
};

const columnToneClass = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  delta: "",
} as const;

function signTone(value: string | number): string {
  const text = String(value).trim();
  if (text.startsWith("-")) return "text-danger";
  if (text.startsWith("+")) return "text-success";
  return "text-muted-foreground";
}

function cellClass(column: TableColumn, value: string | number): string {
  const tone = column.tone ?? "default";
  if (tone === "delta") return cn("font-medium tabular-nums", signTone(value));
  return columnToneClass[tone];
}

export function Table({ props }: { props: TableProps }) {
  const columns = props.columns ?? [];
  const rows = props.rows ?? [];

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/70">
      <table className="min-w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border/70 bg-muted/40">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground",
                  column.align === "end" && "text-right",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border/50 transition-colors first:border-t-0 hover:bg-muted/40">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-2 align-middle",
                    column.align === "end" && "text-right tabular-nums",
                    cellClass(column, row[column.key] ?? ""),
                  )}
                >
                  {row[column.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type RankItem = {
  label: string;
  value: string;
  share?: number | null;
  delta?: string | null;
  trend?: MetricTrend | null;
  tone?: MetricTone | null;
  note?: string | null;
};

export type RankListProps = {
  items?: RankItem[] | null;
  showRank?: boolean | null;
};

function barWidth(share: number | null | undefined): string {
  if (typeof share !== "number" || Number.isNaN(share)) return "0%";
  return `${Math.max(2, Math.min(100, share * 100))}%`;
}

export function RankList({ props }: { props: RankListProps }) {
  const items = props.items ?? [];
  const showRank = props.showRank ?? false;
  return (
    <ol className="flex w-full min-w-0 flex-col gap-2.5">
      {items.map((item, index) => (
        <li key={`${index}-${item.label}`} className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            {showRank ? (
              <span className="w-4 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground/70">
                {index + 1}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.label}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{item.value}</span>
            {item.delta ? <DeltaPill delta={item.delta} trend={item.trend} tone={item.tone} size="sm" /> : null}
          </div>
          <div className={cn("mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted", showRank && "ml-6 w-[calc(100%-1.5rem)]")}>
            <div className="h-full rounded-full bg-chart-1/80" style={{ width: barWidth(item.share) }} />
          </div>
          {item.note ? (
            <p className={cn("mt-1 truncate text-[11px] text-muted-foreground/80", showRank && "ml-6")}>{item.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary" | null;
};

export function Button({ props, onPress }: { props: ButtonProps; onPress?: () => void }) {
  const variant = props.variant ?? "primary";
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "inline-flex min-h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        variant === "primary"
          ? "bg-gradient-to-r from-primary to-brand-violet text-white shadow-[0_10px_24px_-12px_var(--ui-glow-strong)] hover:brightness-105"
          : "border border-border bg-card text-foreground/85 hover:bg-muted",
      )}
    >
      {props.label}
    </button>
  );
}

export type ImageProps = {
  src: string;
  alt: string;
  caption?: string | null;
  aspect?: "wide" | "banner" | "square" | "tall" | null;
};

const aspectClass = {
  wide: "aspect-[16/9]",
  banner: "aspect-[21/9]",
  square: "aspect-square",
  tall: "aspect-[3/4]",
} as const;

export function Image({ props }: { props: ImageProps }) {
  const aspect = props.aspect ?? "wide";
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card">
      <img
        src={props.src}
        alt={props.alt}
        className={cn("w-full object-cover", aspectClass[aspect])}
      />
      {props.caption ? (
        <figcaption className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {props.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export type TimelineProps = {
  items?: Array<{
    title: string;
    detail?: string | null;
    time?: string | null;
  }> | null;
};

export function Timeline({ props }: { props: TimelineProps }) {
  const items = props.items ?? [];
  return (
    <ol className="space-y-0">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`} className="relative flex gap-3 pb-3.5 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="mt-1 size-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
            {index < items.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              {item.time ? (
                <p className="text-xs text-muted-foreground/70">{item.time}</p>
              ) : null}
            </div>
            {item.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type AvatarProps = {
  name: string;
  role?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg" | null;
};

const avatarSize = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
} as const;

export type ListItemBadge = { label: string; tone?: "neutral" | "success" | "warning" | "danger" | null };

export type ListItemProps = {
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  src?: string | null;
  media?: "avatar" | "thumb" | "none" | null;
  badges?: ListItemBadge[] | null;
  trailing?: string | null;
  trailingTone?: "good" | "bad" | "neutral" | null;
};

const LIST_ITEM_TRAILING_TONE: Record<NonNullable<ListItemProps["trailingTone"]>, string> = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-foreground",
};

const LIST_ITEM_BADGE_TONE: Record<NonNullable<ListItemBadge["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/10 text-danger",
};

const HONORIFIC = /^คุณ/;
const THAI_LEADING_VOWELS = /^[เแโใไ]/;

/** One letter for a portrait placeholder: the first consonant of a Thai name (เมย์ shows ม), the first letter otherwise. */
export function initialOf(name: string): string {
  return name.trim().replace(HONORIFIC, "").replace(THAI_LEADING_VOWELS, "").slice(0, 1).toUpperCase();
}

function ListItemMedia({ props }: { props: ListItemProps }) {
  const media = props.media ?? (props.src ? "avatar" : "none");
  if (media === "none") return null;
  const shape = media === "thumb" ? "h-11 w-16 rounded-lg" : "size-11 rounded-full";
  if (props.src) return <img src={props.src} alt={props.title} className={cn("shrink-0 object-cover", shape)} />;
  return (
    <div className={cn("flex shrink-0 items-center justify-center bg-gradient-to-br from-primary to-brand-violet text-sm font-semibold text-white", shape)}>
      {initialOf(props.title) || "?"}
    </div>
  );
}

function ListItemBody({ props, pressable }: { props: ListItemProps; pressable: boolean }) {
  const badges = props.badges ?? [];
  return (
    <>
      <ListItemMedia props={props} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="min-w-0 max-w-full truncate text-sm font-semibold text-foreground">{props.title}</p>
          {props.trailing ? <span className={cn("shrink-0 text-sm font-medium tabular-nums", LIST_ITEM_TRAILING_TONE[props.trailingTone ?? "neutral"])}>{props.trailing}</span> : null}
        </div>
        {props.subtitle ? <p className="truncate text-xs text-muted-foreground">{props.subtitle}</p> : null}
        {props.detail ? <p className="truncate text-xs text-muted-foreground/80">{props.detail}</p> : null}
        {badges.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span key={badge.label} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", LIST_ITEM_BADGE_TONE[badge.tone ?? "neutral"])}>
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {pressable ? <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-muted-foreground/60" /> : null}
    </>
  );
}

/** One row of a list: picture, title, lines, badges; the whole row is the press target when it has on.press. */
export function ListItem({ props, onPress }: { props: ListItemProps; onPress?: (() => void) | null }) {
  const frame = "flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left";
  if (!onPress) return <div className={frame}><ListItemBody props={props} pressable={false} /></div>;
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(frame, "transition hover:border-foreground/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      <ListItemBody props={props} pressable />
    </button>
  );
}

export function Avatar({ props }: { props: AvatarProps }) {
  const size = props.size ?? "md";
  const initials = initialOf(props.name);

  return (
    <div className="flex items-center gap-3">
      {props.src ? (
        <img
          src={props.src}
          alt={props.name}
          className={cn(
            "rounded-full object-cover ring-2 ring-primary/20",
            avatarSize[size],
          )}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-violet font-semibold text-white",
            avatarSize[size],
          )}
        >
          {initials || "?"}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {props.name}
        </p>
        {props.role ? (
          <p className="truncate text-xs text-muted-foreground">{props.role}</p>
        ) : null}
      </div>
    </div>
  );
}

export type CalloutProps = {
  eyebrow?: string | null;
  title: string;
  body: string;
  tone?: "brand" | "info" | "success" | "warning" | "danger" | null;
};

const calloutTone = {
  brand: {
    shell: "border-primary/25 bg-gradient-to-br from-primary/10 to-brand-violet/10",
    bar: "bg-gradient-to-b from-primary to-brand-violet",
    eyebrow: "text-primary",
    title: "text-foreground",
    body: "text-muted-foreground",
  },
  info: {
    shell: "border-info/30 bg-info/10",
    bar: "bg-info",
    eyebrow: "text-info",
    title: "text-foreground",
    body: "text-info",
  },
  success: {
    shell: "border-success/30 bg-success/10",
    bar: "bg-success",
    eyebrow: "text-success",
    title: "text-foreground",
    body: "text-success",
  },
  warning: {
    shell: "border-warning/30 bg-warning/10",
    bar: "bg-warning",
    eyebrow: "text-warning",
    title: "text-foreground",
    body: "text-warning",
  },
  danger: {
    shell: "border-danger/30 bg-danger/10",
    bar: "bg-danger",
    eyebrow: "text-danger",
    title: "text-foreground",
    body: "text-danger",
  },
} as const;

export function Callout({ props }: { props: CalloutProps }) {
  const tone = calloutTone[props.tone ?? "brand"];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border px-3 py-3 pl-4",
        tone.shell,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", tone.bar)}
      />
      {props.eyebrow ? (
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            tone.eyebrow,
          )}
        >
          {props.eyebrow}
        </p>
      ) : null}
      <p className={cn("text-sm font-semibold", tone.title, props.eyebrow && "mt-1")}>
        {props.title}
      </p>
      <p className={cn("mt-1 text-sm leading-relaxed", tone.body)}>
        {props.body}
      </p>
    </div>
  );
}

export type KeyValueProps = {
  pairs?: Array<{ label: string; value: string }> | null;
  size?: "sm" | "md" | null;
};

export function KeyValue({ props }: { props: KeyValueProps }) {
  const pairs = props.pairs ?? [];
  const size = props.size ?? "sm";
  return (
    <dl
      className={cn(
        "w-full min-w-0 divide-y divide-border/60 rounded-xl border border-border bg-card",
        size === "sm" ? "text-[13px]" : "text-sm",
      )}
    >
      {pairs.map((pair, i) => (
        <div
          key={`${i}-${pair.label}`}
          className={cn("flex items-baseline justify-between gap-3 px-2.5", size === "sm" ? "py-1" : "py-1.5")}
        >
          <dt className="shrink-0 text-muted-foreground">{pair.label}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-foreground">{pair.value}</dd>
        </div>
      ))}
    </dl>
  );
}
