/* 
 * 覆盖系统可视化工具 - 主应用程序逻辑
 * 该文件包含应用程序的所有JavaScript功能
 */

// ======================= 全局变量和配置 =======================
// 可配置底数 a, b - 控制矩形的宽度和高度的基数
let BASE_A = 2;   // 宽度底数
let BASE_B = 3;   // 高度底数

// 核心数据结构: 允许多个相同 (n,m) 的矩形
let rectangles = [];      // 每个元素 {id, n, m, x, y}
let nextId = 0;           // 用于生成唯一ID的计数器
let selectedId = null;    // 当前选中的矩形ID
let isDragging = false;   // 是否正在拖拽矩形
let dragOffset = {x:0, y:0}; // 拖拽时的偏移量
let currentShape = {n:0, m:0, w:1, h:1};  // 当前选中的待添加形状

// 鼠标交互状态变量
let clickSuppressed=false, downPos=null, hasMoved=false;
let hadSelectionBeforeClick=false, clickedInSelectedAtDown=false;

// 网格和视图配置
let gridSize=9;                     // 右侧矩阵网格大小
const GRID_LIMIT_MAX=60;            // 网格最大限制
const CELL_SIZE = 24;               // 矩阵网格中每个单元格的大小

// 滚动条状态
let isScrollingHorizontal=false, isScrollingVertical=false;
let scrollStartX=0, scrollStartY=0, thumbStartX=0, thumbStartY=0;

// 视口状态（用于缩放和平移）
let viewport={x:0,y:0,scale:1};
const MIN_SCALE=1, MAX_SCALE=10;    // 缩放范围限制

// 平移状态
let isPanning=false, panStart={x:0,y:0}, viewportStart={x:0,y:0};

// 文本区域历史记录（用于撤销/重做）
let textareaHistory=[], historyIndex=-1, isUndoRedoInProgress=false, debounceTimer=null;
let suppressTextarea=false;         // 防止文本区域事件循环

// ======================= DOM 元素引用 =======================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const countSpan = document.getElementById('count');
const scrollbarHorizontal = document.querySelector('.scrollbar-thumb-horizontal');
const scrollbarVertical = document.querySelector('.scrollbar-thumb-vertical');
const scrollbarTrackHorizontal = document.querySelector('.scrollbar-track-horizontal');
const scrollbarTrackVertical = document.querySelector('.scrollbar-track-vertical');
const matrixCanvas = document.getElementById('matrixCanvas');
let matrixCtx = matrixCanvas.getContext('2d');

// ======================= 辅助函数 =======================

/**
 * 根据指数n计算矩形宽度（逻辑坐标）
 * @param {number} n - 宽度指数
 * @returns {number} 矩形宽度
 */
function getRectWidth(n) { 
    return 1 / Math.pow(BASE_A, n); 
}

/**
 * 根据指数m计算矩形高度（逻辑坐标）
 * @param {number} m - 高度指数
 * @returns {number} 矩形高度
 */
function getRectHeight(m) { 
    return 1 / Math.pow(BASE_B, m); 
}

/**
 * 根据矩形的n,m值生成边框颜色（使用HSL色彩空间）
 * @param {number} n - 宽度指数
 * @param {number} m - 高度指数
 * @returns {string} HSL颜色字符串
 */
function getRectBorderColor(n,m) {
    const hue = (n * 37 + m * 73) % 360; // 使用质数乘法避免颜色重复
    return `hsl(${hue}, 80%, 60%)`;
}

/**
 * 统计某个 (n,m) 矩形出现的次数
 * @param {number} n - 宽度指数
 * @param {number} m - 高度指数
 * @returns {number} 出现次数
 */
function getRectCount(n,m) {
    return rectangles.filter(r => r.n === n && r.m === m).length;
}

/**
 * 根据出现次数获取右侧矩阵格子的背景色
 * @param {number} count - 出现次数
 * @returns {string} 颜色值
 */
function getCountColor(count) {
    if(count === 0) return '#ffffff';      // 白色 - 未使用
    if(count === 1) return '#e9e9e9';      // 浅灰 - 使用1次
    if(count === 2) return '#cccccc';      // 中灰 - 使用2次
    return '#999999';                      // 深灰 - 使用3次及以上
}

/**
 * 数字进制反转（通用）
 * @param {number} num - 要反转的数字
 * @param {number} base - 进制基数
 * @param {number} len - 数字长度（位数）
 * @returns {number} 反转后的数字
 */
function reverseDigits(num, base, len) {
    if(len === 0) return 0;
    let str = num.toString(base).padStart(len,'0').split('').reverse().join('');
    return parseInt(str, base);
}

/**
 * 数字进制反转并返回字符串形式
 * @param {number} num - 要反转的数字
 * @param {number} base - 进制基数
 * @param {number} len - 数字长度（位数）
 * @returns {string} 反转后的字符串
 */
function reverseDigitsStr(num, base, len) {
    if(len === 0) return '0';
    let str = num.toString(base).padStart(len,'0').split('').reverse().join('');
    return str.replace(/^0+/,'') || '0';
}

// ======================= 矩形编码/解码 =======================

/**
 * 将矩形编码为新存储格式: (xrev+a^n)(yrev+b^m)
 * @param {Object} r - 矩形对象 {id, n, m, x, y}
 * @returns {string} 编码后的字符串
 */
function encodeRectToString(r){
    const n = r.n, m = r.m;
    const modA = Math.pow(BASE_A, n);
    const modB = Math.pow(BASE_B, m);
    const xi = Math.round(r.x * modA);
    const yi = Math.round(r.y * modB);
    const xrev = reverseDigits(xi, BASE_A, n);
    const yrev = reverseDigits(yi, BASE_B, m);
    return `(${xrev}+${BASE_A}^${n})(${yrev}+${BASE_B}^${m})`;
}

/**
 * 序列化所有矩形为字符串
 * @returns {string} 所有矩形的编码字符串，用逗号分隔
 */
function serializeRects(){ 
    return rectangles.map(encodeRectToString).join(','); 
}

/**
 * 解析矩形编码字符串（支持新格式和兼容旧格式）
 * @param {string} entry - 编码字符串
 * @returns {Object|null} 解析后的矩形对象 {n, m, x, y} 或 null（解析失败）
 */
