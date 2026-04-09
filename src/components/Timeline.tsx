import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import type { BenchmarkResult, SlotDetail, SlotComparison, AccountUpdateDetail } from "@/lib/types"
import { STAGE_COLORS, STAGE_LABELS, ENDPOINT_COLORS, PIXELS_PER_MS, STAGE_HEIGHT, STAGE_SPACING } from "@/lib/constants"
import { parseEndpointName } from "@/lib/endpoint-utils"
import { cn } from "@/lib/utils"
import { SlotTooltip } from "./SlotTooltip"
import { AccountUpdateTooltip } from "./AccountUpdateTooltip"
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

interface AccountUpdateTooltipState {
  visible: boolean
  x: number
  y: number
  accounts: AccountUpdateDetail[]
  baseTime: number
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

const SLOT_HEIGHT = 120
const TIMELINE_PADDING = 40
const HEADER_HEIGHT = 40
const SLOT_LABEL_HEIGHT = 20
const LANE_SPACING = 30

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
  const getContainerPercentage = () => {
    if (windowWidth < 640) return 0.95
    if (windowWidth < 1024) return 0.90
    if (windowWidth < 1280) return 0.85
    return 0.80
  }
  
  const containerWidth = windowWidth * getContainerPercentage() - 32
  const pixelsPerMs = PIXELS_PER_MS * zoom
  const visibleDuration = containerWidth / pixelsPerMs
  const tickInterval = getTickInterval(visibleDuration)
  const ticks = []
  
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
  if (visibleDuration > 50) return 10
  if (visibleDuration > 20) return 5
  if (visibleDuration > 10) return 2
  return 1
}

function formatTime(ms: number): string {
  // Smart formatting based on time scale for better readability with microsecond support
  const hasMicroseconds = ms % 1 !== 0
  
  if (ms < 1000) {
    if (hasMicroseconds) {
      const wholMs = Math.floor(ms)
      const microseconds = Math.round((ms - wholMs) * 1000)
      return wholMs > 0 ? `${wholMs}ms ${microseconds}μs` : `${microseconds}μs`
    }
    return `${ms}ms`
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000)
    const remainingMs = ms % 1000
    if (hasMicroseconds && remainingMs > 0) {
      const wholMs = Math.floor(remainingMs)
      const microseconds = Math.round((remainingMs - wholMs) * 1000)
      return `${seconds}s ${wholMs}ms ${microseconds}μs`
    }
    return remainingMs > 0 ? `${seconds}s ${Math.floor(remainingMs)}ms` : `${seconds}s`
  } else {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const remainingMs = ms % 1000
    let result = `${minutes}m`
    if (seconds > 0) result += ` ${seconds}s`
    if (remainingMs > 0) {
      if (hasMicroseconds) {
        const wholMs = Math.floor(remainingMs)
        const microseconds = Math.round((remainingMs - wholMs) * 1000)
        result += ` ${wholMs}ms ${microseconds}μs`
      } else {
        result += ` ${Math.floor(remainingMs)}ms`
      }
    }
    return result
  }
}

