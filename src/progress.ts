import type { FFMPEGProgress } from "./types/index.js";

// Anchored so that metadata printed in the input dump cannot match
const DURATION_LINE = /^\s*Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/;

// The value cannot contain spaces, which rules out the "frame=  75 fps=0.0 ..." summary line
const PROGRESS_LINE = /^(frame|fps|stream_\d+_\d+_q|bitrate|total_size|out_time_us|out_time_ms|out_time|dup_frames|drop_frames|speed|progress)=\s*(\S*)$/;

function toNumber(value: string | undefined): number | null {
    const number = parseFloat(value ?? "");
    return isNaN(number) ? null : number;
}

export function parseDuration(line: string): number | null {
    const match = line.match(DURATION_LINE);
    if (match === null) {
        return null;
    }
    return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3]);
}

export function parseProgressLine(line: string): [key: string, value: string] | null {
    const match = line.match(PROGRESS_LINE);
    return match && [match[1], match[2]];
}

export function applyProgressBlock(progress: FFMPEGProgress, block: ReadonlyMap<string, string>): void {
    const totalSize = toNumber(block.get("total_size"));
    const outTimeUs = toNumber(block.get("out_time_us"));
    const quality = [...block].find(([key]) => key.startsWith("stream_"));

    progress.frame = toNumber(block.get("frame"));
    progress.fps = toNumber(block.get("fps"));
    progress.quality = toNumber(quality?.[1]);
    progress.sizeKB = totalSize === null ? null : totalSize / 1024;
    progress.timeInSeconds = outTimeUs === null ? null : outTimeUs / 1_000_000;
    progress.bitrateKbps = toNumber(block.get("bitrate"));
    progress.speed = toNumber(block.get("speed"));

    if (progress.duration && progress.timeInSeconds !== null) {
        progress.percent = Math.min(Math.max((progress.timeInSeconds / progress.duration) * 100, 0), 100);
    } else {
        progress.percent = null;
    }
}
