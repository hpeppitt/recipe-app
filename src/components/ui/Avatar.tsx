import { uidToColor, getInitials } from '../../lib/identity';

interface AvatarProps {
  uid: string;
  name: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-7 h-7 text-[11px]',
  lg: 'w-12 h-12 text-base',
} as const;

export function Avatar({ uid, name, size = 'md' }: AvatarProps) {
  const color = uidToColor(uid);
  const initials = getInitials(name);

  return (
    <div
      className={`${SIZES[size]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
