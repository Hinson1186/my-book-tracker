const GOOGLE_BOOKS_API_KEY = 'AIzaSyBNiBa24j2t4WmwU4WgNujGCAPiX6VRN_4';

// Firebase 書籍操作模組
// 此文件包含所有與書籍相關的 Firebase 操作，替換原有的本地儲存邏輯

// 全域變數
let books = [];
let isLoadingBooks = false;
let booksUnsubscribe = null;

// ==================== 書籍資料載入和同步 ====================

// 初始化書籍資料
async function initializeBooksData() {
    try {
        console.log('開始初始化書籍資料...');
        
        // 檢查是否有本地資料需要遷移
        const localBooks = JSON.parse(localStorage.getItem('myBookTrackerBooks') || '[]');
        
        if (localBooks.length > 0) {
            console.log(`發現 ${localBooks.length} 本本地書籍，準備遷移到 Firebase`);
            
            // 詢問用戶是否要遷移資料
            if (confirm(`發現 ${localBooks.length} 本本地書籍。是否要將它們遷移到雲端資料庫？`)) {
                await migrateLocalBooksToFirebase(localBooks);
                // 清除本地資料
                localStorage.removeItem('myBookTrackerBooks');
                showToast('本地資料已成功遷移到雲端！', 'success');
            }
        }
        
        // 載入 Firebase 資料
        await loadBooksFromFirebase();
        
        // 設置即時監聽
        setupBooksRealTimeListener();
        
        console.log('書籍資料初始化完成');
    } catch (error) {
        console.error('初始化書籍資料失敗:', error);
        
        // 如果 Firebase 失敗，回退到本地儲存
        console.log('回退到本地儲存模式');
        loadBooksFromLocalStorage();
    }
}

// 從 Firebase 載入書籍
async function loadBooksFromFirebase() {
    try {
        isLoadingBooks = true;
        showLoadingIndicator();
        
        books = await window.firebaseIntegration.getBooksFromFirestore();
        
        console.log(`從 Firebase 載入了 ${books.length} 本書籍`);
        
        // 更新 UI
        renderBooks();
        updateStats();
        
    } catch (error) {
        console.error('從 Firebase 載入書籍失敗:', error);
        throw error;
    } finally {
        isLoadingBooks = false;
        hideLoadingIndicator();
    }
}

// 從本地儲存載入書籍（回退方案）
function loadBooksFromLocalStorage() {
    try {
        const localBooks = localStorage.getItem('myBookTrackerBooks');
        books = localBooks ? JSON.parse(localBooks) : getDefaultBooks();
        
        console.log(`從本地儲存載入了 ${books.length} 本書籍`);
        
        // 更新 UI
        renderBooks();
        updateStats();
        
    } catch (error) {
        console.error('從本地儲存載入書籍失敗:', error);
        books = getDefaultBooks();
        renderBooks();
        updateStats();
    }
}

// 獲取預設書籍資料
function getDefaultBooks() {
    return [
        {
            id: "1",
            title: "The Silent Patient",
            author: "Alex Michaelides",
            cover: "https://m.media-amazon.com/images/I/81p5L1VYKaL._AC_UF1000,1000_QL80_.jpg",
            category: "fiction",
            createdAt: new Date('2024-01-01')
        },
        {
            id: "2",
            title: "Atomic Habits",
            author: "James Clear",
            cover: "https://m.media-amazon.com/images/I/91bYsX41DVL._AC_UF1000,1000_QL80_.jpg",
            category: "non-fiction",
            createdAt: new Date('2024-01-02')
        }
    ];
}

// 設置即時監聽
function setupBooksRealTimeListener() {
    try {
        // 如果已有監聽器，先取消
        if (booksUnsubscribe) {
            booksUnsubscribe();
        }
        
        // 設置新的監聽器
        booksUnsubscribe = window.firebaseIntegration.listenToBooksChanges((updatedBooks) => {
            console.log('收到書籍資料更新');
            books = updatedBooks;
            renderBooks();
            updateStats();
        });
        
        console.log('書籍即時監聽已設置');
    } catch (error) {
        console.error('設置書籍即時監聽失敗:', error);
    }
}

// 遷移本地書籍到 Firebase
async function migrateLocalBooksToFirebase(localBooks) {
    try {
        console.log(`開始遷移 ${localBooks.length} 本書籍到 Firebase`);
        
        const migrationPromises = localBooks.map(async (book) => {
            try {
                return await window.firebaseIntegration.addBookToFirestore({
                    title: book.title,
                    author: book.author,
                    category: book.category || 'uncategorized',
                    cover: book.cover || '',
                    isbn: book.isbn || '',
                    description: book.description || ''
                });
            } catch (error) {
                console.error(`遷移書籍失敗: ${book.title}`, error);
                return null;
            }
        });
        
        const results = await Promise.all(migrationPromises);
        const successCount = results.filter(result => result !== null).length;
        
        console.log(`成功遷移 ${successCount}/${localBooks.length} 本書籍`);
        
        return successCount;
    } catch (error) {
        console.error('遷移書籍到 Firebase 失敗:', error);
        throw error;
    }
}

