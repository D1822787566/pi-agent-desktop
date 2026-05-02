"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentMode } from "@/lib/approval-policy";

const MODES: { id: AgentMode; label: string; desc: string }[] = [
  { id: "plan", label: "Plan", desc: "只读分析，先给出计划" },
  { id: "ask", label: "Ask", desc: "命令与写入前需确认" },
  { id: "full", label: "Full", desc: "可直接执行，不逐项确认" },
];

interface Props {
  mode: AgentMode;
  disabled?: boolean;
  onChange: (mode: AgentMode) => void;
}

/** Displays the chosen permission mode while retaining helpful option details. */
export function AgentModeSelector({ mode, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODES.find((item) => item.id === mode) ?? MODES[1];

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((value) => !value)}
        disabled={disabled}
        title={`Agent mode: ${current.label}`}
        aria-label={`Change agent mode. Current mode: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-control-height items-center gap-1.5 whitespace-nowrap rounded-control border border-transparent px-2 text-[12px] transition-[background-color,border-color,color] duration-150 ${
          open ? "bg-bg-hover text-text" : "bg-transparent text-text-muted hover:bg-bg-hover hover:text-text"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span>{current.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="t-dropdown is-open material-popover absolute bottom-[calc(100%+6px)] right-0 z-[550] min-w-56 overflow-hidden rounded-panel border border-border py-1 shadow-popover"
          data-origin="bottom-right"
        >
          {MODES.map((item) => {
            const isActive = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) onChange(item.id);
                }}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                  isActive ? "bg-bg-selected text-text" : "bg-transparent text-text-muted hover:bg-bg-hover"
                }`}
              >
                <span className={`text-[12px] ${isActive ? "font-semibold" : "font-medium"}`}>{item.label}</span>
                <span className="text-[11px] text-text-dim">{item.desc}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
