import { useState } from "react"
import { BenchmarkHeader } from "@/components/BenchmarkHeader"
import { TimelineControls, type StageVisibility } from "@/components/TimelineControls"
import { Timeline } from "@/components/Timeline"
import { PIXELS_PER_MS } from "@/lib/constants"
import sampleDataBase from "@/data/sample-benchmark.json"
import type { BenchmarkResult } from "./lib/types"
import { BenchmarkStatistics } from "./components/BenchmarkStatistics"

function App() {
  const [zoom, setZoom] = useState(1)
  const [viewportOffset, setViewportOffset] = useState(0)
  const [visibleStages, setVisibleStages] = useState<StageVisibility>({
    download: true,
    replay: true,
    confirmation: true,
    finalization: true
  })
  
  const sampleData = sampleDataBase as BenchmarkResult
  
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
  
  const handleFitAll = () => {
    // Calculate zoom to fit all visible stages
    const firstTimestamp = Math.min(
      ...sampleData.slots.flatMap(slot => [
        slot.endpoint1.transitions[0]?.timestamp || Infinity,
        slot.endpoint2.transitions[0]?.timestamp || Infinity
      ])
    )
    
    // Calculate last timestamp based on visible stages
    let lastTimestamp = firstTimestamp
    sampleData.slots.forEach(slot => {
      const stages = ['download', 'replay', 'confirmation', 'finalization'] as const
      let ep1Time = slot.endpoint1.transitions[0]?.timestamp || firstTimestamp
      let ep2Time = slot.endpoint2.transitions[0]?.timestamp || firstTimestamp
      
      stages.forEach(stage => {
        if (visibleStages[stage]) {
          ep1Time += slot.endpoint1.durations[`${stage}_ms`]
          ep2Time += slot.endpoint2.durations[`${stage}_ms`]
        }
      })
      
      lastTimestamp = Math.max(lastTimestamp, ep1Time, ep2Time)
    })
    
    const totalDuration = lastTimestamp - firstTimestamp
    const viewportWidth = window.innerWidth * 0.7 - 200 // Account for 70% width and padding
    const optimalZoom = viewportWidth / (totalDuration * PIXELS_PER_MS * 1.1)
    
    setZoom(Math.max(0.1, Math.min(optimalZoom, 10)))
    setViewportOffset(0)
  }
  
  return (
    <div className="min-h-screen min-w-screen bg-background py-8 px-[15%] overflow-x-hidden overflow-y-hidden">
      <div className="w-full space-y-6">
        <BenchmarkHeader data={sampleData} />
        <BenchmarkStatistics data={sampleData} />
        
        <TimelineControls
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onFitAll={handleFitAll}
          onZoomChange={setZoom}
          visibleStages={visibleStages}
          onVisibleStagesChange={setVisibleStages}
        />
        
        <Timeline 
          data={sampleData}
          zoom={zoom}
          viewportOffset={viewportOffset}
          onViewportChange={setViewportOffset}
          visibleStages={visibleStages}
        />
      </div>
    </div>
  )
}

export default App