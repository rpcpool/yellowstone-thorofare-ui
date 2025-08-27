import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { BenchmarkResult } from "@/lib/types"
import { AlertCircle, Info, Network, Cpu, Users, TrendingUp, Minus } from "lucide-react"
import { parseEndpointName } from "@/lib/endpoint-utils"
import {
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface BenchmarkStatisticsProps {
  data: BenchmarkResult
  endpointNames?: [string | null, string | null]
}

interface MetricCategory {
  name: string
  icon: any
  description: string
  metrics: MetricInfo[]
}

interface MetricInfo {
  key: string
  name: string
  description: string
  ep1Data: { p50: number; p90: number; p99: number }
  ep2Data: { p50: number; p90: number; p99: number }
}

export function BenchmarkStatistics({ data, endpointNames }: BenchmarkStatisticsProps) {
  const EP1_COLOR = "#F052FF"
  const EP2_COLOR = "#4A90FF"

  const formatDuration = (ms: number) => {
    if (ms < 0.001) return `${(ms * 1000000).toFixed(0)}ns`
    if (ms < 1) return `${(ms * 1000).toFixed(1)}μs`
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const getEndpointShortName = (idx: number) => {
    if (endpointNames?.[idx]) {
      return endpointNames[idx]!
    }
    const endpoint = data.endpoints[idx].endpoint
    return parseEndpointName(endpoint)
  }

  const calculateDelta = (ep1: number, ep2: number) => {
    const diff = Math.abs(ep1 - ep2)
    const faster = ep1 < ep2 ? 'ep1' : ep2 < ep1 ? 'ep2' : 'tie'
    const percentage = ep1 !== 0 && ep2 !== 0 ? (diff / Math.min(ep1, ep2)) * 100 : 0
    return { diff, faster, percentage }
  }

  const getDeltaIcon = (faster: string) => {
    if (faster === 'ep1') return <TrendingUp className="h-4 w-4" style={{ color: EP1_COLOR }} />
    if (faster === 'ep2') return <TrendingUp className="h-4 w-4" style={{ color: EP2_COLOR }} />
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }


  // Organize metrics by categories
  const categories: MetricCategory[] = [
    {
      name: "Network Performance",
      icon: Network,
      description: "How quickly each endpoint delivers status updates to you",
      metrics: [
        {
          key: "first_shred_delay",
          name: "First Shred Delay",
          description: "Time difference between when we receive 'FirstShredReceived' notifications from each endpoint",
          ep1Data: data.endpoint1_summary.first_shred_delay,
          ep2Data: data.endpoint2_summary.first_shred_delay,
        },
        {
          key: "processing_delay",
          name: "Processing Delay",
          description: "Time difference between when we receive 'Processed' notifications from each endpoint",
          ep1Data: data.endpoint1_summary.processing_delay,
          ep2Data: data.endpoint2_summary.processing_delay,
        }
      ]
    },
    {
      name: "Processing Efficiency", 
      icon: Cpu,
      description: "Internal processing performance of each endpoint",
      metrics: [
        {
          key: "download_time",
          name: "Download Time",
          description: "Time between receiving 'FirstShredReceived' and 'Completed' updates. Affected by endpoint's download speed",
          ep1Data: data.endpoint1_summary.download_time,
          ep2Data: data.endpoint2_summary.download_time,
        },
        {
          key: "replay_time",
          name: "Replay Time",
          description: "Time between receiving 'CreatedBank' and 'Processed' updates. Affected by endpoint's CPU speed",
          ep1Data: data.endpoint1_summary.replay_time,
          ep2Data: data.endpoint2_summary.replay_time,
        }
      ]
    },
    {
      name: "Network Consensus",
      icon: Users,
      description: "Waiting time for network-wide agreement on slot finalization",
      metrics: [
        {
          key: "confirmation_time",
          name: "Confirmation Time",
          description: "Time between receiving 'Processed' and 'Confirmed' updates from each endpoint",
          ep1Data: data.endpoint1_summary.confirmation_time,
          ep2Data: data.endpoint2_summary.confirmation_time,
        },
        {
          key: "confirmation_delay",
          name: "Confirmation Delay",
          description: "Time difference between when we receive 'Confirmed' updates from each endpoint",
          ep1Data: data.endpoint1_summary.confirmation_delay,
          ep2Data: data.endpoint2_summary.confirmation_delay,
        }
      ]
    }
  ]

  // Add account delays if available
  if (data.endpoint1_summary.account_delay && data.endpoint2_summary.account_delay) {
    categories[0].metrics.push({
      key: "account_delay",
      name: "Account Update Delays",
      description: "Time difference for account update notifications",
      ep1Data: data.endpoint1_summary.account_delay,
      ep2Data: data.endpoint2_summary.account_delay,
    })
  }

  // Calculate overall performance analysis
  const calculateOverallPerformance = () => {
    let ep1Wins = 0
    let ep2Wins = 0
    let ties = 0

    categories.forEach(category => {
      category.metrics.forEach(metric => {
        const p90Delta = calculateDelta(metric.ep1Data.p90, metric.ep2Data.p90)
        if (p90Delta.faster === 'ep1') ep1Wins++
        else if (p90Delta.faster === 'ep2') ep2Wins++
        else ties++
      })
    })

    const total = ep1Wins + ep2Wins + ties
    return {
      ep1Wins,
      ep2Wins,
      ties,
      ep1Percentage: (ep1Wins / total) * 100,
      ep2Percentage: (ep2Wins / total) * 100
    }
  }

  const overallPerf = calculateOverallPerformance()

  return (
    <TooltipProvider>
      <div className="space-y-8">

        {/* Network Latency Warning */}
        <Card className="p-6 bg-yellow-500/10 border-yellow-500/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-yellow-600 mt-1 flex-shrink-0" />
            <div className="space-y-3">
              <p className="text-lg font-semibold text-yellow-800">Network Latency Impact</p>
              <div className="text-base text-yellow-700 space-y-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-semibold">{getEndpointShortName(0)} ping:</span>
                  <span className="font-mono text-lg">{data.endpoints[0].avg_ping_ms.toFixed(1)}ms</span>
                  <span className="font-semibold">{getEndpointShortName(1)} ping:</span>
                  <span className="font-mono text-lg">{data.endpoints[1].avg_ping_ms.toFixed(1)}ms</span>
                  <Badge variant="secondary" className="text-sm">
                    {Math.abs(data.endpoints[0].avg_ping_ms - data.endpoints[1].avg_ping_ms).toFixed(1)}ms difference
                  </Badge>
                </div>
                <p>• All measurements reflect when updates reach YOU (the benchmark client)</p>
                <p>• Higher ping endpoints will appear slower even with identical node performance</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Overall Performance Summary */}
        <Card className="p-6 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-violet-500/20">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Overall Performance Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold mb-2" style={{ color: EP1_COLOR }}>
                {overallPerf.ep1Percentage.toFixed(0)}%
              </div>
              <div className="text-base font-medium" style={{ color: EP1_COLOR }}>
                {getEndpointShortName(0)} Faster
              </div>
              <div className="text-sm text-muted-foreground">
                {overallPerf.ep1Wins} metrics
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2" style={{ color: EP2_COLOR }}>
                {overallPerf.ep2Percentage.toFixed(0)}%
              </div>
              <div className="text-base font-medium" style={{ color: EP2_COLOR }}>
                {getEndpointShortName(1)} Faster
              </div>
              <div className="text-sm text-muted-foreground">
                {overallPerf.ep2Wins} metrics
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2 text-muted-foreground">
                {((overallPerf.ties / (overallPerf.ep1Wins + overallPerf.ep2Wins + overallPerf.ties)) * 100).toFixed(0)}%
              </div>
              <div className="text-base font-medium text-muted-foreground">
                Tied Metrics
              </div>
              <div className="text-sm text-muted-foreground">
                {overallPerf.ties} metrics
              </div>
            </div>
          </div>
        </Card>

        {/* Performance Categories */}
        {categories.map((category, categoryIdx) => {
          const Icon = category.icon
          return (
            <Card key={categoryIdx} className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Icon className="h-6 w-6 text-muted-foreground" />
                <div>
                  <h3 className="text-xl font-semibold">{category.name}</h3>
                  <p className="text-base text-muted-foreground">{category.description}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-base font-semibold" style={{ width: '400px', maxWidth: '400px', minWidth: '400px' }}>Metric</TableHead>
                      <TableHead className="text-center min-w-[140px]">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EP1_COLOR }} />
                          <span className="text-base font-semibold">{getEndpointShortName(0)}</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-center min-w-[140px]">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EP2_COLOR }} />
                          <span className="text-base font-semibold">{getEndpointShortName(1)}</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-center min-w-[120px]">
                        <div className="text-center">
                          <span className="text-base font-semibold">Difference</span>
                          <div className="text-xs text-muted-foreground font-normal">(P90)</div>
                        </div>
                      </TableHead>
                      <TableHead className="text-center min-w-[120px]">
                        <span className="text-base font-semibold">Winner</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.metrics.map((metric, metricIdx) => {
                      const p90Delta = calculateDelta(metric.ep1Data.p90, metric.ep2Data.p90)

                      return (
                        <TableRow key={metricIdx} className="hover:bg-muted/30">
                          <TableCell className="font-medium" style={{ width: '400px', maxWidth: '400px', minWidth: '400px' }}>
                            <div className="w-96 max-w-96">
                              <div className="text-base font-semibold">{metric.name}</div>
                              <div className="text-sm text-muted-foreground leading-tight whitespace-normal break-words">{metric.description}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="space-y-1 font-mono">
                              <div className="text-sm">
                                <span className="text-muted-foreground">P50:</span> <span className="font-semibold">{formatDuration(metric.ep1Data.p50)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">P90:</span> <span className="font-semibold">{formatDuration(metric.ep1Data.p90)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">P99:</span> <span className="font-semibold">{formatDuration(metric.ep1Data.p99)}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="space-y-1 font-mono">
                              <div className="text-sm">
                                <span className="text-muted-foreground">P50:</span> <span className="font-semibold">{formatDuration(metric.ep2Data.p50)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">P90:</span> <span className="font-semibold">{formatDuration(metric.ep2Data.p90)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">P99:</span> <span className="font-semibold">{formatDuration(metric.ep2Data.p99)}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="space-y-2">
                              <div className="flex items-center justify-center gap-2">
                                {getDeltaIcon(p90Delta.faster)}
                                <span className="font-mono text-sm font-semibold">
                                  {formatDuration(p90Delta.diff)}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {p90Delta.faster === 'ep1' 
                                  ? `${getEndpointShortName(0)} faster`
                                  : p90Delta.faster === 'ep2'
                                  ? `${getEndpointShortName(1)} faster`
                                  : 'Similar'
                                }
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="space-y-2">
                              {p90Delta.faster === 'ep1' && (
                                <div className="text-center">
                                  <div className="w-6 h-6 rounded-full mx-auto mb-1" style={{ backgroundColor: EP1_COLOR }} />
                                  <div className="text-xs font-semibold" style={{ color: EP1_COLOR }}>
                                    {getEndpointShortName(0)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Faster</div>
                                </div>
                              )}
                              {p90Delta.faster === 'ep2' && (
                                <div className="text-center">
                                  <div className="w-6 h-6 rounded-full mx-auto mb-1" style={{ backgroundColor: EP2_COLOR }} />
                                  <div className="text-xs font-semibold" style={{ color: EP2_COLOR }}>
                                    {getEndpointShortName(1)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Faster</div>
                                </div>
                              )}
                              {p90Delta.faster === 'tie' && (
                                <div className="text-center">
                                  <div className="w-6 h-6 rounded-full mx-auto mb-1 bg-muted-foreground" />
                                  <div className="text-xs font-semibold text-muted-foreground">
                                    Tied
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )
        })}

        {/* Info Section */}
        <Card className="p-6 bg-muted/50">
          <div className="flex items-start gap-3">
            <Info className="h-6 w-6 text-muted-foreground mt-1" />
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold mb-2">Understanding the Metrics:</p>
                <ul className="space-y-1 text-base">
                  <li>• <span className="font-semibold">P50/P90/P99</span> = 50th/90th/99th percentile performance</li>
                  <li>• <span className="font-semibold">Difference</span> = P90 performance gap between endpoints (90th percentile comparison)</li>
                  <li>• <span className="font-semibold">Winner</span> = Which endpoint performs better for this metric (P90 comparison)</li>
                </ul>
              </div>
              
              <div>
                <p className="text-lg font-semibold mb-2">Category Meanings:</p>
                <ul className="space-y-1 text-base">
                  <li>• <span className="font-semibold">Network Performance</span> = Speed of status update delivery to you</li>
                  <li>• <span className="font-semibold">Processing Efficiency</span> = Internal endpoint processing speed</li>
                  <li>• <span className="font-semibold">Network Consensus</span> = Waiting for network-wide agreement</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  )
}