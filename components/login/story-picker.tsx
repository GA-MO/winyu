"use client";

import { ArrowRight } from "lucide-react";
import type { User } from "@/lib/contracts";
import type { DemoStory } from "@/lib/demo/stories";
import { TH } from "@/lib/i18n/th";
import { useSignIn } from "./use-sign-in";

const STORY = "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card";
const STEP_NUMBER = "flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium text-muted-foreground";
const ENTER = "inline-flex w-fit items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-ink-foreground transition hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function firstName(user: User): string {
  return user.nameTh.split(" ")[0];
}

export function StoryPicker({ stories, users }: { stories: readonly DemoStory[]; users: readonly User[] }) {
  const { signIn, pending, chosen, error } = useSignIn();
  const byId = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ol className="grid gap-4 md:grid-cols-2">
        {stories.map((story, index) => (
          <li key={story.key} className={`animate-hero-rise ${STORY}`} style={{ animationDelay: `${index * 60}ms` }}>
            <header className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">
                {index + 1} · {TH.login.storyMinutes(story.minutes)}
              </p>
              <h2 className="font-display text-lg font-semibold leading-snug">{story.title}</h2>
              <p className="text-sm text-muted-foreground">{story.why}</p>
            </header>
            <ol className="flex flex-col gap-3">
              {story.steps.map((step, stepIndex) => {
                const user = byId.get(step.userId);
                if (!user) return null;
                const key = `${story.key}:${step.userId}`;
                return (
                  <li key={key} className="flex gap-3">
                    <span className={STEP_NUMBER}>{stepIndex + 1}</span>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <p className="text-sm">
                        <span className="font-medium">{user.nameTh}</span>
                        <span className="text-muted-foreground"> · {user.title}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{step.todo}</p>
                      <button type="button" onClick={() => signIn(step.userId, step.destination)} disabled={pending} className={ENTER}>
                        {chosen === step.userId && pending ? TH.login.signingIn : TH.login.stepAs(firstName(user))}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
