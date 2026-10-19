import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type EmojiBlobSize = 52 | 72 | 76 | 84 | 120 | 150;

interface EmojiBlobProps {
  emoji?: string;
  children?: ReactNode;
  size: EmojiBlobSize;
  tint?: string;
  className?: string;
  label?: string;
}

// The recipe emoji on a soft organic shape. No photo variant: photos are cut (decision 3).
export function EmojiBlob({ emoji, children, size, tint = 'bg-accent-200', className, label }: EmojiBlobProps) {
  return (
    <div
      className={cn('flex flex-shrink-0 select-none items-center justify-center leading-none', tint, className)}
      style={{
        width: size,
        height: size,
        fontSize: size / 2,
        borderRadius: '58% 42% 52% 48% / 46% 56% 44% 54%',
      }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {children ?? emoji}
    </div>
  );
}
