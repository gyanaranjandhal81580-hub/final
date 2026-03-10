function logout() {
  location.reload();
}

function updateDashboard() {
  const totalOrdersEl = document.getElementById("totalOrders");
  const totalRevenueEl = document.getElementById("totalRevenue");
  const totalUsersEl = document.getElementById("totalUsers");
  const totalRestaurantsEl = document.getElementById("totalRestaurants");
  const totalDishesEl = document.getElementById("totalDishes");
  const activeDeliveriesEl = document.getElementById("activeDeliveries");

  if (!totalOrdersEl) return; // not on this page

  totalOrdersEl.innerText = orders.length;
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  totalRevenueEl.innerText = revenue;
  totalUsersEl.innerText = users.length;
  totalRestaurantsEl.innerText = restaurants.length;

  let totalDishes = 0;
  for (const key in menus) {
    totalDishes += menus[key].length;
  }
  totalDishesEl.innerText = totalDishes;
  activeDeliveriesEl.innerText = activeDeliveries;

  renderChart();

  // ── Fetch live anomaly counts from backend ─────────────────────────────────
  fetchAnomalySummary();
  // ──────────────────────────────────────────────────────────────────────────
}

async function fetchAnomalySummary() {
  try {
    const [loginAnomalies, paymentAnomalies] = await Promise.all([
      fetch(API_BASE + "/login-anomalies").then((r) => r.json()),
      fetch(API_BASE + "/payment-anomalies").then((r) => r.json()),
    ]);

    const loginCount   = (loginAnomalies.anomalies_detected         || []).length;
    const paymentCount = (paymentAnomalies.payment_anomalies_detected || []).length;

    // Update anomaly badge elements if they exist in the HTML
    const loginBadge   = document.getElementById("anomalyLoginCount");
    const paymentBadge = document.getElementById("anomalyPaymentCount");
    const backendStatus = document.getElementById("backendStatus");

    if (loginBadge)    loginBadge.innerText   = loginCount;
    if (paymentBadge)  paymentBadge.innerText  = paymentCount;
    if (backendStatus) {
      backendStatus.innerText = "✅ Connected";
      backendStatus.style.color = "#4ade80";
    }
  } catch (e) {
    const backendStatus = document.getElementById("backendStatus");
    if (backendStatus) {
      backendStatus.innerText = "⚠️ Offline";
      backendStatus.style.color = "#f87171";
    }
    console.warn("Could not reach backend:", e.message);
  }
}

function renderChart() {
  const ctx = document.getElementById("ordersChart");
  if (!ctx || typeof Chart === "undefined") return;

  if (ordersChartInstance) {
    ordersChartInstance.destroy();
  }
  ordersChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [
        {
          label: "Orders",
          data: [5, 8, 6, 10, 12, 9, 7],
          backgroundColor: "rgba(34, 197, 94, 0.85)",
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "rgba(17, 24, 39, 0.6)" },
        },
        y: {
          grid: { color: "rgba(17, 24, 39, 0.08)" },
          ticks: { color: "rgba(17, 24, 39, 0.6)" },
        },
      },
    },
  });
}

function renderOrders() {
  const container = document.getElementById("orderList");
  if (!container) return;

  container.innerHTML = "";
  if (!orders.length) {
    container.innerHTML = `
      <div class="admin-list-card">
        <div>
          <strong>No orders yet</strong>
          <p>New orders will appear here after checkout.</p>
        </div>
      </div>
    `;
    return;
  }
  orders.forEach((o, i) => {
    container.innerHTML += `
      <div class="admin-list-card">
        <div>
          <strong>Order #${o.id}</strong>
          <p>Total: ₹${Math.round(o.total)} • Status: <b>${o.status}</b></p>
          <p>${o.customer?.name ? "Customer: " + o.customer.name : ""}</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <button class="admin-action" type="button" onclick="updateOrderStatus(${i})">Mark Delivered</button>
        </div>
      </div>
    `;
  });
}

