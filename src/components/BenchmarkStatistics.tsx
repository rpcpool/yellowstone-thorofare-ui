import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import type { BenchmarkResult } from "@/lib/types"
import { Clock, Zap, AlertCircle, Info, Network, Cpu, Users } from "lucide-react"
import { parseEndpointName } from "@/lib/endpoint-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface BenchmarkStatisticsProps {
  data: BenchmarkResult
  endpointNames?: [string | null, string | null]
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

const STAGE_CATEGORIES = {
  network: {
    label: "Network Performance",
    icon: Network,
    description: "How quickly endpoints receive data from the network",
    stages: ['first_shred_delay', 'processing_delay']
  },
  processing: {
    label: "Local Processing",
    icon: Cpu,
    description: "How fast endpoints process slots locally",
    stages: ['download', 'replay']
  },
  consensus: {
    label: "Network Consensus",
    icon: Users,
    description: "Depends on overall network agreement, not individual endpoint speed",
    stages: ['confirmation', 'finalization']
  }
}

export function BenchmarkStatistics({ data, endpointNames }: BenchmarkStatisticsProps) {
  const EP1_COLOR = "#F052FF"
  const EP2_COLOR = "#4A90FF"

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

  const findOutliers = () => {
    const outliers: { slot: number, stage: string, endpoint: string, duration: number, zscore: number }[] = []
    const stages = ['download', 'replay', 'confirmation', 'finalization'] as const

    stages.forEach(stage => {
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

        // z-score > 2.5 = outlier
        values.forEach(({ slot, value }) => {
          const zscore = Math.abs((value - mean) / stdDev)
          if (zscore > 2.5 && value > mean) {
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
    first_shred_delay: "When endpoints receive data at different times, this shows the delay of the slower endpoint",
    processing_delay: "Time difference between when endpoints finish processing the same slot",
    download: "Time to receive all pieces of data (shreds) that make up a slot",
    confirmation: "Time until the network agrees this slot is valid (not endpoint-dependent)",
    finalization: "Time until the slot is permanently recorded (not endpoint-dependent)"
  }

  const stageLabels = {
    first_shred_delay: "Reception Delay (First Shred)",
    processing_delay: "Processing Delay",
    download: "Download Time",
    replay: "Transaction Replay",
    confirmation: "Network Confirmation",
    finalization: "Network Finalization"
  }

  const getEndpointShortName = (idx: number) => {
    if (endpointNames?.[idx]) {
      return endpointNames[idx]!
    }
    const endpoint = data.endpoints[idx].endpoint
    return parseEndpointName(endpoint)
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Performance Analysis</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* first to receive */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Shows which endpoint typically receives new blockchain data first. This indicates network proximity and routing efficiency.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">First to Receive</p>
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

          {/* reception delay */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Average time the slower endpoint waits after the faster one receives data. Lower is better. Shows network latency differences.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">Average Reception Delay (First Shred)</p>
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

          {/* outliers */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Slots that took unusually long to process. These outliers can indicate temporary issues or network problems.</p>
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

        {/* stage performance grouped by category */}
        <div className="space-y-6">
          {Object.entries(STAGE_CATEGORIES).map(([category, categoryInfo]) => {
            const Icon = categoryInfo.icon
            const relevantStages = Object.entries(stageStats).filter(([stage]) => 
              categoryInfo.stages.includes(stage)
            )
            
            if (relevantStages.length === 0) return null
            
            return (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">{categoryInfo.label}</h3>
                    <p className="text-sm text-muted-foreground">{categoryInfo.description}</p>
                  </div>
                  {category === 'consensus' && (
                    <Badge variant="secondary" className="ml-auto">
                      Network-dependent
                    </Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                  {relevantStages.map(([stage, stats]) => (
                    <Card key={stage} className={`p-4 ${category === 'consensus' ? 'opacity-75' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-sm">
                          {stageLabels[stage as keyof typeof stageLabels]}
                        </h4>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">{stageDescriptions[stage as keyof typeof stageDescriptions]}</p>
                            {category === 'consensus' && (
                              <p className="text-xs mt-1 text-yellow-500">⚠️ This metric depends on overall network consensus, not individual endpoint performance.</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EP1_COLOR }} />
                          <span className="text-xs font-semibold" style={{ color: EP1_COLOR }}>
                            {getEndpointShortName(0)}
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

                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EP2_COLOR }} />
                          <span className="text-xs font-semibold" style={{ color: EP2_COLOR }}>
                            {getEndpointShortName(1)}
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
                      
                      {/* only show differences for performance metrics */}
                      {category !== 'consensus' && (
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
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* understanding metrics */}
        <Card className="p-4 bg-muted/50">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-semibold mb-1">Understanding the metrics:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <span className="font-semibold">P50 (Median)</span> = Half of all slots were faster than this</li>
                  <li>• <span className="font-semibold">P90</span> = 90% of slots were faster than this</li>
                  <li>• <span className="font-semibold">P99</span> = 99% of slots were faster than this (worst-case performance)</li>
                  <li>• <span className="font-semibold">Δ (Delta)</span> = Difference between endpoints</li>
                </ul>
              </div>
              
              <div>
                <p className="font-semibold mb-1">Performance categories:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <span className="font-semibold">Network Performance</span> = How fast data arrives from the network</li>
                  <li>• <span className="font-semibold">Local Processing</span> = How fast the endpoint processes data</li>
                  <li>• <span className="font-semibold">Network Consensus</span> = Depends on the entire network, not endpoint speed</li>
                </ul>
              </div>
              
              <p className="text-xs text-yellow-600">
                ⚠️ <span className="font-semibold">Important:</span> Only Network and Processing metrics indicate endpoint performance. 
                Consensus metrics show network-wide agreement timing and don't reflect individual endpoint quality.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  )
}