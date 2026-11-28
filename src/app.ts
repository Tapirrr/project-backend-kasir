import express, { type Express } from "express";
import cors from "cors";
import "dotenv/config";
import "./db/index.ts";
import { authMiddleware } from "./middlewares/authMiddleware.ts";
import { adminMiddleware } from "./middlewares/adminMiddleware.ts";

import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
} from "./controllers/categoryController.ts";

const app: Express = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
