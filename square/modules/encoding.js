/* 
 * 覆盖系统可视化工具 - 矩形编码/解码模块
 * 该文件负责矩形的序列化、反序列化以及新旧格式的解析
 */

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