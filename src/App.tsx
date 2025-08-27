import { useState, useEffect } from "react"
import { BenchmarkHeader } from "@/components/BenchmarkHeader"
import { TimelineControls, type StageVisibility } from "@/components/TimelineControls"
import { Timeline } from "@/components/Timeline"
import { BenchmarkStatistics } from "@/components/BenchmarkStatistics"
import { BenchmarkDataManager } from "@/components/BenchmarkDataManager"
import type { BenchmarkResult } from "./lib/types"

type StoredBenchmark = {
  id: string;
  name: string;
  timestamp: number;
  data: BenchmarkResult;
  endpoint1Name?: string | null;
  endpoint2Name?: string | null;
}

function App() {
  const [currentEndpointNames, setCurrentEndpointNames] = useState<[string | null, string | null]>([null, null])
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkResult | null>(null)
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [zoom, setZoom] = useState(0.5)
  const [viewportOffset, setViewportOffset] = useState(0)
  const [visibleStages, setVisibleStages] = useState<StageVisibility>({
    download: true,
    replay: true,
    confirmation: true,
  })
  
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.5, 10))
  }
  
  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.5, 0.1))
  }
  
  const handleReset = () => {
    setZoom(1)
    setViewportOffset(0)
  }


  // Handler for benchmark changes
  const handleBenchmarkChange = (data: BenchmarkResult | null, id?: string) => {
    setBenchmarkData(data)
    setSelectedBenchmarkId(id || null)
    setRefreshKey(prev => prev + 1)
    
    // Load endpoint names for this benchmark
    if (id) {
      try {
        const stored = localStorage.getItem("yellowstone-benchmarks")
        if (stored) {
          const benchmarks = JSON.parse(stored) as StoredBenchmark[]
          const benchmark = benchmarks.find((b) => b.id === id)
          if (benchmark) {
            setCurrentEndpointNames([
              benchmark.endpoint1Name || null,
              benchmark.endpoint2Name || null
            ])
          }
        }
      } catch {
        setCurrentEndpointNames([null, null])
      }
    } else {
      setCurrentEndpointNames([null, null])
    }
  }

  // Handler for endpoint name changes
  const handleEndpointNameChange = (endpointIndex: 0 | 1, newName: string) => {
    console.log('Changing endpoint', endpointIndex, 'to', newName)
    if (!selectedBenchmarkId) return
    
    // Update in localStorage
    try {
      const stored = localStorage.getItem("yellowstone-benchmarks")
      if (stored) {
        const benchmarks = JSON.parse(stored) as StoredBenchmark[]
        const updated = benchmarks.map((b) => {
          if (b.id === selectedBenchmarkId) {
            if (endpointIndex === 0) {
              return { ...b, endpoint1Name: newName || null }
            } else {
              return { ...b, endpoint2Name: newName || null }
            }
          }
          return b
        })
        localStorage.setItem("yellowstone-benchmarks", JSON.stringify(updated))
        
        // Update local state
        const newNames: [string | null, string | null] = [...currentEndpointNames]
        newNames[endpointIndex] = newName || null
        setCurrentEndpointNames(newNames)
        setRefreshKey(prev => prev + 1)
      }
    } catch (error) {
      console.error("Failed to update endpoint name:", error)
    }
  }

  // Get current benchmark name (with refresh key dependency)
  const getCurrentBenchmarkName = () => {
    if (!selectedBenchmarkId) return null
    try {
      const stored = localStorage.getItem("yellowstone-benchmarks")
      if (stored) {
        const benchmarks = JSON.parse(stored) as StoredBenchmark[]
        const current = benchmarks.find((b) => b.id === selectedBenchmarkId)
        return current?.name || null
      }
    } catch {
      return null
    }
    return null
  }

  // Get total benchmarks count
  const getBenchmarksCount = () => {
    try {
      const stored = localStorage.getItem("yellowstone-benchmarks")
      if (stored) {
        const benchmarks = JSON.parse(stored) as StoredBenchmark[]
        return benchmarks.length
      }
    } catch {
      return 0
    }
    return 0
  }

  // Reset zoom when data changes
  useEffect(() => {
    setZoom(0.5)
    setViewportOffset(0)
  }, [benchmarkData])
  

  // Load initial data from localStorage if available
  useEffect(() => {
    try {
      const stored = localStorage.getItem("yellowstone-benchmarks")
      if (stored) {
        const benchmarks = JSON.parse(stored) as StoredBenchmark[]
        if (benchmarks.length > 0) {
          // Load the most recent benchmark
          const mostRecent = benchmarks.sort((a, b) => b.timestamp - a.timestamp)[0]
          setBenchmarkData(mostRecent.data)
          setSelectedBenchmarkId(mostRecent.id)
          setCurrentEndpointNames([
            mostRecent.endpoint1Name || null,
            mostRecent.endpoint2Name || null
          ])
        }
      }
    } catch (error) {
      console.error("Failed to load stored benchmarks:", error)
    }
  }, [])
  
  return (
    <div className="min-h-screen bg-background overflow-x-hidden min-w-screen">
      <div className="w-full max-w-[95vw] sm:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {!benchmarkData ? (
          // Show data manager when no data is loaded
          <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8">
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[#DA05E2] to-[#2C0FDF] bg-clip-text text-transparent">
                Yellowstone Thorofare
              </h1>
              <p className="text-lg text-muted-foreground">
                Visualize and analyze gRPC endpoint performance
              </p>
            </div>
            
            <BenchmarkDataManager
              onDataChange={handleBenchmarkChange}
              currentData={benchmarkData}
              initialSelectedId={selectedBenchmarkId}
              onNameChange={() => setRefreshKey(prev => prev + 1)}
            />
          </div>
        ) : (
          // Show benchmark visualization when data is loaded
          <div className="w-full space-y-4 sm:space-y-6">
            <BenchmarkHeader 
              key={refreshKey}
              data={benchmarkData} 
              currentBenchmarkName={getCurrentBenchmarkName()}
              onBenchmarkChange={handleBenchmarkChange}
              selectedBenchmarkId={selectedBenchmarkId}
              benchmarksCount={getBenchmarksCount()}
              onNameChange={() => setRefreshKey(prev => prev + 1)}
              endpointNames={currentEndpointNames}
              onEndpointNameChange={handleEndpointNameChange}
            />
            
            <BenchmarkStatistics 
              data={benchmarkData} 
              endpointNames={currentEndpointNames}
            />
            
            <TimelineControls
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleReset}
              onZoomChange={setZoom}
              visibleStages={visibleStages}
              onVisibleStagesChange={setVisibleStages}
            />
            
            <Timeline 
              data={benchmarkData}
              zoom={zoom}
              viewportOffset={viewportOffset}
              onViewportChange={setViewportOffset}
              visibleStages={visibleStages}
              endpointNames={currentEndpointNames}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App