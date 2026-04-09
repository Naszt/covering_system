// ======================= 文本区域和历史记录 =======================
// 本模块负责管理文本区域与矩形数据之间的同步，以及撤销/重做功能

// 历史记录状态变量
let textareaHistory = [];      // 文本区域历史记录数组
let historyIndex = -1;         // 当前历史记录索引
let isUndoRedoInProgress = false; // 是否正在进行撤销/重做操作
let debounceTimer = null;      // 防抖定时器
let suppressTextarea = false;  // 防止文本区域事件循环

/**
 * 从矩形数据更新文本区域
 */
function updateTextareaFromRects(){
    const ta = document.getElementById('rect-textarea');
    if(!ta) return;
    
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
function parseTextareaAndLoad(){
    const ta = document.getElementById('rect-textarea');
    if(!ta || suppressTextarea) return;
    
    const raw = ta.value;
    if(!isUndoRedoInProgress) saveToHistory(raw);
    
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    
    // 清空当前矩形
    rectangles = []; 
    nextId = 0; 
    selectedId = null; 
    isDragging = false;
    
    // 解析并添加每个矩形
    for(const p of parts){
        const parsed = parseEntryString(p);
        if(parsed) addRectangle(parsed.n, parsed.m, parsed.x, parsed.y, false);
    }
    
    drawAll(); 
    updateCount();
    
    // 如果当前形状无效，无需重置（保持当前选择）
    drawMatrixGrid();
}

/**
 * 防抖解析函数（用于文本区域输入事件）
 */
function debouncedParse(){
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(parseTextareaAndLoad, 500);
}