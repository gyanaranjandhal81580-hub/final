

function loadLogs() {

  const usersContainer = document.getElementById("logsUsers");
  const ordersContainer = document.getElementById("logsOrders");
  const statsContainer = document.getElementById("logsStats");

  usersContainer.innerHTML = "Loading login anomalies...";
  ordersContainer.innerHTML = "Loading payment anomalies...";

  Promise.all([
    fetch(API_BASE + "/login-anomalies").then(res => res.json()),
    fetch(API_BASE + "/payment-anomalies").then(res => res.json())
  ])
  .then(([loginRes, paymentRes]) => {

    // Convert backend login anomalies format
    const loginAnomalies = (loginRes.anomalies_detected || []).flatMap(a =>
      (a.details || []).map(d => ({
        email: d.email,
        reason: a.type,
        ip: d.ip,
        timestamp: d.last_seen,
        severity: "high"
      }))
    );

    // Convert backend payment anomalies format
    const paymentAnomalies = (paymentRes.payment_anomalies_detected || []).flatMap(a =>
      (a.details || []).map(d => ({
        email: d.email,
        amount: d.amount,
        reason: a.type,
        timestamp: d.last_seen,
        severity: "medium"
      }))
    );

    renderLoginAnomalies(loginAnomalies, usersContainer);
    renderPaymentAnomalies(paymentAnomalies, ordersContainer);
    renderStats(loginAnomalies, paymentAnomalies, statsContainer);

  })
  .catch(error => {

    console.error("Error loading logs:", error);

    usersContainer.innerHTML =
      "<p style='color:red'>Failed to load login anomalies</p>";

    ordersContainer.innerHTML =
      "<p style='color:red'>Failed to load payment anomalies</p>";
  });
}


function renderLoginAnomalies(data, container) {

  if (!data.length) {
    container.innerHTML = "<p>No login anomalies detected</p>";
    return;
  }

  container.innerHTML = "";

  data.forEach(a => {

    const div = document.createElement("div");
    div.className = "log-card";

    div.innerHTML = `
      <h3>🚨 ${a.reason}</h3>
      <p><b>Email:</b> ${a.email}</p>
      <p><b>IP:</b> ${a.ip}</p>
      <p><b>Time:</b> ${a.timestamp}</p>
      <p><b>Severity:</b> ${a.severity}</p>
    `;

    container.appendChild(div);
  });
}


function renderPaymentAnomalies(data, container) {

  if (!data.length) {
    container.innerHTML = "<p>No payment anomalies detected</p>";
    return;
  }

  container.innerHTML = "";

  data.forEach(a => {

    const div = document.createElement("div");
    div.className = "log-card";

    div.innerHTML = `
      <h3>💳 ${a.reason}</h3>
      <p><b>Email:</b> ${a.email}</p>
      <p><b>Amount:</b> ₹${a.amount}</p>
      <p><b>Time:</b> ${a.timestamp}</p>
      <p><b>Severity:</b> ${a.severity}</p>
    `;

    container.appendChild(div);
  });
}


function renderStats(loginAnomalies, paymentAnomalies, container) {

  const totalLogin = loginAnomalies.length;
  const totalPayment = paymentAnomalies.length;

  container.innerHTML = `
    <div class="stat-card">
      <h3>Login Attacks</h3>
      <p>${totalLogin}</p>
    </div>

    <div class="stat-card">
      <h3>Payment Anomalies</h3>
      <p>${totalPayment}</p>
    </div>
  `;
}


window.onload = loadLogs;