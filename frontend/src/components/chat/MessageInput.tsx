import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useSocket } from "@/hooks/useSocket"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function MessageInput() {
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const { sendMessage } = useSocket()
  const { addToast } = useToast()
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [currentRoomId])

  const handleSend = async () => {
    if (!text.trim() || !currentRoomId) return
    const content = text.trim()
    setText("")
    try {
      await sendMessage(currentRoomId, content)
    } catch {
      setText(content)
      addToast("Message failed to send", "error")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentRoomId) return null

  return (
    <div className="flex items-end gap-2 border-t px-4 py-3">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className="flex-1 resize-none min-h-[40px] max-h-[120px]"
        rows={1}
      />
      <Button size="icon" onClick={handleSend} disabled={!text.trim()} className="mb-1">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
