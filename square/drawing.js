/* 
 * 覆盖系统可视化工具 - 绘制模块
 * 该文件负责精细网格、坐标轴标签、矩形绘制、滚动条更新和主绘制循环
 */

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