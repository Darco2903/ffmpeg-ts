import { type ChildProcessByStdio, spawn } from "child_process";
import type { Readable } from "stream";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { TypedEmitterProtected } from "@darco2903/typed-emitter";
import type { FFMPEGProgress, FFMPEGSpawnErr } from "./types/index.js";
import type { FFMPEGEvents } from "./types/events.js";

export class FFMPEG extends TypedEmitterProtected<FFMPEGEvents> {
    protected static readonly MAX_STDERR_LENGTH = 32_000;
    protected static readonly OVERWRITE_PROMPT = /^File '.+' already exists\. Overwrite\? \[y\/N\]/m;
    protected static EmptyProgress(): FFMPEGProgress {
        return {
            duration: null,
            percent: null,
            frame: null,
            fps: null,
            quality: null,
            sizeKB: null,
            timeInSeconds: null,
            bitrateKbps: null,
            speed: null,
        };
    }

    public readonly args: string[];
    protected child: ChildProcessByStdio<null, Readable, Readable> | null;
    protected lastStderr: string;
    protected _progress: FFMPEGProgress;
    protected _killed: boolean = false;
    public readonly execPath: string;

    public get processing(): boolean {
        return this.child !== null;
    }

    public get killed(): boolean {
        return this._killed;
    }

    public get progress(): Readonly<FFMPEGProgress> {
        return { ...this._progress };
    }

    constructor(args: string[], { execPath }: { execPath?: string } = {}) {
        super();
        this.args = args;
        this.child = null;
        this.lastStderr = "";
        this._progress = FFMPEG.EmptyProgress();
        this.execPath = execPath ?? "ffmpeg";
    }

    protected onStderrData(data: string): void {
        if (this._progress.duration === null) {
            // extract duration
            const durMatch = data.match(/Duration: (\d+):(\d+):(\d+(\.\d+)?)/);
            if (durMatch) {
                const hours = parseInt(durMatch[1], 10);
                const minutes = parseInt(durMatch[2], 10);
                const seconds = parseFloat(durMatch[3]);
                if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                    this._progress.duration = hours * 3600 + minutes * 60 + seconds;
                    // console.log(`Video duration: ${this.progress.duration} seconds`);
                }
            }
        }

        if (this._progress.duration !== null) {
            // track progress

            const frameMatch = data.match(/frame=\s*(\d+)\s*fps=/);
            if (frameMatch) {
                this._progress.frame = parseInt(frameMatch[1], 10);
                // console.log(`Processed frame: ${this.progress.frame}`);
            }

            const fpsMatch = data.match(/fps=\s*([\d\.]+)\s*q=/);
            if (fpsMatch) {
                this._progress.fps = parseFloat(fpsMatch[1]);
                // console.log(`Current FPS: ${this.progress.fps}`);
            }

            const qMatch = data.match(/q=\s*([\d\.]+)/);
            if (qMatch) {
                this._progress.quality = parseFloat(qMatch[1]);
                // console.log(`Current quality (q): ${this.progress.quality}`);
            }

            const sizeMatch = data.match(/size=\s*([\d.]+)kB/);
            if (sizeMatch) {
                this._progress.sizeKB = parseFloat(sizeMatch[1]);
                // console.log(`Output size: ${this.progress.sizeKB} kB`);
            }

            const timeMatch = data.match(/time=(\d+):(\d+):(\d+(\.\d+)?)/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const seconds = parseFloat(timeMatch[3]);
                if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                    this._progress.timeInSeconds = hours * 3600 + minutes * 60 + seconds;
                    if (this._progress.duration > 0) {
                        this._progress.percent = (this._progress.timeInSeconds / this._progress.duration) * 100;
                    }
                }
                // console.log(`Processed time: ${this.progress.timeInSeconds} seconds`);
            }

            const bitrateMatch = data.match(/bitrate=\s*([\d.]+)kbits?\/s/);
            if (bitrateMatch) {
                this._progress.bitrateKbps = parseFloat(bitrateMatch[1]);
                // console.log(`Current bitrate: ${this.progress.bitrateKbps} kbits/s`);
            }

            const speedMatch = data.match(/speed=\s*([\d\.]+)x/);
            if (speedMatch) {
                this._progress.speed = parseFloat(speedMatch[1]);
                // console.log(`Processing speed: ${this.progress.speed}x`);
            }

            this._emit("progress", this.progress);
        }
    }

    public start(): ResultAsync<void, FFMPEGSpawnErr> {
        if (this.processing) {
            return errAsync({ kind: "already-started", code: -1, signal: null, message: "FFMPEG process already started" });
        }

        let child: ChildProcessByStdio<null, Readable, Readable>;
        this.lastStderr = "";
        this._progress = FFMPEG.EmptyProgress();
        this._killed = false;

        try {
            // stdin is ignored: an open pipe nobody writes to makes ffmpeg wait forever on prompts and pipe:0
            child = spawn(this.execPath, this.args, { stdio: ["ignore", "pipe", "pipe"] });
            this.child = child;
        } catch (e) {
            return errAsync({ kind: "spawn-failed", code: -1, signal: null, message: String(e) });
        }

        // Listeners come first: a failed spawn has no streams and reports through "error"
        const result = new Promise<Result<void, FFMPEGSpawnErr>>((resolve) => {
            child.once("close", (code, signal) => {
                this.child = null;

                if (code !== 0) {
                    resolve(err({ kind: "exited", code: code ?? -1, signal, message: this.lastStderr }));
                } else if (FFMPEG.OVERWRITE_PROMPT.test(this.lastStderr)) {
                    // ffmpeg exits 0 after declining the overwrite prompt, but nothing was written
                    resolve(err({ kind: "output-exists", code: -1, signal: null, message: this.lastStderr }));
                } else {
                    resolve(ok());
                }
            });

            child.once("error", (e) => {
                this.child = null;
                resolve(err({ kind: "spawn-failed", code: -1, signal: null, message: e.message }));
            });
        });

        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (data) => {
            this._emit("stdout", data);
        });

        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (data) => {
            this._emit("stderr", data);

            this.lastStderr += data;

            if (this.lastStderr.length > FFMPEG.MAX_STDERR_LENGTH) {
                this.lastStderr = this.lastStderr.slice(-FFMPEG.MAX_STDERR_LENGTH);
            }

            this.onStderrData(data);
        });

        return new ResultAsync(result);
    }

    public stop(signal?: NodeJS.Signals): boolean {
        if (this.child?.kill(signal)) {
            this._killed = true;
            return true;
        }
        return false;
    }
}
