// ─── Backend integration ──────────────────────────────────────────────────────
const API_BASE = "https://foodiepro.duckdns.org";
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) throw new Error(detail.map(d => d.msg || JSON.stringify(d)).join(", "));
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}
// ─────────────────────────────────────────────────────────────────────────────

// Global state
let selectedRole = "";
let failedUserAttempts = 0;  // Alert after 5 failed user logins
let failedAdminAttempts = 0; // Alert after 3 failed admin logins
let typeFilter = "all";
let cart = [];
let subtotal = 0;
let discount = 0;
let selectedPayment = "UPI";
const CART_STORAGE_KEY = "foodiepro_cart_v1";

// Footer modal DOM refs
const footerModal = document.getElementById("footerModal");
const footerModalTitle = document.getElementById("footerModalTitle");
const footerModalBody = document.getElementById("footerModalBody");
const footerModalClose = document.getElementById("footerModalClose");

// Footer content data
const footerContent = {
  about: {
    title: "About FoodiePro",
    body: `
      <strong>FoodiePro</strong> is a modern food ordering experience built for speed,
      clean design, and secure checkout. Browse restaurants, add dishes to cart,
      apply coupons, and place orders in seconds.
      <div class="pill">⚡ Fast delivery</div>
      <div class="pill">🔒 Secure payments</div>
      <div class="pill">🎁 Great offers</div>
    `,
  },
  contact: {
    title: "Contact Us",
    body: `
      Need help? Reach our support team anytime:
      <br><br>
      <strong>Email:</strong> support@foodiepro.com<br>
      <strong>Phone:</strong> +91-98765-43210
      <div class="pill">Response: 9am–9pm</div>
    `,
  },
  support: {
    title: "Help & Support",
    body: `
      For order issues, payment help, or account support:
      <br><br>
      - Check your cart and applied coupons before paying.<br>
      - If payment fails, try UPI or Cash on Delivery.<br>
      - For urgent help, contact support using the details in <strong>Contact Us</strong>.
    `,
  },
  terms: {
    title: "Terms & Conditions",
    body: `
      By using FoodiePro, you agree to:
      <br><br>
      1) Prices, offers, and delivery times may vary by restaurant.<br>
      2) Orders once placed may not be cancellable after preparation starts.<br>
      3) Refunds (if applicable) are processed to the original payment method.<br>
      4) Users must provide correct delivery address and contact details.<br>
      5) Misuse, fraud, or abuse may lead to account suspension.
    `,
  },
  privacy: {
    title: "Privacy Policy",
    body: `
      We collect only what’s needed to deliver your order:
      <br><br>
      - Contact details (name, email, phone) and delivery address<br>
      - Order items and payment method selection<br><br>
      We do not sell your personal data. Data is stored locally in your browser
      for demo purposes (e.g., cart/orders) and used to run the app experience.
    `,
  },
};

// Orders/users (shared with dashboard/logs)
let orders = JSON.parse(localStorage.getItem("orders")) || [];
let users = JSON.parse(localStorage.getItem("users")) || [];
let activeDeliveries = 3;
let ordersChartInstance = null;
let currentRestaurantIndex = null;

// Footer modal helpers
function openFooterModal(key) {
  const content = footerContent[key];
  if (!content || !footerModal) return;
  footerModalTitle.textContent = content.title;
  footerModalBody.innerHTML = content.body;
  footerModal.classList.add("show");
  footerModal.setAttribute("aria-hidden", "false");
}

function closeFooterModal() {
  if (!footerModal) return;
  footerModal.classList.remove("show");
  footerModal.setAttribute("aria-hidden", "true");
}

// Global footer/listeners
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-footer-modal]");
  if (btn) {
    e.preventDefault();
    openFooterModal(btn.getAttribute("data-footer-modal"));
  }

  if (e.target === footerModal) {
    closeFooterModal();
  }
});

if (footerModalClose) {
  footerModalClose.addEventListener("click", closeFooterModal);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeFooterModal();
    // closeRestaurantEditor defined in dashboard.js
    if (typeof closeRestaurantEditor === "function") {
      closeRestaurantEditor();
    }
  }
});

// Cart helpers
function saveCart() {
  const data = { cart, subtotal, discount, selectedPayment };
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data));
}

function toggleCardDetails() {
  const cardBox = document.getElementById("cardDetails");
  if (!cardBox) return;
  if (selectedPayment === "Card") {
    cardBox.classList.remove("hidden");
  } else {
    cardBox.classList.add("hidden");
  }
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.cart)) cart = parsed.cart;
    if (typeof parsed.subtotal === "number") subtotal = parsed.subtotal;
    if (typeof parsed.discount === "number") discount = parsed.discount;
    if (parsed.selectedPayment) selectedPayment = parsed.selectedPayment;
    updateCartNumbers();
    renderCart();
    toggleCardDetails();
  } catch (e) {
    console.error("Failed to load cart from storage", e);
  }
}

