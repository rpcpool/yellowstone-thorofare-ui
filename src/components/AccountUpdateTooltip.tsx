import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import type { AccountUpdateDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatSmartTime(ms: number): string {
  // Check if we have microsecond precision (decimal places)
  const hasMicroseconds = ms % 1 !== 0
  
  if (ms < 1000) {
    if (hasMicroseconds) {
      // Show microseconds for sub-millisecond precision
      const wholMs = Math.floor(ms)
      const microseconds = Math.round((ms - wholMs) * 1000)
      return wholMs > 0 ? `${wholMs}ms ${microseconds}μs` : `${microseconds}μs`
    }
    return `${ms}ms`
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000)
    const remainingMs = ms % 1000
    if (hasMicroseconds && remainingMs > 0) {
      const wholMs = Math.floor(remainingMs)
      const microseconds = Math.round((remainingMs - wholMs) * 1000)
      return `${seconds}s ${wholMs}ms ${microseconds}μs`
    }
    return remainingMs > 0 ? `${seconds}s ${Math.floor(remainingMs)}ms` : `${seconds}s`
  } else {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const remainingMs = ms % 1000
    let result = `${minutes}m`
    if (seconds > 0) result += ` ${seconds}s`
    if (remainingMs > 0) {
      if (hasMicroseconds) {
        const wholMs = Math.floor(remainingMs)
        const microseconds = Math.round((remainingMs - wholMs) * 1000)
        result += ` ${wholMs}ms ${microseconds}μs`
      } else {
        result += ` ${Math.floor(remainingMs)}ms`
      }
    }
    return result
  }
}

interface AccountUpdateTooltipProps {
  visible: boolean
  x: number
  y: number
  accounts: AccountUpdateDetail[]
  baseTime: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export function AccountUpdateTooltip({ 
  visible, 
  x, 
  y, 
  accounts,
  baseTime,
  onMouseEnter,
  onMouseLeave
}: AccountUpdateTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible && tooltipRef.current) {
      const tooltip = tooltipRef.current
      const rect = tooltip.getBoundingClientRect()
      
      // offset more from cursor to prevent interference
      let adjustedX = x + 15
      let adjustedY = y - rect.height / 2

      // keep within viewport
      if (adjustedX + rect.width > window.innerWidth - 10) {
        adjustedX = x - rect.width - 15
      }
      if (adjustedY < 10) {
        adjustedY = 10
      }
      if (adjustedY + rect.height > window.innerHeight - 10) {
        adjustedY = window.innerHeight - rect.height - 10
      }

      tooltip.style.left = `${adjustedX}px`
      tooltip.style.top = `${adjustedY}px`
    }
  }, [visible, x, y])

  if (!visible || !accounts.length) return null

  const isMultiple = accounts.length > 1

  return createPortal(
    <div
        ref={tooltipRef}
        className="fixed z-50 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[280px] max-w-[400px] flex flex-col"
        style={{ 
          left: x, 
          top: y,
          pointerEvents: 'auto',
          maxHeight: '400px'
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 12px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 6px;
            border: 1px solid rgba(0, 0, 0, 0.2);
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, #666, #444);
            border-radius: 6px;
            border: 1px solid #333;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, #777, #555);
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:active {
            background: linear-gradient(180deg, #555, #333);
          }
        `}</style>
        
        <div className="font-semibold text-sm text-foreground mb-2">
          {isMultiple ? `${accounts.length} Account Updates` : 'Account Update'}
        </div>
        
        <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
          {accounts.map((account, idx) => {
            const hasDelay = account.delay_ms != null && Number(account.delay_ms) > 0
            
            return (
              <div key={idx} className={cn("space-y-1 text-xs", idx > 0 && "pt-2 border-t border-border/50")}>
                <div className="flex items-center gap-2">
                  <div className="text-muted-foreground break-all flex-1">
                    <span className="font-mono text-[11px]">{account.pubkey}</span>
                  </div>
                  {!hasDelay && (
                    <div className="flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                      First
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="text-muted-foreground">Time from Start:</div>
                  <div className="font-mono text-[11px]">+{formatSmartTime(account.timestamp - baseTime)}</div>
                  
                  <div className="text-muted-foreground">Write Version:</div>
                  <div className="font-mono">{account.write_version}</div>
                  
                  {hasDelay && (
                    <>
                      <div className="text-red-500">Delay:</div>
                      <div className="font-semibold text-red-500">{account.delay_ms}ms</div>
                    </>
                  )}
                </div>
                
                <div className="pt-1">
                  <a 
                    href={`https://solscan.io/tx/${account.tx_signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-400 flex items-center gap-1 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`https://solscan.io/tx/${account.tx_signature}`, '_blank')
                    }}
                    style={{ pointerEvents: 'auto' }}
                  >
                    <span>View on Solscan</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            )
          })}
        </div>
    </div>,
    document.body
  )
}