function updateOrderStatus(index) {
  orders[index].status = "Delivered";
  localStorage.setItem("orders", JSON.stringify(orders));
  renderOrders();
  updateDashboard();
}

function renderUsers() {
  const container = document.getElementById("userList");
  if (!container) return;

  container.innerHTML = "";
  if (!users.length) {
    container.innerHTML = `
      <div class="admin-list-card">
        <div>
          <strong>No users yet</strong>
          <p>Users will appear here after user login.</p>
        </div>
      </div>
    `;
    return;
  }
  users.forEach((u, i) => {
    container.innerHTML += `
      <div class="admin-list-card">
        <div>
          <strong>${u.email}</strong>
          <p>Registered user</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="admin-action danger" type="button" onclick="deleteUser(${i})">Delete</button>
        </div>
      </div>
    `;
  });
}

function deleteUser(index) {
  users.splice(index, 1);
  localStorage.setItem("users", JSON.stringify(users));
  renderUsers();
  updateDashboard();
}

function addRestaurant() {
  const nameEl = document.getElementById("newResName");
  const typeEl = document.getElementById("newResType");
  const deliveryEl = document.getElementById("newResDelivery");
  const imgEl = document.getElementById("newResImg");

  const name = nameEl.value.trim();
  const type = typeEl.value.trim();
  const delivery = deliveryEl.value.trim();
  const img = imgEl.value.trim() || "https://picsum.photos/400";
  if (!name || !type || !delivery) {
    alert("Fill name, type and delivery time.");
    return;
  }
  restaurants.push({
    name,
    type,
    rating: 4,
    status: "open",
    delivery,
    offer: "New",
    location: "Bangalore",
    img,
  });
  nameEl.value = "";
  typeEl.value = "";
  deliveryEl.value = "";
  imgEl.value = "";
  updateDashboard();
  renderAdminRestaurants();
}

function renderAdminRestaurants() {
  const list = document.getElementById("adminRestaurantList");
  if (!list) return;
  list.innerHTML = "";
  const mapped = restaurants.map((r, idx) => ({ ...r, idx })).reverse();
  if (!mapped.length) {
    list.innerHTML = `
      <div class="admin-list-card">
        <div>
          <strong>No restaurants</strong>
          <p>Add your first restaurant using the form above.</p>
        </div>
      </div>
    `;
    return;
  }
  mapped.slice(0, 12).forEach((r) => {
    const open = (r.status || "open") === "open";
    list.innerHTML += `
      <div class="admin-list-card">
        <div>
          <strong>${r.name}</strong>
          <p>
            ${String(r.type || "").toUpperCase()} • ${
              r.location || "Bangalore"
            } •
            ${r.delivery} mins •
            <b style="color:${open ? "#16a34a" : "#b91c1c"}">${
              open ? "OPEN" : "CLOSED"
            }</b>
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <button class="admin-action" type="button" onclick="openRestaurantEditor(${
            r.idx
          })">Edit</button>
        </div>
      </div>
    `;
  });
}

