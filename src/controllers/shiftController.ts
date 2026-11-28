import type { Request, Response } from "express";
import crypto from "crypto";
import pool from "../db/index.ts";
import type { AuthRequest } from "../middlewares/authMiddleware.ts";

// buka shift kasir baru (input modal awal, generate PIN & token shift)
export async function openShift(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { starting_cash = 0, shift_pin } = req.body;

    const startingCashNum = Number(starting_cash);
    if (isNaN(startingCashNum) || startingCashNum < 0) {
      return res.status(400).json({ message: "Modal awal uang kas harus berupa angka valid!" });
    }

    const [active]: any = await pool.query(
      "SELECT id FROM shifts WHERE user_id = ? AND status = 'OPEN'",
      [userId]
    );

    if (active.length) {
      return res.status(400).json({ message: "Anda masih memiliki shift aktif! Harap tutup shift sebelumnya." });
    }

    if (!shift_pin || !/^\d{4,6}$/.test(String(shift_pin).trim())) {
      return res.status(400).json({ message: "PIN shift (4-6 digit angka) wajib diisi saat membuka shift kasir!" });
    }

    const finalPin = String(shift_pin).trim();

    const shiftToken = `SFT-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const [result]: any = await pool.query(
      "INSERT INTO shifts (user_id, shift_token, shift_pin, starting_cash, status, opened_at) VALUES (?, ?, ?, ?, 'OPEN', NOW())",
      [userId, shiftToken, finalPin, startingCashNum]
    );

    res.status(201).json({
      message: "Shift kasir berhasil dibuka",
      data: {
        id: result.insertId,
        shift_token: shiftToken,
        shift_pin: finalPin,
        starting_cash: startingCashNum,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// shift aktif kasir saat ini + real-time transaksi
export async function getCurrentShift(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const [shifts]: any = await pool.query(
      "SELECT s.*, u.name as cashier_name FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.user_id = ? AND s.status = 'OPEN' ORDER BY s.opened_at DESC LIMIT 1",
      [userId]
    );

    if (!shifts.length) {
      return res.status(200).json({ has_active_shift: false, data: null });
    }

    const shift = shifts[0];
    const [sales]: any = await pool.query(
      `SELECT 
         COUNT(id) as total_trx,
         COALESCE(SUM(CASE WHEN payment_method = 'CASH' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as cash_sales,
         COALESCE(SUM(CASE WHEN payment_method != 'CASH' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as non_cash_sales
       FROM orders WHERE shift_id = ?`,
      [shift.id]
    );

    const startingCash = Number(shift.starting_cash);
    const cashSales = Number(sales[0].cash_sales);
    const expectedCash = startingCash + cashSales;

    res.status(200).json({
      has_active_shift: true,
      data: {
        ...shift,
        summary: {
          starting_cash: startingCash,
          cash_sales: cashSales,
          non_cash_sales: Number(sales[0].non_cash_sales),
          expected_cash: expectedCash,
          total_transactions: Number(sales[0].total_trx),
        },
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// tutup shift kasir (input kas fisik aktual, hitung selisih kas)
export async function closeShift(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { actual_cash, notes, shift_pin, shift_id } = req.body;

    if (actual_cash === undefined || isNaN(Number(actual_cash))) {
      return res.status(400).json({ message: "Uang kas fisik aktual di laci (actual_cash) wajib diisi!" });
    }

    const actualCashNum = Number(actual_cash);

    let query = "SELECT * FROM shifts WHERE status = 'OPEN'";
    const params: any[] = [];
    if (shift_id) {
      query += " AND id = ?";
      params.push(shift_id);
    } else {
      query += " AND user_id = ?";
      params.push(userId);
    }

    const [shifts]: any = await pool.query(query, params);
    if (!shifts.length) {
      return res.status(404).json({ message: "Tidak ada shift aktif yang ditemukan" });
    }

    const shift = shifts[0];
    if (!shift_pin || String(shift_pin).trim() === "") {
      return res.status(400).json({ message: "PIN shift wajib diisi untuk menutup shift kasir!" });
    }
    if (shift.shift_pin && shift.shift_pin !== String(shift_pin).trim()) {
      return res.status(403).json({ message: "PIN shift tidak sesuai!" });
    }

    const [sales]: any = await pool.query(
      `SELECT 
         COUNT(id) as total_trx,
         COALESCE(SUM(CASE WHEN payment_method = 'CASH' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as cash_sales,
         COALESCE(SUM(CASE WHEN payment_method != 'CASH' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as non_cash_sales
       FROM orders WHERE shift_id = ?`,
      [shift.id]
    );

    const totalCashSales = Number(sales[0].cash_sales);
    const totalNonCashSales = Number(sales[0].non_cash_sales);
    const startingCash = Number(shift.starting_cash);
    const expectedCash = startingCash + totalCashSales;
    const cashDifference = actualCashNum - expectedCash; // Selisih uang kas

    await pool.query(
      `UPDATE shifts SET
         actual_cash = ?, expected_cash = ?, cash_difference = ?,
         total_cash_sales = ?, total_non_cash_sales = ?, total_transactions = ?,
         notes = COALESCE(?, notes), status = 'CLOSED', closed_at = NOW()
       WHERE id = ?`,
      [
        actualCashNum, expectedCash, cashDifference,
        totalCashSales, totalNonCashSales, Number(sales[0].total_trx),
        notes || null, shift.id,
      ]
    );

    res.status(200).json({
      message: "Shift kasir berhasil ditutup",
      summary: {
        starting_cash: startingCash,
        total_cash_sales: totalCashSales,
        total_non_cash_sales: totalNonCashSales,
        expected_cash: expectedCash,
        actual_cash: actualCashNum,
        cash_difference: cashDifference,
        status: cashDifference === 0 ? "PAS" : cashDifference > 0 ? "LEBIH" : "KURANG",
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// riwayat semua shift
export async function getAllShifts(req: AuthRequest, res: Response) {
  try {
    const { status, user_id } = req.query;
    let query = "SELECT s.*, u.name as cashier_name FROM shifts s JOIN users u ON s.user_id = u.id WHERE 1=1";
    const params: any[] = [];

    if (req.user?.role === "pegawai") {
      query += " AND s.user_id = ?";
      params.push(req.user.id);
    } else if (user_id) {
      query += " AND s.user_id = ?";
      params.push(user_id);
    }

    if (status) {
      query += " AND s.status = ?";
      params.push(status);
    }

    query += " ORDER BY s.opened_at DESC";
    const [rows]: any = await pool.query(query, params);
    res.status(200).json({ total: rows.length, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// detail shift tertentu
export async function getShiftById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const [shifts]: any = await pool.query(
      "SELECT s.*, u.name as cashier_name FROM shifts s JOIN users u ON s.user_id = u.id WHERE s.id = ?",
      [id]
    );

    if (!shifts.length) {
      return res.status(404).json({ message: "Shift tidak ditemukan" });
    }

    const shift = shifts[0];
    if (req.user?.role === "pegawai" && shift.user_id !== req.user.id) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const [orders]: any = await pool.query("SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC", [id]);
    res.status(200).json({ data: { ...shift, orders } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
