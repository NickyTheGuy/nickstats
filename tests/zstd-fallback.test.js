const test = require("node:test");
const assert = require("node:assert/strict");

global.self = global;
require("../js/zstd-codec-worker.js");

function compatibilityDecode(input) {
  return new Promise((resolve, reject) => {
    global.NickStatsZstdWasm.run(binding => {
      const stream = new binding.ZstdDecompressStreamBinding();
      const chunks = [];
      let total = 0;
      const collect = chunk => {
        chunks.push(new Uint8Array(chunk));
        total += chunk.length;
      };
      try {
        assert.equal(stream.begin(), true);
        assert.equal(stream.transform(input, collect), true);
        assert.equal(stream.end(collect), true);
        const output = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(output);
      } catch (error) {
        reject(error);
      } finally {
        stream.delete();
      }
    }, reject);
  });
}

test("WebAssembly fallback decodes a Zstandard frame", async () => {
  const compressed = new Uint8Array(Buffer.from("KLUv/QRY4QAATmlja1N0YXRzIFpzdGFuZGFyZCBmYWxsYmFja+eG5zc=", "base64"));
  const output = await compatibilityDecode(compressed);
  assert.equal(new TextDecoder().decode(output), "NickStats Zstandard fallback");
});
