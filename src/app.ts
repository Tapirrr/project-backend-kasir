import express, { type Express } from "express";
import cors from "cors";
import multer from "multer";
import "dotenv/config";
import "./db/index.ts";
import { authMiddleware } from "./middlewares/authMiddleware.ts";
import { adminMiddleware } from "./middlewares/adminMiddleware.ts";

import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  toggleProductVisibility,
  updateProduct,
  updateProductStock,
} from "./controllers/productController.ts";

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

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
