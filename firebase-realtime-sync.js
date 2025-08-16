// Firebase 即時同步模組
// 此文件處理與 Firebase 的即時資料同步，包括多用戶同步和衝突解決

// 全域變數
let syncStatus = 'disconnected'; // 'connected', 'disconnected', 'syncing', 'error'
let lastSyncTime = null;
let syncRetryCount = 0;
const maxRetryCount = 3;
let syncRetryTimeout = null;

// 同步狀態監聽器
let syncStatusListeners = [];

// ==================== 同步狀態管理 ====================

// 添加同步狀態監聽器
function addSyncStatusListener(callback) {
    syncStatusListeners.push(callback);
}

// 移除同步狀態監聽器
function removeSyncStatusListener(callback) {
    const index = syncStatusListeners.indexOf(callback);
    if (index > -1) {
        syncStatusListeners.splice(index, 1);
    }
}

// 更新同步狀態
function updateSyncStatus(status, message = '') {
    const previousStatus = syncStatus;
    syncStatus = status;
    
    console.log(`同步狀態變更: ${previousStatus} -> ${status}`, message);
    
    // 更新 UI
    updateSyncStatusUI(status, message);
    
    // 通知監聽器
    syncStatusListeners.forEach(callback => {
        try {
            callback(status, message, previousStatus);
        } catch (error) {
            console.error('同步狀態監聽器錯誤:', error);
        }
    });
    
    // 記錄同步時間
    if (status === 'connected') {
        lastSyncTime = new Date();
        syncRetryCount = 0;
        
        // 清除重試計時器
        if (syncRetryTimeout) {
            clearTimeout(syncRetryTimeout);
            syncRetryTimeout = null;
        }
    }
}

// 更新同步狀態 UI
function updateSyncStatusUI(status, message) {
    // 更新狀態指示器
    const statusIndicator = document.getElementById('syncStatusIndicator');
    const statusText = document.getElementById('syncStatusText');
    const lastSyncElement = document.getElementById('lastSyncTime');
    
    if (statusIndicator) {
        // 移除所有狀態類別
        statusIndicator.className = 'sync-status-indicator';
        
        switch (status) {
            case 'connected':
                statusIndicator.classList.add('connected');
                if (statusText) statusText.textContent = '已連線';
                break;
            case 'disconnected':
                statusIndicator.classList.add('disconnected');
                if (statusText) statusText.textContent = '已離線';
                break;
            case 'syncing':
                statusIndicator.classList.add('syncing');
                if (statusText) statusText.textContent = '同步中...';
                break;
            case 'error':
                statusIndicator.classList.add('error');
                if (statusText) statusText.textContent = '同步錯誤';
                break;
        }
    }
    
    // 更新最後同步時間
    if (lastSyncElement && lastSyncTime) {
        const timeString = formatSyncTime(lastSyncTime);
        lastSyncElement.textContent = `最後同步: ${timeString}`;
    }
    
    // 顯示同步訊息
    if (message && status === 'error') {
        showSyncNotification(message, 'error');
    } else if (message && status === 'connected') {
        showSyncNotification(message, 'success');
    }
}

// 格式化同步時間
function formatSyncTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 小於 1 分鐘
        return '剛剛';
    } else if (diff < 3600000) { // 小於 1 小時
        const minutes = Math.floor(diff / 60000);
        return `${minutes} 分鐘前`;
    } else if (diff < 86400000) { // 小於 1 天
        const hours = Math.floor(diff / 3600000);
        return `${hours} 小時前`;
    } else {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
}

