export type FFMPEGProgress = {
    duration: number | null;
    percent: number | null;
    frame: number | null;
    fps: number | null;
    quality: number | null;
    sizeKB: number | null;
    timeInSeconds: number | null;
    bitrateKbps: number | null;
    speed: number | null;
};

export type FFMPEGSpawnErr = {
    code: number;
    message: string;
};