function parseEntryString(entry){
    entry = entry.trim();
    
    // 新格式: (数字+底数^指数)(数字+底数^指数)
    let newMatch = entry.match(/^\((\d+)\+(\d+)\^(\d+)\)\((\d+)\+(\d+)\^(\d+)\)$/);
    if(newMatch){
        let xrev = parseInt(newMatch[1],10);
        let baseA = parseInt(newMatch[2],10);
        let expA = parseInt(newMatch[3],10);
        let yrev = parseInt(newMatch[4],10);
        let baseB = parseInt(newMatch[5],10);
        let expB = parseInt(newMatch[6],10);
        
        if(baseA !== BASE_A || baseB !== BASE_B) return null;
        
        const n = expA, m = expB;
        const modA = Math.pow(BASE_A, n);
        const modB = Math.pow(BASE_B, m);
        const xi = reverseDigits(xrev, BASE_A, n);
        const yi = reverseDigits(yrev, BASE_B, m);
        const x = n===0 ? 0 : xi / modA;
        const y = m===0 ? 0 : yi / modB;
        
        if(x<0 || x>1 || y<0 || y>1) return null;
        return {n, m, x, y};
    }
    
    // 兼容旧格式1: (xrev+modAZ)(yrev+modBZ)
    let oldFormat1 = entry.match(/^\((\d+)\+(\d+)Z\)\((\d+)\+(\d+)Z\)$/);
    if(oldFormat1){
        let xrev=parseInt(oldFormat1[1],10), modA=parseInt(oldFormat1[2],10);
        let yrev=parseInt(oldFormat1[3],10), modB=parseInt(oldFormat1[4],10);
        
        let n=0, tmpA=modA;
        while(tmpA > 1 && tmpA % BASE_A === 0){ tmpA /= BASE_A; n++; }
        if(tmpA !== 1) return null;
        
        let m=0, tmpB=modB;
        while(tmpB > 1 && tmpB % BASE_B === 0){ tmpB /= BASE_B; m++; }
        if(tmpB !== 1) return null;
        
        if(modA !== Math.pow(BASE_A, n) || modB !== Math.pow(BASE_B, m)) return null;
        
        const xi = reverseDigits(xrev, BASE_A, n);
        const yi = reverseDigits(yrev, BASE_B, m);
        const x = n===0 ? 0 : xi / modA;
        const y = m===0 ? 0 : yi / modB;
        
        return {n, m, x, y};
    }
    
    // 兼容旧格式2: t+MZ (CRT格式，仅当BASE_A=2且BASE_B=3时)
    let oldCRT = entry.match(/^(\d+)\+(\d+)Z$/);
    if(oldCRT && BASE_A===2 && BASE_B===3){
        const t=parseInt(oldCRT[1],10), M=parseInt(oldCRT[2],10);
        let tmp=M, n=0, m=0;
        
        while(tmp % 2 === 0){ n++; tmp/=2; }
        while(tmp % 3 === 0){ m++; tmp/=3; }
        if(tmp !== 1) return null;
        
        const modA = Math.pow(2, n), modB = Math.pow(3, m);
        const xrev = modA===1 ? 0 : (t % modA);
        const yrev = modB===1 ? 0 : (t % modB);
        const xi = reverseDigits(xrev, 2, n);
        const yi = reverseDigits(yrev, 3, m);
        const x = n===0 ? 0 : xi / modA;
        const y = m===0 ? 0 : yi / modB;
        
        return {n, m, x, y};
    }
    
    return null;
}

// ======================= 矩阵网格绘制 =======================

/**
 * 绘制右侧矩阵网格
 */
function drawMatrixGrid() {
    if (!matrixCtx) return;
    
    const w = CELL_SIZE, h = CELL_SIZE;
    matrixCtx.clearRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    
    for (let m = 0; m < gridSize; m++) {
        for (let n = 0; n < gridSize; n++) {
            const x = n * w, y = m * h;
            const count = getRectCount(n, m);
            const isSelected = (currentShape.n === n && currentShape.m === m);
            
            // 背景色: 基于次数灰度，选中时覆盖一层淡黄
            let bgColor = getCountColor(count);
            matrixCtx.fillStyle = bgColor;
            matrixCtx.fillRect(x, y, w-0.5, h-0.5);
            
            if(isSelected && count===0) {
                // 未使用时选中高亮
                matrixCtx.fillStyle = '#ffe5b4';
                matrixCtx.fillRect(x, y, w-0.5, h-0.5);
            } else if(isSelected && count>0) {
                // 已使用时选中叠加半透黄
                matrixCtx.fillStyle = 'rgba(255,229,180,0.6)';
                matrixCtx.fillRect(x, y, w-0.5, h-0.5);
            }
            
            // 边框颜色与左侧一致
            matrixCtx.strokeStyle = getRectBorderColor(n, m);
            matrixCtx.lineWidth = 1.5;
            matrixCtx.strokeRect(x+0.5, y+0.5, w-1, h-1);
            
            // 显示次数数字
            if(count > 0) {
                matrixCtx.font = 'bold 12px "Segoe UI", monospace';
                matrixCtx.fillStyle = count >= 3 ? '#fff' : '#333';
                matrixCtx.textAlign = 'center';
                matrixCtx.textBaseline = 'middle';
                matrixCtx.fillText(count.toString(), x + w/2, y + h/2);
            }
            // 未选中且0次，不显示文字保持干净
        }
    }
}

/**
 * 调整矩阵画布大小并重绘
 */
function resizeMatrixCanvas() {
    const width = gridSize * CELL_SIZE, height = gridSize * CELL_SIZE;
    matrixCanvas.width = width; 
    matrixCanvas.height = height;
    matrixCanvas.style.width = width + 'px'; 
    matrixCanvas.style.height = height + 'px';
    drawMatrixGrid();
}

/**
 * 刷新矩阵网格（公开接口）
 */
function refreshMatrixGrid() { 
    resizeMatrixCanvas(); 
}

/**
 * 矩阵画布点击事件处理
 * @param {MouseEvent} e - 鼠标事件
 */
