import { formatTimestamp } from '../../lib/utils';
import type { ChatMessage as ChatMessageType } from '../../types/recipe';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
  if (message.role === 'assistant') return null; // assistant messages rendered as RecipeCardMessage

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-primary-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md">
        <p className="text-sm">{message.content}</p>
        <p className="text-[10px] text-primary-200 text-right mt-1">
          {formatTimestamp(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
