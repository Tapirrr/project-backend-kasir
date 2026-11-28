import express, { type Express } from "express";
import cors from "cors";
import "dotenv/config";
import "./db/index.ts";

const app: Express = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
