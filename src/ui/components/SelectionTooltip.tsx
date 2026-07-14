interface SelectionTooltipProps {
  position: { x: number; y: number } | null
  onClick: () => void
}

export function SelectionTooltip({ position, onClick }: SelectionTooltipProps) {
  if (!position) return null

  return (
    <button
      className="selection-tooltip"
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      +
    </button>
  )
}
