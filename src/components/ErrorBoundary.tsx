// @ts-nocheck
import React from "react";

/* لو صار خطأ بالواجهة نعرض رسالة بدل شاشة بيضاء */
export default class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("[ui crash]", err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F6F3EE", color: "#1F1B2A", fontFamily: "Rubik, system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 520, background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 10px 30px rgba(70,50,20,.12)" }}>
          <h2 style={{ margin: "0 0 8px" }}>صار خطأ في الصفحة</h2>
          <p style={{ color: "#6F6880", lineHeight: 1.7, margin: "0 0 12px" }}>حدّث الصفحة. وإذا تكرر، صوّر الرسالة هذي وأرسلها.</p>
          <pre dir="ltr" style={{ whiteSpace: "pre-wrap", background: "#F0EBE3", padding: 12, borderRadius: 10, fontSize: 12, margin: "0 0 14px" }}>{String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err)).slice(0, 900)}</pre>
          <button onClick={() => location.reload()} style={{ border: 0, borderRadius: 12, padding: "12px 20px", background: "#1F1B2A", color: "#fff", fontWeight: 700, cursor: "pointer" }}>تحديث</button>
        </div>
      </div>
    );
  }
}
