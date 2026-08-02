import { useEffect, useRef } from "react"

export interface ContextMenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

interface RoomContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function RoomContextMenu({ x, y, items, onClose }: RoomContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onResize = () => onClose()
    window.addEventListener("scroll", handle, true)
    window.addEventListener("resize", onResize)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("scroll", handle, true)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const width = 160
  const itemHeight = items.length * 36 + 8
  const left = Math.min(x, window.innerWidth - width - 8)
  const top = Math.min(y, window.innerHeight - itemHeight - 8)

  return (
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: Math.max(8, left), top: Math.max(8, top), width }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`flex w-full items-center rounded-sm px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent ${item.danger ? "text-destructive" : ""}`}
          onClick={() => {
            onClose()
            item.onClick()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}