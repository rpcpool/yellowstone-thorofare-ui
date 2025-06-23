export const STAGE_COLORS = {
  download: "bg-blue-600",
  replay: "bg-green-600",
  confirmation: "bg-orange-600",
  finalization: "bg-purple-600",
  waiting: "bg-gray-500",
} as const;

export const STAGE_LABELS = {
  download: "Download",
  replay: "Replay",
  confirmation: "Confirm",
  finalization: "Finalize",
  first_shred_delay: "Delay",
} as const;

export const ENDPOINT_COLORS = {
  ep1: "text-[#DA05E2]",
  ep2: "text-[#2C0FDF]",
} as const;

export const PIXELS_PER_MS = 1; // Base scale for timeline
export const ROW_HEIGHT = 40; // Height of each slot row
export const COMPACT_ROW_HEIGHT = 8; // Height in compact view
export const STAGE_HEIGHT = 24; // Height of each stage block
export const STAGE_SPACING = 2; // Vertical spacing between parallel stages
