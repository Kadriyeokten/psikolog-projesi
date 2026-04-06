// public/assets/js/admin.js

// URL'den token ve role kontrolü (Ana siteden yönlendirme için)
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get("token");
const urlRole = urlParams.get("role");

if (urlToken) {
  localStorage.setItem("token", urlToken);
  // Eğer role de geldiyse kaydet, gelmediyse token içinden çözülebilir ama basitlik için set edelim
  if (urlRole) localStorage.setItem("role", urlRole);
  else localStorage.setItem("role", "admin"); // Admin paneline gelindiyse varsayılan admindir
  
  // URL'yi temizle (estetik ve güvenlik için)
  window.history.replaceState({}, document.title, window.location.pathname);
}

// Yetki Kontrolü (Giriş yapılmış mı ve rol admin mi?)
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || (role !== "admin" && role !== "superadmin")) {
  alert("Yetkisiz erişim. Lütfen admin olarak giriş yapın.");
  window.location.href = "login.html";
}

// Özel Fetch Fonksiyonu (Tüm isteklerde token gönderir ve hataları yakalar)
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  
  // FormData kullanılıyorsa Content-Type'ı manuel olarak ayarlama (tarayıcı kendi ayarlar)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  headers['Authorization'] = `Bearer ${localStorage.getItem("token")}`;

  const config = {
    ...options,
    headers
  };

  const response = await fetch(url, config);

  if (response.status === 401 || response.status === 403) {
    alert("Oturumunuz geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "login.html";
    throw new Error("Yetkisiz erişim");
  }

  return response;
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Sidebar Navigasyonu
  const sidebarLinks = document.querySelectorAll(".admin-sidebar ul li a");
  const adminSections = document.querySelectorAll(".admin-section");

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetSectionId = link.getAttribute("data-section");
      if (!targetSectionId) return;

      e.preventDefault();
      sidebarLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");

      adminSections.forEach((section) => {
        section.classList.toggle("active", section.id === targetSectionId);
      });
    });
  });

  // 2. İlk Yükleme
  loadSiteContent();
  loadServiceSelect();
  loadAppointments();

  // 3. Buton Event Listenerları
  
  // Hakkımızda Kaydet
  document.getElementById("saveAboutUs")?.addEventListener("click", saveAbout);
  
  // Ayarları Kaydet (WhatsApp vb)
  document.getElementById("saveSettings")?.addEventListener("click", saveSettings);
  
  // Hizmet İşlemleri
  document.getElementById("addService")?.addEventListener("click", addService);
  document.getElementById("updateService")?.addEventListener("click", updateService);
  document.getElementById("deleteService")?.addEventListener("click", deleteService);

  // Görsel Önizlemeleri
  setupImagePreview("aboutUsImage", "about_image");
  setupImagePreview("serviceImage", "service_image");
  setupImagePreview("siteLogo", "site_logo_preview", "currentLogoContainer");
});

// --- YARDIMCI FONKSİYONLAR ---

function setupImagePreview(inputId, imgId, containerId = null) {
  const input = document.getElementById(inputId);
  const img = document.getElementById(imgId);
  const container = containerId ? document.getElementById(containerId) : null;
  if (input && img) {
    input.addEventListener("change", function () {
      const file = this.files[0];
      if (file) {
        img.src = URL.createObjectURL(file);
        img.style.display = "block";
        if (container) container.style.display = "block";
      }
    });
  }
}

