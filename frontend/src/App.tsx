import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'

import './global.css'

import { RequireAuth, RequireGuest } from './components/RouteGuards'
import BackgroundEffects from './components/BackgroundEffects'
import ClickEffect from './components/ClickEffect'
import Navbar from './components/Navbar'
import { useTheme } from './lib/useTheme'
import CrawlPage from './pages/CrawlPage'
import HomePage from './pages/HomePage'
import LibraryPage from './pages/LibraryPage'
import LibraryDetailPage from './pages/LibraryDetailPage'
import LocalImagesPage from './pages/LocalImagesPage'
import LocalMediaPage from './pages/LocalMediaPage'
import LocalVideosPage from './pages/LocalVideosPage'
import LocalVideosDetailPage from './pages/LocalVideosDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SearchPage from './pages/SearchPage'
import SearchDetailPage from './pages/SearchDetailPage'
import ReaderOnlinePage from './pages/ReaderOnlinePage'
import ReaderLibraryPage from './pages/ReaderLibraryPage'
import ReaderLocalPage from './pages/ReaderLocalPage'
import NotFoundPage from './pages/NotFoundPage'


/** 登录/注册等认证页的居中布局容器 */
function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4 pt-16">{children}</div>
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

function AppContent() {
  const { isDark, toggleTheme } = useTheme()
  const { pathname } = useLocation()
  // 阅读页沉浸模式：隐藏全局导航栏（对应旧代码 body > header { display: none }）
  const isReader = pathname.includes('/reader/')

  return (
    <div className="demo-bg min-h-screen">
        {/* 漂浮光斑：让液态玻璃的折射可见 */}
        <div className="demo-blob left-[8%] top-[18%] h-72 w-72 bg-indigo-400/60 dark:bg-indigo-500/40" />
        <div
          className="demo-blob right-[10%] top-[12%] h-64 w-64 bg-sky-300/60 dark:bg-sky-500/30"
          style={{ animationDelay: '-4s' }}
        />
        <div
          className="demo-blob bottom-[10%] left-[40%] h-80 w-80 bg-pink-300/50 dark:bg-purple-500/30"
          style={{ animationDelay: '-8s' }}
        />

        {/* 全局背景动效：黑夜萤火虫 / 白天樱花 */}
        <BackgroundEffects isDark={isDark} />
        {/* 全局点击水波特效 */}
        <ClickEffect />

        <Navbar isDark={isDark} onToggleTheme={toggleTheme} hidden={isReader} />

        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/login"
            element={
              <RequireGuest>
                <AuthLayout>
                  <LoginPage />
                </AuthLayout>
              </RequireGuest>
            }
          />
          <Route
            path="/register"
            element={
              <RequireGuest>
                <AuthLayout>
                  <RegisterPage />
                </AuthLayout>
              </RequireGuest>
            }
          />
          {/* 在线搜索页（对接 /api/search/）*/}
          <Route
            path="/search"
            element={
              <RequireAuth>
                <SearchPage />
              </RequireAuth>
            }
          />
          {/* 搜索详情页（对接 /api/search/albums/:jmId/）*/}
          <Route
            path="/search/album/:jmId"
            element={
              <RequireAuth>
                <SearchDetailPage />
              </RequireAuth>
            }
          />
          {/* 在线漫画阅读页（对接 /api/search/photos/:photoId/images/，Canvas 反混淆）*/}
          <Route
            path="/search/reader/:photoId"
            element={
              <RequireAuth>
                <ReaderOnlinePage isDark={isDark} onToggleTheme={toggleTheme} />
              </RequireAuth>
            }
          />
          {/* 爬虫中心（对接 /api/crawl/）*/}
          <Route
            path="/crawl"
            element={
              <RequireAuth>
                <CrawlPage />
              </RequireAuth>
            }
          />
          {/* 藏书阁（对接 /api/library/albums/）*/}
          <Route
            path="/library"
            element={
              <RequireAuth>
                <LibraryPage />
              </RequireAuth>
            }
          />
          {/* 藏书阁详情页（对接 /api/library/albums/:id/）*/}
          <Route
            path="/library/:id"
            element={
              <RequireAuth>
                <LibraryDetailPage />
              </RequireAuth>
            }
          />
          {/* 藏书阁漫画阅读页（对接 /api/library/photos/:photoId/）*/}
          <Route
            path="/library/reader/:photoId"
            element={
              <RequireAuth>
                <ReaderLibraryPage isDark={isDark} onToggleTheme={toggleTheme} />
              </RequireAuth>
            }
          />
          {/* 本地资源库（对接 /api/local/）*/}
          <Route
            path="/local"
            element={
              <RequireAuth>
                <LocalMediaPage />
              </RequireAuth>
            }
          />
          <Route
            path="/local/images"
            element={
              <RequireAuth>
                <LocalImagesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/local/videos"
            element={
              <RequireAuth>
                <LocalVideosPage />
              </RequireAuth>
            }
          />
          {/* 本地视频详情页（M4 视频列表 + 播放器） */}
          <Route
            path="/local/videos/:folderName"
            element={
              <RequireAuth>
                <LocalVideosDetailPage />
              </RequireAuth>
            }
          />
          {/* 本地图片库阅读页（对接 /api/local/images/:folderName/，无章节仅分页）*/}
          <Route
            path="/local/reader/:folderName"
            element={
              <RequireAuth>
                <ReaderLocalPage isDark={isDark} onToggleTheme={toggleTheme} />
              </RequireAuth>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
  )
}

export default App
