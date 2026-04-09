// ======================= 事件处理函数 =======================
// 本模块负责处理所有用户交互事件：鼠标、键盘、滚动条等

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