import axios from "axios";
import type { Channel, Program } from "../interfaces/types";

const EPG_URL =
    "https://mfwkweb-api.clarovideo.net/services/epg/channel?device_id=web&device_category=web&device_model=web&device_type=web&device_so=Chrome&format=json&device_manufacturer=generic&authpn=webclient&authpt=tfg1h3j4k6fd7&api_version=v5.93&region=guatemala&HKS=web61144bb49d549&user_id=54343080&date_from=20210812200256&date_to=20210813200256&quantity=200";

// util pequeño para fechas
function parseTime(t: any): Date {
    if (!t) return new Date();
    if (typeof t === "number") return new Date(t * 1000);
    return new Date(t);
}

export async function fetchEPG(): Promise<Channel[]> {
    try {
        const res = await axios.get(EPG_URL);

        const payload = res.data?.response ?? res.data;
        const rawChannels: any[] = Array.isArray(payload?.channels) ? payload.channels : [];

        const parsed: Channel[] = (rawChannels || [])
            .map((c: any, i: number) => {
                const rawPrograms: any[] = Array.isArray(c.events)
                    ? c.events
                    : Array.isArray(c.programs)
                        ? c.programs
                        : [];

                const programs: Program[] = (rawPrograms || [])
                    .map((p: any, j: number) => {
                        const startRaw =
                            p.date_begin ??
                            p.unix_begin ??
                            p.start_time ??
                            p.start ??
                            null;

                        const endRaw =
                            p.date_end ??
                            p.unix_end ??
                            p.end_time ??
                            p.end ??
                            null;

                        return {
                            id: String(p.id ?? p.event_id ?? `${c.id ?? i}-${j}`),
                            title: p.name ?? p.title ?? `Programa ${j}`,
                            start: startRaw ?? new Date().toISOString(),
                            end: endRaw ?? new Date(Date.now() + 3600 * 1000).toISOString(),
                            meta: p,
                        };
                    })
                    .slice(0, 200);

                return {
                    id: String(c.id ?? c.channel_id ?? i),
                    name: c.name ?? c.group?.common?.title ?? c.number ?? `Canal ${i}`,
                    number: c.number ?? c.group?.common?.channel_number,
                    logo: c.image ?? c.logo ?? c.group?.common?.image_small,
                    group: c.group,
                    programs,
                };
            })
            .slice(0, 100);

        return parsed;
    } catch (err) {
        console.error("EPG fetch error:", err);
        return [];
    }
}
