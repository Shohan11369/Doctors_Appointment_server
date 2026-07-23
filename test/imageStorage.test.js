const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { saveBase64Image } = require("../src/imageStorage");

test("saveBase64Image writes image to uploads folder and returns url", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-post-"));
  const base64Data =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAIAAgACABQAB+Q1nAAAAAElFTkSuQmCC";

  const result = saveBase64Image(base64Data, tempDir);

  assert.ok(result, "image should be saved");
  assert.match(result.imageUrl, /^\/uploads\//);
  assert.ok(fs.existsSync(path.join(tempDir, result.filename)));
  assert.ok(
    Buffer.byteLength(fs.readFileSync(path.join(tempDir, result.filename))) > 0,
  );
});
