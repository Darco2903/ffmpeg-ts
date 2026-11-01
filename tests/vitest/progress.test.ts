import { describe, it, expect } from "vitest";
import { FFMPEG, FFMPEGProgress } from "../../src/index.js";

// Captured from ffmpeg 9.0.2, with a metadata title added to the input dump
const LOG = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'src.mp4':
  Metadata:
    title           : Duration: 99:00:00.00
    encoder         : Lavf63.1.102
  Duration: 00:00:03.00, start: 0.000000, bitrate: 137 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv444p(progressive), 320x240 [SAR 1:1 DAR 4:3], 45 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
[libx264 @ 0x7c7501ca80] cabac=1 ref=3 rc=crf mbtree=1 crf=23.0 qcomp=0.60 qpmin=0 qpmax=69 qpstep=4 ip_ratio=1.40 aq=1:1.00
Output #0, mp4, to 'v.mp4':
      Side data:
        cpb: bitrate max/min/avg: 0/0/0 buffer size: 0 vbv_delay: N/A
    Stream #0:0: Audio: aac, 44100 Hz, stereo, fltp, q=2-31, 128 kb/s
frame=20
fps=0.00
stream_0_0_q=28.0
bitrate=  12.5kbits/s
total_size=1024
out_time_us=1500000
out_time_ms=1500000
out_time=00:00:01.500000
dup_frames=0
drop_frames=0
speed=75.0x
progress=continue
frame=   75 fps=0.0 q=-1.0 Lsize=      17KiB time=00:00:02.92 bitrate=  47.7kbits/s speed= 109x elapsed=0:00:00.02
frame=75
fps=0.00
stream_0_0_q=-1.0
stream_1_0_q=5.0
bitrate=  47.7kbits/s
total_size=17408
out_time_us=2920000
out_time_ms=2920000
out_time=00:00:02.920000
dup_frames=0
drop_frames=0
speed=7.43e+03x
progress=end
[libx264 @ 0x7c7501ca80] kb/s:45.27
`;

const FINAL: FFMPEGProgress = {
    duration: 3,
    percent: (2.92 / 3) * 100,
    frame: 75,
    fps: 0,
    quality: -1,
    sizeKB: 17,
    timeInSeconds: 2.92,
    bitrateKbps: 47.7,
    speed: 7430,
};

class TestFFMPEG extends FFMPEG {
    public readonly stderrLines: string[] = [];
    public readonly events: FFMPEGProgress[] = [];

    constructor() {
        super([]);
        this.on("stderr", (line) => this.stderrLines.push(line));
        this.on("progress", (progress) => this.events.push(progress));
    }

    public feed(...chunks: string[]): this {
        chunks.forEach((chunk) => this.onStderrData(chunk));
        return this;
    }
}

describe("progress parsing", () => {
    it("should parse a full log", () => {
        const ffmpeg = new TestFFMPEG().feed(LOG);

        expect(ffmpeg.progress).toEqual(FINAL);
    });

    it("should give the same result wherever the chunks are split", () => {
        for (let i = 1; i < LOG.length; i++) {
            const ffmpeg = new TestFFMPEG().feed(LOG.slice(0, i), LOG.slice(i));

            expect(ffmpeg.progress).toEqual(FINAL);
            expect(ffmpeg.events.length).toBe(2);
        }
    });

    it("should emit one event per progress block", () => {
        const ffmpeg = new TestFFMPEG().feed(LOG);

        expect(ffmpeg.events.length).toBe(2);
        expect(ffmpeg.events[0]).toEqual({
            duration: 3,
            percent: 50,
            frame: 20,
            fps: 0,
            quality: 28,
            sizeKB: 1024 / 1024,
            timeInSeconds: 1.5,
            bitrateKbps: 12.5,
            speed: 75,
        } satisfies FFMPEGProgress);
    });

    it("should keep progress lines out of stderr but keep everything else", () => {
        const ffmpeg = new TestFFMPEG().feed(LOG);
        const stderr = ffmpeg.stderrLines.join("");

        expect(stderr).not.toMatch(/^(frame=\d|out_time|total_size|progress=)/m);
        expect(stderr).toContain("Output #0, mp4, to 'v.mp4':");
        expect(stderr).toContain("frame=   75 fps=0.0");
    });

    it("should handle CR and CRLF line endings", () => {
        const crlf = new TestFFMPEG().feed(LOG.replaceAll("\n", "\r\n"));
        const cr = new TestFFMPEG().feed(LOG.replaceAll("\n", "\r"));

        expect(crlf.progress).toEqual(FINAL);
        expect(cr.progress).toEqual(FINAL);
    });

    it("should report unavailable values as null", () => {
        const ffmpeg = new TestFFMPEG().feed("bitrate=N/A\n", "total_size=N/A\n", "out_time_us=N/A\n", "speed=N/A\n", "progress=continue\n");

        expect(ffmpeg.events).toEqual([expect.objectContaining({ bitrateKbps: null, sizeKB: null, timeInSeconds: null, speed: null, percent: null })]);
    });

    it("should report progress without a known duration", () => {
        const ffmpeg = new TestFFMPEG().feed("  Duration: N/A, bitrate: N/A\n", "frame=10\n", "out_time_us=400000\n", "progress=continue\n");

        expect(ffmpeg.events).toEqual([expect.objectContaining({ duration: null, percent: null, frame: 10, timeInSeconds: 0.4 })]);
    });

    it.each([
        ["past the end", 6_000_000, 100],
        ["before the start", -23_220, 0],
    ])("should clamp percent when the time is %s", (_, outTimeUs, percent) => {
        const ffmpeg = new TestFFMPEG().feed("  Duration: 00:00:03.00, start\n", `out_time_us=${outTimeUs}\n`, "progress=continue\n");

        expect(ffmpeg.progress.percent).toBe(percent);
    });

    it("should use the first duration when there are several inputs", () => {
        const ffmpeg = new TestFFMPEG().feed("  Duration: 00:00:03.00, start\n", "  Duration: 00:00:09.00, start\n");

        expect(ffmpeg.progress.duration).toBe(3);
    });
});
