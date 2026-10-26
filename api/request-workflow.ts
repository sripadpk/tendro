import { Router } from "express";
import { pool } from "./db.js";

const router = Router();

const DEMO_ORGANIZATION_ID =
  "929d6893-09f5-4e97-afd5-608c54db28fc";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_STATUSES = [
  "draft",
  "processing",
  "review_required",
  "approved",
  "rejected",
  "cancelled",
] as const;

// Submit a draft for approval.
router.post("/:id/submit", async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid request ID.",
    });
    return;
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `SELECT id, status
       FROM procurement_requests
       WHERE id = $1
         AND organization_id = $2
       FOR UPDATE`,
      [id, DEMO_ORGANIZATION_ID]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      res.status(404).json({
        success: false,
        message: "Purchase request not found.",
      });
      return;
    }

    const currentStatus = result.rows[0].status;

    if (currentStatus !== "draft") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      res.status(409).json({
        success: false,
        message: "Only draft requests can be submitted.",
        currentStatus,
      });
      return;
    }

    await client.query(
      `UPDATE procurement_requests
       SET status = 'review_required',
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2`,
      [id, DEMO_ORGANIZATION_ID]
    );

    await client.query(
      `INSERT INTO request_status_history
         (organization_id, request_id, from_status, to_status, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        DEMO_ORGANIZATION_ID,
        id,
        currentStatus,
        "review_required",
        "Submitted for approval",
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: "Purchase request submitted for approval.",
      data: {
        id,
        previousStatus: currentStatus,
        status: "review_required",
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Failed to submit purchase request:", error);

    res.status(500).json({
      success: false,
      message: "Could not submit the purchase request.",
    });
  } finally {
    client.release();
  }
});

// Approve or reject a request awaiting approval.
router.post("/:id/decision", async (req, res) => {
  const { id } = req.params;
  const { decision, comment } = req.body ?? {};

  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid request ID.",
    });
    return;
  }

  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({
      success: false,
      message: 'Decision must be "approve" or "reject".',
    });
    return;
  }

  if (
    comment !== undefined &&
    comment !== null &&
    (typeof comment !== "string" || comment.trim().length > 2000)
  ) {
    res.status(400).json({
      success: false,
      message: "Comment must be at most 2000 characters.",
    });
    return;
  }

  const newStatus = decision === "approve" ? "approved" : "rejected";
  const cleanComment =
    typeof comment === "string" ? comment.trim() || null : null;

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `SELECT id, status
       FROM procurement_requests
       WHERE id = $1
         AND organization_id = $2
       FOR UPDATE`,
      [id, DEMO_ORGANIZATION_ID]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      res.status(404).json({
        success: false,
        message: "Purchase request not found.",
      });
      return;
    }

    const currentStatus = result.rows[0].status;

    if (currentStatus !== "review_required") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      res.status(409).json({
        success: false,
        message: "Only requests awaiting approval can receive a decision.",
        currentStatus,
      });
      return;
    }

    await client.query(
      `UPDATE procurement_requests
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
         AND organization_id = $3`,
      [newStatus, id, DEMO_ORGANIZATION_ID]
    );

    await client.query(
      `INSERT INTO request_status_history
         (organization_id, request_id, from_status, to_status, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        DEMO_ORGANIZATION_ID,
        id,
        currentStatus,
        newStatus,
        cleanComment,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: `Purchase request ${newStatus}.`,
      data: {
        id,
        previousStatus: currentStatus,
        status: newStatus,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Failed to decide purchase request:", error);

    res.status(500).json({
      success: false,
      message: "Could not update the purchase request.",
    });
  } finally {
    client.release();
  }
});

// Retrieve the status history for a request.
router.get("/:id/history", async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid request ID.",
    });
    return;
  }

  try {
    const requestResult = await pool.query(
      `SELECT id
       FROM procurement_requests
       WHERE id = $1
         AND organization_id = $2`,
      [id, DEMO_ORGANIZATION_ID]
    );

    if (requestResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: "Purchase request not found.",
      });
      return;
    }

    const historyResult = await pool.query(
      `SELECT
         id,
         from_status,
         to_status,
         comment,
         changed_by,
         changed_at
       FROM request_status_history
       WHERE request_id = $1
         AND organization_id = $2
       ORDER BY changed_at ASC`,
      [id, DEMO_ORGANIZATION_ID]
    );

    res.json({
      success: true,
      data: historyResult.rows,
    });
  } catch (error) {
    console.error("Failed to fetch request history:", error);

    res.status(500).json({
      success: false,
      message: "Could not fetch request history.",
    });
  }
});

export default router;
