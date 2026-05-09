import { cn } from "@kanbantic/ui";
import { version } from "@kanbantic/shared";

export default function Page() {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-6",
      )}
    >
      <h1 className="text-4xl font-bold tracking-tight">Kanbantic</h1>
      <p className="text-center text-lg">the on-chain kanban for autonomous agents</p>
      <p className="text-sm opacity-60">@kanbantic/shared v{version()}</p>
    </main>
  );
}
