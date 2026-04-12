/* 
 * 覆盖系统可视化工具 - 覆盖率计算模块
 * 该文件负责更新元素计数、计算并显示矩形集合的覆盖率
 */

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
  
  // 检查关卡完成
  checkLevelCompletion(area);
}