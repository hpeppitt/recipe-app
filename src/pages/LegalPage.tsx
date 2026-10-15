import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LEGAL_DOCUMENTS } from '../lib/legal';
import { TopBar } from '../components/layout/TopBar';
import { EmptyState } from '../components/ui/EmptyState';

type LegalDocKey = keyof typeof LEGAL_DOCUMENTS;

export function LegalPage({ doc }: { doc: LegalDocKey }) {
  const document_ = LEGAL_DOCUMENTS[doc];
  const navigate = useNavigate();
  const { key } = useLocation();
  // A new tab or direct visit has no in-app history, so back would leave the app.
  const onBack = () => (key !== 'default' ? navigate(-1) : navigate('/settings'));

  // The same component instance serves all three routes, so start each at the top.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [doc]);

  if (!document_) {
    return (
      <div className="flex flex-col bg-surface">
        <TopBar title="Not found" showBack onBack={onBack} />
        <main>
          <EmptyState title="This page does not exist" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-surface min-h-dvh">
      <TopBar title={document_.title} showBack onBack={onBack} />
      <main className="flex-1 max-w-lg mx-auto w-full p-4 pb-12 space-y-6 break-words">
        {/* Prominent on purpose: these are drafts until the author signs off (RL-046). */}
        <p
          role="note"
          className="border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-4 text-sm font-medium text-warning-800 dark:text-warning-200"
        >
          {document_.draftNotice}
        </p>
        <p className="text-sm text-text-secondary">
          Last updated{' '}
          <time dateTime={document_.lastUpdated}>
            {new Date(`${document_.lastUpdated}T00:00:00Z`).toLocaleDateString('en-GB', {
              dateStyle: 'long',
              timeZone: 'UTC',
            })}
          </time>
        </p>
        {document_.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-base font-semibold text-text-primary">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-text-primary">
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
