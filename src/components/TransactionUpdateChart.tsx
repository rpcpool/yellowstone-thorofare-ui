import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SlotSelector } from "@/components/SlotSelector"
import { Download } from "lucide-react"
import type { BenchmarkResult } from "@/lib/types"
import { parseEndpointName } from "@/lib/endpoint-utils"
import {
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"

interface TransactionUpdateChartProps {
  data: BenchmarkResult
  endpointNames?: [string | null, string | null]
}

interface ChartDataPoint {
  time: number
  delay: number
  endpoint: string
  slot: number
  signature: string
}

export function TransactionUpdateChart({ data, endpointNames }: TransactionUpdateChartProps) {
  const EP1_COLOR = "#F052FF"
  const EP2_COLOR = "#4A90FF"

  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [showFirstUpdates, setShowFirstUpdates] = useState(true)

  const getEndpointShortName = (idx: number) => {
    if (endpointNames?.[idx]) {
      return endpointNames[idx]!
    }
    const endpoint = data.endpoints[idx].endpoint
    return parseEndpointName(endpoint)
  }

  const { chartData, allSlots } = useMemo(() => {
    const points: ChartDataPoint[] = []
    const slotSet = new Set<number>()

    const firstTimestamp = Math.min(
      ...data.slots.flatMap(slot => {
        const ep1First = slot.endpoint1.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
        const ep2First = slot.endpoint2.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
        return Math.min(ep1First, ep2First)
      })
    )

    data.slots.forEach(slot => {
      const ep1Txns = slot.endpoint1.transaction_updates
      const ep2Txns = slot.endpoint2.transaction_updates
      if ((!ep1Txns || ep1Txns.length === 0) && (!ep2Txns || ep2Txns.length === 0)) return

      slotSet.add(slot.slot)

      ep1Txns?.forEach(update => {
        points.push({
          time: update.timestamp - firstTimestamp,
          delay: update.delay_ms || 0,
          endpoint: getEndpointShortName(0),
          slot: update.slot,
          signature: update.signature,
        })
      })

      ep2Txns?.forEach(update => {
        points.push({
          time: update.timestamp - firstTimestamp,
          delay: update.delay_ms || 0,
          endpoint: getEndpointShortName(1),
          slot: update.slot,
          signature: update.signature,
        })
      })
    })

    const sortedSlots = Array.from(slotSet).sort((a, b) => a - b)

    return {
      chartData: points.sort((a, b) => a.time - b.time),
      allSlots: sortedSlots
    }
  }, [data, getEndpointShortName])

  const formatDuration = (ms: number) => {
    if (ms < 0.001) return `${ms * 1000000}ns`
    if (ms < 1) return `${ms * 1000}μs`
    if (ms < 1000) return `${ms}ms`
    return `${ms / 1000}s`
  }

  const formatTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`
    } else if (ms < 60000) {
      const seconds = Math.floor(ms / 1000)
      const remainingMs = ms % 1000
      return remainingMs > 0 ? `${seconds}s ${remainingMs}ms` : `${seconds}s`
    } else {
      const minutes = Math.floor(ms / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      const remainingMs = ms % 1000
      let result = `${minutes}m`
      if (seconds > 0) result += ` ${seconds}s`
      if (remainingMs > 0) result += ` ${remainingMs}ms`
      return result
    }
  }

  const formatTimeForAxis = (ms: number) => {
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`
    } else {
      return `${(ms / 60000).toFixed(2)}m`
    }
  }

  const MAX_RENDER_POINTS = 5000

  // Downsample array using reservoir sampling to preserve distribution
  const downsample = (arr: ChartDataPoint[], maxPoints: number): ChartDataPoint[] => {
    if (arr.length <= maxPoints) return arr
    const delayed = arr.filter(p => p.delay > 0)
    const first = arr.filter(p => p.delay === 0)
    if (delayed.length >= maxPoints) {
      const sampled = [...delayed]
      for (let i = maxPoints; i < sampled.length; i++) {
        const j = Math.floor(Math.random() * (i + 1))
        if (j < maxPoints) sampled[j] = sampled[i]
      }
      return sampled.slice(0, maxPoints)
    }
    const remaining = maxPoints - delayed.length
    const sampledFirst = [...first]
    for (let i = remaining; i < sampledFirst.length; i++) {
      const j = Math.floor(Math.random() * (i + 1))
      if (j < remaining) sampledFirst[j] = sampledFirst[i]
    }
    return [...delayed, ...sampledFirst.slice(0, remaining)]
  }

  const { visiblePoints, statsData, isSampled } = useMemo(() => {
    let filteredData = chartData

    if (selectedSlots.length > 0) {
      filteredData = chartData.filter(point => selectedSlots.includes(point.slot))
    }

    const stats = filteredData

    if (!showFirstUpdates) {
      filteredData = filteredData.filter(point => point.delay > 0)
    }

    const sampled = filteredData.length > MAX_RENDER_POINTS
    const visible = sampled ? downsample(filteredData, MAX_RENDER_POINTS) : filteredData

    return { visiblePoints: visible, statsData: stats, isSampled: sampled }
  }, [chartData, selectedSlots, showFirstUpdates])

  const points = visiblePoints
  const ep1Points = points.filter(p => p.endpoint === getEndpointShortName(0))
  const ep2Points = points.filter(p => p.endpoint === getEndpointShortName(1))

  const statsEp1Points = statsData.filter(p => p.endpoint === getEndpointShortName(0))
  const statsEp2Points = statsData.filter(p => p.endpoint === getEndpointShortName(1))

  const maxDelay = Math.max(...points.map(p => p.delay), 50)
  const maxTime = Math.max(...points.map(p => p.time))

  const exportData = () => {
    const csvContent = [
      "Slot,Endpoint,Time,Delay,Signature",
      ...points.map(p =>
        `${p.slot},"${p.endpoint}",${p.time},${p.delay},"${p.signature}"`
      )
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transaction-updates-${selectedSlots.length > 0 ? `slots-${selectedSlots.join('-')}` : "all"}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleSlotsSelect = (slots: number[]) => {
    setSelectedSlots(slots)
  }

  const chartConfig = {
    delay: {
      label: "Delay",
    },
    [getEndpointShortName(0)]: {
      label: getEndpointShortName(0),
      color: EP1_COLOR,
    },
    [getEndpointShortName(1)]: {
      label: getEndpointShortName(1),
      color: EP2_COLOR,
    },
  } satisfies ChartConfig

  const ep1DelayedCount = statsEp1Points.filter(p => p.delay > 0).length
  const ep2DelayedCount = statsEp2Points.filter(p => p.delay > 0).length
  const ep1FirstCount = statsEp1Points.length - ep1DelayedCount
  const ep2FirstCount = statsEp2Points.length - ep2DelayedCount

  if (chartData.length === 0) {
    return null
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold">Transaction Update Delays</h3>
          <p className="text-base text-muted-foreground">
            Transaction confirmation delays compared to the faster endpoint
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFirstUpdates(!showFirstUpdates)}
            className="px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all duration-200 shadow-sm hover:shadow-md"
            style={{
              backgroundColor: showFirstUpdates ? '#4f46e5' : '#10b981',
              color: 'white',
              borderColor: showFirstUpdates ? '#4338ca' : '#059669'
            }}
            onMouseEnter={(e) => {
              if (showFirstUpdates) {
                e.currentTarget.style.backgroundColor = '#4338ca'
                e.currentTarget.style.borderColor = '#3730a3'
              } else {
                e.currentTarget.style.backgroundColor = '#059669'
                e.currentTarget.style.borderColor = '#047857'
              }
            }}
            onMouseLeave={(e) => {
              if (showFirstUpdates) {
                e.currentTarget.style.backgroundColor = '#4f46e5'
                e.currentTarget.style.borderColor = '#4338ca'
              } else {
                e.currentTarget.style.backgroundColor = '#10b981'
                e.currentTarget.style.borderColor = '#059669'
              }
            }}
          >
            {showFirstUpdates ? "Hide First Updates" : "Show First Updates"}
          </button>
          <button
            onClick={exportData}
            disabled={points.length === 0}
            className="px-4 py-2 text-sm font-medium rounded-lg border-2 flex items-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm"
            style={{
              backgroundColor: 'white',
              color: '#374151',
              borderColor: '#e5e7eb'
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#f8fafc'
                e.currentTarget.style.borderColor = '#d1d5db'
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = 'white'
                e.currentTarget.style.borderColor = '#e5e7eb'
              }
            }}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {allSlots.length > 0 && (
        <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium text-muted-foreground">
                {selectedSlots.length > 0 ? (
                  <>{selectedSlots.length === 1 ? `Slot ${selectedSlots[0]}` : `${selectedSlots.length} selected slots`} • {statsData.length} total updates</>
                ) : (
                  <>All slots • {statsData.length} total updates</>
                )}
                {isSampled && (
                  <Badge variant="outline" className="ml-2 text-xs text-yellow-600 border-yellow-500/50">
                    Showing {MAX_RENDER_POINTS.toLocaleString()} of {statsData.length.toLocaleString()} points
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EP1_COLOR }} />
                <span className="text-sm font-medium">{getEndpointShortName(0)}</span>
                <Badge variant="outline" className="text-xs">
                  {statsEp1Points.length} updates
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EP2_COLOR }} />
                <span className="text-sm font-medium">{getEndpointShortName(1)}</span>
                <Badge variant="outline" className="text-xs">
                  {statsEp2Points.length} updates
                </Badge>
              </div>
            </div>
            <SlotSelector
              slots={allSlots}
              selectedSlots={selectedSlots}
              onSlotsSelect={handleSlotsSelect}
              placeholder="All Slots"
              className="w-64"
              maxDisplay={2}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: EP1_COLOR }}>
            {ep1FirstCount}
          </div>
          <div className="text-sm text-muted-foreground">{getEndpointShortName(0)} First</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">
            {ep1DelayedCount}
          </div>
          <div className="text-sm text-muted-foreground">{getEndpointShortName(0)} Delayed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: EP2_COLOR }}>
            {ep2FirstCount}
          </div>
          <div className="text-sm text-muted-foreground">{getEndpointShortName(1)} First</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">
            {ep2DelayedCount}
          </div>
          <div className="text-sm text-muted-foreground">{getEndpointShortName(1)} Delayed</div>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
            <XAxis
              type="number"
              dataKey="time"
              domain={[0, maxTime]}
              tickFormatter={formatTimeForAxis}
              label={{ value: 'Time (from start)', position: 'insideBottom', offset: -5 }}
              stroke="hsl(var(--foreground))"
            />
            <YAxis
              type="number"
              dataKey="delay"
              domain={[0, maxDelay]}
              tickFormatter={formatDuration}
              label={{ value: 'Delay (ms)', angle: -90, position: 'insideLeft' }}
              stroke="hsl(var(--foreground))"
            />
            <ReferenceLine
              y={0}
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              strokeDasharray="none"
              label={{ value: "No Delay", position: "insideTopLeft" }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null

                const data = payload[0].payload as ChartDataPoint
                const isDelayed = data.delay > 0

                return (
                  <div className="w-[400px] bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-md p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: data.endpoint === getEndpointShortName(0) ? EP1_COLOR : EP2_COLOR }}
                        />
                        <span className="font-semibold text-lg">Slot {data.slot}</span>
                        <Badge variant={isDelayed ? "destructive" : "default"} className={`text-xs ${isDelayed ? "" : "bg-green-600 text-white hover:bg-green-700"}`}>
                          {isDelayed ? "Delayed" : "First"}
                        </Badge>
                      </div>

                      <div className={`grid gap-4 text-sm ${isDelayed ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        <div>
                          <div className="text-muted-foreground mb-1">Endpoint</div>
                          <div className="font-medium truncate">{data.endpoint}</div>
                        </div>
                        {isDelayed && (
                          <div>
                            <div className="text-muted-foreground mb-1">Delay</div>
                            <div className="font-mono font-semibold text-lg text-red-600 break-words">
                              {formatDuration(data.delay)}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-muted-foreground mb-1">Time from Start</div>
                          <div className="font-mono truncate">{formatTime(data.time)}</div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/30">
                        <div>
                          <div className="text-muted-foreground text-xs mb-1">Transaction Signature</div>
                          <div className="font-mono text-xs bg-muted/50 p-2 rounded break-all">
                            {data.signature}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }}
              cursor={false}
            />
            <Scatter
              data={ep1Points}
              fill={EP1_COLOR}
              fillOpacity={0.7}
              stroke={EP1_COLOR}
              strokeWidth={1}
              r={4}
            />
            <Scatter
              data={ep2Points}
              fill={EP2_COLOR}
              fillOpacity={0.7}
              stroke={EP2_COLOR}
              strokeWidth={1}
              r={4}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartContainer>
    </Card>
  )
}