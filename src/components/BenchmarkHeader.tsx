import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { BenchmarkResult } from "@/lib/types"
import { Activity, Settings, FileJson, Clock, FolderOpen, Cpu } from "lucide-react"
import { useState } from "react"
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { parseVersion, formatVersionDisplay, parseEndpointName } from "@/lib/endpoint-utils"
import { Pencil, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
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
  endpointNames?: [string | null, string | null]
  onEndpointNameChange?: (endpointIndex: 0 | 1, newName: string) => void
}

export function BenchmarkHeader({ 
  data, 
  currentBenchmarkName,
  onBenchmarkChange,
  selectedBenchmarkId,
  benchmarksCount = 0,
  onNameChange,
  endpointNames,
  onEndpointNameChange
}: BenchmarkHeaderProps) {
  const [editingEndpoint, setEditingEndpoint] = useState<0 | 1 | null>(null)
  const [editingName, setEditingName] = useState("")
  const { metadata, endpoints, version, with_load, grpc_config} = data
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false)
  
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }
  
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
          <img 
            src="/logo.svg" 
            alt="Triton One" 
            className="h-16 sm:h-20 md:h-24 lg:h-28 w-auto"
          />
          <div>
            <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-[#DA05E2] to-[#2C0FDF] bg-clip-text text-transparent">
              Yellowstone Thorofare
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">gRPC Endpoint Benchmark Visualizer</p>
            <a 
              href="https://github.com/rpcpool/yellowstone-thorofare" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground justify-end">
            <Cpu className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Thorofare CLI Version: v{version}</span>
            <span className="sm:hidden">v{version}</span>
          </div>
          {with_load && (
            <Badge variant="secondary" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Load Testing Mode
            </Badge>
          )}
        </div>
      </div>
      
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
                <Clock className="h-4 w-4" />
                <span>{formatDuration(metadata.duration_ms)}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {metadata.compared_slots} slots
              </Badge>
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
          const isEditing = editingEndpoint === idx;
          const customName = endpointNames?.[idx] || null;
          const displayName = customName || parseEndpointName(endpoint.endpoint);
          
          return (
            <Card key={idx} className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors group">
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
              
              <div className="flex items-center gap-2 mb-2">
                {isEditing ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onEndpointNameChange?.(idx as 0 | 1, editingName)
                          setEditingEndpoint(null)
                        } else if (e.key === 'Escape') {
                          setEditingEndpoint(null)
                        }
                      }}
                      className="h-7 text-sm flex-1"
                      autoFocus
                      placeholder="Custom name (empty to reset)"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        onEndpointNameChange?.(idx as 0 | 1, editingName)
                        setEditingEndpoint(null)
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditingEndpoint(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{displayName}</p>
                      {customName && (
                        <p className="text-xs text-muted-foreground">
                          Original: {parseEndpointName(endpoint.endpoint)}
                        </p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        setEditingEndpoint(idx as 0 | 1)
                        setEditingName(customName || "")
                      }}
                      title="Set custom name"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground break-all font-mono mb-1">
                {endpoint.endpoint}
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