// Splash + init
window.onload = function () {
  // Initialize Google Sign In
  google.accounts.id.initialize({
    client_id: "917600023405-n1e79qvime9cfsug0kog9vo8o1lb3gk4.apps.googleusercontent.com",
    callback: handleCredentialResponse
  });

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  setTimeout(() => {
    const splash = document.getElementById("splash");
    const roleSelect = document.getElementById("roleSelect");
    if (splash) splash.style.display = "none";
    if (roleSelect) roleSelect.style.display = "flex";
  }, 3000);

  loadCart();

  // Load saved location if present
  try {
    const saved = JSON.parse(localStorage.getItem("userLocation") || "null");
    if (saved && saved.lat && saved.lon) {
      setNavLocation(saved.lat, saved.lon);
    }
  } catch {}
};
// Role / login
function selectRole(role) {
  selectedRole = role;
  document.getElementById("roleSelect").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("loginTitle").innerText =
    role === "admin" ? "Admin Login" : "User Login";
}

function goBack() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("roleSelect").style.display = "flex";
  document.getElementById("email").value = "";
  document.getElementById("password").value = "";
}

function togglePassword() {
  const pwd = document.getElementById("password");
  if (!pwd) return;
  pwd.type = pwd.type === "password" ? "text" : "password";
}

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (email === "" || password === "") {
    alert("Please fill all fields");
    return;
  }

  // Admin login — log attempt to backend for anomaly detection
  if (selectedRole === "admin") {
    // Always log admin attempt to backend first
    try {
      await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@foodiepro.com", password, role: "admin" }),
      });
    } catch (e) {
      console.warn("Admin login log failed:", e.message);
    }

    if (email === "admin@foodiepro.com" && password === "Admin123") {
      failedAdminAttempts = 0;
      enterApp();
    } else {
      failedAdminAttempts++;
      if (failedAdminAttempts >= 3) {
        alert("⚠️ WARNING: Your account has been flagged for suspicious activity due to " + failedAdminAttempts + " failed admin login attempts. This incident has been reported to the admin.");
      } else {
        alert("Invalid Admin Credentials (" + failedAdminAttempts + " of 3 attempts)");
      }
    }
    return;
  }

  // Validate password format for frontend access
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,}$/;
  if (!regex.test(password)) {
    // Still log failed attempt to backend for anomaly detection
    try {
      await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ email, password, role: "user" }),
      });
    } catch (e) {}
    failedUserAttempts++;
    if (failedUserAttempts >= 5) {
      alert("⚠️ WARNING: " + failedUserAttempts + " failed login attempts detected! Your activity has been flagged and reported to the admin.");
    } else {
      alert("Password must contain Capital, Small letter and Number");
    }
    return;
  }

  // Register on backend first (creates user if new, skips if exists)
  try {
    await apiFetch("/register", {
      method: "POST",
      body: JSON.stringify({ email, password, role: "user" }),
    });
  } catch (e) {
    console.log("Register skipped:", e.message);
  }

  // Now log login attempt (user exists in MongoDB)
  try {
    const loginResult = await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({ email, password, role: "user" }),
    });
    console.log("Login result:", loginResult);
    if (loginResult.status === "failed") {
      failedUserAttempts++;
      if (failedUserAttempts >= 5) {
        alert("⚠️ WARNING: " + failedUserAttempts + " failed login attempts detected! Your activity has been flagged and reported to the admin.");
      } else {
        alert("Wrong email or password.");
      }
      return;
    } else {
      failedUserAttempts = 0;
    }
  } catch (e) {
    console.warn("Login log failed:", e.message);
  }

  // Keep local users list in sync for admin dashboard
  if (!users.find((u) => u.email === email)) {
    users.push({ email });
    localStorage.setItem("users", JSON.stringify(users));
  }

  enterApp();
}

function enterApp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("app").style.display = "block";

  if (selectedRole === "admin") {
    document.getElementById("adminDashboard").classList.remove("hidden");
    document.getElementById("appMain").classList.add("hidden");
    const bs = document.getElementById("brandStrip");
    if (bs) bs.classList.add("hidden");
    showAdminTab("overview");
    updateDashboard();
    renderOrders();
    renderUsers();
    renderAdminRestaurants();
  } else {
    document.getElementById("adminDashboard").classList.add("hidden");
    document.getElementById("appMain").classList.remove("hidden");
    const bs = document.getElementById("brandStrip");
    if (bs) bs.classList.remove("hidden");
  }
}

