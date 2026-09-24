import { JOURNEY } from "./content";

/** The six steps one number takes from a question to a card, in order. */
export function JourneyDiagram() {
  return (
    <figure className="not-prose @container relative overflow-hidden rounded-3xl border border-hairline bg-surface p-6 text-foreground shadow-lift sm:p-8">
      <div aria-hidden className="absolute -right-24 -top-24 size-72 rounded-full bg-violet/10 blur-[90px]" />
      <ol className="relative grid gap-8 @md:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-6 @5xl:gap-5">
        <span aria-hidden className="absolute left-5 right-5 top-5 hidden h-px bg-[linear-gradient(90deg,#818cf8,#c084fc,#fb7185)] @5xl:block" />
        {JOURNEY.map((step, index) => (
          <li key={step.title} className="relative flex flex-col gap-3">
            <span className="relative grid size-10 place-items-center rounded-full bg-[linear-gradient(135deg,#4f46e5,#7c3aed_55%,#fb7185)] font-display text-sm font-bold text-white shadow-[0_0_0_6px_#ffffff]">
              {index + 1}
            </span>
            <p className="font-semibold leading-6">{step.title}</p>
            <p className="text-sm leading-6 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
