import { Router } from "express";
import { pool } from "./db.js";

const router = Router();

// Local development only. Replace with authenticated organization
// access before exposing this endpoint publicly.
const DEMO_ORGANIZATION_ID =
  "929d6893-09f5-4e97-afd5-608c54db28fc";

router.post("/", async (req, res) => {
  const { title, description, items } = req.body ?? {};

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 200
  ) {
    res.status(400).json({
      success: false,
      message: "Title is required and must be at most 200 characters.",
    });
    return;
  }

  if (
    description !== undefined &&
    description !== null &&
    (typeof description !== "string" || description.length > 2000)
  ) {
    res.status(400).json({
      success: false,
      message: "Description must be at most 2000 characters.",
    });
    return;
  }

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 100
  ) {
    res.status(400).json({
      success: false,
      message: "Add between 1 and 100 line items.",
    });
    return;
  }

  for (const item of items) {
    if (
      !item ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.trim().length > 200 ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 1_000_000_000 ||
      typeof item.unit !== "string" ||
      !item.unit.trim() ||
      item.unit.trim().length > 30
    ) {
      res.status(400).json({
        success: false,
        message:
          "Each item needs a name, a positive quantity, and a unit.",
      });
      return;
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const requestResult = await client.query(
      `INSERT INTO procurement_requests
         (organization_id, title, description, status)
       VALUES ($1, $2, $3, 'draft')
       RETURNING id, request_number, title, description, status, created_at`,
      [
        DEMO_ORGANIZATION_ID,
        title.trim(),
        description?.trim() || null,
      ],
    );

    const request = requestResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO request_items
           (organization_id, request_id, name, quantity, unit)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          DEMO_ORGANIZATION_ID,
          request.id,
          item.name.trim(),
          item.quantity,
          item.unit.trim(),
        ],
      );
    }

    await client.query(
      `INSERT INTO request_status_history
        (organization_id, request_id, from_status, to_status, comment)
      VALUES ($1, $2, NULL, $3, $4)`,
      [
        DEMO_ORGANIZATION_ID,
        request.id,
        "draft",
        "Request created",
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      data: request,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create procurement request:", error);
    res.status(500).json({
      success: false,
      message: "Could not create the purchase request.",
    });
  } finally {
    client.release();
  }
});

export default router;
