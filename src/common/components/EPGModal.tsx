// src/components/EPGModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useEPGStore } from "../store/epgStore";
import { fetchEPG } from "../services/epgService";
import type { Channel } from "../interfaces/types";

const PIXELS_PER_MIN = 2;

function parseISOorCustom(s: any) {
    if (!s) return null;
    if (typeof s === "string" && /^\d{14}$/.test(s)) {
        const y = +s.slice(0, 4),
            mo = +s.slice(4, 6) - 1,
            d = +s.slice(6, 8),
            hh = +s.slice(8, 10),
            mm = +s.slice(10, 12),
            ss = +s.slice(12, 14);
        return new Date(y, mo, d, hh, mm, ss);
    }
    return new Date(s);
}

function getBounds(channels: Channel[]) {
    let min = Infinity,
        max = -Infinity;
    channels.forEach((ch) =>
        (ch.programs || []).forEach((p: any) => {
            const s = parseISOorCustom(p.start)?.getTime() ?? Infinity;
            const e = parseISOorCustom(p.end)?.getTime() ?? -Infinity;
            if (s < min) min = s;
            if (e > max) max = e;
        })
    );
    if (!isFinite(min) || !isFinite(max)) {
        const now = Date.now();
        min = now;
        max = now + 6 * 60 * 60 * 1000;
    }
    return { start: new Date(min), end: new Date(max) };
}

