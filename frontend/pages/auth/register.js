import { useState } from "react";
import { signIn } from "next-auth/react";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      await signIn("credentials", { email, password, callbackUrl: "/dashboard" });
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="relative rounded-2xl overflow-hidden shadow-card">
          <div className="absolute inset-0 opacity-20 bg-hero-gradient" />
          <div className="relative bg-white/80 backdrop-blur px-6 py-8">
            <div className="mb-6 text-center">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary-600 text-white">S</div>
              <h1 className="mt-4 text-2xl font-semibold">Create your account</h1>
              <p className="mt-1 text-sm text-gray-600">Use email and password</p>
            </div>
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input className="input mt-1" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" required className="input mt-1" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" required className="input mt-1" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <button className="btn-primary w-full" disabled={loading}>{loading ? "Creating..." : "Create account"}</button>
            </form>
            <p className="mt-4 text-xs text-center text-gray-500">By creating an account, you agree to our terms.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


