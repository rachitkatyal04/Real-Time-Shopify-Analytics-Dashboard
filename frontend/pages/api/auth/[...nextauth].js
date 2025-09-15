import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "../../../lib/prisma";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    EmailProvider({
      id: "email",
      name: "Email",
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT || 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url, provider }) {
        const transport = nodemailer.createTransport(provider.server);
        const { host } = new URL(url);
        const res = await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Sign in to ${host}`,
          text: `Sign in to ${host}\n${url}\n\n`,
          html: `<p>Sign in to <strong>${host}</strong></p><p><a href="${url}">Click here to sign in</a></p>`
        });
        const failed = res.rejected.concat(res.pending).filter(Boolean);
        if (failed.length) throw new Error(`Email (${failed.join(", ")}) could not be sent`);
      },
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = String(credentials?.email || "").toLowerCase().trim();
          const password = String(credentials?.password || "");
          if (!email || !password) return null;
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user?.passwordHash) return null;
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;
          return { id: user.id, email: user.email, name: user.name };
        } catch (_e) {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        // Force dashboard as default landing page after email sign-in
        const cb = u.searchParams.get("callbackUrl");
        if (!cb || new URL(cb, baseUrl).pathname === "/auth/signin") {
          return `${baseUrl}/dashboard`;
        }
        return u.toString();
      } catch (_e) {
        return `${baseUrl}/dashboard`;
      }
    },
    async session({ session, token }) {
      if (token?.email) session.user = { email: token.email };
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);

