// Firebase 整合模組
// 此文件包含所有與 Firebase Firestore 互動的函式

// Firebase 配置和初始化
const firebaseConfig = {
  apiKey: "AIzaSyBhufd0TSjVN-6UZX0mjjNwozPma1KjiLw",
  authDomain: "booktracker-eeb80.firebaseapp.com",
  projectId: "booktracker-eeb80",
  storageBucket: "booktracker-eeb80.firebasestorage.app",
  messagingSenderId: "1041414142866",
  appId: "1:1041414142866:web:e1a396ed381137fab55f4b",
  measurementId: "G-ZRHGTERX9B"
};

// 全域變數
let db;
let isFirebaseInitialized = false;

// 初始化 Firebase
async function initializeFirebase() {
    try {
        // 動態導入 Firebase SDK
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore, connectFirestoreEmulator } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // 初始化 Firebase 應用
        const app = initializeApp(firebaseConfig);
        
        // 初始化 Firestore
        db = getFirestore(app);
        
        isFirebaseInitialized = true;
        console.log('Firebase 初始化成功');
        
        return true;
    } catch (error) {
        console.error('Firebase 初始化失敗:', error);
        isFirebaseInitialized = false;
        return false;
    }
}

// 檢查 Firebase 是否已初始化
function ensureFirebaseInitialized() {
    if (!isFirebaseInitialized) {
        throw new Error('Firebase 尚未初始化。請先調用 initializeFirebase()');
    }
}

// ==================== 書籍相關操作 ====================

// 獲取所有書籍
async function getBooksFromFirestore() {
    try {
        ensureFirebaseInitialized();
        
        const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const booksRef = collection(db, 'books');
        const q = query(booksRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const books = [];
        querySnapshot.forEach((doc) => {
            books.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            });
        });
        
        console.log(`從 Firestore 獲取了 ${books.length} 本書籍`);
        return books;
    } catch (error) {
        console.error('獲取書籍失敗:', error);
        throw error;
    }
}

