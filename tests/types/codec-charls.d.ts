/** 테스트 fixture 생성에만 쓰는 CharLS WASM 모듈(타입 미제공) */
declare module "@cornerstonejs/codec-charls/wasmjs" {
  const factory: () => Promise<unknown>;
  export default factory;
}
