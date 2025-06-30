import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Layers } from "lucide-react"
import { useState, useRef, useEffect } from "react"

export type StageVisibility = {
  download: boolean
  replay: boolean
  confirmation: boolean
}

interface TimelineControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFitAll: () => void
  onZoomChange: (value: number) => void
  visibleStages: StageVisibility
  onVisibleStagesChange: (stages: StageVisibility) => void
}

const stageLabels = {
  download: 'Download',
  replay: 'Replay',
  confirmation: 'Confirmation',
}

export function TimelineControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFitAll,
  onZoomChange,
  visibleStages,
  onVisibleStagesChange
}: TimelineControlsProps) {
  const [isStageSelectOpen, setIsStageSelectOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Count visible stages
  const visibleCount = Object.values(visibleStages).filter(Boolean).length

  const toggleStage = (stage: keyof StageVisibility) => {
    // Prevent turning off all stages
    if (visibleStages[stage] && visibleCount === 1) return
    
    onVisibleStagesChange({
      ...visibleStages,
      [stage]: !visibleStages[stage]
    })
  }

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsStageSelectOpen(false)
      }
    }
    
    if (isStageSelectOpen) {
      // Add small delay to prevent immediate closing
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 0)
      
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isStageSelectOpen])

  return (
    <div className="flex items-center justify-between bg-card rounded-lg p-4 border">
      {/* Zoom Controls */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Zoom: {zoom.toFixed(1)}x</span>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onZoomOut}
            disabled={zoom <= 0.1}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <Slider
            value={[zoom]}
            onValueChange={([value]) => onZoomChange(value)}
            min={0.1}
            max={10}
            step={0.1}
            className="w-32"
          />
          
          <Button
            variant="outline"
            size="icon"
            onClick={onZoomIn}
            disabled={zoom >= 10}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="outline"
            size="icon"
            onClick={onReset}
            title="Reset zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onFitAll}
            title="Fit all slots"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stage visibility controls */}
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsStageSelectOpen(!isStageSelectOpen)}
          className="gap-2"
        >
          <Layers className="h-4 w-4" />
          Timeline Stages ({visibleCount}/{Object.keys(stageLabels).length})
        </Button>
        
        {isStageSelectOpen && (
          <div 
            className="absolute top-full mt-2 right-0 w-48 bg-popover border rounded-md shadow-lg p-2 z-50"
            onClick={(e) => e.stopPropagation()} // Prevent event bubbling
          >
            <div className="space-y-2">
              {(Object.keys(stageLabels) as Array<keyof StageVisibility>).map((stage) => (
                <label
                  key={stage}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-accent rounded p-1"
                  onClick={(e) => {
                    e.preventDefault() // Prevent label default behavior
                    toggleStage(stage)
                  }}
                >
                  <Checkbox
                    checked={visibleStages[stage]}
                    onCheckedChange={() => {}} // Handled by label click
                    disabled={visibleStages[stage] && visibleCount === 1}
                    onClick={(e) => e.stopPropagation()} // Prevent double toggle
                  />
                  <span className="text-sm flex-1">{stageLabels[stage]}</span>
                  {!visibleStages[stage] && (
                    <Badge variant="secondary" className="text-xs">Hidden</Badge>
                  )}
                </label>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              Toggle timeline visibility only
            </div>
          </div>
        )}
      </div>
    </div>
  )
}