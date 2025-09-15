export default function Verify() {
  return (
    <div className="auth-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="relative rounded-2xl overflow-hidden shadow-card">
          <div className="absolute inset-0 opacity-20 bg-hero-gradient" />
          <div className="relative bg-white/80 backdrop-blur px-6 py-10 text-center">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-accent-600 text-white shadow-glow">✉️</div>
            <h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
            <p className="mt-2 text-gray-600">
              We sent you a magic sign-in link. Click it on this device to continue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


