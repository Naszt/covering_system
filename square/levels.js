/*
 * 覆盖系统可视化工具 - 关卡管理模块
 * 该文件包含关卡数据定义、状态管理和进度存储
 */

// ======================= 关卡数据定义 =======================

/**
 * 关卡定义对象
 * @typedef {Object} LevelDefinition
 * @property {string} id - 关卡ID，例如 "1-1"
 * @property {string} title - 关卡标题
 * @property {string} description - 关卡描述
 * @property {number} a - 底数 a
 * @property {number} b - 底数 b
 * @property {Array<[number,number]>} disabledRectangles - 禁用的矩形坐标数组，每个元素为 [n,m]
 * @property {number} maxUsesPerRectangle - 每个矩形最多使用次数，默认1
 * @property {boolean} unlocked - 是否已解锁（由进度管理）
 * @property {boolean} completed - 是否已完成（由进度管理）
 */

// 世界1的关卡数据
const WORLD_1_LEVELS = [
  {
    id: '1-1',
    title: '教程关',
    description: '学习基本操作。限制：不能使用矩形 (0,0)。',
    a: 2,
    b: 3,
    disabledRectangles: [[0, 0]],
    maxUsesPerRectangle: 1,
    unlocked: true, // 第一关默认解锁
    completed: false
  },
  {
    id: '1-2',
    title: '进阶关',
    description: '增加一个禁用矩形。限制：不能使用 (0,0) 和 (1,0)。',
    a: 2,
    b: 3,
    disabledRectangles: [[0, 0], [1, 0]],
    maxUsesPerRectangle: 1,
    unlocked: false,
    completed: false
  },
  {
    id: '1-3',
    title: '挑战关',
    description: '更多禁用矩形。限制：不能使用 (0,0), (1,0), (1,1)。',
    a: 2,
    b: 3,
    disabledRectangles: [[0, 0], [1, 0], [1, 1]],
    maxUsesPerRectangle: 1,
    unlocked: false,
    completed: false
  },
  {
    id: '1-4',
    title: '变底数关',
    description: '底数 a=2, b=2。限制：不能使用 (0,0)。',
    a: 2,
    b: 2,
    disabledRectangles: [[0, 0]],
    maxUsesPerRectangle: 1,
    unlocked: false,
    completed: false
  }
];

// 自由探索模式（无限制）
const FREE_EXPLORATION_MODE = {
  id: 'free',
  title: '自由探索',
  description: '无任何限制，自由使用所有矩形。',
  a: 2,
  b: 3,
  disabledRectangles: [],
  maxUsesPerRectangle: Infinity, // 不限次数
  unlocked: true,
  completed: false
};

// ======================= 关卡状态管理 =======================

/** 当前选中的关卡ID */
let currentLevelId = 'free'; // 默认自由探索

/** 所有关卡数据映射 */
const levelMap = {};
WORLD_1_LEVELS.forEach(level => levelMap[level.id] = level);
levelMap['free'] = FREE_EXPLORATION_MODE;

/** 从本地存储加载关卡进度 */
function loadLevelProgress() {
  try {
    const saved = localStorage.getItem('covering_system_level_progress');
    if (saved) {
      const progress = JSON.parse(saved);
      Object.keys(progress).forEach(id => {
        if (levelMap[id]) {
          levelMap[id].unlocked = progress[id].unlocked ?? levelMap[id].unlocked;
          levelMap[id].completed = progress[id].completed ?? levelMap[id].completed;
        }
      });
    }
  } catch (e) {
    console.warn('读取关卡进度失败，使用默认状态', e);
  }
}

/** 保存关卡进度到本地存储 */
function saveLevelProgress() {
  const progress = {};
  Object.keys(levelMap).forEach(id => {
    progress[id] = {
      unlocked: levelMap[id].unlocked,
      completed: levelMap[id].completed
    };
  });
  localStorage.setItem('covering_system_level_progress', JSON.stringify(progress));
}

/** 获取当前关卡对象 */
function getCurrentLevel() {
  return levelMap[currentLevelId];
}

/** 切换到指定关卡 */
function switchLevel(levelId) {
  if (!levelMap[levelId]) {
    console.error(`关卡 ${levelId} 不存在`);
    return;
  }
  if (!levelMap[levelId].unlocked) {
    console.warn(`关卡 ${levelId} 尚未解锁`);
    return;
  }

  const prevLevel = getCurrentLevel();
  currentLevelId = levelId;
  const level = getCurrentLevel();

  // 更新全局底数参数
  BASE_A = level.a;
  BASE_B = level.b;

  // 更新UI中的参数输入框（但不触发重绘）
  const paramAInput = document.getElementById('paramA');
  const paramBInput = document.getElementById('paramB');
  if (paramAInput && paramBInput) {
    paramAInput.value = level.a;
    paramBInput.value = level.b;
  }

  // 清空当前矩形并重新初始化
  rectangles = [];
  selectedId = null;
  isDragging = false;
  nextId = 0;
  currentShape = { n:0, m:0, w:getRectWidth(0), h:getRectHeight(0) };
  viewport = {x:0, y:0, scale:1};

  // 重绘所有内容
  drawAll();
  updateCount();
  refreshMatrixGrid();

  // 更新文本区域
  const ta = document.getElementById('rect-textarea');
  if (ta) {
    suppressTextarea = true;
    ta.value = '';
    suppressTextarea = false;
    saveToHistory('');
  }

  // 触发关卡切换事件（可供其他模块监听）
  if (typeof onLevelSwitched === 'function') {
    onLevelSwitched(prevLevel, level);
  }

  // 更新关卡按钮的UI状态
  updateLevelButtons();
}

