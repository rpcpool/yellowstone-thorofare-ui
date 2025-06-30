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
    confirmation: true
  }
}: SlotTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible && tooltipRef.current) {
      const tooltip = tooltipRef.current
      const rect = tooltip.getBoundingClientRect()
      
      // offset more from cursor to prevent interference
      let adjustedX = x + 20
      let adjustedY = y - rect.height / 2

      // keep within viewport
      if (adjustedX + rect.width > window.innerWidth - 10) {
        adjustedX = x - rect.width - 20
      }
      if (adjustedY < 10) {
        adjustedY = 10
      }
      if (adjustedY + rect.height > window.innerHeight - 10) {
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

  const calculateTotalDuration = () => {
    const firstShredTransition = endpoint.transitions.find(t => t.status === 'FirstShredReceived')
    const confirmedTransition = endpoint.transitions.find(t => t.status === 'Confirmed')
    
    if (confirmedTransition && firstShredTransition) {
      return confirmedTransition.timestamp - firstShredTransition.timestamp
    }
    
    return 0
  }

  const stages = [
    { key: 'download', label: 'Download', duration: endpoint.durations.download_ms },
    { key: 'replay', label: 'Replay', duration: endpoint.durations.replay_ms },
    { key: 'confirmation', label: 'Confirmation', duration: endpoint.durations.confirmation_ms }
  ]

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-4 space-y-3 min-w-[320px] pointer-events-none select-none"
      style={{ 
        left: x, 
        top: y,
        pointerEvents: 'none'
      }}
    >
      <div>
        <h4 className="font-semibold text-sm text-foreground">Slot {slot} - {endpointName}</h4>
        
        {/* show all delays if present */}
        <div className="space-y-0.5 mt-1">
          {endpoint.first_shred_delay_ms !== null && endpoint.first_shred_delay_ms > 0 && (
            <p className="text-xs text-muted-foreground">
              First Shred Delay: {formatDuration(endpoint.first_shred_delay_ms)}
              {endpoint.first_shred_delay_ms < 1 && (
                <span className="text-yellow-500 ml-1">(sub-ms)</span>
              )}
            </p>
          )}
          {endpoint.processing_delay_ms !== null && endpoint.processing_delay_ms > 0 && (
            <p className="text-xs text-muted-foreground">
              Processed Delay: {formatDuration(endpoint.processing_delay_ms)}
            </p>
          )}
          {endpoint.confirmation_delay_ms !== null && endpoint.confirmation_delay_ms > 0 && (
            <p className="text-xs text-muted-foreground">
              Confirmation Delay: {formatDuration(endpoint.confirmation_delay_ms)}
            </p>
          )}
        </div>
      </div>
      
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">Stage Durations:</p>
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
        <p className="text-xs font-semibold text-muted-foreground">Status Transitions:</p>
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
        Total slot duration: {formatDuration(calculateTotalDuration())}
      </div>
    </div>,
    document.body
  )
}