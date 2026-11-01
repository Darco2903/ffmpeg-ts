import type { FFMPEGProgress } from "./ffmpeg.js";

export type FFMPEGEvents = {
    stdout: [data: Buffer];
    stderr: [data: string];
    progress: [progress: FFMPEGProgress];
};
