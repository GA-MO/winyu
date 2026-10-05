import { Fragment, type ReactNode } from "react";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const HEADING = /^#{1,6}\s+/;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) return <strong key={index} className="font-semibold">{piece.slice(2, -2)}</strong>;
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{piece.slice(1, -1)}</code>;
    if (piece.startsWith("*") && piece.endsWith("*") && piece.length > 2) return <em key={index}>{piece.slice(1, -1)}</em>;
    return <Fragment key={index}>{piece}</Fragment>;
  });
}

function lines(block: string): ReactNode[] {
  return block.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {inline(line)}
    </Fragment>
  ));
}

function Block({ block }: { block: string }) {
  const rows = block.split("\n").filter((row) => row.trim());
  if (rows.length > 0 && rows.every((row) => BULLET.test(row))) {
    return (
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {rows.map((row, index) => (
          <li key={index}>{inline(row.replace(BULLET, ""))}</li>
        ))}
      </ul>
    );
  }
  if (rows.length === 1 && HEADING.test(rows[0])) return <p className="font-semibold">{inline(rows[0].replace(HEADING, ""))}</p>;
  return <p>{lines(block.trim())}</p>;
}

/** The small markdown a reply uses (paragraphs, bullets, bold, italic, code), drawn as React text; no HTML from the model reaches the page. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
