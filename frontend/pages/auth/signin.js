import { getCsrfToken, signIn } from "next-auth/react";
import { useState } from "react";

export default function SignIn({ csrfToken }) {
  const [email, setEmail] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="auth-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="relative rounded-2xl overflow-hidden shadow-card">
          <div className="absolute inset-0 opacity-20 bg-hero-gradient" />
          <div className="relative bg-white/80 backdrop-blur px-6 py-8">
            <div className="mb-6 text-center">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary-600 text-white shadow-glow">S</div>
              <h1 className="mt-4 text-2xl font-semibold">Welcome to Shopify Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">Sign in with your email to continue</p>
            </div>

            <form
              method="post"
              onSubmit={(e) => {
                e.preventDefault();
                signIn("email", { email, callbackUrl: "/dashboard" });
              }}
              className="space-y-4"
            >
              <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
              <div>
                <label className="block text-sm font-medium text-gray-700">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e)=>setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input mt-1"
                />
              </div>
              <button type="submit" className="btn-primary w-full">Send magic link</button>
            </form>

            <div className="my-6 flex items-center">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="mx-3 text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                setError("");
                const res = await signIn("credentials", { redirect: false, email: passwordEmail, password, callbackUrl: "/dashboard" });
                setLoading(false);
                if (res?.error) setError("Invalid email or password");
                if (res?.ok) window.location.href = "/dashboard";
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" className="input mt-1" value={passwordEmail} onChange={(e)=>setPasswordEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" className="input mt-1" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <button className="btn-secondary w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in with password"}</button>
            </form>

            <p className="mt-4 text-sm text-center">
              <a href="/auth/register" className="text-primary-600 hover:underline">Create an account</a>
            </p>

            <p className="mt-4 text-xs text-center text-gray-500">
              By continuing you agree to our Terms and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const csrfToken = await getCsrfToken(context);
  return { props: { csrfToken } };
}


