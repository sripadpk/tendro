import "dotenv/config";
import { pool } from "./db.js";

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create or find our demo organization.
    let result = await client.query(
      "SELECT id FROM organizations WHERE name = $1",
      ["Acme Manufacturing (Demo)"]
    );

    let organizationId: string;

    if (result.rows.length > 0) {
      organizationId = result.rows[0].id;
    } else {
      result = await client.query(
        `INSERT INTO organizations (name)
         VALUES ($1)
         RETURNING id`,
        ["Acme Manufacturing (Demo)"]
      );

      organizationId = result.rows[0].id;
    }

    // Create or find a demo supplier.
    result = await client.query(
      `SELECT id FROM suppliers
       WHERE organization_id = $1 AND name = $2`,
      [organizationId, "Precision Parts Co."]
    );

    let supplierId: string;

    if (result.rows.length > 0) {
      supplierId = result.rows[0].id;
    } else {
      result = await client.query(
        `INSERT INTO suppliers
          (organization_id, name, email)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          organizationId,
          "Precision Parts Co.",
          "sales@example.com",
        ]
      );

      supplierId = result.rows[0].id;
    }

    // Create or find a procurement request.
    result = await client.query(
      `SELECT id FROM procurement_requests
       WHERE organization_id = $1 AND title = $2`,
      [organizationId, "Industrial Fasteners"]
    );

    let requestId: string;

    if (result.rows.length > 0) {
      requestId = result.rows[0].id;
    } else {
      result = await client.query(
        `INSERT INTO procurement_requests
          (organization_id, title, description, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          organizationId,
          "Industrial Fasteners",
          "Purchase fasteners for the next production batch.",
          "draft",
        ]
      );

      requestId = result.rows[0].id;
    }

    // Add the item only if it doesn't already exist.
    const itemResult = await client.query(
      `SELECT id FROM request_items
       WHERE organization_id = $1
         AND request_id = $2
         AND name = $3`,
      [organizationId, requestId, "Stainless Steel Bolts"]
    );

    if (itemResult.rows.length === 0) {
      await client.query(
        `INSERT INTO request_items
          (organization_id, request_id, name, quantity, unit)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          organizationId,
          requestId,
          "Stainless Steel Bolts",
          100,
          "pieces",
        ]
      );
    }

    await client.query("COMMIT");

    console.log("Demo data seeded successfully!");
    console.log("Demo organization ID:", organizationId);
    console.log("Demo supplier: Precision Parts Co.");
    console.log("Demo request: Industrial Fasteners");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
