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

const app: Express = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