function onMatrixClick(e) {
    const rect = matrixCanvas.getBoundingClientRect();
    const scaleX = matrixCanvas.width / rect.width;
    const scaleY = matrixCanvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    if (mouseX < 0 || mouseY < 0) return;
    
    const col = Math.floor(mouseX / CELL_SIZE);
    const row = Math.floor(mouseY / CELL_SIZE);
    
    if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
        // 允许选中任何形状，不限次数（可以重复放置）
        currentShape = { 
            n: col, 
            m: row, 
            w: getRectWidth(col), 
            h: getRectHeight(row) 
        };
        selectedId = null;
        isDragging = false;
        drawAll();
        drawMatrixGrid();
    }
}

// ======================= 计数和覆盖率计算 =======================

/**
 * 更新元素计数和覆盖率
 */
function updateCount(){
    countSpan.innerText = rectangles.length;
    updateTextareaFromRects();
    updateCoverage();
    refreshMatrixGrid();
}

/**
 * 计算并更新覆盖率显示
 */
function updateCoverage(){
    const covEl = document.getElementById('coverage');
    if(!covEl) return;
    
    /**
     * 计算矩形集合的并集面积
     * @param {Array} rects - 矩形数组
     * @returns {number} 并集面积
     */
    function computeUnionArea(rects){
        if(!rects.length) return 0;
        
        // 收集所有x坐标边界
        const xs = new Set();
        rects.forEach(r => { 
            xs.add(r.x); 
            xs.add(r.x + getRectWidth(r.n)); 
        });
        
        const xsArr = Array.from(xs).sort((a,b) => a-b);
        let area = 0;
        
        // 扫描线算法计算面积
        for(let i = 0; i < xsArr.length-1; i++){
            const x0 = xsArr[i], x1 = xsArr[i+1], dx = x1-x0;
            if(dx <= 0) continue;
            
            const intervals = [];
            rects.forEach(r => {
                const rx0 = r.x, rx1 = r.x + getRectWidth(r.n);
                if(rx1 <= x0 || rx0 >= x1) return;
                intervals.push([r.y, r.y + getRectHeight(r.m)]);
            });
            
            if(!intervals.length) continue;
            
            // 合并y轴区间
            intervals.sort((a,b) => a[0]-b[0]);
            let mergedStart = intervals[0][0], mergedEnd = intervals[0][1], coveredY = 0;
            
            for(let k = 1; k < intervals.length; k++){
                const s = intervals[k][0], e = intervals[k][1];
                if(s <= mergedEnd) {
                    mergedEnd = Math.max(mergedEnd, e);
                } else {
                    coveredY += Math.max(0, mergedEnd - mergedStart);
                    mergedStart = s;
                    mergedEnd = e;
                }
            }
            coveredY += Math.max(0, mergedEnd - mergedStart);
            area += dx * coveredY;
        }
        
        return Math.min(area, 1); // 面积不超过1
    }
    
    const area = computeUnionArea(rectangles);
    covEl.innerText = '覆盖率: ' + (area*100).toFixed(2) + '%';
}

// ======================= 精细网格和坐标轴标签 =======================

/**
 * 计算数字k在基数p下的幂次（用于确定网格线粗细）
 * @param {number} k - 数字
 * @param {number} p - 基数
 * @param {number} max - 最大幂次
 * @returns {number} 幂次
 */
function vPow(k,p,max){
    if(k===0) return max;
    let v=0;
    while(k%p===0){ k/=p; v++; }
    return v>max ? max : v;
}

/**
 * 绘制精细网格（基于当前缩放级别）
 */
function drawFineGrid(){
    const viewWidth = 1/viewport.scale, viewHeight = 1/viewport.scale;
    
    // 计算垂直网格线级别（基数3）
    let hLevel = 0;
    if(viewHeight > 0){
        const maxLinesInView = 100;
        let temp = 1;
        while(temp * viewHeight <= maxLinesInView && hLevel < 12){ 
            hLevel++; 
            temp *= 3; 
        }
        if(temp * viewHeight > maxLinesInView && hLevel > 0){ 
            hLevel--; 
            temp /= 3; 
        }
    }
    
    // 计算水平网格线级别（基数2）
    let vLevel = 0;
    if(viewWidth > 0){
        const maxLinesInView = 100;
        let temp = 1;
        while(temp * viewWidth <= maxLinesInView && vLevel < 16){ 
            vLevel++; 
            temp *= 2; 
        }
        if(temp * viewWidth > maxLinesInView && vLevel > 0){ 
            vLevel--; 
            temp /= 2; 
        }
    }
    
    const H = 3**hLevel, V = 2**vLevel;
    
    ctx.save();
    ctx.lineWidth = 0.5;
    
    // 绘制垂直网格线（y方向，基数3）
    const logicalYStart = viewport.y, logicalYEnd = viewport.y + viewHeight;
    const kStartY = Math.floor(logicalYStart * H), kEndY = Math.ceil(logicalYEnd * H);
    
    for(let k = Math.max(0, kStartY); k <= Math.min(H-1, kEndY); k++){
        let yFrac = k / H;
        let logicalY = yFrac;
        let canvasPos = logicalToCanvas(0, logicalY);
        let cy = canvasPos.y;
        
        if(cy < 0 || cy > 500) continue;
        
        let v = vPow(k, 3, hLevel);
        let alpha = 0.03 + (v / hLevel) * 0.22;
        alpha *= Math.min(1, viewport.scale / 2);
        
        ctx.strokeStyle = 'rgba(0,0,0,' + alpha + ')';
        ctx.beginPath();
        ctx.moveTo(0, Math.round(cy) + 0.5);
        ctx.lineTo(500, Math.round(cy) + 0.5);
        ctx.stroke();
    }
    
    // 绘制水平网格线（x方向，基数2）
    const logicalXStart = viewport.x, logicalXEnd = viewport.x + viewWidth;
    const kStartX = Math.floor(logicalXStart * V), kEndX = Math.ceil(logicalXEnd * V);
    
    for(let k = Math.max(0, kStartX); k <= Math.min(V-1, kEndX); k++){
        let xFrac = k / V;
        let logicalX = xFrac;
        let canvasPos = logicalToCanvas(logicalX, 0);
        let cx = canvasPos.x;
        
        if(cx < 0 || cx > 500) continue;
        
        let v = vPow(k, 2, vLevel);
        let alpha = 0.03 + (v / vLevel) * 0.22;
        alpha *= Math.min(1, viewport.scale / 2);
        
        ctx.strokeStyle = 'rgba(0,0,0,' + alpha + ')';
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) + 0.5, 0);
        ctx.lineTo(Math.round(cx) + 0.5, 500);
        ctx.stroke();
    }
    
    ctx.restore();
}

