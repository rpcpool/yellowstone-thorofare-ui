import { useState, useMemo } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface SlotSelectorProps {
  slots: number[]
  selectedSlots: number[]
  onSlotsSelect: (slots: number[]) => void
  placeholder?: string
  className?: string
  maxDisplay?: number
}

export function SlotSelector({
  slots,
  selectedSlots,
  onSlotsSelect,
  placeholder: _ = "Select slots...",
  className
}: SlotSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const filteredSlots = useMemo(() => {
    if (!searchValue) return slots
    return slots.filter(slot => 
      slot.toString().includes(searchValue.replace(/[^0-9]/g, ''))
    )
  }, [slots, searchValue])

  const handleSelect = (slotValue: string) => {
    if (slotValue === "all") {
      onSlotsSelect([])
    } else {
      const slot = parseInt(slotValue)
      if (selectedSlots.includes(slot)) {
        onSlotsSelect(selectedSlots.filter(s => s !== slot))
      } else {
        onSlotsSelect([...selectedSlots, slot])
      }
    }
  }
  
  const clearAll = () => {
    onSlotsSelect([])
    setOpen(false)
  }
  
  const getDisplayText = () => {
    if (selectedSlots.length === 0) {
      return "All Slots"
    }
    if (selectedSlots.length === 1) {
      return `Slot ${selectedSlots[0]}`
    }
    return `Selected ${selectedSlots.length} slots`
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {getDisplayText()}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search slot numbers..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No slot found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={clearAll}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedSlots.length === 0 ? "opacity-100" : "opacity-0"
                    )}
                  />
                  All Slots
                </CommandItem>
                {filteredSlots.slice(0, 100).map((slot) => (
                  <CommandItem
                    key={slot}
                    value={slot.toString()}
                    onSelect={() => handleSelect(slot.toString())}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedSlots.includes(slot) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    Slot {slot}
                  </CommandItem>
                ))}
                {selectedSlots.length > 0 && (
                  <CommandItem onSelect={clearAll} className="border-t">
                    <span className="text-xs text-muted-foreground">Clear all ({selectedSlots.length} selected)</span>
                  </CommandItem>
                )}
                {filteredSlots.length > 100 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Showing first 100 results. Refine your search for more specific results.
                  </div>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}