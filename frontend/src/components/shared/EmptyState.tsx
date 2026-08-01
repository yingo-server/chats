import { MessageSquare } from "lucide-react"

interface EmptyStateProps {
  title?: string
  description?: string
}

export function EmptyState({ title = "No conversation selected", description = "Choose a room from the sidebar to start chatting" }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <MessageSquare className="h-16 w-16 opacity-20" />
      <div className="text-center">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm">{description}</p>
      </div>
    </div>
  )
}
