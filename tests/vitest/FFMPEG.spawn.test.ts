import { EventEmitter } from "events";
import { describe, it, expect, vi } from "vitest";
import { FFMPEG } from "../../src/index.js";

// When the OS is out of file descriptors, spawn returns a child without
// stdout/stderr and reports the failure through an "error" event.
vi.mock("child_process", () => ({
    spawn: () => {
        const child = new EventEmitter();
        process.nextTick(() => child.emit("error", new Error("spawn ffmpeg EMFILE")));
        return child;
    },
}));

describe("FFMPEG spawn failure", () => {
    it("should return an error when the child has no streams", async () => {
        const ffmpeg = new FFMPEG([]);

        const res = await ffmpeg.start();
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.message).toBe("spawn ffmpeg EMFILE");
        }
        expect(ffmpeg.processing).toBe(false);
    });
});
