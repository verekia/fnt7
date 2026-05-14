declare module 'wawoff2' {
  /** Compress TTF/OTF bytes into a WOFF2 payload. Async because the WASM runtime initializes lazily. */
  export function compress(input: Uint8Array): Promise<Uint8Array>
  /** Decompress WOFF2 bytes back to TTF/OTF. */
  export function decompress(input: Uint8Array): Promise<Uint8Array>
}