// Restaurant data
const restaurants = [
  {
    name: "Green Bowl Kitchen",
    type: "veg",
    rating: 4,
    status: "open",
    delivery: 25,
    offer: "20% OFF",
    location: "Indiranagar, Bangalore",
    img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c",
  },
  {
    name: "Veggie Delight",
    type: "veg",
    rating: 5,
    status: "open",
    delivery: 20,
    offer: "Free Delivery",
    location: "Koramangala, Bangalore",
    img: "https://images.unsplash.com/photo-1490645935967-10de6ba17061",
  },
  {
    name: "Herbivore Heaven",
    type: "veg",
    rating: 3,
    status: "closed",
    delivery: 30,
    offer: "10% OFF",
    location: "Jayanagar, Bangalore",
    img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd",
  },
  {
    name: "Fresh Roots Cafe",
    type: "veg",
    rating: 4,
    status: "open",
    delivery: 22,
    offer: "Flat ₹50 OFF",
    location: "Whitefield, Bangalore",
    img: "https://images.unsplash.com/photo-1551183053-bf91a1d81141",
  },
  {
    name: "Nature Plate",
    type: "veg",
    rating: 5,
    status: "open",
    delivery: 28,
    offer: "15% OFF",
    location: "HSR Layout, Bangalore",
    img: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601",
  },
  {
    name: "Organic Feast",
    type: "veg",
    rating: 4,
    status: "open",
    delivery: 24,
    offer: "Free Dessert",
    location: "Malleshwaram, Bangalore",
    img: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0",
  },
  {
    name: "Veg Paradise",
    type: "veg",
    rating: 5,
    status: "open",
    delivery: 19,
    offer: "20% OFF",
    location: "BTM Layout, Bangalore",
    img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
  },
  {
    name: "Green Garden Dine",
    type: "veg",
    rating: 3,
    status: "closed",
    delivery: 35,
    offer: "Buy 1 Get 1",
    location: "Banashankari, Bangalore",
    img: "https://images.unsplash.com/photo-1481931098730-318b6f776db0",
  },
  {
    name: "Healthy Bites",
    type: "veg",
    rating: 4,
    status: "open",
    delivery: 27,
    offer: "₹100 OFF",
    location: "Electronic City, Bangalore",
    img: "https://images.unsplash.com/photo-1467003909585-2f8a72700288",
  },
  {
    name: "Pure Veg Hub",
    type: "veg",
    rating: 5,
    status: "open",
    delivery: 23,
    offer: "Free Delivery",
    location: "Yelahanka, Bangalore",
    img: "https://images.unsplash.com/photo-1498837167922-ddd27525d352",
  },

  {
    name: "Royal Biryani House",
    type: "nonveg",
    rating: 5,
    status: "open",
    delivery: 30,
    offer: "Flat ₹75 OFF",
    location: "Frazer Town, Bangalore",
    img: "https://images.pexels.com/photos/4669283/pexels-photo-4669283.jpeg?cs=srgb&dl=pexels-jdgromov-4669283.jpg&fm=jpg",
  },
  {
    name: "Grill & Flames",
    type: "nonveg",
    rating: 4,
    status: "open",
    delivery: 35,
    offer: "Buy 1 Get 1",
    location: "Marathahalli, Bangalore",
    img: "https://images.unsplash.com/photo-1550547660-d9450f859349",
  },
  {
    name: "Spicy Tandoor",
    type: "nonveg",
    rating: 5,
    status: "open",
    delivery: 28,
    offer: "₹100 OFF",
    location: "Rajajinagar, Bangalore",
    img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
  },
  {
    name: "Chicken Corner",
    type: "nonveg",
    rating: 4,
    status: "open",
    delivery: 26,
    offer: "20% OFF",
    location: "KR Puram, Bangalore",
    img: "https://images.unsplash.com/photo-1606755962773-d324e0a13086",
  },
  {
    name: "BBQ Nation Hub",
    type: "nonveg",
    rating: 5,
    status: "open",
    delivery: 32,
    offer: "Free Delivery",
    location: "Sarjapur Road, Bangalore",
    img: "https://images.unsplash.com/photo-1525755662778-989d0524087e",
  },
  {
    name: "Seafood Express",
    type: "nonveg",
    rating: 3,
    status: "closed",
    delivery: 40,
    offer: "15% OFF",
    location: "Ulsoor, Bangalore",
    img: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38",
  },
  {
    name: "Mughal Darbar",
    type: "nonveg",
    rating: 4,
    status: "open",
    delivery: 29,
    offer: "₹150 OFF",
    location: "Shivaji Nagar, Bangalore",
    img: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092",
  },
  {
    name: "Tandoori Nights",
    type: "nonveg",
    rating: 5,
    status: "open",
    delivery: 25,
    offer: "25% OFF",
    location: "Hebbal, Bangalore",
    img: "https://static.vecteezy.com/system/resources/thumbnails/034/308/500/small_2x/a-plate-of-food-sitting-on-a-street-at-night-ai-generated-free-photo.jpg",
  },
  {
    name: "Kebab Junction",
    type: "nonveg",
    rating: 4,
    status: "open",
    delivery: 27,
    offer: "Free Dessert",
    location: "JP Nagar, Bangalore",
    img: "https://images.unsplash.com/photo-1544025162-d76694265947",
  },
  {
    name: "Meat Lovers Hub",
    type: "nonveg",
    rating: 5,
    status: "open",
    delivery: 31,
    offer: "Buy 2 Get 1",
    location: "Bellandur, Bangalore",
    img: "https://images.unsplash.com/photo-1543353071-873f17a7a088",
  },
];

