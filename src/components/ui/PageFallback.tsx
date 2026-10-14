import { Spinner } from './Spinner';

// Suspense fallback for lazy routes. Fixed min-height so the shell does not jump.
export function PageFallback() {
  return (
    <div className="min-h-[50dvh] flex items-center justify-center text-primary-600">
      <Spinner />
    </div>
  );
}
