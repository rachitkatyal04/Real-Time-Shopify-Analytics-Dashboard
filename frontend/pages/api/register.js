import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const email = String(req.body?.email || "").toLowerCase().trim();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim() || null;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists?.passwordHash) return res.status(409).json({ error: "User already exists" });
    const hash = await bcrypt.hash(password, 10);
    const user = exists
      ? await prisma.user.update({ where: { email }, data: { passwordHash: hash, name } })
      : await prisma.user.create({ data: { email, passwordHash: hash, name } });
    res.status(201).json({ id: user.id, email: user.email });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
}


