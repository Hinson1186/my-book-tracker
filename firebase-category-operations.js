// Firebase 分類操作模組
// 此文件包含所有與分類相關的 Firebase 操作，支援階層化分類管理

// 全域變數
let categories = [];
let isLoadingCategories = false;
let categoriesUnsubscribe = null;

// ==================== 分類資料載入和同步 ====================

// 初始化分類資料
async function initializeCategoriesData() {
    try {
        console.log('開始初始化分類資料...');
        
        // 檢查是否有本地分類資料需要遷移
        const localCategories = JSON.parse(localStorage.getItem('myBookTrackerCategories') || '[]');
        
        if (localCategories.length > 0) {
            console.log(`發現 ${localCategories.length} 個本地分類，準備遷移到 Firebase`);
            
            // 詢問用戶是否要遷移資料
            if (confirm(`發現 ${localCategories.length} 個本地分類。是否要將它們遷移到雲端資料庫？`)) {
                await migrateLocalCategoriesToFirebase(localCategories);
                // 清除本地資料
                localStorage.removeItem('myBookTrackerCategories');
                showToast('本地分類已成功遷移到雲端！', 'success');
            }
        }
        
        // 載入 Firebase 資料
        await loadCategoriesFromFirebase();
        
        // 如果沒有分類，創建預設分類
        if (categories.length === 0) {
            await createDefaultCategories();
        }
        
        // 設置即時監聽
        setupCategoriesRealTimeListener();
        
        console.log('分類資料初始化完成');
    } catch (error) {
        console.error('初始化分類資料失敗:', error);
        
        // 如果 Firebase 失敗，回退到本地儲存
        console.log('回退到本地儲存模式');
        loadCategoriesFromLocalStorage();
    }
}

// 從 Firebase 載入分類
async function loadCategoriesFromFirebase() {
    try {
        isLoadingCategories = true;
        
        categories = await window.firebaseIntegration.getCategoriesFromFirestore();
        
        console.log(`從 Firebase 載入了 ${categories.length} 個分類`);
        
        // 更新 UI
        renderCategoriesList();
        
    } catch (error) {
        console.error('從 Firebase 載入分類失敗:', error);
        throw error;
    } finally {
        isLoadingCategories = false;
    }
}

// 從本地儲存載入分類（回退方案）
function loadCategoriesFromLocalStorage() {
    try {
        const localCategories = localStorage.getItem('myBookTrackerCategories');
        categories = localCategories ? JSON.parse(localCategories) : getDefaultCategories();
        
        console.log(`從本地儲存載入了 ${categories.length} 個分類`);
        
        // 更新 UI
        renderCategoriesList();
        
    } catch (error) {
        console.error('從本地儲存載入分類失敗:', error);
        categories = getDefaultCategories();
        renderCategoriesList();
    }
}