// ==================== 書籍 CRUD 操作 ====================

// 添加書籍
async function addBookToFirestore(bookData) {
    try {
        // 驗證必要欄位
        if (!bookData.title || !bookData.author) {
            throw new Error('書名和作者為必填欄位');
        }
        
        // 檢查是否有重複的 ISBN
        if (bookData.isbn) {
            const duplicateBook = books.find(book => book.isbn === bookData.isbn);
            if (duplicateBook) {
                throw new Error(`ISBN ${bookData.isbn} 已存在: "${duplicateBook.title}"`);
            }
        }
        
        showLoadingIndicator('正在添加書籍...');
        
        // 嘗試添加到 Firebase
        try {
            const newBook = await window.firebaseIntegration.addBookToFirestore(bookData);
            console.log('書籍已添加到 Firebase:', newBook.id);
            showToast('書籍添加成功！', 'success');
            return newBook.id;
        } catch (firebaseError) {
            console.error('Firebase 添加失敗，回退到本地儲存:', firebaseError);
            
            // 回退到本地儲存
            const newBook = {
                id: Date.now().toString(),
                ...bookData,
                createdAt: new Date()
            };
            
            books.push(newBook);
            localStorage.setItem('myBookTrackerBooks', JSON.stringify(books));
            
            renderBooks();
            updateStats();
            showToast('書籍已添加到本地儲存', 'success');
            return newBook.id;
        }
        
    } catch (error) {
        console.error('添加書籍失敗:', error);
        showToast(error.message || '添加書籍失敗，請重試', 'error');
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

// 更新書籍
async function updateBookInFirestore(bookId, updateData) {
    try {
        // 驗證書籍是否存在
        const bookIndex = books.findIndex(book => book.id === bookId);
        if (bookIndex === -1) {
            throw new Error('找不到要更新的書籍');
        }
        
        showLoadingIndicator('正在更新書籍...');
        
        // 嘗試更新到 Firebase
        try {
            await window.firebaseIntegration.updateBookInFirestore(bookId, updateData);
            console.log('書籍已在 Firebase 中更新:', bookId);
            showToast('書籍更新成功！', 'success');
        } catch (firebaseError) {
            console.error('Firebase 更新失敗，回退到本地儲存:', firebaseError);
            
            // 回退到本地儲存
            books[bookIndex] = { ...books[bookIndex], ...updateData };
            localStorage.setItem('myBookTrackerBooks', JSON.stringify(books));
            
            renderBooks();
            updateStats();
            showToast('書籍已在本地更新', 'success');
        }
        
    } catch (error) {
        console.error('更新書籍失敗:', error);
        showToast(error.message || '更新書籍失敗，請重試', 'error');
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

// 刪除書籍
async function deleteBookFromFirestore(bookId) {
    try {
        // 驗證書籍是否存在
        const book = books.find(book => book.id === bookId);
        if (!book) {
            throw new Error('找不到要刪除的書籍');
        }
        
        // 確認刪除
        if (!confirm(`確定要刪除《${book.title}》嗎？此操作無法撤銷。`)) {
            return;
        }
        
        showLoadingIndicator('正在刪除書籍...');
        
        // 嘗試從 Firebase 刪除
        try {
            await window.firebaseIntegration.deleteBookFromFirestore(bookId);
            console.log('書籍已從 Firebase 刪除:', bookId);
            showToast('書籍刪除成功！', 'success');
        } catch (firebaseError) {
            console.error('Firebase 刪除失敗，回退到本地儲存:', firebaseError);
            
            // 回退到本地儲存
            books = books.filter(book => book.id !== bookId);
            localStorage.setItem('myBookTrackerBooks', JSON.stringify(books));
            
            renderBooks();
            updateStats();
            showToast('書籍已從本地刪除', 'success');
        }
        
    } catch (error) {
        console.error('刪除書籍失敗:', error);
        showToast(error.message || '刪除書籍失敗，請重試', 'error');
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

// ==================== ISBN 搜尋功能 ====================

// 通過 ISBN 搜尋書籍
async function searchBookByISBN(isbn) {
    try {
        // 清理 ISBN（移除空格和連字符）
        const cleanISBN = isbn.replace(/[-\s]/g, '');
        
        // 驗證 ISBN 格式
        if (!/^(97[89])?\d{9}[\dX]$/.test(cleanISBN)) {
            throw new Error('無效的 ISBN 格式');
        }
        
        console.log('搜尋 ISBN:', cleanISBN);
        
        // 首先嘗試 Google Books API
        try {
            // 構建 API URL，如果有 API 金鑰則使用
            let apiUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanISBN}`;
            if (GOOGLE_BOOKS_API_KEY) {
                apiUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
            }
            
            const response = await fetch(apiUrl);
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const book = data.items[0].volumeInfo;
                
                let coverUrl = null;
                if (book.imageLinks) {
                    // 優先選擇高解析度封面
                    coverUrl = book.imageLinks.extraLarge || 
                              book.imageLinks.large || 
                              book.imageLinks.medium || 
                              book.imageLinks.small || 
                              book.imageLinks.thumbnail || 
                              book.imageLinks.smallThumbnail;
                    
                    // 確保使用 HTTPS
                    if (coverUrl) {
                        coverUrl = coverUrl.replace('http://', 'https://');
                        // 移除縮放參數以獲得更好的圖片品質
                        coverUrl = coverUrl.replace(/&zoom=\d+/, '');
                    }
                }
                
                return {
                    title: book.title || 'Unknown Title',
                    author: book.authors ? book.authors.join(', ') : 'Unknown Author',
                    cover: coverUrl,
                    isbn: cleanISBN,
                    description: book.description || '',
                    publishedDate: book.publishedDate || '',
                    pageCount: book.pageCount || 0,
                    categories: book.categories || []
                };
            }
        } catch (googleError) {
            console.warn('Google Books API 搜尋失敗:', googleError);
        }
        
        // 如果 Google Books 失敗，嘗試 Open Library API
        try {
            const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanISBN}&format=json&jscmd=data`);
            const data = await response.json();
            
            const bookKey = `ISBN:${cleanISBN}`;
            if (data[bookKey]) {
                const book = data[bookKey];
                
                return {
                    title: book.title || 'Unknown Title',
                    author: book.authors ? book.authors.map(a => a.name).join(', ') : 'Unknown Author',
                    cover: book.cover ? book.cover.medium || book.cover.large || book.cover.small : null,
                    isbn: cleanISBN,
                    description: book.description || '',
                    publishedDate: book.publish_date || '',
                    pageCount: book.number_of_pages || 0
                };
            }
        } catch (openLibError) {
            console.warn('Open Library API 搜尋失敗:', openLibError);
        }
        
        throw new Error('找不到該 ISBN 對應的書籍');
        
    } catch (error) {
        console.error('ISBN 搜尋失敗:', error);
        throw error;
    }
}

// ==================== UI 輔助函式 ====================

// 顯示載入指示器
function showLoadingIndicator(message = '載入中...') {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        const loadingText = loadingIndicator.querySelector('span');
        if (loadingText) {
            loadingText.textContent = message;
        }
        loadingIndicator.classList.remove('hidden');
    }
}

// 隱藏載入指示器
function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }
}

// 顯示 Toast 通知
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// 渲染書籍列表（這個函式會被主應用程式調用）
function renderBooks() {
    // 這個函式的實現在主 HTML 文件中
    if (window.renderBooks) {
        window.renderBooks();
    }
}

// 更新統計資訊
function updateStats() {
    // 這個函式的實現在主 HTML 文件中
    if (window.updateStats) {
        window.updateStats();
    }
}

// ==================== 清理函式 ====================

// 清理資源
function cleanup() {
    if (booksUnsubscribe) {
        booksUnsubscribe();
        booksUnsubscribe = null;
    }
}

// 頁面卸載時清理資源
window.addEventListener('beforeunload', cleanup);

// ==================== 導出函式 ====================

// 將函式導出到全域範圍
window.firebaseBookOperations = {
    // 初始化
    initializeBooksData,
    
    // CRUD 操作
    addBookToFirestore,
    updateBookInFirestore,
    deleteBookFromFirestore,
    
    // ISBN 搜尋
    searchBookByISBN,
    
    // 資料存取
    getBooks: () => books,
    getBooksCount: () => books.length,
    
    // 工具函式
    showLoadingIndicator,
    hideLoadingIndicator,
    showToast,
    
    // 清理
    cleanup
};

// 為了向後相容，也將函式直接掛載到 window
window.addBookToFirestore = addBookToFirestore;
window.updateBookInFirestore = updateBookInFirestore;
window.deleteBookFromFirestore = deleteBookFromFirestore;
window.searchBookByISBN = searchBookByISBN;

// 自動初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 等待 Firebase 初始化完成
    if (window.firebaseIntegration) {
        try {
            await initializeBooksData();
        } catch (error) {
            console.error('書籍資料初始化失敗:', error);
        }
    } else {
        console.warn('Firebase 整合模組未載入，使用本地儲存');
        loadBooksFromLocalStorage();
    }
});

