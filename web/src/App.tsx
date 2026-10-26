import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  CircleHelp,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Wallet,
  ArrowLeft,
} from "lucide-react";
import "./App.css";
import { supabase } from "./supabase";
import Auth from "./Auth";
import { LogOut } from "lucide-react";
import { apiFetch } from "./api";

type RequestItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
};

type ProcurementRequest = {
  id: string;
  request_number: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  organization_name: string;
  items: RequestItem[];
};

type ApiResponse = {
  success: boolean;
  data: ProcurementRequest[];
};


type RequestHistoryEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  changed_by: string | null;
  changed_at: string;
};

type HistoryApiResponse = {
  success: boolean;
  data: RequestHistoryEvent[];
};


const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Requests", icon: FileText, active: true },
  { label: "Suppliers", icon: Truck },
  { label: "Purchase orders", icon: ShoppingCart },
];

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error("Could not restore Supabase session:", error);
      }

      setIsAuthenticated(Boolean(data.session));
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  
  useEffect(() => {
    if (!selectedRequestId) {
      setHistory([]);
      setHistoryError("");
      return;
    }

    void loadRequestHistory(selectedRequestId);
  }, [selectedRequestId]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newItems, setNewItems] = useState([
    { name: "", quantity: "1", unit: "pieces" },
  ]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [history, setHistory] = useState<RequestHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadRequests() {
      try {
        const response = await apiFetch("/api/requests", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const result: ApiResponse = await response.json();

        if (!result.success || !Array.isArray(result.data)) {
          throw new Error("Unexpected response from the API");
        }

        setRequests(result.data);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadRequests();

    return () => controller.abort();
  }, []);

  const filteredRequests = requests.filter((request) => {
    const query = search.toLowerCase().trim();

    return (
      request.title.toLowerCase().includes(query) ||
      request.organization_name.toLowerCase().includes(query) ||
      request.request_number.includes(query)
    );
  });

  const totalItems = requests.reduce(
    (total, request) => total + request.items.length,
    0,
  );

  function addItem() {
  setNewItems((items) => [
    ...items,
    { name: "", quantity: "1", unit: "pieces" },
  ]);
}

function updateItem(
  index: number,
  field: "name" | "quantity" | "unit",
  value: string,
) {
  setNewItems((items) =>
    items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    ),
  );
}

async function createRequest(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setFormError("");

  const items = newItems.map((item) => ({
    name: item.name.trim(),
    quantity: Number(item.quantity),
    unit: item.unit.trim(),
  }));

  if (
    items.some(
      (item) =>
        !item.name ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !item.unit,
    )
  ) {
    setFormError("Enter a name, positive quantity and unit for every item.");
    return;
  }

  setSaving(true);

  try {
    const response = await apiFetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        description: newDescription,
        items,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Could not create request.");
    }

    setShowCreateForm(false);
    setNewTitle("");
    setNewDescription("");
    setNewItems([{ name: "", quantity: "1", unit: "pieces" }]);

    const refreshed = await apiFetch("/api/requests");
    const data: ApiResponse = await refreshed.json();

    if (!refreshed.ok || !data.success) {
      throw new Error("Created successfully, but refreshing the list failed.");
    }

    setRequests(data.data);
  } catch (err) {
    setFormError(
      err instanceof Error ? err.message : "Something went wrong.",
    );
  } finally {
    setSaving(false);
  }
}

async function submitRequest(requestId: string) {
  setWorkflowBusy(true);
  setWorkflowMessage("");

  try {
    const response = await apiFetch(
      `/api/requests/${requestId}/submit`,
      {
        method: "POST",
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to submit request.");
    }

    const refreshResponse = await apiFetch(
      "/api/requests"
    );
    const refreshedData = await refreshResponse.json();

    if (!refreshResponse.ok || !refreshedData.success) {
      throw new Error("Request submitted, but refreshing the list failed.");
    }

    setRequests(refreshedData.data);
    setWorkflowMessage("Request submitted for approval successfully.");
  } catch (err) {
    setWorkflowMessage(
      err instanceof Error ? err.message : "Something went wrong."
    );
  } finally {
    setWorkflowBusy(false);
  }
}

async function decideRequest(
  requestId: string,
  decision: "approve" | "reject"
) {
  setWorkflowBusy(true);
  setWorkflowMessage("");

  try {
    const response = await apiFetch(
      `/api/requests/${requestId}/decision`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          comment: decision === "reject" ? rejectionReason.trim() : undefined,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to update request.");
    }

    const refreshResponse = await apiFetch(
      "/api/requests"
    );
    const refreshedData = await refreshResponse.json();

    if (!refreshResponse.ok || !refreshedData.success) {
      throw new Error("Decision saved, but refreshing the list failed.");
    }

    setRequests(refreshedData.data);

    await loadRequestHistory(requestId);

    setShowRejectForm(false);
    setRejectionReason("");

    setWorkflowMessage(
      decision === "approve"
        ? "Request approved successfully."
        : "Request rejected successfully."
    );
  } catch (err) {
    setWorkflowMessage(
      err instanceof Error ? err.message : "Something went wrong."
    );
  } finally {
    setWorkflowBusy(false);
  }
}

async function handleLogout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout failed:", error.message);
    return;
  }

  setIsAuthenticated(false);
}


