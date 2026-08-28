(function (root) {
  'use strict';

  const scriptUrl = document.currentScript.src;
  const moduleUrl = new URL('covering-parser.mjs?v=20260828c', scriptUrl).href;
  let modulePromise = null;

  class CppParserError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CppParserError';
    }
  }

  function loadModule() {
    if (!modulePromise) {
      modulePromise = import(moduleUrl)
        .then(({ default: createModule }) => createModule())
        .catch((error) => {
          modulePromise = null;
          throw error;
        });
    }
    return modulePromise;
  }

  async function parseDocument(source, signal) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    let module;
    try {
      module = await loadModule();
    } catch (error) {
      throw new CppParserError(`无法载入 covering.hpp 的 WebAssembly：${error.message}`);
    }
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');

    let result;
    try {
      result = JSON.parse(module.parseCovering(String(source || '')));
    } catch (error) {
      throw new CppParserError(`C++ 解析器返回了无法读取的结果：${error.message}`);
    }
    if (!result.ok) throw new CppParserError(result.error || 'C++ 解析失败');
    return result;
  }

  async function parse(source, signal) {
    return (await parseDocument(source, signal)).ast;
  }

  async function proveDocument(source, signal) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    let module;
    try {
      module = await loadModule();
    } catch (error) {
      throw new CppParserError(`无法载入 covering.hpp 的 WebAssembly：${error.message}`);
    }
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    let result;
    try {
      result = JSON.parse(module.proveCovering(String(source || '')));
    } catch (error) {
      throw new CppParserError(`C++ 证明器返回了无法读取的结果：${error.message}`);
    }
    if (!result.ok) throw new CppParserError(result.error || 'C++ 证明失败');
    return result;
  }

  root.CoveringCppParser = { CppParserError, parse, parseDocument, proveDocument };
})(typeof globalThis !== 'undefined' ? globalThis : this);
