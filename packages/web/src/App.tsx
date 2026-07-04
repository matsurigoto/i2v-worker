import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import StoriesPage from "./pages/StoriesPage";
import StoryDetailPage from "./pages/StoryDetailPage";
import ImagesPage from "./pages/ImagesPage";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { username, loading, logout } = useAuth();

  if (loading) return <p style={{ padding: "2rem" }}>Loading…</p>;
  if (!username) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <h1>i2v Story Studio</h1>
        <NavLink to="/stories">故事維護</NavLink>
        <NavLink to="/images">圖片管理</NavLink>
        <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "#9aa4b2" }}>
          已登入：{username}
        </div>
        <button className="btn" style={{ marginTop: "0.5rem" }} onClick={() => logout()}>
          登出
        </button>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/stories"
        element={
          <ProtectedShell>
            <StoriesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/stories/:id"
        element={
          <ProtectedShell>
            <StoryDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/images"
        element={
          <ProtectedShell>
            <ImagesPage />
          </ProtectedShell>
        }
      />
      <Route path="*" element={<Navigate to="/stories" replace />} />
    </Routes>
  );
}
