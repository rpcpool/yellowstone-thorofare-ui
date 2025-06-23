import { useState, useEffect } from "react"
import { BenchmarkHeader } from "@/components/BenchmarkHeader"
import { TimelineControls, type StageVisibility } from "@/components/TimelineControls"
import { Timeline } from "@/components/Timeline"
import { PIXELS_PER_MS } from "@/lib/constants"
import sampleDataBase from "@/data/sample-benchmark.json"
import type { BenchmarkResult } from "./lib/types"
import { BenchmarkStatistics } from "./components/BenchmarkStatistics"

function App() {
  const [zoom, setZoom] = useState(0.5) // Start with lower zoom
  const [viewportOffset, setViewportOffset] = useState(0)
  const [visibleStages, setVisibleStages] = useState<StageVisibility>({
    download: true,
    replay: true,
    confirmation: true,
    finalization: false // Hidden by default
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
      ...sampleData.slots.flatMap(slot => {
        const ep1First = slot.endpoint1.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
        const ep2First = slot.endpoint2.transitions.find(t => t.status === "FirstShredReceived")?.timestamp || Infinity
        return Math.min(ep1First, ep2First)
      })
    )
    
    // Calculate last timestamp based on actual transition times
    const lastTimestamp = Math.max(
      ...sampleData.slots.flatMap(slot => {
        const transitions1 = slot.endpoint1.transitions
        const transitions2 = slot.endpoint2.transitions
        
        let lastTime1 = firstTimestamp
        let lastTime2 = firstTimestamp
        
        // Get actual timestamps for visible stages
        if (visibleStages.download) {
          const completed1 = transitions1.find(t => t.status === "Completed")?.timestamp
          const completed2 = transitions2.find(t => t.status === "Completed")?.timestamp
          if (completed1) lastTime1 = Math.max(lastTime1, completed1)
          if (completed2) lastTime2 = Math.max(lastTime2, completed2)
        }
        
        if (visibleStages.replay) {
          const processed1 = transitions1.find(t => t.status === "Processed")?.timestamp
          const processed2 = transitions2.find(t => t.status === "Processed")?.timestamp
          if (processed1) lastTime1 = Math.max(lastTime1, processed1)
          if (processed2) lastTime2 = Math.max(lastTime2, processed2)
        }
        
        if (visibleStages.confirmation) {
          const confirmed1 = transitions1.find(t => t.status === "Confirmed")?.timestamp
          const confirmed2 = transitions2.find(t => t.status === "Confirmed")?.timestamp
          if (confirmed1) lastTime1 = Math.max(lastTime1, confirmed1)
          if (confirmed2) lastTime2 = Math.max(lastTime2, confirmed2)
        }
        
        if (visibleStages.finalization) {
          const finalized1 = transitions1.find(t => t.status === "Finalized")?.timestamp
          const finalized2 = transitions2.find(t => t.status === "Finalized")?.timestamp
          if (finalized1) lastTime1 = Math.max(lastTime1, finalized1)
          if (finalized2) lastTime2 = Math.max(lastTime2, finalized2)
        }
        
        return Math.max(lastTime1, lastTime2)
      })
    )
    
    const totalDuration = lastTimestamp - firstTimestamp
    // Match the responsive container widths
    const getContainerPercentage = () => {
      if (window.innerWidth < 640) return 0.95
      if (window.innerWidth < 1024) return 0.90
      if (window.innerWidth < 1280) return 0.85
      return 0.80
    }
    const containerWidth = window.innerWidth * getContainerPercentage() - 100 // responsive vw with margins
    const optimalZoom = containerWidth / (totalDuration * PIXELS_PER_MS)
    
    setZoom(Math.max(0.1, Math.min(optimalZoom, 10)))
    setViewportOffset(0)
  }
  
  // Auto-fit on initial load and window resize
  useEffect(() => {
    handleFitAll()
    
    const handleResize = () => {
      handleFitAll()
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [visibleStages]) // eslint-disable-line react-hooks/exhaustive-deps
  
  return (
    <div className="min-h-screen bg-background overflow-x-hidden min-w-screen">
      <div className="w-full max-w-[95vw] sm:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="w-full space-y-4 sm:space-y-6">
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
    </div>
  )
}

export default App