import { useState, useRef, useEffect } from "react"
import { Send, Paperclip } from "lucide-react"
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
  const [videoOverlay, setVideoOverlay] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  const clearInput = () => {
    if (attachInputRef.current) attachInputRef.current.value = ""
  }

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
    const isVideo = file.type.startsWith("video/")
    setSendingMedia(true)
    if (isVideo) setVideoOverlay(true)
    try {
      const dataUrl = await fileToUploadDataUrl(file)
      const upload = chatApi.uploadMedia({ dataUrl })
      if (isVideo) {
        const [res] = await Promise.all([upload, new Promise((r) => setTimeout(r, 7000))])
        if (!res.ok) throw new Error(res.error)
        await sendMessage(currentRoomId, "", "text", res.media.id)
      } else {
        const res = await upload
        if (!res.ok) throw new Error(res.error)
        await sendMessage(currentRoomId, "", "text", res.media.id)
      }
    } catch (e: any) {
      addToast(e?.message || "Failed to send attachment", "error")
    } finally {
      setVideoOverlay(false)
      setSendingMedia(false)
      clearInput()
    }
  }

  if (!currentRoomId) return null

  return (
    <>
      {videoOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="text-xl text-white">海内存知己，天涯若比邻</p>
        </div>
      )}
      <div className="flex items-end gap-2 border-t px-4 py-3">
      <input
        ref={attachInputRef}
        type="file"
        accept="image/*,audio/*,video/*,application/*,text/*"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={() => attachInputRef.current?.click()}
        disabled={sendingMedia}
        className="mb-1"
        aria-label="Send attachment"
        title="Send attachment"
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
    </>
  )
}
