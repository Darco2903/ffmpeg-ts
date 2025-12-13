import type { FFMPEGProgress } from "./ffmpeg.js";

export type FFMPEGEvents = {
    stdout: [data: string];
    stderr: [data: string];
    progress: [progress: FFMPEGProgress];
};
