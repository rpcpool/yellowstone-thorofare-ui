import { useRef, useEffect, useState, useCallback } from "react"
import type { BenchmarkResult, SlotDetail, SlotComparison } from "@/lib/types"
import { STAGE_COLORS, STAGE_LABELS, ENDPOINT_COLORS, PIXELS_PER_MS, STAGE_HEIGHT, STAGE_SPACING } from "@/lib/constants"
import { parseEndpointName } from "@/lib/endpoint-utils"
import { cn } from "@/lib/utils"
import { SlotTooltip } from "./SlotTooltip"
import type { StageVisibility } from "./TimelineControls"

interface TimelineProps {
  data: BenchmarkResult
  zoom: number
  viewportOffset?: number
  onViewportChange?: (offset: number) => void
  visibleStages: StageVisibility
  endpointNames?: [string | null, string | null]
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  slot: number
  endpoint: SlotDetail | null
  endpointName: string
}

interface ProcessedStage {
  type: 'first_shred_delay' | 'confirmation_delay' | 'download' | 'replay' | 'confirmation'
  startTime: number
  endTime: number
  duration: number
  label: string
  parallel: boolean
  parallelIndex: number
}

interface SlotWithLane {
  slot: SlotComparison
  lane: number
  startTime: number
  endTime: number
}

// constants for layout
const SLOT_HEIGHT = 60
const TIMELINE_PADDING = 40
const HEADER_HEIGHT = 40

// time axis component
interface TimeAxisProps {
  duration: number
  zoom: number
  viewportOffset?: number
  windowWidth: number
}