const menus = {
  "Green Bowl Kitchen": [
    {
      name: "Paneer Lababdar",
      price: 180,
      img: "https://cdn.grofers.com/assets/search/usecase/banner/paneer_lababdar_01.png",
    },
    {
      name: "Veg Pulao",
      price: 140,
      img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    },
    {
      name: "Dal Makhani",
      price: 160,
      img: "https://images.unsplash.com/photo-1625943553852-781c6dd46faa?w=400",
    },
    {
      name: "Stuffed Paratha",
      price: 120,
      img: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400",
    },
    {
      name: "Gobi Manchurian",
      price: 170,
      img: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400",
    },
  ],
  "Healthy Bites": [
    {
      name: "Quinoa Veg Power Bowl",
      price: 220,
      img: "https://th.bing.com/th/id/OIP.CXBF4HMf8lj94xV2stfxcgHaLH?w=186&h=279",
    },
    {
      name: "Grilled Chicken Salad",
      price: 260,
      img: "https://www.wellseasonedstudio.com/wp-content/uploads/2023/04/Grilled-chicken-salad-with-cucumbers-and-creamy-garlic-dressing-on-a-plate.jpg",
    },
    {
      name: "Avocado Toast Delight",
      price: 180,
      img: "https://tse1.explicit.bing.net/th/id/OIP.F1BajMvTVjHEmfScFAMNoAHaJ3",
    },
    {
      name: "Steamed Fish with Herbs",
      price: 320,
      img: "https://static.vecteezy.com/system/resources/previews/009/724/141/non_2x/steamed-sea-bass-fish-with-herbs-photo.jpg",
    },
    {
      name: "Oats & Fruit Smoothie Bowl",
      price: 150,
      img: "https://tse3.mm.bing.net/th/id/OIP.cLQwZYbJ7Oudswd-8mu6fwHaJ4",
    },
  ],
  "Veggie Delight": [
    {
      name: "Masala Dosa",
      price: 110,
      img: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400",
    },
    {
      name: "Chole Bhature",
      price: 130,
      img: "https://3.bp.blogspot.com/-uck7Fi_bRfw/UA7ogu0DrzI/AAAAAAAARSI/rmu9iluFJG0/s1600/cb+ten.jpg",
    },
    {
      name: "Palak Paneer",
      price: 190,
      img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
    },
    {
      name: "Veg Fried Rice",
      price: 150,
      img: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400",
    },
    {
      name: "Aloo Tikki",
      price: 100,
      img: "https://smithakalluraya.com/wp-content/uploads/2021/06/how-to-do-aloo-tikki-1483x2048.jpg",
    },
  ],
  "Herbivore Heaven": [
    {
      name: "Spinach Lasagna",
      price: 210,
      img: "https://images.unsplash.com/photo-1605475129013-3c5e5b87b84d?w=400",
    },
    {
      name: "Tofu Curry",
      price: 200,
      img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400",
    },
    {
      name: "Veggie Wrap",
      price: 160,
      img: "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=400",
    },
    {
      name: "Avocado Salad",
      price: 230,
      img: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400",
    },
    {
      name: "Zucchini Stir Fry",
      price: 190,
      img: "https://images.unsplash.com/photo-1512058564366-c9e3e046ae4a?w=400",
    },
  ],
  "Fresh Roots Cafe": [
    {
      name: "Quinoa Bowl",
      price: 220,
      img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
    },
    {
      name: "Veg Club Sandwich",
      price: 150,
      img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400",
    },
    {
      name: "Tomato Basil Pasta",
      price: 200,
      img: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400",
    },
    {
      name: "Caesar Salad",
      price: 180,
      img: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400",
    },
    {
      name: "Mushroom Soup",
      price: 140,
      img: "https://images.unsplash.com/photo-1604909052743-94e838986d24?w=400",
    },
  ],
  "Nature Plate": [
    {
      name: "Veg Thali",
      price: 250,
      img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    },
    {
      name: "Rajma Chawal",
      price: 160,
      img: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400",
    },
    {
      name: "Bhindi Masala",
      price: 150,
      img: "https://images.unsplash.com/photo-1625943553852-781c6dd46faa?w=400",
    },
    {
      name: "Veg Korma",
      price: 190,
      img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
    },
    {
      name: "Lemon Rice",
      price: 130,
      img: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400",
    },
  ],
  "Organic Feast": [
    {
      name: "Brown Rice Bowl",
      price: 210,
      img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
    },
    {
      name: "Grilled Veggies",
      price: 180,
      img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400",
    },
    {
      name: "Paneer Tikka",
      price: 220,
      img: "https://sharethespice.com/wp-content/uploads/2024/02/Paneer-Tikka-Featured-720x720.jpg",
    },
    {
      name: "Veg Noodles",
      price: 160,
      img: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400",
    },
    {
      name: "Corn Cheese Balls",
      price: 150,
      img: "https://jeccachantilly.com/wp-content/uploads/2023/06/corn-cheese-ball-1-780x1386.jpg",
    },
  ],
  "Veg Paradise": [
    {
      name: "Malai Kofta",
      price: 230,
      img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
    },
    {
      name: "Paneer Biryani",
      price: 200,
      img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    },
    {
      name: "Veg Manchurian",
      price: 170,
      img: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400",
    },
    {
      name: "Cheese Paratha",
      price: 140,
      img: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400",
    },
    {
      name: "Mix Veg Curry",
      price: 180,
      img: "https://images.unsplash.com/photo-1625943553852-781c6dd46faa?w=400",
    },
  ],
  "Pure Veg Hub": [
    {
      name: "Chole Bhature",
      price: 120,
      img: "https://bluenilekitchen.com/wp-content/uploads/2024/08/IMG_0208-scaled.jpg",
    },
    {
      name: "Aloo Tikki",
      price: 90,
      img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    },
    {
      name: "Corn Cheese Balls",
      price: 110,
      img: "https://i.ytimg.com/vi/F2dwT44V334/maxresdefault.jpg",
    },
    {
      name: "Paneer Tikka",
      price: 180,
      img: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400",
    },
    {
      name: "Paneer Butter Masala",
      price: 200,
      img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
    },
    {
      name: "Veg Biryani",
      price: 150,
      img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400",
    },
    {
      name: "Mushroom Curry",
      price: 170,
      img: "https://bountyandsoul.org/wp-content/uploads/2020/08/Mushroom-Curry.jpg",
    },
    {
      name: "Veg Hakka Noodles",
      price: 140,
      img: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400",
    },
    {
      name: "Malai Kofta",
      price: 190,
      img: "https://tse2.mm.bing.net/th/id/OIP.Q9Au0pSwH8dBYHEpXmfO6gHaHa",
    },
  ],
  "Royal Biriyani House": [
    {
      name: "Butter chicken",
      price: 260,
      img: "https://www.cookingclassy.com/wp-content/uploads/2021/01/butter-chicken-3.jpg",
    },
    {
      name: "Chicken Biriyani",
      price: 240,
      img: "https://ministryofcurry.com/wp-content/uploads/2024/06/chicken-biryani-5.jpg",
    },
    {
      name: "Mutton Rogan Josh",
      price: 320,
      img: "https://www.chefspencil.com/wp-content/uploads/Kashmiri-Lamb-Curry-1-960x800.jpg",
    },
    {
      name: "Fish Fry",
      price: 280,
      img: "https://1.bp.blogspot.com/-dmr7TvaMJ7c/WRyLh1RZjlI/AAAAAAAAIF4/uPHo3WFtctE8ZS34-s0mkRyNRkU-2-SzgCLcB/s1600/0000000000000000000000A%2B%25281%2529.jpg",
    },
    {
      name: "Chicken Tandoori",
      price: 300,
      img: "https://www.momloveshome.net/wp-content/uploads/2025/01/Indian-Tandoori-Chicken2-e1738500919870.png",
    },
    {
      name: "chicken 65",
      price: 150,
      img: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhJzcXtS349Z26W4hgDfT6CvKXOCmM4Nzkl1QsQp8sgkBGiGDrV_zPwTIwjcq_u7DfS-ldnb7u0Nlh8P6EO66XQK0D2sbL7jpvVxCiERuZ_zHwArHm4MAxNAB5eq9L55skvLMQQylHioTc/s1600/00000000000000000000000000000000000000000000000000000000A.jpg",
    },
    {
      name: "chicken manchurian",
      price: 170,
      img: "https://tse1.mm.bing.net/th/id/OIP.4plk0NVAGyA3SVUynuSifwHaLH?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken Hakka Noodles",
      price: 140,
      img: "https://runoflif.com/wp-content/uploads/2025/11/chicken-hakka-noodles.jpg",
    },
    {
      name: "chicken tikka",
      price: 190,
      img: "https://static01.nyt.com/images/2023/02/02/multimedia/cp-chicken-tikka-pqtk/cp-chicken-tikka-pqtk-threeByTwoMediumAt2X.jpg",
    },
  ],
  "Grill & Flames": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
  "Spicy Tandoor": [
    {
      name: "Chole Bhature",
      price: 120,
      img: "https://bluenilekitchen.com/wp-content/uploads/2024/08/IMG_0208-scaled.jpg",
    },
    {
      name: "Aloo Tikki",
      price: 90,
      img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    },
    {
      name: "Corn Cheese Balls",
      price: 110,
      img: "https://i.ytimg.com/vi/F2dwT44V334/maxresdefault.jpg",
    },
    {
      name: "Paneer Tikka",
      price: 180,
      img: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400",
    },
    {
      name: "Paneer Butter Masala",
      price: 200,
      img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
    },
    {
      name: "Veg Biryani",
      price: 150,
      img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400",
    },
    {
      name: "Mushroom Curry",
      price: 170,
      img: "https://bountyandsoul.org/wp-content/uploads/2020/08/Mushroom-Curry.jpg",
    },
    {
      name: "Veg Hakka Noodles",
      price: 140,
      img: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400",
    },
    {
      name: "Malai Kofta",
      price: 190,
      img: "https://tse2.mm.bing.net/th/id/OIP.Q9Au0pSwH8dBYHEpXmfO6gHaHa",
    },
  ],
  "Chicken corner": [
    {
      name: "Chole Bhature",
      price: 120,
      img: "https://bluenilekitchen.com/wp-content/uploads/2024/08/IMG_0208-scaled.jpg",
    },
    {
      name: "Aloo Tikki",
      price: 90,
      img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    },
    {
      name: "Corn Cheese Balls",
      price: 110,
      img: "https://i.ytimg.com/vi/F2dwT44V334/maxresdefault.jpg",
    },
    {
      name: "Paneer Tikka",
      price: 180,
      img: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400",
    },
    {
      name: "Paneer Butter Masala",
      price: 200,
      img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
    },
    {
      name: "Veg Biryani",
      price: 150,
      img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400",
    },
    {
      name: "Mushroom Curry",
      price: 170,
      img: "https://bountyandsoul.org/wp-content/uploads/2020/08/Mushroom-Curry.jpg",
    },
    {
      name: "Veg Hakka Noodles",
      price: 140,
      img: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400",
    },
    {
      name: "Malai Kofta",
      price: 190,
      img: "https://tse2.mm.bing.net/th/id/OIP.Q9Au0pSwH8dBYHEpXmfO6gHaHa",
    },
  ],
  "BBQ Nation Hub": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
  "Seafood Express": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
  "Mughal Darbar": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
  "Tandoori Nights": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
  "Kebab Junction": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
  "Meat Lovers Hub": [
    {
      name: "Laal Mirch Jheenga",
      price: 120,
      img: "https://karmacommunity.karmagroup.com/wp-content/uploads/2023/09/images_karmagroup_banner-food-banner.jpg",
    },
    {
      name: "Peri peri chicken swarma",
      price: 90,
      img: "https://tse1.mm.bing.net/th/id/OIP.ZKJPDV21uI5ocX1b1AnDLgHaJ4?pid=Api&P=0&h=180",
    },
    {
      name: "Mutton seekh kabab",
      price: 110,
      img: "https://tse2.mm.bing.net/th/id/OIP.7XMMyT4FYp5cp4tgCNlSPQHaDO?pid=Api&P=0&h=180",
    },
    {
      name: "Bhatti paneer tikka",
      price: 180,
      img: "https://tse1.mm.bing.net/th/id/OIP.uxZyx2BrmtT4eMIt88GfnAHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Tandoori malai brocoli",
      price: 200,
      img: "https://tse2.mm.bing.net/th/id/OIP.KmE7AFGgxHpO0sg2yl-ZbwHaGN?pid=Api&P=0&h=180",
    },
    {
      name: "Chicken roasted wings",
      price: 150,
      img: "https://tse1.mm.bing.net/th/id/OIP.6rAQ_leO6klwG5EZ74cAHgHaE8?pid=Api&P=0&h=180",
    },
    {
      name: "tandoor chicken curry",
      price: 170,
      img: "http://poojascookery.com/wp-content/uploads/2016/07/4-min.jpg",
    },
    {
      name: "Garlic Onion soup",
      price: 140,
      img: "https://tse1.mm.bing.net/th/id/OIP.x5V_g2iAbZ_8tPi9nzR70gHaHa?pid=Api&P=0&h=180",
    },
    {
      name: "Fish finger",
      price: 190,
      img: "https://tse3.mm.bing.net/th/id/OIP.eVWfrEHXPhyW6bVyZrdMcAHaFj?pid=Api&P=0&h=180",
    },
  ],
};

