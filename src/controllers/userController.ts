import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";
import pool from "../db/index.ts";
import type { AuthRequest } from "../middlewares/authMiddleware.ts";

const JWT_SECRET = process.env.JWT_SECRET || "pos_kasir_secret_key_default";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

// ==========================================
// 1. AUTHENTICATION (Login, Logout, Profile)
// ==========================================

// ini buat login (Mendukung Username/Email/Nama + Password)
export async function login(req: Request, res: Response) {
  try {
    const { usernameOrEmail, username, email, name, password, pin } = req.body;
    const identifier = (name || usernameOrEmail || username || email)?.trim();
    const secret = (password || pin)?.trim();

    if (!identifier || !secret) {
      return res.status(400).json({ message: "Nama/Username dan Password wajib diisi!" });
    }

    const [rows]: any = await pool.query(
      "SELECT id, name, username, email, password, pin, role, phone, is_active FROM users WHERE email = ? OR username = ? OR name = ?",
      [identifier, identifier, identifier]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ message: "Pengguna tidak ditemukan!" });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: "Akun Anda telah dinonaktifkan oleh Administrator." });
    }

    // Login verifikasi password (semua akun login menggunakan password)
    const isPasswordValid = user.password && user.password === secret;
    const isPinValid = user.pin && user.pin === secret;

    if (!isPasswordValid && !isPinValid) {
      return res.status(401).json({ message: "Password yang Anda masukkan salah!" });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    res.status(200).json({
      message: "Login berhasil",
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          pin: user.pin,
        },
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error saat login", error: err.message });
  }
}

// daftar kasir aktif untuk login cepat
export async function getActiveCashiers(_req: Request, res: Response) {
  try {
    const [rows]: any = await pool.query(
      "SELECT id, name, username, role FROM users WHERE is_active = 1 ORDER BY role ASC, name ASC"
    );
    res.status(200).json({ total: rows.length, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// ini buat logout
export async function logout(_req: Request, res: Response) {
  res.status(200).json({ message: "Logout berhasil" });
}

// ini buat melihat profil sendiri
export async function getProfile(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Pengguna tidak terautentikasi" });
    }

    const [rows]: any = await pool.query(
      "SELECT id, name, username, email, pin, role, phone, is_active, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });
    }

    res.status(200).json({ data: rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// ==========================================
// 2. ADMIN MANAGE EMPLOYEES / USERS
// ==========================================

// admin: semua user / pegawai
export async function getAllUsers(req: AuthRequest, res: Response) {
  try {
    const { role, is_active, search } = req.query;

    let query = "SELECT id, name, username, email, pin, role, phone, is_active, created_at, updated_at FROM users WHERE 1=1";
    const params: any[] = [];

    if (role) {
      query += " AND role = ?";
      params.push(role);
    }
    if (is_active !== undefined) {
      query += " AND is_active = ?";
      params.push(is_active === "true" || is_active === "1" ? 1 : 0);
    }
    if (search) {
      query += " AND (name LIKE ? OR username LIKE ? OR email LIKE ?)";
      const kw = `%${search}%`;
      params.push(kw, kw, kw);
    }

    query += " ORDER BY created_at DESC";

    const [rows]: any = await pool.query(query, params);
    res.status(200).json({ total: rows.length, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// detail user
export async function getUserById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      "SELECT id, name, username, email, pin, role, phone, is_active, created_at, updated_at FROM users WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });
    }

    res.status(200).json({ data: rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: membuat akun pegawai baru
export async function createUser(req: Request, res: Response) {
  try {
    const { name, username, email, password, pin, role = "pegawai", phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nama, email & password wajib diisi!" });
    }

    // Validasi PIN kasir: wajib berupa 4-6 digit angka saja
    if (pin && !/^\d{4,6}$/.test(String(pin).trim())) {
      return res.status(400).json({ message: "PIN kasir hanya boleh berupa 4-6 digit angka (0-9)!" });
    }

    // Ambil input nama dasar (dari username jika diisi, atau dari name), ubah ke huruf kecil dan hapus spasi
    const rawName = (username || name).trim().toLowerCase().replace(/\s+/g, "");

    // Otomatis tambahkan prefix "kasir-" di depan nama jika role-nya pegawai
    let finalUsername = rawName;
    if (role === "pegawai") {
      finalUsername = rawName.startsWith("kasir-") ? rawName : `kasir-${rawName}`;
    }

    const [exist]: any = await pool.query(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [finalUsername, email]
    );

    if (exist.length) {
      return res.status(409).json({ message: "Username atau email sudah digunakan!" });
    }

    const finalPin = pin ? String(pin).trim() : (role === "pegawai" ? "1234" : null);

    const [result]: any = await pool.query(
      "INSERT INTO users (name, username, email, password, pin, role, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
      [name, finalUsername, email, password, finalPin, role, phone || null]
    );

    res.status(201).json({
      message: "Akun pegawai berhasil dibuat",
      data: { id: result.insertId, name, username: finalUsername, email, role, pin: finalPin },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: edit akun pegawai
export async function updateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, username, email, password, pin, role, phone, is_active } = req.body;

    const [exist]: any = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (!exist.length) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });
    }

    if (username || email) {
      const [conflict]: any = await pool.query(
        "SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?",
        [username || "", email || "", id]
      );
      if (conflict.length) {
        return res.status(409).json({ message: "Username atau email sudah digunakan pengguna lain" });
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (username !== undefined) { updates.push("username = ?"); values.push(username); }
    if (email !== undefined) { updates.push("email = ?"); values.push(email); }
    if (role !== undefined) { updates.push("role = ?"); values.push(role); }
    if (phone !== undefined) { updates.push("phone = ?"); values.push(phone); }
    if (pin !== undefined) {
      if (pin && !/^\d{4,6}$/.test(String(pin).trim())) {
        return res.status(400).json({ message: "PIN kasir hanya boleh berupa 4-6 digit angka (0-9)!" });
      }
      updates.push("pin = ?");
      values.push(pin ? String(pin).trim() : null);
    }
    if (is_active !== undefined) { updates.push("is_active = ?"); values.push(is_active ? 1 : 0); }
    if (password) {
      updates.push("password = ?");
      values.push(password);
    }

    if (!updates.length) {
      return res.status(400).json({ message: "Tidak ada data yang diperbarui" });
    }

    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    res.status(200).json({ message: "Data akun berhasil diperbarui" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: hapus pegawai
export async function deleteUser(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    if (req.user?.id === Number(id)) {
      return res.status(400).json({ message: "Tidak dapat menghapus akun sendiri!" });
    }

    try {
      await pool.query("DELETE FROM users WHERE id = ?", [id]);
      res.status(200).json({ message: "Akun berhasil dihapus" });
    } catch {
      await pool.query("UPDATE users SET is_active = 0 WHERE id = ?", [id]);
      res.status(200).json({ message: "Akun memiliki riwayat transaksi, status diubah menjadi nonaktif" });
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