const TimeAxis: React.FC<TimeAxisProps> = ({ 
  duration, 
  zoom,
  viewportOffset = 0,
  windowWidth
}) => {
  const pixelsPerMs = PIXELS_PER_MS * zoom
  const tickInterval = getTickInterval(duration / zoom)
  const ticks = []
  
  const getContainerPercentage = () => {
    if (windowWidth < 640) return 0.95
    if (windowWidth < 1024) return 0.90
    if (windowWidth < 1280) return 0.85
    return 0.80
  }
  
  const containerWidth = windowWidth * getContainerPercentage() - 32
  
  for (let time = 0; time <= duration; time += tickInterval) {
    const x = time * pixelsPerMs - viewportOffset
    
    if (x >= -50 && x <= containerWidth + 50) {
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
    <div className="relative h-full overflow-hidden w-full">
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

export function Timeline({ data, zoom, viewportOffset = 0, onViewportChange, visibleStages, endpointNames }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0 })
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    slot: 0,
    endpoint: null,
    endpointName: ''
  })

  // handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // process stages for a given endpoint
  const processStages = (endpoint: SlotDetail, otherEndpoint: SlotDetail): ProcessedStage[] => {
    const stages: ProcessedStage[] = []
    const transitions = endpoint.transitions
    
    // find transition timestamps
    const firstShred = transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const completed = transitions.find(t => t.status === "Completed")?.timestamp || 0
    const createdBank = transitions.find(t => t.status === "CreatedBank")?.timestamp || 0
    const processed = transitions.find(t => t.status === "Processed")?.timestamp || 0
    const confirmed = transitions.find(t => t.status === "Confirmed")?.timestamp || 0

    // get the other endpoint's timestamps
    const otherFirstShred = otherEndpoint.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const otherConfirmed = otherEndpoint.transitions.find(t => t.status === "Confirmed")?.timestamp || 0

    // first shred delay
    if (endpoint.first_shred_delay_ms !== null && endpoint.first_shred_delay_ms !== undefined && endpoint.first_shred_delay_ms > 0) {
      stages.push({
        type: 'first_shred_delay',
        startTime: otherFirstShred,
        endTime: firstShred,
        duration: endpoint.first_shred_delay_ms,
        label: `Reception delay ${endpoint.first_shred_delay_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // download stage
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

    // replay stage
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

    // confirmation delay - show before confirmation stage
    if (endpoint.confirmation_delay_ms !== null && endpoint.confirmation_delay_ms !== undefined && endpoint.confirmation_delay_ms > 0) {
      // this endpoint saw confirmation later
      const confirmationDelayStart = Math.min(otherConfirmed, confirmed - endpoint.confirmation_delay_ms)
      stages.push({
        type: 'confirmation_delay',
        startTime: confirmationDelayStart,
        endTime: confirmationDelayStart + endpoint.confirmation_delay_ms,
        duration: endpoint.confirmation_delay_ms,
        label: `Confirmation delay ${endpoint.confirmation_delay_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // confirmation stage
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

    // detect parallel stages
    for (let i = 0; i < stages.length; i++) {
      stages[i].parallelIndex = 0
      stages[i].parallel = false
      
      if (stages[i].type === 'first_shred_delay' || stages[i].type === 'confirmation_delay') continue
      
      for (let j = 0; j < i; j++) {
        if (stages[j].type === 'first_shred_delay' || stages[j].type === 'confirmation_delay') continue
        
        // check if stages overlap
        if (stages[i].startTime < stages[j].endTime && stages[i].endTime > stages[j].startTime) {
          stages[i].parallel = true
          stages[j].parallel = true
          // find the lowest available parallel index
          if (stages[j].parallelIndex >= stages[i].parallelIndex) {
            stages[i].parallelIndex = stages[j].parallelIndex + 1
          }
        }
      }
    }
    
    // group sequential processing stages
    const processingStages = stages.filter(s => 
      s.type === 'replay' || s.type === 'confirmation'
    )
    
    if (processingStages.length > 0) {
      const maxProcessingIndex = Math.max(...processingStages.map(s => s.parallelIndex))
      
      if (maxProcessingIndex > 0) {
        processingStages.forEach(s => {
          s.parallelIndex = maxProcessingIndex
          s.parallel = true
        })
      }
    }

    return stages
  }

  // calculate slot end times for lane assignment
  const getSlotTimeRange = (slot: SlotComparison, endpoint: 'endpoint1' | 'endpoint2'): { start: number, end: number } => {
    const endpointData = slot[endpoint]
    const transitions = endpointData.transitions
    
    // get actual transition timestamps
    const firstShred = transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const confirmed = transitions.find(t => t.status === "Confirmed")?.timestamp || 0
    const processed = transitions.find(t => t.status === "Processed")?.timestamp || 0
    const completed = transitions.find(t => t.status === "Completed")?.timestamp || 0
    
    // find the last timestamp based on visible stages
    let lastTime = firstShred
    if (visibleStages.download && completed > lastTime) lastTime = completed
    if (visibleStages.replay && processed > lastTime) lastTime = processed
    if (visibleStages.confirmation && confirmed > lastTime) lastTime = confirmed
    
    return { start: firstShred, end: lastTime }
  }

  // assign slots to lanes to avoid overlaps
  const assignSlotLanes = (slots: SlotComparison[], endpoint: 'endpoint1' | 'endpoint2'): SlotWithLane[] => {
    const slotsWithLanes: SlotWithLane[] = []
    const lanes: { endTime: number }[] = []
    
    // sort slots by start time
    const sortedSlots = [...slots].sort((a, b) => {
      const aStart = getSlotTimeRange(a, endpoint).start
      const bStart = getSlotTimeRange(b, endpoint).start
      return aStart - bStart
    })
    
    sortedSlots.forEach(slot => {
      const { start, end } = getSlotTimeRange(slot, endpoint)
      
      // find the first available lane
      let assignedLane = -1
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i].endTime <= start) {
          assignedLane = i
          lanes[i].endTime = end
          break
        }
      }
      
      // if no lane available, create a new one
      if (assignedLane === -1) {
        assignedLane = lanes.length
        lanes.push({ endTime: end })
      }
      
      slotsWithLanes.push({
        slot,
        lane: assignedLane,
        startTime: start,
        endTime: end
      })
    })
    
    return slotsWithLanes
  }

  // calculate timeline bounds
  const firstTimestamp = Math.min(
    ...data.slots.flatMap(slot => {
      const ep1First = slot.endpoint1.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
      const ep2First = slot.endpoint2.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
      return Math.min(ep1First, ep2First)
    })
  )
  
  const lastTimestamp = Math.max(
    ...data.slots.flatMap(slot => {
      const range1 = getSlotTimeRange(slot, 'endpoint1')
      const range2 = getSlotTimeRange(slot, 'endpoint2')
      return Math.max(range1.end, range2.end)
    })
  )

  const totalDuration = lastTimestamp - firstTimestamp
  const pixelsPerMs = PIXELS_PER_MS * zoom
  
  // calculate timeline width
  const getContainerPercentage = () => {
    if (windowWidth < 640) return 0.95
    if (windowWidth < 1024) return 0.90
    if (windowWidth < 1280) return 0.85
    return 0.80
  }
  
  const containerWidth = windowWidth * getContainerPercentage() - 32
  const minWidth = containerWidth - 40
  const calculatedWidth = totalDuration * pixelsPerMs + 200
  const timelineWidth = Math.max(minWidth, calculatedWidth)

  // assign lanes for both endpoints
  const ep1Slots = assignSlotLanes(data.slots, 'endpoint1')
  const ep2Slots = assignSlotLanes(data.slots, 'endpoint2')
  
  const maxEp1Lanes = Math.max(...ep1Slots.map(s => s.lane)) + 1
  const maxEp2Lanes = Math.max(...ep2Slots.map(s => s.lane)) + 1
  
  const ep1Height = maxEp1Lanes * SLOT_HEIGHT + TIMELINE_PADDING
  const ep2Height = maxEp2Lanes * SLOT_HEIGHT + TIMELINE_PADDING
  const totalHeight = ep1Height + ep2Height + 80

  // handle drag scrolling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX,
      scrollLeft: scrollRef.current?.scrollLeft || 0
    })
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    
    const dx = e.clientX - dragStart.x
    scrollRef.current.scrollLeft = dragStart.scrollLeft - dx
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // global mouse events for drag
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!scrollRef.current) return
        const dx = e.clientX - dragStart.x
        scrollRef.current.scrollLeft = dragStart.scrollLeft - dx
      }
      
      const handleGlobalMouseUp = () => {
        setIsDragging(false)
      }
      
      document.addEventListener('mousemove', handleGlobalMouseMove)
      document.addEventListener('mouseup', handleGlobalMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove)
        document.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [isDragging, dragStart])

  // update scroll position
  useEffect(() => {
    if (scrollRef.current && viewportOffset !== undefined) {
      scrollRef.current.scrollLeft = viewportOffset
    }
  }, [viewportOffset])

  // handle scroll events
  const handleScroll = useCallback(() => {
    if (onViewportChange && scrollRef.current) {
      onViewportChange(scrollRef.current.scrollLeft)
    }
  }, [onViewportChange])

  // tooltip handlers
  const handleStageMouseEnter = (e: React.MouseEvent, slot: number, endpoint: SlotDetail, endpointName: string) => {
    setTooltip({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      slot,
      endpoint,
      endpointName
    })
  }

  const handleStageMouseMove = (e: React.MouseEvent) => {
    if (tooltip.visible) {
      setTooltip(prev => ({
        ...prev,
        x: e.clientX,
        y: e.clientY
      }))
    }
  }

  const handleStageMouseLeave = () => {
    setTooltip(prev => ({
      ...prev,
      visible: false
    }))
  }

  // render stages for an endpoint
  const renderStages = (
    endpoint: SlotDetail,
    otherEndpoint: SlotDetail,
    baseTime: number,
    scale: number,
    endpointName: string,
    slotNumber: number,
    yOffset: number
  ) => {
    const stages = processStages(endpoint, otherEndpoint)
    
    return stages.map((stage, idx) => {
      const relativeStart = (stage.startTime - baseTime) * scale
      const width = Math.max(stage.duration * scale, 2)
      
      // vertical position based on parallel index
      const y = yOffset + SLOT_HEIGHT / 2 + stage.parallelIndex * (STAGE_HEIGHT + STAGE_SPACING)

      // delay stages get special styling
      const isDelay = stage.type === 'first_shred_delay' || stage.type === 'confirmation_delay'

      return (
        <div
          key={`${stage.type}-${idx}`}
          className={cn(
            "absolute flex items-center justify-center rounded text-xs text-white font-semibold transition-all cursor-pointer hover:z-20 hover:brightness-110",
            isDelay ? `${STAGE_COLORS.waiting} opacity-70 border-2 border-dashed border-gray-300` : STAGE_COLORS[stage.type as keyof typeof STAGE_COLORS]
          )}
          style={{
            left: `${relativeStart}px`,
            top: `${y}px`,
            transform: 'translateY(-50%)',
            width: `${width}px`,
            height: `${STAGE_HEIGHT}px`,
            backgroundImage: isDelay ? 
              'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)' : 
              undefined
          }}
          onMouseEnter={(e) => handleStageMouseEnter(e, slotNumber, endpoint, endpointName)}
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
        >
          {width > 60 && (
            <span className="truncate px-2 text-[11px]">
              {stage.label}
            </span>
          )}
          {width > 30 && width <= 60 && (
            <span className="truncate px-1 text-[10px]">
              {isDelay ? '⏱' : stage.type.substring(0, 1).toUpperCase()} {Math.round(stage.duration)}
            </span>
          )}
          {width <= 30 && isDelay && (
            <span className="text-[10px]">⏱</span>
          )}
        </div>
      )
    })
  }

  return (
    <div className="bg-card rounded-lg border overflow-hidden w-full max-w-full">
      {/* fixed header with time axis */}
      <div className="sticky top-0 z-30 bg-card border-b overflow-hidden" style={{ height: HEADER_HEIGHT }}>
        <TimeAxis 
          duration={totalDuration}
          zoom={zoom}
          viewportOffset={viewportOffset || 0}
          windowWidth={windowWidth}
        />
      </div>

      {/* scrollable timeline content */}
      <style>{`
        .timeline-scroll::-webkit-scrollbar {
          height: 12px;
          width: 12px;
        }
        .timeline-scroll::-webkit-scrollbar-track {
          background: hsl(var(--muted));
        }
        .timeline-scroll::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 6px;
        }
        .timeline-scroll::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--foreground) / 0.3);
        }
      `}</style>
      <div 
        ref={scrollRef}
        className={cn(
          "timeline-scroll relative overflow-x-auto overflow-y-auto",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ 
          height: '600px',
          maxWidth: '100%',
          overflowX: 'auto'
        }}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div style={{ 
          width: timelineWidth, 
          height: totalHeight, 
          position: 'relative',
          minWidth: '100%'
        }}>
          {/* ep1 timeline */}
          <div className="absolute top-0 left-0 right-0" style={{ height: ep1Height }}>
            <div className="absolute left-4 top-4 z-10">
              <span className={cn("text-sm font-semibold", ENDPOINT_COLORS.ep1)}>
                {endpointNames?.[0] || parseEndpointName(data.endpoints[0].endpoint)} ({maxEp1Lanes} lane{maxEp1Lanes > 1 ? 's' : ''})
              </span>
            </div>
            
            {/* render visible slots for ep1 */}
            {ep1Slots
              .filter(({ slot }) => {
                const slotX = ((slot.endpoint1.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs
                return slotX > -(viewportOffset || 0) - 200 && slotX < (viewportOffset || 0) + containerWidth + 200
              })
              .map(({ slot, lane }) => (
              <div 
                key={`ep1-${slot.slot}`}
                className="absolute"
                style={{
                  top: `${TIMELINE_PADDING + lane * SLOT_HEIGHT}px`,
                  height: SLOT_HEIGHT,
                  left: 0,
                  right: 0
                }}
              >
                {/* slot divider and label */}
                <div
                  className="absolute top-0 bottom-0 border-l border-border/30"
                  style={{
                    left: `${((slot.endpoint1.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs}px`
                  }}
                >
                  <span className="absolute -top-5 left-1 text-xs text-muted-foreground">
                    {slot.slot}
                  </span>
                </div>
                
                {/* stages */}
                {renderStages(
                  slot.endpoint1,
                  slot.endpoint2,
                  firstTimestamp,
                  pixelsPerMs,
                  endpointNames?.[0] || parseEndpointName(data.endpoints[0].endpoint),
                  slot.slot,
                  0
                )}
              </div>
            ))}
          </div>

          {/* divider between timelines */}
          <div className="absolute left-0 right-0 border-t-2 border-border" style={{ top: ep1Height }} />

          {/* ep2 timeline */}
          <div className="absolute left-0 right-0" style={{ top: ep1Height + 40, height: ep2Height }}>
            <div className="absolute left-4 top-4 z-10">
              <span className={cn("text-sm font-semibold", ENDPOINT_COLORS.ep2)}>
                {endpointNames?.[1] || parseEndpointName(data.endpoints[1].endpoint)} ({maxEp2Lanes} lane{maxEp2Lanes > 1 ? 's' : ''})
              </span>
            </div>
            
            {/* render visible slots for ep2 */}
            {ep2Slots
              .filter(({ slot }) => {
                const slotX = ((slot.endpoint2.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs
                return slotX > -(viewportOffset || 0) - 200 && slotX < (viewportOffset || 0) + containerWidth + 200
              })
              .map(({ slot, lane }) => (
              <div 
                key={`ep2-${slot.slot}`}
                className="absolute"
                style={{
                  top: `${TIMELINE_PADDING + lane * SLOT_HEIGHT}px`,
                  height: SLOT_HEIGHT,
                  left: 0,
                  right: 0
                }}
              >
                {/* slot divider */}
                <div
                  className="absolute top-0 bottom-0 border-l border-border/30"
                  style={{
                    left: `${((slot.endpoint2.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs}px`
                  }}
                />
                
                {/* stages */}
                {renderStages(
                  slot.endpoint2,
                  slot.endpoint1,
                  firstTimestamp,
                  pixelsPerMs,
                  endpointNames?.[1] || parseEndpointName(data.endpoints[1].endpoint),
                  slot.slot,
                  0
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* tooltip */}
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