async function loadSiteContent() {
  try {
    const res = await authFetch("/api/site-content");
    const data = await res.json();
    if (data) {
      if(document.getElementById("about_title")) document.getElementById("about_title").value = data.about_title || "";
      if(document.getElementById("about_text")) document.getElementById("about_text").value = data.about_text || "";
      if(document.getElementById("feature_title1")) document.getElementById("feature_title1").value = data.feature_title1 || "";
      if(document.getElementById("feature_title2")) document.getElementById("feature_title2").value = data.feature_title2 || "";
      if(document.getElementById("feature_title3")) document.getElementById("feature_title3").value = data.feature_title3 || "";
      if(document.getElementById("feature_desc1")) document.getElementById("feature_desc1").value = data.feature_desc1 || "";
      if(document.getElementById("feature_desc2")) document.getElementById("feature_desc2").value = data.feature_desc2 || "";
      if(document.getElementById("feature_desc3")) document.getElementById("feature_desc3").value = data.feature_desc3 || "";
      if(document.getElementById("feature1")) document.getElementById("feature1").value = data.feature1 || "";
      if(document.getElementById("feature2")) document.getElementById("feature2").value = data.feature2 || "";
      if(document.getElementById("feature3")) document.getElementById("feature3").value = data.feature3 || "";
      if(document.getElementById("feature4")) document.getElementById("feature4").value = data.feature4 || "";
      
      // WhatsApp Numarasını Yükle
      if(document.getElementById("whatsappNumber")) document.getElementById("whatsappNumber").value = data.whatsapp_number || "";

      // Site Başlığı ve Logosunu Yükle
      if(document.getElementById("siteTitle")) document.getElementById("siteTitle").value = data.site_title || "";
      const logoPreview = document.getElementById("site_logo_preview");
      const logoContainer = document.getElementById("currentLogoContainer");
      if (logoPreview && data.site_logo_url) {
        logoPreview.src = data.site_logo_url;
        logoPreview.style.display = "block";
        if (logoContainer) logoContainer.style.display = "block";
      }
      
      const img = document.getElementById("about_image");
      if (img && data.about_image) {
        img.src = data.about_image;
        img.style.display = "block";
      }
    }
  } catch (err) { console.error("Veri çekilemedi:", err); }
}

async function saveAbout() {
  const formData = new FormData();
  formData.append("about_title", document.getElementById("about_title").value);
  formData.append("about_text", document.getElementById("about_text").value);
  formData.append("feature_title1", document.getElementById("feature_title1").value);
  formData.append("feature_title2", document.getElementById("feature_title2").value);
  formData.append("feature_title3", document.getElementById("feature_title3").value);
  formData.append("feature_desc1", document.getElementById("feature_desc1").value);
  formData.append("feature_desc2", document.getElementById("feature_desc2").value);
  formData.append("feature_desc3", document.getElementById("feature_desc3").value);
  formData.append("feature1", document.getElementById("feature1").value);
  formData.append("feature2", document.getElementById("feature2").value);
  formData.append("feature3", document.getElementById("feature3").value);
  formData.append("feature4", document.getElementById("feature4").value);
  
  // WhatsApp numarasını da about içinden (varsa) gönderelim
  const wa = document.getElementById("whatsappNumber")?.value;
  if(wa) formData.append("whatsapp_number", wa);

  const file = document.getElementById("aboutUsImage").files[0];
  if (file) formData.append("image", file);

  try {
    const res = await authFetch("/api/site-content/about", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) alert("Hakkımızda içeriği güncellendi!");
    else alert("Hata: " + data.error);
  } catch (err) { alert("Sunucu hatası!"); }
}

async function saveSettings() {
  const whatsapp_number = document.getElementById("whatsappNumber").value;
  const site_title = document.getElementById("siteTitle").value;
  const logoFile = document.getElementById("siteLogo").files[0];

  const formData = new FormData();
  formData.append("whatsapp_number", whatsapp_number);
  formData.append("site_title", site_title);
  if (logoFile) {
    formData.append("logo", logoFile);
  }

  try {
    const res = await authFetch("/api/site-content/settings", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      alert("Ayarlar kaydedildi!");
      if (data.logo_url) {
        const logoPreview = document.getElementById("site_logo_preview");
        const logoContainer = document.getElementById("currentLogoContainer");
        if (logoPreview) {
          logoPreview.src = data.logo_url;
          logoPreview.style.display = "block";
        }
        if (logoContainer) logoContainer.style.display = "block";
      }
    } else {
      alert("Hata: " + (data.detail || "Bilinmeyen bir hata oluştu."));
    }
  } catch (err) { 
    console.error(err); 
    alert("Sunucuyla bağlantı kurulamadı!"); 
  }
}

// --- HİZMET YÖNETİMİ ---

