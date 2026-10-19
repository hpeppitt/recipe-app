import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { useConsent } from '../../hooks/useConsent';

/**
 * In normal flow at the top of the shell, never fixed or sticky: the FAB, the
 * update prompt and toasts are all fixed to the bottom, and a flow element cannot
 * overlap them or clip the end of a page. No overlay and no focus trap.
 */
export function ConsentBanner() {
  const { showBanner, setConsent } = useConsent();
  if (!showBanner) return null;
  return (
    <section
      role="region"
      aria-label="Analytics consent"
      className="border-b border-border bg-surface-secondary lg:ml-[220px]"
    >
      <div className="max-w-lg mx-auto p-4 space-y-3">
        <p className="text-sm text-text-primary">
          Recipe Lab can use optional analytics to see which features get used. Nothing is tracked
          unless you allow it.{' '}
          <Link
            to="/cookies"
            className="inline-flex items-center min-h-11 underline text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            Cookie Policy
          </Link>
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConsent(true)}>
            Allow analytics
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setConsent(false)}>
            No thanks
          </Button>
        </div>
      </div>
    </section>
  );
}
