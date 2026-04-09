/* 
 * 覆盖系统可视化工具 - 核心模块
 * 该文件包含全局变量、配置、辅助函数和坐标转换
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

// 文本区域历史记录（用于撤销/重做）已移至 history.js 模块

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