/** 解锁指定关卡 */
function unlockLevel(levelId) {
  if (!levelMap[levelId]) return false;
  if (levelMap[levelId].unlocked) return true;
  
  levelMap[levelId].unlocked = true;
  saveLevelProgress();
  return true;
}

/** 标记当前关卡为完成，并尝试解锁下一关 */
function completeCurrentLevel() {
  const level = getCurrentLevel();
  if (!level) return;
  
  level.completed = true;
  saveLevelProgress();
  
  // 如果是世界1的关卡，尝试解锁下一关
  if (level.id.startsWith('1-')) {
    const match = level.id.match(/^1-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const nextId = `1-${num + 1}`;
      if (levelMap[nextId]) {
        unlockLevel(nextId);
      }
    }
  }
  
  // 触发关卡完成事件
  if (typeof onLevelCompleted === 'function') {
    onLevelCompleted(level);
  }
}

/** 检查当前关卡是否已完成（覆盖率100%） */
function checkLevelCompletion(coverage) {
  const level = getCurrentLevel();
  if (level.id === 'free') return false; // 自由探索模式不自动完成
  
  // 如果未提供覆盖率，尝试计算（可能不存在）
  if (coverage === undefined) {
    if (typeof calculateCoverage === 'function') {
      coverage = calculateCoverage();
    } else {
      console.warn('无法计算覆盖率，请提供 coverage 参数');
      return false;
    }
  }
  
  if (coverage >= 0.9999) { // 接近100%
    if (!level.completed) {
      completeCurrentLevel();
      return true;
    }
  }
  return false;
}

/** 初始化关卡系统 */
function initLevels() {
  loadLevelProgress();
  
  // 确保第一关已解锁
  if (WORLD_1_LEVELS[0]) {
    WORLD_1_LEVELS[0].unlocked = true;
  }
  
  // 默认切换到自由探索模式
  currentLevelId = 'free';
  // 注意：不自动切换关卡，由用户选择
  
  // 检查 URL 参数，如果有关卡参数则自动切换到该关卡
  const urlParams = new URLSearchParams(window.location.search);
  const levelParam = urlParams.get('level');
  if (levelParam && levelMap[levelParam]) {
    // 确保关卡已解锁（如果未解锁，仍然可以切换到自由探索）
    if (levelMap[levelParam].unlocked) {
      switchLevel(levelParam);
    } else {
      console.warn(`关卡 ${levelParam} 尚未解锁，保持自由探索模式`);
    }
  }
}

/** 检查矩形是否被禁用 */
function isRectangleDisabled(n, m) {
  const level = getCurrentLevel();
  if (!level) return false;
  return level.disabledRectangles.some(([dn, dm]) => dn === n && dm === m);
}

/** 获取矩形已使用次数 */
function getRectangleUsage(n, m) {
  return rectangles.filter(r => r.n === n && r.m === m).length;
}

/** 检查是否可以添加矩形（未禁用且未超过使用次数限制） */
function canAddRectangle(n, m) {
  const level = getCurrentLevel();
  if (!level) return true;
  if (isRectangleDisabled(n, m)) return false;
  const used = getRectangleUsage(n, m);
  return used < level.maxUsesPerRectangle;
}

/** 更新关卡按钮的UI状态 */
function updateLevelButtons() {
  const buttons = document.querySelectorAll('.level-btn');
  buttons.forEach(btn => {
    const levelId = btn.dataset.level;
    const level = levelMap[levelId];
    if (level) {
      btn.disabled = !level.unlocked;
      btn.classList.toggle('active', currentLevelId === levelId);
    }
  });
  // 更新描述
  const desc = document.getElementById('level-description');
  const cur = getCurrentLevel();
  if (desc && cur) {
    desc.textContent = cur.description;
  }
}

/** 绑定关卡按钮事件 */
function bindLevelButtons() {
  const buttons = document.querySelectorAll('.level-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const levelId = btn.dataset.level;
      switchLevel(levelId);
      updateLevelButtons();
    });
  });
}

// 导出全局变量和函数
// 注意：本模块依赖于 core.js 中的全局变量，因此必须在 core.js 之后加载