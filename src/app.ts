import express, { type Express } from "express";
import cors from "cors";
import "dotenv/config";
import "./db/index.ts";
import { authMiddleware } from "./middlewares/authMiddleware.ts";
import {
  closeShift,
  getAllShifts,
  getCurrentShift,
  getShiftById,
  openShift,
} from "./controllers/shiftController.ts";
import { adminMiddleware } from "./middlewares/adminMiddleware.ts";

import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
} from "./controllers/categoryController.ts";
  createUser,
  deleteUser,
  getActiveCashiers,
  getAllUsers,
  getProfile,
  getUserById,
  login,
  logout,
  updateUser,
} from "./controllers/userController.ts";


const app: Express = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 4. FITUR SHIFTS

// membuka shift kasir & memasukkan modal awal uang kas (PIN & token shift dibuat)
app.post("/api/shifts/open", authMiddleware, openShift);

// melihat shift aktif kasir saat ini beserta ringkasan penjualan real-time
app.get("/api/shifts/current", authMiddleware, getCurrentShift);

// menutup shift kasir, memasukkan uang kas fisik aktual & hitung selisih kas
app.post("/api/shifts/close", authMiddleware, closeShift);

// melihat riwayat shift (admin: semua shift kasir, pegawai: shift sendiri)
app.get("/api/shifts", authMiddleware, getAllShifts);

// detail shift tertentu beserta daftar transaksi
app.get("/api/shifts/:id", authMiddleware, getShiftById);

// 2. FITUR KATEGORI PRODUK

// melihat semua kategori produk
app.get("/api/categories", authMiddleware, getAllCategories);

// detail kategori produk
app.get("/api/categories/:id", authMiddleware, getCategoryById);

// admin: menambahkan kategori
app.post("/api/categories", authMiddleware, adminMiddleware, createCategory);

// admin: mengedit kategori
app.put("/api/categories/:id", authMiddleware, adminMiddleware, updateCategory);

// admin: menghapus kategori
app.delete("/api/categories/:id", authMiddleware, adminMiddleware, deleteCategory);


// 1. FITUR USERS & HAK AKSES

// ini buat login
app.post("/api/login", login);

// daftar kasir aktif untuk login cepat
app.get("/api/cashiers", getActiveCashiers);

// ini buat logout
app.post("/api/logout", authMiddleware, logout);

// profil user yang sedang login
app.get("/api/me", authMiddleware, getProfile);

// admin: semua user / pegawai
app.get("/api/users", authMiddleware, adminMiddleware, getAllUsers);

// detail user / pegawai
app.get("/api/users/:id", authMiddleware, adminMiddleware, getUserById);

// admin: buat akun pegawai baru
app.post("/api/users", authMiddleware, adminMiddleware, createUser);

// admin: edit akun pegawai
app.put("/api/users/:id", authMiddleware, adminMiddleware, updateUser);

// admin: hapus pegawai
app.delete("/api/users/:id", authMiddleware, adminMiddleware, deleteUser);

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
