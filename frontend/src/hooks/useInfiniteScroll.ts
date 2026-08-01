import { useEffect, useRef, useCallback } from "react"

export function useInfiniteScroll(onLoadMore: () => Promise<void>, hasMore: boolean) {
  const loadingRef = useRef(false)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
    }
  }, [])

  const setObserver = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      nodeRef.current = node

      if (!node || !hasMore) return

      const observer = new IntersectionObserver(
        async (entries) => {
          if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) {
            loadingRef.current = true
            try {
              await onLoadMore()
            } finally {
              loadingRef.current = false
            }
          }
        },
        { threshold: 0.1 }
      )

      observer.observe(node)
      observerRef.current = observer
    },
    [onLoadMore, hasMore]
  )

  return { setObserver }
}