// 添加書籍到 Firestore
async function addBookToFirestore(bookData) {
    try {
        ensureFirebaseInitialized();
        
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const booksRef = collection(db, 'books');
        
        // 準備書籍資料
        const bookToAdd = {
            title: bookData.title || '',
            author: bookData.author || '',
            category: bookData.category || 'uncategorized',
            cover: bookData.cover || '',
            isbn: bookData.isbn || '',
            description: bookData.description || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(booksRef, bookToAdd);
        console.log('書籍已添加，ID:', docRef.id);
        
        return {
            id: docRef.id,
            ...bookToAdd,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    } catch (error) {
        console.error('添加書籍失敗:', error);
        throw error;
    }
}

// 更新書籍
async function updateBookInFirestore(bookId, updateData) {
    try {
        ensureFirebaseInitialized();
        
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const bookRef = doc(db, 'books', bookId);
        
        const dataToUpdate = {
            ...updateData,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(bookRef, dataToUpdate);
        console.log('書籍已更新，ID:', bookId);
        
        return true;
    } catch (error) {
        console.error('更新書籍失敗:', error);
        throw error;
    }
}

// 刪除書籍
async function deleteBookFromFirestore(bookId) {
    try {
        ensureFirebaseInitialized();
        
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const bookRef = doc(db, 'books', bookId);
        await deleteDoc(bookRef);
        
        console.log('書籍已刪除，ID:', bookId);
        return true;
    } catch (error) {
        console.error('刪除書籍失敗:', error);
        throw error;
    }
}

// ==================== 分類相關操作 ====================

// 獲取所有分類
async function getCategoriesFromFirestore() {
    try {
        ensureFirebaseInitialized();
        
        const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const categoriesRef = collection(db, 'categories');
        const q = query(categoriesRef, orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        
        const categories = [];
        querySnapshot.forEach((doc) => {
            categories.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            });
        });
        
        console.log(`從 Firestore 獲取了 ${categories.length} 個分類`);
        return categories;
    } catch (error) {
        console.error('獲取分類失敗:', error);
        throw error;
    }
}

// 添加分類到 Firestore
async function addCategoryToFirestore(categoryData) {
    try {
        ensureFirebaseInitialized();
        
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const categoriesRef = collection(db, 'categories');
        
        // 準備分類資料
        const categoryToAdd = {
            name: categoryData.name || '',
            parentId: categoryData.parentId || null,
            path: categoryData.path || '',
            level: categoryData.level || 0,
            description: categoryData.description || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(categoriesRef, categoryToAdd);
        console.log('分類已添加，ID:', docRef.id);
        
        return {
            id: docRef.id,
            ...categoryToAdd,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    } catch (error) {
        console.error('添加分類失敗:', error);
        throw error;
    }
}

// 更新分類
async function updateCategoryInFirestore(categoryId, updateData) {
    try {
        ensureFirebaseInitialized();
        
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const categoryRef = doc(db, 'categories', categoryId);
        
        const dataToUpdate = {
            ...updateData,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(categoryRef, dataToUpdate);
        console.log('分類已更新，ID:', categoryId);
        
        return true;
    } catch (error) {
        console.error('更新分類失敗:', error);
        throw error;
    }
}

// 刪除分類
async function deleteCategoryFromFirestore(categoryId) {
    try {
        ensureFirebaseInitialized();
        
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const categoryRef = doc(db, 'categories', categoryId);
        await deleteDoc(categoryRef);
        
        console.log('分類已刪除，ID:', categoryId);
        return true;
    } catch (error) {
        console.error('刪除分類失敗:', error);
        throw error;
    }
}

// ==================== 階層化分類特殊操作 ====================

// 添加階層化分類（包含路徑計算）
async function addHierarchicalCategoryToFirestore(categoryData) {
    try {
        ensureFirebaseInitialized();
        
        // 首先獲取所有現有分類以計算路徑和層級
        const existingCategories = await getCategoriesFromFirestore();
        
        // 驗證分類名稱在同一層級下是否重複
        const isDuplicate = existingCategories.some(cat => 
            cat.name === categoryData.name && 
            cat.parentId === categoryData.parentId
        );
        
        if (isDuplicate) {
            throw new Error(`分類 "${categoryData.name}" 在此層級下已存在`);
        }
        
        // 計算層級和路徑
        const level = calculateCategoryLevel(existingCategories, categoryData.parentId);
        const path = buildCategoryPath(existingCategories, categoryData.parentId) + "/" + categoryData.name;
        
        // 限制最大深度
        if (level >= 5) {
            throw new Error("分類層級不能超過 5 層");
        }
        
        // 添加分類
        const newCategory = await addCategoryToFirestore({
            ...categoryData,
            path: path,
            level: level
        });
        
        return newCategory;
    } catch (error) {
        console.error('添加階層化分類失敗:', error);
        throw error;
    }
}

// 刪除階層化分類（包含子分類處理）
async function deleteHierarchicalCategoryFromFirestore(categoryId) {
    try {
        ensureFirebaseInitialized();
        
        // 獲取所有分類和書籍
        const [categories, books] = await Promise.all([
            getCategoriesFromFirestore(),
            getBooksFromFirestore()
        ]);
        
        // 獲取所有子分類ID
        const allSubCategoryIds = getAllSubCategoryIds(categories, categoryId);
        const allCategoryIdsToDelete = [categoryId, ...allSubCategoryIds];
        
        // 更新相關書籍的分類為 "uncategorized"
        const booksToUpdate = books.filter(book => allCategoryIdsToDelete.includes(book.category));
        
        // 批量更新書籍
        const updatePromises = booksToUpdate.map(book => 
            updateBookInFirestore(book.id, { category: 'uncategorized' })
        );
        
        // 批量刪除分類
        const deletePromises = allCategoryIdsToDelete.map(id => 
            deleteCategoryFromFirestore(id)
        );
        
        // 執行所有操作
        await Promise.all([...updatePromises, ...deletePromises]);
        
        console.log(`已刪除分類及其 ${allSubCategoryIds.length} 個子分類，並更新了 ${booksToUpdate.length} 本書籍`);
        return true;
    } catch (error) {
        console.error('刪除階層化分類失敗:', error);
        throw error;
    }
}

// ==================== 即時監聽功能 ====================

// 監聽書籍變更
function listenToBooksChanges(callback) {
    try {
        ensureFirebaseInitialized();
        
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ collection, onSnapshot, orderBy, query }) => {
            const booksRef = collection(db, 'books');
            const q = query(booksRef, orderBy('createdAt', 'desc'));
            
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const books = [];
                querySnapshot.forEach((doc) => {
                    books.push({
                        id: doc.id,
                        ...doc.data(),
                        createdAt: doc.data().createdAt?.toDate() || new Date(),
                        updatedAt: doc.data().updatedAt?.toDate() || new Date()
                    });
                });
                
                console.log('書籍資料已更新，共', books.length, '本');
                callback(books);
            }, (error) => {
                console.error('監聽書籍變更失敗:', error);
            });
            
            return unsubscribe;
        });
    } catch (error) {
        console.error('設置書籍監聽失敗:', error);
    }
}