/**
 * 二进制数字反转字符串
 * @param {number} num - 要反转的数字
 * @param {number} n - 数字长度（位数）
 * @returns {string} 反转后的二进制字符串
 */
function reverseBinaryStr(num, n){
    if(n === 0) return '0';
    let str = num.toString(2).padStart(n, '0').split('').reverse().join('');
    return str.replace(/^0+/, '') || '0';
}

/**
 * 任意进制数字反转字符串
 * @param {number} num - 要反转的数字
 * @param {number} base - 进制基数
 * @param {number} len - 数字长度（位数）
 * @returns {string} 反转后的字符串
 */
function reverseBaseDigitsStr(num, base, len){
    if(len === 0) return '0';
    let str = num.toString(base).padStart(len, '0').split('').reverse().join('');
    return str.replace(/^0+/, '') || '0';
}

/**
 * 更新坐标轴标签
 */
function updateAxisLabels(){
    const yAxis = document.getElementById('y-axis-labels');
    const xAxis = document.getElementById('x-axis-labels');
    if(!yAxis || !xAxis) return;
    
    const viewWidth = 1/viewport.scale, viewHeight = 1/viewport.scale;
    
    // 计算垂直网格线级别（基数3）
    let hLevel = 0;
    if(viewHeight > 0){
        const maxLinesInView = 100;
        let temp = 1;
        while(temp * viewHeight <= maxLinesInView && hLevel < 12){ 
            hLevel++; 
            temp *= 3; 
        }
        if(temp * viewHeight > maxLinesInView && hLevel > 0){ 
            hLevel--; 
            temp /= 3; 
        }
    }
    
    // 计算水平网格线级别（基数2）
    let vLevel = 0;
    if(viewWidth > 0){
        const maxLinesInView = 100;
        let temp = 1;
        while(temp * viewWidth <= maxLinesInView && vLevel < 16){ 
            vLevel++; 
            temp *= 2; 
        }
        if(temp * viewWidth > maxLinesInView && vLevel > 0){ 
            vLevel--; 
            temp /= 2; 
        }
    }
    
    const H = 3**hLevel, V = 2**vLevel;
    
    // 更新Y轴标签
    yAxis.innerHTML = '';
    const logicalYStart = viewport.y, logicalYEnd = viewport.y + viewHeight;
    const kStartY = Math.floor(logicalYStart * H), kEndY = Math.ceil(logicalYEnd * H);
    
    let yCandidates = [];
    for(let k = Math.max(0, kStartY); k <= Math.min(H-1, kEndY); k++){
        let yFrac = k / H;
        let logicalY = yFrac;
        let canvasPos = logicalToCanvas(0, logicalY);
        let cy = canvasPos.y;
        
        if(cy < 10 || cy > 490) continue;
        
        let v = vPow(k, 3, hLevel);
        let label = reverseBaseDigitsStr(k, 3, hLevel);
        yCandidates.push({k, cy, v, label});
    }
    
    // 按标签长度排序，优先显示短标签
    yCandidates.sort((a,b) => a.label.length - b.label.length);
    
    for(let len = 1, cnt = 0, i = 0, j = 0; len < 8; len++){
        for(; yCandidates[j]?.label.length === len; j++){
            if(j >= 10){ j = i; break; }
        }
        for(; i < j; i++){
            let cand = yCandidates[i];
            let span = document.createElement('span');
            span.className = 'axis-label';
            span.textContent = cand.label;
            span.style.top = (cand.cy - 6) + 'px';
            yAxis.appendChild(span);
        }
    }
    
    // 更新X轴标签
    xAxis.innerHTML = '';
    const logicalXStart = viewport.x, logicalXEnd = viewport.x + viewWidth;
    const kStartX = Math.floor(logicalXStart * V), kEndX = Math.ceil(logicalXEnd * V);
    
    let xCandidates = [];
    for(let k = Math.max(0, kStartX); k <= Math.min(V-1, kEndX); k++){
        let xFrac = k / V;
        let logicalX = xFrac;
        let canvasPos = logicalToCanvas(logicalX, 0);
        let cx = canvasPos.x;
        
        if(cx < 10 || cx > 490) continue;
        
        let v = vPow(k, 2, vLevel);
        let label = reverseBinaryStr(k, vLevel);
        xCandidates.push({k, cx, v, label});
    }
    
    // 按标签长度排序，优先显示短标签
    xCandidates.sort((a,b) => a.label.length - b.label.length);
    
    for(let len = 1, cnt = 0, i = 0, j = 0; len < 8; len++){
        for(; xCandidates[j]?.label.length === len; j++){
            if(j >= 10){ j = i; break; }
        }
        for(; i < j; i++){
            let cand = xCandidates[i];
            let span = document.createElement('span');
            span.className = 'axis-label';
            span.textContent = cand.label;
            span.style.left = (cand.cx - 5) + 'px';
            span.style.transform = 'translateX(-50%)';
            xAxis.appendChild(span);
        }
    }
}

// ======================= 坐标转换函数 =======================

/**
 * 逻辑坐标转换为画布坐标
 * @param {number} logicalX - 逻辑X坐标
 * @param {number} logicalY - 逻辑Y坐标
 * @returns {Object} 画布坐标 {x, y}
 */
function logicalToCanvas(logicalX, logicalY){
    const canvasX = (logicalX - viewport.x) * viewport.scale * 500;
    const canvasY = 500 - (logicalY - viewport.y) * viewport.scale * 500;
    return {x: canvasX, y: canvasY};
}

/**
 * 画布坐标转换为逻辑坐标
 * @param {number} canvasX - 画布X坐标
 * @param {number} canvasY - 画布Y坐标
 * @returns {Object} 逻辑坐标 {x, y}
 */
function canvasToLogical(canvasX, canvasY){
    const logicalX = viewport.x + (canvasX / 500) / viewport.scale;
    const logicalY = viewport.y + (1 - canvasY / 500) / viewport.scale;
    return {x: logicalX, y: logicalY};
}

/**
 * 限制视口范围，防止越界
 */