// UI: popup + filters
function openPopup() {
  document.getElementById("popup").classList.add("show");
  renderData(restaurants);
}

function closePopup() {
  document.getElementById("popup").classList.remove("show");
}

function filterType(type) {
  typeFilter = type;
  applyFilters();
}

function applyFilters() {
  let data = [...restaurants];
  const search = document.getElementById("search").value.toLowerCase();

  if (search) {
    data = data.filter((r) => r.name.toLowerCase().includes(search));
  }
  if (typeFilter !== "all") {
    data = data.filter((r) => r.type === typeFilter);
  }
  const sort = document.getElementById("sort").value;
  if (sort === "high") {
    data.sort((a, b) => b.rating - a.rating);
  }
  if (sort === "low") {
    data.sort((a, b) => a.rating - b.rating);
  }

  renderData(data);
}

function renderData(data) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  data.forEach((res) => {
    const stars = "★".repeat(res.rating) + "☆".repeat(5 - res.rating);
    grid.innerHTML += `
      <div class="card" onclick="openMenu('${res.name}','${res.type}','${res.status}')">
        <img src="${res.img}?w=400&q=70" loading="lazy">
        <span class="status" style="background:${
          res.status === "open" ? "#16a34a" : "#b91c1c"
        }">
          ${res.status.toUpperCase()}
        </span>
        <div class="offer">🔥 ${res.offer}</div>
        <h3 style="font-size:15px;margin:2px 0;">${res.name}</h3>
        <p style="font-size:12px;color:#e5e7eb;">${res.location}</p>
        <p style="font-size:12px;color:#9ca3af;">${res.type.toUpperCase()}</p>
        <p style="font-size:12px;color:#9ca3af;">⏱ ${res.delivery} mins</p>
        <div class="rating">${stars}</div>
      </div>`;
  });
}

