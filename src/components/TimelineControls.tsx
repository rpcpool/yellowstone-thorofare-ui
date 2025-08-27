import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

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
  onZoomChange: (value: number) => void
  visibleStages: StageVisibility
  onVisibleStagesChange: (stages: StageVisibility) => void
}

export function TimelineControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onZoomChange
}: TimelineControlsProps) {
  return (
    <div className="flex items-center justify-start bg-card rounded-lg p-4 border">
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
        
        <Button
          variant="outline"
          size="icon"
          onClick={onReset}
          title="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}