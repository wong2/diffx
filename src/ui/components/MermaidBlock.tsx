import { memo, useEffect, useRef, useState } from 'react'

interface MermaidBlockProps {
  code: string
}

let mermaidIdCounter = 0
let mermaidInitialized = false

async function getMermaid() {
  const { default: mermaid } = await import('mermaid')
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
    })
    mermaidInitialized = true
  }
  return mermaid
}

function MermaidBlockImpl({ code }: MermaidBlockProps) {
  // The SVG is written imperatively into this ref rather than through React
  // state, so it is never torn down by a re-render and the raw source is never
  // shown as a fallback (previously a null-svg render flashed the code block).
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++mermaidIdCounter}`)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const mermaid = await getMermaid()
      try {
        const { svg } = await mermaid.render(idRef.current, code)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    render()
    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div style={{ border: '1px solid red', padding: '8px', borderRadius: '4px', color: 'red', fontSize: '13px' }}>
        Mermaid error: {error}
      </div>
    )
  }

  return <div className="mermaid-rendered" ref={containerRef} />
}

/** Memoized so a diagram only re-renders when its source `code` changes, not on unrelated highlight/comment state updates. */
export const MermaidBlock = memo(MermaidBlockImpl, (prev, next) => prev.code === next.code)
