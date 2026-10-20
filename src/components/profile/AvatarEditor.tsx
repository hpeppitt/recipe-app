import { useId, useRef, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Camera } from '../ui/icons';

const FOOD_EMOJIS = ['🥐', '🍞', '🍳', '🍜', '🥟', '🍋', '🧄', '🌶️', '🥑', '🍅', '🧀', '🍰', '🥕', '🍄', '🫖'];

// Swatches store token references, so avatars follow the theme.
const SWATCHES = [
  { name: 'Peach', value: 'var(--color-accent-200)' },
  { name: 'Apricot', value: 'var(--color-accent-300)' },
  { name: 'Sage', value: 'var(--color-accent-2-200)' },
  { name: 'Moss', value: 'var(--color-accent-2-300)' },
  { name: 'Sand', value: 'var(--color-neutral-300)' },
  { name: 'Tangerine', value: 'var(--color-accent-400)' },
];

// Profiles saved before RL-140 hold the raw hex. Map those to their swatch so it shows pressed;
// any other stored value presses none. Keys omit the '#' so no hex literal lives outside the token sheet.
const LEGACY_HEX: Record<string, string> = {
  'ffe1d0': SWATCHES[0].value,
  'ffc6a5': SWATCHES[1].value,
  'e1eecc': SWATCHES[2].value,
  'ccdbb2': SWATCHES[3].value,
  'dcd3c4': SWATCHES[4].value,
  'f6a06b': SWATCHES[5].value,
};

interface AvatarEditorProps {
  open: boolean;
  onClose: () => void;
  uid: string;
  name: string | null;
  currentPhotoType: 'generated' | 'emoji' | 'uploaded';
  currentPhotoEmoji: string | null;
  currentPhotoBgColor: string | null;
  currentPhotoURL: string | null;
  onSave: (data: {
    photoType: 'generated' | 'emoji' | 'uploaded';
    photoEmoji?: string | null;
    photoBgColor?: string | null;
    photoURL?: string | null;
  }) => Promise<void>;
}

type Mode = 'uploaded' | 'generated' | 'emoji';

export function AvatarEditor({ open, onClose, ...rest }: AvatarEditorProps) {
  const titleId = useId();
  // The form mounts per open, so a cancelled draft never survives into the next one.
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      {open && <AvatarForm titleId={titleId} onClose={onClose} {...rest} />}
    </Sheet>
  );
}

function AvatarForm({
  titleId,
  onClose,
  uid,
  name,
  currentPhotoType,
  currentPhotoEmoji,
  currentPhotoBgColor,
  currentPhotoURL,
  onSave,
}: Omit<AvatarEditorProps, 'open'> & { titleId: string }) {
  const [mode, setMode] = useState<Mode>(currentPhotoType);
  const [emoji, setEmoji] = useState(currentPhotoEmoji ?? FOOD_EMOJIS[0]);
  const [bgColor, setBgColor] = useState(
    currentPhotoBgColor ? (LEGACY_HEX[currentPhotoBgColor.toLowerCase().replace('#', '')] ?? currentPhotoBgColor) : SWATCHES[0].value,
  );
  const [imageURL, setImageURL] = useState<string | null>(currentPhotoURL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.onload = () => {
      canvas.width = 128;
      canvas.height = 128;
      // Crop to square from center
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
      setImageURL(canvas.toDataURL('image/jpeg', 0.8));
      setMode('uploaded');
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(false);
    try {
      if (mode === 'generated') {
        await onSave({ photoType: 'generated', photoEmoji: null, photoBgColor: null, photoURL: null });
      } else if (mode === 'emoji') {
        await onSave({ photoType: 'emoji', photoEmoji: emoji, photoBgColor: bgColor, photoURL: null });
      } else if (imageURL) {
        await onSave({ photoType: 'uploaded', photoEmoji: null, photoBgColor: null, photoURL: imageURL });
      }
    } catch {
      // The caller closes the sheet only after onSave resolves, so a failure leaves it open.
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-[18px] min-w-0">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-surface">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <h2 id={titleId} className="sr-only">
          Edit avatar
        </h2>
        <Button
          className="min-h-11 px-[18px]"
          onClick={handleSave}
          disabled={saving || (mode === 'uploaded' && !imageURL)}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-[18px] border-0 p-0">
      <div className="flex justify-center">
        <div
          className="h-[170px] w-[170px] overflow-hidden [&>div]:h-full [&>div]:w-full [&>div]:rounded-none [&>div]:font-heading [&>div]:text-[84px]"
          style={{ borderRadius: '58% 42% 52% 48% / 46% 56% 44% 54%' }}
        >
          <Avatar
            uid={uid}
            name={name}
            size="xl"
            photoType={mode}
            photoEmoji={mode === 'emoji' ? emoji : null}
            photoBgColor={mode === 'emoji' ? bgColor : null}
            photoURL={mode === 'uploaded' ? imageURL : null}
          />
        </div>
      </div>

      <div className="flex justify-center">
        {SWATCHES.map((c) => {
          const on = mode === 'emoji' && bgColor === c.value;
          return (
            <button
              key={c.value}
              type="button"
              aria-label={`Colour ${c.name}`}
              aria-pressed={on}
              onClick={() => {
                setBgColor(c.value);
                setMode('emoji');
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span
                className="h-9 w-9 rounded-full"
                style={{
                  backgroundColor: c.value,
                  boxShadow: on ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-text-primary)' : undefined,
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-5 justify-items-center gap-y-2">
        {FOOD_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={mode === 'emoji' && emoji === e}
            onClick={() => {
              setEmoji(e);
              setMode('emoji');
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-[28px] leading-none focus-visible:outline-2 focus-visible:outline-primary-500 ${
              mode === 'emoji' && emoji === e ? 'bg-accent-100 ring-2 ring-accent-500' : ''
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
      <div className="flex gap-2.5">
        <Button
          variant="secondary"
          className="flex-1 aria-pressed:border-accent-500 aria-pressed:bg-accent-100"
          aria-pressed={mode === 'uploaded'}
          onClick={() => (mode !== 'uploaded' && imageURL ? setMode('uploaded') : fileInputRef.current?.click())}
        >
          <Camera className="mr-2 h-5 w-5" />
          Use a photo
        </Button>
        <Button
          variant="secondary"
          className="flex-1 aria-pressed:border-accent-500 aria-pressed:bg-accent-100"
          aria-pressed={mode === 'generated'}
          onClick={() => setMode('generated')}
        >
          Initials
        </Button>
      </div>
      <p className="text-xs text-text-tertiary text-center">
        A photo is cropped to a square and scaled to 128x128
      </p>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger-600 text-center">
          Couldn't save your avatar. Try again.
        </p>
      )}
    </div>
  );
}