// 監聽分類變更
function listenToCategoriesChanges(callback) {
    try {
        ensureFirebaseInitialized();
        
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ collection, onSnapshot, orderBy, query }) => {
            const categoriesRef = collection(db, 'categories');
            const q = query(categoriesRef, orderBy('name', 'asc'));
            
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const categories = [];
                querySnapshot.forEach((doc) => {
                    categories.push({
                        id: doc.id,
                        ...doc.data(),
                        createdAt: doc.data().createdAt?.toDate() || new Date(),
                        updatedAt: doc.data().updatedAt?.toDate() || new Date()
                    });
                });
                
                console.log('分類資料已更新，共', categories.length, '個');
                callback(categories);
            }, (error) => {
                console.error('監聽分類變更失敗:', error);
            });
            
            return unsubscribe;
        });
    } catch (error) {
        console.error('設置分類監聽失敗:', error);
    }
}

// ==================== 工具函式 ====================

// 計算分類層級
function calculateCategoryLevel(categories, categoryId) {
    if (!categoryId) return 0;
    
    const category = categories.find(cat => cat.id === categoryId);
    if (!category || !category.parentId) return 0;
    
    return calculateCategoryLevel(categories, category.parentId) + 1;
}

// 構建分類路徑
function buildCategoryPath(categories, categoryId) {
    if (!categoryId) return "";
    
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return "";
    
    if (!category.parentId) {
        return "/" + category.name;
    }
    
    const parentPath = buildCategoryPath(categories, category.parentId);
    return parentPath + "/" + category.name;
}

// 獲取所有子分類ID
function getAllSubCategoryIds(categories, parentId) {
    const subCategoryIds = [];
    
    categories.forEach(category => {
        if (category.parentId === parentId) {
            subCategoryIds.push(category.id);
            // 遞歸獲取子分類的子分類
            subCategoryIds.push(...getAllSubCategoryIds(categories, category.id));
        }
    });
    
    return subCategoryIds;
}

// ==================== 資料遷移功能 ====================

// 從本地儲存遷移到 Firebase
async function migrateLocalDataToFirebase() {
    try {
        ensureFirebaseInitialized();
        
        // 獲取本地儲存的資料
        const localBooks = JSON.parse(localStorage.getItem('myBookTrackerBooks') || '[]');
        const localCategories = JSON.parse(localStorage.getItem('myBookTrackerCategories') || '[]');
        
        console.log(`準備遷移 ${localBooks.length} 本書籍和 ${localCategories.length} 個分類`);
        
        // 遷移分類
        const categoryMigrationPromises = localCategories.map(category => 
            addCategoryToFirestore({
                name: category.name,
                parentId: category.parentId,
                path: category.path,
                level: category.level,
                description: category.description || ''
            })
        );
        
        await Promise.all(categoryMigrationPromises);
        console.log('分類遷移完成');
        
        // 遷移書籍
        const bookMigrationPromises = localBooks.map(book => 
            addBookToFirestore({
                title: book.title,
                author: book.author,
                category: book.category,
                cover: book.cover,
                isbn: book.isbn,
                description: book.description || ''
            })
        );
        
        await Promise.all(bookMigrationPromises);
        console.log('書籍遷移完成');
        
        return true;
    } catch (error) {
        console.error('資料遷移失敗:', error);
        throw error;
    }
}

// 導出所有函式供全域使用
window.firebaseIntegration = {
    // 初始化
    initializeFirebase,
    
    // 書籍操作
    getBooksFromFirestore,
    addBookToFirestore,
    updateBookInFirestore,
    deleteBookFromFirestore,
    
    // 分類操作
    getCategoriesFromFirestore,
    addCategoryToFirestore,
    updateCategoryInFirestore,
    deleteCategoryFromFirestore,
    
    // 階層化分類操作
    addHierarchicalCategoryToFirestore,
    deleteHierarchicalCategoryFromFirestore,
    
    // 即時監聽
    listenToBooksChanges,
    listenToCategoriesChanges,
    
    // 工具函式
    calculateCategoryLevel,
    buildCategoryPath,
    getAllSubCategoryIds,
    
    // 資料遷移
    migrateLocalDataToFirebase
};

// 自動初始化 Firebase
document.addEventListener('DOMContentLoaded', async () => {
    console.log('開始初始化 Firebase...');
    await initializeFirebase();
});

