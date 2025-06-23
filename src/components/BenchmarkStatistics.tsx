import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BenchmarkResult } from "@/lib/types"
import { Clock, Zap, AlertCircle, Info } from "lucide-react"
import { parseEndpointName } from "@/lib/endpoint-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface BenchmarkStatisticsProps {
  data: BenchmarkResult
}

interface StageStats {
  p50: number
  p90: number
  p99: number
  min: number
  max: number
}

interface EndpointStageStats {
  ep1: StageStats
  ep2: StageStats
  diff: {
    p50: { value: number; faster: 'ep1' | 'ep2' | 'tie' }
    p90: { value: number; faster: 'ep1' | 'ep2' | 'tie' }
    p99: { value: number; faster: 'ep1' | 'ep2' | 'tie' }
  }
}

export function BenchmarkStatistics({ data }: BenchmarkStatisticsProps) {
  // Better colors for contrast
  const EP1_COLOR = "#F052FF"
  const EP2_COLOR = "#4A90FF"

  // Calculate which endpoint sees slots first
  const calculateFirstSeenStats = () => {
    let ep1First = 0
    let ep2First = 0
    let simultaneous = 0
    const totalDelayTime = { ep1: 0, ep2: 0 }
    const delayCounts = { ep1: 0, ep2: 0 }

    data.slots.forEach(slot => {
      const ep1Delay = slot.endpoint1.first_shred_delay_ms || 0
      const ep2Delay = slot.endpoint2.first_shred_delay_ms || 0
      
      if (ep1Delay === 0 && ep2Delay === 0) {
        simultaneous++
      } else if (ep1Delay === 0 && ep2Delay > 0) {
        ep1First++
        totalDelayTime.ep2 += ep2Delay
        delayCounts.ep2++
      } else if (ep2Delay === 0 && ep1Delay > 0) {
        ep2First++
        totalDelayTime.ep1 += ep1Delay
        delayCounts.ep1++
      }
    })

    const total = data.slots.length
    return {
      ep1First,
      ep2First,
      simultaneous,
      ep1Percentage: (ep1First / total) * 100,
      ep2Percentage: (ep2First / total) * 100,
      simultaneousPercentage: (simultaneous / total) * 100,
      avgDelayTime: {
        ep1: delayCounts.ep1 > 0 ? totalDelayTime.ep1 / delayCounts.ep1 : 0,
        ep2: delayCounts.ep2 > 0 ? totalDelayTime.ep2 / delayCounts.ep2 : 0
      }
    }
  }

  // Calculate stats for all stages including the new delay metrics
  const calculateStageStats = (): Record<string, EndpointStageStats> => {
    const stages = [
      'first_shred_delay',
      'processing_delay', 
      'download',
      'replay',
      'confirmation',
      'finalization'
    ] as const
    
    const stats: Record<string, EndpointStageStats> = {}

    stages.forEach(stage => {
      let ep1Values: number[] = []
      let ep2Values: number[] = []

      if (stage === 'first_shred_delay') {
        ep1Values = data.slots
          .map(slot => slot.endpoint1.first_shred_delay_ms || 0)
          .sort((a, b) => a - b)
        ep2Values = data.slots
          .map(slot => slot.endpoint2.first_shred_delay_ms || 0)
          .sort((a, b) => a - b)
      } else if (stage === 'processing_delay') {
        ep1Values = data.slots
          .map(slot => slot.endpoint1.processing_delay_ms || 0)
          .sort((a, b) => a - b)
        ep2Values = data.slots
          .map(slot => slot.endpoint2.processing_delay_ms || 0)
          .sort((a, b) => a - b)
      } else {
        ep1Values = data.slots
          .map(slot => slot.endpoint1.durations[`${stage}_ms`])
          .sort((a, b) => a - b)
        ep2Values = data.slots
          .map(slot => slot.endpoint2.durations[`${stage}_ms`])
          .sort((a, b) => a - b)
      }
      
      const calculateStats = (values: number[]): StageStats => ({
        p50: values[Math.floor(values.length * 0.5)],
        p90: values[Math.floor(values.length * 0.9)],
        p99: values[Math.floor(values.length * 0.99)],
        min: Math.min(...values),
        max: Math.max(...values)
      })
      
      const ep1Stats = calculateStats(ep1Values)
      const ep2Stats = calculateStats(ep2Values)
      
      const determineFaster = (ep1Val: number, ep2Val: number): 'ep1' | 'ep2' | 'tie' => {
        if (Math.abs(ep1Val - ep2Val) < 0.01) return 'tie'
        return ep1Val < ep2Val ? 'ep1' : 'ep2'
      }
      
      stats[stage] = {
        ep1: ep1Stats,
        ep2: ep2Stats,
        diff: {
          p50: { 
            value: Math.abs(ep1Stats.p50 - ep2Stats.p50),
            faster: determineFaster(ep1Stats.p50, ep2Stats.p50)
          },
          p90: { 
            value: Math.abs(ep1Stats.p90 - ep2Stats.p90),
            faster: determineFaster(ep1Stats.p90, ep2Stats.p90)
          },
          p99: { 
            value: Math.abs(ep1Stats.p99 - ep2Stats.p99),
            faster: determineFaster(ep1Stats.p99, ep2Stats.p99)
          }
        }
      }
    })

    return stats
  }

  // Find outliers (slots that are significantly slower)
  const findOutliers = () => {
    const outliers: { slot: number, stage: string, endpoint: string, duration: number, zscore: number }[] = []
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const

    stages.forEach(stage => {
      // Calculate mean and std dev for each endpoint separately
      const endpoints = ['EP1', 'EP2'] as const
      endpoints.forEach(ep => {
        const values = data.slots.map(slot => ({
          slot: slot.slot,
          value: ep === 'EP1' 
            ? slot.endpoint1.durations[`${stage}_ms`]
            : slot.endpoint2.durations[`${stage}_ms`]
        }))

        const mean = values.reduce((a, b) => a + b.value, 0) / values.length
        const variance = values.reduce((a, b) => a + Math.pow(b.value - mean, 2), 0) / values.length
        const stdDev = Math.sqrt(variance)

        // Find outliers (z-score > 2.5)
        values.forEach(({ slot, value }) => {
          const zscore = Math.abs((value - mean) / stdDev)
          if (zscore > 2.5 && value > mean) { // Only interested in slow outliers
            outliers.push({ slot, stage, endpoint: ep, duration: value, zscore })
          }
        })
      })
    })

    return outliers.sort((a, b) => b.zscore - a.zscore)
  }

  const firstSeenStats = calculateFirstSeenStats()
  const stageStats = calculateStageStats()
  const outliers = findOutliers()

  const formatDuration = (ms: number) => {
    if (ms < 0.001) return `${(ms * 1000000).toFixed(0)}ns`
    if (ms < 1) return `${(ms * 1000).toFixed(3)}μs`
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`

  const stageDescriptions = {
    first_shred_delay: "Time difference between endpoints receiving first slot data",
    processing_delay: "Time difference between endpoints processing the slot",
    download: "Time to download all shreds (data chunks) for the slot",
    replay: "Time to execute all transactions in the slot",
    confirmation: "Time for the slot to reach confirmation status",
    finalization: "Time for the slot to reach finalized status"
  }

  const stageLabels = {
    first_shred_delay: "First Shred Delay",
    processing_delay: "Processing Delay",
    download: "Download",
    replay: "Replay",
    confirmation: "Confirmation",
    finalization: "Finalization"
  }

  const getEndpointShortName = (idx: number) => {
    const endpoint = data.endpoints[idx].endpoint
    return parseEndpointName(endpoint)
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Performance Statistics</h2>
        
        {/* First Row - Key Metrics (removed Avg Total Processing) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* First Shred Reception */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Which endpoint receives slot data first from the network</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">First Shred Reception</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span style={{ color: EP1_COLOR }}>{getEndpointShortName(0)} First:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.ep1Percentage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: EP2_COLOR }}>{getEndpointShortName(1)} First:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.ep2Percentage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Simultaneous:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.simultaneousPercentage)}</span>
              </div>
            </div>
          </Card>

          {/* First Shred Delay */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Time the slower endpoint waits after the faster one receives the slot</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">First Shred Delay</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span style={{ color: EP1_COLOR }}>{getEndpointShortName(0)}:</span>
                <span className="font-mono">{formatDuration(firstSeenStats.avgDelayTime.ep1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: EP2_COLOR }}>{getEndpointShortName(1)}:</span>
                <span className="font-mono">{formatDuration(firstSeenStats.avgDelayTime.ep2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                When slower to receive
              </p>
            </div>
          </Card>

          {/* Outliers with scroll */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Slots with processing times 2.5 standard deviations from mean</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground mb-2">Performance Outliers</p>
            {outliers.length > 0 ? (
              <ScrollArea className="h-20">
                <div className="space-y-1">
                  {outliers.map((outlier, idx) => (
                    <div key={idx} className="text-xs">
                      <span className="text-muted-foreground">Slot {outlier.slot}:</span>
                      <span className="ml-1 font-mono">{outlier.endpoint} {outlier.stage}</span>
                      <span className="ml-1 text-destructive">{formatDuration(outlier.duration)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">No significant outliers</p>
            )}
          </Card>
        </div>

        {/* Second Row - Stage Performance (Separated by Endpoint) */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Stage Performance by Endpoint</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(stageStats).map(([stage, stats]) => (
              <Card key={stage} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">
                    {stageLabels[stage as keyof typeof stageLabels]}
                  </h4>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{stageDescriptions[stage as keyof typeof stageDescriptions]}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* EP1 Stats */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EP1_COLOR }} />
                    <span className="text-xs font-semibold" style={{ color: EP1_COLOR }}>
                      {data.endpoints[0].endpoint.length > 30 
                        ? getEndpointShortName(0) 
                        : data.endpoints[0].endpoint}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="text-muted-foreground">P50:</div>
                    <div className="font-mono text-right">{formatDuration(stats.ep1.p50)}</div>
                    
                    <div className="text-muted-foreground">P90:</div>
                    <div className="font-mono text-right">{formatDuration(stats.ep1.p90)}</div>
                    
                    <div className="text-muted-foreground">P99:</div>
                    <div className="font-mono text-right">{formatDuration(stats.ep1.p99)}</div>
                    
                    <div className="text-muted-foreground">Range:</div>
                    <div className="font-mono text-right text-[10px]">
                      {formatDuration(stats.ep1.min)} - {formatDuration(stats.ep1.max)}
                    </div>
                  </div>
                </div>

                {/* EP2 Stats */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EP2_COLOR }} />
                    <span className="text-xs font-semibold" style={{ color: EP2_COLOR }}>
                      {data.endpoints[1].endpoint.length > 30 
                        ? getEndpointShortName(1) 
                        : data.endpoints[1].endpoint}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="text-muted-foreground">P50:</div>
                    <div className="font-mono text-right">{formatDuration(stats.ep2.p50)}</div>
                    
                    <div className="text-muted-foreground">P90:</div>
                    <div className="font-mono text-right">{formatDuration(stats.ep2.p90)}</div>
                    
                    <div className="text-muted-foreground">P99:</div>
                    <div className="font-mono text-right">{formatDuration(stats.ep2.p99)}</div>
                    
                    <div className="text-muted-foreground">Range:</div>
                    <div className="font-mono text-right text-[10px]">
                      {formatDuration(stats.ep2.min)} - {formatDuration(stats.ep2.max)}
                    </div>
                  </div>
                </div>
                
                {/* Differences with winner */}
                <div className="pt-2 border-t">
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Δ P50:</span>
                      <span className="font-mono">
                        {formatDuration(stats.diff.p50.value)}
                        {stats.diff.p50.faster !== 'tie' && (
                          <span 
                            className="ml-1 text-[10px]"
                            style={{ color: stats.diff.p50.faster === 'ep1' ? EP1_COLOR : EP2_COLOR }}
                          >
                            ({getEndpointShortName(stats.diff.p50.faster === 'ep1' ? 0 : 1)} faster)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Δ P90:</span>
                      <span className="font-mono">
                        {formatDuration(stats.diff.p90.value)}
                        {stats.diff.p90.faster !== 'tie' && (
                          <span 
                            className="ml-1 text-[10px]"
                            style={{ color: stats.diff.p90.faster === 'ep1' ? EP1_COLOR : EP2_COLOR }}
                          >
                            ({getEndpointShortName(stats.diff.p90.faster === 'ep1' ? 0 : 1)} faster)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Δ P99:</span>
                      <span className="font-mono">
                        {formatDuration(stats.diff.p99.value)}
                        {stats.diff.p99.faster !== 'tie' && (
                          <span 
                            className="ml-1 text-[10px]"
                            style={{ color: stats.diff.p99.faster === 'ep1' ? EP1_COLOR : EP2_COLOR }}
                          >
                            ({getEndpointShortName(stats.diff.p99.faster === 'ep1' ? 0 : 1)} faster)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Metric Explanation */}
          <Card className="p-4 bg-muted/50">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold mb-1">Understanding the metrics:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <span className="font-semibold">P50 (Median)</span> = 50% of slots processed faster than this value</li>
                  <li>• <span className="font-semibold">P90</span> = 90% of slots processed faster than this value</li>
                  <li>• <span className="font-semibold">P99</span> = 99% of slots processed faster than this value</li>
                  <li>• <span className="font-semibold">Δ (Delta)</span> = Absolute difference between endpoints</li>
                  <li>• <span className="font-semibold">First Shred Reception</span> = Which endpoint receives slot data first from the network</li>
                  <li>• <span className="font-semibold">First Shred Delay</span> = How long the slower endpoint waits for slot data</li>
                  <li>• <span className="font-semibold">Processing Delay</span> = Time difference between endpoints finishing processing</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}