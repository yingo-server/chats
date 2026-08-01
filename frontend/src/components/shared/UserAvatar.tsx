import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  name: string
  online?: boolean
  className?: string
}

export function UserAvatar({ name, online, className }: UserAvatarProps) {
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div className={cn("relative", className)}>
      <Avatar className="h-9 w-9">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
            online ? "bg-green-500" : "bg-gray-400"
          )}
        />
      )}
    </div>
  )
}
