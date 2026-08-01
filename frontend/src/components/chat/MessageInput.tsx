import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useSocket } from "@/hooks/useSocket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function MessageInput() {
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const { sendMessage } = useSocket()
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [currentRoomId])

  const handleSend = async () => {
    if (!text.trim() || !currentRoomId) return
    const content = text.trim()
    setText("")
    try {
      await sendMessage(currentRoomId, content)
    } catch {
      setText(content)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentRoomId) return null

  return (
    <div className="flex items-center gap-2 border-t px-4 py-3">
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className="flex-1"
      />
      <Button size="icon" onClick={handleSend} disabled={!text.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
