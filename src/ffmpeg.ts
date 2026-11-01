import { type ChildProcessByStdio, spawn } from "child_process";
import type { Readable } from "stream";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { TypedEmitterProtected } from "@darco2903/typed-emitter";
import type { FFMPEGProgress, FFMPEGSpawnErr } from "./types/index.js";
import type { FFMPEGEvents } from "./types/events.js";
import { applyProgressBlock, parseDuration, parseProgressLine } from "./progress.js";

export class FFMPEG extends TypedEmitterProtected<FFMPEGEvents> {
    protected static readonly MAX_STDERR_LENGTH = 32_000;
    protected static readonly OVERWRITE_PROMPT = /^File '.+' already exists\. Overwrite\? \[y\/N\]/m;
    protected static readonly PROGRESS_ARGS = ["-nostats", "-progress", "pipe:2"];
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
    protected stderrBuffer: string;
    protected progressBlock: Map<string, string>;
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
        this.stderrBuffer = "";
        this.progressBlock = new Map();
        this._progress = FFMPEG.EmptyProgress();
        this.execPath = execPath ?? "ffmpeg";
    }

    protected onStderrData(data: string): void {
        const lines = (this.stderrBuffer + data).split(/\r\n|\r|\n/);
        this.stderrBuffer = lines.pop() ?? "";

        for (const line of lines) {
            this.onStderrLine(line);
        }
    }

    protected onStderrLine(line: string): void {
        const entry = parseProgressLine(line);

        if (entry === null) {
            this._progress.duration ??= parseDuration(line);
            this._emit("stderr", `${line}\n`);

            this.lastStderr += `${line}\n`;

            if (this.lastStderr.length > FFMPEG.MAX_STDERR_LENGTH) {
                this.lastStderr = this.lastStderr.slice(-FFMPEG.MAX_STDERR_LENGTH);
            }
            return;
        }

        const [key, value] = entry;
        this.progressBlock.set(key, value);

        // "progress" is the last key of a block
        if (key === "progress") {
            applyProgressBlock(this._progress, this.progressBlock);
            this.progressBlock.clear();
            this._emit("progress", this.progress);
        }
    }

    public start(): ResultAsync<void, FFMPEGSpawnErr> {
        if (this.processing) {
            return errAsync({ kind: "already-started", code: -1, signal: null, message: "FFMPEG process already started" });
        }

        let child: ChildProcessByStdio<null, Readable, Readable>;
        this.lastStderr = "";
        this.stderrBuffer = "";
        this.progressBlock.clear();
        this._progress = FFMPEG.EmptyProgress();
        this._killed = false;
        // Added here rather than in the constructor so that this.args stays what the caller passed
        const args = this.args.includes("-progress") ? this.args : [...FFMPEG.PROGRESS_ARGS, ...this.args];

        try {
            // stdin is ignored: an open pipe nobody writes to makes ffmpeg wait forever on prompts and pipe:0
            child = spawn(this.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
            this.child = child;
        } catch (e) {
            return errAsync({ kind: "spawn-failed", code: -1, signal: null, message: String(e) });
        }

        // Listeners come first: a failed spawn has no streams and reports through "error"
        const result = new Promise<Result<void, FFMPEGSpawnErr>>((resolve) => {
            child.once("close", (code, signal) => {
                this.child = null;

                // The last line may have no line ending, like the overwrite prompt
                if (this.stderrBuffer !== "") {
                    this.onStderrLine(this.stderrBuffer);
                    this.stderrBuffer = "";
                }

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

        // No encoding: stdout can carry binary output, such as -f rawvideo -
        child.stdout?.on("data", (data) => {
            this._emit("stdout", data);
        });

        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (data) => {
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
