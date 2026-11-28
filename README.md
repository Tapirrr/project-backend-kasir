# Sistem Backend Aplikasi Kasir (POS)

Backend sistem kasir modern dengan konfigurasi yang seragam dengan template `project-backend` (Node.js, Express, TypeScript, MySQL2, Cloudinary, Multer).

---

## 📁 Struktur Direktori

```text
backend/
├── node_modules/
├── src/
│   ├── controllers/
│   │   ├── categoryController.ts   # Kategori produk
│   │   ├── orderController.ts      # Transaksi kasir, item snapshot, struk digital
│   │   ├── productController.ts    # CRUD produk, upload Cloudinary, toggle tampil/sembunyi
│   │   ├── shiftController.ts      # Buka/tutup shift, modal awal, cek selisih kas
│   │   └── userController.ts       # Login, logout, profil, admin CRUD pegawai
│   ├── db/
│   │   ├── cloudinary.ts           # Konfigurasi & helper upload Cloudinary SDK
│   │   └── index.ts                # Koneksi MySQL pool promise
│   ├── middlewares/
│   │   ├── adminMiddleware.ts      # Middleware proteksi admin (bukan atmin!!)
│   │   └── authMiddleware.ts       # Middleware JWT token verification
│   └── app.ts                      # Entry point Express, multer, & endpoint routing
├── .env                            # Variabel lingkungan aktif
├── .env.example                    # Template konfigurasi environment
├── package.json                    # Dependensi & script dev
├── schema.sql                      # Database schema & seed data
└── tsconfig.json                   # Konfigurasi TypeScript nodenext
```

---

## 📋 Daftar Endpoint API

### 1. Users & Hak Akses
- `POST /api/login` - Login pengguna (mengembalikan JWT token)
- `POST /api/logout` - Logout (authMiddleware)
- `GET /api/me` - Profil user yang sedang login (authMiddleware)
- `GET /api/users` - Admin: melihat daftar semua pegawai (authMiddleware, adminMiddleware)
- `GET /api/users/:id` - Admin: detail akun pegawai (authMiddleware, adminMiddleware)
- `POST /api/users` - Admin: membuat akun pegawai baru (authMiddleware, adminMiddleware)
- `PUT /api/users/:id` - Admin: mengedit data pegawai (authMiddleware, adminMiddleware)
- `DELETE /api/users/:id` - Admin: menghapus akun pegawai (authMiddleware, adminMiddleware)

### 2. Kategori Produk
- `GET /api/categories` - Melihat semua kategori produk
- `GET /api/categories/:id` - Detail kategori & produk di dalamnya
- `POST /api/categories` - Admin: tambah kategori baru
- `PUT /api/categories/:id` - Admin: edit kategori
- `DELETE /api/categories/:id` - Admin: hapus kategori

### 3. Produk & Gambar Cloudinary
- `GET /api/products` - Melihat daftar produk (filter kategori, search, sort, kasir hanya melihat yang dijual)
- `GET /api/products/:id` - Detail produk
- `POST /api/products` - Admin: tambah produk + upload foto Cloudinary (`upload.single("image")`)
- `PUT /api/products/:id` - Admin: edit produk + ganti foto Cloudinary (`upload.single("image")`)
- `DELETE /api/products/:id` - Admin: hapus produk
- `PATCH /api/products/:id/visibility` - Admin: sembunyikan / tampilkan produk yang tidak dijual
- `PATCH /api/products/:id/stock` - Admin: atur jumlah stok produk

### 4. Shift Kasir
- `POST /api/shifts/open` - Buka shift kasir & input modal awal uang kas (PIN & token dibuat)
- `GET /api/shifts/current` - Cek shift aktif kasir & ringkasan penjualan real-time
- `POST /api/shifts/close` - Tutup shift, input kas fisik aktual & hitung selisih uang kas
- `GET /api/shifts` - Riwayat shift kasir
- `GET /api/shifts/:id` - Detail shift kasir & transaksi di dalamnya

### 5. Transaksi & Struk Digital
- `POST /api/orders` - Transaksi kasir baru (no order otomatis, snapshot harga, kembalian, stok berkurang)
- `GET /api/orders` - Riwayat semua transaksi kasir
- `GET /api/orders/:id` - Detail transaksi kasir beserta item yang dibeli
- `PATCH /api/orders/:id/status` - Update status order (`COMPLETED` / `CANCELLED`)
- `PATCH /api/orders/:id/payment` - Update status pembayaran (`PAID` / `UNPAID`)
- `GET /api/orders/receipt/:token` - Struk digital pelanggan (akses publik via token struk)
