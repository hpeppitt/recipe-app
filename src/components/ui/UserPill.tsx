import { Avatar } from './Avatar';
import { cn } from '../../lib/utils';

// Not a link; callers wrap it. `wrap` lets a long name break instead of
// overflowing a narrow parent; off by default so list rows stay on one line.
export function UserPill({ uid, name, wrap = false }: { uid: string; name: string | null; wrap?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-full bg-neutral-100 py-0.5 pl-0.5 pr-2.5 text-xs leading-5 text-neutral-800',
        wrap ? 'max-w-full break-words' : 'whitespace-nowrap'
      )}
    >
      <Avatar uid={uid} name={name} size="sm" />
      {wrap ? <span className="min-w-0 break-words">{name || 'Anonymous'}</span> : name || 'Anonymous'}
    </span>
  );
}
