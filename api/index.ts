import express from "express";
import cors from "cors";
import requestsRouter from "./requests.js";
import createRequestRouter from "./create-request.js";
import requestWorkflowRouter from "./request-workflow.js";
import { requireAuth } from "./auth.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use("/api/requests", requireAuth, requestsRouter);
app.use("/api/requests", requireAuth, requestWorkflowRouter);
app.use("/api/requests", requireAuth, createRequestRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Tendro API",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Tendro API running at http://localhost:${PORT}`);
});