function clampViewport(){
    const viewWidth = 1/viewport.scale, viewHeight = 1/viewport.scale;
    
    if(viewport.x < 0) viewport.x = 0;
    if(viewport.x + viewWidth > 1) viewport.x = 1 - viewWidth;
    if(viewport.y < 0) viewport.y = 0;
    if(viewport.y + viewHeight > 1) viewport.y = 1 - viewHeight;
    
    // 如果视图比整个区域大，则居中显示
    if(viewWidth > 1) viewport.x = (1 - viewWidth) / 2;
    if(viewHeight > 1) viewport.y = (1 - viewHeight) / 2;
}

// ======================= 矩形绘制函数 =======================

/**
 * 绘制单个矩形
 * @param {Object} r - 矩形对象
 * @param {boolean} isSelected - 是否被选中
 */
function drawRect(r, isSelected){
    const {n, m, x, y} = r;
    const wLog = getRectWidth(n), hLog = getRectHeight(m);
    
    const topLeft = logicalToCanvas(x, y + hLog);
    const bottomRight = logicalToCanvas(x + wLog, y);
    const canvasW = bottomRight.x - topLeft.x, canvasH = bottomRight.y - topLeft.y;
    
    if(isSelected){
        // 选中状态：黄色半透明填充，深色边框
        ctx.fillStyle = 'rgba(255,240,160,0.5)';
        ctx.fillRect(topLeft.x, topLeft.y, canvasW, canvasH);
        ctx.strokeStyle = 'rgba(180,120,30,0.8)';
        ctx.lineWidth = 2;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, canvasW - 2, canvasH - 2);
        ctx.restore();
    } else {
        // 未选中状态：灰色半透明填充，彩色边框
        ctx.fillStyle = 'rgba(150,150,150,0.6)';
        ctx.fillRect(topLeft.x, topLeft.y, canvasW, canvasH);
        ctx.strokeStyle = `hsla(${(n * 37 + m * 73) % 360}, 80%, 60%, 0.8)`;
        ctx.lineWidth = 2;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, canvasW - 2, canvasH - 2);
        ctx.restore();
    }
}

/**
 * 绘制所有内容（主绘制函数）
 */
function drawAll(){
    // 清空画布
    ctx.clearRect(0, 0, 500, 500);
    
    // 绘制精细网格
    drawFineGrid();
    
    // 分离选中和未选中的矩形
    let selectedRect = rectangles.find(r => r.id === selectedId);
    let otherRects = rectangles.filter(r => r.id !== selectedId);
    
    // 先绘制未选中的矩形
    otherRects.forEach(r => drawRect(r, false));
    
    // 再绘制选中的矩形（确保在最上层）
    if(selectedRect) drawRect(selectedRect, true);
    
    // 绘制画布边框
    ctx.strokeStyle = '#1f3b4f';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 500, 500);
    
    // 更新坐标轴标签和滚动条
    updateAxisLabels();
    updateScrollbars();
}

/**
 * 更新滚动条位置
 */
function updateScrollbars(){
    if(!scrollbarHorizontal || !scrollbarVertical) return;
    
    const viewWidth = 1/viewport.scale, viewHeight = 1/viewport.scale;
    const trackWidth = 500, trackHeight = 500;
    
    // 计算水平滚动条
    const thumbWidth = Math.max(20, viewWidth * trackWidth);
    const maxThumbX = trackWidth - thumbWidth;
    const thumbX = viewport.x * trackWidth;
    
    // 计算垂直滚动条（注意Y坐标方向）
    const thumbHeight = Math.max(20, viewHeight * trackHeight);
    const maxThumbY = trackHeight - thumbHeight;
    const thumbY = trackHeight * (1 - viewport.y - viewHeight);
    
    // 应用样式
    scrollbarHorizontal.style.width = thumbWidth + 'px';
    scrollbarHorizontal.style.left = Math.min(maxThumbX, Math.max(0, thumbX)) + 'px';
    
    scrollbarVertical.style.height = thumbHeight + 'px';
    scrollbarVertical.style.top = Math.min(maxThumbY, Math.max(0, thumbY)) + 'px';
}

// ======================= 矩形操作函数 =======================

/**
 * 查找指定画布坐标处的矩形
 * @param {number} px - 画布X坐标
 * @param {number} py - 画布Y坐标
 * @returns {Array} 矩形数组（从顶层到底层）
 */
function findRectsAt(px, py){
    let logical = canvasToLogical(px, py);
    return rectangles.filter(r => {
        let w = getRectWidth(r.n), h = getRectHeight(r.m);
        return logical.x >= r.x && logical.x <= r.x + w && 
               logical.y >= r.y && logical.y <= r.y + h;
    }).reverse(); // 反转数组，使顶层矩形在前
}

/**
 * 添加新矩形
 * @param {number} n - 宽度指数
 * @param {number} m - 高度指数
 * @param {number} x - 逻辑X坐标
 * @param {number} y - 逻辑Y坐标
 * @param {boolean} autoSelect - 是否自动选中新矩形
 * @returns {number} 1表示成功，0表示失败
 */
function addRectangle(n, m, x, y, autoSelect = true){
    let w = getRectWidth(n), h = getRectHeight(m);
    
    // 检查边界
    if(x < 0 || y < 0 || x + w > 1 || y + h > 1) return 0;
    
    let id = nextId++;
    rectangles.push({id, n, m, x, y});
    
    if(autoSelect) selectedId = id;
    
    updateCount(); 
    drawAll();
    
    // 不清空 currentShape，允许连续放置相同形状
    refreshMatrixGrid();
    return 1;
}

/**
 * 移动矩形
 * @param {number} id - 矩形ID
 * @param {number} nx - 新的逻辑X坐标
 * @param {number} ny - 新的逻辑Y坐标
 * @param {boolean} saveHistory - 是否保存到历史记录
 */
function moveRect(id, nx, ny, saveHistory = true){
    let r = rectangles.find(r => r.id === id); 
    if(!r) return;
    
    let w = getRectWidth(r.n), h = getRectHeight(r.m);
    if(nx < 0 || ny < 0 || nx + w > 1 || ny + h > 1) return;
    
    r.x = nx; 
    r.y = ny; 
    drawAll();
    
    if(saveHistory) updateTextareaFromRects();
    updateCoverage(); 
    refreshMatrixGrid();
}

