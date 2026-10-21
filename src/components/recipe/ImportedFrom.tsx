import { ExternalLink } from '../ui/icons';

/** "Imported from <host>" linking to the source (RL-253). Renders nothing unless the url is http(s). */
export function ImportedFrom({ url, className = '' }: { url?: string; className?: string }) {
  let host: string | null = null;
  try {
    const u = new URL(url ?? '');
    if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname.replace(/^www\./, '');
  } catch {
    // not a URL
  }
  if (!url || !host) return null;
  return (
    <p className={`break-words text-[13px] text-neutral-700 ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="relative inline-flex max-w-full items-center gap-1 underline before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">Imported from {host}</span>
        <span className="sr-only"> (opens in a new tab)</span>
        <ExternalLink className="size-3.5 flex-shrink-0" />
      </a>
    </p>
  );
}
