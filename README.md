# FFMPEG TS

This library provides a TypeScript wrapper around the FFMPEG command-line tool, allowing you to easily run FFMPEG commands, monitor progress, and handle output in a TypeScript environment.

## Example

```ts
import { FFMPEG } from "ffmpeg-ts";

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

You can stop the FFMPEG process at any time by `ffmpeg.stop()`.

```ts
// Stop the FFMPEG process with default signal (SIGTERM)
ffmpeg.stop();

// or with a specific signal
ffmpeg.stop("SIGINT");
```