async function loadServiceSelect() {
  const select = document.getElementById("serviceSelect");
  if (!select) return;
  try {
    const res = await authFetch("/api/services");
    const services = await res.json();
    select.innerHTML = '<option value="">Yeni Hizmet Ekle</option>';
    services.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }
}

document.getElementById("serviceSelect")?.addEventListener("change", async function() {
  const id = this.value;
  if (!id) { clearServiceForm(); return; }
  try {
    const res = await authFetch(`/api/services/${id}`);
    const s = await res.json();
    document.getElementById("serviceTitle").value = s.title;
    document.getElementById("serviceDesc").value = s.dsc;
    document.getElementById("servicePrice").value = s.price || "";
    const img = document.getElementById("service_image");
    if (s.image_path) { img.src = s.image_path; img.style.display = "block"; }
    else img.style.display = "none";
  } catch (err) { console.error(err); }
});

async function addService() {
  const title = document.getElementById("serviceTitle").value;
  const dsc = document.getElementById("serviceDesc").value;
  const price = document.getElementById("servicePrice").value;
  const file = document.getElementById("serviceImage").files[0];
  if (!title || !dsc) return alert("Başlık ve açıklama girin!");

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  formData.append("price", price);
  if (file) formData.append("image", file);

  try {
    const res = await authFetch("/api/services", { method: "POST", body: formData });
    if (res.ok) { 
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: dsc, target: 'en'}) });
      alert("Hizmet eklendi!"); 
      clearServiceForm(); 
      loadServiceSelect(); 
    }
  } catch (err) { alert("Ekleme hatası!"); }
}

async function updateService() {
  const id = document.getElementById("serviceSelect").value;
  if (!id) return alert("Lütfen bir hizmet seçin!");
  const title = document.getElementById("serviceTitle").value;
  const dsc = document.getElementById("serviceDesc").value;
  const price = document.getElementById("servicePrice").value;
  const file = document.getElementById("serviceImage").files[0];

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  formData.append("price", price);
  if (file) formData.append("image", file);

  try {
    const res = await authFetch(`/api/services/${id}`, { method: "PUT", body: formData });
    if (res.ok) { 
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      await authFetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: dsc, target: 'en'}) });
      alert("Hizmet güncellendi!"); 
      loadServiceSelect(); 
    }
  } catch (err) { alert("Güncelleme hatası!"); }
}

async function deleteService() {
  const id = document.getElementById("serviceSelect").value;
  if (!id || !confirm("Emin misiniz?")) return;
  try {
    const res = await authFetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) { alert("Silindi!"); clearServiceForm(); loadServiceSelect(); }
  } catch (err) { alert("Silme hatası!"); }
}

function clearServiceForm() {
  document.getElementById("serviceTitle").value = "";
  document.getElementById("serviceDesc").value = "";
  document.getElementById("servicePrice").value = "";
  document.getElementById("service_image").style.display = "none";
  document.getElementById("serviceImage").value = "";
}

// --- RANDEVU YÖNETİMİ ---

let allAppointments = [];

async function loadAppointments() {
  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;
  try {
    const res = await authFetch('/api/appointments');
    allAppointments = await res.json();
    renderAppointmentsTable(allAppointments);
    if(typeof renderDashboardStats === 'function') renderDashboardStats(allAppointments);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: red;">Veriler yüklenemedi.</td></tr>';
  }
}

