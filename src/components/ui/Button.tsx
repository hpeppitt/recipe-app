import { cn } from '../../lib/utils';
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';

interface ButtonStyleProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

/**
 * `as="a"` exists so an action that is genuinely a navigation (a `mailto:`, an
 * external link) can look like the rest of the app's buttons without a
 * hand-rolled copy of these classes. UX-27 was exactly that drift, so the fix is
 * to widen the primitive rather than style an anchor at the call site.
 */
type ButtonProps =
  | (ButtonStyleProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' })
  | (ButtonStyleProps & AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a' });

function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleProps & { className?: string }) {
  return cn(
    'inline-flex items-center justify-center font-medium rounded-xl transition-all active:scale-[0.98]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
    'disabled:opacity-50 disabled:pointer-events-none',
    // 44px floor on every size. sm is used for standalone actions (Save,
    // Add Email, Try again), not only as an inline adornment, so a 32px
    // version of it was a real target failure rather than a density choice.
    size === 'sm' && 'text-sm px-3 py-1.5 min-h-11',
    size === 'md' && 'text-sm px-4 py-2.5 min-h-11',
    size === 'lg' && 'text-base px-6 py-3 min-h-11',
    variant === 'primary' && 'bg-primary-600 text-white hover:bg-primary-700',
    variant === 'secondary' && 'bg-surface-tertiary text-text-primary hover:bg-border',
    variant === 'danger' && 'bg-danger-600 text-white hover:bg-danger-500',
    variant === 'ghost' && 'text-text-secondary hover:bg-surface-tertiary',
    fullWidth && 'w-full',
    className
  );
}

export function Button(props: ButtonProps) {
  const { variant, size, fullWidth, className, children } = props;
  const classes = buttonClasses({ variant, size, fullWidth, className });

  // className and children are pulled out too: leaving className in the spread
  // would overwrite the computed classes with the caller's addition rather than
  // merging it, which `cn` has already done.
  if (props.as === 'a') {
    const {
      as: _as,
      variant: _v,
      size: _s,
      fullWidth: _fw,
      className: _c,
      children: _ch,
      ...anchorProps
    } = props;
    return (
      <a className={classes} {...anchorProps}>
        {children}
      </a>
    );
  }

  const {
    as: _as,
    variant: _v,
    size: _s,
    fullWidth: _fw,
    className: _c,
    children: _ch,
    ...buttonProps
  } = props;
  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
