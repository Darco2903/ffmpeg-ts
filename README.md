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

## Progress

The `progress` event fires about twice a second and once at the end. Any value FFMPEG does not report is `null`.

| Field           | Unit         | Notes                                                        |
| --------------- | ------------ | ------------------------------------------------------------ |
| `duration`      | seconds      | Duration of the first input, `null` if it has none or the log level is below `info` |
| `percent`       | 0-100        | `timeInSeconds` relative to `duration`                       |
| `frame`         | frames       | `null` for audio-only output                                 |
| `fps`           | frames/s     |                                                              |
| `quality`       | quantizer    | First output stream, `-1` when the encoder does not report it |
| `sizeKB`        | KiB          | Size of the output so far                                    |
| `timeInSeconds` | seconds      | Position in the output                                       |
| `bitrateKbps`   | kbit/s       |                                                              |
| `speed`         | realtime (x) |                                                              |

`percent` compares the output position to the duration of the first input, so it can be misleading:

- It stops early with options like `-t 2` on a longer input, and can finish just below 100 on a normal run.
- It stops at 100 if the output is longer than the input.

Use the result of `start()` to know when FFMPEG has finished.

The library adds `-nostats -progress pipe:2` to the command, without changing `ffmpeg.args`. If you pass your own `-progress`, nothing is added and no `progress` event fires.

## Output

The `stderr` event fires once per line, without the progress data. FFMPEG's periodic `frame=...` status line is not printed, since `-nostats` turns it off.

## Errors

`res.error.kind` tells failures apart:

| `kind`            | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `already-started` | `start()` was called while a process is running          |
| `spawn-failed`    | The process could not be started                         |
| `output-exists`   | The output file exists and neither `-y` nor `-n` was set |
| `exited`          | FFMPEG exited with an error or was killed by a signal    |

`res.error.code` is the exit code, or `-1` if there is none. `res.error.signal` is the signal that killed the process, if any. FFMPEG catches `SIGTERM` and `SIGINT` and exits with a code, so `signal` is only set for signals it cannot handle, such as `SIGKILL`.

FFMPEG runs with stdin closed, so it can never wait for input. If an output file already exists and neither `-y` nor `-n` is set, `start()` returns an error. With `-n`, `start()` succeeds without writing the file, because that is what `-n` asks for.

## Stopping

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