export function Timeline({ data, zoom, viewportOffset = 0, visibleStages, endpointNames }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 })
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [hoveredStage, setHoveredStage] = useState<string | null>(null)
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const accountTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    slot: 0,
    endpoint: null,
    endpointName: ''
  })
  const [accountTooltip, setAccountTooltip] = useState<AccountUpdateTooltipState>({
    visible: false,
    x: 0,
    y: 0,
    accounts: [],
    baseTime: 0
  })
  const hoveredAccountSignatureRef = useRef<string | null>(null)
  const dotElementsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const hoveredDotIdxRef = useRef<number | null>(null)

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const processStages = (endpoint: SlotDetail, otherEndpoint: SlotDetail): ProcessedStage[] => {
    const stages: ProcessedStage[] = []
    const transitions = endpoint.transitions
    
    const firstShred = transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const completed = transitions.find(t => t.status === "Completed")?.timestamp || 0
    const createdBank = transitions.find(t => t.status === "CreatedBank")?.timestamp || 0
    const processed = transitions.find(t => t.status === "Processed")?.timestamp || 0
    const confirmed = transitions.find(t => t.status === "Confirmed")?.timestamp || 0

    const otherFirstShred = otherEndpoint.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const otherConfirmed = otherEndpoint.transitions.find(t => t.status === "Confirmed")?.timestamp || 0

    if (endpoint.first_shred_delay_ms !== null && endpoint.first_shred_delay_ms !== undefined && endpoint.first_shred_delay_ms > 0) {
      stages.push({
        type: 'first_shred_delay',
        startTime: otherFirstShred,
        endTime: firstShred,
        duration: endpoint.first_shred_delay_ms,
        label: `${STAGE_LABELS.first_shred_delay} ${endpoint.first_shred_delay_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // download
    if (visibleStages.download && firstShred && completed) {
      stages.push({
        type: 'download',
        startTime: firstShred,
        endTime: completed,
        duration: endpoint.durations.download_ms,
        label: `${STAGE_LABELS.download} ${endpoint.durations.download_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // replay
    if (visibleStages.replay && createdBank && processed) {
      stages.push({
        type: 'replay',
        startTime: createdBank,
        endTime: processed,
        duration: endpoint.durations.replay_ms,
        label: `${STAGE_LABELS.replay} ${endpoint.durations.replay_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // confirmation delay
    if (endpoint.confirmation_delay_ms !== null && endpoint.confirmation_delay_ms !== undefined && endpoint.confirmation_delay_ms > 0 && visibleStages.confirmation) {
      const confirmationDelayStart = otherConfirmed
      stages.push({
        type: 'confirmation_delay',
        startTime: confirmationDelayStart,
        endTime: confirmationDelayStart + endpoint.confirmation_delay_ms,
        duration: endpoint.confirmation_delay_ms,
        label: `${STAGE_LABELS.confirmation_delay || 'Confirm Delay'} ${endpoint.confirmation_delay_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    // confirmation
    if (visibleStages.confirmation && processed && confirmed) {
      stages.push({
        type: 'confirmation',
        startTime: processed,
        endTime: confirmed,
        duration: endpoint.durations.confirmation_ms,
        label: `${STAGE_LABELS.confirmation} ${endpoint.durations.confirmation_ms.toFixed(1)}ms`,
        parallel: false,
        parallelIndex: 0
      })
    }

    /* parallel stage detection */
    for (let i = 0; i < stages.length; i++) {
      stages[i].parallelIndex = 0
      stages[i].parallel = false
      
      if (stages[i].type === 'first_shred_delay' || stages[i].type === 'confirmation_delay') continue
      
      for (let j = 0; j < i; j++) {
        if (stages[j].type === 'first_shred_delay' || stages[j].type === 'confirmation_delay') continue
        
        if (stages[i].startTime < stages[j].endTime && stages[i].endTime > stages[j].startTime) {
          stages[i].parallel = true
          stages[j].parallel = true
          if (stages[j].parallelIndex >= stages[i].parallelIndex) {
            stages[i].parallelIndex = stages[j].parallelIndex + 1
          }
        }
      }
    }
    
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

  const getSlotTimeRange = (slot: SlotComparison, endpoint: 'endpoint1' | 'endpoint2'): { start: number, end: number } => {
    const endpointData = slot[endpoint]
    const transitions = endpointData.transitions
    
    const firstShred = transitions.find(t => t.status === "FirstShredReceived")?.timestamp || 0
    const confirmed = transitions.find(t => t.status === "Confirmed")?.timestamp || 0
    const processed = transitions.find(t => t.status === "Processed")?.timestamp || 0
    const completed = transitions.find(t => t.status === "Completed")?.timestamp || 0
    
    let lastTime = firstShred
    if (visibleStages.download && completed > lastTime) lastTime = completed
    if (visibleStages.replay && processed > lastTime) lastTime = processed
    if (visibleStages.confirmation && confirmed > lastTime) lastTime = confirmed
    
    return { start: firstShred, end: lastTime }
  }

  const calculateSlotLabelPositions = (slotsWithLanes: SlotWithLane[], pixelsPerMs: number, firstTimestamp: number) => {
    const labelPositions = new Map<number, number>()
    const sortedSlots = [...slotsWithLanes].sort((a, b) => a.startTime - b.startTime)
    
    let lastLabelEnd = -Infinity
    const minLabelSpacing = 40
    
    sortedSlots.forEach(({ slot, startTime }) => {
      const defaultX = (startTime - firstTimestamp) * pixelsPerMs
      
      if (defaultX < lastLabelEnd + minLabelSpacing) {
        labelPositions.set(slot.slot, -1)
      } else {
        labelPositions.set(slot.slot, defaultX)
        lastLabelEnd = defaultX + 30
      }
    })
    
    return labelPositions
  }

  const assignSlotLanes = (slots: SlotComparison[], endpoint: 'endpoint1' | 'endpoint2'): SlotWithLane[] => {
    const slotsWithLanes: SlotWithLane[] = []
    const lanes: { endTime: number }[] = []
    
    const sortedSlots = [...slots].sort((a, b) => {
      const aStart = getSlotTimeRange(a, endpoint).start
      const bStart = getSlotTimeRange(b, endpoint).start
      return aStart - bStart
    })
    
    sortedSlots.forEach(slot => {
      const { start, end } = getSlotTimeRange(slot, endpoint)
      
      let assignedLane = -1
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i].endTime <= start) {
          assignedLane = i
          lanes[i].endTime = end
          break
        }
      }
      
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

  const ep1Slots = useMemo(() => assignSlotLanes(data.slots, 'endpoint1'), [data.slots, visibleStages])
  const ep2Slots = useMemo(() => assignSlotLanes(data.slots, 'endpoint2'), [data.slots, visibleStages])

  const maxEp1Lanes = useMemo(() => Math.max(...ep1Slots.map(s => s.lane)) + 1, [ep1Slots])
  const maxEp2Lanes = useMemo(() => Math.max(...ep2Slots.map(s => s.lane)) + 1, [ep2Slots])

  const ep1Height = maxEp1Lanes * SLOT_HEIGHT + TIMELINE_PADDING + SLOT_LABEL_HEIGHT
  const ep2Height = maxEp2Lanes * SLOT_HEIGHT + TIMELINE_PADDING + SLOT_LABEL_HEIGHT
  const totalHeight = ep1Height + ep2Height + 80

  const ep1LabelPositions = useMemo(() => calculateSlotLabelPositions(ep1Slots, pixelsPerMs, firstTimestamp), [ep1Slots, pixelsPerMs, firstTimestamp])
  const ep2LabelPositions = useMemo(() => calculateSlotLabelPositions(ep2Slots, pixelsPerMs, firstTimestamp), [ep2Slots, pixelsPerMs, firstTimestamp])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    dragStartRef.current = {
      x: e.clientX,
      scrollLeft: scrollRef.current?.scrollLeft || 0
    }
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grabbing'
    }
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return

    const dx = e.clientX - dragStartRef.current.x
    scrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab'
    }
  }, [])

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !scrollRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      scrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx
    }

    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false
      if (scrollRef.current) {
        scrollRef.current.style.cursor = 'grab'
      }
    }

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current && viewportOffset !== undefined) {
      scrollRef.current.scrollLeft = viewportOffset
    }
  }, [viewportOffset])

  const handleScroll = useCallback(() => {
    // Only sync scroll position on drag end, not every frame
    // This prevents full React re-renders during scrolling
  }, [])

  const handleStageMouseEnter = (e: React.MouseEvent, slot: number, endpoint: SlotDetail, endpointName: string, stageId: string) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    
    setHoveredStage(stageId)
    
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        slot,
        endpoint,
        endpointName
      })
    }, 200)
  }

  const handleStageMouseLeave = () => {
    setHoveredStage(null)
    
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip(prev => ({
        ...prev,
        visible: false
      }))
    }, 100)
  }

  const handleAccountMouseEnter = (e: React.MouseEvent, accounts: AccountUpdateDetail[], baseTime: number) => {
    if (accountTooltipTimeoutRef.current) {
      clearTimeout(accountTooltipTimeoutRef.current)
    }
    
    accountTooltipTimeoutRef.current = setTimeout(() => {
      setAccountTooltip({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        accounts,
        baseTime
      })
    }, 200)
  }

  const handleAccountMouseLeave = () => {
    if (accountTooltipTimeoutRef.current) {
      clearTimeout(accountTooltipTimeoutRef.current)
    }
    
    accountTooltipTimeoutRef.current = setTimeout(() => {
      setAccountTooltip(prev => ({
        ...prev,
        visible: false
      }))
    }, 100)
  }

  const handleAccountTooltipMouseEnter = () => {
    if (accountTooltipTimeoutRef.current) {
      clearTimeout(accountTooltipTimeoutRef.current)
    }
  }

  const handleAccountTooltipMouseLeave = () => {
    handleAccountMouseLeave()
  }

  const MAX_GROUPS_PER_SLOT = 30

  const renderAccountUpdates = (
    endpoint: SlotDetail,
    baseTime: number,
    scale: number,
    yOffset: number,
  ) => {
    if (!endpoint.account_updates || endpoint.account_updates.length === 0) {
      return null
    }

    const sortedAccounts = [...endpoint.account_updates]
      .sort((a, b) => a.timestamp - b.timestamp)

    // Adaptive grouping: more aggressive at lower zoom to reduce DOM nodes
    const GROUPING_THRESHOLD = Math.max(5, 15 / Math.max(scale, 0.01))
    const groupedUpdates: { accounts: typeof sortedAccounts, x: number, hasDelays: boolean }[] = []

    sortedAccounts.forEach(account => {
      const x = (account.timestamp - baseTime) * scale

      const existingGroup = groupedUpdates.find(group =>
        Math.abs(group.x - x) < GROUPING_THRESHOLD
      )

      if (existingGroup) {
        existingGroup.accounts.push(account)
        if (account.delay_ms != null && Number(account.delay_ms) > 0) {
          existingGroup.hasDelays = true
        }
      } else {
        // Cap max groups to prevent DOM explosion
        if (groupedUpdates.length < MAX_GROUPS_PER_SLOT) {
          groupedUpdates.push({
            accounts: [account],
            x: x,
            hasDelays: account.delay_ms != null && Number(account.delay_ms) > 0
          })
        } else {
          // Merge into nearest group
          let nearest = groupedUpdates[0]
          let minDist = Math.abs(groupedUpdates[0].x - x)
          for (let i = 1; i < groupedUpdates.length; i++) {
            const dist = Math.abs(groupedUpdates[i].x - x)
            if (dist < minDist) {
              minDist = dist
              nearest = groupedUpdates[i]
            }
          }
          nearest.accounts.push(account)
          if (account.delay_ms != null && Number(account.delay_ms) > 0) {
            nearest.hasDelays = true
          }
        }
      }
    })
    
    // Pre-compute group metadata to avoid work in JSX
    const groupsMeta = groupedUpdates.map((group, idx) => {
      const isMultiple = group.accounts.length > 1
      const hasOnlyDelays = group.accounts.every(a => a.delay_ms != null && Number(a.delay_ms) > 0)
      const hasOnlyOnTime = group.accounts.every(a => a.delay_ms == null || Number(a.delay_ms) === 0)
      const count = group.accounts.length
      const size = count > 9 ? 18 : isMultiple ? 14 : 8
      const color = hasOnlyDelays ? '#ef4444' : hasOnlyOnTime ? '#10b981' : '#f97316'
      return { ...group, idx, isMultiple, hasOnlyDelays, hasOnlyOnTime, count, size, color }
    })

    const highlightDot = (idx: number | null) => {
      // Remove previous highlight
      if (hoveredDotIdxRef.current !== null) {
        const prevEl = dotElementsRef.current.get(`dot-${hoveredDotIdxRef.current}`)
        if (prevEl) {
          const prev = groupsMeta.find(g => g.idx === hoveredDotIdxRef.current)
          if (prev) {
            prevEl.style.transform = 'translateY(-50%)'
            prevEl.style.width = `${prev.size}px`
            prevEl.style.height = `${prev.size}px`
            prevEl.style.boxShadow = prev.isMultiple ? `0 0 0 2px ${prev.color}80` : ''
            prevEl.style.zIndex = prev.hasOnlyDelays ? '22' : prev.hasOnlyOnTime ? '20' : '21'
          }
        }
      }
      hoveredDotIdxRef.current = idx
      // Apply highlight
      if (idx !== null) {
        const el = dotElementsRef.current.get(`dot-${idx}`)
        if (el) {
          const g = groupsMeta.find(g => g.idx === idx)
          if (g) {
            const hoverSize = g.size * 1.5
            el.style.transform = 'translateY(-50%)'
            el.style.width = `${hoverSize}px`
            el.style.height = `${hoverSize}px`
            el.style.boxShadow = `0 0 8px ${g.color}, 0 0 0 2px ${g.color}`
            el.style.zIndex = '50'
          }
        }
      }
    }

    const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left + e.currentTarget.scrollLeft
      // Find closest group
      let closest = groupsMeta[0]
      let closestDist = Math.abs(groupsMeta[0].x - mouseX)
      for (let i = 1; i < groupsMeta.length; i++) {
        const dist = Math.abs(groupsMeta[i].x - mouseX)
        if (dist < closestDist) {
          closestDist = dist
          closest = groupsMeta[i]
        }
      }
      if (closestDist < 15) {
        highlightDot(closest.idx)
        handleAccountMouseEnter(e, closest.accounts, baseTime)
        hoveredAccountSignatureRef.current = closest.accounts[0]?.tx_signature ?? null
      } else {
        highlightDot(null)
        handleAccountMouseLeave()
        hoveredAccountSignatureRef.current = null
      }
    }

    return (
      <div
        className="absolute"
        style={{
          top: `${yOffset + 110}px`,
          height: '20px',
          left: 0,
          right: 0,
        }}
        onMouseMove={handleContainerMouseMove}
        onMouseLeave={() => {
          highlightDot(null)
          handleAccountMouseLeave()
          hoveredAccountSignatureRef.current = null
        }}
      >
        {groupsMeta.map((group) => (
          <div
            key={group.idx}
            ref={(el) => {
              if (el) dotElementsRef.current.set(`dot-${group.idx}`, el)
            }}
            className="absolute rounded-full"
            style={{
              left: `${group.x}px`,
              top: '50%',
              transform: 'translateY(-50%)',
              width: `${group.size}px`,
              height: `${group.size}px`,
              backgroundColor: group.color,
              opacity: group.hasOnlyOnTime ? 0.7 : 0.9,
              zIndex: group.hasOnlyDelays ? 22 : group.hasOnlyOnTime ? 20 : 21,
              boxShadow: group.isMultiple ? `0 0 0 2px ${group.color}80` : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {group.isMultiple && (
              <span style={{
                fontSize: group.count > 9 ? '8px' : '7px',
                color: 'white',
                fontWeight: 700,
                lineHeight: 1,
                pointerEvents: 'none',
              }}>
                {group.count}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

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
      
      const y = yOffset + SLOT_HEIGHT / 2 + stage.parallelIndex * (STAGE_HEIGHT + STAGE_SPACING)

      const isDelay = stage.type === 'first_shred_delay' || stage.type === 'confirmation_delay'
      const stageId = `${slotNumber}-${stage.type}-${idx}`

      return (
        <div
          key={stageId}
          className={cn(
            "absolute flex items-center justify-center rounded text-xs text-white font-semibold transition-all cursor-pointer",
            isDelay ? `${STAGE_COLORS.waiting} opacity-70 border-2 border-dashed border-gray-300` : STAGE_COLORS[stage.type as keyof typeof STAGE_COLORS],
            hoveredStage === stageId && "brightness-110 shadow-lg"
          )}
          style={{
            left: `${relativeStart}px`,
            top: `${y}px`,
            transform: 'translateY(-50%)',
            width: `${width}px`,
            height: `${STAGE_HEIGHT}px`,
            backgroundImage: isDelay ? 
              'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)' : 
              undefined,
            zIndex: hoveredStage === stageId ? 30 : (stage.parallel ? 20 : 15)
          }}
          onMouseEnter={(e) => {
            e.stopPropagation()
            handleStageMouseEnter(e, slotNumber, endpoint, endpointName, stageId)
          }}
          onMouseLeave={(e) => {
            e.stopPropagation()
            handleStageMouseLeave()
          }}
        >
          {width > 60 && (
            <span className="truncate px-2 text-[11px]">
              {stage.label}
            </span>
          )}
          {width > 30 && width <= 60 && (
            <span className="truncate px-1 text-[10px]">
              {isDelay ? '⏱' : stage.type.substring(0, 1).toUpperCase()} {stage.duration.toFixed(1)}
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
      <div className="sticky top-0 z-30 bg-card border-b overflow-hidden" style={{ height: HEADER_HEIGHT }}>
        <TimeAxis 
          duration={totalDuration}
          zoom={zoom}
          viewportOffset={viewportOffset || 0}
          windowWidth={windowWidth}
        />
      </div>

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
          "cursor-grab"
        )}
        style={{ 
          height: '715px',
          maxWidth: '100%',
          overflowX: 'auto'
        }}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Static endpoint labels */}
        <div className="sticky left-0 top-0 z-20 pointer-events-none">
          <div className="absolute left-4 top-4 bg-card/95 backdrop-blur-sm px-3 py-1 rounded-md border shadow-sm pointer-events-auto">
            <span className={cn("text-sm font-semibold", ENDPOINT_COLORS.ep1)}>
              {endpointNames?.[0] || parseEndpointName(data.endpoints[0].endpoint)} ({maxEp1Lanes} lane{maxEp1Lanes > 1 ? 's' : ''})
            </span>
          </div>
          <div 
            className="absolute left-4 bg-card/95 backdrop-blur-sm px-3 py-1 rounded-md border shadow-sm pointer-events-auto"
            style={{ top: `${ep1Height + 56 }px` }}
          >
            <span className={cn("text-sm font-semibold", ENDPOINT_COLORS.ep2)}>
              {endpointNames?.[1] || parseEndpointName(data.endpoints[1].endpoint)} ({maxEp2Lanes} lane{maxEp2Lanes > 1 ? 's' : ''})
            </span>
          </div>
        </div>

        <div style={{ 
          width: timelineWidth, 
          height: totalHeight, 
          position: 'relative',
          minWidth: '100%'
        }}>
          {/* ep1 timeline */}
          <div className="absolute top-0 left-0 right-0" style={{ height: ep1Height }}>
            {/* Lane backgrounds */}
            {Array.from({ length: maxEp1Lanes }).map((_, laneIndex) => (
              <div
                key={`ep1-lane-${laneIndex}`}
                className={cn(
                  "absolute left-0 right-0",
                  laneIndex % 2 === 0 ? "bg-muted/70" : "bg-muted/100"
                )}
                style={{
                  top: `${laneIndex === 0 ? TIMELINE_PADDING + SLOT_LABEL_HEIGHT + laneIndex * SLOT_HEIGHT - 5 : TIMELINE_PADDING + SLOT_LABEL_HEIGHT + laneIndex * SLOT_HEIGHT + 20}px`,
                  height: SLOT_HEIGHT + 25
                }}
              />
            ))}
            
            {ep1Slots
              .map(({ slot, lane }) => {
                const labelX = ep1LabelPositions.get(slot.slot) || -1
                
                return (
                  <div
                    key={`ep1-${slot.slot}`}
                    className="absolute"
                    style={{
                      top: `${TIMELINE_PADDING + SLOT_LABEL_HEIGHT + lane * (SLOT_HEIGHT + LANE_SPACING)}px`,
                      height: SLOT_HEIGHT,
                      left: 0,
                      right: 0,
                    }}
                  >
                    {/* slot divider */}
                    <div
                      className="absolute top-0 bottom-0 border-l-2 border-primary/40"
                      style={{
                        left: `${((slot.endpoint1.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs}px`,
                        zIndex: 10
                      }}
                    >
                      {labelX >= 0 && (
                        <span 
                          className="absolute text-xs font-medium text-primary px-2 py-0.5 rounded-full border border-primary/30"
                          style={{
                            top: `${2}px`,
                            left: `${labelX - ((slot.endpoint1.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs}px`
                          }}
                        >
                          {slot.slot}
                        </span>
                      )}
                    </div>
                    
                    {renderAccountUpdates(
                      slot.endpoint1,
                      firstTimestamp,
                      pixelsPerMs,
                      0,
                    )}
                    
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
                )
              })}
          </div>

          {/* Separator */}
          <div 
            className="absolute left-0 right-0 bg-gradient-to-r from-violet-900 via-border to-violet-500/50 border-t border-b border-border" 
            style={{ 
              top: ep1Height + 45, 
              height: '2px' 
            }} 
          />

          {/* ep2 timeline */}
          <div className="absolute left-0 right-0" style={{ top: ep1Height + 40, height: ep2Height }}>
            {/* Lane backgrounds */}
            {Array.from({ length: maxEp2Lanes }).map((_, laneIndex) => (
              <div
                key={`ep2-lane-${laneIndex}`}
                className={cn(
                  "absolute left-0 right-0",
                  laneIndex % 2 === 0 ? "bg-muted/70" : "bg-muted/100"
                )}
                style={{
                  top: `${laneIndex === 0 ? TIMELINE_PADDING + SLOT_LABEL_HEIGHT + laneIndex * SLOT_HEIGHT - 5 : TIMELINE_PADDING + SLOT_LABEL_HEIGHT + laneIndex * SLOT_HEIGHT + 20}px`,
                  height: SLOT_HEIGHT + 25
                }}
              />
            ))}
            
            {ep2Slots
              .map(({ slot, lane }) => {
                const labelX = ep2LabelPositions.get(slot.slot) || -1
                
                return (
                  <div
                    key={`ep2-${slot.slot}`}
                    className="absolute"
                    style={{
                      top: `${TIMELINE_PADDING + SLOT_LABEL_HEIGHT + lane * (SLOT_HEIGHT + LANE_SPACING)}px`,
                      height: SLOT_HEIGHT,
                      left: 0,
                      right: 0,
                    }}
                  >  
                    {/* slot divider */}
                    <div
                      className="absolute top-0 bottom-0 border-l-2 border-primary/40"
                      style={{
                        left: `${((slot.endpoint2.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs}px`,
                        zIndex: 10
                      }}
                    >
                      {labelX >= 0 && (
                        <span 
                          className="absolute text-xs font-medium bg-card text-blue-600 px-2 py-0.5 rounded-full border border-blue-500/30"
                          style={{
                            top: `${2}px`,
                            left: `${labelX - ((slot.endpoint2.transitions[0]?.timestamp || firstTimestamp) - firstTimestamp) * pixelsPerMs}px`
                          }}
                        >
                          {slot.slot}
                        </span>
                      )}
                    </div>
                    
                    {renderAccountUpdates(
                      slot.endpoint2,
                      firstTimestamp,
                      pixelsPerMs,
                      0,
                    )}
                    
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
                )
              })}
          </div>
        </div>
      </div>

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
      
      <AccountUpdateTooltip
        visible={accountTooltip.visible}
        x={accountTooltip.x}
        y={accountTooltip.y}
        accounts={accountTooltip.accounts}
        baseTime={accountTooltip.baseTime}
        onMouseEnter={handleAccountTooltipMouseEnter}
        onMouseLeave={handleAccountTooltipMouseLeave}
      />
    </div>
  )
}