function openMenu(name, type, status) {
  if (status === "closed") {
    alert("Restaurant Closed ❌");
    return;
  }
  let restaurantMenu = menus[name];
  if (!restaurantMenu) {
    if (type === "veg") {
      restaurantMenu = [
        { name: "Paneer Butter Masala", price: 210 },
        { name: "Veg Biryani", price: 190 },
        { name: "Mushroom Curry", price: 220 },
        { name: "Veg Hakka Noodles", price: 180 },
        { name: "Malai Kofta", price: 230 },
      ];
    } else {
      restaurantMenu = [
        { name: "Butter Chicken", price: 260 },
        { name: "Chicken Biryani", price: 240 },
        { name: "Mutton Rogan Josh", price: 320 },
        { name: "Fish Fry", price: 280 },
        { name: "Chicken Tandoori", price: 300 },
      ];
    }
  }
  let menuItems = "";
  restaurantMenu.forEach((item) => {
    menuItems += `
      <div style="display:flex;gap:15px;align-items:center;margin:12px 0;padding:10px;background:#020617;border-radius:10px;">
        <img
          src="${
            item.img ||
            "https://picsum.photos/200?random=" + Math.floor(Math.random() * 5000)
          }"
          onerror="this.style.background='#333'; this.removeAttribute('src');"
          style="width:86px;height:86px;object-fit:cover;border-radius:10px;">
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">
            ${type === "veg" ? "🥦" : "🍗"} ${item.name}
          </div>
          <div style="font-size:13px;color:#e5e7eb;">₹${item.price}</div>
        </div>
        <button class="btn-primary" style="padding:6px 14px;font-size:12px;"
          onclick="event.stopPropagation();addToCart('${name} - ${
            item.name
          }',${item.price})">
          Add
        </button>
      </div>`;
  });

  document.getElementById("grid").innerHTML = `
    <h2 style="text-align:center;margin-bottom:14px;font-size:18px;">${name} Menu</h2>
    ${menuItems}
    <div style="text-align:center;margin-top:16px;">
      <button class="btn-primary" style="background:#111827;border:1px solid #4b5563;"
        onclick="applyFilters()">
        ⟵ Back to all restaurants
      </button>
    </div>
  `;
}

