import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();
  return (
    <div className="min-h-screen flex items-center">
      <div className="mx-auto w-full max-w-6xl px-6">
        <header className="pt-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-9 w-9 rounded-lg bg-primary-600 text-white grid place-items-center shadow-glow">S</div>
            <span className="font-semibold">Shopify Dashboard</span>
          </div>
          <div>
            {!session ? (
              <button className="btn-primary" onClick={() => signIn("email")}>Sign in</button>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="hidden sm:block text-sm text-gray-600">{session.user?.email}</span>
                <Link href="/dashboard" className="btn-secondary">Open Dashboard</Link>
                <button className="btn-outline" onClick={() => signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </header>

        <main className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              Insights that make your <span className="text-primary-600">Shopify</span> store thrive
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Beautiful analytics, real-time updates, and customer trends in a delightful dashboard.
            </p>
            <div className="mt-6 flex items-center space-x-3">
              {!session ? (
                <button className="btn-primary" onClick={() => signIn("email")}>Get started</button>
              ) : (
                <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
              )}
              <a href="#features" className="btn-outline">Learn more</a>
            </div>
            <div className="mt-6 flex items-center space-x-3">
              <span className="badge">New</span>
              <span className="text-sm text-gray-500">Realtime refresh every 3 seconds</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 bg-hero-gradient opacity-20 rounded-3xl blur-2xl" />
            <div className="relative card">
              <div className="h-56 bg-gradient-to-tr from-primary-100 via-accent-100 to-white rounded-xl" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {["Customers","Orders","Revenue"].map((x)=> (
                  <div key={x} className="bg-white border rounded-lg p-3 shadow-sm">
                    <div className="text-xs text-gray-500">{x}</div>
                    <div className="text-xl font-semibold">—</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        <section id="features" className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { title: "Realtime", desc: "3s live polling for fresh data", color: "from-primary-50" },
            { title: "Beautiful Charts", desc: "Crisp, readable data viz", color: "from-accent-50" },
            { title: "Secure", desc: "Passwordless magic link sign-in", color: "from-cyan-50" },
          ].map((f) => (
            <div key={f.title} className={`rounded-xl p-5 shadow-card bg-gradient-to-br ${f.color} to-white`}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{f.desc}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

