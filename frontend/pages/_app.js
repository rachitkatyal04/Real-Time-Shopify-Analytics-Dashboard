import "../styles/globals.css";
import { SessionProvider } from "next-auth/react";

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50">
        <Component {...pageProps} />
      </div>
    </SessionProvider>
  );
}

