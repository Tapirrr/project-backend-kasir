import type { Request, Response } from "express";
import crypto from "crypto";
import pool from "../db/index.ts";
import type { AuthRequest } from "../middlewares/authMiddleware.ts";

// helper no pesanan otomatis
function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `ORD-${dateStr}-${randomSuffix}`;
}

// helper token struk digital
function generateReceiptToken(): string {
  return `RCPT-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

// transaksi baru (order)
export async function createOrder(req: AuthRequest, res: Response) {
  const connection = await pool.getConnection();

  try {
    const userId = req.user?.id;
    const {
      customer_name = "Pelanggan Umum",
      order_source = "OFFLINE",
      payment_method = "CASH",
      paid_amount = 0,
      discount = 0,
      tax_rate = 0,
      tax = 0,
      notes,
      items,
      shift_id,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Item pesanan wajib diisi minimal 1 produk!" });
    }

    let finalShiftId: number | null = shift_id ? Number(shift_id) : null;
    if (!finalShiftId) {
      const [active]: any = await connection.query(
        "SELECT id FROM shifts WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
        [userId]
      );
      if (active.length) finalShiftId = active[0].id;
    }

    await connection.beginTransaction();

    let calculatedSubtotal = 0;
    const processedItems: any[] = [];

    for (const item of items) {
      const productId = Number(item.product_id);
      const qty = Number(item.quantity);

      if (!productId || isNaN(qty) || qty <= 0) {
        await connection.rollback();
        return res.status(400).json({ message: "Setiap item wajib memiliki product_id dan quantity > 0!" });
      }

      const [pRows]: any = await connection.query(
        "SELECT id, name, price, stock, is_active FROM products WHERE id = ? FOR UPDATE",
        [productId]
      );

      if (!pRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: `Produk ID ${productId} tidak ditemukan!` });
      }

      const product = pRows[0];
      if (!product.is_active) {
        await connection.rollback();
        return res.status(400).json({ message: `Produk '${product.name}' tidak dijual!` });
      }

      if (product.stock < qty) {
        await connection.rollback();
        return res.status(400).json({ message: `Stok produk '${product.name}' tidak mencukupi (sisa: ${product.stock})!` });
      }

      const unitPrice = Number(product.price);
      const itemSubtotal = unitPrice * qty;
      calculatedSubtotal += itemSubtotal;

      await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, productId]);

      processedItems.push({
        product_id: productId,
        product_name: product.name,
        unit_price: unitPrice,
        quantity: qty,
        subtotal: itemSubtotal,
        notes: item.notes ? String(item.notes).trim() : null,
      });
    }

    const discountAmount = Math.max(0, Number(discount) || 0);
    let taxAmount = Math.max(0, Number(tax) || 0);
    if (tax_rate && Number(tax_rate) > 0) {
      taxAmount = ((calculatedSubtotal - discountAmount) * Number(tax_rate)) / 100;
    }

    const totalAmount = Math.max(0, calculatedSubtotal - discountAmount + taxAmount);
    const normalizedMethod = String(payment_method).toUpperCase();
    let paidAmountNum = Number(paid_amount);
    let changeAmount = 0;

    if (normalizedMethod === "CASH") {
      if (paidAmountNum < totalAmount) {
        await connection.rollback();
        return res.status(400).json({
          message: `Uang pembayaran kurang! Total tagihan: ${totalAmount}, dibayar: ${paidAmountNum}`,
        });
      }
      changeAmount = paidAmountNum - totalAmount; // Kembalian
    } else {
      if (paidAmountNum === 0) paidAmountNum = totalAmount;
      changeAmount = 0;
    }

    const orderNumber = generateOrderNumber();
    const receiptToken = generateReceiptToken();

    const [orderResult]: any = await connection.query(
      `INSERT INTO orders 
        (order_number, user_id, shift_id, customer_name, order_source, 
         subtotal, discount, tax, total_amount, payment_method, 
         paid_amount, change_amount, payment_status, order_status, 
         receipt_token, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'COMPLETED', ?, ?, NOW())`,
      [
        orderNumber, userId, finalShiftId, customer_name.trim(),
        order_source.toUpperCase() === "ONLINE" ? "ONLINE" : "OFFLINE",
        calculatedSubtotal, discountAmount, taxAmount, totalAmount,
        normalizedMethod, paidAmountNum, changeAmount, receiptToken, notes || null,
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of processedItems) {
      await connection.query(
        "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [orderId, item.product_id, item.product_name, item.unit_price, item.quantity, item.subtotal, item.notes]
      );
    }

    if (finalShiftId) {
      if (normalizedMethod === "CASH") {
        await connection.query(
          "UPDATE shifts SET total_cash_sales = total_cash_sales + ?, total_transactions = total_transactions + 1 WHERE id = ?",
          [totalAmount, finalShiftId]
        );
      } else {
        await connection.query(
          "UPDATE shifts SET total_non_cash_sales = total_non_cash_sales + ?, total_transactions = total_transactions + 1 WHERE id = ?",
          [totalAmount, finalShiftId]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message: "Transaksi berhasil dibuat",
      data: {
        order_id: orderId,
        order_number: orderNumber,
        customer_name,
        total_amount: totalAmount,
        paid_amount: paidAmountNum,
        change_amount: changeAmount,
        payment_method: normalizedMethod,
        receipt_token: receiptToken,
        receipt_url: `/api/orders/receipt/${receiptToken}`,
        items: processedItems,
      },
    });
  } catch (err: any) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    connection.release();
  }
}

// riwayat semua order
export async function getAllOrders(req: AuthRequest, res: Response) {
  try {
    const { shift_id, user_id, payment_status, order_status, start_date, end_date } = req.query;

    let query = `
      SELECT o.*, u.name AS cashier_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (req.user?.role === "pegawai") {
      query += " AND o.user_id = ?";
      params.push(req.user.id);
    } else if (user_id) {
      query += " AND o.user_id = ?";
      params.push(user_id);
    }

    if (shift_id) { query += " AND o.shift_id = ?"; params.push(shift_id); }
    if (payment_status) { query += " AND o.payment_status = ?"; params.push(payment_status); }
    if (order_status) { query += " AND o.order_status = ?"; params.push(order_status); }
    if (start_date) { query += " AND DATE(o.created_at) >= ?"; params.push(start_date); }
    if (end_date) { query += " AND DATE(o.created_at) <= ?"; params.push(end_date); }

    query += " ORDER BY o.created_at DESC";

    const [rows]: any = await pool.query(query, params);
    res.status(200).json({ total: rows.length, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// detail order
export async function getOrderById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [orders]: any = await pool.query(
      "SELECT o.*, u.name AS cashier_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?",
      [id]
    );

    if (!orders.length) {
      return res.status(404).json({ message: "Transaksi tidak ditemukan" });
    }

    const [items]: any = await pool.query("SELECT * FROM order_items WHERE order_id = ?", [id]);
    res.status(200).json({ data: { ...orders[0], items } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// update status order
export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { order_status } = req.body;

    await pool.query("UPDATE orders SET order_status = ? WHERE id = ?", [order_status, id]);
    res.status(200).json({ message: "Status pesanan berhasil diubah" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// update status pembayaran
export async function updatePaymentStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;

    await pool.query("UPDATE orders SET payment_status = ? WHERE id = ?", [payment_status, id]);
    res.status(200).json({ message: "Status pembayaran berhasil diubah" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// struk digital (publik via token struk)
export async function getReceiptByToken(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const [orders]: any = await pool.query(
      "SELECT o.*, u.name AS cashier_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.receipt_token = ?",
      [token]
    );

    if (!orders.length) {
      return res.status(404).json({ message: "Struk digital tidak ditemukan!" });
    }

    const order = orders[0];
    const [items]: any = await pool.query("SELECT * FROM order_items WHERE order_id = ?", [order.id]);

    res.status(200).json({
      message: "Struk digital berhasil dimuat",
      data: {
        order_number: order.order_number,
        receipt_token: order.receipt_token,
        cashier_name: order.cashier_name,
        customer_name: order.customer_name,
        order_source: order.order_source,
        created_at: order.created_at,
        items,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        paid_amount: order.paid_amount,
        change_amount: order.change_amount,
        notes: order.notes,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