/**
 * 删除选中的矩形
 */
function deleteSelected(){
    if(selectedId !== null){
        rectangles = rectangles.filter(r => r.id !== selectedId);
        selectedId = null; 
        isDragging = false;
        updateCount(); 
        drawAll(); 
        refreshMatrixGrid();
    }
}

/**
 * 清除所有矩形
 */
function clearAll(){
    rectangles = []; 
    selectedId = null; 
    isDragging = false;
    updateCount(); 
    drawAll(); 
    refreshMatrixGrid();
    
    // 重置当前形状为默认值
    currentShape = { n:0, m:0, w:getRectWidth(0), h:getRectHeight(0) };
    drawMatrixGrid();
}

// ======================= 文本区域和历史记录 =======================

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

// ======================= 参数管理 =======================

/**
 * 使用新参数重新初始化
 */
function reinitWithNewParams(){
    rectangles = []; 
    selectedId = null; 
    isDragging = false;
    currentShape = { n:0, m:0, w:getRectWidth(0), h:getRectHeight(0) };
    viewport = {x:0, y:0, scale:1};
    nextId = 0;
    
    drawAll();
    updateCount();
    refreshMatrixGrid();
    
    textareaHistory = []; 
    historyIndex = -1;
    
    const ta = document.getElementById('rect-textarea');
    if(ta){
        suppressTextarea = true;
        ta.value = '';
        suppressTextarea = false;
        saveToHistory('');
    }
}

/**
 * 应用新参数（底数a和b）
 */
function applyNewParams(){
    let newA = parseInt(document.getElementById('paramA').value, 10);
    let newB = parseInt(document.getElementById('paramB').value, 10);
    
    // 验证输入
    if(isNaN(newA) || newA < 2) newA = 2;
    if(isNaN(newB) || newB < 2) newB = 3;
    if(newA > 10) newA = 10; 
    if(newB > 10) newB = 10;
    
    // 如果参数没有变化，直接返回
    if(BASE_A === newA && BASE_B === newB) return;
    
    // 更新全局参数
    BASE_A = newA; 
    BASE_B = newB;
    
    // 重新初始化
    reinitWithNewParams();
}

// ======================= 事件处理函数 =======================

/**
 * 主画布鼠标按下事件处理
 * @param {MouseEvent} e - 鼠标事件
 */
canvas.addEventListener('mousedown', e => {
    let r = canvas.getBoundingClientRect();
    let s = canvas.width / r.width;
    let x = (e.clientX - r.left) * s;
    let y = (e.clientY - r.top) * s;
    
    const isCtrlOrShift = e.ctrlKey || e.shiftKey;
    
    // 记录鼠标按下状态
    downPos = {x: e.clientX, y: e.clientY}; 
    hasMoved = false; 
    clickSuppressed = false;
    hadSelectionBeforeClick = selectedId !== null; 
    clickedInSelectedAtDown = false;
    
    // 检查是否点击在选中的矩形内
    if(selectedId !== null){
        let sr = rectangles.find(r => r.id === selectedId);
        if(sr){
            let lp = canvasToLogical(x, y);
            let w = getRectWidth(sr.n), h = getRectHeight(sr.m);
            clickedInSelectedAtDown = (lp.x >= sr.x && lp.x <= sr.x + w && lp.y >= sr.y && lp.y <= sr.y + h);
        }
    }
    
    // 如果点击在画布外，取消选择
    if(x < 0 || x > 500 || y < 0 || y > 500){ 
        selectedId = null; 
        drawAll(); 
        return; 
    }
    
    // Ctrl/Shift键：进入平移模式
    if(isCtrlOrShift){ 
        isPanning = true; 
        panStart.x = e.clientX; 
        panStart.y = e.clientY; 
        viewportStart.x = viewport.x; 
        viewportStart.y = viewport.y; 
        e.preventDefault(); 
        return; 
    }
    
    // 如果有选中的形状（非默认形状）
    let hasButtonSelected = currentShape && !(currentShape.n === 0 && currentShape.m === 0);
    
    if(hasButtonSelected){
        let {n, m, w: hw, h: hh} = currentShape;
        let lp = canvasToLogical(x, y);
        
        // 计算网格对齐的位置
        let stepsX = Math.pow(BASE_A, n), stepsY = Math.pow(BASE_B, m);
        let gridX = Math.floor(lp.x * stepsX) / stepsX;
        let gridY = Math.floor(lp.y * stepsY) / stepsY;
        
        // 限制边界
        gridX = Math.max(0, Math.min(1 - hw, gridX));
        gridY = Math.max(0, Math.min(1 - hh, gridY));
        
        // 添加矩形并进入拖拽模式
        if(addRectangle(n, m, gridX, gridY, true)){
            isDragging = true;
            let newRect = rectangles.find(r => r.id === selectedId);
            if(newRect){ 
                dragOffset.x = lp.x - newRect.x; 
                dragOffset.y = lp.y - newRect.y; 
            }
        }
        
        drawAll(); 
        e.preventDefault();
    } else {
        // 没有选中形状：检查是否点击在矩形上
        let overlapped = findRectsAt(x, y);
        
        if(overlapped.length){
            let clickedInSelected = false;
            
            // 检查是否点击在已选中的矩形上
            if(selectedId !== null){
                let sr = rectangles.find(r => r.id === selectedId);
                if(sr){
                    let lp = canvasToLogical(x, y);
                    let w = getRectWidth(sr.n), h = getRectHeight(sr.m);
                    clickedInSelected = (lp.x >= sr.x && lp.x <= sr.x + w && lp.y >= sr.y && lp.y <= sr.y + h);
                }
            }
            
            if(selectedId === null || !clickedInSelected){
                // 选择新矩形
                selectedId = overlapped[0].id; 
                isDragging = true;
                let lp = canvasToLogical(x, y); 
                dragOffset.x = lp.x - overlapped[0].x; 
                dragOffset.y = lp.y - overlapped[0].y;
            } else {
                // 继续拖拽已选中的矩形
                isDragging = true;
                let lp = canvasToLogical(x, y);
                let sr = rectangles.find(r => r.id === selectedId);
                if(sr){ 
                    dragOffset.x = lp.x - sr.x; 
                    dragOffset.y = lp.y - sr.y; 
                }
            }
            
            drawAll(); 
            e.preventDefault();
        } else {
            // 点击空白处：取消选择
            selectedId = null; 
            drawAll();
            
            if(!currentShape) return;
            let {n, m, w: hw, h: hh} = currentShape;
            if(n === 0 && m === 0) return;
            
            // 在空白处添加新矩形
            let lp = canvasToLogical(x, y);
            let stepsX = Math.pow(BASE_A, n), stepsY = Math.pow(BASE_B, m);
            let gridX = Math.floor(lp.x * stepsX) / stepsX;
            let gridY = Math.floor(lp.y * stepsY) / stepsY;
            
            gridX = Math.max(0, Math.min(1 - hw, gridX));
            gridY = Math.max(0, Math.min(1 - hh, gridY));
            
            addRectangle(n, m, gridX, gridY, true);
        }
    }
});

