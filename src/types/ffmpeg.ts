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

export type FFMPEGSpawnErrKind =
    | "already-started" // start() was called while a process is running
    | "spawn-failed" // the process could not be started
    | "output-exists" // the output exists and neither -y nor -n was set
    | "exited"; // the process exited with an error or was killed by a signal

export type FFMPEGSpawnErr = {
    kind: FFMPEGSpawnErrKind;
    code: number; // exit code, -1 if there is none
    signal: NodeJS.Signals | null; // signal that killed the process
    message: string;
};