function openOffers() {
  document.getElementById("popup").classList.add("show");
  const offerRestaurants = restaurants.filter(
    (r) => r.offer && r.offer.toLowerCase().includes("off"),
  );
  renderData(offerRestaurants.length ? offerRestaurants : restaurants);
}

function showContact() {
  alert(
    "FoodiePro Support\nPhone: +91-98765-43210\nEmail: support@foodiepro.com",
  );
}

// Cart logic
function addToCart(name, price) {
  const item = cart.find((i) => i.name === name);
  if (item) {
    item.qty++;
  } else {
    cart.push({ name, price, qty: 1 });
  }
  updateCartNumbers();
  renderCart();
  saveCart();
}

function updateCartNumbers() {
  subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById("cartCount").innerText = `(${count})`;
}

function renderCart() {
  const cartItems = document.getElementById("cartItems");
  cartItems.innerHTML = "";

  if (cart.length === 0) {
    cartItems.innerHTML =
      '<div style="font-size:13px;color:#9ca3af;">Your cart is empty. Add some dishes to continue.</div>';
  } else {
    cart.forEach((item) => {
      cartItems.innerHTML += `
        <div class="cart-item">
          <div class="cart-item-name">
            <div style="font-size:13px;font-weight:500;">${item.name}</div>
            <div class="cart-item-qty">Qty: ${item.qty}</div>
          </div>
          <div style="font-size:13px;font-weight:600;">₹${
            item.price * item.qty
          }</div>
        </div>`;
    });
  }

  const total = Math.max(subtotal - discount, 0);
  document.getElementById("cartSubtotal").innerText = subtotal;
  document.getElementById("cartDiscount").innerText = Math.round(discount);
  document.getElementById("cartTotal").innerText = Math.round(total);
  document.getElementById("payAmount").innerText = Math.round(total);
}

function openCartPage() {
  document.getElementById("appMain").style.display = "none";
  const bs = document.getElementById("brandStrip");
  if (bs) bs.style.display = "none";
  document.getElementById("cartPage").style.display = "block";
  renderCart();
}

function closeCartPage() {
  document.getElementById("cartPage").style.display = "none";
  document.getElementById("appMain").style.display = "flex";
  const bs = document.getElementById("brandStrip");
  if (bs) bs.style.display = "block";
}

function onCouponChange() {
  const code = document.getElementById("couponSelect").value;
  applyCoupon(code);
}

function applyCoupon(code) {
  if (subtotal === 0 && code) {
    alert("Add some items to apply a coupon.");
    document.getElementById("couponSelect").value = "";
    return;
  }
  if (!code) {
    discount = 0;
    renderCart();
    saveCart();
    return;
  }
  if (code === "SAVE50" && subtotal >= 299) {
    discount = 50;
  } else if (code === "FOODIE20") {
    discount = Math.min(subtotal * 0.2, 100);
  } else if (code === "MEGA100" && subtotal >= 499) {
    discount = 100;
  } else if (code === "NEWUSER") {
    discount = 75;
  } else {
    alert("Coupon not applicable");
    return;
  }
  renderCart();
  saveCart();
  alert(code + " Applied Successfully 🎉");
}

function selectPayment(method, element) {
  selectedPayment = method;
  document.querySelectorAll(".pay-card").forEach((card) => {
    card.classList.remove("active");
  });
  element.classList.add("active");
  toggleCardDetails();
  saveCart();
}

