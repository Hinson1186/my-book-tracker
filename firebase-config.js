// Firebase 配置模板
// 請將此檔案重新命名為 firebase-config.js 並填入您的 Firebase 配置

// 🔥 請在 Firebase Console 中獲取您的配置資訊
// 1. 前往 https://console.firebase.google.com/
// 2. 選擇您的專案
// 3. 點擊專案設定 (齒輪圖示)
// 4. 滾動到「您的應用程式」區域
// 5. 點擊 Web 應用程式圖示
// 6. 複製配置物件

const firebaseConfig = {
  apiKey: "AIzaSyBhufd0TSjVN-6UZX0mjjNwozPma1KjiLw",
  authDomain: "booktracker-eeb80.firebaseapp.com",
  projectId: "booktracker-eeb80",
  storageBucket: "booktracker-eeb80.firebasestorage.app",
  messagingSenderId: "1041414142866",
  appId: "1:1041414142866:web:e1a396ed381137fab55f4b",
  measurementId: "G-ZRHGTERX9B"
};

// 初始化 Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 導出到全域範圍
window.firebaseApp = app;
window.firebaseDb = db;

try {
  // 初始化 Firebase 應用程式
  app = initializeApp(firebaseConfig);
  
  // 初始化 Firestore
  db = getFirestore(app);
  
  // 開發環境：如果需要使用 Firestore 模擬器，請取消註解以下行
  // if (location.hostname === 'localhost') {
  //   connectFirestoreEmulator(db, 'localhost', 8080);
  // }
  
  console.log('✅ Firebase 初始化成功');
  
} catch (error) {
  console.error('❌ Firebase 初始化失敗:', error);
  
  // 顯示用戶友好的錯誤訊息
  if (error.code === 'app/invalid-api-key') {
    console.error('請檢查 Firebase API 金鑰是否正確');
  } else if (error.code === 'app/invalid-project-id') {
    console.error('請檢查 Firebase 專案 ID 是否正確');
  }
}

// 導出到全域範圍供其他模組使用
window.firebaseApp = app;
window.firebaseDb = db;
window.firebaseConfig = firebaseConfig;

// 檢查 Firebase 連線狀態
async function checkFirebaseConnection() {
  try {
    if (db) {
      // 嘗試讀取一個測試文檔來驗證連線
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const testDoc = doc(db, 'test', 'connection');
      await getDoc(testDoc);
      console.log('🔗 Firebase 連線正常');
      return true;
    }
  } catch (error) {
    console.warn('⚠️ Firebase 連線檢查失敗:', error.message);
    return false;
  }
}

// 頁面載入完成後檢查連線
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkFirebaseConnection, 1000);
});

// 導出連線檢查函式
window.checkFirebaseConnection = checkFirebaseConnection;

