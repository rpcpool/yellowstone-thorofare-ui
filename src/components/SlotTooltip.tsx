import { Fragment, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import type { SlotDetail } from "@/lib/types"
import type { StageVisibility } from "./TimelineControls"

interface SlotTooltipProps {
  visible: boolean
  x: number
  y: number
  slot: number
  endpoint: SlotDetail
  endpointName: string
  visibleStages?: StageVisibility
}

export function SlotTooltip({ 
  visible, 
  x, 
  y, 
  slot, 
  endpoint, 
  endpointName,
  visibleStages = {
    download: true,
    replay: true,
    confirmation: true,
    finalization: true
  }
}: SlotTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible && tooltipRef.current) {
      const tooltip = tooltipRef.current
      const rect = tooltip.getBoundingClientRect()
      
      // Adjust position to keep tooltip on screen
      let adjustedX = x + 10
      let adjustedY = y - rect.height / 2

      // Keep tooltip within viewport
      if (adjustedX + rect.width > window.innerWidth) {
        adjustedX = x - rect.width - 10
      }
      if (adjustedY < 0) {
        adjustedY = 10
      }
      if (adjustedY + rect.height > window.innerHeight) {
        adjustedY = window.innerHeight - rect.height - 10
      }

      tooltip.style.left = `${adjustedX}px`
      tooltip.style.top = `${adjustedY}px`
    }
  }, [visible, x, y])

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    const ms = date.getMilliseconds()
    return `${date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}.${ms.toString().padStart(3, '0')}`
  }

  const formatDuration = (ms: number) => {
    if (ms < 0.001) return `${(ms * 1000000).toFixed(0)}ns`
    if (ms < 1) return `${(ms * 1000).toFixed(3)}μs`
    if (ms < 1000) return `${ms.toFixed(3)}ms`
    return `${(ms / 1000).toFixed(3)}s`
  }

  if (!visible) return null

  // Calculate total duration for visible stages only
  const calculateTotalDuration = () => {
    let total = 0
    if (visibleStages.download) total += endpoint.durations.download_ms
    if (visibleStages.replay) total += endpoint.durations.replay_ms
    if (visibleStages.confirmation) total += endpoint.durations.confirmation_ms
    if (visibleStages.finalization) total += endpoint.durations.finalization_ms
    return total
  }

  const stages = [
    { key: 'download', label: 'Download', duration: endpoint.durations.download_ms },
    { key: 'replay', label: 'Replay', duration: endpoint.durations.replay_ms },
    { key: 'confirmation', label: 'Confirmation', duration: endpoint.durations.confirmation_ms },
    { key: 'finalization', label: 'Finalization', duration: endpoint.durations.finalization_ms }
  ]

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-4 space-y-3 min-w-[320px] pointer-events-none"
      style={{ left: x, top: y }}
    >
      <div>
        <h4 className="font-semibold text-sm text-foreground">Slot {slot} - {endpointName}</h4>
        {endpoint.waiting_time_ms !== null && endpoint.waiting_time_ms > 0 && (
          <p className="text-xs text-muted-foreground">
            Waiting: {formatDuration(endpoint.waiting_time_ms)}
            {endpoint.waiting_time_ms < 1 && (
              <span className="text-yellow-500 ml-1">(sub-millisecond)</span>
            )}
          </p>
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">Stages:</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {stages
            .filter(stage => visibleStages[stage.key as keyof StageVisibility])
            .map(stage => (
              <Fragment key={stage.key}>
                <div className="text-muted-foreground">{stage.label}:</div>
                <div className="font-mono text-foreground">{formatDuration(stage.duration)}</div>
              </Fragment>
            ))
          }
        </div>
      </div>
      
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">Timeline:</p>
        <div className="text-xs space-y-0.5 font-mono">
          {endpoint.transitions.map((t, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.status}:</span>
              <span className="text-foreground">{formatTimestamp(t.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground border-t pt-2">
        Total (visible stages): {formatDuration(calculateTotalDuration())}
      </div>
    </div>,
    document.body
  )
}