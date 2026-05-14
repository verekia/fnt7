/**
 * Run a wawoff2 op (TTF/OTF ↔ WOFF2) inside a single-shot Web Worker.
 *
 * Why a worker: wawoff2's top-level wrapper is broken under webpack —
 * the Emscripten binding only sets `module.exports = Module` in Node, so
 * in the browser the wrapper's `runtimeInit` Promise never resolves and
 * `compress` / `decompress` hang forever. Running the binding in a worker
 * via `importScripts` lets us bypass the wrapper and use the binding at
 * its natural global scope.
 *
 * The worker self-terminates after one op so a page that needs both
 * compress and decompress doesn't end up with conflicting Module globals.
 */
function runOp(op: 'compress' | 'decompress', bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/wawoff2-worker.js')
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error(`wawoff2 ${op} timed out after 30s`))
    }, 30000)
    worker.onmessage = e => {
      clearTimeout(timeout)
      worker.terminate()
      const { ok, result, error } = e.data as { ok: boolean; result?: Uint8Array; error?: string }
      if (ok && result) resolve(result)
      else reject(new Error(error || `wawoff2 ${op} failed`))
    }
    worker.onerror = e => {
      clearTimeout(timeout)
      worker.terminate()
      reject(new Error(e.message || `wawoff2 ${op} worker error`))
    }
    // Copy the input so we can transfer ownership without affecting the caller.
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    worker.postMessage({ op, bytes: copy }, [copy.buffer])
  })
}

export const compressToWoff2 = (otfBytes: Uint8Array): Promise<Uint8Array> => runOp('compress', otfBytes)
export const decompressFromWoff2 = (woff2Bytes: Uint8Array): Promise<Uint8Array> => runOp('decompress', woff2Bytes)
