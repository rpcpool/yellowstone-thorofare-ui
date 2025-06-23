import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { BenchmarkResult } from "@/lib/types"
import { Database, Activity, Settings, FileJson, Clock, Zap, TrendingUp, FolderOpen } from "lucide-react"
import { useState } from "react"
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { parseVersion, formatVersionDisplay, parseEndpointName } from "@/lib/endpoint-utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BenchmarkDataManager } from "./BenchmarkDataManager"

interface BenchmarkHeaderProps {
  data: BenchmarkResult
  currentBenchmarkName?: string | null
  onBenchmarkChange: (data: BenchmarkResult | null, id?: string) => void
  selectedBenchmarkId?: string | null
  benchmarksCount?: number
  onNameChange?: () => void
}

export function BenchmarkHeader({ 
  data, 
  currentBenchmarkName,
  onBenchmarkChange,
  selectedBenchmarkId,
  benchmarksCount = 0,
  onNameChange
}: BenchmarkHeaderProps) {
  const { metadata, endpoints, version, with_load, grpc_config, endpoint1_summary, endpoint2_summary } = data
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false)
  
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }
  
  // Calculate which endpoint was generally faster
  const getFasterEndpoint = () => {
    const ep1Faster = [
      endpoint1_summary.first_shred_delay.p50 < endpoint2_summary.first_shred_delay.p50,
      endpoint1_summary.download_time.p50 < endpoint2_summary.download_time.p50,
      endpoint1_summary.replay_time.p50 < endpoint2_summary.replay_time.p50,
      endpoint1_summary.processing_delay.p50 < endpoint2_summary.processing_delay.p50,
    ].filter(Boolean).length
    
    const ep2Faster = 4 - ep1Faster
    
    if (ep1Faster > ep2Faster) return { index: 0, name: getShortName(endpoints[0].endpoint) }
    if (ep2Faster > ep1Faster) return { index: 1, name: getShortName(endpoints[1].endpoint) }
    return null
  }
  

  const getShortName = (endpoint: string) => {
    return parseEndpointName(endpoint);
  }
  
  const fasterEndpoint = getFasterEndpoint()

  // Handle benchmark change and close dialog
  const handleBenchmarkChangeInternal = (data: BenchmarkResult | null, id?: string) => {
    onBenchmarkChange(data, id)
    if (data) {
      setIsDataManagerOpen(false)
    }
  }
  
  return (
    <div className="space-y-4 flex-1">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {/* Logo - update the src path to match your file location */}
          <img 
            src="/logo.svg" 
            alt="Triton One" 
            className="h-20 sm:h-24 lg:h-28 w-auto"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#DA05E2] to-[#2C0FDF] bg-clip-text text-transparent">
              Yellowstone Thorofare
            </h1>
            <p className="text-sm text-muted-foreground">gRPC Endpoint Benchmark Tool</p>
          </div>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="h-4 w-4" />
            <span>Version: {version}</span>
          </div>
          {with_load && (
            <Badge variant="secondary" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Load Testing Mode
            </Badge>
          )}
        </div>
      </div>
      
      {/* Current benchmark info with integrated button */}
      {currentBenchmarkName && (
        <Card className="p-4 bg-gradient-to-r from-[#DA05E2]/5 to-[#2C0FDF]/5 border-[#8424D1]/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-background rounded-lg">
                <FileJson className="h-5 w-5 text-[#8424D1]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Benchmark</p>
                <p className="font-semibold">{currentBenchmarkName}</p>
              </div>
              
              {/* Obvious button to switch benchmarks */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDataManagerOpen(true)}
                className="gap-2 border-[#8424D1]/30 hover:border-[#8424D1]/50"
              >
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">View All</span>
                <span className="sm:hidden">Change</span>
                {benchmarksCount > 1 && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                    {benchmarksCount}
                  </span>
                )}
              </Button>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">{new Date(metadata.benchmark_start_time).toLocaleDateString()}</span>
                <span className="sm:hidden">{new Date(metadata.benchmark_start_time).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>{formatDuration(metadata.duration_ms)}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {metadata.compared_slots} slots
              </Badge>
              {fasterEndpoint && (
                <Badge 
                  variant="outline" 
                  className="text-xs border-green-600/50 text-green-600 flex items-center gap-1"
                >
                  <TrendingUp className="h-3 w-3" />
                  <span className="hidden sm:inline">{fasterEndpoint.name} faster overall</span>
                  <span className="sm:hidden">{fasterEndpoint.name} faster</span>
                </Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Data manager dialog */}
      <Dialog open={isDataManagerOpen} onOpenChange={setIsDataManagerOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Benchmark Manager</DialogTitle>
            <DialogDescription>
              Upload new benchmarks, switch between existing ones, or rename your benchmarks
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <BenchmarkDataManager
              onDataChange={handleBenchmarkChangeInternal}
              currentData={data}
              initialSelectedId={selectedBenchmarkId}
              inModal={true}
              onNameChange={onNameChange}
            />
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Metadata Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors">
          <p className="text-sm text-muted-foreground">Duration</p>
          <p className="text-2xl font-bold">{formatDuration(metadata.duration_ms)}</p>
        </Card>
        
        <Card className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors">
          <p className="text-sm text-muted-foreground">Common Slots</p>
          <p className="text-2xl font-bold">{metadata.common_slots}</p>
          <p className="text-xs text-muted-foreground">
            of {metadata.total_slots_collected} total
          </p>
        </Card>
        
        <Card className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors">
          <p className="text-sm text-muted-foreground">Compared</p>
          <p className="text-2xl font-bold">{metadata.compared_slots}</p>
        </Card>
        
        <Card className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors">
          <p className="text-sm text-muted-foreground">Dropped</p>
          <p className="text-2xl font-bold">{metadata.dropped_slots}</p>
        </Card>
      </div>
      
      {/* Endpoint Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {endpoints.map((endpoint, idx) => {
          const versionInfo = parseVersion(endpoint.plugin_version);
          return (
            <Card key={idx} className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    idx === 0 ? 'bg-[#DA05E2]' : 'bg-[#2C0FDF]'
                  }`} />
                  <h3 className="font-semibold text-lg">
                    Endpoint {idx + 1}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {endpoint.plugin_type}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {formatVersionDisplay(endpoint.plugin_version)}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground break-all font-mono mb-1">
                {parseEndpointName(endpoint.endpoint)}
              </p>
              {versionInfo.hostname && (
                <p className="text-xs text-muted-foreground mb-2">
                  Host: {versionInfo.hostname}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Ping</p>
                  <p className="font-semibold">{endpoint.avg_ping_ms.toFixed(1)}ms</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Updates</p>
                  <p className="font-semibold">{endpoint.total_updates.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unique Slots</p>
                  <p className="font-semibold">{endpoint.unique_slots}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* gRPC Configuration (Collapsible) */}
      <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Settings className="h-4 w-4 mr-2" />
            {isConfigOpen ? 'Hide' : 'Show'} gRPC Configuration
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 p-4 bg-muted/50">
            <h4 className="font-semibold text-sm mb-3">gRPC Settings</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Connect Timeout</p>
                <p className="font-mono">{grpc_config.connect_timeout_ms}ms</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Request Timeout</p>
                <p className="font-mono">{grpc_config.request_timeout_ms}ms</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max Message Size</p>
                <p className="font-mono">{(grpc_config.max_message_size / 1024 / 1024).toFixed(1)}MB</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">TLS</p>
                <p className="font-mono">{grpc_config.use_tls ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">HTTP2 Adaptive Window</p>
                <p className="font-mono">{grpc_config.http2_adaptive_window ? 'Enabled' : 'Disabled'}</p>
              </div>
              {grpc_config.initial_connection_window_size && (
                <div>
                  <p className="text-xs text-muted-foreground">Connection Window</p>
                  <p className="font-mono">{(grpc_config.initial_connection_window_size / 1024).toFixed(0)}KB</p>
                </div>
              )}
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}