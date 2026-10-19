import { useId, useRef, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Image } from '../ui/icons';

const FOOD_EMOJIS = [
  '🍕', '🍔', '🌮', '🍣', '🍜', '🍰', '🧁', '🍩', '🍪', '🍫',
  '🍓', '🍑', '🥑', '🍋', '🌶️', '🧄', '🥕', '🍄', '🫐', '🍇',
  '🥘', '🍲', '🥧', '🍝', '🥗', '🍱', '🧇', '🥞', '🍳', '🥐',
  '👨‍🍳', '👩‍🍳', '🔪', '🥄', '🍽️', '🧑‍🍳', '☕', '🍵', '🧈', '🥨',
];

// Organic palette. Avatars saved with an older hex keep rendering it; none of these is pressed then.
const SWATCHES = [
  { name: 'Peach', hex: '#ffe1d0' },
  { name: 'Apricot', hex: '#ffc6a5' },
  { name: 'Sage', hex: '#e1eecc' },
  { name: 'Moss', hex: '#ccdbb2' },
  { name: 'Sand', hex: '#dcd3c4' },
  { name: 'Tangerine', hex: '#f6a06b' },
];

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
      {open && <AvatarForm titleId={titleId} {...rest} />}
    </Sheet>
  );
}

function AvatarForm({
  titleId,
  uid,
  name,
  currentPhotoType,
  currentPhotoEmoji,
  currentPhotoBgColor,
  currentPhotoURL,
  onSave,
}: Omit<AvatarEditorProps, 'open' | 'onClose'> & { titleId: string }) {
  const [mode, setMode] = useState<Mode>(currentPhotoType);
  const [emoji, setEmoji] = useState(currentPhotoEmoji ?? '👨‍🍳');
  const [bgColor, setBgColor] = useState(currentPhotoBgColor ?? SWATCHES[0].hex);
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
      <h2 id={titleId} className="font-heading text-[22px] text-text-primary text-center">
        Edit avatar
      </h2>

      <div className="flex justify-center [&>div]:h-[120px] [&>div]:w-[120px] [&>div]:font-heading [&>div]:text-[52px]">
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

      <SegmentedControl
        label="Avatar type"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'uploaded', label: 'Photo' },
          { value: 'generated', label: 'Initials' },
          { value: 'emoji', label: 'Emoji' },
        ]}
      />

      {mode === 'generated' && (
        <p className="text-xs text-text-tertiary text-center">Made from your name</p>
      )}

      {mode === 'emoji' && (
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2.5 text-xs font-semibold text-text-tertiary">Colour</div>
            <div className="flex justify-between">
              {SWATCHES.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={`Background ${c.name}`}
                  aria-pressed={bgColor === c.hex}
                  onClick={() => setBgColor(c.hex)}
                  className="h-11 w-11 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
                  // Ring reaches 2px: six 44px swatches leave 2.4px between them at 320px, so a bigger ring would touch its neighbour.
                  style={{
                    backgroundColor: c.hex,
                    boxShadow:
                      bgColor === c.hex
                        ? '0 0 0 1px var(--color-surface), 0 0 0 2px var(--color-text-primary)'
                        : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {FOOD_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={emoji === e}
                onClick={() => setEmoji(e)}
                className={`aspect-square min-h-11 flex items-center justify-center rounded-full text-[28px] leading-none ${
                  emoji === e ? 'bg-accent-200 ring-2 ring-primary-600' : 'bg-surface-secondary'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'uploaded' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Button variant="secondary" fullWidth onClick={() => fileInputRef.current?.click()}>
            <Image className="mr-2 h-5 w-5" />
            Upload a photo
          </Button>
          {!imageURL && (
            <p className="text-xs text-text-tertiary text-center">
              Image will be cropped to a square and scaled to 128x128
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-600 text-center">
          Couldn't save your avatar. Try again.
        </p>
      )}

      <Button
        fullWidth
        style={{ minHeight: 52 }}
        onClick={handleSave}
        disabled={saving || (mode === 'uploaded' && !imageURL)}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