/**
 * 全局鼠标移动事件处理
 */
document.addEventListener('mousemove', e => {
    // 检测鼠标是否移动（用于区分点击和拖拽）
    if(downPos){
        const dx = Math.abs(e.clientX - downPos.x), dy = Math.abs(e.clientY - downPos.y);
        if(dx > 4 || dy > 4){ 
            clickSuppressed = true; 
            hasMoved = true; 
        }
    }
    
    // 平移模式处理
    if(isPanning){
        e.preventDefault();
        const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
        const logicalDx = -dx / (500 * viewport.scale);
        const logicalDy = dy / (500 * viewport.scale);
        
        viewport.x = viewportStart.x + logicalDx;
        viewport.y = viewportStart.y + logicalDy;
        
        clampViewport(); 
        drawAll();
        return;
    }
    
    // 矩形拖拽处理
    if(!isDragging || selectedId === null) return;
    
    e.preventDefault();
    let r = canvas.getBoundingClientRect();
    let s = canvas.width / r.width;
    let x = (e.clientX - r.left) * s;
    let y = (e.clientY - r.top) * s;
    
    let rr = rectangles.find(r => r.id === selectedId);
    if(!rr) return;
    
    let lp = canvasToLogical(x, y);
    let targetX = lp.x - dragOffset.x;
    let targetY = lp.y - dragOffset.y;
    
    // 网格对齐
    let stepsX = Math.pow(BASE_A, rr.n), stepsY = Math.pow(BASE_B, rr.m);
    let alignedX = Math.round(targetX * stepsX) / stepsX;
    let alignedY = Math.round(targetY * stepsY) / stepsY;
    
    // 边界检查
    let w = getRectWidth(rr.n), h = getRectHeight(rr.m);
    alignedX = Math.max(0, Math.min(1 - w, alignedX));
    alignedY = Math.max(0, Math.min(1 - h, alignedY));
    
    // 移动矩形（不保存历史记录，等待鼠标释放）
    moveRect(rr.id, alignedX, alignedY, false);
});

/**
 * 全局鼠标释放事件处理
 */
document.addEventListener('mouseup', () => {
    // 处理点击选中矩形的循环选择
    if(!hasMoved && downPos && selectedId !== null && hadSelectionBeforeClick && clickedInSelectedAtDown){
        let r = canvas.getBoundingClientRect();
        let s = canvas.width / r.width;
        let x = (downPos.x - r.left) * s;
        let y = (downPos.y - r.top) * s;
        
        if(x >= 0 && x <= 500 && y >= 0 && y <= 500){
            let overlapped = findRectsAt(x, y);
            if(overlapped.length > 1){
                let idx = overlapped.findIndex(rr => rr.id === selectedId);
                if(idx !== -1){
                    // 循环选择重叠的矩形
                    selectedId = overlapped[(idx + 1) % overlapped.length].id;
                }
            }
        }
    }
    
    // 重置所有状态
    isDragging = false; 
    isPanning = false; 
    downPos = null; 
    hasMoved = false;
    hadSelectionBeforeClick = false; 
    clickedInSelectedAtDown = false;
    
    drawAll();
    
    // 如果选中了矩形，更新文本区域
    if(selectedId !== null) updateTextareaFromRects();
});

/**
 * 画布滚轮事件处理（缩放）
 */
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    
    const zoomSpeed = 0.1;
    const mouseX = e.clientX - canvas.getBoundingClientRect().left;
    const mouseY = e.clientY - canvas.getBoundingClientRect().top;
    
    // 缩放前的逻辑坐标
    const logicalBefore = canvasToLogical(mouseX, mouseY);
    
    // 计算缩放因子
    let zoomFactor = e.deltaY < 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
    viewport.scale *= zoomFactor;
    
    // 限制缩放范围
    if(viewport.scale < MIN_SCALE) viewport.scale = MIN_SCALE;
    if(viewport.scale > MAX_SCALE) viewport.scale = MAX_SCALE;
    
    // 缩放后的逻辑坐标
    const logicalAfter = canvasToLogical(mouseX, mouseY);
    
    // 调整视口以保持鼠标位置不变
    viewport.x += logicalBefore.x - logicalAfter.x;
    viewport.y += logicalBefore.y - logicalAfter.y;
    
    clampViewport(); 
    drawAll();
});

/**
 * 防止画布默认拖拽行为
 */
canvas.addEventListener('dragstart', e => e.preventDefault());

/**
 * 键盘事件处理
 */
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    
    // D键：删除选中的矩形
    if(k === 'd' && selectedId !== null){ 
        deleteSelected(); 
        e.preventDefault(); 
    }
    
    // Ctrl+Z：撤销
    if(e.ctrlKey){ 
        if(k === 'z'){ 
            performUndo(); 
            e.preventDefault(); 
        } 
        // Ctrl+Y：重做
        else if(k === 'y'){ 
            performRedo(); 
            e.preventDefault(); 
        } 
    }
});

// ======================= 按钮事件绑定 =======================

/**
 * 清除所有按钮事件
 */
document.getElementById('clear').addEventListener('click', clearAll);

/**
 * 删除按钮事件
 */
document.getElementById('del').addEventListener('click', deleteSelected);

/**
 * 使用说明按钮事件
 */
document.getElementById('usage').addEventListener('click', () => {
    window.open('https://github.com/Naszt/covering_system/blob/main/USAGE_GUIDE.md', '_blank');
});

