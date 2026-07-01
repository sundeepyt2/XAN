"use client";

// components/watch/VideoEnhancerPanel.tsx
// ✅ The "Video Enhancer" sub-panel — standalone popover for both video + iframe branches.
// ✅ Master on/off toggle, preset dropdown (20 built-in + up to 10 custom),
//    collapsible Manual Controls (9 sliders), "Hold to compare" peek button,
//    and a reset-all button.
// ✅ Sliders match the existing XAN player slider style: visible track + crimson
//    fill + white thumb, with hidden native <input type=range> on top for touch.
// ✅ Double-click a slider's row to reset that single control to its default.
// ✅ Visual hint when enhancer is on (active preset highlighted in dropdown).

import { memo, useState, useRef, useEffect } from "react";
import {
  Sun,
  Contrast,
  Palette,
  Rainbow,
  CircleDashed,
  Droplet,
  Ghost,
  TrendingUp,
  Sparkles,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronDown,
  Check,
  Wand2,
  Power,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Pencil,
  Bookmark,
  FolderOpen,
} from "lucide-react";
import type { EnhancerState, CustomPreset } from "@/hooks/useVideoEnhancer";
import { ENHANCER_PRESETS, DEFAULT_ENHANCER, MAX_CUSTOM_PRESETS } from "@/hooks/useVideoEnhancer";

interface VideoEnhancerPanelProps {
  state: EnhancerState;
  active: boolean;
  /** True while the user is holding the "peek" button (bypass is active). */
  peeking?: boolean;
  /**
   * When true, the panel is rendered as a standalone popover (not inside the
   * gear's settings menu). Hides the "Back" chevron and shows a close (X)
   * button on all screen sizes. Both the video branch and iframe branch now
   * use standalone mode — the enhancer is never nested in the gear menu.
   */
  standalone?: boolean;
  onBack: () => void;
  onClose: () => void;
  onUpdate: <K extends keyof EnhancerState>(key: K, value: EnhancerState[K]) => void;
  onApplyPreset: (presetId: keyof typeof ENHANCER_PRESETS) => void;
  onReset: () => void;
  onToggleEnabled: () => void;
  /** Called when the user starts holding the peek button (pointer down). */
  onPeekStart?: () => void;
  /** Called when the user releases the peek button (pointer up / leave / cancel). */
  onPeekEnd?: () => void;
  // ✅ Custom preset CRUD (user-saved presets)
  customPresets: CustomPreset[];
  canSaveMoreCustom: boolean;
  onSaveCustomPreset: (name: string) => string | null;
  onApplyCustomPreset: (id: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onRenameCustomPreset: (id: string, newName: string) => void;
}

interface SliderRowProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  displayValue: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
}

