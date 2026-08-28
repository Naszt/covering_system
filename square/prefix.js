(function (root, factory) {
  const parser = typeof module !== 'undefined' && module.exports
    ? require('../tree/parser.js')
    : root.CoveringCppParser;
  const api = factory(parser);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoveringPrefixRectangles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Syntax) {
  'use strict';

  class PrefixRectangleError extends Error {
    constructor(message) {
      super(message);
      this.name = 'PrefixRectangleError';
    }
  }

  function pathCoordinate(path, base) {
    const numerator = path.reduce((value, branch) => value * base + branch, 0);
    return path.length ? numerator / Math.pow(base, path.length) : 0;
  }

  async function convert(source, options) {
    const baseA = Number(options && options.baseA);
    const baseB = Number(options && options.baseB);
    const recursionDepth = Math.max(1, Number(options && options.recursionDepth) || 6);
    const maximumRectangles = Math.max(1, Number(options && options.maximumRectangles) || 10000);

    if (!Number.isInteger(baseA) || !Number.isInteger(baseB) || baseA < 2 || baseB < 2) {
      throw new PrefixRectangleError('矩形底数必须是大于 1 的整数');
    }
    if (baseA === baseB) {
      throw new PrefixRectangleError('两个矩形坐标使用相同叉数时无法仅凭算式区分树身份');
    }

    const ast = await Syntax.parse(source);
    const rectangles = new Map();

    function axisFor(arity) {
      if (arity === baseA) return 'x';
      if (arity === baseB) return 'y';
      throw new PrefixRectangleError(`算式含 ${arity} 叉树，但当前矩形坐标是 ${baseA} 叉与 ${baseB} 叉`);
    }

    function emit(context) {
      const n = context.x.length;
      const m = context.y.length;
      const x = pathCoordinate(context.x, baseA);
      const y = pathCoordinate(context.y, baseB);
      const key = `${n}:${m}:${x}:${y}`;
      rectangles.set(key, { n, m, x, y });
      if (rectangles.size > maximumRectangles) {
        throw new PrefixRectangleError(`展开超过 ${maximumRectangles} 个矩形，请降低递归深度`);
      }
    }

    function visit(node, context, recursionCounts) {
      if (node.type === 'leaf') {
        if (node.value === 1) emit(context);
        return;
      }
      if (node.type === 'sum') {
        node.terms.forEach((term) => visit(term, context, recursionCounts));
        return;
      }
      if (node.type === 'recursion') {
        throw new PrefixRectangleError('递归箭头必须位于递归树的最后一个分支');
      }

      const axis = axisFor(node.arity);
      const used = recursionCounts.get(node.id) || 0;
      node.children.forEach((child, branch) => {
        const nextContext = {
          x: axis === 'x' ? context.x.concat(branch) : context.x,
          y: axis === 'y' ? context.y.concat(branch) : context.y
        };
        if (child.type !== 'recursion') {
          visit(child, nextContext, recursionCounts);
          return;
        }
        if (!node.recursive || used + 1 >= recursionDepth) return;
        const nextCounts = new Map(recursionCounts);
        nextCounts.set(node.id, used + 1);
        visit(node, nextContext, nextCounts);
      });
    }

    visit(ast, { x: [], y: [] }, new Map());
    return Array.from(rectangles.values());
  }

  return { PrefixRectangleError, convert };
});
