import { PersonaGrid } from "@/components/login/persona-grid";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:px-8 md:py-16">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-primary">{TH.app.name}</span>
        <h1 className="text-3xl font-semibold tracking-tight">{TH.login.title}</h1>
        <p className="max-w-2xl text-muted-foreground">{TH.login.subtitle}</p>
        <p className="text-xs text-muted-foreground">{TH.login.demoNotice}</p>
      </div>
      <PersonaGrid users={USERS} />
    </main>
  );
}
