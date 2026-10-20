import { Link as RouterLink, useLocation } from 'react-router-dom';
import { carriedListOrigin, listOriginState, type ListOrigin } from '../../lib/paneMode';
import { useRelatedFamilies } from '../../hooks/useRelatedFamilies';
import { pluralize } from '../../lib/utils';
import type { RelatedFamily } from '../../services/firestore';
import { UserPill } from '../ui/UserPill';
import { ChevronRight, Link } from '../ui/icons';

/** Organic 7d. Renders nothing when there are no families. The caller passes the list origin to carry. */
export function RelatedFamilyCard({ families, origin }: { families: readonly RelatedFamily[]; origin?: ListOrigin }) {
  if (families.length === 0) return null;
  return (
    <section aria-label="Related family" className="flex flex-col gap-2.5 rounded-[28px] bg-accent-2-100 p-4 motion-safe:animate-[boot-in_0.4s_ease-out_both]">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-2-800">
        <Link className="size-3.5" />
        Related family
      </div>
      <ul className="flex flex-col gap-2.5">
        {families.map((f) => {
          const title = f.title.trim() || 'Untitled recipe';
          const author = f.createdBy?.displayName?.trim() || 'Anonymous';
          const count = f.versions === undefined ? '' : `, ${f.versions} ${pluralize(f.versions, 'version')}`;
          return (
            <li key={f.id}>
              <RouterLink
                to={`/recipe/${f.id}`}
                aria-label={`${title}, by ${author}${count}`}
                state={origin ? listOriginState(origin) : undefined}
                className="flex min-h-11 items-center gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-[22px] leading-none">
                  {f.emoji}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="break-words font-bold text-text-primary">{title}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-accent-2-800">
                    {f.createdBy?.uid && <UserPill uid={f.createdBy.uid} name={f.createdBy.displayName} wrap />}
                    {f.versions !== undefined && `${f.versions} ${pluralize(f.versions, 'version')}`}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-accent-2-800" />
              </RouterLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The card with its one read; the recipe page's slot below the metadata pills. */
export function RelatedFamilies({ recipe }: { recipe: { id: string; depth: number; relatedFamilyId?: string | null } }) {
  const families = useRelatedFamilies(recipe);
  const origin = carriedListOrigin(useLocation().state)?.listOrigin;
  return <RelatedFamilyCard families={families} origin={origin} />;
}