function renderDashboardStats(apps) {
  const now = new Date();

  let todayCount = 0;
  let todayRevenue = 0;
  let weeklyCount = 0;
  let weeklyRevenue = 0;
  let monthlyCount = 0;
  let monthlyRevenue = 0;

  const upcomingList = [];
  const patientStats = {};

  apps.forEach(app => {
    const appDate = new Date(app.appointment_date);
    const isPast = appDate < now;

    // Danışan istatistiklerini hesapla (telefon numarasına göre tekil say)
    if (app.status !== 'İptal Edildi' && app.patient_phone) {
        if (!patientStats[app.patient_phone]) {
            patientStats[app.patient_phone] = {
                name: app.patient_name,
                phone: app.patient_phone,
                count: 0,
                last_visit: appDate
            };
        }
        patientStats[app.patient_phone].count++;
        if (appDate > patientStats[app.patient_phone].last_visit) {
            patientStats[app.patient_phone].last_visit = appDate;
        }
    }

    // Sadece aktif (iptal/katılmadı olmayan) randevuları say
    if(app.status !== 'İptal Edildi' && app.status !== 'Katılmadı') {

        // Bugün
        if(appDate.toDateString() === now.toDateString()) {
            todayCount++;
            if(app.price) todayRevenue += parseFloat(app.price);
        }

        // Bu Hafta (Pazartesi - Pazar)
        const currentWeekStart = new Date(now);
        currentWeekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
        currentWeekStart.setHours(0,0,0,0);
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
        currentWeekEnd.setHours(23,59,59,999);

        if (appDate >= currentWeekStart && appDate <= currentWeekEnd) {
            weeklyCount++;
            if(app.price) weeklyRevenue += parseFloat(app.price);
        }

        // Bu Ay
        if(appDate.getMonth() === now.getMonth() && appDate.getFullYear() === now.getFullYear()) {
            monthlyCount++;
            if(app.price) monthlyRevenue += parseFloat(app.price);
        }
    }

    // Yaklaşan Randevular (Gelecekte ve bekleyen)
    if(!isPast && app.status === 'Bekliyor') {
        upcomingList.push(app);
    }
  });

  // Yaklaşan randevuları sırala
  upcomingList.sort((a,b) => new Date(a.appointment_date) - new Date(b.appointment_date));
  
  // Danışanları sırala (en çok randevu alanlar üstte)
  const topPatients = Object.values(patientStats).sort((a, b) => b.count - a.count);

  const elToday = document.getElementById('stat-today-apps');
  const elTodayRev = document.getElementById('stat-daily-revenue');
  const elWeekly = document.getElementById('stat-weekly-apps');
  const elWeeklyRev = document.getElementById('stat-weekly-revenue');
  const elMonthly = document.getElementById('stat-monthly-apps');
  const elRevenue = document.getElementById('stat-monthly-revenue');
  const elTotalPatients = document.getElementById('stat-total-patients');

  if(elToday) elToday.textContent = todayCount;
  if(elTodayRev) elTodayRev.textContent = todayRevenue.toLocaleString('tr-TR') + ' ₺';
  if(elWeekly) elWeekly.textContent = weeklyCount;
  if(elWeeklyRev) elWeeklyRev.textContent = weeklyRevenue.toLocaleString('tr-TR') + ' ₺';
  if(elMonthly) elMonthly.textContent = monthlyCount;
  if(elRevenue) elRevenue.textContent = monthlyRevenue.toLocaleString('tr-TR') + ' ₺';
  if(elTotalPatients) elTotalPatients.textContent = topPatients.length;

  const ulUpcoming = document.getElementById('upcoming-appointments-list');
  if(ulUpcoming) {
      if(upcomingList.length === 0) {
          ulUpcoming.innerHTML = '<li><p style="padding: 15px 0; font-size:1.4rem; color:#888;">Yakın zamanda planlanmış bir randevunuz bulunmuyor.</p></li>';
      } else {
          ulUpcoming.innerHTML = upcomingList.slice(0, 5).map(app => {
              const d = new Date(app.appointment_date);
              const dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
              const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              return `
                <li class="upcoming-item">
                    <div class="upcoming-info">
                        <span class="upcoming-time"><ion-icon name="time-outline" style="vertical-align: middle; margin-right: 3px;"></ion-icon>${dateStr} ${timeStr}</span>
                        <div>
                            <strong style="font-size: 1.4rem; color: var(--midnight-green);">${app.patient_name}</strong>
                            <p style="font-size: 1.2rem; color: #666; margin: 0;">${app.service_name || '-'}</p>
                        </div>
                    </div>
                </li>
              `;
          }).join('');
      }
  }

  const ulTopPatients = document.getElementById('top-patients-list');
  if(ulTopPatients) {
      if(topPatients.length === 0) {
          ulTopPatients.innerHTML = '<li><p style="padding: 15px 0; font-size:1.4rem; color:#888;">Henüz danışan kaydı bulunmuyor.</p></li>';
      } else {
          ulTopPatients.innerHTML = topPatients.slice(0, 5).map((patient, index) => {
              // Rank colors
              let rankColor = "#6b7280"; // gray
              if (index === 0) rankColor = "#fbbf24"; // gold
              if (index === 1) rankColor = "#9ca3af"; // silver
              if (index === 2) rankColor = "#b45309"; // bronze

              return `
                <li class="upcoming-item">
                    <div class="upcoming-info" style="width: 100%;">
                        <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background-color: #f3f4f6; color: ${rankColor}; font-weight: bold; font-size: 1.4rem;">
                            ${index + 1}
                        </div>
                        <div style="flex-grow: 1;">
                            <strong style="font-size: 1.4rem; color: var(--midnight-green);">${patient.name}</strong>
                            <p style="font-size: 1.2rem; color: #666; margin: 0;"><ion-icon name="call-outline" style="vertical-align: middle;"></ion-icon> ${patient.phone}</p>
                        </div>
                        <div style="text-align: right;">
                            <span style="display: inline-block; background-color: #fce7f3; color: #db2777; padding: 4px 10px; border-radius: 20px; font-size: 1.2rem; font-weight: bold;">
                                ${patient.count} Seans
                            </span>
                        </div>
                    </div>
                </li>
              `;
          }).join('');
      }
  }
}

