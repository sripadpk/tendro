import express from "express";
import cors from "cors";
import requestsRouter from "./requests.js";
import createRequestRouter from "./create-request.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use("/api/requests", requestsRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Tendro API",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/requests", createRequestRouter);

app.listen(PORT, () => {
  console.log(`Tendro API running at http://localhost:${PORT}`);
});
