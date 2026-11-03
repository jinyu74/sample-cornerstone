/**
 * 브라우저 번들용 빈 모듈. Cornerstone WASM 코덱(Emscripten)의 Node 전용 분기
 * (ENVIRONMENT_IS_NODE 일 때만 실행되는 require("fs"))를 해석할 수 있게 대체한다.
 */
const emptyNodeModule = {};
export default emptyNodeModule;
