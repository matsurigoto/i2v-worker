import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { username, loading, login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && username) return <Navigate to="/stories" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form.username, form.password);
    } catch {
      setError("帳號或密碼錯誤");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <form className="card" style={{ width: 320 }} onSubmit={handleSubmit}>
        <h2>登入 i2v Story Studio</h2>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>帳號</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>密碼</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
