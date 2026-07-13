import { useEffect, useRef, useState } from 'react'

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

export function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++mermaidIdCounter}`)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const mermaid = await getMermaid()
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, code)
        if (!cancelled) setSvg(rendered)
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

  if (!svg) return <pre><code>{code}</code></pre>

  return <div dangerouslySetInnerHTML={{ __html: svg }} />
}
