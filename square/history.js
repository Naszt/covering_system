// ======================= 文本区域和历史记录 =======================
// 本模块负责管理文本区域与矩形数据之间的同步，以及撤销/重做功能

// 历史记录状态变量
let textareaHistory = [];   // 文本区域历史记录数组
let historyIndex = -1;     // 当前历史记录索引
let isUndoRedoInProgress = false; // 是否正在进行撤销/重做操作
let debounceTimer = null;   // 防抖定时器
let suppressTextarea = false; // 防止文本区域事件循环
let textareaMode = 'rectangles'; // rectangles 或 expression
let expressionSource = '';
let parseSequence = 0;

function setParseMessage(message, error = false){
  const element = document.getElementById('rect-parse-message');
  if(!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
}

function switchTextareaToRectangleMode(){
  textareaMode = 'rectangles';
  expressionSource = '';
}

/**
 * 从矩形数据更新文本区域
 */
function updateTextareaFromRects(){
  const ta = document.getElementById('rect-textarea');
  if(!ta || suppressTextarea || textareaMode === 'expression') return;
  
  suppressTextarea = true;
  ta.value = serializeRects();
  if(!isUndoRedoInProgress) saveToHistory(ta.value);
  suppressTextarea = false;
}

/**
 * 保存文本到历史记录
 * @param {string} text - 要保存的文本
 */
function saveToHistory(text){
  if(isUndoRedoInProgress) return;
  
  // 如果与当前历史记录相同，则不保存
  if(textareaHistory.length && textareaHistory[historyIndex] === text) return;
  
  // 如果不在历史记录末尾，则截断后面的记录
  if(historyIndex < textareaHistory.length - 1){
    textareaHistory = textareaHistory.slice(0, historyIndex + 1);
  }
  
  textareaHistory.push(text);
  historyIndex = textareaHistory.length - 1;
  
  // 限制历史记录长度
  if(textareaHistory.length > 50){
    textareaHistory = textareaHistory.slice(-50);
    historyIndex = textareaHistory.length - 1;
  }
}

/**
 * 执行撤销操作
 */
function performUndo(){
  if(historyIndex <= 0) return;
  
  historyIndex--;
  isUndoRedoInProgress = true;
  
  const ta = document.getElementById('rect-textarea');
  if(ta){
    suppressTextarea = true;
    ta.value = textareaHistory[historyIndex];
    suppressTextarea = false;
    parseTextareaAndLoad();
  }
  
  isUndoRedoInProgress = false;
}

/**
 * 执行重做操作
 */
function performRedo(){
  if(historyIndex >= textareaHistory.length - 1) return;
  
  historyIndex++;
  isUndoRedoInProgress = true;
  
  const ta = document.getElementById('rect-textarea');
  if(ta){
    suppressTextarea = true;
    ta.value = textareaHistory[historyIndex];
    suppressTextarea = false;
    parseTextareaAndLoad();
  }
  
  isUndoRedoInProgress = false;
}

/**
 * 解析文本区域内容并加载矩形
 */
async function parseTextareaAndLoad(){
  const ta = document.getElementById('rect-textarea');
  if(!ta || suppressTextarea) return;
  const sequence = ++parseSequence;
  
  const raw = ta.value;
  if(!isUndoRedoInProgress) saveToHistory(raw);

  let parsedRectangles = null;
  let prefixError = null;
  try {
    const depthInput = document.getElementById('prefix-recursion-depth');
    const recursionDepth = depthInput ? Number(depthInput.value) : 6;
    parsedRectangles = await CoveringPrefixRectangles.convert(raw, {
      baseA: BASE_A,
      baseB: BASE_B,
      recursionDepth,
      maximumRectangles: 10000
    });
    if(sequence !== parseSequence) return;
    textareaMode = 'expression';
    expressionSource = raw;
    setParseMessage(`前缀表达式已展开为 ${parsedRectangles.length} 个矩形。`);
  } catch(error) {
    if(sequence !== parseSequence) return;
    prefixError = error;
  }

  if(parsedRectangles === null) {
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    const decoded = parts.map(parseEntryString);
    if(parts.length && decoded.every(Boolean)) {
      parsedRectangles = decoded;
      switchTextareaToRectangleMode();
      setParseMessage(`已读取 ${parsedRectangles.length} 个坐标编码。`);
    } else if(!raw.trim()) {
      parsedRectangles = [];
      switchTextareaToRectangleMode();
      setParseMessage('支持与树形覆盖相同的前缀表达式。');
    } else {
      setParseMessage(prefixError ? prefixError.message : '无法识别输入', true);
      return;
    }
  }

  rectangles = [];
  nextId = 0;
  selectedId = null;
  isDragging = false;

  parsedRectangles.forEach((rectangle) => {
    const width = getRectWidth(rectangle.n);
    const height = getRectHeight(rectangle.m);
    if(
      rectangle.x < 0 || rectangle.y < 0 ||
      rectangle.x + width > 1 || rectangle.y + height > 1 ||
      !canAddRectangle(rectangle.n, rectangle.m)
    ) return;
    rectangles.push({ id: nextId++, ...rectangle });
  });

  suppressTextarea = true;
  drawAll();
  updateCount();
  suppressTextarea = false;
  drawMatrixGrid();
}

/**
 * 防抖解析函数（用于文本区域输入事件）
 */
function debouncedParse(){
  if(debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(parseTextareaAndLoad, 500);
}
