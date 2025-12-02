// src/interfaces/types.ts
export type Program = {
    // canonical fields your UI expects
    id?: string;
    title?: string;
    start?: string; // ISO or yyyymmddhhmmss from API
    end?: string;
    description?: string;
    channelId?: string;

    // possible API variants (optional)
    event_id?: string | number;
    eventId?: string | number;
    date_begin?: string;
    date_end?: string;
    duration?: string | number; // seconds or "hh:mm:ss"
    name?: string;
    synopsis?: string;

    // fallback for any other unknown props
    [k: string]: any;
};

export type Channel = {
    // canonical
    id?: string;
    name?: string;
    logo?: string;
    programs?: Program[];

    // possible API variant
    channel_id?: string;

    [k: string]: any;
};

export type State = {
    modalOpen: boolean;
    selected: Program | null;
    open: () => void;
    close: () => void;
    setSelected: (p: Program | null) => void;
    channels: Channel[];
    setChannels: (c: Channel[]) => void;
};
