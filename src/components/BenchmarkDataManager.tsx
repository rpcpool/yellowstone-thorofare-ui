import { useState, useCallback, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseEndpointName } from "@/lib/endpoint-utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, FileJson, Trash2, Database, AlertCircle, Clock, Activity, ChevronRight, Pencil, Check, X } from "lucide-react";
import type { BenchmarkResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StoredBenchmark {
  id: string;
  name: string;
  timestamp: number;
  data: BenchmarkResult;
}

interface BenchmarkDataManagerProps {
  onDataChange: (data: BenchmarkResult | null, id?: string) => void;
  currentData: BenchmarkResult | null;
  initialSelectedId?: string | null;
  inSheet?: boolean;
  inModal?: boolean;
  onNameChange?: () => void; 
}

const STORAGE_KEY = "yellowstone-benchmarks";

export function BenchmarkDataManager({
    onDataChange,
    currentData,
    initialSelectedId,
    inSheet = false,
    inModal = false,
    onNameChange,
}: BenchmarkDataManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [isHoveredBenchmark, setIsHoveredBenchmark] = useState<string | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Update selectedId when initialSelectedId changes
  useEffect(() => {
    setSelectedId(initialSelectedId || null);
  }, [initialSelectedId]);

  // Load stored benchmarks from localStorage
  const getStoredBenchmarks = (): StoredBenchmark[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const [storedBenchmarks, setStoredBenchmarks] = useState<StoredBenchmark[]>(
    getStoredBenchmarks()
  );

  // Save benchmarks to localStorage
  const saveToStorage = (benchmarks: StoredBenchmark[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(benchmarks));
      setStoredBenchmarks(benchmarks);
    } catch {
      setError("Failed to save to storage. Storage might be full.");
    }
  };

  // Handle rename
  const handleStartRename = (benchmark: StoredBenchmark, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(benchmark.id);
    setEditingName(benchmark.name);
  };


  const handleSaveRename = () => {
  if (!editingId || !editingName.trim()) return;
  
  const updated = storedBenchmarks.map(b => 
    b.id === editingId ? { ...b, name: editingName.trim() } : b
  );
  saveToStorage(updated);
  setEditingId(null);
  setEditingName("");
  
  // Notify parent if this was the selected benchmark
  if (editingId === selectedId && onNameChange) {
    onNameChange();
  }
};

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  // Validate benchmark data structure
  const validateBenchmarkData = (data: unknown): data is BenchmarkResult => {
    const result = data as BenchmarkResult;
    return (
      result &&
      typeof result === "object" &&
      result.metadata &&
      result.endpoints &&
      Array.isArray(result.endpoints) &&
      result.endpoints.length === 2 &&
      result.slots &&
      Array.isArray(result.slots)
    );
  };

  // Process uploaded file
  const processFile = useCallback(
    (file: File) => {
      setError(null);

      if (!file.name.endsWith(".json")) {
        setError("Please upload a JSON file");
        return;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          if (!validateBenchmarkData(data)) {
            setError("Invalid benchmark data format");
            return;
          }

          // Create stored benchmark entry
          const id = Date.now().toString();
          const name = file.name.replace(".json", "") || "Unnamed Benchmark";
          const newBenchmark: StoredBenchmark = {
            id,
            name,
            timestamp: Date.now(),
            data,
          };

          // Add to storage
          const updated = [...storedBenchmarks, newBenchmark];
          saveToStorage(updated);

          // Set as current data - the ID is now selected
          setSelectedId(id);
          onDataChange(data, id);
        } catch {
          setError("Failed to parse JSON file");
        }
      };

      reader.onerror = () => {
        setError("Failed to read file");
      };

      reader.readAsText(file);
    },
    [storedBenchmarks, onDataChange]
  );

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Handle benchmark selection
  const handleSelectBenchmark = (id: string) => {
    const benchmark = storedBenchmarks.find((b) => b.id === id);
    if (benchmark) {
      setSelectedId(id);
      onDataChange(benchmark.data, id);
    }
  };

  // Handle delete
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selection when deleting
    const updated = storedBenchmarks.filter((b) => b.id !== id);
    saveToStorage(updated);

    // If deleting current benchmark, clear selection
    if (selectedId === id) {
      setSelectedId(null);
      onDataChange(null);
    }
  };

  // Clear all data
  const handleClearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStoredBenchmarks([]);
    setSelectedId(null);
    onDataChange(null);
    setShowClearAllDialog(false);
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  // Get endpoint shortname
  const getEndpointShortName = (endpoint: string) => {
    return parseEndpointName(endpoint);
    };

  const hasData = currentData !== null || storedBenchmarks.length > 0;

  return (
    <div className={cn(
      "transition-all duration-300",
      !inSheet && !inModal && (hasData ? "max-w-md" : "max-w-2xl mx-auto")
    )}>
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#DA05E2]/10 to-[#2C0FDF]/10 p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Database className="h-5 w-5" />
                Benchmark Data
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {storedBenchmarks.length === 0 
                  ? "Upload your benchmark results" 
                  : `${storedBenchmarks.length} benchmark${storedBenchmarks.length > 1 ? 's' : ''} stored`}
              </p>
            </div>
            {storedBenchmarks.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearAllDialog(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* File Upload Area */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg transition-all duration-200",
              isDragging 
                ? "border-primary bg-primary/5 scale-[1.02]" 
                : "border-border hover:border-primary/50",
              "cursor-pointer group"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className={cn(
              "p-8 text-center transition-opacity",
              hasData ? "py-6" : "py-12"
            )}>
              <div className={cn(
                "mx-auto mb-4 transition-transform group-hover:scale-110",
                isDragging && "animate-pulse"
              )}>
                <div className="relative">
                  <Upload className={cn(
                    "h-12 w-12 mx-auto",
                    isDragging ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
                  )} />
                  {isDragging && (
                    <div className="absolute inset-0 animate-ping">
                      <Upload className="h-12 w-12 mx-auto text-primary opacity-75" />
                    </div>
                  )}
                </div>
              </div>

              <p className="text-sm font-medium mb-1">
                {isDragging ? "Drop your file here" : "Drop benchmark JSON or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground">
                Supports .json files from grpc-bench tool
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Stored Benchmarks List */}
          {storedBenchmarks.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Recent Benchmarks
              </p>

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {storedBenchmarks
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((benchmark) => {
                    const isSelected = selectedId === benchmark.id;
                    const isHovered = isHoveredBenchmark === benchmark.id;
                    const isEditing = editingId === benchmark.id;
                    
                    return (
                      <div
                        key={benchmark.id}
                        onClick={() => !isEditing && handleSelectBenchmark(benchmark.id)}
                        onMouseEnter={() => setIsHoveredBenchmark(benchmark.id)}
                        onMouseLeave={() => setIsHoveredBenchmark(null)}
                        className={cn(
                          "group relative p-4 rounded-lg border transition-all",
                          isSelected 
                            ? "border-primary bg-primary/5 shadow-sm" 
                            : "border-border hover:border-primary/50 hover:bg-accent/50",
                          !isEditing && "cursor-pointer hover:shadow-md"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <FileJson className={cn(
                              "h-5 w-5 mt-0.5 flex-shrink-0 transition-colors",
                              isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                            )} />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <Input
                                      value={editingName}
                                      onChange={(e) => setEditingName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveRename();
                                        } else if (e.key === 'Escape') {
                                          handleCancelRename();
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-7 text-sm"
                                      autoFocus
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSaveRename();
                                      }}
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelRename();
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <p className={cn(
                                      "font-medium truncate",
                                      isSelected && "text-primary"
                                    )}>
                                      {benchmark.name}
                                    </p>
                                    {isSelected && (
                                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                        Active
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                              
                              {!isEditing && (
                                <>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatRelativeTime(benchmark.timestamp)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Activity className="h-3 w-3" />
                                      {benchmark.data.metadata.compared_slots} slots
                                    </span>
                                  </div>
                                  
                                  <div className="mt-2 text-xs">
                                    <span className="text-muted-foreground">
                                      {getEndpointShortName(benchmark.data.endpoints[0].endpoint)} vs {getEndpointShortName(benchmark.data.endpoints[1].endpoint)}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {!isEditing && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!isSelected && (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={(e) => handleStartRename(benchmark, e)}
                                title="Rename"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={(e) => handleDelete(benchmark.id, e)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Hover preview */}
                        {isHovered && !isSelected && !inModal && (
                          <div className="absolute left-full ml-2 top-0 z-50 w-64 p-3 bg-popover border rounded-lg shadow-lg">
                            <p className="text-xs font-medium mb-2">Quick Stats</p>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>Duration: {(benchmark.data.metadata.duration_ms / 1000).toFixed(1)}s</p>
                              <p>Total slots: {benchmark.data.metadata.total_slots_collected}</p>
                              <p>Compared: {benchmark.data.metadata.compared_slots}</p>
                              <p>Dropped: {benchmark.data.metadata.dropped_slots}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state helper */}
          {!currentData && storedBenchmarks.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium">How to get started:</p>
                <ol className="text-left max-w-sm mx-auto space-y-1">
                  <li>1. Run <code className="text-xs bg-muted px-1 py-0.5 rounded">grpc-bench</code> tool</li>
                  <li>2. Upload the generated JSON file here</li>
                  <li>3. Analyze endpoint performance visually</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Clear All Confirmation Dialog */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {storedBenchmarks.length} stored benchmark{storedBenchmarks.length > 1 ? 's' : ''}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}