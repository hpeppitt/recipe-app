import { Avatar } from './Avatar';

// Not a link; callers wrap it.
export function UserPill({ uid, name }: { uid: string; name: string | null }) {
  return (
    <span className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-full bg-neutral-100 py-0.5 pl-0.5 pr-2.5 text-xs leading-5 text-neutral-800">
      <Avatar uid={uid} name={name} size="sm" />
      {name || 'Anonymous'}
    </span>
  );
}