// 獲取預設分類
function getDefaultCategories() {
    return [
        {
            id: 'fiction',
            name: 'Fiction',
            parentId: null,
            path: '/Fiction',
            level: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            id: 'non-fiction',
            name: 'Non-Fiction',
            parentId: null,
            path: '/Non-Fiction',
            level: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            id: 'uncategorized',
            name: 'Uncategorized',
            parentId: null,
            path: '/Uncategorized',
            level: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    ];
}

// 創建預設分類
async function createDefaultCategories() {
    try {
        console.log('創建預設分類...');
        
        const defaultCategories = getDefaultCategories();
        
        const createPromises = defaultCategories.map(category => 
            window.firebaseIntegration.addCategoryToFirestore({
                name: category.name,
                parentId: category.parentId,
                path: category.path,
                level: category.level,
                description: `預設 ${category.name} 分類`
            })
        );
        
        await Promise.all(createPromises);
        console.log('預設分類創建完成');
        
    } catch (error) {
        console.error('創建預設分類失敗:', error);
        // 如果 Firebase 失敗，使用本地預設分類
        categories = getDefaultCategories();
        localStorage.setItem('myBookTrackerCategories', JSON.stringify(categories));
    }
}

// 設置即時監聽
function setupCategoriesRealTimeListener() {
    try {
        // 如果已有監聽器，先取消
        if (categoriesUnsubscribe) {
            categoriesUnsubscribe();
        }
        
        // 設置新的監聽器
        categoriesUnsubscribe = window.firebaseIntegration.listenToCategoriesChanges((updatedCategories) => {
            console.log('收到分類資料更新');
            categories = updatedCategories;
            renderCategoriesList();
            updateCategorySelectors();
        });
        
        console.log('分類即時監聽已設置');
    } catch (error) {
        console.error('設置分類即時監聽失敗:', error);
    }
}

// 遷移本地分類到 Firebase
async function migrateLocalCategoriesToFirebase(localCategories) {
    try {
        console.log(`開始遷移 ${localCategories.length} 個分類到 Firebase`);
        
        const migrationPromises = localCategories.map(async (category) => {
            try {
                return await window.firebaseIntegration.addCategoryToFirestore({
                    name: category.name,
                    parentId: category.parentId || null,
                    path: category.path || `/${category.name}`,
                    level: category.level || 0,
                    description: category.description || ''
                });
            } catch (error) {
                console.error(`遷移分類失敗: ${category.name}`, error);
                return null;
            }
        });
        
        const results = await Promise.all(migrationPromises);
        const successCount = results.filter(result => result !== null).length;
        
        console.log(`成功遷移 ${successCount}/${localCategories.length} 個分類`);
        
        return successCount;
    } catch (error) {
        console.error('遷移分類到 Firebase 失敗:', error);
        throw error;
    }
}

// ==================== 階層化分類 CRUD 操作 ====================

// 添加階層化分類
async function addHierarchicalCategory(categoryData) {
    try {
        // 驗證必要欄位
        if (!categoryData.name || !categoryData.name.trim()) {
            throw new Error('分類名稱為必填欄位');
        }
        
        // 清理分類名稱
        const cleanName = categoryData.name.trim();
        
        // 檢查同一層級下是否有重複名稱
        const isDuplicate = categories.some(cat => 
            cat.name === cleanName && 
            cat.parentId === (categoryData.parentId || null)
        );
        
        if (isDuplicate) {
            throw new Error(`分類 "${cleanName}" 在此層級下已存在`);
        }
        
        // 計算層級和路徑
        const level = calculateCategoryLevel(categoryData.parentId);
        const path = buildCategoryPath(categoryData.parentId) + "/" + cleanName;
        
        // 限制最大深度
        if (level >= 5) {
            throw new Error("分類層級不能超過 5 層");
        }
        
        showLoadingIndicator('正在添加分類...');
        
        // 嘗試添加到 Firebase
        try {
            const newCategory = await window.firebaseIntegration.addHierarchicalCategoryToFirestore({
                name: cleanName,
                parentId: categoryData.parentId || null,
                path: path,
                level: level,
                description: categoryData.description || ''
            });
            
            console.log('分類已添加到 Firebase:', newCategory.id);
            showToast('分類添加成功！', 'success');
            return newCategory.id;
            
        } catch (firebaseError) {
            console.error('Firebase 添加失敗，回退到本地儲存:', firebaseError);
            
            // 回退到本地儲存
            const newCategory = {
                id: Date.now().toString(),
                name: cleanName,
                parentId: categoryData.parentId || null,
                path: path,
                level: level,
                description: categoryData.description || '',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            categories.push(newCategory);
            localStorage.setItem('myBookTrackerCategories', JSON.stringify(categories));
            
            renderCategoriesList();
            updateCategorySelectors();
            showToast('分類已添加到本地儲存', 'success');
            return newCategory.id;
        }
        
    } catch (error) {
        console.error('添加分類失敗:', error);
        showToast(error.message || '添加分類失敗，請重試', 'error');
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

// 更新分類
async function updateCategory(categoryId, updateData) {
    try {
        // 驗證分類是否存在
        const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
        if (categoryIndex === -1) {
            throw new Error('找不到要更新的分類');
        }
        
        const category = categories[categoryIndex];
        
        // 如果更新名稱，檢查重複
        if (updateData.name && updateData.name !== category.name) {
            const isDuplicate = categories.some(cat => 
                cat.id !== categoryId &&
                cat.name === updateData.name.trim() && 
                cat.parentId === category.parentId
            );
            
            if (isDuplicate) {
                throw new Error(`分類 "${updateData.name}" 在此層級下已存在`);
            }
        }
        
        showLoadingIndicator('正在更新分類...');
        
        // 嘗試更新到 Firebase
        try {
            await window.firebaseIntegration.updateCategoryInFirestore(categoryId, updateData);
            console.log('分類已在 Firebase 中更新:', categoryId);
            showToast('分類更新成功！', 'success');
            
        } catch (firebaseError) {
            console.error('Firebase 更新失敗，回退到本地儲存:', firebaseError);
            
            // 回退到本地儲存
            categories[categoryIndex] = { 
                ...categories[categoryIndex], 
                ...updateData,
                updatedAt: new Date()
            };
            localStorage.setItem('myBookTrackerCategories', JSON.stringify(categories));
            
            renderCategoriesList();
            updateCategorySelectors();
            showToast('分類已在本地更新', 'success');
        }
        
    } catch (error) {
        console.error('更新分類失敗:', error);
        showToast(error.message || '更新分類失敗，請重試', 'error');
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

// 刪除階層化分類
async function deleteHierarchicalCategory(categoryId) {
    try {
        // 驗證分類是否存在
        const category = categories.find(cat => cat.id === categoryId);
        if (!category) {
            throw new Error('找不到要刪除的分類');
        }
        
        // 獲取所有子分類
        const subCategories = getAllSubCategories(categoryId);
        const totalCategoriesToDelete = 1 + subCategories.length;
        
        // 確認刪除
        let confirmMessage = `確定要刪除分類 "${category.name}" 嗎？`;
        if (subCategories.length > 0) {
            confirmMessage += `\n這將同時刪除 ${subCategories.length} 個子分類。`;
        }
        confirmMessage += '\n相關書籍將被移至 "Uncategorized" 分類。\n此操作無法撤銷。';
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        showLoadingIndicator('正在刪除分類...');
        
        // 嘗試從 Firebase 刪除
        try {
            await window.firebaseIntegration.deleteHierarchicalCategoryFromFirestore(categoryId);
            console.log('分類已從 Firebase 刪除:', categoryId);
            showToast(`成功刪除 ${totalCategoriesToDelete} 個分類！`, 'success');
            
        } catch (firebaseError) {
            console.error('Firebase 刪除失敗，回退到本地儲存:', firebaseError);
            
            // 回退到本地儲存
            const allCategoryIdsToDelete = [categoryId, ...subCategories.map(cat => cat.id)];
            
            // 更新相關書籍的分類
            if (window.firebaseBookOperations) {
                const books = window.firebaseBookOperations.getBooks();
                const booksToUpdate = books.filter(book => allCategoryIdsToDelete.includes(book.category));
                
                booksToUpdate.forEach(book => {
                    window.updateBookInFirestore(book.id, { category: 'uncategorized' });
                });
            }
            
            // 刪除分類
            categories = categories.filter(cat => !allCategoryIdsToDelete.includes(cat.id));
            localStorage.setItem('myBookTrackerCategories', JSON.stringify(categories));
            
            renderCategoriesList();
            updateCategorySelectors();
            showToast(`已從本地刪除 ${totalCategoriesToDelete} 個分類`, 'success');
        }
        
    } catch (error) {
        console.error('刪除分類失敗:', error);
        showToast(error.message || '刪除分類失敗，請重試', 'error');
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

// ==================== 階層化分類工具函式 ====================

// 計算分類層級
function calculateCategoryLevel(categoryId) {
    if (!categoryId) return 0;
    
    const category = categories.find(cat => cat.id === categoryId);
    if (!category || !category.parentId) return 1;
    
    return calculateCategoryLevel(category.parentId) + 1;
}

// 構建分類路徑
function buildCategoryPath(categoryId) {
    if (!categoryId) return "";
    
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return "";
    
    if (!category.parentId) {
        return "/" + category.name;
    }
    
    const parentPath = buildCategoryPath(category.parentId);
    return parentPath + "/" + category.name;
}

// 獲取所有子分類
function getAllSubCategories(parentId) {
    const subCategories = [];
    
    categories.forEach(category => {
        if (category.parentId === parentId) {
            subCategories.push(category);
            // 遞歸獲取子分類的子分類
            subCategories.push(...getAllSubCategories(category.id));
        }
    });
    
    return subCategories;
}

// 獲取所有子分類ID
function getAllSubCategoryIds(parentId) {
    return getAllSubCategories(parentId).map(cat => cat.id);
}

// 構建分類樹
function buildCategoryTree() {
    const tree = [];
    const categoryMap = new Map();
    
    // 創建分類映射
    categories.forEach(category => {
        categoryMap.set(category.id, { ...category, children: [] });
    });
    
    // 構建樹狀結構
    categories.forEach(category => {
        const categoryNode = categoryMap.get(category.id);
        
        if (!category.parentId) {
            // 根分類
            tree.push(categoryNode);
        } else {
            // 子分類
            const parent = categoryMap.get(category.parentId);
            if (parent) {
                parent.children.push(categoryNode);
            } else {
                // 如果找不到父分類，將其作為根分類
                tree.push(categoryNode);
            }
        }
    });
    
    return tree;
}

// 獲取分類的完整路徑
function getCategoryFullPath(categoryId) {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return '';
    
    return category.path || buildCategoryPath(categoryId);
}

// 獲取分類顏色
function getCategoryColor(category) {
    const name = category.name.toLowerCase();
    
    // 預定義顏色映射
    const colorMap = {
        'fiction': '#3b82f6',      // 藍色
        'non-fiction': '#10b981',  // 綠色
        'science': '#8b5cf6',      // 紫色
        'history': '#f59e0b',      // 橙色
        'biography': '#ef4444',    // 紅色
        'mystery': '#6b7280',      // 灰色
        'romance': '#ec4899',      // 粉色
        'fantasy': '#8b5cf6',      // 紫色
        'thriller': '#374151',     // 深灰色
        'comedy': '#fbbf24',       // 黃色
        'drama': '#dc2626',        // 深紅色
        'uncategorized': '#9ca3af' // 淺灰色
    };
    
    // 檢查預定義顏色
    for (const [key, color] of Object.entries(colorMap)) {
        if (name.includes(key)) {
            return color;
        }
    }
    
    // 根據分類名稱生成顏色
    let hash = 0;
    for (let i = 0; i < category.name.length; i++) {
        hash = category.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash) % 20); // 60-80%
    const lightness = 45 + (Math.abs(hash) % 10);  // 45-55%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// 獲取分類圖標
function getCategoryIcon(category) {
    const name = category.name.toLowerCase();
    
    // 預定義圖標映射
    const iconMap = {
        'fiction': 'fa-book',
        'non-fiction': 'fa-book-open',
        'science': 'fa-flask',
        'history': 'fa-landmark',
        'biography': 'fa-user',
        'mystery': 'fa-search',
        'romance': 'fa-heart',
        'fantasy': 'fa-magic',
        'thriller': 'fa-bolt',
        'comedy': 'fa-laugh',
        'drama': 'fa-theater-masks',
        'uncategorized': 'fa-question'
    };
    
    // 檢查預定義圖標
    for (const [key, icon] of Object.entries(iconMap)) {
        if (name.includes(key)) {
            return icon;
        }
    }
    
    // 根據層級返回預設圖標
    if (category.level === 0) {
        return 'fa-folder';
    } else {
        return 'fa-folder-open';
    }
}

// ==================== UI 更新函式 ====================

// 渲染分類列表
function renderCategoriesList() {
    // 更新側邊欄分類列表
    updateSidebarCategories();
    
    // 更新分類管理界面
    updateCategoryManagementUI();
}

// 更新側邊欄分類
function updateSidebarCategories() {
    const categoriesList = document.getElementById('categoriesList');
    if (!categoriesList) return;
    
    // 構建分類樹
    const categoryTree = buildCategoryTree();
    
    // 清空現有內容
    categoriesList.innerHTML = '';
    
    // 添加 "All" 選項
    const allItem = document.createElement('li');
    allItem.innerHTML = `
        <a href="#" class="category-link flex items-center px-3 py-2 rounded-lg bg-indigo-100 text-indigo-700" data-category="all">
            <i class="fas fa-list mr-2"></i>
            <span>All</span>
            <span class="ml-auto text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded-full" id="allBooksCount">0</span>
        </a>
    `;
    categoriesList.appendChild(allItem);
    
    // 遞歸渲染分類樹
    function renderCategoryNode(category, level = 0) {
        const item = document.createElement('li');
        const indent = level * 20;
        const hasChildren = category.children && category.children.length > 0;
        
        item.innerHTML = `
            <div class="flex items-center">
                ${hasChildren ? `
                    <button class="category-toggle p-1 hover:bg-gray-200 rounded" data-category-id="${category.id}" style="margin-left: ${indent}px">
                        <i class="fas fa-chevron-right text-xs transition-transform"></i>
                    </button>
                ` : `<div style="width: 20px; margin-left: ${indent}px"></div>`}
                <a href="#" class="category-link flex items-center flex-1 px-2 py-2 rounded-lg hover:bg-gray-100" data-category="${category.id}">
                    <i class="fas ${getCategoryIcon(category)} mr-2" style="color: ${getCategoryColor(category)}"></i>
                    <span>${category.name}</span>
                    <span class="ml-auto text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full category-count" data-category-id="${category.id}">0</span>
                </a>
            </div>
            ${hasChildren ? `<ul class="category-children hidden ml-4"></ul>` : ''}
        `;
        
        categoriesList.appendChild(item);
        
        // 如果有子分類，遞歸渲染
        if (hasChildren) {
            const childrenContainer = item.querySelector('.category-children');
            category.children.forEach(child => {
                const childItem = renderCategoryNode(child, level + 1);
                childrenContainer.appendChild(childItem);
            });
        }
        
        return item;
    }
    
    // 渲染所有根分類
    categoryTree.forEach(category => {
        renderCategoryNode(category);
    });
    
    // 更新書籍計數
    updateCategoryBookCounts();
    
    // 設置事件監聽器
    setupCategoryEventListeners();
}

// 更新分類選擇器
function updateCategorySelectors() {
    // 更新添加書籍表單中的分類選擇器
    const bookCategorySelect = document.getElementById('bookCategory');
    if (bookCategorySelect) {
        const currentValue = bookCategorySelect.value;
        bookCategorySelect.innerHTML = '';
        
        // 添加 "Uncategorized" 選項
        const uncategorizedOption = document.createElement('option');
        uncategorizedOption.value = 'uncategorized';
        uncategorizedOption.textContent = 'Uncategorized';
        bookCategorySelect.appendChild(uncategorizedOption);
        
        // 遞歸添加分類選項
        function addCategoryOptions(categoryList, prefix = '') {
            categoryList.forEach(category => {
                if (category.id !== 'uncategorized') {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = prefix + category.name;
                    bookCategorySelect.appendChild(option);
                    
                    // 如果有子分類，遞歸添加
                    const subCategories = categories.filter(cat => cat.parentId === category.id);
                    if (subCategories.length > 0) {
                        addCategoryOptions(subCategories, prefix + '  ');
                    }
                }
            });
        }
        
        const rootCategories = categories.filter(cat => !cat.parentId);
        addCategoryOptions(rootCategories);
        
        // 恢復之前的選擇
        if (currentValue) {
            bookCategorySelect.value = currentValue;
        }
    }
}

// 更新分類管理界面
function updateCategoryManagementUI() {
    // 這個函式會在分類管理模態框中更新分類樹
    // 具體實現取決於分類管理界面的設計
}

// 更新分類書籍計數
function updateCategoryBookCounts() {
    if (!window.firebaseBookOperations) return;
    
    const books = window.firebaseBookOperations.getBooks();
    
    // 更新 "All" 計數
    const allCountElement = document.getElementById('allBooksCount');
    if (allCountElement) {
        allCountElement.textContent = books.length;
    }
    
    // 更新各分類計數
    categories.forEach(category => {
        const categoryBooks = books.filter(book => {
            // 包含該分類及其所有子分類的書籍
            const subCategoryIds = getAllSubCategoryIds(category.id);
            return book.category === category.id || subCategoryIds.includes(book.category);
        });
        
        const countElement = document.querySelector(`[data-category-id="${category.id}"]`);
        if (countElement) {
            countElement.textContent = categoryBooks.length;
        }
    });
}

// 設置分類事件監聽器
function setupCategoryEventListeners() {
    // 分類點擊事件
    document.querySelectorAll('.category-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const categoryId = e.currentTarget.dataset.category;
            
            // 更新活動分類
            document.querySelectorAll('.category-link').forEach(l => {
                l.classList.remove('bg-indigo-100', 'text-indigo-700');
                l.classList.add('hover:bg-gray-100');
            });
            e.currentTarget.classList.add('bg-indigo-100', 'text-indigo-700');
            e.currentTarget.classList.remove('hover:bg-gray-100');
            
            // 觸發分類篩選
            if (window.setCurrentCategory) {
                window.setCurrentCategory(categoryId);
            }
        });
    });
    
    // 分類摺疊/展開事件
    document.querySelectorAll('.category-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const categoryId = e.currentTarget.dataset.categoryId;
            const chevron = e.currentTarget.querySelector('i');
            const parentLi = e.currentTarget.closest('li');
            const childrenContainer = parentLi.querySelector('.category-children');
            
            if (childrenContainer) {
                const isExpanded = !childrenContainer.classList.contains('hidden');
                
                if (isExpanded) {
                    // 摺疊
                    childrenContainer.classList.add('hidden');
                    chevron.style.transform = 'rotate(0deg)';
                } else {
                    // 展開
                    childrenContainer.classList.remove('hidden');
                    chevron.style.transform = 'rotate(90deg)';
                }
                
                // 保存摺疊狀態
                const expandedCategories = JSON.parse(localStorage.getItem('expandedCategories') || '[]');
                if (isExpanded) {
                    const index = expandedCategories.indexOf(categoryId);
                    if (index > -1) {
                        expandedCategories.splice(index, 1);
                    }
                } else {
                    if (!expandedCategories.includes(categoryId)) {
                        expandedCategories.push(categoryId);
                    }
                }
                localStorage.setItem('expandedCategories', JSON.stringify(expandedCategories));
            }
        });
    });
}

// ==================== UI 輔助函式 ====================

// 顯示載入指示器
function showLoadingIndicator(message = '載入中...') {
    // 這個函式在 firebase-book-operations.js 中已定義
    if (window.firebaseBookOperations) {
        window.firebaseBookOperations.showLoadingIndicator(message);
    }
}

// 隱藏載入指示器
function hideLoadingIndicator() {
    // 這個函式在 firebase-book-operations.js 中已定義
    if (window.firebaseBookOperations) {
        window.firebaseBookOperations.hideLoadingIndicator();
    }
}

// 顯示 Toast 通知
function showToast(message, type = 'success') {
    // 這個函式在 firebase-book-operations.js 中已定義
    if (window.firebaseBookOperations) {
        window.firebaseBookOperations.showToast(message, type);
    }
}

// ==================== 清理函式 ====================

// 清理資源
function cleanup() {
    if (categoriesUnsubscribe) {
        categoriesUnsubscribe();
        categoriesUnsubscribe = null;
    }
}

// 頁面卸載時清理資源
window.addEventListener('beforeunload', cleanup);

// ==================== 導出函式 ====================

// 將函式導出到全域範圍
window.firebaseCategoryOperations = {
    // 初始化
    initializeCategoriesData,
    
    // CRUD 操作
    addHierarchicalCategory,
    updateCategory,
    deleteHierarchicalCategory,
    
    // 資料存取
    getCategories: () => categories,
    getCategoriesCount: () => categories.length,
    getCategoryById: (id) => categories.find(cat => cat.id === id),
    
    // 工具函式
    calculateCategoryLevel,
    buildCategoryPath,
    getAllSubCategories,
    getAllSubCategoryIds,
    buildCategoryTree,
    getCategoryFullPath,
    getCategoryColor,
    getCategoryIcon,
    
    // UI 更新
    renderCategoriesList,
    updateCategorySelectors,
    updateCategoryBookCounts,
    
    // 清理
    cleanup
};

// 自動初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 等待 Firebase 初始化完成
    if (window.firebaseIntegration) {
        try {
            await initializeCategoriesData();
        } catch (error) {
            console.error('分類資料初始化失敗:', error);
        }
    } else {
        console.warn('Firebase 整合模組未載入，使用本地儲存');
        loadCategoriesFromLocalStorage();
    }
});

