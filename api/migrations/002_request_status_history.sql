CREATE TABLE IF NOT EXISTS request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL,
  request_id UUID NOT NULL,

  from_status TEXT,
  to_status TEXT NOT NULL CHECK (
    to_status IN (
      'draft',
      'processing',
      'review_required',
      'approved',
      'rejected',
      'cancelled'
    )
  ),

  comment TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (organization_id, request_id)
    REFERENCES procurement_requests(organization_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_request_status_history_request
  ON request_status_history(
    organization_id,
    request_id,
    changed_at DESC
  );

ALTER TABLE request_status_history ENABLE ROW LEVEL SECURITY;