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
    description: "How quickly updates reach us from each endpoint (includes network latency)",
    stages: ['first_shred_delay', 'processing_delay']
  },
  processing: {
    label: "Local Processing",
    icon: Cpu,
    description: "Time between status updates we receive (includes cpu processing time + network efficiency)",
    stages: ['download', 'replay']
  },
  consensus: {
    label: "Network Consensus",
    icon: Users,
    description: "Waiting for network agreement per slot, time difference it took per endpoint to receive the votes from gossip",
    stages: ['confirmation_delay', 'finalization_delay']
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
      'finalization',
      'confirmation_delay',
      'finalization_delay'
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
      } else if (stage === 'confirmation_delay') {
        ep1Values = data.slots
          .map(slot => slot.endpoint1.confirmation_delay_ms || 0)
          .sort((a, b) => a - b)
        ep2Values = data.slots
          .map(slot => slot.endpoint2.confirmation_delay_ms || 0)
          .sort((a, b) => a - b)
      } else if (stage === 'finalization_delay') {
        ep1Values = data.slots
          .map(slot => slot.endpoint1.finalization_delay_ms || 0)
          .sort((a, b) => a - b)
        ep2Values = data.slots
          .map(slot => slot.endpoint2.finalization_delay_ms || 0)
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
    first_shred_delay: "Time difference between when we receive 'FirstShredReceived' notifications from each endpoint.",
    processing_delay: "Time difference between when we receive 'Processed' notifications from each endpoint.",
    confirmation_delay: "Time difference between when we receive 'Confirmed' updates from each endpoint.",
    finalization_delay: "Time difference between when we receive 'Finalized' updates from each endpoint.",
    replay: "Time between receiving 'CreatedBank' and 'Processed' updates from each endpoint. Affected by endpoint's CPU speed.",
    download: "Time between receiving 'FirstShredReceived' and 'Completed' updates from each endpoint. Affected by endpoint's download speed.",
  }

  const stageLabels = {
    first_shred_delay: "First Shred Delay",
    processing_delay: "Processed Delay",
    download: "Download Duration",
    replay: "Replay Duration",
    confirmation_delay: "Confirmed Delay",
    finalization_delay: "Finalized Delay"
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
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Shows which endpoint typically delivers 'FirstShredReceived' data to us first. Heavily influenced by ping time - the endpoint with lower ping has a significant advantage.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">First Seen Shred</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span style={{ color: EP1_COLOR }}>{getEndpointShortName(0)} First to us:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.ep1Percentage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: EP2_COLOR }}>{getEndpointShortName(1)} First to us:</span>
                <span className="font-mono">{formatPercentage(firstSeenStats.ep2Percentage)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Average delay when we received a delayed 'FirstShredReceived' Slot Status Update.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">Average First Shred Delay</p>
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
                Average latency when received later
              </p>
            </div>
          </Card>

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

        <Card className="p-4 bg-yellow-500/10 border-yellow-500/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-2">
              <p className="font-semibold text-yellow-800">Critical: All metrics are affected by network latency (ping)</p>
              <div className="text-xs text-yellow-700 space-y-1">
                <p>
                  <span className="font-semibold">{getEndpointShortName(0)}</span> ping: <span className="font-mono">{data.endpoints[0].avg_ping_ms.toFixed(1)}ms</span> | 
                  <span className="font-semibold ml-2">{getEndpointShortName(1)}</span> ping: <span className="font-mono">{data.endpoints[1].avg_ping_ms.toFixed(1)}ms</span>
                  <span className="ml-2">({Math.abs(data.endpoints[0].avg_ping_ms - data.endpoints[1].avg_ping_ms).toFixed(1)}ms difference)</span>
                </p>
                <p>• We measure when updates reach us (the benchmarking client), NOT when endpoints actually receive them</p>
                <p>• An endpoint with {Math.abs(data.endpoints[0].avg_ping_ms - data.endpoints[1].avg_ping_ms).toFixed(0)}ms higher ping will appear ~{Math.abs(data.endpoints[0].avg_ping_ms - data.endpoints[1].avg_ping_ms).toFixed(0)}ms slower on most metrics</p>
                <p>• Only meaningful comparisons are between endpoints with similar ping times</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          {Object.entries(STAGE_CATEGORIES).map(([category, categoryInfo]) => {
            const Icon = categoryInfo.icon
            const relevantStages = Object.entries(stageStats).filter(([stage]) => 
              categoryInfo.stages.includes(stage)
            )
            
            if (relevantStages.length === 0) return null

            const isDelayStage = (stage: string) => 
              stage.endsWith('_delay') && stage !== 'download_delay' && stage !== 'replay_delay'
            
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
                    <Card key={stage} className={`p-4 ${category === 'consensus' && !isDelayStage(stage) ? 'opacity-75' : ''}`}>
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
                            {category === 'consensus' && !isDelayStage(stage) && (
                              <p className="text-xs mt-1 text-yellow-500">⚠️ This shows waiting time for network consensus, not endpoint performance.</p>
                            )}
                            {isDelayStage(stage) && (
                              <p className="text-xs mt-1 text-blue-500">ℹ️ Heavily influenced by ping differences. Shows which endpoint delivers updates to us faster.</p>
                            )}
                            {(category === 'network' || category === 'processing') && !isDelayStage(stage) && (
                              <p className="text-xs mt-1 text-orange-500">⚡ Includes node CPU advantage and network efficiency.</p>
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
                      
                      {(category !== 'consensus' || isDelayStage(stage)) && (
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
                  <li>• <span className="font-semibold">Network Performance</span> = How fast updates about data arrival reach us</li>
                  <li>• <span className="font-semibold">Local Processing</span> = How fast we receive processing status updates</li>
                  <li>• <span className="font-semibold">Network Consensus</span> = How long endpoints wait for network agreement</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold mb-1">About delay metrics:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <span className="font-semibold">All timings are from YOUR perspective</span> as the benchmarking client</li>
                  <li>• <span className="font-semibold">First Shred/Processed Delays</span> = Difference in when YOU receive updates from each endpoint</li>
                  <li>• <span className="font-semibold">Download/Replay Times</span> = Include endpoint work + time for updates to reach you</li>
                  <li>• An endpoint with 100ms higher ping appears ~100ms slower even if nodes are identical</li>
                  <li>• Only compare endpoints with similar ping times for meaningful results</li>
                </ul>
              </div>
              
              <p className="text-xs text-yellow-600">
                ⚠️ <span className="font-semibold">Remember:</span> We measure when updates reach the benchmark client, not actual endpoint performance. 
                Network latency (ping) significantly affects all measurements. The endpoint with lower ping has an inherent advantage in these metrics.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  )
}