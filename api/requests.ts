import { Router } from "express";
import { pool } from "./db.js";

const router = Router();

// Local demo endpoint.
// Keep this restricted until authentication and authorization
// are implemented.
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.request_number,
         r.title,
         r.description,
         r.status,
         r.created_at,
         o.name AS organization_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id', i.id,
               'name', i.name,
               'quantity', i.quantity,
               'unit', i.unit
             )
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM procurement_requests r
       JOIN organizations o
         ON o.id = r.organization_id
       LEFT JOIN request_items i
         ON i.request_id = r.id
        AND i.organization_id = r.organization_id
       WHERE r.organization_id = $1
       GROUP BY r.id, o.name
       ORDER BY r.created_at DESC`,
      ["929d6893-09f5-4e97-afd5-608c54db28fc"]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch procurement requests:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch procurement requests",
    });
  }
});

export default router;
