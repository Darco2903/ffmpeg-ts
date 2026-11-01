# FFMPEG TS

This library provides a TypeScript wrapper around the FFMPEG command-line tool, allowing you to easily run FFMPEG commands, monitor progress, and handle output in a TypeScript environment.

## Installation

```bash
npm install @darco2903/ffmpeg-ts
```

## Example

```ts
import { FFMPEG } from "@darco2903/ffmpeg-ts";

const args: string[] = ["-i", "input.mp4", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-b:a", "128k", "output.mp4", "-y"];

const ffmpeg = new FFMPEG(args);

// or specify a custom FFMPEG executable path
const ffmpeg = new FFMPEG(args, { execPath: "/path/to/ffmpeg" });

// Listen to progress events
ffmpeg.on("progress", (progress) => {
    console.log(`Progress: ${progress.percent?.toFixed(2)}%`);
});

const res = await ffmpeg.start();

if (res.isOk()) {
    console.log("FFMPEG processing completed successfully.");
} else {
    console.error(`FFMPEG processing failed with code ${res.error.code}: ${res.error.message}`);
}
```

FFMPEG runs with stdin closed, so it can never wait for input. If an output file already exists and neither `-y` nor `-n` is set, `start()` returns an error. With `-n`, `start()` succeeds without writing the file, because that is what `-n` asks for.

You can stop the FFMPEG process at any time by `ffmpeg.stop()`.

```ts
// Stop the FFMPEG process with default signal (SIGTERM)
ffmpeg.stop();

// or with a specific signal
ffmpeg.stop("SIGINT");

// FFMPEG finishes up on SIGTERM, so call stop() again if it does not exit
ffmpeg.stop("SIGKILL");
```

`stop()` returns `true` if the signal was sent, which does not mean the process has exited. `ffmpeg.killed` is reset by the next `start()`.
