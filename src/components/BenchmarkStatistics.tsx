import { Card } from "@/components/ui/card"
import type { BenchmarkResult } from "@/lib/types"
import { Activity, Clock, Zap, AlertCircle, Info } from "lucide-react"
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
    p50: number
    p90: number
    p99: number
  }
}

export function BenchmarkStatistics({ data }: BenchmarkStatisticsProps) {
  // Calculate which endpoint sees slots first
  const calculateFirstSeenStats = () => {
    let ep1First = 0
    let ep2First = 0
    let simultaneous = 0
    const totalWaitingTime = { ep1: 0, ep2: 0 }
    const waitingCounts = { ep1: 0, ep2: 0 }

    data.slots.forEach(slot => {
      const ep1Start = slot.endpoint1.transitions[0]?.timestamp || 0
      const ep2Start = slot.endpoint2.transitions[0]?.timestamp || 0
      
      if (Math.abs(ep1Start - ep2Start) < 1) { // Less than 1ms difference
        simultaneous++
      } else if (ep1Start < ep2Start) {
        ep1First++
        if (slot.endpoint2.first_shred_delay_ms) {
          totalWaitingTime.ep2 += slot.endpoint2.first_shred_delay_ms
          waitingCounts.ep2++
        }
      } else {
        ep2First++
        if (slot.endpoint1.first_shred_delay_ms) {
          totalWaitingTime.ep1 += slot.endpoint1.first_shred_delay_ms
          waitingCounts.ep1++
        }
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
      avgWaitingTime: {
        ep1: waitingCounts.ep1 > 0 ? totalWaitingTime.ep1 / waitingCounts.ep1 : 0,
        ep2: waitingCounts.ep2 > 0 ? totalWaitingTime.ep2 / waitingCounts.ep2 : 0
      }
    }
  }

  // Calculate stats for all stages
  const calculateStageStats = (): Record<string, EndpointStageStats> => {
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const
    const stats: Record<string, EndpointStageStats> = {}

    stages.forEach(stage => {
      const ep1Values = data.slots.map(slot => slot.endpoint1.durations[`${stage}_ms`]).sort((a, b) => a - b)
      const ep2Values = data.slots.map(slot => slot.endpoint2.durations[`${stage}_ms`]).sort((a, b) => a - b)
      
      const calculateStats = (values: number[]): StageStats => ({
        p50: values[Math.floor(values.length * 0.5)],
        p90: values[Math.floor(values.length * 0.9)],
        p99: values[Math.floor(values.length * 0.99)],
        min: Math.min(...values),
        max: Math.max(...values)
      })
      
      const ep1Stats = calculateStats(ep1Values)
      const ep2Stats = calculateStats(ep2Values)
      
      stats[stage] = {
        ep1: ep1Stats,
        ep2: ep2Stats,
        diff: {
          p50: Math.abs(ep1Stats.p50 - ep2Stats.p50),
          p90: Math.abs(ep1Stats.p90 - ep2Stats.p90),
          p99: Math.abs(ep1Stats.p99 - ep2Stats.p99)
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

    return outliers.sort((a, b) => b.zscore - a.zscore).slice(0, 10) // Get top 10 outliers
  }

  // Calculate total processing time
  const calculateTotalProcessingTime = () => {
    const totalTimes = { ep1: 0, ep2: 0 }
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const
    
    data.slots.forEach(slot => {
      stages.forEach(stage => {
        totalTimes.ep1 += slot.endpoint1.durations[`${stage}_ms`]
        totalTimes.ep2 += slot.endpoint2.durations[`${stage}_ms`]
      })
    })
    
    const avgEp1 = totalTimes.ep1 / data.slots.length
    const avgEp2 = totalTimes.ep2 / data.slots.length
    
    return { avgEp1, avgEp2, difference: Math.abs(avgEp1 - avgEp2) }
  }

  const firstSeenStats = calculateFirstSeenStats()
  const stageStats = calculateStageStats()
  const outliers = findOutliers()
  const totalProcessing = calculateTotalProcessingTime()

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`

  const stageDescriptions = {
    download: "Time to download all shreds (data chunks) for the slot",
    replay: "Time to execute all transactions in the slot",
    confirmation: "Time for the slot to reach confirmation status",
    finalization: "Time for the slot to reach finalized status"
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Performance Statistics</h2>
        
        {/* First Row - Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Processing Time */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Average total time to process a slot through all stages</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">Avg Total Processing</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[#DA05E2]">EP1:</span>
                <span className="font-mono">{formatDuration(totalProcessing.avgEp1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#2C0FDF]">EP2:</span>
                <span className="font-mono">{formatDuration(totalProcessing.avgEp2)}</span>
              </div>
            </div>
          </Card>

          {/* First Seen Distribution */}
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
            <p className="text-sm text-muted-foreground">Network Advantage</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[#DA05E2]">EP1 First:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.ep1Percentage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#2C0FDF]">EP2 First:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.ep2Percentage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Simultaneous:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.simultaneousPercentage)}</span>
              </div>
            </div>
          </Card>

          {/* Average Waiting Time */}
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
            <p className="text-sm text-muted-foreground">Network Latency</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[#DA05E2]">EP1:</span>
                <span className="font-mono">{formatDuration(firstSeenStats.avgWaitingTime.ep1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#2C0FDF]">EP2:</span>
                <span className="font-mono">{formatDuration(firstSeenStats.avgWaitingTime.ep2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                When slower to receive
              </p>
            </div>
          </Card>

          {/* Outliers */}
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
            <p className="text-sm text-muted-foreground">Performance Outliers</p>
            {outliers.length > 0 ? (
              <div className="space-y-1">
                {outliers.slice(0, 5).map((outlier, idx) => (
                  <div key={idx} className="text-xs">
                    <span className="text-muted-foreground">Slot {outlier.slot}:</span>
                    <span className="ml-1 font-mono">{outlier.endpoint} {outlier.stage}</span>
                    <span className="ml-1 text-destructive">{formatDuration(outlier.duration)}</span>
                  </div>
                ))}
                {outliers.length > 5 && (
                  <p className="text-xs text-muted-foreground">...and {outliers.length - 5} more</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No significant outliers</p>
            )}
          </Card>
        </div>

        {/* Second Row - Stage Performance (Separated by Endpoint) */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Stage Performance by Endpoint</h3>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(stageStats).map(([stage, stats]) => (
              <Card key={stage} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm capitalize">
                    {stage}
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
                    <div className="w-2 h-2 rounded-full bg-[#DA05E2]" />
                    <span className="text-xs font-semibold text-[#DA05E2]">Endpoint 1</span>
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
                    <div className="w-2 h-2 rounded-full bg-[#2C0FDF]" />
                    <span className="text-xs font-semibold text-[#2C0FDF]">Endpoint 2</span>
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
                
                {/* Differences */}
                <div className="pt-2 border-t">
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Δ P50:</span>
                      <span className="font-mono">{formatDuration(stats.diff.p50)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Δ P90:</span>
                      <span className="font-mono">{formatDuration(stats.diff.p90)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Δ P99:</span>
                      <span className="font-mono">{formatDuration(stats.diff.p99)}</span>
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
                  <li>• <span className="font-semibold">Network Advantage</span> = Which endpoint receives slot data first from the network</li>
                  <li>• <span className="font-semibold">Network Latency</span> = How long the slower endpoint waits for slot data</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}