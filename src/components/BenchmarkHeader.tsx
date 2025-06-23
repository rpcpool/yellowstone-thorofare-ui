import { Card } from "@/components/ui/card"
import type { BenchmarkResult } from "@/lib/types"
import { Database } from "lucide-react"

interface BenchmarkHeaderProps {
  data: BenchmarkResult
  dataSource?: string
  version?: string
}

export function BenchmarkHeader({ 
  data, 
  dataSource = "Yellowstone Dragon's mouth gRPC",
  version = "v1.0.0"
}: BenchmarkHeaderProps) {
  const { metadata, endpoints } = data
  
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Logo - update the src path to match your file location */}
          <img 
            src="/logo.svg" 
            alt="Triton One" 
            className="h-28 w-auto"
          />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#DA05E2] to-[#2C0FDF] bg-clip-text text-transparent">
              Yellowstone Thorofare
            </h1>
            <p className="text-sm text-muted-foreground">gRPC Endpoint Benchmark Tool</p>
          </div>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="h-4 w-4" />
            <span>Geyser Plugin: {dataSource}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Version: {version}
          </div>
        </div>
      </div>
      
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
        {endpoints.map((endpoint, idx) => (
          <Card key={idx} className="p-4 border-border/50 hover:border-[#8424D1]/50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${
                idx === 0 ? 'bg-[#DA05E2]' : 'bg-[#2C0FDF]'
              }`} />
              <h3 className="font-semibold text-lg">
                Endpoint {idx + 1}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground break-all font-mono">
              {endpoint.endpoint}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
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
        ))}
      </div>
    </div>
  )
}