function fmtTime24(d?: Date | null) {
    if (!d) return "--:--";
    return d.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
    });
}
function fmtTime24Full(d?: Date | null) {
    if (!d) return "--:--:--";
    return d.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function fmtDuration(ms: number) {
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}min`;
}

export default function EPGModal() {
    const close = useEPGStore((s) => s.close);
    const channels = useEPGStore((s) => s.channels);
    const setChannels = useEPGStore((s) => s.setChannels);
    const setSelected = useEPGStore((s) => s.setSelected);
    const selected = useEPGStore((s) => s.selected) as any;
    const [loading, setLoading] = useState(false);

    const rowsScrollRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);

    // fetch + normalize programs (support programs || events)
    useEffect(() => {
        if (channels.length === 0) {
            setLoading(true);
            fetchEPG()
                .then((c) => {
                    const updatedChannels = c.map((ch: any) => {
                        const rawPrograms = ch.programs ?? ch.events ?? [];
                        const programs = rawPrograms.map((p: any) => ({
                            ...p,
                            // canonical fields used later
                            id: p.id ?? p.event_id ?? p.eventId ?? p.id,
                            start: p.start ?? p.date_begin,
                            end: p.end ?? p.date_end,
                            channelId: String(ch.id ?? ch.channel_id ?? ch.channelId ?? ""),
                            title: p.title ?? p.name,
                            description: p.description ?? p.synopsis,
                        }));
                        return { ...ch, programs };
                    });
                    setChannels(updatedChannels);
                })
                .finally(() => setLoading(false));
        }
    }, [channels.length, setChannels]);

    const bounds = useMemo(() => getBounds(channels), [channels]);

    const dateShift = useMemo(() => {
        if (!bounds.start) return 0;
        const oldMidnight = new Date(bounds.start.getTime());
        oldMidnight.setHours(0, 0, 0, 0);
        const currentMidnight = new Date();
        currentMidnight.setHours(0, 0, 0, 0);
        return currentMidnight.getTime() - oldMidnight.getTime();
    }, [bounds]);

    const normalizedBounds = useMemo(
        () => ({
            start: new Date(bounds.start.getTime() + dateShift),
            end: new Date(bounds.end.getTime() + dateShift),
        }),
        [bounds, dateShift]
    );

    // default selected = current program of first channel (store eventId + channelId)
    useEffect(() => {
        if (channels.length > 0 && !selected) {
            const firstChannel = channels[0];
            const now = Date.now();

            const currentProgram =
                (firstChannel.programs || []).find((p: any) => {
                    const s = parseISOorCustom(p.start)?.getTime() ?? 0;
                    const e = parseISOorCustom(p.end)?.getTime() ?? 0;
                    const normalizedS = s + dateShift;
                    const normalizedE = e + dateShift;
                    return normalizedS <= now && now < normalizedE;
                }) || firstChannel.programs?.[0];

            if (currentProgram) {
                const s = parseISOorCustom(currentProgram.start) ?? new Date();
                const e = parseISOorCustom(currentProgram.end) ?? new Date(s.getTime() + 3600 * 1000);
                const eventId = String(currentProgram.id ?? currentProgram.event_id ?? currentProgram.eventId ?? "");
                setSelected({
                    ...currentProgram,
                    // canonical identifiers used for strict matching
                    eventId,
                    channelId: String(firstChannel.id ?? firstChannel.channel_id ?? firstChannel.channelId ?? ""),
                    rawEvent: currentProgram,
                    start: new Date(s.getTime() + dateShift).toISOString(),
                    end: new Date(e.getTime() + dateShift).toISOString(),
                    title: currentProgram.title ?? currentProgram.name ?? "Sin título",
                    description: currentProgram.description ?? currentProgram.synopsis ?? "",
                } as any);
            }
        }
    }, [channels, selected, setSelected, dateShift]);

    const totalMinutes = Math.max(
        1,
        Math.round((normalizedBounds.end.getTime() - normalizedBounds.start.getTime()) / 60000)
    );
    const timelineWidth = totalMinutes * PIXELS_PER_MIN;

    useEffect(() => {
        const g = gridRef.current;
        const t = timelineRef.current;
        if (!g || !t) return;
        let raf = 0;
        let fromGrid = false;
        let fromTimeline = false;
        const onGrid = () => {
            if (fromTimeline) {
                fromTimeline = false;
                return;
            }
            fromGrid = true;
            raf = requestAnimationFrame(() => (t.scrollLeft = g.scrollLeft));
        };
        const onTimeline = () => {
            if (fromGrid) {
                fromGrid = false;
                return;
            }
            fromTimeline = true;
            raf = requestAnimationFrame(() => (g.scrollLeft = t.scrollLeft));
        };
        g.addEventListener("scroll", onGrid, { passive: true });
        t.addEventListener("scroll", onTimeline, { passive: true });
        return () => {
            cancelAnimationFrame(raf);
            g.removeEventListener("scroll", onGrid);
            t.removeEventListener("scroll", onTimeline);
        };
    }, []);

    const minuteOffset = (d: Date) => Math.round((d.getTime() - normalizedBounds.start.getTime()) / 60000);

    // select handler: set canonical eventId and channelId
    const createSelectHandler =
        (p: any, chId: string, sRaw: Date, eRaw: Date, canonicalEventId: string) =>
            () => {
                const s = new Date(sRaw.getTime() + dateShift);
                const e = new Date(eRaw.getTime() + dateShift);
                const ch = channels.find((c) => String(c.id ?? c.channel_id ?? c.channelId ?? "") === String(chId));
                setSelected({
                    ...p,
                    eventId: String(canonicalEventId),
                    channelId: String(chId),
                    channelLogo: ch?.logo,
                    channelName: ch?.name,
                    rawEvent: p,
                    start: s.toISOString(),
                    end: e.toISOString(),
                    title: p.title ?? p.name ?? "Sin título",
                    description: p.description ?? p.synopsis ?? "",
                } as any);
            };

    // header: prefer rawEvent fields if present
    const headerRaw = selected?.rawEvent ?? selected;
    let headerStart: Date | null = null;
    let headerEnd: Date | null = null;
    let headerDurationMs: number | null = null;
    if (headerRaw) {
        const db = headerRaw.start ?? selected?.start;
        const de = headerRaw.end ?? selected?.end;
        const dur = headerRaw.duration;
        const parsedStart = parseISOorCustom(db) ?? (selected?.start ? new Date(selected.start) : null);
        const parsedEnd = parseISOorCustom(de) ?? (selected?.end ? new Date(selected.end) : null);
        headerStart = parsedStart;
        headerEnd = parsedEnd;
        if (dur != null) {
            const n = Number(dur);
            headerDurationMs = Number.isFinite(n) ? n * 1000 : null;
        } else if (headerStart && headerEnd) {
            headerDurationMs = headerEnd.getTime() - headerStart.getTime();
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-start justify-center">
            <div className="relative w-[96vw] h-[88vh] bg-[#080808] text-white rounded shadow-xl overflow-hidden">
                {/* HEADER */}
                <div className="relative h-40 md:h-48 lg:h-56 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/75" />
                    <div className="absolute left-6 top-6 flex items-start gap-4">
                        <div className="flex items-center gap-4">
                            <img
                                src={selected?.channelLogo ?? channels.find((c) => String(c.id ?? c.channel_id ?? c.channelId ?? "") === String(selected?.channelId))?.logo ?? ""}
                                alt="logo"
                                className="size-28 object-contain rounded-sm bg-neutral-800/40"
                            />
                            <div className="text-left">
                                <div className="text-3xl md:text-4xl font-extrabold leading-tight">{selected?.title ?? "The Mentalist"}</div>
                                <div className="text-sm text-neutral-300 mt-1 max-w-[60vw]">{selected?.description ?? "Descripción..."}</div>
                                <div className="text-xs text-neutral-400 mt-2">
                                    {headerStart && headerEnd
                                        ? `${fmtTime24Full(headerStart)} - ${fmtTime24Full(headerEnd)} ${headerDurationMs ? fmtDuration(headerDurationMs) : ""}`
                                        : `${normalizedBounds.start.toLocaleString()} — ${normalizedBounds.end.toLocaleString()}`}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button aria-label="Cerrar" onClick={close} className="absolute right-4 top-4 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-2xl hover:bg-white/10">
                        ×
                    </button>
                </div>

                {/* TIMELINE */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="sticky top-0 left-0 z-20 bg-[#0b0b0b] border-b border-white/10" style={{ height: 44 }}>
                        <div ref={timelineRef} className="overflow-x-auto overflow-y-hidden">
                            <div style={{ width: timelineWidth }} className="relative h-12">
                                {Array.from({ length: Math.ceil(totalMinutes / 60) + 1 }).map((_, idx) => {
                                    const minute = idx * 60;
                                    const left = minute * PIXELS_PER_MIN;
                                    const dt = new Date(normalizedBounds.start.getTime() + minute * 60_000);
                                    return (
                                        <div key={idx} style={{ left }} className="absolute top-0 h-full">
                                            <div className="text-xs font-medium px-3 py-2 bg-transparent">{dt.getHours().toString().padStart(2, "0")}:00</div>
                                            <div className="w-px h-3 bg-neutral-700 mt-1" />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* BODY */}
                <div className="flex h-[calc(100%-160px-48px)]">
                    <div className="flex-1">
                        <div ref={rowsScrollRef} className="h-full overflow-y-auto">
                            <div className="flex">
                                <div className="w-44 bg-neutral-900 border-r border-neutral-800 ">
                                    <div className="p-2 h-10 sticky top-0 bg-neutral-900 z-10">
                                        <div className="inline-flex items-center gap-2 bg-red-600 text-xs px-2 py-1 rounded">HOY</div>
                                    </div>
                                    {channels.map((ch, i) => (
                                        <div key={ch.id ?? ch.channel_id ?? i} style={{ height: 76 }} className="flex items-center gap-3 p-3 border-b border-neutral-800">
                                            <div className="w-10 text-sm font-semibold text-left">{String(1262 + i)}</div>
                                            <div className="flex-1 text-sm truncate">{ch.name}</div>
                                            {ch.logo && <img src={ch.logo} alt="logo" className="size-28 object-contain ml-2" />}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex-1 overflow-x-auto" ref={gridRef}>
                                    <div style={{ width: timelineWidth }} className="relative">
                                        <div className="h-10" /> {/* offset */}
                                        {channels.map((ch) => {
                                            console.log({ ch })
                                            const channelId = String(ch.id ?? ch.channel_id ?? ch.channelId ?? "");
                                            return (
                                                <div key={channelId} style={{ height: 76 }} className="relative border-b border-neutral-800">
                                                    {(ch.programs || []).map((p: any, idx: number) => {
                                                        const sRaw = parseISOorCustom(p.start) ?? new Date();
                                                        const eRaw = parseISOorCustom(p.end) ?? new Date(sRaw.getTime() + 30 * 60_000);
                                                        const s = new Date(sRaw.getTime() + dateShift);
                                                        const e = new Date(eRaw.getTime() + dateShift);
                                                        const left = minuteOffset(s) * PIXELS_PER_MIN;
                                                        const width = Math.max(8, Math.round((e.getTime() - s.getTime()) / 60000) * PIXELS_PER_MIN);

                                                        const channelId = String(ch.id ?? ch.channel_id ?? ch.channelId ?? "");
                                                        // ids del programa (prefer meta.id si existe)
                                                        const programMetaId = p?.meta?.id ? String(p.meta.id) : null;
                                                        const programMetaChannel = p?.meta?.channel_id ? String(p.meta.channel_id) : null;
                                                        const programIdFallback = p?.id ? String(p.id) : p?.event_id ? String(p.event_id) : null;
                                                        const programEventId = programMetaId ?? programIdFallback ?? "";

                                                        // ids seleccionados (canonical)
                                                        const selEventId = selected?.eventId ? String(selected.eventId) : selected?.id ? String(selected.id) : "";
                                                        const selMetaId = selected?.meta?.id ? String(selected.meta.id) : "";
                                                        const selChannelId = selected?.channelId ? String(selected.channelId) : selected?.channel_id ? String(selected.channel_id) : "";
                                                        const selMetaChannel = selected?.meta?.channel_id ? String(selected.meta.channel_id) : "";

                                                        // match estricto:
                                                        // - si both meta exist -> require program.meta.id === selected.meta.id AND selected.channelId === channelId AND selected.meta.channel_id === channelId
                                                        // - else fallback: require program.id === selected.eventId (or selected.id) AND selected.channelId === channelId
                                                        const usingMeta = !!(programMetaId && selMetaId && programMetaChannel);
                                                        let selectedMatch = false;

                                                        if (usingMeta) {
                                                            selectedMatch =
                                                                selMetaId !== "" &&
                                                                programMetaId === selMetaId &&
                                                                selChannelId === channelId &&
                                                                selMetaChannel === channelId;
                                                        } else {
                                                            // fallback strict check (only if selEventId and programIdFallback exist)
                                                            selectedMatch = !!(selEventId && programIdFallback && selEventId === programIdFallback && selChannelId === channelId);
                                                        }

                                                        const key = programEventId || `${channelId}-${idx}-${Math.round(left)}`;

                                                        return (
                                                            <div
                                                                key={key}
                                                                onClick={createSelectHandler(p, channelId, sRaw, eRaw, programEventId || key)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") createSelectHandler(p, channelId, sRaw, eRaw, programEventId || key)();
                                                                }}
                                                                role="button"
                                                                tabIndex={0}
                                                                className={`absolute top-3 bottom-3 rounded-md ${selectedMatch ? "bg-neutral-700/80 ring-2 ring-red-500" : "bg-neutral-800/60"} cursor-pointer p-2 shadow-sm overflow-hidden`}
                                                                style={{ left, width }}
                                                                title={`${p.title ?? p.name ?? "Sin título"} — ${fmtTime24(s)} - ${fmtTime24(e)}`}
                                                            >
                                                                <div className="text-xs font-semibold leading-tight truncate">{p.title ?? p.name ?? "Sin título"}</div>
                                                                <div className="text-[11px] text-neutral-300 truncate mt-1">
                                                                    {fmtTime24(s)} - {fmtTime24(e)}
                                                                </div>
                                                                <div className="absolute right-2 bottom-2 text-[10px] text-neutral-400">...</div>
                                                            </div>
                                                        );
                                                    })}

                                                </div>
                                            );
                                        })}
                                        {/* current-time marker */}
                                        <div style={{ position: "absolute", left: `${minuteOffset(normalizedBounds.start) * PIXELS_PER_MIN}px`, top: 0 }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {loading && <div className="absolute inset-0 grid place-items-center bg-black/40">Cargando...</div>}
            </div>
        </div>
    );
}
