import { useRef, useEffect, useState, useCallback } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { BenchmarkResult, SlotComparison, SlotDetail } from "@/lib/types"
import { STAGE_COLORS, STAGE_LABELS, ENDPOINT_COLORS, PIXELS_PER_MS, ROW_HEIGHT, STAGE_HEIGHT, STAGE_SPACING } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { SlotTooltip } from "./SlotTooltip"
import type { StageVisibility } from "./TimelineControls"

interface TimelineProps {
  data: BenchmarkResult
  zoom: number
  viewportOffset?: number
  onViewportChange?: (offset: number) => void
  visibleStages: StageVisibility
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  slot: number
  endpoint: SlotDetail | null
  endpointName: string
}

interface VirtualItem {
  type: 'header' | 'slot'
  data: number | SlotComparison
  index: number
}

interface TimeDifference {
  stage: string
  difference: number
  ep1Ahead: boolean
}

interface ProcessedStage {
  type: 'waiting' | 'download' | 'replay' | 'confirmation' | 'finalization'
  startTime: number
  endTime: number
  duration: number
  label: string
  parallel: boolean
  parallelIndex: number
}

export function Timeline({ data, zoom, viewportOffset = 0, onViewportChange, visibleStages }: TimelineProps) {
  const horizontalScrollRef = useRef<HTMLDivElement>(null)
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    slot: 0,
    endpoint: null,
    endpointName: ''
  })
  const [timeDifferences, setTimeDifferences] = useState<TimeDifference[] | null>(null)

  // Process transitions to get actual stage timings
  const processStages = (endpoint: SlotDetail, otherEndpoint: SlotDetail): ProcessedStage[] => {
    const stages: ProcessedStage[] = []
    const transitions = endpoint.transitions
    
    // Find transition timestamps
    const firstShred = transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const completed = transitions.find(t => t.status === "Completed")?.timestamp || 0
    const createdBank = transitions.find(t => t.status === "CreatedBank")?.timestamp || 0
    const processed = transitions.find(t => t.status === "Processed")?.timestamp || 0
    const confirmed = transitions.find(t => t.status === "Confirmed")?.timestamp || 0
    const finalized = transitions.find(t => t.status === "Finalized")?.timestamp || 0

    // Get the other endpoint's first timestamp
    const otherFirstShred = otherEndpoint.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0

    // Add waiting time block if this endpoint was slower (first shred delay)
    if (endpoint.first_shred_delay_ms !== null && endpoint.first_shred_delay_ms !== undefined && endpoint.first_shred_delay_ms > 0) {
      // This endpoint had to wait for the other one
      // The waiting block shows from when the faster endpoint started to when this one started
      stages.push({
        type: 'waiting',
        startTime: otherFirstShred,  // When the faster endpoint started
        endTime: firstShred,         // When this endpoint started
        duration: endpoint.first_shred_delay_ms,
        label: `Wait ${endpoint.first_shred_delay_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // Download stage (FirstShredReceived -> Completed)
    if (visibleStages.download && firstShred && completed) {
      stages.push({
        type: 'download',
        startTime: firstShred,
        endTime: completed,
        duration: endpoint.durations.download_ms,
        label: `${STAGE_LABELS.download} ${Math.round(endpoint.durations.download_ms)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // Replay stage (CreatedBank -> Processed)
    if (visibleStages.replay && createdBank && processed) {
      stages.push({
        type: 'replay',
        startTime: createdBank,
        endTime: processed,
        duration: endpoint.durations.replay_ms,
        label: `${STAGE_LABELS.replay} ${Math.round(endpoint.durations.replay_ms)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // Confirmation stage (Processed -> Confirmed)
    if (visibleStages.confirmation && processed && confirmed) {
      stages.push({
        type: 'confirmation',
        startTime: processed,
        endTime: confirmed,
        duration: endpoint.durations.confirmation_ms,
        label: `${STAGE_LABELS.confirmation} ${Math.round(endpoint.durations.confirmation_ms)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // Finalization stage (Confirmed -> Finalized)
    if (visibleStages.finalization && confirmed && finalized) {
      stages.push({
        type: 'finalization',
        startTime: confirmed,
        endTime: finalized,
        duration: endpoint.durations.finalization_ms,
        label: `${STAGE_LABELS.finalization} ${Math.round(endpoint.durations.finalization_ms)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // Detect parallel stages and assign parallel indices
    for (let i = 0; i < stages.length; i++) {
      stages[i].parallelIndex = 0
      stages[i].parallel = false
      
      if (stages[i].type === 'waiting') continue
      
      for (let j = 0; j < i; j++) {
        if (stages[j].type === 'waiting') continue
        
        // Check if stages overlap
        if (stages[i].startTime < stages[j].endTime && stages[i].endTime > stages[j].startTime) {
          stages[i].parallel = true
          stages[j].parallel = true
          // Find the lowest available parallel index
          if (stages[j].parallelIndex >= stages[i].parallelIndex) {
            stages[i].parallelIndex = stages[j].parallelIndex + 1
          }
        }
      }
    }
    
    // Group sequential processing stages together visually
    // If any of replay/confirmation/finalization needs to be parallel, they all should be
    const processingStages = stages.filter(s => 
      s.type === 'replay' || s.type === 'confirmation' || s.type === 'finalization'
    )
    
    if (processingStages.length > 0) {
      // Find the highest parallelIndex among processing stages
      const maxProcessingIndex = Math.max(...processingStages.map(s => s.parallelIndex))
      
      // If any processing stage is parallel, move them all to the same level
      if (maxProcessingIndex > 0) {
        processingStages.forEach(s => {
          s.parallelIndex = maxProcessingIndex
          s.parallel = true
        })
      }
    }

    return stages
  } 

  // Calculate timeline bounds - include waiting time in calculation
  const firstTimestamp = Math.min(
    ...data.slots.flatMap(slot => {
      const ep1First = slot.endpoint1.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
      const ep2First = slot.endpoint2.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
      return Math.min(ep1First, ep2First)
    })
  )
  
  const lastTimestamp = Math.max(
    ...data.slots.flatMap(slot => [
      slot.endpoint1.transitions[slot.endpoint1.transitions.length - 1]?.timestamp || 0,
      slot.endpoint2.transitions[slot.endpoint2.transitions.length - 1]?.timestamp || 0
    ])
  )

  const totalDuration = lastTimestamp - firstTimestamp
  const pixelsPerMs = PIXELS_PER_MS * zoom
  const timelineWidth = totalDuration * pixelsPerMs + 200

  // Calculate row heights based on parallel stages
  const calculateRowHeight = (slot: SlotComparison): number => {
    const ep1Stages = processStages(slot.endpoint1, slot.endpoint2)
    const ep2Stages = processStages(slot.endpoint2, slot.endpoint1)
    
    const maxParallelEp1 = Math.max(...ep1Stages.map(s => s.parallelIndex), 0) + 1
    const maxParallelEp2 = Math.max(...ep2Stages.map(s => s.parallelIndex), 0) + 1
    const maxParallel = Math.max(maxParallelEp1, maxParallelEp2)
    
    // Base height + additional height for parallel stages
    return ROW_HEIGHT + (maxParallel > 1 ? (maxParallel - 1) * (STAGE_HEIGHT + STAGE_SPACING) : 0)
  }

  const groupHeaderHeight = 30

  // Virtual items include both slots and group headers
  const virtualItems: VirtualItem[] = []
  data.slots.forEach((slot, index) => {
    if (index % 10 === 0) {
      virtualItems.push({ type: 'header', data: index, index: virtualItems.length })
    }
    virtualItems.push({ type: 'slot', data: slot, index: virtualItems.length })
  })

  // Setup virtualizer
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index]
      if (item.type === 'header') return groupHeaderHeight
      
      const slot = item.data as SlotComparison
      const rowHeight = calculateRowHeight(slot)
      // Each slot has 2 rows (EP1 and EP2)
      return rowHeight * 2
    },
    overscan: 5,
  })

  // Update scroll position when viewport offset changes
  useEffect(() => {
    if (horizontalScrollRef.current) {
      horizontalScrollRef.current.scrollLeft = viewportOffset
    }
  }, [viewportOffset])

  // Handle horizontal scroll
  const handleHorizontalScroll = useCallback((e: Event) => {
    if (onViewportChange && e.target) {
      const target = e.target as HTMLElement
      onViewportChange(target.scrollLeft)
    }
  }, [onViewportChange])

  useEffect(() => {
    const scrollContainer = horizontalScrollRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleHorizontalScroll, { passive: true })
      return () => scrollContainer.removeEventListener('scroll', handleHorizontalScroll)
    }
  }, [handleHorizontalScroll])

  const handleMouseEnter = (e: React.MouseEvent, slot: number, endpoint: SlotDetail, endpointName: string) => {
    setTooltip({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      slot,
      endpoint,
      endpointName
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltip.visible) {
      setTooltip(prev => ({
        ...prev,
        x: e.clientX,
        y: e.clientY
      }))
    }
  }

  const handleMouseLeave = () => {
    setTooltip(prev => ({
      ...prev,
      visible: false
    }))
  }

  const calculateTimeDifferences = (slot: SlotComparison): TimeDifference[] => {
    const differences: TimeDifference[] = []
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const
    
    let ep1Time = slot.endpoint1.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    let ep2Time = slot.endpoint2.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    
    stages.forEach(stage => {
      if (visibleStages[stage]) {
        ep1Time += slot.endpoint1.durations[`${stage}_ms`]
        ep2Time += slot.endpoint2.durations[`${stage}_ms`]
        
        const diff = Math.abs(ep1Time - ep2Time)
        differences.push({
          stage,
          difference: diff,
          ep1Ahead: ep1Time < ep2Time
        })
      }
    })
    
    return differences
  }

  const renderVirtualSlot = (slot: SlotComparison, virtualIndex: number) => {
    const isHovered = hoveredSlot === slot.slot
    const rowHeight = calculateRowHeight(slot)

    return (
      <div 
        key={`slot-${slot.slot}`}
        className="relative"
        onMouseEnter={() => {
          setHoveredSlot(slot.slot)
          setTimeDifferences(calculateTimeDifferences(slot))
          setTimeout(() => {
            const element = document.querySelector(`[data-index="${virtualIndex}"]`) as HTMLElement
            if (element) {
              rowVirtualizer.measureElement(element)
            }
          }, 0)
        }}
        onMouseLeave={() => {
          setHoveredSlot(null)
          setTimeDifferences(null)
          setTimeout(() => {
            const element = document.querySelector(`[data-index="${virtualIndex}"]`) as HTMLElement
            if (element) {
              rowVirtualizer.measureElement(element)
            }
          }, 0)
        }}
      >
        {/* Show time differences on hover */}
        {isHovered && timeDifferences && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex gap-2">
            {timeDifferences.map((diff, idx) => (
              <div
                key={idx}
                className="bg-background/90 backdrop-blur-sm border rounded px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{diff.stage}:</span>
                <span className={cn(
                  "ml-1 font-mono",
                  diff.ep1Ahead ? "text-[#DA05E2]" : "text-[#2C0FDF]"
                )}>
                  {diff.ep1Ahead ? "EP1" : "EP2"} +{diff.difference.toFixed(1)}ms
                </span>
              </div>
            ))}
          </div>
        )}

        {/* EP1 Row */}
        <div 
          className="relative border-b border-border/50 transition-all"
          style={{ height: rowHeight }}
        >
          {/* Label */}
          <div className={cn(
            "absolute left-2 text-sm font-mono z-10",
            ENDPOINT_COLORS.ep1
          )}>
            {slot.slot} EP1
          </div>

          {/* Stages */}
          <div className="absolute left-0 top-0 w-full h-full">
            {renderStages(slot.endpoint1, slot.endpoint2, firstTimestamp, pixelsPerMs, 'EP1', slot.slot)}
          </div>
        </div>

        {/* EP2 Row */}
        <div 
          className="relative border-b border-border/50 transition-all"
          style={{ height: rowHeight }}
        >
          {/* Label */}
          <div className={cn(
            "absolute left-2 text-sm font-mono z-10",
            ENDPOINT_COLORS.ep2
          )}>
            {slot.slot} EP2
          </div>

          {/* Stages */}
          <div className="absolute left-0 top-0 w-full h-full">
            {renderStages(slot.endpoint2, slot.endpoint1, firstTimestamp, pixelsPerMs, 'EP2', slot.slot)}
          </div>
        </div>
      </div>
    )
  }

  const renderGroupHeader = (startIndex: number) => {
    const endIndex = Math.min(startIndex + 9, data.slots.length - 1)
    return (
      <div 
        key={`header-${startIndex}`}
        className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm border-b text-sm font-semibold p-2"
        style={{ height: groupHeaderHeight }}
      >
        Slots {data.slots[startIndex].slot} - {data.slots[endIndex].slot}
      </div>
    )
  }

  const renderStages = (
    endpoint: SlotDetail,
    otherEndpoint: SlotDetail,
    baseTime: number,
    scale: number,
    endpointName: string,
    slotNumber: number
  ) => {
    const stages = processStages(endpoint, otherEndpoint)
    
    return (
      <>
        {stages.map((stage, idx) => {
          const relativeStart = (stage.startTime - baseTime) * scale + 150
          const width = Math.max(stage.duration * scale, 2)

          // Calculate vertical position based on parallel index
          const yPosition = `${ROW_HEIGHT / 2 + stage.parallelIndex * (STAGE_HEIGHT + STAGE_SPACING)}px`

          return (
            <div
              key={`${stage.type}-${idx}`}
              className={cn(
                "absolute flex items-center justify-center rounded text-xs text-white font-semibold transition-all cursor-pointer hover:z-10 hover:brightness-110",
                stage.type === 'waiting' ? "bg-gray-500 opacity-70 border-2 border-dashed border-gray-300" : STAGE_COLORS[stage.type as keyof typeof STAGE_COLORS]
              )}
              style={{
                left: `${relativeStart}px`,
                top: yPosition,
                transform: 'translateY(-50%)',
                width: `${width}px`,
                height: `${STAGE_HEIGHT}px`,
                backgroundImage: stage.type === 'waiting' ? 
                  'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)' : 
                  undefined
              }}
              onMouseEnter={(e) => handleMouseEnter(e, slotNumber, endpoint, endpointName)}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {width > 60 && (
                <span className="truncate px-2 text-[11px]">
                  {stage.label}
                </span>
              )}
              {width > 30 && width <= 60 && (
                <span className="truncate px-1 text-[10px]">
                  {stage.type === 'waiting' ? '⏱' : stage.type.substring(0, 1).toUpperCase()} {Math.round(stage.duration)}
                </span>
              )}
              {width <= 30 && stage.type === 'waiting' && (
                <span className="text-[10px]">⏱</span>
              )}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      {/* Time axis header */}
      <div className="sticky top-0 z-20 bg-card border-b h-10">
        <TimeAxis 
          duration={totalDuration}
          zoom={zoom}
          viewportOffset={viewportOffset}
        />
      </div>

      {/* Timeline viewport with virtual scrolling */}
      <div className="relative" style={{ height: '600px' }}>
        {/* Horizontal scroll container */}
        <div 
          ref={horizontalScrollRef}
          className="absolute inset-0 overflow-x-auto overflow-y-hidden"
        >
          <div style={{ width: timelineWidth, height: '100%' }}>
            {/* Vertical virtual scroll container */}
            <div
              ref={parentRef}
              className="h-full overflow-y-auto"
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = virtualItems[virtualRow.index]
                  
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {item.type === 'header' 
                        ? renderGroupHeader(item.data as number)
                        : renderVirtualSlot(item.data as SlotComparison, virtualRow.index)
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.endpoint && (
        <SlotTooltip
          visible={tooltip.visible}
          x={tooltip.x}
          y={tooltip.y}
          slot={tooltip.slot}
          endpoint={tooltip.endpoint}
          endpointName={tooltip.endpointName}
          visibleStages={visibleStages}
        />
      )}
    </div>
  )
}

// Time axis component
function TimeAxis({ 
  duration, 
  zoom,
  viewportOffset = 0
}: { 
  duration: number
  zoom: number
  viewportOffset?: number
}) {
  const pixelsPerMs = PIXELS_PER_MS * zoom
  const tickInterval = getTickInterval(duration / zoom)
  const ticks = []

  for (let time = 0; time <= duration; time += tickInterval) {
    const x = time * pixelsPerMs + 150 - viewportOffset
    
    if (x >= -50 && x <= window.innerWidth) {
      ticks.push(
        <div
          key={time}
          className="absolute top-0 bottom-0 border-l border-border/50"
          style={{ left: `${x}px` }}
        >
          <span className="absolute top-2 left-1 text-xs text-muted-foreground whitespace-nowrap">
            +{formatTime(time)}
          </span>
        </div>
      )
    }
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-36 bg-card z-10 border-r flex items-center px-2">
        <span className="text-xs font-semibold text-muted-foreground">Time</span>
      </div>
      {ticks}
    </div>
  )
}

function getTickInterval(visibleDuration: number): number {
  if (visibleDuration > 5000) return 1000
  if (visibleDuration > 2000) return 500
  if (visibleDuration > 1000) return 200
  if (visibleDuration > 500) return 100
  if (visibleDuration > 200) return 50
  if (visibleDuration > 100) return 20
  return 10
}

function formatTime(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${ms}ms`
}