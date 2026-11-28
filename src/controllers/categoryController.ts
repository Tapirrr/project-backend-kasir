import type { Request, Response } from "express";
import pool from "../db/index.ts";

// semua kategori
export async function getAllCategories(_req: Request, res: Response) {
  try {
    const query = `
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
             COUNT(p.id) AS total_products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      GROUP BY c.id
      ORDER BY c.name ASC
    `;
    const [rows]: any = await pool.query(query);
    res.status(200).json({ total: rows.length, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// detail kategori
export async function getCategoryById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [cat]: any = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
    if (!cat.length) {
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    }

    const [products]: any = await pool.query(
      "SELECT * FROM products WHERE category_id = ? AND is_active = 1 ORDER BY name ASC",
      [id]
    );

    res.status(200).json({ data: { ...cat[0], products } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: tambah kategori
export async function createCategory(req: Request, res: Response) {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Nama kategori wajib diisi!" });
    }

    const [exist]: any = await pool.query("SELECT id FROM categories WHERE name = ?", [name.trim()]);
    if (exist.length) {
      return res.status(409).json({ message: "Kategori sudah ada!" });
    }

    const [result]: any = await pool.query(
      "INSERT INTO categories (name, description) VALUES (?, ?)",
      [name.trim(), description || null]
    );

    res.status(201).json({
      message: "Kategori berhasil dibuat",
      data: { id: result.insertId, name: name.trim(), description },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: edit kategori
export async function updateCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const [exist]: any = await pool.query("SELECT id FROM categories WHERE id = ?", [id]);
    if (!exist.length) {
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    }

    if (name) {
      const [dup]: any = await pool.query("SELECT id FROM categories WHERE name = ? AND id != ?", [name.trim(), id]);
      if (dup.length) {
        return res.status(409).json({ message: "Nama kategori sudah ada!" });
      }
    }

    await pool.query(
      "UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?",
      [name ? name.trim() : null, description !== undefined ? description : null, id]
    );

    res.status(200).json({ message: "Kategori berhasil diperbarui" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// admin: hapus kategori
export async function deleteCategory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    res.status(200).json({ message: "Kategori berhasil dihapus" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
