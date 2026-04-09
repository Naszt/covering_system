// ======================= 初始化函数 =======================
// 本模块负责应用程序的初始化和启动

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
    const DEFAULT_LOAD = '(0+2^0)(0+2^3),(0+2^3)(0+2^0),(2+2^2)(1+2^1),(1+2^1)(2+2^2),(4+2^4)(0+2^0),(0+2^0)(4+2^4),(0+2^0)(12+2^5),(1+2^1)(28+2^5),(3+2^2)(1+2^2),(2+2^2)(6+2^3),(5+2^3)(1+2^2),(3+2^2)(3+2^4),(1+2^3)(1+2^1),(12+2^5)(0+2^0),(6+2^3)(2+2^3),(5+2^3)(3+2^4),(10+2^4)(2+2^3),(2+2^4)(2+2^2),(12+2^4)(1+2^1),(1+2^1)(7+2^3),(1+2^1)(11+2^4),(28+2^5)(0+2^1),(2+2^2)(28+2^5)';
    
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