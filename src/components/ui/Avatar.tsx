import { uidToColor, getInitials } from '../../lib/identity';

interface AvatarProps {
  uid: string;
  name: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  photoType?: 'generated' | 'emoji' | 'uploaded';
  photoEmoji?: string | null;
  photoBgColor?: string | null;
  photoURL?: string | null;
}

const SIZES = {
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-7 h-7 text-[11px]',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-3xl',
} as const;

const EMOJI_SIZES = {
  sm: 'text-[10px]',
  md: 'text-sm',
  lg: 'text-xl',
  xl: 'text-4xl',
} as const;

export function Avatar({
  uid,
  name,
  size = 'md',
  photoType = 'generated',
  photoEmoji,
  photoBgColor,
  photoURL,
}: AvatarProps) {
  const baseClasses = `${SIZES[size]} rounded-full flex items-center justify-center flex-shrink-0 select-none overflow-hidden`;

  if (photoType === 'uploaded' && photoURL) {
    return (
      <div className={baseClasses} aria-hidden>
        <img src={photoURL} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (photoType === 'emoji' && photoEmoji) {
    return (
      <div
        className={`${baseClasses} ${EMOJI_SIZES[size]}`}
        style={{ backgroundColor: photoBgColor || uidToColor(uid) }}
        aria-hidden
      >
        {photoEmoji}
      </div>
    );
  }

  // Default: generated initials
  const color = uidToColor(uid);
  const initials = getInitials(name);

  return (
    <div
      className={`${baseClasses} font-bold text-white`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
