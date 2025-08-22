import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let _app;
let _db;
let _auth;
let _user = null; // 保持 _user 變數，但不再用於構建集合路徑
let _isSyncing = false;
let _offlineOperations = [];

// 監聽器回調函數
let _booksListenerCallback = null;
let _categoriesListenerCallback = null;

// UI 輔助函數 (從主應用程式傳入)
let _showToast = null;
let _showSyncNotification = null;
let _updateSyncStatus = null;
let _updateOfflineOperationsCount = null;
let _toggleOfflineIndicator = null;

const firebaseIntegration = {
    initializeFirebase: async (app, db, showToast, showSyncNotification, updateSyncStatus, updateOfflineOperationsCount, toggleOfflineIndicator) => {
        _app = app;
        _db = db;
        _auth = getAuth(_app);
        _showToast = showToast;
        _showSyncNotification = showSyncNotification;
        _updateSyncStatus = updateSyncStatus;
        _updateOfflineOperationsCount = updateOfflineOperationsCount;
        _toggleOfflineIndicator = toggleOfflineIndicator;

        _updateSyncStatus('disconnected', '連線中...');

        // 匿名登入 (如果不需要，可以移除)
        try {
            // 檢查是否已啟用匿名登入，如果沒有則跳過
            // 這裡不再強制匿名登入，因為用戶可能希望完全移除 Authentication
            // 如果需要匿名登入，請確保在 Firebase Console 中啟用
            // await signInAnonymously(_auth);
            // console.log('Firebase 匿名登入成功');
            // _updateSyncStatus('connected', '已連線');
            // _showToast('Firebase 連線成功！', 'success');
        } catch (error) {
            console.error('Firebase 匿名登入失敗:', error);
            // _updateSyncStatus('error', '連線失敗');
            // _showToast('Firebase 連線失敗，請檢查配置和網路。', 'error');
        }

        // 監聽認證狀態變化 (如果不需要 Authentication，可以移除)
        onAuthStateChanged(_auth, (user) => {
            if (user) {
                _user = user;
                console.log('用戶已登入:', _user.uid);
                _updateSyncStatus('connected', '已連線');
                // 嘗試同步離線操作
                firebaseIntegration.syncOfflineOperations();
            } else {
                _user = null;
                console.log('用戶已登出');
                _updateSyncStatus('disconnected', '已登出');
            }
        });

        // 監聽網路連線狀態
        window.addEventListener('online', () => {
            _toggleOfflineIndicator(false);
            _showSyncNotification('網路已連線，嘗試同步資料...', 'info');
            firebaseIntegration.syncOfflineOperations();
        });

        window.addEventListener('offline', () => {
            _toggleOfflineIndicator(true);
            _showSyncNotification('網路已離線，變更將在重新連線後同步。', 'error');
        });

        // 初始檢查網路狀態
        if (!navigator.onLine) {
            _toggleOfflineIndicator(true);
            _showSyncNotification('網路已離線，變更將在重新連線後同步。', 'error');
        }

        return true;
    },

    // 獲取當前用戶 ID (不再用於構建集合路徑)
    getCurrentUserId: () => {
        return _user ? _user.uid : null;
    },

    // 獲取 Firestore 實例
    getFirestoreInstance: () => {
        return _db;
    },

    // 監聽書籍資料變化
    listenToBooksChanges: (callback) => {
        _booksListenerCallback = callback;
        // 直接監聽 'books' 集合，不使用用戶 ID
        const booksCollectionRef = collection(_db, `books`);
        return onSnapshot(booksCollectionRef, (snapshot) => {
            const books = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date(),
                updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate() : new Date()
            }));
            _booksListenerCallback(books);
            _updateSyncStatus('connected', '已連線', new Date().getTime());
        }, (error) => {
            console.error('監聽書籍變化失敗:', error);
            _updateSyncStatus('error', '同步錯誤');
            _showSyncNotification('書籍資料同步失敗，請檢查網路或重新整理。', 'error');
        });
    },

    // 監聽分類資料變化
    listenToCategoriesChanges: (callback) => {
        _categoriesListenerCallback = callback;
        // 直接監聽 'categories' 集合，不使用用戶 ID
        const categoriesCollectionRef = collection(_db, `categories`);
        return onSnapshot(categoriesCollectionRef, (snapshot) => {
            const categories = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            _categoriesListenerCallback(categories);
            _updateSyncStatus('connected', '已連線', new Date().getTime());
        }, (error) => {
            console.error('監聽分類變化失敗:', error);
            _updateSyncStatus('error', '同步錯誤');
            _showSyncNotification('分類資料同步失敗，請檢查網路或重新整理。', 'error');
        });
    },

    // 通用：從集合中獲取所有文件
    getDocsFromCollection: async (collectionName) => {
        const querySnapshot = await getDocs(collection(_db, collectionName));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // 通用：向集合添加文件
    addDocToCollection: async (collectionName, data) => {
        const docRef = await addDoc(collection(_db, collectionName), { ...data, createdAt: new Date(), updatedAt: new Date() });
        return { id: docRef.id, ...data };
    },

    // 通用：更新集合中的文件
    updateDocInCollection: async (collectionName, docId, data) => {
        const docRef = doc(_db, collectionName, docId);
        await updateDoc(docRef, { ...data, updatedAt: new Date() });
    },

    // 通用：從集合中刪除文件
    deleteDocFromCollection: async (collectionName, docId) => {
        const docRef = doc(_db, collectionName, docId);
        await deleteDoc(docRef);
    },

    // 添加離線操作
    addOfflineOperation: (operation) => {
        _offlineOperations.push(operation);
        localStorage.setItem('offlineOperations', JSON.stringify(_offlineOperations));
        _updateOfflineOperationsCount(_offlineOperations.length);
        _showToast('變更已儲存至離線佇列', 'info');
    },

    // 同步離線操作
    syncOfflineOperations: async () => {
        if (_isSyncing || !navigator.onLine) { // 移除 _user 檢查
            return;
        }

        _isSyncing = true;
        _updateSyncStatus('syncing', '同步中...');
        _showSyncNotification('正在同步離線變更...', 'info');

        const storedOperations = JSON.parse(localStorage.getItem('offlineOperations') || '[]');
        _offlineOperations = storedOperations;
        _updateOfflineOperationsCount(_offlineOperations.length);

        if (_offlineOperations.length === 0) {
            _isSyncing = false;
            _updateSyncStatus('connected', '已連線', new Date().getTime());
            _showSyncNotification('所有變更已同步完成！', 'success');
            return;
        }

        const batch = writeBatch(_db);
        let hasError = false;

        for (const op of _offlineOperations) {
            try {
                // 直接使用 'books' 或 'categories' 集合
                const docRef = doc(_db, op.collection, op.id);
                switch (op.type) {
                    case 'add':
                        // 對於新增操作，如果 ID 已經存在，則更新；否則新增
                        const existingDoc = await getDoc(docRef);
                        if (existingDoc.exists()) {
                            batch.update(docRef, op.data);
                        } else {
                            batch.set(docRef, op.data);
                        }
                        break;
                    case 'update':
                        batch.update(docRef, op.data);
                        break;
                    case 'delete':
                        batch.delete(docRef);
                        break;
                }
            } catch (error) {
                console.error('處理離線操作失敗:', op, error);
                hasError = true;
                // 不中斷循環，繼續處理其他操作
            }
        }

        try {
            await batch.commit();
            _offlineOperations = [];
            localStorage.removeItem('offlineOperations');
            _updateOfflineOperationsCount(0);
            _updateSyncStatus('connected', '已連線', new Date().getTime());
            _showSyncNotification('所有離線變更已成功同步！', 'success');
        } catch (error) {
            console.error('提交離線操作批次失敗:', error);
            _updateSyncStatus('error', '同步錯誤');
            _showSyncNotification('離線變更同步失敗，請重試。', 'error');
            hasError = true;
        } finally {
            _isSyncing = false;
            if (hasError) {
                _showToast('部分離線變更同步失敗，請檢查控制台。', 'error');
            }
        }
    }
};

// 導出 firebaseIntegration 物件
window.firebaseIntegration = firebaseIntegration;