// Checkout
async function checkout() {
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const name = document.getElementById("userName").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const phone = document.getElementById("userPhone").value.trim();
  const address = document.getElementById("userAddress").value.trim();

  if (!name || !email || !phone || !address) {
    alert("Please fill name, email, phone and address.");
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    alert("Please enter a valid email address.");
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    alert("Phone number must be 10 digits.");
    return;
  }

  if (selectedPayment === "Card") {
    const cardType = document.getElementById("cardType").value.trim();
    const holder = document.getElementById("cardHolder").value.trim();
    const day = document.getElementById("cardDay").value.trim();
    const month = document.getElementById("cardMonth").value.trim();
    const year = document.getElementById("cardYear").value.trim();
    const cvv = document.getElementById("cardCvv").value.trim();

    if (!cardType) {
      alert(
        "Please select a card type (RuPay / SBI / HDFC / MasterCard / VISA).",
      );
      return;
    }
    if (!holder) {
      alert("Please enter card holder name.");
      return;
    }
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2024 && y <= 2100)) {
      alert("Please enter a valid expiry date (DD / MM / YYYY).");
      return;
    }
    if (!/^\d{3}$/.test(cvv)) {
      alert("CVV must be exactly 3 digits.");
      return;
    }
  }

  const totalToPay = Math.max(subtotal - discount, 0);
  const order = {
    id: Date.now(),
    items: cart.slice(),
    total: totalToPay,
    status: "Preparing",
    customer: { name, email, phone, address },
  };

  // ── Razorpay UPI Payment ─────────────────────────────────────────────────
  if (selectedPayment === "UPI" || selectedPayment === "Razorpay") {
    try {
      const orderRes = await apiFetch("/create-order", {
        method: "POST",
        body: JSON.stringify({ email, amount: Math.round(totalToPay) }),
      });

      if (orderRes.status !== "success") {
        alert("Payment initiation failed. Please try again.");
        return;
      }

      const options = {
        key: "rzp_test_SLj72bjD4is5HQ",
        amount: orderRes.amount,
        currency: orderRes.currency,
        name: "FoodiePro",
        description: "Food Order Payment",
        order_id: orderRes.order_id,
        prefill: { name, email, contact: phone },
        theme: { color: "#f97316" },
        method: { upi: true, card: false, netbanking: false, wallet: false },
        handler: async function(response) {
          try {
            await apiFetch("/payment-result", {
              method: "POST",
              body: JSON.stringify({
                email, amount: Math.round(totalToPay),
                payment_id: response.razorpay_payment_id,
                status: "success"
              }),
            });
          } catch(e) { console.warn("Payment result log failed:", e.message); }
          orders.push(order);
          localStorage.setItem("orders", JSON.stringify(orders));
          cart = []; subtotal = 0; discount = 0;
          saveCart(); renderCart(); updateCartNumbers();
          closeCartPage(); updateDashboard(); renderOrders();
          alert("✅ Payment Successful! Order placed for ₹" + Math.round(totalToPay) + " 🎉");
        },
        modal: {
          ondismiss: async function() {
            try {
              await apiFetch("/payment-result", {
                method: "POST",
                body: JSON.stringify({
                  email, amount: Math.round(totalToPay),
                  payment_id: "cancelled_" + Date.now(),
                  status: "failed"
                }),
              });
            } catch(e) {
              console.warn("Failed payment log error:", e.message);
            }
            alert("❌ Payment cancelled.");
          }
        }
      };

      const rzp = new Razorpay(options);
      rzp.open();
      return;

    } catch(e) {
      console.warn("Razorpay error:", e.message);
      alert("Payment failed. Please try again.");
      return;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Non-UPI payments (Card, COD etc)
  try {
    await apiFetch("/payment", {
      method: "POST",
      body: JSON.stringify({ user_email: email, amount: totalToPay, method: selectedPayment }),
    });
  } catch (e) {
    console.warn("Payment log failed:", e.message);
  }

  orders.push(order);
  localStorage.setItem("orders", JSON.stringify(orders));

  alert(
    "Order Placed Successfully via " +
      selectedPayment +
      " for ₹" +
      Math.round(totalToPay) +
      " 🎉",
  );

  cart = [];
  subtotal = 0;
  discount = 0;
  saveCart();
  renderCart();
  updateCartNumbers();
  closeCartPage();
  updateDashboard();
  renderOrders();
}

// Location helpers
function setNavLocation(lat, lon) {
  const navLabel = document.getElementById("navLocationLabel");
  const navCoords = document.getElementById("navCoords");
  if (navLabel) navLabel.textContent = "Current location";
  if (navCoords) {
    navCoords.classList.remove("hidden");
    navCoords.textContent = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }

  const txt = document.getElementById("locationText");
  if (txt) {
    txt.innerText = `Latitude: ${lat} | Longitude: ${lon}`;
  }
}

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition, showError);
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}

function showPosition(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  localStorage.setItem("userLocation", JSON.stringify({ lat, lon }));
  setNavLocation(lat, lon);
}

function showError() {
  alert("Location access denied.");
}
// Google Sign In Handler
function handleCredentialResponse(response) {
  const token = response.credential;
  const payload = JSON.parse(atob(token.split('.')[1]));
  
  const email = payload.email;
  const name = payload.name;
  const picture = payload.picture;

  console.log("Google Login:", email, name);

  // Register/Login user via backend
  apiFetch("/register", {
    method: "POST",
    body: JSON.stringify({ email, password: token.substring(0, 20), role: "user" }),
  }).catch(() => {});

  apiFetch("/login", {
    method: "POST",
    body: JSON.stringify({ email, password: token.substring(0, 20), role: "user" }),
  }).then(() => {
    // Save user info
    if (!users.find((u) => u.email === email)) {
      users.push({ email });
      localStorage.setItem("users", JSON.stringify(users));
    }
    enterApp();
  }).catch(() => {
    // Enter app anyway since Google verified the user
    enterApp();
  });
}
function triggerGoogleLogin() {
  google.accounts.id.initialize({
    client_id: "917600023405-n1e79qvime9cfsug0kog9vo8o1lb3gk4.apps.googleusercontent.com",
    callback: handleCredentialResponse
  });
  google.accounts.id.prompt();
}