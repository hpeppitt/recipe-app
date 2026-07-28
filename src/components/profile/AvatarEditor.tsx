import { useState, useRef } from 'react';
import { Avatar } from '../ui/Avatar';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Button } from '../ui/Button';

const FOOD_EMOJIS = [
  '🍕', '🍔', '🌮', '🍣', '🍜', '🍰', '🧁', '🍩', '🍪', '🍫',
  '🍓', '🍑', '🥑', '🍋', '🌶️', '🧄', '🥕', '🍄', '🫐', '🍇',
  '🥘', '🍲', '🥧', '🍝', '🥗', '🍱', '🧇', '🥞', '🍳', '🥐',
  '👨‍🍳', '👩‍🍳', '🔪', '🥄', '🍽️', '🧑‍🍳', '☕', '🍵', '🧈', '🥨',
];

const BG_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  '#78716C', '#64748B',
];

interface AvatarEditorProps {
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

type Tab = 'generated' | 'emoji' | 'upload';

export function AvatarEditor({
  uid,
  name,
  currentPhotoType,
  currentPhotoEmoji,
  currentPhotoBgColor,
  currentPhotoURL,
  onSave,
}: AvatarEditorProps) {
  const [tab, setTab] = useState<Tab>(currentPhotoType === 'uploaded' ? 'upload' : currentPhotoType);
  const [emoji, setEmoji] = useState(currentPhotoEmoji ?? '👨‍🍳');
  const [bgColor, setBgColor] = useState(currentPhotoBgColor ?? BG_COLORS[0]);
  const [imageURL, setImageURL] = useState<string | null>(currentPhotoURL);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
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
    try {
      if (tab === 'generated') {
        await onSave({ photoType: 'generated', photoEmoji: null, photoBgColor: null, photoURL: null });
      } else if (tab === 'emoji') {
        await onSave({ photoType: 'emoji', photoEmoji: emoji, photoBgColor: bgColor, photoURL: null });
      } else if (tab === 'upload' && imageURL) {
        await onSave({ photoType: 'uploaded', photoEmoji: null, photoBgColor: null, photoURL: imageURL });
      }
    } finally {
      setSaving(false);
    }
  };

  const previewType = tab === 'generated' ? 'generated' : tab === 'emoji' ? 'emoji' : 'uploaded';

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex justify-center">
        <Avatar
          uid={uid}
          name={name}
          size="xl"
          photoType={previewType}
          photoEmoji={tab === 'emoji' ? emoji : null}
          photoBgColor={tab === 'emoji' ? bgColor : null}
          photoURL={tab === 'upload' ? imageURL : null}
        />
      </div>

      {/* Tabs */}
      <SegmentedControl
        compact
        label="Avatar type"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'generated', label: 'Auto' },
          { value: 'emoji', label: 'Emoji' },
          { value: 'upload', label: 'Upload' },
        ]}
      />

      {/* Tab content */}
      {tab === 'generated' && (
        <p className="text-xs text-text-tertiary text-center">
          Auto-generated from your username
        </p>
      )}

      {tab === 'emoji' && (
        <div className="space-y-3">
          <div className="grid grid-cols-10 gap-1">
            {FOOD_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-colors ${
                  emoji === e ? 'bg-primary-100 ring-2 ring-primary-500' : 'hover:bg-surface-secondary'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBgColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${
                  bgColor === c ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Button variant="secondary" fullWidth onClick={() => fileInputRef.current?.click()}>
            {imageURL ? 'Choose Different Image' : 'Choose Image'}
          </Button>
          {!imageURL && (
            <p className="text-xs text-text-tertiary text-center">
              Image will be cropped to a square and scaled to 128x128
            </p>
          )}
        </div>
      )}

      {/* Save */}
      <Button
        fullWidth
        onClick={handleSave}
        disabled={saving || (tab === 'upload' && !imageURL)}
      >
        {saving ? 'Saving...' : 'Save Avatar'}
      </Button>
    </div>
  );
}
