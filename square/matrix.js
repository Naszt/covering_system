/* 
 * 覆盖系统可视化工具 - 矩阵网格模块
 * 该文件负责右侧矩阵网格的绘制、大小调整和点击事件处理
 */

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
 * 更新矩阵坐标轴标签
 */
function updateMatrixAxisLabels() {
  const yAxis = document.getElementById('matrix-y-axis-labels');
  const xAxis = document.getElementById('matrix-x-axis-labels');
  if (!yAxis || !xAxis) return;

  // 清空现有标签
  yAxis.innerHTML = '';
  xAxis.innerHTML = '';

  const cellSize = CELL_SIZE;
  const size = gridSize;

  // Y轴标签（左侧）
  for (let m = 0; m < size; m++) {
    const span = document.createElement('span');
    span.className = 'axis-label';
    span.textContent = (m+1).toString();
    // 垂直位置：每个单元格中心，使用transform垂直居中
    const top = m * cellSize + cellSize / 2;
    span.style.top = `${top}px`;
    span.style.transform = 'translateY(-50%)';
    yAxis.appendChild(span);
  }

  // X轴标签（上方）
  for (let n = 0; n < size; n++) {
    const span = document.createElement('span');
    span.className = 'axis-label';
    span.textContent = (n+1).toString();
    // 水平位置：每个单元格中心，使用transform水平居中
    const left = n * cellSize + cellSize / 2;
    span.style.left = `${left}px`;
    span.style.transform = 'translateX(-50%)';
    xAxis.appendChild(span);
  }
}

/**
 * 刷新矩阵网格（公开接口）
 */
function refreshMatrixGrid() {
  resizeMatrixCanvas();
  updateMatrixAxisLabels();
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