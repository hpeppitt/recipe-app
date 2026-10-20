import { X } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import type { TrayPhoto } from './usePhotoTray';

const PRIVACY_NOTICE =
  "Photos are sent to Google's Gemini to write your recipe and are not saved. Leave out people and personal details.";

interface PhotoTrayProps {
  photos: TrayPhoto[];
  trayRef: React.RefObject<HTMLDivElement | null>;
  onRemove: (id: number) => void;
}

/** The privacy notice and removable thumbnails. Renders nothing with no photos. */
export function PhotoTray({ photos, trayRef, onRemove }: PhotoTrayProps) {
  if (!photos.length) return null;
  return (
    <div className="mx-auto max-w-lg min-w-0">
      <p className="break-words pb-1.5 text-xs text-text-tertiary">{PRIVACY_NOTICE}</p>
      <div ref={trayRef} className="flex min-w-0 gap-3.5 pt-3.5 pr-3.5 pb-2">
        {photos.map((photo, i) => (
          <div key={photo.id} className="relative size-14 flex-shrink-0">
            {photo.attachment ? (
              <img
                src={`data:${photo.attachment.mimeType};base64,${photo.attachment.base64}`}
                alt={`Attached photo ${i + 1} of ${photos.length}`}
                className="size-14 rounded-[16px] object-cover"
              />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-[16px] bg-neutral-100 text-text-secondary">
                <Spinner size="icon" label="Preparing photo" />
              </div>
            )}
            {/* 44px button around a 28px circle; the 14px gap keeps it off the next thumbnail */}
            <button
              type="button"
              onClick={() => onRemove(photo.id)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute -top-3.5 -right-3.5 flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-surface-secondary text-text-primary shadow-sm">
                <X className="size-3.5" />
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
