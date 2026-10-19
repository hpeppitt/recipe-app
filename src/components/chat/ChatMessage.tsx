import type { ChatMessage as ChatMessageType } from '../../types/recipe';

interface ChatMessageProps {
  message: ChatMessageType;
  /** Data URLs of photos sent with this message (in memory only, RL-118). */
  photos?: string[];
}

export function ChatMessageBubble({ message, photos }: ChatMessageProps) {
  if (message.role === 'assistant') return null; // assistant messages rendered as RecipeCardMessage

  if (photos?.length) {
    return (
      <div className="flex min-w-0 justify-end">
        <div className="max-w-[280px] min-w-0 rounded-[24px_24px_6px_24px] bg-primary-600 px-4 py-3 text-on-accent">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Your photo ${i + 1}`}
                className="size-16 flex-shrink-0 rounded-[16px] object-cover"
              />
            ))}
          </div>
          <p className="whitespace-pre-wrap break-words text-[15px]">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 justify-end">
      <p className="max-w-[280px] min-w-0 whitespace-pre-wrap break-words rounded-[24px_24px_6px_24px] bg-primary-600 px-4 py-3 text-[15px] text-on-accent">
        {message.content}
      </p>
    </div>
  );
}
