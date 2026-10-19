import type { Settings } from "@/lib/api";

/** "Inquire now": opens the Facebook page set in Site settings, or the contact page until one is set. */
export function InquireNow({ settings, className = "btn px-4 py-1.5" }: { settings: Settings; className?: string }) {
  const facebook = settings.facebook;
  return (
    <a href={facebook || "/contact"} target={facebook ? "_blank" : undefined} rel={facebook ? "noopener noreferrer" : undefined} className={className}>
      Inquire now
    </a>
  );
}