function SliderRow({
  icon,
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  displayValue,
  disabled,
  onChange,
  onReset,
}: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const isDefault = Math.abs(value - defaultValue) < 0.001;

  return (
    <div
      className={`px-3 sm:px-4 py-1.5 sm:py-2.5 border-b border-white/5 transition-opacity ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      onDoubleClick={onReset}
      title="Double-click to reset"
    >
      <div className="flex items-center justify-between mb-1 sm:mb-2 gap-2">
        <span className="flex items-center gap-1.5 text-xs text-white/80 min-w-0">
          <span className="text-white/60 flex-shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        <span
          className={`text-xs font-mono font-bold flex-shrink-0 ${isDefault ? "text-white/40" : "text-xan-crimson"}`}
        >
          {displayValue}
        </span>
      </div>
      {/* Custom slider track — mirrors the existing XAN speed slider style */}
      <div className="relative h-4 flex items-center">
        {/* Track background */}
        <div className="absolute left-0 right-0 h-0.5 sm:h-1 rounded-full bg-white/25" />
        {/* Fill */}
        <div
          className="absolute left-0 h-0.5 sm:h-1 rounded-full bg-xan-crimson transition-all"
          style={{ width: `${pct}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-white shadow-sm pointer-events-none transition-transform"
          style={{ left: `calc(${pct}% - 4px)` }}
        />
        {/* Hidden native input on top — provides the actual touch/drag surface */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label={label}
          style={{ WebkitAppearance: "none", appearance: "none", background: "transparent" }}
        />
      </div>
      {/* Min/max labels */}
      <div className="flex justify-between text-[9px] text-white/30 mt-0.5 px-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function VideoEnhancerPanelInner({
  state,
  active,
  peeking = false,
  standalone = false,
  onBack,
  onClose,
  onUpdate,
  onApplyPreset,
  onReset,
  onToggleEnabled,
  onPeekStart,
  onPeekEnd,
  customPresets,
  canSaveMoreCustom,
  onSaveCustomPreset,
  onApplyCustomPreset,
  onDeleteCustomPreset,
  onRenameCustomPreset,
}: VideoEnhancerPanelProps) {
  // ✅ Preset dropdown open state — collapsed by default.
  const [presetsOpen, setPresetsOpen] = useState(false);
  // ✅ Manual controls dropdown open state — collapsed by default.
  // The 9 sliders take a lot of vertical space, so collapsing them by default
  // keeps the panel compact. Users tap to expand when they want to fine-tune.
  const [manualOpen, setManualOpen] = useState(false);
  // ✅ "Save as preset" inline form state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-focus the save input when the form opens
  useEffect(() => {
    if (showSaveForm && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [showSaveForm]);

  // Auto-focus the rename input when rename mode starts
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // ✅ Detect which preset (if any) is currently active so we can highlight it.
  const activePresetId = (() => {
    for (const [id, preset] of Object.entries(ENHANCER_PRESETS)) {
      const v = preset.values;
      const matches =
        state.brightness === v.brightness &&
        state.contrast === v.contrast &&
        state.saturation === v.saturation &&
        state.hue === v.hue &&
        state.blur === v.blur &&
        state.sepia === v.sepia &&
        state.grayscale === v.grayscale &&
        Math.abs(state.gamma - v.gamma) < 0.001 &&
        state.sharpen === v.sharpen;
      if (matches) return { kind: "builtin" as const, id };
    }
    // Check custom presets
    for (const cp of customPresets) {
      const v = cp.values;
      const matches =
        state.brightness === v.brightness &&
        state.contrast === v.contrast &&
        state.saturation === v.saturation &&
        state.hue === v.hue &&
        state.blur === v.blur &&
        state.sepia === v.sepia &&
        state.grayscale === v.grayscale &&
        Math.abs(state.gamma - v.gamma) < 0.001 &&
        state.sharpen === v.sharpen;
      if (matches) return { kind: "custom" as const, id: cp.id };
    }
    return null;
  })();

  // ✅ Compute the display label for the currently active preset
  const activePresetLabel = (() => {
    if (!activePresetId) return "Custom";
    if (activePresetId.kind === "builtin") {
      return ENHANCER_PRESETS[activePresetId.id]?.label ?? "Custom";
    }
    const cp = customPresets.find((p) => p.id === activePresetId.id);
    return cp?.name ?? "Custom";
  })();

  // ✅ Save the current settings as a new custom preset
  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const id = onSaveCustomPreset(presetName);
    if (id) {
      setPresetName("");
      setShowSaveForm(false);
    }
  };

  // ✅ Commit a rename operation
  const handleCommitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameCustomPreset(renamingId, renameValue);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div>
      {/* ── Header (back + title + close) ──
          ✅ In standalone mode (both branches now use this), there's no "back"
          destination — show a close (X) button on ALL screen sizes instead of
          the mobile-only close. The back chevron is hidden in standalone mode. */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2.5 border-b border-white/5">
        {!standalone && (
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded hover:bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        )}
        <span className="font-medium flex-1 flex items-center gap-1.5">
          <Wand2 className="h-3.5 w-3.5 text-xan-crimson" />
          Video Enhancer
        </span>
        {/* Close button — always visible in standalone mode; mobile-only otherwise */}
        <button
          onClick={onClose}
          className={`p-1 -mr-1 rounded hover:bg-white/10 active:bg-white/20 transition-colors ${standalone ? "" : "sm:hidden"}`}
          aria-label="Close settings"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Master enable toggle ── */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Power className={`h-3.5 w-3.5 ${active ? "text-emerald-400" : "text-white/40"}`} />
            <span>Enhancer {state.enabled ? "On" : "Off"}</span>
            {peeking && (
              <span className="ml-1 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-400/30 animate-pulse">
                PEEKING
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/40 mt-0.5 leading-snug">
            {peeking
              ? "Showing original — release to compare."
              : active
                ? "Color grading is live."
                : "Toggle on to apply color grading."}
          </p>
        </div>
        {/* Custom toggle switch — matches XAN's crimson accent */}
        <button
          role="switch"
          aria-checked={state.enabled}
          onClick={onToggleEnabled}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
            state.enabled ? "bg-xan-crimson" : "bg-white/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              state.enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* ── "Hold to compare" (peek) button ──
          While pressed, the filter is temporarily bypassed so the user can see
          the original un-enhanced picture. Release to restore. Disabled when
          enhancer is off (nothing to compare). */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/5">
        <button
          // ✅ Use pointer events (covers mouse + touch + pen). On pointerdown,
          // start peeking. On pointerup/pointerleave/pointercancel, stop.
          onPointerDown={(e) => {
            e.preventDefault();
            // ✅ Capture pointer so we get the pointerup event even if the
            // cursor leaves the button while held (e.g. user drags off).
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
            onPeekStart?.();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try {
              (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
            } catch {}
            onPeekEnd?.();
          }}
          onPointerCancel={() => onPeekEnd?.()}
          onPointerLeave={() => {
            // ✅ Safety: if pointer capture failed (older browsers), still end
            // on leave. With capture, pointerleave won't fire until release.
            if (!peeking) return;
            onPeekEnd?.();
          }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!active}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-all select-none touch-none border ${
            peeking
              ? "bg-amber-500/25 border-amber-400/40 text-amber-300"
              : active
                ? "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/20"
                : "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
          }`}
          aria-label="Hold to compare with original"
          title={active ? "Hold to compare with original (press E to toggle enhancer)" : "Enable enhancer first"}
        >
          {peeking ? (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Showing original…
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              Hold to compare
            </>
          )}
        </button>
        <p className="text-[9px] text-white/30 mt-1 text-center leading-snug">
          Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/60 font-mono text-[8px]">E</kbd> to toggle enhancer
        </p>
      </div>

      {/* ── Preset dropdown (single collapsible box) ──
          Contains ALL presets: 20 built-in + up to 10 user-saved custom.
          Click the header to expand/collapse. Shows the currently active
          preset's name on the header row. */}
      <div ref={presetDropdownRef} className="border-b border-white/5">
        {/* Header — click to toggle */}
        <button
          onClick={() => setPresetsOpen((v) => !v)}
          className="flex items-center justify-between w-full px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-white/5 transition-colors"
          aria-expanded={presetsOpen}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-xan-crimson" />
            <span className="text-xs font-medium">Presets</span>
            {/* Active-preset badge on the header */}
            {active && activePresetId && (
              <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-xan-crimson/25 text-xan-crimson border border-xan-crimson/30 max-w-[100px] truncate">
                {activePresetLabel}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 text-white/50">
            <span className="text-[10px] text-white/40">
              {Object.keys(ENHANCER_PRESETS).length + customPresets.length} total
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${presetsOpen ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {/* Dropdown body — built-ins + custom + save form */}
        {presetsOpen && (
          <div className="px-2 sm:px-3 pb-2 pt-1 space-y-2">
            {/* ── Built-in presets ── */}
            <div>
              <div className="flex items-center gap-1 mb-1 px-1">
                <FolderOpen className="h-3 w-3 text-white/40" />
                <span className="text-[9px] uppercase tracking-wider text-white/40">Built-in</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(ENHANCER_PRESETS).map(([id, preset]) => {
                  const isActive =
                    activePresetId?.kind === "builtin" && activePresetId.id === id && state.enabled;
                  return (
                    <button
                      key={id}
                      onClick={() => onApplyPreset(id as keyof typeof ENHANCER_PRESETS)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] transition-all border ${
                        isActive
                          ? "bg-xan-crimson/20 border-xan-crimson text-white"
                          : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:border-white/10"
                      }`}
                    >
                      <span className="text-xs leading-none">{preset.emoji}</span>
                      <span className="truncate font-medium">{preset.label}</span>
                      {isActive && <Check className="h-3 w-3 ml-auto text-xan-crimson flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Custom presets (user-saved) ── */}
            <div>
              <div className="flex items-center justify-between mb-1 px-1">
                <div className="flex items-center gap-1">
                  <Bookmark className="h-3 w-3 text-white/40" />
                  <span className="text-[9px] uppercase tracking-wider text-white/40">
                    My Presets
                  </span>
                </div>
                <span className="text-[9px] text-white/30 font-mono">
                  {customPresets.length}/{MAX_CUSTOM_PRESETS}
                </span>
              </div>

              {customPresets.length === 0 ? (
                <p className="text-[10px] text-white/30 italic px-2 py-1.5">
                  No saved presets yet. Adjust sliders, then tap "Save current".
                </p>
              ) : (
                <div className="space-y-1">
                  {customPresets.map((cp) => {
                    const isActive =
                      activePresetId?.kind === "custom" && activePresetId.id === cp.id && state.enabled;
                    const isRenaming = renamingId === cp.id;
                    return (
                      <div
                        key={cp.id}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] border transition-all ${
                          isActive
                            ? "bg-xan-crimson/20 border-xan-crimson text-white"
                            : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10"
                        }`}
                      >
                        {isRenaming ? (
                          // ✅ Inline rename input
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleCommitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCommitRename();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setRenamingId(null);
                                setRenameValue("");
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            maxLength={24}
                            className="flex-1 min-w-0 bg-white/10 border border-xan-crimson/40 rounded px-1.5 py-0.5 text-white text-[11px] outline-none focus:bg-white/15"
                            placeholder="Preset name"
                          />
                        ) : (
                          // ✅ Apply-on-click row
                          <button
                            onClick={() => onApplyCustomPreset(cp.id)}
                            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                            title={`Apply "${cp.name}"`}
                          >
                            <Bookmark className="h-3 w-3 flex-shrink-0 text-white/50" />
                            <span className="truncate font-medium">{cp.name}</span>
                            {isActive && <Check className="h-3 w-3 ml-auto text-xan-crimson flex-shrink-0" />}
                          </button>
                        )}

                        {/* Action buttons (not shown while renaming) */}
                        {!isRenaming && (
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(cp.id);
                                setRenameValue(cp.name);
                              }}
                              className="p-1 rounded hover:bg-white/15 text-white/50 hover:text-white/80 transition-colors"
                              aria-label={`Rename ${cp.name}`}
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCustomPreset(cp.id);
                              }}
                              className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-300 transition-colors"
                              aria-label={`Delete ${cp.name}`}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Save current as preset ── */}
            {canSaveMoreCustom ? (
              showSaveForm ? (
                // Inline save form
                <div className="pt-1">
                  <div className="flex items-center gap-1">
                    <input
                      ref={saveInputRef}
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSavePreset();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setShowSaveForm(false);
                          setPresetName("");
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      maxLength={24}
                      placeholder="Preset name…"
                      className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded px-2 py-1.5 text-white text-[11px] outline-none focus:border-xan-crimson/60 focus:bg-white/15"
                    />
                    <button
                      onClick={handleSavePreset}
                      disabled={!presetName.trim()}
                      className="px-2 py-1.5 rounded bg-xan-crimson/25 border border-xan-crimson/40 text-xan-crimson text-[11px] font-medium hover:bg-xan-crimson/35 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 flex-shrink-0"
                      title="Save"
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveForm(false);
                        setPresetName("");
                      }}
                      className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors flex-shrink-0"
                      title="Cancel"
                      aria-label="Cancel save"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[9px] text-white/30 mt-1 px-1">
                    Enter to save · Esc to cancel · {customPresets.length}/{MAX_CUSTOM_PRESETS} used
                  </p>
                </div>
              ) : (
                // "Save current" trigger button
                <button
                  onClick={() => setShowSaveForm(true)}
                  disabled={!active}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium transition-all border bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none"
                  title={active ? "Save current settings as a preset" : "Adjust settings first to save a preset"}
                >
                  <Save className="h-3 w-3" />
                  Save current as preset
                </button>
              )
            ) : (
              <p className="text-[9px] text-amber-300/70 text-center py-1">
                Preset limit reached ({MAX_CUSTOM_PRESETS}/{MAX_CUSTOM_PRESETS}). Delete one to add more.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Manual Controls dropdown (collapsible) ──
          ✅ Collapsed by default to keep the panel compact. Click the header
          to expand/collapse the 9 sliders. Shows a small summary of how many
          controls are non-default on the header row. */}
      <div className="border-b border-white/5">
        {/* Header — click to toggle */}
        <button
          onClick={() => setManualOpen((v) => !v)}
          className={`flex items-center justify-between w-full px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-white/5 transition-colors ${
            !state.enabled ? "opacity-50 pointer-events-none" : ""
          }`}
          aria-expanded={manualOpen}
          disabled={!state.enabled}
        >
          <span className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-xan-crimson" />
            <span className="text-xs font-medium">Manual Controls</span>
          </span>
          <span className="flex items-center gap-2 text-white/50">
            {/* ✅ Show count of non-default controls */}
            {(() => {
              const nonDefault = [
                state.brightness !== 100,
                state.contrast !== 100,
                state.saturation !== 100,
                state.hue !== 0,
                state.blur !== 0,
                state.sepia !== 0,
                state.grayscale !== 0,
                Math.abs(state.gamma - 1.0) > 0.001,
                state.sharpen !== 0,
              ].filter(Boolean).length;
              if (nonDefault === 0) return null;
              return (
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-xan-crimson/25 text-xan-crimson border border-xan-crimson/30">
                  {nonDefault} adjusted
                </span>
              );
            })()}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${manualOpen ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {/* Dropdown body — 9 sliders */}
        {manualOpen && (
          <div
            className={`transition-all ${!state.enabled ? "opacity-50 pointer-events-none" : ""}`}
          >
            <SliderRow
              icon={<Sun className="h-3 w-3" />}
              label="Brightness"
              value={state.brightness}
              min={0}
              max={200}
              step={1}
              defaultValue={DEFAULT_ENHANCER.brightness}
              displayValue={`${state.brightness}%`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("brightness", v)}
              onReset={() => onUpdate("brightness", DEFAULT_ENHANCER.brightness)}
            />

            <SliderRow
              icon={<Contrast className="h-3 w-3" />}
              label="Contrast"
              value={state.contrast}
              min={0}
              max={200}
              step={1}
              defaultValue={DEFAULT_ENHANCER.contrast}
              displayValue={`${state.contrast}%`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("contrast", v)}
              onReset={() => onUpdate("contrast", DEFAULT_ENHANCER.contrast)}
            />

            <SliderRow
              icon={<Palette className="h-3 w-3" />}
              label="Saturation"
              value={state.saturation}
              min={0}
              max={200}
              step={1}
              defaultValue={DEFAULT_ENHANCER.saturation}
              displayValue={`${state.saturation}%`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("saturation", v)}
              onReset={() => onUpdate("saturation", DEFAULT_ENHANCER.saturation)}
            />

            <SliderRow
              icon={<Rainbow className="h-3 w-3" />}
              label="Hue Rotate"
              value={state.hue}
              min={-180}
              max={180}
              step={1}
              defaultValue={DEFAULT_ENHANCER.hue}
              displayValue={`${state.hue > 0 ? "+" : ""}${state.hue}°`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("hue", v)}
              onReset={() => onUpdate("hue", DEFAULT_ENHANCER.hue)}
            />

            <SliderRow
              icon={<TrendingUp className="h-3 w-3" />}
              label="Gamma"
              value={state.gamma}
              min={0.2}
              max={3.0}
              step={0.01}
              defaultValue={DEFAULT_ENHANCER.gamma}
              displayValue={state.gamma.toFixed(2)}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("gamma", Math.round(v * 100) / 100)}
              onReset={() => onUpdate("gamma", DEFAULT_ENHANCER.gamma)}
            />

            <SliderRow
              icon={<Sparkles className="h-3 w-3" />}
              label="Sharpen"
              value={state.sharpen}
              min={0}
              max={100}
              step={1}
              defaultValue={DEFAULT_ENHANCER.sharpen}
              displayValue={`${state.sharpen}%`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("sharpen", v)}
              onReset={() => onUpdate("sharpen", DEFAULT_ENHANCER.sharpen)}
            />

            <SliderRow
              icon={<CircleDashed className="h-3 w-3" />}
              label="Blur"
              value={state.blur}
              min={0}
              max={10}
              step={0.1}
              defaultValue={DEFAULT_ENHANCER.blur}
              displayValue={`${state.blur.toFixed(1)}px`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("blur", Math.round(v * 10) / 10)}
              onReset={() => onUpdate("blur", DEFAULT_ENHANCER.blur)}
            />

            <SliderRow
              icon={<Droplet className="h-3 w-3" />}
              label="Sepia"
              value={state.sepia}
              min={0}
              max={100}
              step={1}
              defaultValue={DEFAULT_ENHANCER.sepia}
              displayValue={`${state.sepia}%`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("sepia", v)}
              onReset={() => onUpdate("sepia", DEFAULT_ENHANCER.sepia)}
            />

            <SliderRow
              icon={<Ghost className="h-3 w-3" />}
              label="Grayscale"
              value={state.grayscale}
              min={0}
              max={100}
              step={1}
              defaultValue={DEFAULT_ENHANCER.grayscale}
              displayValue={`${state.grayscale}%`}
              disabled={!state.enabled}
              onChange={(v) => onUpdate("grayscale", v)}
              onReset={() => onUpdate("grayscale", DEFAULT_ENHANCER.grayscale)}
            />
          </div>
        )}
      </div>

      {/* ── Footer: reset all ── */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-white/5">
        <button
          onClick={onReset}
          disabled={!state.enabled}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw className="h-3 w-3" />
          Reset all to defaults
        </button>
      </div>
    </div>
  );
}

export const VideoEnhancerPanel = memo(VideoEnhancerPanelInner);
