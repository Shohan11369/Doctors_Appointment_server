const fs = require("fs");
const path = require("path");

function saveBase64Image(base64Data, destinationDir) {
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("Invalid image data");
  }

  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image format");
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const ext =
    mimeType === "image/png"
      ? ".png"
      : mimeType === "image/webp"
        ? ".webp"
        : ".jpg";

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    throw new Error("Empty image data");
  }

  fs.mkdirSync(destinationDir, { recursive: true });

  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const fullPath = path.join(destinationDir, fileName);
  fs.writeFileSync(fullPath, buffer);

  return {
    filename: fileName,
    imageUrl: `/uploads/${fileName}`,
  };
}

module.exports = {
  saveBase64Image,
};