async function loadRequestHistory(requestId: string) {
  setHistoryLoading(true);
  setHistoryError("");

  try {
    const response = await apiFetch(
      `/api/requests/${requestId}/history`
    );

    const result: HistoryApiResponse = await response.json();

    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error("Could not load request history.");
    }

    setHistory(result.data);
  } catch (err) {
    setHistoryError(
      err instanceof Error ? err.message : "Something went wrong."
    );
  } finally {
    setHistoryLoading(false);
  }
}

useEffect(() => {
    if (!selectedRequestId) {
      setHistory([]);
      setHistoryError("");
      return;
    }

    void loadRequestHistory(selectedRequestId);
  }, [selectedRequestId]);

  if (authLoading) {
    return <main className="auth-page">Loading Tendro...</main>;
  }

  if (!isAuthenticated) {
    return <Auth onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  if (selectedRequestId) {
  const request = requests.find(
    (item) => item.id === selectedRequestId,
  );

  if (request) {
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#" aria-label="Tendro home">
            <span className="brand-mark">t.</span>
            <span>tendro</span>
          </a>

          <div className="workspace">
            <div className="workspace-avatar">A</div>
            <div className="workspace-copy">
              <strong>Acme Manufacturing</strong>
              <span>Free workspace</span>
            </div>
          </div>

          <div className="nav-label">WORKSPACE</div>
          <nav className="navigation">
            {navigation.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className={`nav-item ${label === "Requests" ? "active" : ""}`}
                onClick={() => setSelectedRequestId(null)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
                {label === "Requests" && (
                  <span className="nav-count">{requests.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <div className="profile">
              <div className="profile-avatar">SP</div>
              <div className="profile-copy">
                <strong>Workspace admin</strong>
                <span>Demo account</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumbs">
              Workspace <span>/</span>
              <button
                type="button"
                className="breadcrumb-button"
                onClick={() => setSelectedRequestId(null)}
              >
                Requests
              </button>
              <span>/</span> <strong>Request details</strong>
            </div>
            <div className="topbar-actions">
              <span className="environment">
                <span /> Demo environment
              </span>
              <div className="topbar-avatar">SP</div>
            </div>
          </header>

          <div className="page-content">
            <button
              type="button"
              className="back-button"
              onClick={() => setSelectedRequestId(null)}
            >
              <ArrowLeft size={16} /> Back to requests
            </button>

            <section className="detail-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> PROCUREMENT REQUEST
                </div>
                <h1>{request.title}<span>.</span></h1>
                <p className="page-subtitle">
                  REQ-{String(request.request_number).padStart(4, "0")}
                  {" · "}
                  Created{" "}
                  {new Date(request.created_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <span className={`status-badge status-${request.status}`}>
                <span />
                {formatStatus(request.status)}
              </span>
            </section>

            <div className="detail-grid">
              <section className="detail-card">
                <h2>Request information</h2>

                <div className="detail-field">
                  <span>Request number</span>
                  <strong>
                    REQ-{String(request.request_number).padStart(4, "0")}
                  </strong>
                </div>

                <div className="detail-field">
                  <span>Organization</span>
                  <strong>{request.organization_name}</strong>
                </div>

                <div className="detail-field">
                  <span>Description</span>
                  <p>
                    {request.description?.trim() ||
                      "No description provided."}
                  </p>
                </div>
              </section>
              <section className="detail-card">
                <h2>Request status</h2>

                <span className={`status-badge status-${request.status}`}>
                  <span />
                  {formatStatus(request.status)}
                </span>

                <p className="detail-muted">
                  This is the current status recorded by Tendro.
                </p>

                {request.status === "review_required" && (
                  <div className="workflow-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={workflowBusy}
                      onClick={() => void decideRequest(request.id, "approve")}
                    >
                      {workflowBusy ? "Processing..." : "Approve"}
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      disabled={workflowBusy}
                      onClick={() => {
                        setShowRejectForm(true);
                        setRejectionReason("");
                        setWorkflowMessage("");
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}

                {showRejectForm && request.status === "review_required" && (
                  <div className="rejection-form workflow-review-actions">
                    <label
                      htmlFor="rejection-reason"
                      className="form-field workflow-comment-field"
                    >
                      Reason for rejection
                    </label>

                    <textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(event) =>
                        setRejectionReason(event.target.value)
                      }
                      placeholder="Explain why this request is being rejected..."
                      rows={3}
                    />

                    <div className="workflow-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={workflowBusy || !rejectionReason.trim()}
                        onClick={() => void decideRequest(request.id, "reject")}
                      >
                        {workflowBusy ? "Rejecting..." : "Confirm rejection"}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={workflowBusy}
                        onClick={() => {
                          setShowRejectForm(false);
                          setRejectionReason("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {request.status === "draft" && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={workflowBusy}
                    onClick={() => void submitRequest(request.id)}
                  >
                    {workflowBusy ? "Submitting..." : "Submit for approval"}
                  </button>
                )}

                {workflowMessage && (
                  <p role="status" className="detail-muted">
                    {workflowMessage}
                  </p>
                )}
              </section>
            </div>

            <section className="detail-card detail-items-card">
              <div className="detail-card-heading">
                <div>
                  <h2>Line items</h2>
                  <p>Products and materials included in this request.</p>
                </div>
                <span className="items-count">
                  {request.items.length}{" "}
                  {request.items.length === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="table-scroll">
                <table className="requests-table detail-items-table">
                  <thead>
                    <tr>
                      <th>ITEM</th>
                      <th>QUANTITY</th>
                      <th>UNIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="request-cell">
                            <div className="request-file-icon">
                              <Package size={17} />
                            </div>
                            <strong>{item.name}</strong>
                          </div>
                        </td>
                        <td>{item.quantity.toLocaleString("en-IN")}</td>
                        <td>{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="detail-card history-card">
              <div className="detail-card-heading">
                <div>
                  <h2>Activity history</h2>
                  <p>A timeline of status changes recorded by Tendro.</p>
                </div>
                <span className="items-count">
                  {history.length} events
                </span>
              </div>

              {historyLoading ? (
                <p className="history-message">Loading activity history...</p>
              ) : historyError ? (
                <p className="history-message error-message" role="alert">
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className="history-message">
                  No activity has been recorded yet.
                </p>
              ) : (
                <ol className="history-timeline">
                  {history.map((event) => (
                    <li key={event.id} className="history-event">
                      <span className="history-event-dot" />
                      <div className="history-event-content">
                        <strong>
                          {event.from_status
                            ? `${formatStatus(event.from_status)} → ${formatStatus(event.to_status)}`
                            : `Request created · ${formatStatus(event.to_status)}`}
                        </strong>

                        <time dateTime={event.changed_at}>
                          {new Date(event.changed_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>

                        {event.comment &&
                          event.comment !== "Request created" && (
                            <p className="history-comment">
                              {event.comment}
                            </p>
                          )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <footer className="page-footer">
              <span>© 2026 Tendro</span>
              <span>Built for better business decisions.</span>
            </footer>
          </div>
        </main>
      </div>
    );
  }
}

return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Tendro home">
          <span className="brand-mark">t.</span>
          <span>tendro</span>
        </a>

        <div className="workspace">
          <div className="workspace-avatar">A</div>
          <div className="workspace-copy">
            <strong>Acme Manufacturing</strong>
            <span>Free workspace</span>
          </div>
          <ChevronDown size={16} />
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="navigation">
          {navigation.map(({ label, icon: Icon, active }) => (
            <a
              key={label}
              href="#"
              className={`nav-item ${active ? "active" : ""}`}
              onClick={(event) => event.preventDefault()}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Requests" && (
                <span className="nav-count">{requests.length}</span>
              )}
            </a>
          ))}
        </nav>

        <div className="nav-label tools-label">TOOLS</div>
        <nav className="navigation">
          <a className="nav-item" href="#" onClick={(e) => e.preventDefault()}>
            <Package size={18} strokeWidth={1.8} />
            <span>Inventory</span>
          </a>
          <a className="nav-item" href="#" onClick={(e) => e.preventDefault()}>
            <Wallet size={18} strokeWidth={1.8} />
            <span>Spend analytics</span>
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={17} /></div>
            <strong>Need a hand?</strong>
            <p>We're here to help you get things done.</p>
            <button type="button" className="help-link">
              Visit help center <ArrowUpRight size={14} />
            </button>
          </div>
          <a className="nav-item" href="#" onClick={(e) => e.preventDefault()}>
            <Settings size={18} strokeWidth={1.8} />
            <span>Settings</span>
          </a>
          <div className="profile">
            <div className="profile-avatar">SP</div>
            <div className="profile-copy">
              <strong>Workspace admin</strong>
              <span>Demo account</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>Requests</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment"><span /> Demo environment</span>
            <button className="icon-button" aria-label="Notifications" type="button">
              <Bell size={19} />
              <i />
            </button>
            <div className="topbar-avatar">SP</div>
            <button
              type="button"
              className="logout-button topbar-logout"
              onClick={() => void handleLogout()}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> PROCUREMENT WORKSPACE
              </div>
              <h1>Purchase requests<span>.</span></h1>
              <p className="page-subtitle">
                Everything your team needs to source smarter and buy better.
              </p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setFormError("");
                setShowCreateForm(true);
              }}
            >
              <Plus size={18} /> New request
            </button>
          </section>

          <section className="welcome-banner">
            <div className="banner-content">
              <div className="banner-tag">
                <Sparkles size={13} /> YOUR PROCUREMENT, SIMPLIFIED
              </div>
              <h2>Good purchasing starts with<br />better decisions.</h2>
              <p>
                Keep every request, supplier and purchasing decision in one place.
              </p>
            </div>
            <div className="banner-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="art-card art-card-back">
                <div className="art-line short" />
                <div className="art-line" />
                <div className="art-line medium" />
              </div>
              <div className="art-card art-card-front">
                <div className="art-check"><ShieldCheck size={23} /></div>
                <div className="art-line short" />
                <div className="art-line medium" />
                <div className="art-approved">Verified request</div>
              </div>
              <div className="art-sparkle"><Sparkles size={21} /></div>
            </div>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top">
                <span>Total requests</span>
                <div className="stat-icon lavender"><FileText size={18} /></div>
              </div>
              <div className="stat-value">{loading ? "—" : requests.length}</div>
              <div className="stat-foot">
                <span className="stat-neutral">All time</span>
                <span>Purchase requests</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Awaiting approval</span>
                <div className="stat-icon amber"><Wallet size={18} /></div>
              </div>
              <div className="stat-value">
                {loading
                  ? "—"
                  : requests.filter((r) => r.status === "review_required").length}
              </div>
              <div className="stat-foot">
                <span className="stat-neutral">Needs attention</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Approved requests</span>
                <div className="stat-icon green"><ShieldCheck size={18} /></div>
              </div>
              <div className="stat-value">
                {loading
                  ? "—"
                  : requests.filter((r) => r.status === "approved").length}
              </div>
              <div className="stat-foot">
                <span className="stat-neutral">Ready to proceed</span>
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Line items</span>
                <div className="stat-icon blue"><Package size={18} /></div>
              </div>
              <div className="stat-value">{loading ? "—" : totalItems}</div>
              <div className="stat-foot">
                <span className="stat-neutral">Across all requests</span>
              </div>
            </article>
          </section>

          <section className="requests-panel">
            <div className="panel-heading">
              <div>
                <h2>All requests</h2>
                <p>Manage and track your team's procurement requests.</p>
              </div>
              <button className="secondary-button" type="button">
                <Plus size={16} /> Create request
              </button>
            </div>

            <div className="table-toolbar">
              <div className="table-tabs">
                <button className="tab active" type="button">
                  All requests <span>{requests.length}</span>
                </button>
                <button className="tab" type="button">
                  Pending
                </button>
                <button className="tab" type="button">
                  Approved
                </button>
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search requests..."
                  aria-label="Search requests"
                />
              </label>
            </div>

            <div className="table-scroll">
              <table className="requests-table">
                <thead>
                  <tr>
                    <th>REQUEST</th>
                    <th>ORGANIZATION</th>
                    <th>ITEMS</th>
                    <th>STATUS</th>
                    <th>CREATED</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="table-message">
                        Loading your requests...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="table-message error-message">
                        Couldn't load requests: {error}. Check that the API is running.
                      </td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="table-message">
                        No matching requests found.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <div className="request-cell">
                            <div className="request-file-icon"><FileText size={17} /></div>
                            <div>
                              <button
                                type="button"
                                className="request-title-button"
                                onClick={() => setSelectedRequestId(request.id)}
                              >
                                {request.title}
                              </button>
                              <span>REQ-{String(request.request_number).padStart(4, "0")}</span>
                            </div>
                          </div>
                        </td>
                        <td className="organization-cell">
                          {request.organization_name}
                        </td>
                        <td>
                          <span className="item-count">
                            <Package size={14} /> {request.items.length}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge status-${request.status}`}>
                            <span />
                            {request.status.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="date-cell">
                          {new Date(request.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td>
                          <button className="row-menu" type="button" aria-label={`Actions for ${request.title}`}>
                            ···
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Showing {filteredRequests.length} of {requests.length} requests
              </span>
              <div className="pagination">
                <button type="button" disabled>Previous</button>
                <button type="button" className="page-number">1</button>
                <button type="button" disabled>Next</button>
              </div>
            </div>
          </section>

          <footer className="page-footer">
            <span>© 2026 Tendro</span>
            <span>Built for better business decisions.</span>
          </footer>
        </div>
        
        {showCreateForm && (
          <div
            className="modal-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) {
                setShowCreateForm(false);
              }
            }}
          >
            <section
              className="request-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-request-title"
            >
              <header className="modal-heading">
                <div>
                  <span className="modal-eyebrow">PROCUREMENT</span>
                  <h2 id="create-request-title">Create purchase request</h2>
                  <p>Provide the details for your purchase.</p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  disabled={saving}
                  onClick={() => setShowCreateForm(false)}
                  aria-label="Close form"
                >
                  ×
                </button>
              </header>

              <form className="request-form" onSubmit={createRequest}>
                <div className="modal-form-body">
                  <div className="request-details-grid">
                    <label className="form-field">
                      <span className="field-label">
                        Request title <span className="required-star">*</span>
                      </span>
                      <input
                        value={newTitle}
                        onChange={(event) => setNewTitle(event.target.value)}
                        placeholder="e.g. Office equipment"
                        maxLength={200}
                        required
                        autoFocus
                      />
                    </label>

                    <label className="form-field">
                      Description
                      <textarea
                        value={newDescription}
                        onChange={(event) => setNewDescription(event.target.value)}
                        placeholder="What is this purchase for?"
                        maxLength={2000}
                        rows={2}
                      />
                    </label>
                  </div>

                  <section className="line-items-section">
                    <div className="items-heading">
                      <div>
                        <h3>Line items</h3>
                        <p>
                          Add the products or materials you need to purchase.
                        </p>
                      </div>

                      <span className="items-count">
                        {newItems.length}{" "}
                        {newItems.length === 1 ? "item" : "items"}
                      </span>
                    </div>

                    <div className="line-items-table">
                      <div className="line-items-header">
                        <span>ITEM NAME</span>
                        <span>QUANTITY</span>
                        <span>UNIT</span>
                        <span />
                      </div>

                      <div className="line-items-list">
                        {newItems.map((item, index) => (
                          <div className="line-item-row" key={index}>
                            <label className="form-field">
                              <span className="mobile-field-label">Item name</span>
                              <input
                                value={item.name}
                                onChange={(event) =>
                                  updateItem(index, "name", event.target.value)
                                }
                                placeholder="e.g. Ergonomic chair"
                                maxLength={200}
                                required
                                aria-label={`Item ${index + 1} name`}
                              />
                            </label>

                            <label className="form-field">
                              <span className="mobile-field-label">Quantity</span>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(event) =>
                                  updateItem(index, "quantity", event.target.value)
                                }
                                min="0.001"
                                max="1000000000"
                                step="any"
                                required
                                aria-label={`Item ${index + 1} quantity`}
                              />
                            </label>

                            <label className="form-field">
                              <span className="mobile-field-label">Unit</span>
                              <input
                                value={item.unit}
                                onChange={(event) =>
                                  updateItem(index, "unit", event.target.value)
                                }
                                placeholder="pieces"
                                maxLength={30}
                                required
                                aria-label={`Item ${index + 1} unit`}
                              />
                            </label>

                            <div className="line-item-action">
                              {newItems.length > 1 && (
                                <button
                                  type="button"
                                  className="remove-item-button"
                                  disabled={saving}
                                  onClick={() =>
                                    setNewItems((items) =>
                                      items.filter((_, itemIndex) => itemIndex !== index)
                                    )
                                  }
                                  aria-label={`Remove item ${index + 1}`}
                                  title="Remove item"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="add-item-button"
                      disabled={saving}
                      onClick={addItem}
                    >
                      <Plus size={16} />
                      Add another item
                    </button>
                  </section>

                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                </div>

                <footer className="modal-actions">
                  <span className="required-note">
                    <span>*</span> Required fields
                  </span>

                  <div className="modal-action-buttons">
                    <button
                      type="button"
                      className="cancel-button"
                      disabled={saving}
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Create request"}
                    </button>
                  </div>
                </footer>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