function openRestaurantEditor(index) {
  currentRestaurantIndex = index;
  const res = restaurants[index];
  if (!res) return;

  const modal = document.getElementById("restaurantModal");
  if (!modal) return;

  const nameLabel = document.getElementById("editResNameLabel");
  const typeInput = document.getElementById("editResType");
  const deliveryInput = document.getElementById("editResDelivery");
  const statusInput = document.getElementById("editResStatus");
  const meta = document.getElementById("editResMeta");

  if (nameLabel) nameLabel.textContent = res.name || "";
  if (typeInput) typeInput.value = res.type || "";
  if (deliveryInput) deliveryInput.value = res.delivery || "";
  if (statusInput) statusInput.value = res.status || "open";
  if (meta) {
    meta.textContent = res.location
      ? `${res.location} • Rating ${res.rating || 0}★`
      : "Bangalore";
  }

  renderRestaurantDishes(res.name);

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeRestaurantEditor() {
  const modal = document.getElementById("restaurantModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  currentRestaurantIndex = null;
}

function renderRestaurantDishes(restaurantName) {
  const list = document.getElementById("restaurantDishesList");
  if (!list) return;
  list.innerHTML = "";

  const items = menus[restaurantName] || [];
  if (!items.length) {
    list.innerHTML = `
      <div class="admin-dish-row is-empty">
        <div class="admin-dish-meta">No dishes yet. Use the form below to add one.</div>
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    list.innerHTML += `
      <div class="admin-dish-row">
        <div>
          <strong>${item.name}</strong>
          <div class="admin-dish-meta">₹${item.price}</div>
        </div>
        <div class="admin-dish-meta">
          ${item.img ? "Image set" : "No image"}
        </div>
      </div>
    `;
  });
}

function addDishToRestaurant() {
  if (currentRestaurantIndex === null) {
    alert("Select a restaurant to add dishes.");
    return;
  }
  const res = restaurants[currentRestaurantIndex];
  if (!res) return;

  const nameInput = document.getElementById("newDishName");
  const priceInput = document.getElementById("newDishPrice");
  const imgInput = document.getElementById("newDishImg");

  const dishName = nameInput?.value.trim() || "";
  const priceValue = priceInput?.value.trim() || "";
  const dishImg = imgInput?.value.trim() || "";

  const price = Number(priceValue);
  if (!dishName || !price || price <= 0) {
    alert("Please enter a dish name and valid price.");
    return;
  }

  if (!menus[res.name]) {
    menus[res.name] = [];
  }
  menus[res.name].push({
    name: dishName,
    price,
    img: dishImg,
  });

  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  if (imgInput) imgInput.value = "";

  renderRestaurantDishes(res.name);
  updateDashboard();
}

function saveRestaurantDetails() {
  if (currentRestaurantIndex === null) return;
  const res = restaurants[currentRestaurantIndex];
  if (!res) return;

  const typeInput = document.getElementById("editResType");
  const deliveryInput = document.getElementById("editResDelivery");
  const statusInput = document.getElementById("editResStatus");

  if (typeInput) {
    const v = typeInput.value.trim();
    if (v) res.type = v;
  }
  if (deliveryInput) {
    const v = deliveryInput.value.trim();
    if (v) res.delivery = v;
  }
  if (statusInput) {
    res.status = statusInput.value || res.status;
  }

  updateDashboard();
  renderAdminRestaurants();
  alert("Restaurant details updated.");
}

function showAdminTab(tab, btn) {
  const contentWrappers = document.querySelectorAll("#adminContent > div");
  if (!contentWrappers.length) return;

  contentWrappers.forEach((div) => {
    div.classList.add("hidden");
  });
  const activeSection = document.getElementById("admin-" + tab);
  if (activeSection) activeSection.classList.remove("hidden");

  const navBtns = document.querySelectorAll(".admin-nav-btn");
  navBtns.forEach((b) => b.classList.remove("is-active"));
  const activeBtn =
    btn || document.querySelector(`.admin-nav-btn[data-admin-tab="${tab}"]`);
  if (activeBtn) activeBtn.classList.add("is-active");

  if (tab === "orders") renderOrders();
  if (tab === "users") renderUsers();
  if (tab === "restaurants") renderAdminRestaurants();
  if (tab === "anomalies") renderAnomalies();

  closeAdminSidebar();
}

function toggleAdminSidebar() {
  const dash = document.getElementById("adminDashboard");
  if (!dash) return;
  dash.classList.toggle("sidebar-open");
}

function closeAdminSidebar() {
  const dash = document.getElementById("adminDashboard");
  if (!dash) return;
  dash.classList.remove("sidebar-open");
}
function computeAnomalies() {
  const anomalies = [];

  if (!Array.isArray(orders) || !orders.length) {
    return {
      anomalies,
      stats: {
        highValue: 0,
        heavyUsers: 0,
        sharedPhones: 0,
        zeroOrNegativeOrders: 0,
        total: 0,
      },
    };
  }

  const byEmail = {};
  const byPhone = {};
  let highValue = 0;
  let heavyUsers = 0;
  let sharedPhones = 0;
  let zeroOrNegativeOrders = 0;

  orders.forEach((o) => {
    const total = Number(o.total || 0);
    const email = o.customer?.email || "unknown";
    const phone = o.customer?.phone || "unknown";

    if (!byEmail[email]) {
      byEmail[email] = { count: 0, total: 0, sampleOrderId: o.id };
    }
    byEmail[email].count += 1;
    byEmail[email].total += total;

    if (!byPhone[phone]) {
      byPhone[phone] = { emails: new Set(), count: 0 };
    }
    if (email && email !== "unknown") {
      byPhone[phone].emails.add(email);
    }
    byPhone[phone].count += 1;

    if (total >= 1500) {
      highValue += 1;
      anomalies.push({
        type: "High value order",
        detail: `Order #${o.id} has unusually high total of ₹${Math.round(
          total,
        )}.`,
      });
    }

    if (total <= 0) {
      zeroOrNegativeOrders += 1;
      anomalies.push({
        type: "Zero / negative total",
        detail: `Order #${o.id} has a total amount of ₹${Math.round(
          total,
        )}, which looks invalid.`,
      });
    }
  });

  Object.keys(byEmail).forEach((email) => {
    const info = byEmail[email];
    if (info.count >= 5) {
      heavyUsers += 1;
      anomalies.push({
        type: "Very frequent customer",
        detail: `${email} has placed ${info.count} orders totalling ₹${Math.round(
          info.total,
        )}.`,
      });
    }
  });

  Object.keys(byPhone).forEach((phone) => {
    const info = byPhone[phone];
    if (info.emails.size >= 3 && phone !== "unknown") {
      sharedPhones += 1;
      anomalies.push({
        type: "Shared phone",
        detail: `Phone ${phone} is shared across ${info.emails.size} different email IDs.`,
      });
    }
  });

  return {
    anomalies,
    stats: {
      highValue,
      heavyUsers,
      sharedPhones,
      zeroOrNegativeOrders,
      total: anomalies.length,
    },
  };
}

async function renderAnomalies() {
  const summaryEl = document.getElementById("anomalySummary");
  const listEl    = document.getElementById("anomalyList");
  if (!summaryEl || !listEl) return;

  listEl.innerHTML = "<p style='color:#9ca3af;padding:12px'>Loading anomalies from backend...</p>";

  const { anomalies: localAnomalies, stats } = computeAnomalies();

  let loginAnomalies = [], paymentAnomalies = [], backendOnline = false;
  try {
    const [lr, pr] = await Promise.all([
      fetch(API_BASE + "/login-anomalies").then(r => r.json()),
      fetch(API_BASE + "/payment-anomalies").then(r => r.json()),
    ]);
    loginAnomalies   = lr.anomalies_detected         || [];
    paymentAnomalies = pr.payment_anomalies_detected || [];
    backendOnline = true;
  } catch(e) {
    console.warn("Backend offline:", e.message);
  }

  const totalAll = stats.total + loginAnomalies.length + paymentAnomalies.length;

  summaryEl.innerHTML = `
    <div class="admin-stat-card">
      <div class="admin-stat-label">Total Anomalies</div>
      <div class="admin-stat-value" style="color:${totalAll > 0 ? "#f87171" : "#4ade80"}">${totalAll}</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-label">Login Attacks</div>
      <div class="admin-stat-value" style="color:${loginAnomalies.length > 0 ? "#f87171" : "#4ade80"}">${loginAnomalies.length}</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-label">Payment Flags</div>
      <div class="admin-stat-value" style="color:${paymentAnomalies.length > 0 ? "#f87171" : "#4ade80"}">${paymentAnomalies.length}</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-label">Order Flags</div>
      <div class="admin-stat-value">${stats.total}</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-label">Backend</div>
      <div class="admin-stat-value" style="color:${backendOnline ? "#4ade80" : "#f87171"};font-size:13px">${backendOnline ? "✅ Live" : "⚠️ Offline"}</div>
    </div>`;

  listEl.innerHTML = "";

  if (totalAll === 0) {
    listEl.innerHTML = `<div class="admin-list-card"><div>
      <strong>✅ No anomalies detected</strong>
      <p style="color:#9ca3af;margin-top:4px">All logins and payments look normal in the last 24 hours.</p>
    </div></div>`;
    return;
  }

  // Login anomaly cards
  loginAnomalies.forEach((a) => {
    const isBrute = a.type === "Brute Force Attack";
    const color   = isBrute ? "#f87171" : "#fb923c";
    const badgeBg = isBrute ? "#7f1d1d"  : "#7c2d12";
    const badgeFg = isBrute ? "#fca5a5"  : "#fdba74";
    const badge   = isBrute ? "BRUTE FORCE" : "ADMIN ATTACK";
    const icon    = isBrute ? "🚨" : "🛡️";

    const rows = (a.details || []).map(d => `
      <div style="display:grid;grid-template-columns:1.4fr 0.7fr 1.1fr 1.1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;align-items:center">
        <div>${isBrute ? "📧" : "🎯"} <strong>${isBrute ? (d.email || "unknown") : "admin@foodiepro.com"}</strong></div>
        <div><span style="color:${color};font-weight:600">${d.attempts} ${isBrute ? "fails" : "attempts"}</span></div>
        <div style="color:#9ca3af;font-size:12px">🌐 ${d.ip || "unknown"}</div>
        <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
      </div>`).join("");

    listEl.innerHTML += `
      <div class="admin-list-card" style="border-left:4px solid ${color};margin-bottom:14px">
        <div style="width:100%">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:15px">${icon} ${a.type}</strong>
            <span style="font-size:11px;background:${badgeBg};color:${badgeFg};padding:3px 12px;border-radius:999px;font-weight:600">${badge}</span>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin-bottom:10px">${(a.details||[]).length} target(s) flagged in the last 24 hours</p>
          <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:8px 12px">
            <div style="display:grid;grid-template-columns:1.4fr 0.7fr 1.1fr 1.1fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase">
              <span>${isBrute ? "User Email" : "Target Account"}</span><span>Attempts</span><span>Attacker IP</span><span>Last Seen</span>
            </div>
            ${rows}
          </div>
        </div>
      </div>`;
  });

  // Payment anomaly cards
  paymentAnomalies.forEach((a) => {
    let headers = "", rows = "";

    if (a.type === "High Amount Payment") {
      headers = `<div style="display:grid;grid-template-columns:1.5fr 0.8fr 0.8fr 1fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase"><span>User Email</span><span>Amount</span><span>Method</span><span>Last Seen</span></div>`;
      rows = (a.details || []).map(d => `
        <div style="display:grid;grid-template-columns:1.5fr 0.8fr 0.8fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;align-items:center">
          <div>📧 <strong>${d.email || "unknown"}</strong></div>
          <div><span style="color:#f87171;font-weight:600">₹${d.amount}</span></div>
          <div style="color:#9ca3af">${d.method || "-"}</div>
          <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
        </div>`).join("");

    } else if (a.type === "Multiple Payments in 24 Hours") {
      headers = `<div style="display:grid;grid-template-columns:1.5fr 0.5fr 0.9fr 1fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase"><span>User Email</span><span>Txns</span><span>Total Spent</span><span>Last Seen</span></div>`;
      rows = (a.details || []).map(d => `
        <div style="display:grid;grid-template-columns:1.5fr 0.5fr 0.9fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;align-items:center">
          <div>📧 <strong>${d.email || "unknown"}</strong></div>
          <div><span style="color:#fb923c;font-weight:600">${d.attempts}</span></div>
          <div style="color:#fbbf24">₹${d.amount}</div>
          <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
        </div>`).join("");

    } else if (a.type === "Repeated Failed Payments") {
      headers = `<div style="display:grid;grid-template-columns:1.5fr 0.8fr 1fr 1fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase"><span>User Email</span><span>Failed</span><span>IP</span><span>Last Seen</span></div>`;
      rows = (a.details || []).map(d => `
        <div style="display:grid;grid-template-columns:1.5fr 0.8fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;align-items:center">
          <div>📧 <strong>${d.email || "unknown"}</strong></div>
          <div><span style="color:#f87171;font-weight:600">${d.attempts} failed</span></div>
          <div style="color:#9ca3af;font-size:11px">🌐 ${d.ip || "-"}</div>
          <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
        </div>`).join("");

    } else if (a.type === "Same Amount Repeated") {
      headers = `<div style="display:grid;grid-template-columns:1.5fr 0.8fr 0.6fr 1fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase"><span>User Email</span><span>Amount</span><span>Times</span><span>Last Seen</span></div>`;
      rows = (a.details || []).map(d => `
        <div style="display:grid;grid-template-columns:1.5fr 0.8fr 0.6fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;align-items:center">
          <div>📧 <strong>${d.email || "unknown"}</strong></div>
          <div style="color:#fbbf24">₹${d.amount}</div>
          <div><span style="color:#fb923c;font-weight:600">×${d.attempts}</span></div>
          <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
        </div>`).join("");

    } else if (a.type === "Multiple IP Payments") {
      headers = `<div style="display:grid;grid-template-columns:1.3fr 0.6fr 1.5fr 1fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase"><span>User Email</span><span>IP Count</span><span>IPs Used</span><span>Last Seen</span></div>`;
      rows = (a.details || []).map(d => `
        <div style="display:grid;grid-template-columns:1.3fr 0.6fr 1.5fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;align-items:center">
          <div>📧 <strong>${d.email || "unknown"}</strong></div>
          <div><span style="color:#a78bfa;font-weight:600">${d.ip_count}</span></div>
          <div style="color:#9ca3af;font-size:11px">${(d.ips || []).join(", ")}</div>
          <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
        </div>`).join("");

    } else {
      headers = `<div style="display:grid;grid-template-columns:1.5fr 0.8fr 1.3fr;gap:8px;font-size:11px;color:#6b7280;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);text-transform:uppercase"><span>User Email</span><span>Info</span><span>Last Seen</span></div>`;
      rows = (a.details || []).map(d => `
        <div style="display:grid;grid-template-columns:1.5fr 0.8fr 1.3fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px">
          <div>📧 <strong>${d.email || "unknown"}</strong></div>
          <div style="color:#fb923c">${d.attempts || d.amount || "-"}</div>
          <div style="color:#9ca3af">🕒 ${d.last_seen || "-"}</div>
        </div>`).join("");
    }

    listEl.innerHTML += `
      <div class="admin-list-card" style="border-left:4px solid #fb923c;margin-bottom:14px">
        <div style="width:100%">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:15px">💳 ${a.type}</strong>
            <span style="font-size:11px;background:#7c2d12;color:#fdba74;padding:3px 12px;border-radius:999px;font-weight:600">PAYMENT</span>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin-bottom:10px">${(a.details||[]).length} user(s) flagged in the last 24 hours</p>
          <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:8px 12px">
            ${headers}
            ${rows}
          </div>
        </div>
      </div>`;
  });

  // Local order anomaly cards
  localAnomalies.forEach((a) => {
    listEl.innerHTML += `
      <div class="admin-list-card" style="border-left:4px solid #facc15;margin-bottom:14px">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>⚠️ ${a.type}</strong>
            <span style="font-size:11px;background:#713f12;color:#fde68a;padding:3px 12px;border-radius:999px;font-weight:600">ORDER</span>
          </div>
          <p style="color:#9ca3af;margin-top:6px;font-size:13px">${a.detail}</p>
        </div>
      </div>`;
  });
}