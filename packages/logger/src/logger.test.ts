import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createLogger } from "./index";

/** Capture stream collecting parsed JSON log records. */
function capture() {
  const records: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      const line = String(chunk).trim();
      if (line) records.push(JSON.parse(line));
      cb();
    },
  });
  return { records, stream };
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// 1. constructs without throwing, writes JSON
check("constructs and emits JSON with service base", () => {
  const { records, stream } = capture();
  const log = createLogger({ name: "api", destination: stream });
  log.info("hello");
  assert.equal(records.length, 1);
  assert.equal(records[0]!.service, "api");
  assert.equal(records[0]!.level, "info");
  assert.equal(records[0]!.msg, "hello");
});

// 2. child binds and merges context fields cumulatively
check("child loggers merge bound fields", () => {
  const { records, stream } = capture();
  const log = createLogger({ name: "worker", destination: stream });
  log.child({ jobId: "j1" }).child({ step: "probe" }).info("step");
  assert.equal(records[0]!.jobId, "j1");
  assert.equal(records[0]!.step, "probe");
  assert.equal(records[0]!.service, "worker");
});

// 3. level filtering is honored
check("level filtering drops below-threshold lines", () => {
  const { records, stream } = capture();
  const log = createLogger({ name: "api", level: "warn", destination: stream });
  log.info("dropped");
  log.error("kept");
  assert.equal(records.length, 1);
  assert.equal(records[0]!.msg, "kept");
});

// 4. error stacks are captured via the default err serializer
check("error stack captured under err", () => {
  const { records, stream } = capture();
  const log = createLogger({ name: "api", destination: stream });
  log.error({ err: new Error("boom") }, "failed");
  const err = records[0]!.err as { stack?: string; message?: string };
  assert.equal(err.message, "boom");
  assert.ok(typeof err.stack === "string" && err.stack.includes("boom"));
});

// 5. never throws on a circular payload
check("does not throw on circular payload", () => {
  const { stream } = capture();
  const log = createLogger({ name: "worker", destination: stream });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.doesNotThrow(() => log.info({ circular }, "circular"));
});

console.log(`\n${passed} checks passed`);
