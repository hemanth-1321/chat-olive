import { useState, useEffect, useRef } from 'react'

export function useStreamingText(text: string, isStreaming: boolean, speed = 20) {
  const [displayed, setDisplayed] = useState(text)
  const indexRef = useRef(text.length)
  const rafRef = useRef<number>(0)
  const lastRef = useRef(0)

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(text)
      indexRef.current = text.length
      return
    }

    const animate = (now: number) => {
      if (now - lastRef.current >= speed) {
        lastRef.current = now
        if (indexRef.current < text.length) {
          // Advance by a few chars per frame for natural feel
          const step = Math.min(3, text.length - indexRef.current)
          indexRef.current += step
          setDisplayed(text.slice(0, indexRef.current))
        }
      }
      if (indexRef.current < text.length) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [text, isStreaming, speed])

  return displayed
}
