import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import "dotenv/config";
import pool from "./db/index.ts";
import { authMiddleware } from "./middlewares/authMiddleware.ts";
import { adminMiddleware } from "./middlewares/adminMiddleware.ts";
import type { AuthRequest } from "./middlewares/authMiddleware.ts";
import { uploadToCloudinary } from "./db/cloudinary.ts";

import {
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

import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
} from "./controllers/categoryController.ts";

import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  toggleProductVisibility,
  updateProduct,
  updateProductStock,
} from "./controllers/productController.ts";

import {
  closeShift,
  getAllShifts,
  getCurrentShift,
  getShiftById,
  openShift,
} from "./controllers/shiftController.ts";

import {
  createOrder,
  getAllOrders,
  getOrderById,
  getReceiptByToken,
  updateOrderStatus,
  updatePaymentStatus,
} from "./controllers/orderController.ts";

const app: Express = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Hanya file gambar yang diperbolehkan!"));
  },
});

// ==========================================
// 1. FITUR USERS & HAK AKSES
// ==========================================

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

// ==========================================
// 2. FITUR KATEGORI PRODUK
// ==========================================

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

// ==========================================
// 3. FITUR PRODUCTS
// ==========================================

// melihat daftar produk (pegawai: hanya produk dijual, admin: semua produk)
app.get("/api/products", authMiddleware, getAllProducts);

// detail produk
app.get("/api/products/:id", authMiddleware, getProductById);

// admin: menambahkan produk & unggah gambar ke cloudinary
app.post("/api/products", authMiddleware, adminMiddleware, upload.single("image"), createProduct);

// admin: mengedit produk & update gambar cloudinary
app.put("/api/products/:id", authMiddleware, adminMiddleware, upload.single("image"), updateProduct);

// admin: menghapus produk
app.delete("/api/products/:id", authMiddleware, adminMiddleware, deleteProduct);

// admin: menyembunyikan / menampilkan produk yang tidak dijual
app.patch("/api/products/:id/visibility", authMiddleware, adminMiddleware, toggleProductVisibility);

// admin: mengatur stok produk
app.patch("/api/products/:id/stock", authMiddleware, adminMiddleware, updateProductStock);

// ==========================================
// 4. FITUR SHIFTS
// ==========================================

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

// ==========================================
// 5. FITUR ORDERS & ORDER ITEMS
// ==========================================

// membuat transaksi baru (nomor pesanan otomatis, nama pelanggan, offline/online, subtotal, diskon, pajak, kembalian, struk token)
app.post("/api/orders", authMiddleware, createOrder);

// melihat semua daftar transaksi
app.get("/api/orders", authMiddleware, getAllOrders);

// melihat detail transaksi beserta daftar item yang dibeli
app.get("/api/orders/:id", authMiddleware, getOrderById);

// memperbarui status pesanan (PENDING, PROCESSING, COMPLETED, CANCELLED)
app.patch("/api/orders/:id/status", authMiddleware, updateOrderStatus);

// memperbarui status pembayaran (UNPAID, PAID, FAILED, REFUNDED)
app.patch("/api/orders/:id/payment", authMiddleware, updatePaymentStatus);

// melihat struk digital (akses publik via token struk)
app.get("/api/orders/receipt/:token", getReceiptByToken);

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
