/** The Fae & Fable logo (trimmed, 435×120). Size it with className; `name` is read out by screen readers. */
export function Wordmark({ name = "Fae & Fable", className = "h-10 w-auto" }: { name?: string; className?: string }) {
  return <img src="/faeandfable-wordmark.png" alt={name} width={435} height={120} className={className} />;
}
