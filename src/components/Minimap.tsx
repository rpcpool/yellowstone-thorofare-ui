import { useRef, useEffect, useCallback, useState } from "react"
import type { BenchmarkResult } from "@/lib/types"
import { PIXELS_PER_MS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { StageVisibility } from "./TimelineControls"

interface MinimapProps {
  data: BenchmarkResult
  zoom: number
  viewportOffset: number
  onViewportChange: (offset: number) => void
  visibleStages?: StageVisibility
}

export function Minimap({ data, zoom, viewportOffset, onViewportChange, visibleStages = {
  download: true,
  replay: true,
  confirmation: true,
  finalization: true
} }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const minimapScale = 0.05 // 5% of actual size for better overview

  // Calculate timeline bounds
  const firstTimestamp = Math.min(
    ...data.slots.flatMap(slot => [
      slot.endpoint1.transitions[0]?.timestamp || Infinity,
      slot.endpoint2.transitions[0]?.timestamp || Infinity
    ])
  )
  
  // Calculate last timestamp based on visible stages
  let lastTimestamp = firstTimestamp
  data.slots.forEach(slot => {
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const
    let ep1Time = slot.endpoint1.transitions[0]?.timestamp || firstTimestamp
    let ep2Time = slot.endpoint2.transitions[0]?.timestamp || firstTimestamp
    
    stages.forEach(stage => {
      if (visibleStages[stage]) {
        ep1Time += slot.endpoint1.durations[`${stage}_ms`]
        ep2Time += slot.endpoint2.durations[`${stage}_ms`]
      }
    })
    
    lastTimestamp = Math.max(lastTimestamp, ep1Time, ep2Time)
  })

  const totalDuration = lastTimestamp - firstTimestamp
  // Calculate available width considering the 15% padding on each side
  const availableWidth = window.innerWidth * 0.7 - 40 // 70% of screen width minus card padding
  const minimapWidth = Math.min(totalDuration * PIXELS_PER_MS * minimapScale, availableWidth)
  const viewportWidth = window.innerWidth * 0.7 // Match the content width
  const viewportWidthOnMinimap = (viewportWidth / zoom) * minimapScale
  const viewportPositionOnMinimap = viewportOffset * minimapScale / zoom

  const drawSlotLine = useCallback((
    ctx: CanvasRenderingContext2D, 
    endpoint: typeof data.slots[0]['endpoint1'],
    otherEndpoint: typeof data.slots[0]['endpoint2'],
    baseTime: number,
    y: number,
    color: string,
    opacity: number = 1
  ) => {
    const startTime = endpoint.transitions[0]?.timestamp || baseTime
    const otherStartTime = otherEndpoint.transitions[0]?.timestamp || baseTime
    
    // Draw waiting block if this endpoint was slower
    if (endpoint.waiting_time_ms && endpoint.waiting_time_ms > 0) {
      const waitX = (otherStartTime - baseTime) * PIXELS_PER_MS * minimapScale
      const waitWidth = endpoint.waiting_time_ms * PIXELS_PER_MS * minimapScale
      
      ctx.fillStyle = `rgba(156, 163, 175, ${opacity * 0.5})` // gray-400 with opacity
      ctx.fillRect(waitX, y, Math.max(waitWidth, 1), 3)
    }
    
    // Calculate end time based on visible stages
    let endTime = startTime
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const
    stages.forEach(stage => {
      if (visibleStages[stage]) {
        endTime += endpoint.durations[`${stage}_ms`]
      }
    })
    
    const x = (startTime - baseTime) * PIXELS_PER_MS * minimapScale
    const width = (endTime - startTime) * PIXELS_PER_MS * minimapScale

    ctx.fillStyle = color
    ctx.globalAlpha = opacity
    ctx.fillRect(x, y, Math.max(width, 1), 3)
    ctx.globalAlpha = 1
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimapScale, visibleStages])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = minimapWidth
    canvas.height = Math.min(data.slots.length * 5, 100)

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw slots
    data.slots.forEach((slot, index) => {
      const y = (index / data.slots.length) * canvas.height
      const opacity = 0.8

      // EP1
      drawSlotLine(ctx, slot.endpoint1, slot.endpoint2, firstTimestamp, y, '#3b82f6', opacity)
      
      // EP2
      drawSlotLine(ctx, slot.endpoint2, slot.endpoint1, firstTimestamp, y + 2, '#22c55e', opacity)
    })
  }, [data, minimapScale, minimapWidth, drawSlotLine, firstTimestamp, visibleStages])

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
    updateViewport(e)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      updateViewport(e)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const updateViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const x = e.clientX - rect.left
    const clickPosition = x - viewportWidthOnMinimap / 2
    const offset = (clickPosition * zoom) / minimapScale
    const maxOffset = totalDuration * PIXELS_PER_MS * zoom - viewportWidth
    
    onViewportChange(Math.max(0, Math.min(offset, maxOffset)))
  }

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false)
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const clickPosition = x - viewportWidthOnMinimap / 2
        const offset = (clickPosition * zoom) / minimapScale
        const maxOffset = totalDuration * PIXELS_PER_MS * zoom - viewportWidth
        
        onViewportChange(Math.max(0, Math.min(offset, maxOffset)))
      }
    }

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp)
      document.addEventListener('mousemove', handleGlobalMouseMove)
      
      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp)
        document.removeEventListener('mousemove', handleGlobalMouseMove)
      }
    }
  }, [isDragging, viewportWidthOnMinimap, zoom, minimapScale, totalDuration, viewportWidth, onViewportChange])

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="text-sm font-semibold mb-2">Timeline Overview</div>
      <div 
        ref={containerRef}
        className="relative bg-background rounded-lg p-2 cursor-pointer overflow-x-auto overflow-y-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ userSelect: 'none' }}
      >
        <div 
          className="relative"
          style={{ width: minimapWidth, height: Math.min(data.slots.length * 5, 100) }}
        >
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{ width: '100%', height: '100%' }}
          />
          
          {/* Viewport indicator */}
          <div
            className={cn(
              "absolute top-0 bottom-0 bg-primary/20 border-2 border-primary rounded transition-all",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{
              left: `${viewportPositionOnMinimap}px`,
              width: `${viewportWidthOnMinimap}px`,
              pointerEvents: 'none'
            }}
          >
            <div className="absolute inset-0 bg-primary/10" />
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-primary/50" />
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        Click or drag to navigate • {data.slots.length} slots
      </div>
    </div>
  )
}