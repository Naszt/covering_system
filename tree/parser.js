(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoveringParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class ParseError extends Error {
    constructor(message, position) {
      super(message);
      this.name = 'ParseError';
      this.position = position;
    }
  }

  class Parser {
    constructor(source) {
      this.source = String(source || '')
        .replace(/\\left|\\right/g, '')
        .replace(/\^\s*\{\s*\\uparrow\s*\}/g, '^')
        .replace(/\^\s*\\uparrow/g, '^')
        .replace(/\\_/g, '_')
        .replace(/\\uparrow|↑/g, '^')
        .replace(/\^+/g, '^')
        .replace(/，/g, ',')
        .replace(/\|/g, ',')
        .replace(/\$/g, '');
      this.position = 0;
      this.nextId = 1;
    }

    node(type, fields) {
      return Object.assign({ id: `node-${this.nextId++}`, type }, fields || {});
    }

    leaf(value) {
      return this.node('leaf', { value });
    }

    tree(arity, children, recursive) {
      return this.node('tree', { arity, children, recursive: Boolean(recursive) });
    }

    recursion() {
      return this.node('recursion');
    }

    sum(terms) {
      const flattened = [];
      terms.forEach((term) => {
        if (term.type === 'sum') flattened.push(...term.terms);
        else flattened.push(term);
      });
      return flattened.length === 1 ? flattened[0] : this.node('sum', { terms: flattened });
    }

    skip() {
      while (this.position < this.source.length && /\s/.test(this.source[this.position])) {
        this.position += 1;
      }
    }

    peek() {
      this.skip();
      return this.source[this.position] || '';
    }

    match(character) {
      this.skip();
      if (this.source[this.position] !== character) return false;
      this.position += 1;
      return true;
    }

    expect(character, message) {
      if (!this.match(character)) throw new ParseError(message || `需要“${character}”`, this.position);
    }

    readNumber() {
      this.skip();
      const start = this.position;
      while (/\d/.test(this.source[this.position] || '')) this.position += 1;
      if (start === this.position) throw new ParseError('这里需要一个数字', this.position);
      const value = Number(this.source.slice(start, this.position));
      if (!Number.isSafeInteger(value)) throw new ParseError('数字超出安全整数范围', start);
      return value;
    }

    parse() {
      this.skip();
      if (!this.source.trim()) throw new ParseError('请输入一个表达式', 0);
      const result = this.readExpression();
      this.match('=');
      this.skip();
      if (this.position !== this.source.length) {
        throw new ParseError(`无法识别“${this.source[this.position]}”`, this.position);
      }
      return result;
    }

    readExpression() {
      const terms = [this.readNode()];
      while (this.match('+')) terms.push(this.readNode());
      return this.sum(terms);
    }

    readNode() {
      const start = this.position;
      const number = this.readNumber();

      if ((number === 0 || number === 1) && this.peek() !== '_' && this.peek() !== '(') {
        return this.leaf(number);
      }
      this.position = start;
      return this.readTree();
    }

    readTree() {
      const start = this.position;
      const number = this.readNumber();
      if (number <= 1) throw new ParseError('连续因子的分叉数必须大于 1', start);
      if (this.match('^')) {
        // 论文同时使用 p^↑(...) 与 p^↑_w A。后一种只是把递归标记
        // 写在路径之前；其语义与既有的 p_w^↑ A 完全相同。
        if (this.match('_')) {
          const { path } = this.readSubscript(number);
          const continuation = /\d/.test(this.peek()) ? this.readNode() : this.leaf(1);
          return this.makePathRecursion(number, path, continuation, start);
        }
        return this.readRecursiveTree(number, start);
      }

      if (this.match('_')) {
        const { path, residue } = this.readSubscript(number);

        if (this.match('^')) {
          if (path.some((branch) => branch >= number)) {
            throw new ParseError(`递归路径中存在超出 0…${number - 1} 的分支`, start);
          }
          const continuation = /\d/.test(this.peek()) ? this.readNode() : this.leaf(1);
          return this.makePathRecursion(number, path, continuation, start);
        }

        // 紧邻的下一棵树是点乘的右因子，替换路径末端的 1。
        // 因此 2_12_12(1,0) 按 2_1 · 2_1 · 2(1,0) 读取。
        this.skip();
        const continuation = /\d/.test(this.source[this.position] || '')
          ? this.readTree()
          : this.leaf(1);
        if (residue !== null) return this.makeModulusChain(number, residue, continuation);
        return this.makePathChain(number, path, continuation);
      }

      this.expect('(', `分叉数 ${number} 后需要括号或下标`);
      const children = [];
      for (let branch = 0; branch < number; branch += 1) {
        children.push(this.readExpression());
        if (branch + 1 < number) this.expect(',', `第 ${branch + 1} 个分支后需要逗号`);
      }
      this.expect(')', `${number} 叉节点缺少右括号`);
      return this.tree(number, children);
    }

    readSubscript(arity) {
      let path;
      let residue = null;
      if (this.match('{')) {
        const wordStart = this.position;
        while (this.position < this.source.length && this.source[this.position] !== '}') {
          this.position += 1;
        }
        if (this.position >= this.source.length) throw new ParseError('路径下标缺少右花括号', wordStart);
        const word = this.source.slice(wordStart, this.position);
        this.position += 1;
        path = this.readPath(arity, word, wordStart);
      } else {
        this.skip();
        const tokenStart = this.position;
        while (/\d/.test(this.source[this.position] || '')) this.position += 1;
        const tokenEnd = this.position;
        if (tokenStart === tokenEnd) throw new ParseError('下标需要数字', tokenStart);

        // 无花括号写法兼容两种既有语境：n_t 是模数-代表元；当首位
        // 后面紧跟另一棵树时，则按 p_d p_e... 的点乘链切成单步下标。
        const isShortStep = tokenEnd > tokenStart + 1 && this.isTreeStartAt(tokenStart + 1);
        if (!isShortStep) {
          residue = Number(this.source.slice(tokenStart, tokenEnd));
          path = [residue];
        } else {
          const branch = Number(this.source[tokenStart]);
          this.position = tokenStart + 1;
          if (branch >= arity) {
            throw new ParseError(`分支 ${branch} 超出 0…${arity - 1}`, tokenStart);
          }
          path = [branch];
        }
      }
      return { path, residue };
    }

    readRecursiveTree(arity, position) {
      const children = [];
      if (this.match('(')) {
        for (let branch = 0; branch < arity - 1; branch += 1) {
          children.push(this.readExpression());
          if (branch + 1 < arity - 1) this.expect(',', `第 ${branch + 1} 个非递归分支后需要逗号`);
        }
        this.expect(')', `${arity} 叉递归节点缺少右括号`);
      } else if (arity === 2) {
        children.push(this.leaf(1));
      } else if (arity === 3) {
        children.push(this.leaf(1));
        children.push(this.tree(2, [this.leaf(1), this.recursion()], true));
      } else {
        throw new ParseError(`${arity} 叉递归节点需要 ${arity - 1} 个参数`, position);
      }
      children.push(this.recursion());
      return this.tree(arity, children, true);
    }

    readPath(arity, word, position) {
      const compact = !word.includes(',') && arity <= 10;
      const pieces = compact ? word.trim().split('') : word.split(',').map((piece) => piece.trim());
      if (!pieces.length || pieces.some((piece) => !/^\d+$/.test(piece))) {
        throw new ParseError('路径必须由合法分支数字组成', position);
      }
      const path = pieces.map(Number);
      if (path.some((branch) => branch < 0 || branch >= arity)) {
        throw new ParseError(`路径中存在超出 0…${arity - 1} 的分支`, position);
      }
      return path;
    }

    isTreeStartAt(position) {
      let cursor = position;
      let arity = 0;
      let found = false;
      while (/\d/.test(this.source[cursor] || '')) {
        found = true;
        arity = arity * 10 + Number(this.source[cursor]);
        cursor += 1;
      }
      while (/\s/.test(this.source[cursor] || '')) cursor += 1;
      return found && arity > 1 && ['_', '(', '^'].includes(this.source[cursor]);
    }

    makePathChain(arity, path, continuation) {
      if (!path.length) throw new ParseError('路径不能为空', this.position);
      let result = continuation || this.leaf(1);
      for (let index = path.length - 1; index >= 0; index -= 1) {
        const children = Array.from({ length: arity }, () => this.leaf(0));
        children[path[index]] = result;
        result = this.tree(arity, children);
      }
      return result;
    }

    makePathRecursion(arity, path, continuation, position) {
      let exit = 0;
      while (exit < path.length && path[exit] === arity - 1) exit += 1;
      if (exit === path.length) {
        throw new ParseError('递归路径必须包含一个非末分支作为出口', position);
      }

      const exitBranch = path[exit];
      const tail = path.slice(exit + 1);
      const recursiveChildren = Array.from({ length: arity }, () => this.leaf(0));
      recursiveChildren[exitBranch] = tail.length
        ? this.makePathChain(arity, tail, continuation)
        : continuation;
      recursiveChildren[arity - 1] = this.recursion();
      let result = this.tree(arity, recursiveChildren, true);

      for (let index = exit - 1; index >= 0; index -= 1) {
        const children = Array.from({ length: arity }, () => this.leaf(0));
        children[arity - 1] = result;
        result = this.tree(arity, children);
        result.recursivePathChild = arity - 1;
      }
      return result;
    }

    makeModulusChain(modulus, residue, continuation) {
      if (residue >= modulus) {
        throw new ParseError(`代表元 ${residue} 应在 0…${modulus - 1} 之间`, this.position);
      }

      let remaining = modulus;
      const factors = [];
      for (let prime = 2; prime <= remaining / prime; prime += 1) {
        if (remaining % prime !== 0) continue;
        let count = 0;
        let power = 1;
        while (remaining % prime === 0) {
          remaining /= prime;
          power *= prime;
          count += 1;
        }
        while (count > 0) {
          power /= prime;
          factors.push({ arity: prime, branch: Math.floor(residue / power) % prime });
          count -= 1;
        }
      }
      if (remaining > 1) factors.push({ arity: remaining, branch: residue % remaining });

      let result = continuation || this.leaf(1);
      factors.forEach((factor) => {
        const children = Array.from({ length: factor.arity }, () => this.leaf(0));
        children[factor.branch] = result;
        result = this.tree(factor.arity, children);
      });
      return result;
    }
  }

  function parse(source) {
    return new Parser(source).parse();
  }

  function normalize(node) {
    if (node.type === 'leaf') return String(node.value);
    if (node.type === 'recursion') return '↑';
    if (node.type === 'sum') return node.terms.map(normalize).join('+');
    if (node.recursive) return `${node.arity}↑(${node.children.slice(0, -1).map(normalize).join(',')})`;
    return `${node.arity}(${node.children.map(normalize).join(',')})`;
  }

  return { ParseError, Parser, parse, normalize };
});
