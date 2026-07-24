import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import BoardListPage from './pages/BoardListPage';
import BoardDetailPage from './pages/BoardDetailPage';
import BoardFormPage from './pages/BoardFormPage';
import LoginPage from './pages/LoginPage';
import PasswordSettingsPage from './pages/PasswordSettingsPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import SignupPage from './pages/SignupPage';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    // 주소 변경 시 전체 페이지를 다시 받지 않고 React가 화면을 교체
    <BrowserRouter>
      <Routes>
        {/* 기본 주소 접근 시 방문 기록을 남기지 않고 게시글 목록으로 이동 */}
        <Route path="/" element={<Navigate to="/boards" replace />} />
        <Route path="/boards" element={<BoardListPage />} />
        <Route path="/boards/:boardId" element={<BoardDetailPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/boards/new"
            element={<BoardFormPage mode="create" />}
          />
          <Route
            path="/boards/:boardId/edit"
            element={<BoardFormPage mode="edit" />}
          />
          <Route
            path="/settings/profile"
            element={<ProfileSettingsPage />}
          />
          <Route
            path="/settings/password"
            element={<PasswordSettingsPage />}
          />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Routes>
    </BrowserRouter>
  );
}
