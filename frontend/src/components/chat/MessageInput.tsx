import { useState, useRef, useEffect } from "react"
import { Send, ImagePlus, Paperclip } from "lucide-react"
import { useRoomStore } from "@/stores/useRoomStore"
import { useSocket } from "@/hooks/useSocket"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import * as chatApi from "@/api/chat"
import { fileToUploadDataUrl } from "@/lib/media"

export function MessageInput() {
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const { sendMessage } = useSocket()
  const { addToast } = useToast()
  const [text, setText] = useState("")
  const [sendingMedia, setSendingMedia] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

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
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !currentRoomId || sendingMedia) return
    setSendingMedia(true)
    try {
      const dataUrl = await fileToUploadDataUrl(file)
      const res = await chatApi.uploadMedia({ dataUrl })
      if (!res.ok) throw new Error(res.error)
      await sendMessage(currentRoomId, "", "text", res.media.id)
    } catch (e: any) {
      addToast(e?.message || "Failed to send attachment", "error")
    } finally {
      setSendingMedia(false)
      if (imageInputRef.current) imageInputRef.current.value = ""
      if (attachInputRef.current) attachInputRef.current.value = ""
    }
  }

  if (!currentRoomId) return null

  return (
    <div className="flex items-end gap-2 border-t px-4 py-3">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />
      <input
        ref={attachInputRef}
        type="file"
        accept="audio/*,video/*,application/*,text/*"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={() => imageInputRef.current?.click()}
        disabled={sendingMedia}
        className="mb-1"
        aria-label="Send image"
        title="Send image"
      >
        <ImagePlus className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => attachInputRef.current?.click()}
        disabled={sendingMedia}
        className="mb-1"
        aria-label="Send file"
        title="Send file"
      >
        <Paperclip className="h-4 w-4" />
      </Button>
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className="flex-1 resize-none min-h-[40px] max-h-[120px]"
        rows={1}
      />
      <Button size="icon" onClick={handleSend} disabled={!text.trim() || sendingMedia} className="mb-1" aria-label="Send message">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