function renderAppointmentsTable(apps) {  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;
  
  if (apps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 40px; text-align: center; color: #888; font-size: 1.4rem;">Randevu bulunamadı.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  apps.forEach(app => {
    const dateObj = new Date(app.appointment_date);
    const now = new Date();
    const isPast = dateObj < now;

    const dateStr = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
    const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    
    // Status Badge Logic
    let statusText = app.status || 'Bekliyor';
    let statusColor = "#856404";
    let statusBg = "#fff3cd";

    if (isPast && statusText === 'Bekliyor') {
      statusText = "Süresi Geçti";
      statusColor = "#495057";
      statusBg = "#e9ecef";
    } else if (statusText === "Tamamlandı") { 
      statusColor = "#155724"; 
      statusBg = "#d4edda"; 
    } else if (statusText === "İptal Edildi") { 
      statusColor = "#721c24"; 
      statusBg = "#f8d7da"; 
    } else if (statusText === "Katılmadı") {
      statusColor = "#721c24"; 
      statusBg = "#f8d7da";
    }

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #eee';
    tr.style.transition = "background 0.2s";
    tr.onmouseover = () => tr.style.background = "#fafafa";
    tr.onmouseout = () => tr.style.background = "transparent";

    tr.innerHTML = `
      <td style="padding: 15px; font-size: 1.4rem;">
        <div style="font-weight: 600; color: ${isPast ? '#999' : 'var(--midnight-green)'};">${dateStr}</div>
        <div style="color: #888; font-size: 1.2rem;">${timeStr}</div>
      </td>
      <td style="padding: 15px; font-size: 1.4rem;">
        <div style="font-weight: 600;">${app.patient_name}</div>
        <div style="color: #666; font-size: 1.2rem;">
            <a href="tel:${app.patient_phone}" style="color: inherit; text-decoration: none;"><ion-icon name="call-outline" style="vertical-align: middle;"></ion-icon> ${app.patient_phone}</a>
        </div>
      </td>
      <td style="padding: 15px; font-size: 1.4rem; font-weight: 600; color: var(--verdigris);">${app.price ? `${parseFloat(app.price).toFixed(2)} ₺` : '-'}</td>
      <td style="padding: 15px; font-size: 1.4rem; color: #444;">${app.service_name || '-'}</td>
      <td style="padding: 15px; font-size: 1.4rem; color: #444;">${app.doctor_name || '-'}</td>
      <td style="padding: 15px; text-align: center;">
        <span style="padding: 6px 12px; border-radius: 20px; font-size: 1.2rem; font-weight: 500; background: ${statusBg}; color: ${statusColor}; border: 1px solid rgba(0,0,0,0.05);">
          ${statusText}
        </span>
      </td>
      <td style="padding: 15px; text-align: center; white-space: nowrap;">
        <div class="dropdown-menu-container">
          <button class="dots-btn" onclick="toggleDropdown(event, 'dropdown-${app.id}')">
            <ion-icon name="ellipsis-vertical-outline"></ion-icon>
          </button>
          <div id="dropdown-${app.id}" class="action-dropdown">
            ${app.status === 'Bekliyor' ? `
              <button class="dropdown-action-btn dropdown-complete" onclick="updateAppointmentStatus(${app.id}, 'Tamamlandı')">
                <ion-icon name="checkmark-circle-outline"></ion-icon> Tamamlandı
              </button>
              <button class="dropdown-action-btn dropdown-noshow" onclick="updateAppointmentStatus(${app.id}, 'Katılmadı')">
                <ion-icon name="close-circle-outline"></ion-icon> Katılmadı
              </button>
            ` : ''}
            <button class="dropdown-action-btn dropdown-delete" onclick="deleteAppointment(${app.id})">
              <ion-icon name="trash-outline"></ion-icon> Sil
            </button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleDropdown(event, dropdownId) {
  event.stopPropagation();
  const dropdown = document.getElementById(dropdownId);
  const btn = event.currentTarget;
  
  // Close all other dropdowns
  document.querySelectorAll('.action-dropdown.show').forEach(menu => {
    if (menu.id !== dropdownId) menu.classList.remove('show');
  });
  document.querySelectorAll('.dots-btn.active').forEach(b => {
    if (b !== btn) b.classList.remove('active');
  });

  dropdown.classList.toggle('show');
  btn.classList.toggle('active');
}

// Click outside to close dropdowns
document.addEventListener('click', (event) => {
  if (!event.target.closest('.dropdown-menu-container')) {
    document.querySelectorAll('.action-dropdown.show').forEach(menu => menu.classList.remove('show'));
    document.querySelectorAll('.dots-btn.active').forEach(btn => btn.classList.remove('active'));
  }
});

function toggleDropdown(event, dropdownId) {
  event.stopPropagation();
  const dropdown = document.getElementById(dropdownId);
  const btn = event.currentTarget;
  
  // Close all other dropdowns
  document.querySelectorAll('.action-dropdown.show').forEach(menu => {
    if (menu.id !== dropdownId) menu.classList.remove('show');
  });
  document.querySelectorAll('.dots-btn.active').forEach(b => {
    if (b !== btn) b.classList.remove('active');
  });

  dropdown.classList.toggle('show');
  btn.classList.toggle('active');
}

// Click outside to close dropdowns
document.addEventListener('click', (event) => {
  if (!event.target.closest('.dropdown-menu-container')) {
    document.querySelectorAll('.action-dropdown.show').forEach(menu => menu.classList.remove('show'));
    document.querySelectorAll('.dots-btn.active').forEach(btn => btn.classList.remove('active'));
  }
});

async function updateAppointmentStatus(id, status) {
  if (!confirm(`Randevu durumunu "${status}" olarak güncellemek istediğinize emin misiniz?`)) return;
  try {
    const res = await authFetch(`/api/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      alert("Randevu durumu güncellendi.");
      loadAppointments();
    } else {
      alert("Güncelleme başarısız.");
    }
  } catch (err) {
    console.error(err);
    alert("Sunucu hatası!");
  }
}

// Arama Filtresi
document.getElementById("appointmentSearch")?.addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = allAppointments.filter(app => 
    app.patient_name.toLowerCase().includes(term) || 
    (app.service_name && app.service_name.toLowerCase().includes(term)) ||
    app.patient_phone.includes(term)
  );
  renderAppointmentsTable(filtered);
});

async function deleteAppointment(id) {
  if (!confirm("Silinsin mi?")) return;
  try {
    const res = await authFetch(`/api/appointments/${id}`, { method: 'DELETE' });
    if (res.ok) { alert("Silindi."); loadAppointments(); }
  } catch (err) { console.error(err); }
}