/**
 * 增加网格大小按钮事件
 */
document.getElementById('grid-increase').addEventListener('click', () => { 
    if(gridSize < GRID_LIMIT_MAX){ 
        gridSize++; 
        selectedId = null; 
        isDragging = false; 
        updateGridSizeDisplay(); 
        refreshMatrixGrid(); 
        drawAll(); 
    } 
});

/**
 * 减少网格大小按钮事件
 */
document.getElementById('grid-decrease').addEventListener('click', () => { 
    if(gridSize > 1){ 
        gridSize--; 
        selectedId = null; 
        isDragging = false; 
        updateGridSizeDisplay(); 
        refreshMatrixGrid(); 
        drawAll(); 
    } 
});

/**
 * 矩阵面板滚轮事件（Shift+滚轮调整网格大小）
 */
document.querySelector('.matrix').addEventListener('wheel', e => { 
    if(e.shiftKey){ 
        e.preventDefault(); 
        if(e.deltaY < 0 && gridSize < GRID_LIMIT_MAX){ 
            gridSize++; 
        } else if(e.deltaY > 0 && gridSize > 1){ 
            gridSize--; 
        } 
        updateGridSizeDisplay(); 
        refreshMatrixGrid(); 
        drawAll(); 
    } 
});

/**
 * 更新网格大小显示
 */
function updateGridSizeDisplay(){ 
    document.getElementById('grid-size').innerText = gridSize + '×' + gridSize; 
}

// ======================= 滚动条事件处理 =======================

/**
 * 水平滚动条滑块鼠标按下事件
 */
if(scrollbarHorizontal && scrollbarTrackHorizontal){
    scrollbarHorizontal.addEventListener('mousedown', e => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        isScrollingHorizontal = true; 
        scrollStartX = e.clientX; 
        thumbStartX = parseFloat(scrollbarHorizontal.style.left) || 0; 
    });
    
    /**
     * 水平滚动条轨道鼠标按下事件
     */
    scrollbarTrackHorizontal.addEventListener('mousedown', e => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        const trackRect = scrollbarTrackHorizontal.getBoundingClientRect(); 
        const clickX = e.clientX - trackRect.left; 
        const thumbWidth = parseFloat(scrollbarHorizontal.style.width) || 20; 
        const trackWidth = trackRect.width; 
        
        let targetLeft = clickX - thumbWidth / 2; 
        targetLeft = Math.max(0, Math.min(trackWidth - thumbWidth, targetLeft)); 
        
        viewport.x = targetLeft / 500; 
        clampViewport(); 
        drawAll(); 
    });
}

/**
 * 垂直滚动条滑块鼠标按下事件
 */
if(scrollbarVertical && scrollbarTrackVertical){
    scrollbarVertical.addEventListener('mousedown', e => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        isScrollingVertical = true; 
        scrollStartY = e.clientY; 
        thumbStartY = parseFloat(scrollbarVertical.style.top) || 0; 
    });
    
    /**
     * 垂直滚动条轨道鼠标按下事件
     */
    scrollbarTrackVertical.addEventListener('mousedown', e => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        const trackRect = scrollbarTrackVertical.getBoundingClientRect(); 
        const clickY = e.clientY - trackRect.top; 
        const thumbHeight = parseFloat(scrollbarVertical.style.height) || 20; 
        const trackHeight = trackRect.height; 
        
        let targetTop = clickY - thumbHeight / 2; 
        targetTop = Math.max(0, Math.min(trackHeight - thumbHeight, targetTop)); 
        
        const viewHeight = 1 / viewport.scale; 
        viewport.y = 1 - (targetTop / 500) - viewHeight; 
        clampViewport(); 
        drawAll(); 
    });
}

/**
 * 全局鼠标移动事件（滚动条拖拽）
 */
document.addEventListener('mousemove', e => {
    // 水平滚动条拖拽
    if(isScrollingHorizontal){ 
        e.preventDefault(); 
        const dx = e.clientX - scrollStartX; 
        const thumbWidth = parseFloat(scrollbarHorizontal.style.width) || 20; 
        let newLeft = thumbStartX + dx; 
        newLeft = Math.max(0, Math.min(500 - thumbWidth, newLeft)); 
        
        viewport.x = newLeft / 500; 
        clampViewport(); 
        drawAll(); 
    }
    
    // 垂直滚动条拖拽
    if(isScrollingVertical){ 
        e.preventDefault(); 
        const dy = e.clientY - scrollStartY; 
        const thumbHeight = parseFloat(scrollbarVertical.style.height) || 20; 
        let newTop = thumbStartY + dy; 
        newTop = Math.max(0, Math.min(500 - thumbHeight, newTop)); 
        
        const viewHeight = 1 / viewport.scale; 
        viewport.y = 1 - (newTop / 500) - viewHeight; 
        clampViewport(); 
        drawAll(); 
    }
});

/**
 * 全局鼠标释放事件（停止滚动条拖拽）
 */
document.addEventListener('mouseup', () => { 
    isScrollingHorizontal = false; 
    isScrollingVertical = false; 
});

// ======================= 初始化函数 =======================

/**
 * 应用程序初始化
 */
function init(){
    // 初始化矩阵网格
    refreshMatrixGrid();
    
    // 绑定矩阵画布点击事件
    matrixCanvas.addEventListener('click', onMatrixClick);
    
    // 绑定参数应用按钮事件
    document.getElementById('applyParams').addEventListener('click', applyNewParams);
    
    // 初始化文本区域
    const ta = document.getElementById('rect-textarea');
    const DEFAULT_LOAD = '(1+2^1)(0+3^1),(0+2^1)(1+3^1)';
    
    if(ta){
        // 绑定文本区域输入事件
        ta.addEventListener('input', debouncedParse);
        
        // 设置默认值
        suppressTextarea = true;
        ta.value = DEFAULT_LOAD;
        suppressTextarea = false;
        
        // 解析默认值
        parseTextareaAndLoad();
        
        // 保存到历史记录
        saveToHistory(ta.value);
    }
    
    // 更新网格大小显示
    updateGridSizeDisplay();
    
    // 初始绘制
    drawAll();
}

// ======================= 立即执行函数 =======================

// 使用IIFE封装代码，防止污染全局作用域
(function(){
    // 等待DOM加载完成后初始化
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
