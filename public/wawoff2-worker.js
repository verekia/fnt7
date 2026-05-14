/* fnt7 wawoff2 worker.
 *
 * Loaded as a plain Worker (NOT a module worker) so `importScripts` is
 * available. We use `importScripts` because the Emscripten binding has
 *   `var Module = typeof Module !== 'undefined' ? Module : {}`
 * and only assigns `module.exports = Module` when ENVIRONMENT_IS_NODE — both
 * patterns rely on top-level script semantics that webpack's module wrapper
 * destroys. Running the binding in the worker's global scope lets it work
 * unmodified.
 *
 * One worker handles a single operation then terminates: a per-page session
 * may need both compress and decompress (different routes), and the two
 * bindings would collide if hosted in the same Module.
 */

self.onmessage = function (e) {
  var op = e.data.op
  var bytes = e.data.bytes

  if (op !== 'compress' && op !== 'decompress') {
    self.postMessage({ ok: false, error: 'unknown op: ' + op })
    self.close()
    return
  }

  var resolveReady
  var ready = new Promise(function (r) {
    resolveReady = r
  })

  // Pre-populate the global Module with our hook before the binding loads;
  // the binding picks it up via `var Module = typeof Module !== 'undefined' ? Module : {}`.
  self.Module = {
    onRuntimeInitialized: function () {
      resolveReady()
    },
    onAbort: function (reason) {
      self.postMessage({ ok: false, error: 'wawoff2 abort: ' + reason })
      self.close()
    },
  }

  try {
    self.importScripts('/wawoff2/' + op + '_binding.js')
  } catch (err) {
    self.postMessage({ ok: false, error: 'failed to load binding: ' + err.message })
    self.close()
    return
  }

  ready
    .then(function () {
      var fn = self.Module[op]
      if (typeof fn !== 'function') {
        self.postMessage({ ok: false, error: 'wawoff2 ' + op + ' function missing' })
        self.close()
        return
      }
      var result = fn(bytes)
      if (result === false) {
        self.postMessage({ ok: false, error: 'wawoff2 ' + op + ' returned false' })
        self.close()
        return
      }
      // Transfer the underlying buffer back to the main thread to avoid a copy.
      self.postMessage({ ok: true, result: result }, [result.buffer])
      self.close()
    })
    .catch(function (err) {
      self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) })
      self.close()
    })
}
