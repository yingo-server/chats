import type { Message } from "@/types/models"
import { useAuthStore } from "@/stores/useAuthStore"
import { timeAgo } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { MediaContent } from "./MediaContent"

interface MessageItemProps {
  message: Message
}

export function MessageItem({ message }: MessageItemProps) {
  const user = useAuthStore((s) => s.user)
  const isOwn = message.senderId === user?.id
  const initials = message.senderName?.slice(0, 2).toUpperCase() || "?"

  return (
    <div className={cn("flex gap-3 px-4 py-1.5 hover:bg-muted/30", isOwn && "flex-row-reverse")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {initials}
      </div>
      <div className={cn("flex max-w-[70%] flex-col gap-0.5", isOwn && "items-end")}>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium">{message.senderAppName}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(message.sentAt)}</span>
        </div>
        <div
          className={cn(
            "self-start rounded-xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words",
            isOwn ? "self-end bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          {message.mediaId ? (
            <div className="flex flex-col gap-1">
              <MediaContent mediaId={message.mediaId} mediaType={message.mediaType} />
              {message.content.trim() && <div>{message.content.trim()}</div>}
            </div>
          ) : (
            message.content.trim()
          )}
        </div>
      </div>
    </div>
  )
}