// 顯示同步通知
function showSyncNotification(message, type = 'info') {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `sync-notification ${type}`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-check-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    // 添加到頁面
    document.body.appendChild(notification);
    
    // 顯示動畫
    setTimeout(() => notification.classList.add('show'), 100);
    
    // 自動隱藏
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ==================== 網路狀態監控 ====================

// 初始化網路狀態監控
function initializeNetworkMonitoring() {
    // 監聽網路狀態變化
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // 初始狀態檢查
    if (navigator.onLine) {
        handleOnline();
    } else {
        handleOffline();
    }
    
    // 定期檢查連線狀態
    setInterval(checkConnectionStatus, 30000); // 每 30 秒檢查一次
}

// 處理上線事件
function handleOnline() {
    console.log('網路連線已恢復');
    updateSyncStatus('syncing', '正在重新連線...');
    
    // 嘗試重新連接 Firebase
    setTimeout(async () => {
        try {
            await testFirebaseConnection();
            updateSyncStatus('connected', '已重新連線到雲端');
            
            // 重新初始化即時監聽
            await reinitializeRealtimeListeners();
            
        } catch (error) {
            console.error('重新連線失敗:', error);
            updateSyncStatus('error', '重新連線失敗');
            scheduleRetry();
        }
    }, 1000);
}

// 處理離線事件
function handleOffline() {
    console.log('網路連線已中斷');
    updateSyncStatus('disconnected', '網路連線已中斷，將在本地儲存變更');
}

// 檢查連線狀態
async function checkConnectionStatus() {
    if (!navigator.onLine) {
        if (syncStatus !== 'disconnected') {
            handleOffline();
        }
        return;
    }
    
    try {
        await testFirebaseConnection();
        if (syncStatus !== 'connected') {
            updateSyncStatus('connected', '連線已恢復');
        }
    } catch (error) {
        if (syncStatus === 'connected') {
            updateSyncStatus('error', '連線不穩定');
        }
    }
}

// 測試 Firebase 連線
async function testFirebaseConnection() {
    try {
        // 嘗試讀取一個小的測試文檔
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        if (!window.firebaseIntegration || !window.firebaseIntegration.db) {
            throw new Error('Firebase 未初始化');
        }
        
        const testDoc = doc(window.firebaseIntegration.db, 'test', 'connection');
        await getDoc(testDoc);
        
        return true;
    } catch (error) {
        console.error('Firebase 連線測試失敗:', error);
        throw error;
    }
}

// ==================== 重試機制 ====================

// 安排重試
function scheduleRetry() {
    if (syncRetryCount >= maxRetryCount) {
        console.log('已達到最大重試次數，停止重試');
        updateSyncStatus('error', '連線失敗，請檢查網路設定');
        return;
    }
    
    syncRetryCount++;
    const retryDelay = Math.min(1000 * Math.pow(2, syncRetryCount), 30000); // 指數退避，最大 30 秒
    
    console.log(`安排第 ${syncRetryCount} 次重試，延遲 ${retryDelay}ms`);
    
    syncRetryTimeout = setTimeout(async () => {
        try {
            updateSyncStatus('syncing', `重試連線中... (${syncRetryCount}/${maxRetryCount})`);
            
            await testFirebaseConnection();
            updateSyncStatus('connected', '重新連線成功');
            
            // 重新初始化即時監聽
            await reinitializeRealtimeListeners();
            
        } catch (error) {
            console.error(`第 ${syncRetryCount} 次重試失敗:`, error);
            scheduleRetry();
        }
    }, retryDelay);
}

// ==================== 即時監聽管理 ====================

// 重新初始化即時監聽
async function reinitializeRealtimeListeners() {
    try {
        console.log('重新初始化即時監聽...');
        
        // 重新設置書籍監聽
        if (window.firebaseBookOperations) {
            await window.firebaseBookOperations.initializeBooksData();
        }
        
        // 重新設置分類監聽
        if (window.firebaseCategoryOperations) {
            await window.firebaseCategoryOperations.initializeCategoriesData();
        }
        
        console.log('即時監聽重新初始化完成');
        
    } catch (error) {
        console.error('重新初始化即時監聽失敗:', error);
        throw error;
    }
}

// ==================== 衝突解決 ====================

// 處理資料衝突
function handleDataConflict(localData, serverData, dataType) {
    console.log(`檢測到 ${dataType} 資料衝突:`, { localData, serverData });
    
    // 基於時間戳的衝突解決策略
    const localTime = new Date(localData.updatedAt || localData.createdAt);
    const serverTime = new Date(serverData.updatedAt || serverData.createdAt);
    
    if (serverTime > localTime) {
        // 服務器資料較新，使用服務器資料
        console.log('使用服務器資料（較新）');
        return { resolution: 'server', data: serverData };
    } else if (localTime > serverTime) {
        // 本地資料較新，使用本地資料
        console.log('使用本地資料（較新）');
        return { resolution: 'local', data: localData };
    } else {
        // 時間戳相同，使用合併策略
        console.log('時間戳相同，嘗試合併資料');
        return { resolution: 'merge', data: mergeData(localData, serverData, dataType) };
    }
}

// 合併資料
function mergeData(localData, serverData, dataType) {
    // 基本合併策略：優先使用非空值
    const merged = { ...serverData };
    
    Object.keys(localData).forEach(key => {
        if (localData[key] && (!serverData[key] || localData[key] !== serverData[key])) {
            // 如果本地值存在且與服務器值不同，需要決定使用哪個
            if (key === 'title' || key === 'name') {
                // 對於重要欄位，保留較長的值
                if (localData[key].length > serverData[key].length) {
                    merged[key] = localData[key];
                }
            } else if (key === 'description') {
                // 對於描述欄位，保留較詳細的值
                if (localData[key].length > (serverData[key] || '').length) {
                    merged[key] = localData[key];
                }
            }
        }
    });
    
    // 更新時間戳為最新
    merged.updatedAt = new Date();
    
    return merged;
}

// ==================== 離線支援 ====================

// 儲存離線操作
function storeOfflineOperation(operation) {
    try {
        const offlineOps = JSON.parse(localStorage.getItem('offlineOperations') || '[]');
        
        const operationWithTimestamp = {
            ...operation,
            timestamp: new Date().toISOString(),
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
        };
        
        offlineOps.push(operationWithTimestamp);
        localStorage.setItem('offlineOperations', JSON.stringify(offlineOps));
        
        console.log('離線操作已儲存:', operationWithTimestamp);
        
        // 更新離線操作計數 UI
        updateOfflineOperationsCount(offlineOps.length);
        
    } catch (error) {
        console.error('儲存離線操作失敗:', error);
    }
}

// 同步離線操作
async function syncOfflineOperations() {
    try {
        const offlineOps = JSON.parse(localStorage.getItem('offlineOperations') || '[]');
        
        if (offlineOps.length === 0) {
            console.log('沒有離線操作需要同步');
            return;
        }
        
        console.log(`開始同步 ${offlineOps.length} 個離線操作`);
        updateSyncStatus('syncing', `同步 ${offlineOps.length} 個離線操作...`);
        
        const results = [];
        
        for (const operation of offlineOps) {
            try {
                await executeOfflineOperation(operation);
                results.push({ operation, success: true });
            } catch (error) {
                console.error('離線操作同步失敗:', operation, error);
                results.push({ operation, success: false, error });
            }
        }
        
        // 移除成功同步的操作
        const failedOps = results.filter(r => !r.success).map(r => r.operation);
        localStorage.setItem('offlineOperations', JSON.stringify(failedOps));
        
        const successCount = results.filter(r => r.success).length;
        const failedCount = failedOps.length;
        
        console.log(`離線操作同步完成: ${successCount} 成功, ${failedCount} 失敗`);
        
        if (failedCount === 0) {
            updateSyncStatus('connected', `成功同步 ${successCount} 個離線操作`);
        } else {
            updateSyncStatus('error', `${successCount} 個操作同步成功, ${failedCount} 個失敗`);
        }
        
        // 更新離線操作計數 UI
        updateOfflineOperationsCount(failedCount);
        
    } catch (error) {
        console.error('同步離線操作失敗:', error);
        updateSyncStatus('error', '同步離線操作失敗');
    }
}

// 執行離線操作
async function executeOfflineOperation(operation) {
    const { type, data, target } = operation;
    
    switch (type) {
        case 'addBook':
            await window.firebaseIntegration.addBookToFirestore(data);
            break;
        case 'updateBook':
            await window.firebaseIntegration.updateBookInFirestore(target, data);
            break;
        case 'deleteBook':
            await window.firebaseIntegration.deleteBookFromFirestore(target);
            break;
        case 'addCategory':
            await window.firebaseIntegration.addHierarchicalCategoryToFirestore(data);
            break;
        case 'updateCategory':
            await window.firebaseIntegration.updateCategoryInFirestore(target, data);
            break;
        case 'deleteCategory':
            await window.firebaseIntegration.deleteHierarchicalCategoryFromFirestore(target);
            break;
        default:
            throw new Error(`未知的離線操作類型: ${type}`);
    }
}

// 更新離線操作計數 UI
function updateOfflineOperationsCount(count) {
    const countElement = document.getElementById('offlineOperationsCount');
    if (countElement) {
        if (count > 0) {
            countElement.textContent = count;
            countElement.classList.remove('hidden');
        } else {
            countElement.classList.add('hidden');
        }
    }
}

// ==================== 初始化和清理 ====================

// 初始化即時同步
async function initializeRealtimeSync() {
    try {
        console.log('初始化即時同步...');
        
        // 初始化網路狀態監控
        initializeNetworkMonitoring();
        
        // 檢查 Firebase 連線
        if (window.firebaseIntegration) {
            try {
                await testFirebaseConnection();
                updateSyncStatus('connected', '已連線到雲端資料庫');
                
                // 同步離線操作
                await syncOfflineOperations();
                
            } catch (error) {
                console.error('Firebase 連線失敗:', error);
                updateSyncStatus('error', 'Firebase 連線失敗');
                scheduleRetry();
            }
        } else {
            updateSyncStatus('disconnected', 'Firebase 未配置，使用本地儲存');
        }
        
        // 設置定期同步檢查
        setInterval(async () => {
            if (syncStatus === 'connected') {
                await syncOfflineOperations();
            }
        }, 60000); // 每分鐘檢查一次
        
        console.log('即時同步初始化完成');
        
    } catch (error) {
        console.error('初始化即時同步失敗:', error);
        updateSyncStatus('error', '同步初始化失敗');
    }
}

// 清理同步資源
function cleanupRealtimeSync() {
    // 移除事件監聽器
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    
    // 清除計時器
    if (syncRetryTimeout) {
        clearTimeout(syncRetryTimeout);
        syncRetryTimeout = null;
    }
    
    // 清空監聽器
    syncStatusListeners = [];
    
    console.log('即時同步資源已清理');
}

// ==================== 導出函式 ====================

// 將函式導出到全域範圍
window.firebaseRealtimeSync = {
    // 初始化和清理
    initializeRealtimeSync,
    cleanupRealtimeSync,
    
    // 狀態管理
    getSyncStatus: () => syncStatus,
    getLastSyncTime: () => lastSyncTime,
    addSyncStatusListener,
    removeSyncStatusListener,
    
    // 離線支援
    storeOfflineOperation,
    syncOfflineOperations,
    
    // 衝突解決
    handleDataConflict,
    
    // 工具函式
    testFirebaseConnection,
    updateSyncStatus
};

// 頁面卸載時清理資源
window.addEventListener('beforeunload', cleanupRealtimeSync);

// 自動初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 等待其他模組載入完成
    setTimeout(async () => {
        await initializeRealtimeSync();
    }, 1000);
});

