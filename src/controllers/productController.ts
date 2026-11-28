import type { Request, Response } from "express";
import pool from "../db/index.ts";
import { uploadToCloudinary } from "../db/cloudinary.ts";
import type { AuthRequest } from "../middlewares/authMiddleware.ts";

// semua produk (kasir: hanya produk dijual, admin: semua produk)
export async function getAllProducts(req: AuthRequest, res: Response) {
  try {
    const { category_id, is_active, search, sort = "name_asc" } = req.query;

    let query = `
      SELECT p.id, p.category_id, c.name AS category_name, p.sku, p.name, 
             p.description, p.price, p.cost_price, p.stock, p.image_url, 
             p.is_active, p.created_at, p.updated_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category_id) {
      query += " AND p.category_id = ?";
      params.push(category_id);
    }

    if (is_active !== undefined) {
      query += " AND p.is_active = ?";
      params.push(is_active === "true" || is_active === "1" ? 1 : 0);
    } else if (req.user && req.user.role === "pegawai") {
      query += " AND p.is_active = 1";
    }

    if (search) {
      query += " AND (p.name LIKE ? OR p.sku LIKE ?)";
      const kw = `%${search}%`;
      params.push(kw, kw);
    }

    switch (sort) {
      case "price_asc": query += " ORDER BY p.price ASC"; break;
      case "price_desc": query += " ORDER BY p.price DESC"; break;
      case "stock_asc": query += " ORDER BY p.stock ASC"; break;
      case "stock_desc": query += " ORDER BY p.stock DESC"; break;
      case "newest": query += " ORDER BY p.created_at DESC"; break;
      default: query += " ORDER BY p.name ASC"; break;
    }

    const [rows]: any = await pool.query(query, params);
    res.status(200).json({ total: rows.length, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// detail produk
export async function getProductById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      `SELECT p.*, c.name AS category_name 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    res.status(200).json({ data: rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: tambah produk (upload gambar cloudinary)
export async function createProduct(req: Request, res: Response) {
  try {
    const { name, category_id, sku, description, price, cost_price = 0, stock = 0, is_active = 1 } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ message: "Nama dan harga jual produk wajib diisi!" });
    }

    const finalSku = sku && sku.trim() ? sku.trim() : `SKU-${Date.now().toString().slice(-6)}`;

    let imageUrl: string | null = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer);
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    }

    const [result]: any = await pool.query(
      `INSERT INTO products 
        (category_id, sku, name, description, price, cost_price, stock, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id ? Number(category_id) : null,
        finalSku,
        name.trim(),
        description || null,
        Number(price),
        Number(cost_price),
        Number(stock),
        imageUrl,
        Number(is_active) === 0 ? 0 : 1,
      ]
    );

    res.status(201).json({
      message: "Produk berhasil ditambahkan",
      data: { id: result.insertId, name, price, stock, sku: finalSku, image_url: imageUrl },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: edit produk (upload gambar baru cloudinary)
export async function updateProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, category_id, sku, description, price, cost_price, stock, is_active } = req.body;

    const [exist]: any = await pool.query("SELECT * FROM products WHERE id = ?", [id]);
    if (!exist.length) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    let imageUrl = exist[0].image_url;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer);
    } else if (req.body.image_url !== undefined) {
      imageUrl = req.body.image_url;
    }

    await pool.query(
      `UPDATE products SET
        category_id = COALESCE(?, category_id),
        sku = COALESCE(?, sku),
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        cost_price = COALESCE(?, cost_price),
        stock = COALESCE(?, stock),
        image_url = ?,
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        category_id !== undefined ? Number(category_id) : null,
        sku !== undefined ? sku.trim() : null,
        name !== undefined ? name.trim() : null,
        description !== undefined ? description : null,
        price !== undefined ? Number(price) : null,
        cost_price !== undefined ? Number(cost_price) : null,
        stock !== undefined ? Number(stock) : null,
        imageUrl,
        is_active !== undefined ? (Number(is_active) === 0 ? 0 : 1) : null,
        id,
      ]
    );

    res.status(200).json({ message: "Produk berhasil diperbarui" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: hapus produk
export async function deleteProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM products WHERE id = ?", [id]);
      res.status(200).json({ message: "Produk berhasil dihapus" });
    } catch {
      await pool.query("UPDATE products SET is_active = 0 WHERE id = ?", [id]);
      res.status(200).json({ message: "Produk terikat transaksi, otomatis disembunyikan" });
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: sembunyikan / tampilkan produk yang tidak dijual
export async function toggleProductVisibility(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const [exist]: any = await pool.query("SELECT id, is_active FROM products WHERE id = ?", [id]);
    if (!exist.length) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    const newStatus = is_active !== undefined ? (is_active ? 1 : 0) : exist[0].is_active ? 0 : 1;
    await pool.query("UPDATE products SET is_active = ? WHERE id = ?", [newStatus, id]);

    res.status(200).json({
      message: newStatus === 1 ? "Produk ditampilkan (siap dijual)" : "Produk disembunyikan (tidak dijual)",
      is_active: newStatus === 1,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: atur stok produk
export async function updateProductStock(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { stock, adjustment } = req.body;

    const [exist]: any = await pool.query("SELECT id, stock FROM products WHERE id = ?", [id]);
    if (!exist.length) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    let newStock = Number(exist[0].stock);
    if (stock !== undefined) newStock = Math.max(0, Number(stock));
    else if (adjustment !== undefined) newStock = Math.max(0, newStock + Number(adjustment));

    await pool.query("UPDATE products SET stock = ? WHERE id = ?", [newStock, id]);
    res.status(200).json({ message: "Stok berhasil diatur", stock: newStock });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
