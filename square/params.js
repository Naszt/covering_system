// ======================= 参数管理 =======================
// 本模块负责管理应用程序的全局参数（底数a和b）以及参数变化时的重新初始化

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