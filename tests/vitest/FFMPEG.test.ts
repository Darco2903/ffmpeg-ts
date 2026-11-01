import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { describe, it, expect, afterAll } from "vitest";
import { FFMPEG, FFMPEGProgress } from "../../src/index.js";

//////////////////////////
// create FFMPEG tests

afterAll(() => {
    // Cleanup
    fs.rmSync("smpte.mp4", { force: true });
    fs.rmSync("output.mp4", { force: true });
});

describe("FFMPEG", () => {
    it("should create a FFMPEG instance", () => {
        const args: string[] = ["-i", "input.mp4", "output.mp4"];
        const ffmpeg = new FFMPEG(args);

        expect(ffmpeg).toBeInstanceOf(FFMPEG);
        expect(ffmpeg.args).toEqual(args);
        expect(ffmpeg.killed).toBe(false);
        expect(ffmpeg.processing).toBe(false);
        expect(ffmpeg.progress).toEqual({
            duration: null,
            percent: null,
            frame: null,
            fps: null,
            quality: null,
            bitrateKbps: null,
            sizeKB: null,
            speed: null,
            timeInSeconds: null,
        } satisfies FFMPEGProgress);
    });

    it("should create a FFMPEG instance with custom execPath", async () => {
        const args: string[] = ["-f", "lavfi", "-i", "smptebars", "-t", "30", "smpte.mp4", "-y"];
        const customPath = "/usr/local/bin/ffmpeg";
        const ffmpeg = new FFMPEG(args, { execPath: customPath });

        expect(ffmpeg).toBeInstanceOf(FFMPEG);
        expect(ffmpeg.args).toEqual(args);
        expect(ffmpeg.execPath).toBe(customPath);
        expect(ffmpeg.killed).toBe(false);
        expect(ffmpeg.processing).toBe(false);
        expect(ffmpeg.progress).toEqual({
            duration: null,
            percent: null,
            frame: null,
            fps: null,
            quality: null,
            bitrateKbps: null,
            sizeKB: null,
            speed: null,
            timeInSeconds: null,
        } satisfies FFMPEGProgress);
    });

    it("should run a FFMPEG instance", async () => {
        const args: string[] = ["-f", "lavfi", "-i", "smptebars", "-t", "30", "smpte.mp4", "-y"];
        const ffmpeg = new FFMPEG(args);

        const res = await ffmpeg.start();
        expect(res.isOk()).toBe(true);
    });

    it("should fail to run a FFMPEG instance with invalid execPath", async () => {
        const args: string[] = ["-f", "lavfi", "-i", "smptebars", "-t", "30", "smpte.mp4", "-y"];
        const customPath = "nonexistent_ffmpeg_path";
        const ffmpeg = new FFMPEG(args, { execPath: customPath });

        expect(ffmpeg.execPath).toBe(customPath);

        const res = await ffmpeg.start();
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error).toHaveProperty("code");
            expect(res.error).toHaveProperty("message");
        }
    });

    it("should run a FFMPEG instance with input file", async () => {
        execSync("ffmpeg -f lavfi -i smptebars -t 1 smpte.mp4 -y"); // create smpte.mp4

        const args: string[] = ["-i", "smpte.mp4", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "128k", "output.mp4", "-y"];
        const ffmpeg = new FFMPEG(args);
        const res = await ffmpeg.start();
        expect(res.isOk()).toBe(true);
    });

    it.each([[[]], [["-loglevel", "quiet"]]])("should fail instead of hanging when the output exists and -y is not set (%j)", async (extraArgs: string[]) => {
        execSync("ffmpeg -f lavfi -i smptebars -t 1 smpte.mp4 -y"); // create smpte.mp4
        fs.writeFileSync("output.mp4", "");

        const ffmpeg = new FFMPEG([...extraArgs, "-i", "smpte.mp4", "output.mp4"]);
        const res = await ffmpeg.start();
        expect(res.isErr()).toBe(true);
        expect(ffmpeg.processing).toBe(false);
        expect(fs.statSync("output.mp4").size).toBe(0);
    });

    it("should succeed when -n skips an existing output", async () => {
        execSync("ffmpeg -f lavfi -i smptebars -t 1 smpte.mp4 -y"); // create smpte.mp4
        fs.writeFileSync("output.mp4", "");

        const ffmpeg = new FFMPEG(["-n", "-i", "smpte.mp4", "output.mp4"]);
        const res = await ffmpeg.start();
        expect(res.isOk()).toBe(true);
        expect(fs.statSync("output.mp4").size).toBe(0);
    });

    it("should fail instead of hanging when reading from stdin", async () => {
        const ffmpeg = new FFMPEG(["-f", "mp4", "-i", "pipe:0", "-f", "null", "-"]);
        const res = await ffmpeg.start();
        expect(res.isErr()).toBe(true);
    });

    it("should kill a running FFMPEG instance", async () => {
        const args: string[] = ["-f", "lavfi", "-i", "smptebars", "-t", "300", "smpte.mp4", "-y"];
        const ffmpeg = new FFMPEG(args);
        const startPromise = ffmpeg.start();

        // Wait a moment to ensure FFMPEG has started
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(ffmpeg.processing).toBe(true);
        expect(ffmpeg.killed).toBe(false);

        const killResult = ffmpeg.stop();
        expect(killResult).toBe(true);
        expect(ffmpeg.killed).toBe(true);
        const res = await startPromise;
        expect(ffmpeg.processing).toBe(false);
        expect(res.isErr()).toBe(true);
    });

    it("should report progress during FFMPEG processing", async () => {
        execSync("ffmpeg -f lavfi -i smptebars -t 1 smpte.mp4 -y"); // create smpte.mp4

        const args: string[] = ["-i", "smpte.mp4", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "128k", "output.mp4", "-y"];
        const ffmpeg = new FFMPEG(args);
        const progressUpdates: FFMPEGProgress[] = [];

        ffmpeg.on("progress", (progress: FFMPEGProgress) => {
            progressUpdates.push(progress);
        });

        const res = await ffmpeg.start();
        expect(res.isOk()).toBe(true);
        expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it.skipIf(process.platform === "win32")("should escalate to a stronger signal when the first one is ignored", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffmpeg-ts-"));
        const execPath = path.join(dir, "ignore-sigterm.sh");
        fs.writeFileSync(execPath, "#!/bin/sh\ntrap '' TERM\nwhile :; do sleep 0.1; done\n", { mode: 0o755 });

        try {
            const ffmpeg = new FFMPEG([], { execPath });
            const startPromise = ffmpeg.start();

            // Wait a moment to ensure the trap is installed
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(ffmpeg.stop()).toBe(true);

            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(ffmpeg.processing).toBe(true);

            expect(ffmpeg.stop("SIGKILL")).toBe(true);
            const res = await startPromise;
            expect(ffmpeg.processing).toBe(false);
            expect(res.isErr()).toBe(true);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("should stop an instance that was restarted after being stopped", async () => {
        const args: string[] = ["-re", "-f", "lavfi", "-i", "smptebars", "-f", "null", "-"];
        const ffmpeg = new FFMPEG(args);

        const firstRun = ffmpeg.start();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(ffmpeg.stop()).toBe(true);
        await firstRun;
        expect(ffmpeg.killed).toBe(true);

        const secondRun = ffmpeg.start();
        expect(ffmpeg.killed).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(ffmpeg.stop()).toBe(true);
        expect(ffmpeg.killed).toBe(true);

        const res = await secondRun;
        expect(ffmpeg.processing).toBe(false);
        expect(res.isErr()).toBe(true);
    });

    it("should not kill an instance that already finished", async () => {
        const ffmpeg = new FFMPEG(["-version"]);
        await ffmpeg.start();

        expect(ffmpeg.stop()).toBe(false);
        expect(ffmpeg.killed).toBe(false);
    });

    it("should not kill a non-running FFMPEG instance", () => {
        const args: string[] = ["-f", "lavfi", "-i", "smptebars", "-t", "30", "smpte.mp4", "-y"];
        const ffmpeg = new FFMPEG(args);

        const killResult = ffmpeg.stop();
        expect(killResult).toBe(false);
        expect(ffmpeg.killed).toBe(false);
    });
});
