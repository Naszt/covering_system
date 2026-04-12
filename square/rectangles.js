/* 
 * 覆盖系统可视化工具 - 矩形操作模块
 * 该文件负责矩形的查找、添加、移动、删除和清空操作
 */

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
  
  // 检查关卡限制
  if (!canAddRectangle(n, m)) {
    console.log(`无法添加矩形 (${n},${m})，已达到使用上限或被禁用`);
    return 0;
  }
  
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