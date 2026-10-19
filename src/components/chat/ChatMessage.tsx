import type { ChatMessage as ChatMessageType } from '../../types/recipe';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
  if (message.role === 'assistant') return null; // assistant messages rendered as RecipeCardMessage

  return (
    <div className="flex min-w-0 justify-end">
      <p className="max-w-[280px] min-w-0 whitespace-pre-wrap break-words rounded-[24px_24px_6px_24px] bg-primary-600 px-4 py-3 text-[15px] text-on-accent">
        {message.content}
      </p>
    </div>
  );
}
