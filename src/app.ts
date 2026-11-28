import express, { type Express } from "express";
import cors from "cors";
import "dotenv/config";
import "./db/index.ts";
import { authMiddleware } from "./middlewares/authMiddleware.ts";

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

// 5. FITUR ORDERS & ORDER ITEMS

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
